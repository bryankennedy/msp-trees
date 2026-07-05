// Read public_trees.shp/.dbf, build GeoJSON from the WGS84 lon/lat columns
// (NOT the projected .shp geometry — see SPEC §3 CRS note), normalize a slim
// property set, validate against the Saint Paul bounding box, and write
// data/processed/trees.geojson (+ a 10k sample for fast first paint).
import { open } from "shapefile";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SHP = resolve(ROOT, "data/raw/boulevard_trees/public_trees.shp");
const DBF = resolve(ROOT, "data/raw/boulevard_trees/public_trees.dbf");
const OUT_DIR = resolve(ROOT, "data/processed");
const OUT_FULL = resolve(OUT_DIR, "trees.geojson");
const OUT_SAMPLE = resolve(OUT_DIR, "trees.sample.geojson");
// Pre-aggregated outputs so the app doesn't download the full 51 MB point set on
// a normal page view: species counts for the species index, and a dominant-genus
// hex grid (at the app's default cell size) for the overview's first paint.
const OUT_SPECIES_COUNTS = resolve(OUT_DIR, "species-counts.json");
const OUT_HEXBIN = resolve(OUT_DIR, "hexbin.geojson");

// Saint Paul bbox (generous, includes inset airports / river bends).
// [minLon, minLat, maxLon, maxLat]
const BBOX = [-93.25, 44.88, -92.96, 45.06];

const pick = (rec, ...names) => {
  for (const n of names) {
    if (rec[n] !== undefined && rec[n] !== null && rec[n] !== "") return rec[n];
  }
  return null;
};

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const inBbox = (lon, lat) =>
  lon >= BBOX[0] && lon <= BBOX[2] && lat >= BBOX[1] && lat <= BBOX[3];

// --- Taxonomy + hex-binning (KEEP IN SYNC with app/src/taxonomy.ts and the hex
// math in app/src/hexbin.ts). Duplicated here rather than imported because the
// app is a bundled TS package and this pipeline is plain Node ESM; Tier 2 (see
// docs/spec-pmtiles-tiles.md) proposes consolidating the shared logic.
const PLACEHOLDERS = new Set([
  "Vacant Site", "N/A", "Do Not Plant", "Stump", "Stump - No Grind",
  "Unknown", "(unrecorded)",
]);
const isPlaceholder = (v) =>
  v == null || v === "" || PLACEHOLDERS.has(String(v).trim());
const genusOf = (v) => {
  if (v == null || v === "") return "Unknown";
  const s = String(v).trim();
  const i = s.search(/,| - /);
  return (i >= 0 ? s.slice(0, i) : s).trim() || "Unknown";
};
const GENUS_COLORS = {
  Maple: "#C44E34", Oak: "#7A5320", Linden: "#7E9B2F", Elm: "#2E8B7F",
  Honeylocust: "#D69A1E", Hackberry: "#4E6E92", Coffeetree: "#6B4E9B",
  Birch: "#8FA3AE", Apple: "#CE5D92", Ginkgo: "#E7C13B", Lilac: "#A06CC0",
  Pine: "#2F6B3D",
};
const OTHER_COLOR = "#9C8E74";
const PLACEHOLDER_COLOR = "#CBBE9F";
const PLACEHOLDER_GENUS = "·placeholder·";
const colorForGenus = (g) =>
  g === PLACEHOLDER_GENUS ? PLACEHOLDER_COLOR : (GENUS_COLORS[g] ?? OTHER_COLOR);
const genusForFeature = (spp_com) =>
  isPlaceholder(spp_com) ? PLACEHOLDER_GENUS : genusOf(spp_com);

// Default hex cell radius (center→vertex) in Web-Mercator meters. MUST match
// HEX_DEFAULT_M in app/src/hexbin.ts so the precomputed grid is identical to
// what the client would derive at the slider's default position.
const HEX_DEFAULT_M = 225;
const RAD = Math.PI / 180;
const RE = 6378137;
const mercX = (lon) => RE * lon * RAD;
const mercY = (lat) => RE * Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2));
const invLon = (x) => x / RE / RAD;
const invLat = (y) => (2 * Math.atan(Math.exp(y / RE)) - Math.PI / 2) / RAD;

function hexRound(qf, rf) {
  const xf = qf, zf = rf, yf = -xf - zf;
  let rx = Math.round(xf), ry = Math.round(yf), rz = Math.round(zf);
  const dx = Math.abs(rx - xf), dy = Math.abs(ry - yf), dz = Math.abs(rz - zf);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return [rx, rz];
}
function hexRing(cx, cy, s) {
  const ring = [];
  for (let i = 0; i < 6; i++) {
    const a = RAD * (60 * i - 30);
    ring.push([invLon(cx + s * Math.cos(a)), invLat(cy + s * Math.sin(a))]);
  }
  ring.push(ring[0]);
  return ring;
}

