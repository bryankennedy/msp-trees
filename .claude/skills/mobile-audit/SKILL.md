---
name: mobile-audit
description: >-
  Audit the MSP Trees web app (app/ — MapLibre hexbin map at "/" and the species
  index at "/species") for mobile readiness: WCAG accessibility, low-bandwidth
  behaviour, and efficient use of small-screen space with touch-friendly
  breathing room. Renders the real pages at phone viewports with touch
  emulation, screenshots them, and grades them against this repo's actual
  markup, breakpoints, and data sizes. Use WHENEVER the user asks to review,
  audit, check, or "look at" the mobile / phone / touch / responsive / small-
  screen experience of this app, or asks about mobile accessibility, offline /
  slow-connection behaviour, touch targets, thumb reach, or safe areas here.
  This skill produces a findings report; it does not itself ship fixes unless
  the user explicitly asks.
---

# MSP Trees — mobile audit

A repo-specific companion to the generic `mobile-first-audit` skill. That skill
knows phones in general; **this one knows _this_ app** — its two pages, its
MapLibre map, its vellum design system, its breakpoints, and the 52 MB of tree
data lurking behind the map. Prefer the concrete checks here; fall back to the
generic skill for anything not covered.

Treat **mobile as the primary experience**. Most people meeting a "boulevard
trees near me" map are standing on a boulevard, on a phone, on cell data.
Desktop is the secondary case.

## What this app actually is (read before auditing)

Two static pages, built by Vite (`app/`), MapLibre GL + vanilla TS. No SSR.

| Route | Entry | Script | Shape |
|-------|-------|--------|-------|
| `/` | `app/index.html` | `app/src/hexbin.ts` | Full-bleed MapLibre map + a right rail (`#sidebar`) that becomes a bottom panel on mobile |
| `/species` | `app/species.html` | `app/src/species.ts` | Scrolling report: stat cards, an SVG histogram, a long `.tally` table |
| `/hexbin`, `/heatmap` | — | — | 308-redirect to `/` |

Shared map wiring (controls, geolocation, the "Locate me" button) lives in
`app/src/overview-common.ts`. All styling — including every responsive rule — is
in the single stylesheet **`app/src/styles.css`**. There is no CSS framework;
breakpoints are hand-written `@media (max-width: 760px)` and `640px` blocks.

Key mobile mechanics already in the code, so you check them rather than assume
them:
- Viewport tag is correct on both pages: `width=device-width, initial-scale=1,
  viewport-fit=cover` — so `env(safe-area-inset-*)` is available and must be
  honoured (see Safe areas below).
- Layout uses `height: 100dvh` (`#app`) — good; verify no stray `100vh`.
- At `≤760px` the map/rail grid collapses to rows `auto / 2fr / 1fr / auto` and
  the **legend and hex-size control are `display:none`** (`styles.css:57-74`).
  That's a deliberate tradeoff — flag it, don't silently accept it: mobile users
  currently cannot read the genus legend or resize hexagons at all.
- The specimen / area popups render **inside the bottom panel** on mobile, not
  as floating overlays (`styles.css:381-390` + the `.sidebar` grid rule).

## How to render it at a phone (this repo's way)

Playwright + headless Chromium are already installed on this VM; run everything
with **`bun`** (there is no `node` here). See the `browser-verification` project
memory for the streaming-load gotcha.

1. Start the dev server if it isn't up: from `app/`, `bun run dev`
   (→ `http://127.0.0.1:5173`). The public systemd unit on `:8000` also works.
2. Use the harness in this skill dir — it opens each route at real phone
   viewports **with touch emulation and `deviceScaleFactor`**, waits for the
   dataset to stream in, and writes screenshots you read back:

   ```bash
   cd app && bun run ../.claude/skills/mobile-audit/screenshot-mobile.mjs
   ```

   It shoots `/` and `/species` at iPhone SE (375×667), iPhone 14 Pro
   (393×852), and Pixel 7 (412×915) into the scratchpad, and captures
   `console` + `pageerror` (MapLibre paint-expression bugs only surface at
   runtime — see the memory). Read the PNGs back to grade layout.
3. For interaction checks (tap a hex, open a popup, pinch-zoom) drive Playwright
   with `hasTouch: true` and use `tap()`, not `click()`.

Always look at the **map page under a throttled network** too — it is the whole
point of the low-bandwidth gate below.

## The audit — grade against these, cite file:line

Work the three mandated axes. For each finding, name the file and line, say
what a phone user actually experiences, and rate it **blocker / should-fix /
polish**. Produce a report; do not edit code unless asked.

### 1. WCAG accessibility (target: WCAG 2.1 AA)

- **Touch target size (2.5.5 / 2.5.8).** AA asks ~24px min; aim 44×44px.
  Suspects with real coordinates in the CSS:
  - `.popup-close` — a 22px `×` glyph, `top:6px right:8px` (`styles.css:294-300`).
    Small and corner-crammed; enlarge the hit area.
  - `.hex-range` thumb is 15px (`styles.css:165-174`) — but the whole control is
    hidden on mobile, so the real issue is the missing control, not the thumb.
  - MapLibre's own `NavigationControl` zoom buttons (`overview-common.ts:44`,
    top-right) and the attribution toggle — default ~29px. Check they clear the
    safe-area and aren't under the notch.
  - `.locate-cta` (`styles.css:225-248`) is already generously sized and
    bottom-centre — hold it up as the good example.
- **Contrast (1.4.3).** The vellum palette is low-contrast by design: `--ink-soft`
  `#6a5a48` on `--paper` `#f2e9d2`, and italic 11–13px serif captions
  (`.plate-subtitle`, `.report-note`, `.hex-control-note`). Measure the ratios;
  several sub-14px muted texts likely miss 4.5:1. The `--accent` `#06a7e0` on
  paper is also worth checking for any small text/icons.
