// Plate IV — Hexbin (dominant genus). Overview representation #2: below the
// crossfade band the trees aggregate into a hexagonal grid, each cell tinted by
// its *dominant* genus and shaded by how many trees it holds. Unlike the
// heatmap, this keeps the genus story alive at the bird's-eye view — you can
// read which part of the city is maple country vs. oak or elm — at the cost of
// a binning step and coarser spatial detail. Zooming in dissolves the hexes
// into individual genus dots (shared with the control plate).
//
// The binning runs client-side here so the comparison is self-contained (no
// pipeline change). For production this would move into extract.mjs so the grid
// ships pre-aggregated; see the SPEC note in the project README.
import { type GeoJSONSource } from "maplibre-gl";
import {
    createOverviewMap,
    renderLegend,
    addGenusDots,
    wireSpecimenPopup,
    loadTrees,
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

    // Re-bin the most recently loaded points at the current slider size and push
    // them to the hex source. Cheap (single O(n) pass), so safe to call live.
    let loadedFeatures: GeoJSON.Feature[] = [];
    let hexSize = HEX_DEFAULT_M;
    const rebuild = () => {
        (map.getSource("hexes") as GeoJSONSource).setData(
            buildHexbins(loadedFeatures, hexSize),
        );
    };

    // Shared "trees" source + dots; re-bin each time data arrives (sample first,
    // then the full set), keeping the points around for live slider re-binning.
    loadTrees(map, (fc) => {
        loadedFeatures = fc.features ?? [];
        rebuild();
    });

    // Hex-size slider. Update the readout immediately; debounce the rebin a touch
    // so a fast drag doesn't queue a rebuild per pixel.
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
            clearTimeout(timer);
            timer = window.setTimeout(rebuild, 90);
        });
    }

    addGenusDots(map);
    wireSpecimenPopup(map);
    wireHexPopup(map);
});
