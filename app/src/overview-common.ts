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
  addGeolocate(map);
  map.addControl(new maplibregl.ScaleControl({ unit: "imperial" }), "bottom-left");
  return map;
}

// The map is clamped to a Saint Paul box via `maxBounds`. That clamp is also
// what silently breaks the geolocate button when a device reports a position
// outside the box: MapLibre's GeolocateControl emits `outofmaxbounds` and snaps
// itself back to inactive WITHOUT moving the camera — which reads as "the button
// toggles on, then off, and nothing happens." So we keep a handle on the control
// and the bounds, and on an out-of-bounds fix we temporarily lift the clamp and
// fly there anyway. We also surface geolocation errors instead of swallowing
// them, since a denied/timed-out permission otherwise looks identical.
function addGeolocate(map: maplibregl.Map): void {
  const SP_BOUNDS = map.getMaxBounds();
  const geo = new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true, timeout: 10000 },
    trackUserLocation: true,
    showUserLocation: true,
    fitBoundsOptions: { maxZoom: 16 },
  });
  map.addControl(geo, "top-right");

  // A real fix arrived. If it falls outside the Saint Paul clamp, drop the clamp
  // for the rest of the session and ease to the location so the button always
  // "does something"; in-bounds fixes keep the clamp and behave normally.
  geo.on("geolocate", (e: GeolocationPosition) => {
    const { longitude: lon, latitude: lat } = e.coords;
    const b = SP_BOUNDS;
    const inside =
      !b ||
      (lon >= b.getWest() &&
        lon <= b.getEast() &&
        lat >= b.getSouth() &&
        lat <= b.getNorth());
    if (!inside) {
      map.setMaxBounds(null);
      map.easeTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 14) });
      flash(map, "You appear to be outside Saint Paul — showing your location.");
    }
  });

  // `outofmaxbounds` still fires the instant before our `geolocate` handler on
  // some versions; lifting the clamp here too makes the recenter reliable.
  geo.on("outofmaxbounds", (e: GeolocationPosition) => {
    map.setMaxBounds(null);
    map.easeTo({
      center: [e.coords.longitude, e.coords.latitude],
      zoom: Math.max(map.getZoom(), 14),
    });
  });

  geo.on("error", (err: GeolocationPositionError) => {
    const msg =
      err.code === 1
        ? deniedHelp()
        : err.code === 3
          ? "Couldn't get a location fix in time — try again."
          : "Location is unavailable on this device.";
    flash(map, msg);
  });

  // A browser can only *ask* for location permission in response to a user
  // gesture — there is no way to silently prompt on page load (browsers block
  // it). The bare crosshair icon is also easy to miss on a phone. So we add an
  // explicit, labeled "Locate me" button: tapping it fires the MapLibre control
  // (`geo.trigger()`), which shows the OS permission prompt the first time.
  addLocateButton(map, geo);
}

// Explicit "Locate me" call-to-action overlaid on the map. Clearer than the
// stock crosshair, and the click is the user gesture the browser requires
// before it will show the location-permission prompt.
function addLocateButton(
  map: maplibregl.Map,
  geo: maplibregl.GeolocateControl,
): void {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "locate-cta";
  btn.innerHTML = `<span aria-hidden="true">📍</span> Locate me`;
  btn.setAttribute("aria-label", "Center the map on my location");
  map.getContainer().appendChild(btn);

  btn.addEventListener("click", async () => {
    // If permission was previously *denied*, geo.trigger() can't re-prompt — the
    // browser only shows a silent failure. Detect that and tell the user how to
    // re-enable, instead of leaving them tapping a button that looks broken.
    // (Permissions API isn't on every browser; when absent we just trigger.)
    // NOTE: iOS Safari does NOT implement the Permissions API for geolocation,
    // so this query throws/returns undefined on iPhone and we just fall through
    // to geo.trigger() — which is correct, because iOS re-prompts on each visit
    // anyway. The denied path below only meaningfully fires on Chromium/Firefox,
    // which DO persist a hard "denied". Re-enable guidance is platform-specific
    // (see deniedHelp), since the steps differ wildly between iOS and desktop.
    try {
      const perm = await navigator.permissions?.query({
        name: "geolocation" as PermissionName,
      });
      if (perm?.state === "denied") {
        flash(map, deniedHelp());
        return;
      }
    } catch {
      /* Permissions API unavailable (e.g. iOS Safari) — fall through and ask. */
    }
    geo.trigger(); // shows the OS permission prompt (first time) and locates.
  });
}

