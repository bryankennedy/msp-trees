# Scripts

Data pipeline and deploy tooling for the Saint Paul boulevard trees project.
Node ESM run with **Bun**; this folder is its own package (`bun install` here).

## `extract.mjs` — shapefile → GeoJSON + pre-aggregates

Reads `../data/raw/boulevard_trees/public_trees.{shp,dbf}`, validates against the
Saint Paul bbox, and writes to `../data/processed/` (git-ignored, re-derivable):

- `trees.geojson` — full point set (~51 MB)
- `trees.sample.geojson` — ~10k-point sample for fast first paint
- `species-counts.json` — name→count for the species index (a few KB)
- `hexbin.geojson` — dominant-genus hex grid at the default cell size, so the
  overview paints instantly without the full point set

```bash
bun install
bun run extract
```

## `deploy-cloudflare.mjs` — publish to Cloudflare Pages + R2

Ships the Vite build to **Cloudflare Pages** and the 51 MB `trees.geojson` to the
**`msp-trees-data` R2 bucket**, which a Pages Function
(`app/functions/data/trees.geojson.js`) streams back at `/data/trees.geojson`.
Everything else under `/data/*` ships as a static Pages asset.

```bash
bun run deploy:cf          # build → stage data → upload R2 → deploy Pages
bun run deploy:cf pages     # a single step: build | data | r2 | pages | domains
bun run deploy:cf domains   # one-time: attach msptrees.com + www.msptrees.com
```

### Credentials

The token is loaded with `dotenv` from **`../app/.env`** (git-ignored) and passed
to `wrangler` via the environment — never inlined. Add:

```
CLOUDFLARE_API_TOKEN=your_scoped_token
```

Create the token at <https://dash.cloudflare.com/profile/api-tokens> with:

- **Account · Cloudflare Pages · Edit** — create/deploy the Pages project
- **Account · Workers R2 Storage · Edit** — upload the point set to R2

`CLOUDFLARE_ACCOUNT_ID` is optional (wrangler infers it from a single-account
token). See `../app/.env.example` for the full template.

## Legacy (QGIS/Python) — not currently used

The original plan reprojected layers with GeoPandas (see `requirements.txt`).
That path is dormant; the shapefile carries WGS84 lon/lat columns, so
`extract.mjs` reads those directly (see `docs/SPEC.md` §3 CRS note).
