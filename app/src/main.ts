// Entry point: load the vellum basemap, lay the trees on top as sage circles,
// wire click → specimen-card popup. v0 uses the static GeoJSON sample so the
// page is interactive on first paint; the full set streams in afterwards and
// transparently replaces the source data once ready (no flicker, same layer).
import maplibregl, { type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { vellumStyle } from "./style-vellum";
import { annotateGenus, buildColorExpression, LEGEND } from "./taxonomy";

const SAINT_PAUL_CENTER: [number, number] = [-93.1, 44.95];
const SAINT_PAUL_BBOX: [number, number, number, number] = [-93.25, 44.88, -92.96, 45.06];
const SAGE_DEEP = "#4F5D3A";
const INK = "#3A3026";
const PAPER = "#F2E9D2";

const map = new maplibregl.Map({
  container: "map",
  style: vellumStyle,
  center: SAINT_PAUL_CENTER,
  zoom: 11.2,
  minZoom: 9,
  maxZoom: 19,
  maxBounds: [
    [SAINT_PAUL_BBOX[0] - 0.15, SAINT_PAUL_BBOX[1] - 0.15],
    [SAINT_PAUL_BBOX[2] + 0.15, SAINT_PAUL_BBOX[3] + 0.15],
  ],
  attributionControl: { compact: true },
});

map.addControl(new maplibregl.NavigationControl({ visualizePitch: false, showCompass: false }), "top-right");
map.addControl(new maplibregl.ScaleControl({ unit: "imperial" }), "bottom-left");

const setCount = (n: number) => {
  const el = document.getElementById("tree-count");
  if (el) el.textContent = `${n.toLocaleString()}`;
};

// Paint the genus legend into the aside the markup reserves for it.
const renderLegend = () => {
  const host = document.getElementById("legend-items");
  if (!host) return;
  host.innerHTML = LEGEND.map(
    ({ label, color }) =>
      `<li class="legend-row"><span class="legend-swatch" style="background:${color}"></span>${label}</li>`,
  ).join("");
};
renderLegend();

const popup = {
  card: document.getElementById("popup-card") as HTMLElement,
  spp: document.getElementById("p-spp") as HTMLElement,
  bot: document.getElementById("p-bot") as HTMLElement,
  cond: document.getElementById("p-cond") as HTMLElement,
  dbh: document.getElementById("p-dbh") as HTMLElement,
  yr: document.getElementById("p-yr") as HTMLElement,
  loc: document.getElementById("p-loc") as HTMLElement,
};
const closeBtn = popup.card.querySelector(".popup-close") as HTMLButtonElement;
closeBtn.addEventListener("click", () => popup.card.setAttribute("hidden", ""));

const fmtDbh = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? `${v}″` : "—");
const fmtYr = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? `${v}` : "—");
const fmtTxt = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));
const fmtLoc = (a: unknown, s: unknown) => {
  const aa = a === null || a === undefined || a === "" ? "" : String(a);
  const ss = s === null || s === undefined || s === "" ? "" : String(s);
  const joined = `${aa} ${ss}`.trim();
  return joined || "address unavailable";
};

const showFeature = (f: maplibregl.MapGeoJSONFeature) => {
  const p = f.properties as Record<string, unknown>;
  popup.spp.textContent = fmtTxt(p.spp_com);
  popup.bot.textContent = p.spp_bot ? String(p.spp_bot) : "";
  popup.cond.textContent = fmtTxt(p.condition);
  popup.dbh.textContent = fmtDbh(p.dbh);
  popup.yr.textContent = fmtYr(p.yr_plant);
  popup.loc.textContent = fmtLoc(p.address, p.street);
  popup.card.removeAttribute("hidden");
};

map.on("load", async () => {
  map.addSource("trees", { type: "geojson", data: emptyFC(), promoteId: "id" });

  map.addLayer({
    id: "trees-halo",
    type: "circle",
    source: "trees",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 1.4, 13, 3.0, 16, 7, 19, 14],
      "circle-color": PAPER,
      "circle-opacity": 0.9,
      "circle-stroke-width": 0,
    },
  });
  map.addLayer({
    id: "trees-dot",
    type: "circle",
    source: "trees",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 0.8, 13, 2.0, 16, 5, 19, 10],
      // Dots are tinted by genus group (see taxonomy.ts). The `genus` property
      // is computed per-feature in annotateGenus() before the data is set.
      "circle-color": buildColorExpression() as never,
      "circle-stroke-color": SAGE_DEEP,
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 13, 0.3, 18, 1.2],
      "circle-stroke-opacity": 0.7,
    },
  });
  map.addLayer({
    id: "trees-selected",
    type: "circle",
    source: "trees",
    filter: ["==", ["id"], ""],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 5, 18, 14],
      "circle-color": "transparent",
      "circle-stroke-color": INK,
      "circle-stroke-width": 1.5,
    },
  });

  map.on("click", "trees-dot", (e) => {
    const f = e.features?.[0];
    if (!f) return;
    showFeature(f);
    map.setFilter("trees-selected", ["==", ["id"], f.id ?? ""]);
  });
  map.on("mouseenter", "trees-dot", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "trees-dot", () => (map.getCanvas().style.cursor = ""));

  // Paint the sample first so the plate is interactive immediately, annotating
  // each feature with its genus group so the genus tint applies on first paint.
  try {
    const r = await fetch("/data/trees.sample.geojson");
    if (r.ok) {
      const json = await r.json();
      annotateGenus(json);
      (map.getSource("trees") as GeoJSONSource).setData(json);
      setCount(json.features?.length ?? 0);
    }
  } catch { /* sample is best-effort */ }

  // Hot-swap to full dataset in the background once the sample is on screen.
  requestIdleCallback?.(async () => {
    try {
      const r = await fetch("/data/trees.geojson");
      if (!r.ok) return;
      const json = await r.json();
      annotateGenus(json);
      (map.getSource("trees") as GeoJSONSource).setData(json);
      setCount(json.features?.length ?? 0);
    } catch (e) {
      console.warn("[trees] full set failed to load; keeping sample.", e);
    }
  });
});

function emptyFC(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}
