# Archived map views

These are the two map plates that were retired when the **hexbin** view became
the default route (`/`). They are kept for reference and are **excluded from the
build** (not listed in `vite.config.ts` `rollupOptions.input`, no route points
at them).

| File | Was | Notes |
|------|-----|-------|
| `dots.html` + `main.ts` | `/` — "Map (dots)", one circle per tree at every zoom | the original control plate |
| `heatmap.html` + `heatmap.ts` | `/heatmap` — sepia density wash | superseded by the hexbin overview |

Shared modules still live in `../src/` (`style-vellum`, `taxonomy`,
`overview-common`, `styles.css`); the imports here were repointed to `../src/…`
so these snapshots still load if opened directly in the dev server
(e.g. `/archive/dots.html`). They are not type-checked (`tsconfig` only includes
`src/`) or bundled.

The live app is now: `/` = hexbin map, `/species` = species index / histogram.
`/hexbin` and `/heatmap` 308-redirect to `/`.
