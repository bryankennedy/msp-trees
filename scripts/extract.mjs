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

const fmt = (n) => n.toLocaleString();
console.log("\nExtract complete.");
console.log(`  Scanned:           ${fmt(stats.total)}`);
console.log(`  Kept:              ${fmt(stats.kept)}`);
console.log(`  Dropped (no L/L):  ${fmt(stats.droppedNoLatLon)}`);
console.log(`  Dropped (bbox):    ${fmt(stats.droppedOutOfBbox)}`);
console.log(`  → ${OUT_FULL}`);
console.log(`  → ${OUT_SAMPLE} (${fmt(sample.features.length)} features)`);