// Detect iOS (incl. iPadOS, which reports as "Macintosh" but has touch). Used
// only to tailor the "how to re-enable location" help text, never to gate
// behavior — the actual permission flow is identical everywhere.
function isIOS(): boolean {
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && "ontouchend" in document)
  );
}

// Platform-correct instructions for re-enabling a blocked location permission.
// The desktop-style "address bar lock → site settings" steps are wrong on iOS,
// where location lives in the system Settings app, so we branch on the platform.
function deniedHelp(): string {
  if (isIOS()) {
    return (
      "Location is off. On iPhone: open Settings › Privacy & Security › " +
      "Location Services → ensure it's on and set Safari to “While Using”, " +
      "then reload this page and tap Locate me again."
    );
  }
  return (
    "Location is blocked for this site. Click the lock/ⓘ icon in the address " +
    "bar → Site settings → allow Location, then try again."
  );
}

// Lightweight transient notice anchored over the map (no dependency, no markup
// in the HTML). Used to explain why the location button did/didn't move you.
let flashTimer = 0;
function flash(map: maplibregl.Map, text: string): void {
  const parent = map.getContainer();
  let el = parent.querySelector<HTMLDivElement>(".map-flash");
  if (!el) {
    el = document.createElement("div");
    el.className = "map-flash";
    parent.appendChild(el);
  }
  el.textContent = text;
  el.classList.add("is-visible");
  clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => el!.classList.remove("is-visible"), 4200);
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
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 2.0, 13, 4.2, 16, 9, 19, 17],
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
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 1.3, 13, 3.0, 16, 6.5, 19, 12],
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
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 7, 18, 17],
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

  // Populate + reveal the specimen card for a given tree feature.
  const showSpecimen = (f: maplibregl.MapGeoJSONFeature) => {
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
  };

  // Finger-friendly tap: a tree dot is only a few pixels wide, so requiring a
  // pixel-perfect hit makes them nearly untappable on a phone. Instead of
  // binding to the layer (direct hits only), listen on the whole map and query
  // a padded box around the tap, then pick the dot nearest the finger. ~14px of
  // slop ≈ a typical fingertip radius.
  const TAP_SLOP = 14;
  map.on("click", (e) => {
    // Below the handover point the dots are invisible and the overview layer
    // owns the click (e.g. the hexbin's area popup) — don't surface a specimen.
    if (map.getZoom() < CROSSFADE_MID) return;
    const box: [maplibregl.PointLike, maplibregl.PointLike] = [
      [e.point.x - TAP_SLOP, e.point.y - TAP_SLOP],
      [e.point.x + TAP_SLOP, e.point.y + TAP_SLOP],
    ];
    const hits = map.queryRenderedFeatures(box, { layers: ["trees-dot"] });
    if (!hits.length) return;
    // Closest to the actual tap point wins (queryRenderedFeatures returns them
    // in arbitrary order within the box).
    let best = hits[0];
    let bestD = Infinity;
    for (const f of hits) {
      const g = f.geometry;
      if (g.type !== "Point") continue;
      const pt = map.project(g.coordinates as [number, number]);
      const d = (pt.x - e.point.x) ** 2 + (pt.y - e.point.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    showSpecimen(best);
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
/**
 * Create the (empty) shared "trees" source if it isn't there yet, so the dot
 * layers can attach at map-load even when the point data is loaded lazily later.
 * Idempotent — safe to call before loadTrees or standalone.
 */
export function ensureTreesSource(map: maplibregl.Map): void {
  if (!map.getSource("trees")) {
    map.addSource("trees", { type: "geojson", data: emptyFC(), promoteId: "id" });
  }
}

export function loadTrees(
  map: maplibregl.Map,
  onData?: (fc: GeoJSON.FeatureCollection) => void,
): void {
  ensureTreesSource(map);

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
