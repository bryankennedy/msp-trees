// Shared scaffolding for the two overview-representation comparison plates
// (heatmap, hexbin). The control plate (index / main.ts) is intentionally left
// untouched so it stands as the "individual dots at every zoom" baseline to
// compare against.
//
// Both comparison plates share three things: the vellum map, the genus dot
// layer (which fades IN as you zoom past the crossfade band), and the specimen
// popup. Each plate then adds its own overview layer — a density heatmap or a
// dominant-genus hex grid — that fades OUT across the same band. So zooming in
// dissolves the generalized bird's-eye view into individual trees, and zooming
// out does the reverse. This zoom-driven crossfade is the cartographic
// generalization technique the plates are meant to demonstrate.
import maplibregl, { type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { vellumStyle } from "./style-vellum";
import { annotateGenus, buildColorExpression, LEGEND } from "./taxonomy";

export const SAINT_PAUL_CENTER: [number, number] = [-93.1, 44.95];
export const SAINT_PAUL_BBOX: [number, number, number, number] = [-93.25, 44.88, -92.96, 45.06];
export const PAPER = "#F2E9D2";
const SAGE_DEEP = "#4F5D3A";
const INK = "#3A3026";

// Crossfade band: below FADE_LO the overview layer owns the screen; above
// FADE_HI only the individual dots show. The two representations cross over
// (briefly visible together) in between, which reads as a dissolve.
export const FADE_LO = 11.5;
export const FADE_HI = 13.5;

export function createOverviewMap(): maplibregl.Map {
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
  // "My location" button: prompts for permission, drops a live location dot and
  // recenters on the user — handy on a phone standing under an actual boulevard
  // tree. High accuracy + location tracking; the camera eases to the fix and
  // (because the map is bounded to Saint Paul) clamps gracefully if you're away.
  map.addControl(
    new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserLocation: true,
      fitBoundsOptions: { maxZoom: 16 },
    }),
    "top-right",
  );
  map.addControl(new maplibregl.ScaleControl({ unit: "imperial" }), "bottom-left");
  return map;
}

export function renderLegend(): void {
  const host = document.getElementById("legend-items");
  if (!host) return;
  host.innerHTML = LEGEND.map(
    ({ label, color }) =>
      `<li class="legend-row"><span class="legend-swatch" style="background:${color}"></span>${label}</li>`,
  ).join("");
}

export function setCount(n: number): void {
  const el = document.getElementById("tree-count");
  if (el) el.textContent = `${n.toLocaleString()}`;
}

// Midpoint of the crossfade band. Doubles as the click handover point: below
// it the overview layer owns clicks, at/above it the individual dots do.
export const CROSSFADE_MID = (FADE_LO + FADE_HI) / 2;

// Opacity ramp that brings the dots in across the upper half of the band, so
// they appear just as the overview layer is on its way out. The target opacity
// is baked into the interpolate's output values: MapLibre only allows a `zoom`
// expression at the top level of an interpolate/step, never nested inside an
// arithmetic op like `["*", k, ...]` (that fails to parse and throws).
const fadeTo = (max: number): unknown[] => ["interpolate", ["linear"], ["zoom"], CROSSFADE_MID, 0, FADE_HI, max];

/**
 * Add the genus dot layers (halo + dot + selection ring) on the shared "trees"
 * source — the same recipe as the control plate, but with the dots transparent
 * below the crossfade band and ramping to full opacity above it. Adds them on
 * top of whatever overview layer the caller installed first.
 */
export function addGenusDots(map: maplibregl.Map): void {
  map.addLayer({
    id: "trees-halo",
    type: "circle",
    source: "trees",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 1.4, 13, 3.0, 16, 7, 19, 14],
      "circle-color": PAPER,
      "circle-opacity": fadeTo(0.9) as never,
      "circle-stroke-width": 0,
    },
  });
  map.addLayer({
    id: "trees-dot",
    type: "circle",
    source: "trees",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 0.8, 13, 2.0, 16, 5, 19, 10],
      "circle-color": buildColorExpression() as never,
      "circle-opacity": fadeTo(1) as never,
      "circle-stroke-color": SAGE_DEEP,
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 13, 0.3, 18, 1.2],
      "circle-stroke-opacity": fadeTo(0.7) as never,
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
}

/** Wire click → specimen-card popup on the dot layer (shared markup). */
export function wireSpecimenPopup(map: maplibregl.Map): void {
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
    return `${aa} ${ss}`.trim() || "address unavailable";
  };

  map.on("click", "trees-dot", (e) => {
    // Below the handover point the dots are invisible and the overview layer
    // owns the click (e.g. the hexbin's area popup) — don't surface a specimen.
    if (map.getZoom() < CROSSFADE_MID) return;
    const f = e.features?.[0];
    if (!f) return;
    const p = f.properties as Record<string, unknown>;
    popup.spp.textContent = fmtTxt(p.spp_com);
    popup.bot.textContent = p.spp_bot ? String(p.spp_bot) : "";
    popup.cond.textContent = fmtTxt(p.condition);
    popup.dbh.textContent = fmtDbh(p.dbh);
    popup.yr.textContent = fmtYr(p.yr_plant);
    popup.loc.textContent = fmtLoc(p.address, p.street);
    popup.card.removeAttribute("hidden");
    document.getElementById("hex-card")?.setAttribute("hidden", ""); // close the area popup if open
    map.setFilter("trees-selected", ["==", ["id"], f.id ?? ""]);
  });
  map.on("mouseenter", "trees-dot", () => {
    if (map.getZoom() >= CROSSFADE_MID) map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "trees-dot", () => (map.getCanvas().style.cursor = ""));
}

const emptyFC = (): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features: [] });

/**
 * Add the shared "trees" GeoJSON source, then stream the sample first (fast
 * first paint) and the full set afterwards into it, annotating genus before
 * each set. `onData` fires after every successful load so an overview layer can
 * (re)derive itself from the same features.
 */
export function loadTrees(
  map: maplibregl.Map,
  onData?: (fc: GeoJSON.FeatureCollection) => void,
): void {
  map.addSource("trees", { type: "geojson", data: emptyFC(), promoteId: "id" });

  const apply = (json: GeoJSON.FeatureCollection) => {
    annotateGenus(json);
    (map.getSource("trees") as GeoJSONSource).setData(json);
    setCount(json.features?.length ?? 0);
    onData?.(json);
  };

  (async () => {
    try {
      const r = await fetch("/data/trees.sample.geojson");
      if (r.ok) apply(await r.json());
    } catch { /* sample is best-effort */ }

    requestIdleCallback?.(async () => {
      try {
        const r = await fetch("/data/trees.geojson");
        if (!r.ok) return;
        apply(await r.json());
      } catch (e) {
        console.warn("[trees] full set failed to load; keeping sample.", e);
      }
    });
  })();
}
