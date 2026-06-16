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
| Saint Paul Public Trees | City of Saint Paul (public tree inventory) | Retrieved via a Data Practices Request to the City of Saint Paul | 2026-06-02 |

## Documentation

- [`app/README.md`](app/README.md) — running the web map viewer (dev server + systemd service).
- [`qgis/README.md`](qgis/README.md) — the QGIS desktop project, styles, and QGIS requirements.
- [`data/README.md`](data/README.md) — data layout and coordinate reference system (CRS) notes.
- [`scripts/README.md`](scripts/README.md) — analysis/data-prep scripts and Python setup.
- [`docs/SPEC.md`](docs/SPEC.md) — technical specification and target architecture.
