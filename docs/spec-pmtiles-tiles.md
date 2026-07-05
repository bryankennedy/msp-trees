# Tier 2 — Retire the 51 MB point file with PMTiles vector tiles

> Status: Proposed (spec for a future prompt). Owner: bkennedy. Created: 2026-07-05.
> Prereq context: Tier 1 (pre-aggregated `species-counts.json` + `hexbin.geojson`)
> is already shipped — see `scripts/extract.mjs` and `app/src/hexbin.ts`.

## 1. Why

Tier 1 removed the full `data/processed/trees.geojson` (51 MB) from **normal**
page views: the species index and the default overview now load KB-sized
pre-aggregated files. But the full point set is still fetched **lazily** in two
situations, and remains the app's largest asset:

1. **Zoomed-in genus dots** — individual trees rendered above the crossfade band.
2. **The hex-size slider** — re-binning at a non-default cell size needs every
   point in the browser.

The specimen popup also needs per-tree attributes (`spp_com`, `spp_bot`,
`condition`, `dbh`, `yr_plant`, `address`, `street`).

Goal of Tier 2: **retire `trees.geojson` as a runtime asset entirely**, so no
visitor ever downloads a multi-MB blob, and the app scales to any dataset size.
This also realizes the original `SPEC.md` intent ("the heavy data is pre-baked
into vector tiles").

## 2. Approach (two parts)

### 2a. Points → PMTiles vector tiles (dots + popup)

Serve the individual trees as a **PMTiles** vector tileset. MapLibre requests
only the tiles for the current viewport + zoom via HTTP range requests, so the
client never holds the whole dataset. `pmtiles` is already a dependency
(`app/package.json`, `^3.2.1`); register its protocol and point a vector source
at the single `.pmtiles` file.

**Generation (pipeline):** add a step to (or after) `scripts/extract.mjs`:

```
tippecanoe -o data/processed/trees.pmtiles \
  --layer=trees \
  -zg --drop-densest-as-needed \
  --preserve-input-order \
  --include=id --include=genus \
  --include=spp_com --include=spp_bot --include=condition \
  --include=dbh --include=yr_plant --include=address --include=street \
  data/processed/trees.geojson
```

- **Bake `genus` into the tiles.** Today `annotateGenus` runs client-side. For
  tiles, compute `genus` in the pipeline (reuse the taxonomy helpers already
  duplicated in `extract.mjs`) and emit it as a feature property so the dot
  color `match` expression works without a client pass.
- Keep the popup fields as tile attributes (they're small text/number fields) so
  the popup needs no backend. If tile size becomes a concern, move full-record
  lookups to **D1** (per `SPEC.md`) and keep only `id` + `genus` in the tiles.
- `--drop-densest-as-needed` thins points at low zoom (where dots are hidden
  anyway); at high zoom all points are present for exact tapping.

**Prerequisite:** `tippecanoe` is a separate C++ binary (`brew install
tippecanoe` / build from source) — it is **not** an npm/bun package. Document it
in `scripts/README.md` and guard the pipeline step if the binary is absent.

### 2b. Hex slider → precomputed multi-size grids

With points served as viewport tiles, the client can no longer re-bin the whole
city at an arbitrary cell size. Replace continuous client binning with a set of
**precomputed grids at discrete sizes** emitted by `extract.mjs` (it already has
`buildHexbins`):

```
for s of [75, 100, 150, 200, 225, 300, 400]:
  write data/processed/hexbin-<s>.geojson
```

The slider snaps to the nearest precomputed size and swaps the `hexes` source
data (lazy-fetch each grid on first use; each is ~100–200 KB gzip). Tradeoff:
**stepped, not continuous** — acceptable for an exploration control, and it fully
removes the raw points from the overview. (Alternative if continuous is a hard
requirement: ship a slim `points-genus.geojson` of `[lon, lat, genus]` only,
~2–4 MB, for client binning — but that reintroduces a multi-MB fetch.)

## 3. App changes

| File | Change |
|------|--------|
| `app/src/overview-common.ts` | Replace the `"trees"` GeoJSON source with a vector source backed by `trees.pmtiles`; register the pmtiles protocol once. `addGenusDots` layers gain `"source-layer": "trees"`. `loadTrees`/`ensureTreesSource` retired or repurposed. |
| `app/src/hexbin.ts` | Drop lazy `loadTrees`; slider swaps among `hexbin-<s>.geojson`. Dots come from the vector source directly. `buildHexbins` (client) no longer needed at runtime (keep in pipeline only). |
| `app/src/taxonomy.ts` | `buildColorExpression` unchanged (still matches on `genus`), now fed by the baked tile attribute. |
| `app/src/species.ts` | No change (already on `species-counts.json`). |
| pipeline | `extract.mjs` emits `trees.pmtiles` (via tippecanoe) + `hexbin-<s>.geojson` set; can stop emitting the runtime `trees.geojson` once nothing fetches it (keep as tippecanoe input, or pipe directly). |

## 4. Hosting impact

- **PMTiles size:** 167k points with the attribute set above is expected to be
  **well under 25 MiB** — quite possibly small enough to host the `.pmtiles`
  **directly on Cloudflare Pages** (which supports range requests), eliminating
  the need for R2 entirely. Confirm the actual size after generation; if it
  exceeds 25 MiB, put just this file in **R2** (custom domain, range requests)
  and keep everything else on Pages.
- The pre-aggregated JSON/GeoJSON files stay tiny and live on Pages regardless.
- Net: the migration may become **"everything on Pages, no R2"** — simpler and
  cheaper than the plan drawn up before this optimization.

## 5. Verification (mirror the Tier 1 checks)

- Headless network trace: at default overview zoom, **no** `.pmtiles` range
  requests fire until zoom crosses toward the dots; then only viewport tiles
  load (bytes, not the whole file).
- Deep-zoom: dots render with correct genus colors; tap a dot → specimen popup
  shows all fields from tile attributes.
- Slider: each step swaps to the correct precomputed grid; popup area breakdown
  intact.
- Screenshot parity with the Tier 1 overview/species captures.

## 6. Open decisions (resolve at execution time)

1. **Popup source of truth:** bake all fields into tiles (no backend) **vs.**
   `id`+`genus` in tiles + D1 lookup on click. Start with baked-in; revisit if
   tile size pushes over the Pages limit.
2. **Slider:** accept stepped sizes (recommended) vs. keep continuous via a slim
   points file.
3. **Retire `trees.geojson` output?** Once nothing fetches it at runtime, keep it
   only as the tippecanoe input (or pipe GeoJSON straight into tippecanoe and
   stop writing the 51 MB file to disk).

## 7. Rough effort

~Half a day: tippecanoe integration + `genus` baking (pipeline), vector-source
refactor of the dots/popup (app), multi-size hexbin emit + slider swap, and the
verification pass. No change to the species page.
