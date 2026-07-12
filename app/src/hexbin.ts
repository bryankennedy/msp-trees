// Plate IV — Hexbin (dominant genus). Overview representation #2: below the
// crossfade band the trees aggregate into a hexagonal grid, each cell tinted by
// its *dominant* genus and shaded by how many trees it holds. Unlike the
// heatmap, this keeps the genus story alive at the bird's-eye view — you can
// read which part of the city is maple country vs. oak or elm — at the cost of
// a binning step and coarser spatial detail. Zooming in dissolves the hexes
// into individual genus dots (shared with the control plate).
//
// The default-size grid ships pre-aggregated from the pipeline (extract.mjs →
// data/processed/hexbin.geojson) so a normal overview visit doesn't download the
// full point set. The same binning still runs client-side (buildHexbins below)
// when the reader drags the size slider to a non-default value or once the full
// points have lazy-loaded for the zoomed-in dots.
import "./analytics";
import { type GeoJSONSource } from "maplibre-gl";
import {
    createOverviewMap,
    renderLegend,
    addGenusDots,
    wireSpecimenPopup,
    loadTrees,
    ensureTreesSource,
    setCount,
    FADE_LO,
    FADE_HI,
    CROSSFADE_MID,
} from "./overview-common";
import { colorForGenus, PLACEHOLDER_GENUS } from "./taxonomy";

// Friendly label for a genus value (the placeholder sentinel → readable text).
const genusLabel = (g: string) =>
    g === PLACEHOLDER_GENUS ? "Non-tree sites" : g;

/**
 * Wire click → AREA popup on the hex layer: shows the cell's tree count and
 * genus composition, clearly distinct from the per-tree specimen popup. Only
 * active below the crossfade handover (where hexes are the live layer); above
 * it the individual dots own clicks.
 */
function wireHexPopup(map: ReturnType<typeof createOverviewMap>): void {
    const card = document.getElementById("hex-card");
    if (!card) return;
    const titleEl = document.getElementById("h-title");
    const subEl = document.getElementById("h-sub");
    const listEl = document.getElementById("h-breakdown");
    const footEl = document.getElementById("h-foot");
    card.querySelector(".popup-close")?.addEventListener("click", () =>
        card.setAttribute("hidden", ""),
    );

    map.on("click", "hex-fill", (e) => {
        if (map.getZoom() >= CROSSFADE_MID) return; // zoomed in → dots own the click
        const p = e.features?.[0]?.properties as
            | Record<string, unknown>
            | undefined;
        if (!p) return;
        const total = Number(p.count) || 0;
        const size = Math.round(Number(p.cellSize) || 0);
        let top: Array<[string, number]> = [];
        try {
            top = JSON.parse(String(p.top));
        } catch {
            /* keep empty */
        }

        if (titleEl)
            titleEl.textContent = `${total.toLocaleString()} ${total === 1 ? "tree" : "trees"}`;
        if (subEl) subEl.textContent = `in this ≈${size} m hexagon`;
        if (listEl) {
            listEl.innerHTML = top
                .map(([g, c]) => {
                    const pct = total ? Math.round((c / total) * 100) : 0;
                    return (
                        `<li class="hex-row"><span class="hex-swatch" style="background:${colorForGenus(g)}"></span>` +
                        `<span class="hex-name">${genusLabel(g)}</span><span class="hex-pct">${pct}%</span></li>`
                    );
                })
                .join("");
        }
        if (footEl) footEl.textContent = "Zoom in for individual specimens";

        card.removeAttribute("hidden");
        document.getElementById("popup-card")?.setAttribute("hidden", ""); // close the specimen popup if open
        map.setFilter("trees-selected", ["==", ["id"], ""]);
    });
    map.on("mouseenter", "hex-fill", () => {
        if (map.getZoom() < CROSSFADE_MID)
            map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "hex-fill", () => (map.getCanvas().style.cursor = ""));
}

// Hex radius (center → vertex) in Web-Mercator meters, user-adjustable via the
// slider. ~150 m gives a few thousand non-empty cells across Saint Paul — coarse
// enough to generalize, fine enough to show neighborhood-scale genus structure.
// Smaller = finer/confetti; larger trends toward the city-wide dominant genus.
const HEX_DEFAULT_M = 225;
const HEX_MIN_M = 75;
const HEX_MAX_M = 400;

// --- Web-Mercator projection (binning must happen in a planar metric space,
// not in lon/lat degrees, or hexes would distort with latitude). -------------
const RAD = Math.PI / 180;
const RE = 6378137; // WGS84 equatorial radius (m)
const mercX = (lon: number) => RE * lon * RAD;
const mercY = (lat: number) =>
    RE * Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2));
const invLon = (x: number) => x / RE / RAD;
const invLat = (y: number) =>
    (2 * Math.atan(Math.exp(y / RE)) - Math.PI / 2) / RAD;

