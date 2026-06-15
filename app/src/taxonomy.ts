// Shared tree taxonomy + palette. Used by both the map (color dots by genus)
// and the species report (table + histogram). The City Forestry survey records
// a free-text common name in `spp_com` like "Maple, Norway" or
// "Honeylocust, Thornless - Skyline"; the leading token before the first comma
// or " - " is the genus group we color by. A handful of values are not trees at
// all (vacant boulevard sites, do-not-plant flags, stumps) — we treat those as a
// muted "non-tree" class so they don't compete with living specimens visually.

/** Common-name values that are not living trees. */
const PLACEHOLDERS = new Set([
  "Vacant Site",
  "N/A",
  "Do Not Plant",
  "Stump",
  "Stump - No Grind",
  "Unknown",
  "(unrecorded)", // the lone record with a null common name
]);

export const isPlaceholder = (sppCom: unknown): boolean =>
  sppCom == null || sppCom === "" || PLACEHOLDERS.has(String(sppCom).trim());

/** Leading genus group: text before the first comma or " - " separator. */
export const genusOf = (sppCom: unknown): string => {
  if (sppCom == null || sppCom === "") return "Unknown";
  const s = String(sppCom).trim();
  const i = s.search(/,| - /);
  return (i >= 0 ? s.slice(0, i) : s).trim() || "Unknown";
};

// Botanical categorical palette tuned to read on the vellum paper background.
// Ordered by frequency in the dataset; the first 12 genera get a dedicated hue,
// everything living else falls through to OTHER_COLOR, and non-trees to PLACEHOLDER_COLOR.
export const GENUS_COLORS: Record<string, string> = {
  Maple: "#C44E34",        // russet
  Oak: "#7A5320",          // oak brown
  Linden: "#7E9B2F",       // linden green
  Elm: "#2E8B7F",          // teal
  Honeylocust: "#D69A1E",  // gold
  Hackberry: "#4E6E92",    // steel blue
  Coffeetree: "#6B4E9B",   // violet
  Birch: "#8FA3AE",        // silver-blue
  Apple: "#CE5D92",        // blossom
  Ginkgo: "#E7C13B",       // fan yellow
  Lilac: "#A06CC0",        // lilac
  Pine: "#2F6B3D",         // pine green
};

export const OTHER_COLOR = "#9C8E74";       // muted tan — living but uncommon genera
export const PLACEHOLDER_COLOR = "#CBBE9F"; // faint — vacant sites, stumps, do-not-plant

/** Legend rows, in the order they should be displayed. */
export const LEGEND: ReadonlyArray<{ label: string; color: string }> = [
  ...Object.entries(GENUS_COLORS).map(([label, color]) => ({ label, color })),
  { label: "Other genera", color: OTHER_COLOR },
  { label: "Vacant · stump · do-not-plant", color: PLACEHOLDER_COLOR },
];

/** Resolve the display color for a raw common name. */
export const colorOf = (sppCom: unknown): string => {
  if (isPlaceholder(sppCom)) return PLACEHOLDER_COLOR;
  return GENUS_COLORS[genusOf(sppCom)] ?? OTHER_COLOR;
};

/**
 * Build a MapLibre `match` expression that maps the per-feature `genus`
 * property (set by annotateGenus) to a color. Placeholders are annotated with
 * the sentinel genus "·placeholder·".
 */
export const PLACEHOLDER_GENUS = "·placeholder·";

export const buildColorExpression = (): unknown[] => {
  const match: unknown[] = ["match", ["get", "genus"]];
  for (const [genus, color] of Object.entries(GENUS_COLORS)) {
    match.push(genus, color);
  }
  match.push(PLACEHOLDER_GENUS, PLACEHOLDER_COLOR);
  match.push(OTHER_COLOR); // default
  return match;
};

/** Annotate every feature in a GeoJSON FeatureCollection with a `genus` prop. */
export const annotateGenus = (fc: {
  features?: Array<{ properties?: Record<string, unknown> | null }>;
}): void => {
  for (const f of fc.features ?? []) {
    const p = (f.properties ??= {});
    p.genus = isPlaceholder(p.spp_com) ? PLACEHOLDER_GENUS : genusOf(p.spp_com);
  }
};

/** Rarity thresholds used to flag scarce species in the report. */
export const RARE_THRESHOLD = 5;
export const SINGLETON_THRESHOLD = 1;
