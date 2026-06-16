# Data

Spatial data for the Twin Cities Public Tree Explorer.

- `raw/` — original source data exactly as downloaded (shapefiles + source
  `.zip`s). Large and re-downloadable, so the contents are **git-ignored**. See
  the root [`README.md`](../README.md#data-sources) for source URLs and download
  dates.
  - `metro_road_centerlines/` — MetroGIS road centerlines.
  - `boulevard_trees/` — Saint Paul public tree inventory.
- `processed/` — derived/cleaned spatial data produced by [`../scripts/`](../scripts/)
  (e.g. reprojected, clipped, joined GeoJSON). The directory is tracked but its
  generated contents are git-ignored except for small samples.

## Coordinate Reference Systems (CRS)

The two source layers are **not** in the same CRS and must be reprojected to a common
CRS before any spatial analysis:

- **Metro Road Centerlines** — NAD83 / UTM Zone 15N, **EPSG:26915** (meters). This is the
  intended project CRS.
- **Saint Paul Public Trees** — *Ramsey County coordinates*, Lambert Conformal Conic,
  US survey feet (custom datum). This is a non-standard CRS that PROJ does not resolve by
  EPSG code (see `raw/boulevard_trees/Warnings.txt`). Reproject this layer to
  **EPSG:26915** in QGIS (or with `geopandas` via `.to_crs(26915)`) before joining it to
  the centerlines.

**Project CRS:** NAD83 / UTM Zone 15N — **EPSG:26915**.
