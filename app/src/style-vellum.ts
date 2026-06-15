// MapLibre style for the vellum plate. Basemap is OpenFreeMap "positron"
// vector tiles (free, no key) which we recolor entirely into cream/sepia so
// roads, water, and parks read as a faded engraving under the trees. When the
// in-house Protomaps build lands, swap `openmaptiles` for a PMTiles source —
// the layer recipe stays the same.
import type { StyleSpecification } from "maplibre-gl";

const paper = "#F2E9D2";
const paperWash = "#ECE1C2";
const water = "#D9E2DC"; // pale celadon wash
const park = "#E2E4C8";  // moss-leaf wash
const roadMinor = "#D7C9A3";
const roadMajor = "#C8B583";
const roadCasing = "#9F8857";
const ink = "#3A3026";
const inkSoft = "#6A5A48";

export const vellumStyle: StyleSpecification = {
  version: 8,
  name: "vellum",
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sources: {
    openmaptiles: {
      type: "vector",
      url: "https://tiles.openfreemap.org/planet",
      attribution:
        '© <a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a> · © <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    },
  },
  layers: [
    { id: "paper", type: "background", paint: { "background-color": paper } },
    {
      id: "park-wash",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "park",
      paint: { "fill-color": park, "fill-opacity": 0.6 },
    },
    {
      id: "landuse-wash",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landuse",
      filter: ["in", ["get", "class"], ["literal", ["cemetery", "school", "hospital", "residential"]]],
      paint: { "fill-color": paperWash, "fill-opacity": 0.55 },
    },
    {
      id: "water",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "water",
      paint: { "fill-color": water },
    },
    {
      id: "waterway",
      type: "line",
      source: "openmaptiles",
      "source-layer": "waterway",
      paint: { "line-color": water, "line-width": 0.8 },
    },
    {
      id: "road-minor-casing",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      minzoom: 12,
      filter: ["in", ["get", "class"], ["literal", ["minor", "service", "track", "path"]]],
      paint: {
        "line-color": roadCasing,
        "line-opacity": 0.35,
        "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.4, 18, 3],
      },
    },
    {
      id: "road-minor",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      minzoom: 12,
      filter: ["in", ["get", "class"], ["literal", ["minor", "service", "track", "path"]]],
      paint: {
        "line-color": roadMinor,
        "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.2, 18, 2.2],
      },
    },
    {
      id: "road-major-casing",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: ["in", ["get", "class"], ["literal", ["primary", "secondary", "tertiary", "trunk", "motorway"]]],
      paint: {
        "line-color": roadCasing,
        "line-opacity": 0.5,
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.6, 18, 6],
      },
    },
    {
      id: "road-major",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      filter: ["in", ["get", "class"], ["literal", ["primary", "secondary", "tertiary", "trunk", "motorway"]]],
      paint: {
        "line-color": roadMajor,
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.3, 18, 4.5],
      },
    },
    {
      id: "boundary-city",
      type: "line",
      source: "openmaptiles",
      "source-layer": "boundary",
      filter: ["all", [">=", ["get", "admin_level"], 4], ["<=", ["get", "admin_level"], 8]],
      paint: {
        "line-color": inkSoft,
        "line-opacity": 0.35,
        "line-dasharray": [2, 2],
        "line-width": 0.6,
      },
    },
    {
      id: "place-label-major",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "place",
      minzoom: 9,
      filter: ["in", ["get", "class"], ["literal", ["city", "town", "village", "suburb", "neighbourhood"]]],
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Italic"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 9, 11, 14, 16],
        "text-letter-spacing": 0.08,
      },
      paint: {
        "text-color": ink,
        "text-halo-color": paper,
        "text-halo-width": 1.4,
      },
    },
    {
      id: "road-label",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "transportation_name",
      minzoom: 14,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 11,
        "symbol-placement": "line",
      },
      paint: {
        "text-color": inkSoft,
        "text-halo-color": paper,
        "text-halo-width": 1.2,
      },
    },
  ],
};