- **Reflow & zoom (1.4.10 / 1.4.4).** No `maximum-scale`/`user-scalable=no` in
  the viewport tags — good, don't let a "fix" add them. Confirm the `.tally`
  table and histogram reflow (or scroll intentionally) at 320px CSS width with
  no horizontal page scroll.
- **Semantics & names.** Largely in good shape already — audit, don't assume:
  `#map` has an `aria-label`, popups use `<dl>`, the close buttons have
  `aria-label="Close"`, nav uses `aria-current`. Check the dynamically built
  legend/tally rows and the `.locate-cta` (built in `overview-common.ts`) keep
  real accessible names, and that opening a popup moves or announces focus.
- **Reduced motion (2.3.3 / animation).** The map zoom crossfade and
  `.map-flash`/`.locate-cta` transitions ignore `prefers-reduced-motion`. Note
  whether that matters for a map (camera motion is arguably essential) but flag
  the decorative transitions.
- **Keyboard/focus.** `:focus-visible` exists for the range and CTA; verify a
  visible focus ring on nav links, popup close, and table controls, and that the
  bottom panel is reachable in DOM order.

### 2. Low-bandwidth / slow connection

This is the sharpest real risk in the repo.

- **The tree dataset is enormous.** `data/processed/trees.geojson` is **52 MB**;
  the shipped sample (`trees.sample.geojson`) is **3.1 MB** and the hexbin is
  **1.1 MB**. The map streams the full point layer in after the sample. On a
  phone on cell data this is the headline cost. Check, at file:line in
  `hexbin.ts` / `overview-common.ts`: does the full `trees.geojson` load on
  mobile at all, or should the phone stop at the sample / hexbin? Is the fetch
  deferred, cancellable, or gated on zoom? Confirm the `#tree-count` UX
  communicates progress rather than freezing. (The `spec-pmtiles-tiles.md` doc
  is the intended fix path — reference it.)
- **JS weight.** `dist/assets/main-*.js` is ~797 KB (MapLibre) and
  `taxonomy-*.js` ~212 KB. Note transfer size (gzip) vs. parse cost on a
  mid-range phone; flag anything loaded on `/species` that only `/` needs.
- **Third-party requests.** Both pages pull **Google Fonts** (Spectral + Inter,
  `<link>` in the HTML `<head>`) and the map pulls **basemap tiles from
  `tiles.openfreemap.org`**. Each is a separate origin on the critical path.
  `preconnect` hints exist — verify. Check `font-display: swap` (the query
  string requests it) so text isn't blocked on the font. Consider what happens
  with tiles blocked/slow: the canvas falls back to `--paper` — is the map still
  legible?
- **Caching.** The dev server sets `Cache-Control: public, max-age=60` on
  `/data/*` (`vite.config.ts`) — that's a dev value; check the Cloudflare prod
  caching (see the `cloudflare-hosting` memory) actually caches the big data and
  hashed assets aggressively.
- **Throttle and watch.** Re-run the harness (or DevTools) at "Slow 3G" and
  record time-to-first-map and time-to-interactive. That number is the finding.

### 3. Space usage & touch breathing room

The brief: use the space, don't over-pad, but keep touches comfortable.

- **The hidden mobile chrome is the central tension.** Legend + hex control are
  `display:none ≤760px` (`styles.css:73`). The bottom panel is then mostly a
  `.sidebar-hint` until something is tapped — i.e. ~1/3 of the screen sits idle
  showing one italic line. Decide: is that idle third earning its space, or
  should the legend live there (collapsed/scrollable) so mobile users can
  actually decode the colours? This is the highest-value layout call.
- **Map real estate.** On mobile the map gets `2fr` of the middle. Good — but
  confirm the header (`.plate-header`, two lines of serif + nav) and footer
  aren't eating more vertical space than they earn at 375px. The `640px` block
  already shrinks the titles (`styles.css:382-390`).
- **Padding audit.** Rail padding is `16px 16px 22px`; report `padding
  20px 22px 40px`. Check these don't cramp width at 375px while also not leaving
  dead gutters. `.report` drops to `16px 12px` at 640px — verify similar care on
  the map rail.
- **The `.tally` table on a phone.** Four columns of serif at 13px in a 375px
  viewport. Does it fit, wrap, or force horizontal scroll? Sticky `thead`
  (`styles.css:355`) is good; confirm it survives the mobile viewport and the
  rows stay tappable if they're meant to be.
- **Safe areas.** `viewport-fit=cover` is set, so on a notched phone content can
  slide under the notch/home indicator. Grep `styles.css` for
  `env(safe-area-inset-*)` — there is currently **none**. The header, the
  bottom footer/panel, the bottom-anchored `.locate-cta`/`.map-flash`, and the
  MapLibre controls all need insets. Likely a cluster of findings.
- **Breathing room.** Where targets are close (nav links `gap:16px`, legend rows
  once restored, tally rows) confirm ≥8px between independent touch targets.

## Output

Deliver a prioritised findings list grouped by the three axes, each item as:

- **Rating** — blocker / should-fix / polish
- **Where** — `file:line` (+ which viewport it shows at)
- **What a phone user hits** — the concrete symptom, ideally with a screenshot
- **Direction** — the fix in one line (do not implement unless asked)

Close with the two or three calls that matter most — almost certainly: the
52 MB data path on cell connections, the missing `safe-area-inset` handling,
and the hidden legend/controls leaving mobile users unable to read the map.

State tradeoffs plainly; don't hide a desktop regression to make a phone better.