// Cube rounding: snap a fractional axial (q, r) to the nearest hex. Pointy-top
// orientation. (Red Blob Games, "Hexagonal Grids".)
function hexRound(qf: number, rf: number): [number, number] {
    const xf = qf;
    const zf = rf;
    const yf = -xf - zf;
    let rx = Math.round(xf);
    let ry = Math.round(yf);
    let rz = Math.round(zf);
    const dx = Math.abs(rx - xf);
    const dy = Math.abs(ry - yf);
    const dz = Math.abs(rz - zf);
    if (dx > dy && dx > dz) rx = -ry - rz;
    else if (dy > dz) ry = -rx - rz;
    else rz = -rx - ry;
    return [rx, rz];
}

// Pointy-top hexagon ring (6 corners + closing point) around a mercator center,
// returned as a lon/lat polygon ring.
function hexRing(cx: number, cy: number, s: number): GeoJSON.Position[] {
    const ring: GeoJSON.Position[] = [];
    for (let i = 0; i < 6; i++) {
        const a = RAD * (60 * i - 30);
        ring.push([invLon(cx + s * Math.cos(a)), invLat(cy + s * Math.sin(a))]);
    }
    ring.push(ring[0]);
    return ring;
}

type Bin = {
    cx: number;
    cy: number;
    total: number;
    genus: Map<string, number>;
};

/** Aggregate annotated tree points into a hex-grid FeatureCollection. */
function buildHexbins(
    features: GeoJSON.Feature[],
    s: number,
): GeoJSON.FeatureCollection {
    const bins = new Map<string, Bin>();

    for (const f of features) {
        const g = f.geometry;
        if (!g || g.type !== "Point") continue;
        const [lon, lat] = g.coordinates as [number, number];
        const x = mercX(lon);
        const y = mercY(lat);
        // Pixel → axial (pointy-top), then snap to a hex cell.
        const qf = ((Math.sqrt(3) / 3) * x - y / 3) / s;
        const rf = ((2 / 3) * y) / s;
        const [q, r] = hexRound(qf, rf);
        const key = `${q},${r}`;
        let b = bins.get(key);
        if (!b) {
            b = {
                cx: s * Math.sqrt(3) * (q + r / 2),
                cy: s * 1.5 * r,
                total: 0,
                genus: new Map(),
            };
            bins.set(key, b);
        }
        b.total++;
        const gen = String(
            (f.properties as Record<string, unknown>)?.genus ??
                PLACEHOLDER_GENUS,
        );
        b.genus.set(gen, (b.genus.get(gen) ?? 0) + 1);
    }

    // Normalize shading against the densest cell (sqrt keeps the long tail of
    // sparse cells visible rather than washed out).
    let maxTotal = 1;
    for (const b of bins.values()) if (b.total > maxTotal) maxTotal = b.total;
    const denom = Math.sqrt(maxTotal);

    const out: GeoJSON.Feature[] = [];
    for (const b of bins.values()) {
        // Genus tally for this cell, most → least common. The leader colors the
        // cell; the top few drive the popup's composition breakdown.
        const sorted = [...b.genus.entries()].sort((a, z) => z[1] - a[1]);
        const [domGenus, domCount] = sorted[0] ?? [PLACEHOLDER_GENUS, 0];
        out.push({
            type: "Feature",
            geometry: {
                type: "Polygon",
                coordinates: [hexRing(b.cx, b.cy, s)],
            },
            properties: {
                count: b.total,
                intensity: Math.sqrt(b.total) / denom,
                genus: domGenus,
                color: colorForGenus(domGenus),
                share: domCount / b.total,
                cellSize: Math.round(s),
                // Top-5 [genus, count] pairs; MapLibre serializes this to a string, so
                // the popup JSON.parses it back.
                top: JSON.stringify(sorted.slice(0, 5)),
            },
        });
    }
    return { type: "FeatureCollection", features: out };
}

const emptyFC = (): GeoJSON.FeatureCollection => ({
    type: "FeatureCollection",
    features: [],
});

renderLegend();
const map = createOverviewMap();

