### MSPT-9 — Grow the panel to fit the tapped card instead of clipping it

**Context.** MA-05: at 375×667 a tapped hexagon's card is 287 px inside a
fixed-height panel — 134 px when audited, 170 px after MSPT-8's 7:3 split —
severing the genus breakdown mid-row with no scroll affordance. Re-measured
on post-MSPT-8 `main` before fixing: still clipped (panel 170, scrollHeight
309, card bottom off-panel), so the action remained live.

**Decisions.**

1. **Grid-rows swap, not a drag-up sheet.** The action offered both. A sheet
   adds JS, gesture handling and a dismissal model to what is a pure layout
   problem; the swap is four CSS lines on the mechanism MSPT-8 already
   established (`:has(.popup-card:not([hidden]))` drives the open state).
   While a card is open, the panel row goes from `minmax(0, 3fr)` to `auto`
   (content-sized) and the map row absorbs the difference; close restores
   the 7:3 split. MapLibre handles the container resize itself.

2. **Cap the panel at `56dvh` (`60vh` fallback).** Content-sizing without a
   cap would let a pathological card push the map to nothing. At 667 px the
   cap is 373 px — well above the 309 px worst measured card, so in practice
   nothing scrolls; if a taller card ever appears the panel scrolls inside
   the cap rather than swallowing the map. The `vh` line covers the narrow
   Chrome 105-107 window that has `:has()` but not `dvh`.

3. **The map may drop below 270 px while a card is open** (measured 260 px).
   MSPT-8's ≥270 px criterion is for the idle map; while the reader is
   consuming the answer to their tap, the card is the priority and the map
   remains visible and interactive above it. Closing returns 399 px.

4. **No `:has()` → old behavior.** Browsers without `:has()` (pre-Safari
   15.4 / Chrome 105) keep the fixed 7:3 panel with internal scrolling —
   degraded, not broken, and the same cohort MSPT-8 already accepted.

**Verified** at 375×667 on a 5-genus hexagon ("81 trees"): card 287 px, panel
grows 170 → 309 px (= content, no internal scroll), eyebrow/title/subtitle/
all five rows/footer visible without scrolling; map 399 → 260 px while open,
back to 399 px on close, legend returns.
