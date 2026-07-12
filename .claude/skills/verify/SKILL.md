---
name: verify
description: Build/launch/drive recipe for verifying changes to the MSP Trees map app (app/) at runtime with headless Chromium.
---

# Verifying the MSP Trees app

## Launch

- Dev server: `cd app && bun run dev` → http://127.0.0.1:5173/ (background it).
  It serves `/data/*` straight from `<repo>/data/processed/` (git-ignored;
  contains hexbin.geojson, trees.sample.geojson ~3 MB, trees.geojson ~54 MB).
- Build check only: `cd app && bun run check && bun run build`.

## Drive with Playwright

Playwright + Chromium are installed as `app/` devDependencies. Run scripts
from the scratchpad with `NODE_PATH=<repo>/app/node_modules bun script.mjs`.

Gotchas that cost time:

- **Headless WebGL is flaky at `deviceScaleFactor: 2`** — MapLibre loses the
  GL context ("Could not compile fragment shader", blank canvas). Launch with
  `chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader"] })`
  and `deviceScaleFactor: 1`; renders reliably.
- **No global map handle / URL hash.** Drive zoom through the real UI:
  `.maplibregl-ctrl-zoom-in` clicks (+1 zoom each; initial zoom 11.2).
- Zoom gates: points lazy-load at `FADE_LO = 11.5`; dots visible from
  `CROSSFADE_MID = 12.5`. Two zoom-in clicks (→ 13.2) crosses both.
- Useful observables: `#tree-count` text (hexbin total → sample count →
  full count as each dataset applies; full total 167,191), network responses
  under `/data/`, `page.on("pageerror")` for unhandled rejections.
- To emulate Safari < 17.4 (no `requestIdleCallback`), an init script must
  `delete Window.prototype.requestIdleCallback` — deleting off `window`
  alone doesn't work in Chromium (it's a prototype method).

## Flows worth driving

- Overview load: hexbin paints, `#tree-count` shows total.
- Zoom-in crossfade: 2× zoom-in → sample then full points fetch, dots render
  along boulevards (screenshot the canvas).
- Species page at `/species.html` (dev) / `/species` (prod redirect).
