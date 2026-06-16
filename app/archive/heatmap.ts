// Plate III — Heatmap (density wash). Overview representation #1: below the
// crossfade band the trees render as a continuous MapLibre heatmap — a sepia
// density field that answers "where are trees concentrated?" at a glance,
// without 167k overdrawn circles. Zooming past the band dissolves the wash into
// the individual genus dots (shared with the control plate).
//
// Trade-off vs. the control: density reads cleanly at the bird's-eye view, but
// the heatmap is a single intensity field — it carries no genus information.
// The genus story only returns once you zoom in to the dots.
import {
  createOverviewMap,
  renderLegend,
  addGenusDots,
  wireSpecimenPopup,
  loadTrees,
  FADE_LO,
  FADE_HI,
} from "../src/overview-common";

renderLegend();
const map = createOverviewMap();

// MapLibre's heatmap density is absolute (it sums per-point weight), so a fixed
// weight that looks right for the full 167k set makes the 10k first-paint sample
// ~17× too faint — and vice versa. Normalize the per-point weight to the live
// feature count so the wash reads identically for the sample and the full set:
// weight = REF_WEIGHT × (REF_COUNT / n).
const REF_COUNT = 167_191;
const REF_WEIGHT = 0.07;

map.on("load", () => {
  // Shared "trees" source + streaming loader (sample, then full set). On each
  // load, retune the heatmap weight to the new count so density stays constant.
  loadTrees(map, (fc) => {
    const n = fc.features?.length ?? 0;
    if (n > 0) map.setPaintProperty("trees-heat", "heatmap-weight", REF_WEIGHT * (REF_COUNT / n));
  });

  // Heatmap reads the same source. Added before the dots so it sits beneath
  // them; capped just above the band since it's fully faded out by then.
  map.addLayer({
    id: "trees-heat",
    type: "heatmap",
    source: "trees",
    maxzoom: FADE_HI + 1,
    paint: {
      // Each tree contributes a small weight. Boulevard trees line nearly every
      // residential street, so the points are densely and fairly *uniformly*
      // packed — with a large weight/radius the field saturates to a flat
      // silhouette of the city. Keeping per-point weight tiny and the radius
      // modest pulls the bulk of the city down into the gradient so relative
      // density (dense grids vs. parks, river, downtown, industrial) shows.
      "heatmap-weight": 0.12,
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 9, 0.25, 11, 0.45, 12.5, 0.8, 13.5, 1.0],
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 9, 4, 11, 7, 13, 14],
      "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], FADE_LO, 0.85, FADE_HI, 0],
      // Vellum-toned ramp weighted toward the sage range so most of the city
      // reads green and only genuine hotspots deepen to brown/ink. Low densities
      // stay translucent so the basemap engraving shows through.
      "heatmap-color": [
        "interpolate",
        ["linear"],
        ["heatmap-density"],
        0, "rgba(242,233,210,0)",
        0.1, "rgba(169,181,129,0.45)",
        0.3, "#A9B581",
        0.55, "#7A8C5C",
        0.78, "#4F5D3A",
        0.92, "#6E5A2E",
        1, "#3A3026",
      ],
    },
  });

  addGenusDots(map);
  wireSpecimenPopup(map);
});
