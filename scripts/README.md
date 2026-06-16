# Scripts

Analysis and data-preparation scripts for the Saint Paul boulevard trees project will
live here.

This is currently a placeholder. Planned/expected work:

- Reproject the boulevard trees layer (Ramsey County ft) to the project CRS,
  **EPSG:26915** (NAD83 / UTM Zone 15N), to match the road centerlines.
- Clip metro-wide road centerlines to the Saint Paul boundary.
- Spatially join trees to nearest street segments and write results to `../data/processed/`.

## Setup

Requires **Python** 3.10+. Starting dependencies (see [`requirements.txt`](requirements.txt)):

- `geopandas` — vector data wrangling
- `pandas` — tabular analysis
- `pyogrio` — fast OGR-backed vector I/O for GeoPandas

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```
