# Saint Paul Boulevard Trees — GIS Project

A QGIS project for analyzing the public boulevard (street) trees of Saint Paul,
Minnesota, in relation to the regional road network. The goal is to associate the
City's public tree inventory with metro road centerlines to support boulevard-tree
analysis (e.g. trees per street segment, species distribution along corridors).

## Directory Structure

```
stpaul-trees/
├── stpaul_trees.qgz          # QGIS project file
├── README.md
├── .gitignore
├── data/
│   ├── raw/                   # Source data — large & re-downloadable (git-ignored)
│   │   ├── metro_road_centerlines/   # MetroGIS road centerlines shapefile + source zip
│   │   └── boulevard_trees/          # Saint Paul public trees shapefile + source zip
│   └── processed/             # Derived/cleaned spatial data (tracked dir, contents vary)
├── scripts/                   # Analysis & data-prep scripts (see scripts/README.md)
├── styles/                    # QGIS .qml layer styles
└── outputs/                   # Generated maps, exports, reports (git-ignored)
```

## Data Sources

| Layer | Source | URL | Date Downloaded |
|-------|--------|-----|-----------------|
| Metro Road Centerlines | MetroGIS / Metropolitan Emergency Services Board (MESB), via MN Geospatial Commons | https://gisdata.mn.gov/dataset/us-mn-state-metrogis-trans-road-centerlines-gac | 2026-06-10 |
| Saint Paul Public Trees | City of Saint Paul (public tree inventory) | _(unknown — verify; likely Saint Paul / Ramsey County open data portal)_ | 2026-06-10 |

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
