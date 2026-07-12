### MSPT-8 — Reclaim the header, put the genus legend on mobile

**Context.** MA-03 + MA-04 from the 2026-07-09 mobile audit: at 375×667 the
header consumed 211 px (31.6%) and the map only 270 px (40.5%), while the
legend — the only key to the genus colours — was `display: none` on mobile
(WCAG 1.4.1). The idle bottom panel showed a single hint line.

**Decisions.**

1. **Short-title span, not CSS truncation.** The mobile header is one flex
   row: "Boulevard Trees" left, nav right. An ellipsized full title
   ("Boulevard Trees — Hexb…") reads as an accident; a deliberate short title
   reads as design. Both variants live in the `<h1>` and CSS swaps them, so
   the desktop caption is untouched. "Plate I." and the subtitle are hidden
   ≤760px — the accepted aesthetic tradeoff the action names.

2. **The specimen count moves to a compact footer line.** The count lived in
   the hidden subtitle. The footer already wasted 51 px wrapping its credit
   to two lines; it now swaps to a one-line compact variant
   ("167,191 specimens · data: Saint Paul Forestry") ≤760px. `setCount`
   updates `#tree-count` and every `[data-tree-count]` so both slots stay
   live.

3. **Legend as the bottom panel's default content, one scrollable row.** All
   14 entries render as a horizontally scrollable nowrap swatch row (~30 px);
   the 15th entry being clipped at the viewport edge is the scroll
   affordance. `.sidebar:has(.popup-card:not([hidden])) .legend` hides it
   while a tapped card is open — same mechanism the hint already used; on
   browsers without `:has()` the legend merely stays above the card
   (degraded, not broken). The hex-size slider stays desktop-only (its
   consumer needs the raw 51 MB point set — MSPT-7 pins that load).

4. **Map/panel split goes 2fr/1fr → 3fr/1fr.** With the header at ~67 px and
   the footer at 30 px, the map gets 427 px (64.1% of 667 px) — comfortably
   past the ≥55% / ≥270 px criteria — and the 142 px panel still fits the
   legend row plus hint (cards scroll within it, as before).

**Verified** at 375×667 (Playwright, touch): header 211→67 px, map 270→427.5 px
(40.5→64.1%), legend visible with 14 rows and horizontal scroll, hex-tap swaps
legend→area card and back, count present in footer. Desktop 1280×800:
header/subtitle/legend/slider/footer all unchanged.

### MSPT-8b — Legend gets three rows instead of one

**Context.** Review feedback on PR #7: the single scrollable row showed only
4-5 of 14 entries at 375px; make the legend area taller so scrolling is
rarely needed.

**Decision.** The mobile legend list becomes a 3-row column-flow grid
(`grid-auto-flow: column`, horizontal scroll only for the overflow) and the
map/panel split relaxes 3fr/1fr → 7fr/3fr. At 375×667 that shows 12 of 14
entries with no scrolling — every named genus; only the two muted catch-alls
("Other genera", "Vacant · stump · do-not-plant") overflow. Map: 399 px =
59.8% of the viewport, still past the ≥55% / ≥270 px criteria. Fitting all 14
without scroll would need ~5 rows and give back most of the map gain — not
worth it for the two lowest-information entries.
