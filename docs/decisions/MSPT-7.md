### MSPT-7 — Gate the 51 MB point fetch at CROSSFADE_MID and make it abortable

**Context.** MA-01/MA-02 from the 2026-07-09 mobile audit: `ensurePoints()`
fired at `FADE_LO` (11.5) — 0.3 zoom levels above the opening view — while the
dots it feeds are fully transparent until `CROSSFADE_MID` (12.5). One "+" tap
downloaded 51.4 MB decoded (143 s on Slow 3G) of invisible data, with no way
to cancel (`pointsRequested` was a one-way latch, no `AbortController`).

**Decisions.**

1. **Gate at `CROSSFADE_MID`, not earlier.** Below 12.5 the dot layer's
   opacity is exactly 0, so nothing observable is lost; prefetching "a zoom
   level early" was buying 143 s of invisible download on mobile. The sample
   (~3 MB) loads first and paints the dots within the 12.5→13.5 fade band even
   on slow links.

2. **`loadTrees(map, onData?, signal?)` returns `Promise<boolean>`.** The
   signal aborts whichever stage is in flight — sample fetch, the
   `requestIdleCallback` wait (cancelled via `cancelIdleCallback`/
   `clearTimeout`, preserving the MSPT-6 guard), or the full fetch. Resolves
   `true` only when the FULL set applied, so the caller can distinguish
   done / aborted / failed.

3. **Replace the one-way latch with an in-flight handle + retry.** `hexbin.ts`
   keeps `pointsAbort` (non-null while loading) and `pointsDone` (full set
   applied). Dropping below 12.5 aborts; re-crossing starts over. Data already
   applied (e.g. the sample) stays applied — abort only stops network work.
   Side effect: a *failed* (network-error) load can now also retry on the next
   crossing, where the old latch stranded the session on the sample.

4. **Pinned loads are exempt from the zoom abort.** Two consumers need raw
   points regardless of zoom: the fallback when `/data/hexbin.geojson` is
   missing (client-side binning is the only way to paint anything) and the
   hex-size slider (re-binning). `ensurePoints(true)` sets `pointsPinned`,
   which disables `abortPoints()`. This is also the tradeoff the action named:
   the slider is `display:none` on mobile today; if it is ever restored there,
   this pin is already the conditional hook.

5. **Heap criterion interpreted as the aborted cycle.** Once the full set has
   *completed*, it stays in the GeoJSON source by design (unloading would
   break the dots on the next zoom-in); the real fix for holding 167k features
   in memory is the pmtiles spec (`docs/spec-pmtiles-tiles.md`). Verified:
   baseline 13 MB → 13 MB after a throttled zoom-in/zoom-out abort cycle.

**Verification** (Playwright + CDP, phone viewport, staging :8000): zero
`/data/trees*` requests at zoom 11.2 and 12.2; at 13.2 under a 4 Mbps
throttle the full fetch starts and zooming out fails it with
`net::ERR_ABORTED`; re-crossing refetches to completion, count 167,191, dots
render; no page errors.
