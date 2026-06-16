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

Both source layers are in different CRSs and must be reprojected to the project
CRS (**EPSG:26915**) before analysis — see the root README's CRS section.
