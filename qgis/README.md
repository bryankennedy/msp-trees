# QGIS Project

This directory holds the desktop QGIS project for the Twin Cities Public Tree
Explorer.

- `stpaul_trees.qgz` — the QGIS project file (QGIS 3.28 LTR or newer).
- `styles/` — QGIS `.qml` layer styles for the project.

## ⚠️ Not the source of truth

This QGIS project is a desktop authoring / exploration environment and **may not
be kept in sync with the web mapper** in [`../app/`](../app/). The web map is
developed independently and can drift ahead of (or differ from) what is saved
here — layers, styling, and data versions may not match.

Treat the web app as the current, maintained view of the data. Use this QGIS
project for ad-hoc desktop analysis and one-off exports, not as a mirror of
production.

## Coordinate Reference System

Project CRS is **NAD83 / UTM Zone 15N — EPSG:26915**. See the root
[`README.md`](../README.md#coordinate-reference-systems-crs) for notes on
reprojecting the source layers before analysis.