/** Aggregate annotated tree points into a dominant-genus hex-grid FeatureCollection. */
function buildHexbins(features, s) {
  const bins = new Map();
  for (const f of features) {
    const g = f.geometry;
    if (!g || g.type !== "Point") continue;
    const [lon, lat] = g.coordinates;
    const x = mercX(lon), y = mercY(lat);
    const qf = ((Math.sqrt(3) / 3) * x - y / 3) / s;
    const rf = ((2 / 3) * y) / s;
    const [q, r] = hexRound(qf, rf);
    const key = `${q},${r}`;
    let b = bins.get(key);
    if (!b) {
      b = { cx: s * Math.sqrt(3) * (q + r / 2), cy: s * 1.5 * r, total: 0, genus: new Map() };
      bins.set(key, b);
    }
    b.total++;
    const gen = genusForFeature(f.properties?.spp_com);
    b.genus.set(gen, (b.genus.get(gen) ?? 0) + 1);
  }

  let maxTotal = 1;
  for (const b of bins.values()) if (b.total > maxTotal) maxTotal = b.total;
  const denom = Math.sqrt(maxTotal);

  const out = [];
  for (const b of bins.values()) {
    const sorted = [...b.genus.entries()].sort((a, z) => z[1] - a[1]);
    const [domGenus, domCount] = sorted[0] ?? [PLACEHOLDER_GENUS, 0];
    out.push({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [hexRing(b.cx, b.cy, s)] },
      properties: {
        count: b.total,
        intensity: Math.sqrt(b.total) / denom,
        genus: domGenus,
        color: colorForGenus(domGenus),
        share: domCount / b.total,
        cellSize: Math.round(s),
        top: JSON.stringify(sorted.slice(0, 5)),
      },
    });
  }
  return { type: "FeatureCollection", features: out };
}

const stats = {
  total: 0,
  kept: 0,
  droppedNoLatLon: 0,
  droppedOutOfBbox: 0,
};

await mkdir(OUT_DIR, { recursive: true });

const source = await open(SHP, DBF, { encoding: "utf-8" });

const features = [];
const SAMPLE_EVERY = 17; // ~167k / 17 ≈ ~10k sample

while (true) {
  const result = await source.read();
  if (result.done) break;
  const props = result.value.properties;
  stats.total++;

  const lon = num(pick(props, "longitude", "Longitude", "LONGITUDE", "lon", "LON"));
  const lat = num(pick(props, "latitude", "Latitude", "LATITUDE", "lat", "LAT"));
  if (lon === null || lat === null) {
    stats.droppedNoLatLon++;
    continue;
  }
  if (!inBbox(lon, lat)) {
    stats.droppedOutOfBbox++;
    continue;
  }

  const id = String(
    pick(props, "uniqueid", "UNIQUEID", "UniqueID", "site_id", "SITE_ID") ??
      `${lon.toFixed(6)},${lat.toFixed(6)},${stats.total}`
  );

  features.push({
    type: "Feature",
    id,
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties: {
      id,
      spp_com: pick(props, "SPP_com", "spp_com", "SPP_COM"),
      spp_bot: pick(props, "SPP_bot", "spp_bot", "SPP_BOT"),
      condition: pick(props, "Condition", "condition", "CONDITION"),
      dbh: num(pick(props, "DBH", "dbh")),
      yr_plant: num(pick(props, "YRPlant", "yr_plant", "YRPLANT", "year_plant")),
      ward: pick(props, "Ward", "ward", "WARD"),
      status: pick(props, "Status", "status", "STATUS"),
      address: pick(props, "address", "Address", "ADDRESS"),
      street: pick(props, "street", "Street", "STREET"),
    },
  });
  stats.kept++;
  if (stats.kept % 25000 === 0) {
    process.stdout.write(`  ...${stats.kept} kept (${stats.total} scanned)\n`);
  }
}

const fc = { type: "FeatureCollection", features };
const sample = {
  type: "FeatureCollection",
  features: features.filter((_, i) => i % SAMPLE_EVERY === 0),
};

await writeFile(OUT_FULL, JSON.stringify(fc));
await writeFile(OUT_SAMPLE, JSON.stringify(sample));

// --- Pre-aggregated outputs (computed from the in-memory features) -----------
// species-counts.json: name → count over every record, plus the grand total.
// Mirrors the normalization in app/src/species.ts (null/empty → "(unrecorded)",
// trimmed). The app still classifies species vs. placeholders via taxonomy.
const speciesCounts = new Map();
for (const f of features) {
  const raw = f.properties.spp_com;
  const name = raw == null || raw === "" ? "(unrecorded)" : String(raw).trim();
  speciesCounts.set(name, (speciesCounts.get(name) ?? 0) + 1);
}
const speciesOut = {
  total: features.length,
  counts: [...speciesCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
};
await writeFile(OUT_SPECIES_COUNTS, JSON.stringify(speciesOut));

// hexbin.geojson: dominant-genus hex grid at the default cell size, so the
// overview paints instantly without the full point set. `total` rides along on
// the FeatureCollection so the app can show the tree count before points load.
const hexbin = buildHexbins(features, HEX_DEFAULT_M);
hexbin.total = features.length;
await writeFile(OUT_HEXBIN, JSON.stringify(hexbin));

const fmt = (n) => n.toLocaleString();
console.log("\nExtract complete.");
console.log(`  Scanned:           ${fmt(stats.total)}`);
console.log(`  Kept:              ${fmt(stats.kept)}`);
console.log(`  Dropped (no L/L):  ${fmt(stats.droppedNoLatLon)}`);
console.log(`  Dropped (bbox):    ${fmt(stats.droppedOutOfBbox)}`);
console.log(`  → ${OUT_FULL}`);
console.log(`  → ${OUT_SAMPLE} (${fmt(sample.features.length)} features)`);
console.log(`  → ${OUT_SPECIES_COUNTS} (${fmt(speciesOut.counts.length)} distinct names)`);
console.log(`  → ${OUT_HEXBIN} (${fmt(hexbin.features.length)} hexes @ ${HEX_DEFAULT_M} m)`);