map.on("load", () => {
    // Hex layer (added first → sits beneath the dots). Filled per-feature by
    // dominant-genus color; opacity = density shading × zoom crossfade.
    map.addSource("hexes", { type: "geojson", data: emptyFC() });
    map.addLayer({
        id: "hex-fill",
        type: "fill",
        source: "hexes",
        paint: {
            "fill-color": ["get", "color"] as never,
            // Combine the per-cell density shading with the zoom crossfade. `zoom`
            // must be the top-level interpolate input (MapLibre forbids it nested in
            // an arithmetic op), so the density ramp lives in the *output* values:
            // full density shading at FADE_LO, faded to 0 by FADE_HI.
            "fill-opacity": [
                "interpolate",
                ["linear"],
                ["zoom"],
                FADE_LO,
                [
                    "interpolate",
                    ["linear"],
                    ["get", "intensity"],
                    0,
                    0.12,
                    1,
                    0.82,
                ],
                FADE_HI,
                0,
            ] as never,
            "fill-outline-color": "rgba(58,48,38,0.18)",
        },
    });

    // First paint uses the PRE-AGGREGATED grid the pipeline emits at the default
    // cell size (≈125 KB gzip) instead of downloading the full 51 MB point set
    // and binning it in the browser. The full points then load lazily — only
    // when the reader actually needs per-tree data: to re-bin at a non-default
    // size, or to see the dots fade in on zoom-in. A normal overview visit never
    // fetches the big file.
    const hexSource = () => map.getSource("hexes") as GeoJSONSource;
    let loadedFeatures: GeoJSON.Feature[] = [];
    let pointsLoaded = false;
    let needsClientHexes = false; // true only if the precomputed grid is missing
    let hexSize = HEX_DEFAULT_M;
    const rebuildHexes = () =>
        hexSource().setData(buildHexbins(loadedFeatures, hexSize));

    // Lazily pull the full point set (sample first, then the full file) into the
    // shared "trees" source the first time it's needed. loadTrees drives the dots
    // directly; we only re-bin the hex grid ourselves for a non-default size (at
    // the default the precomputed grid is already correct), or if that grid
    // failed to load at all.
    //
    // The load is cancellable: zooming back below CROSSFADE_MID aborts an
    // in-flight fetch (51 MB decoded — see MSPT-7), and a later re-cross starts
    // it over. `pin` marks loads whose consumer needs the raw points regardless
    // of zoom (client-side re-binning); those are never aborted.
    let pointsDone = false; // full set applied — nothing left to fetch
    let pointsAbort: AbortController | null = null; // non-null while in flight
    let pointsPinned = false;
    const ensurePoints = (pin = false) => {
        if (pin) pointsPinned = true;
        if (pointsDone || pointsAbort) return;
        const ac = new AbortController();
        pointsAbort = ac;
        loadTrees(map, (fc) => {
            loadedFeatures = fc.features ?? [];
            pointsLoaded = true;
            if (needsClientHexes || hexSize !== HEX_DEFAULT_M) rebuildHexes();
        }, ac.signal).then((completed) => {
            if (pointsAbort === ac) pointsAbort = null;
            if (completed) pointsDone = true;
        });
    };
    const abortPoints = () => {
        if (!pointsAbort || pointsPinned) return;
        pointsAbort.abort();
        pointsAbort = null;
    };

    // First paint: the precomputed default-size grid. If it can't be fetched,
    // fall back to the old behavior (load points, bin client-side).
    fetch("/data/hexbin.geojson")
        .then((r) =>
            r.ok ? r.json() : Promise.reject(new Error("no precomputed hexbin")),
        )
        .then((fc: GeoJSON.FeatureCollection & { total?: number }) => {
            if (pointsLoaded) return; // the live points already took over
            hexSource().setData(fc);
            setCount(fc.total ?? fc.features.length);
        })
        .catch(() => {
            needsClientHexes = true;
            ensurePoints(true); // no grid at all — need the points at any zoom
        });

    // Dots are fully transparent below CROSSFADE_MID, so fetching the point set
    // any earlier downloads 51 MB the user cannot see (the old FADE_LO gate did
    // exactly that — MSPT-7). Fetch only once the dots have non-zero opacity,
    // and abort in flight if the user zooms back out of the dot regime.
    map.on("zoom", () => {
        if (map.getZoom() >= CROSSFADE_MID) ensurePoints();
        else abortPoints();
    });

    // Hex-size slider. Update the readout immediately; a custom size needs the raw
    // points, so trigger the lazy load. Debounce the rebin so a fast drag doesn't
    // queue a rebuild per pixel.
    const slider = document.getElementById(
        "hex-size",
    ) as HTMLInputElement | null;
    const readout = document.getElementById("hex-size-out");
    if (slider) {
        slider.min = String(HEX_MIN_M);
        slider.max = String(HEX_MAX_M);
        slider.value = String(HEX_DEFAULT_M);
        let timer = 0;
        slider.addEventListener("input", () => {
            hexSize = Number(slider.value);
            if (readout) readout.textContent = `${hexSize} m`;
            ensurePoints(true); // re-binning needs the raw points at any zoom
            if (!pointsLoaded) return; // once points arrive, onData rebuilds
            clearTimeout(timer);
            timer = window.setTimeout(rebuildHexes, 90);
        });
    }

    // The dot layers attach to the shared "trees" source, so it must exist now
    // even though its point data loads lazily (ensurePoints) later.
    ensureTreesSource(map);
    addGenusDots(map);
    wireSpecimenPopup(map);
    wireHexPopup(map);
});
