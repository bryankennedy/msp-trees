# Twin Cities Public Tree Explorer
An interactive web mapping project visualizing the urban forest of the 
Twin Cities (MSP) metro area. The initial release focuses on integrating 
city-maintained public tree data from Saint Paul and Minneapolis.

## Web app (tree viewer)

An interactive web map of the boulevard trees lives in [`app/`](app/). To run it
locally: `cd app && bun install && bun run dev`. For full instructions —
including how to **restart the server and keep it running** as a systemd service
— see **[`app/README.md`](app/README.md)**.

## Data Sources

| Layer | Source | URL | Date Downloaded |
|-------|--------|-----|-----------------|
| Metro Road Centerlines | MetroGIS / Metropolitan Emergency Services Board (MESB), via MN Geospatial Commons | https://gisdata.mn.gov/dataset/us-mn-state-metrogis-trans-road-centerlines-gac | 2026-06-10 |
| Saint Paul Public Trees | City of Saint Paul (public tree inventory) | Retrieved via email request to the City of Saint Paul | 2026-06-10 |

> Download dates are inferred from the source `.zip` file modification times and should
> be confirmed. The centerlines metadata (publication date 2020-03-03) is preserved under
> `data/raw/metro_road_centerlines/metadata/`.

## Requirements

- **QGIS** 3.28 LTR or newer (project saved as `.qgz`).
- **Python** 3.10+ for future analysis scripts. Starting dependencies are listed in
  [`scripts/requirements.txt`](scripts/requirements.txt):
  - `geopandas` — vector data wrangling
  - `pandas` — tabular analysis
  - `pyogrio` — fast OGR-backed vector I/O for GeoPandas

  ```bash
  cd scripts
  python -m venv .venv && source .venv/bin/activate
  pip install -r requirements.txt
  ```

## Coordinate Reference Systems (CRS)

The two source layers are **not** in the same CRS and must be reprojected to a common
CRS before any spatial analysis:

- **Metro Road Centerlines** — NAD83 / UTM Zone 15N, **EPSG:26915** (meters). This is the
  intended project CRS.
- **Saint Paul Public Trees** — *Ramsey County coordinates*, Lambert Conformal Conic,
  US survey feet (custom datum). This is a non-standard CRS that PROJ does not resolve by
  EPSG code (see `data/raw/boulevard_trees/Warnings.txt`). Reproject this layer to
  **EPSG:26915** in QGIS (or with `geopandas` via `.to_crs(26915)`) before joining it to
  the centerlines.

**Project CRS:** NAD83 / UTM Zone 15N — **EPSG:26915**.
