### MSPT-6 — Feature-detect requestIdleCallback for the full tree load

**Context.** The mobile audit (MA-07, filed on MSPT-6) traced "some trees not
loading on mobile" to `app/src/overview-common.ts`: the lazy full-set load was
scheduled with `requestIdleCallback?.(…)`. Optional chaining guards a
null/undefined *value*, but `requestIdleCallback` is an **undeclared
identifier** on Safari < 17.4 (it shipped in 17.4), so the line throws
`ReferenceError` inside an un-`try`'d async IIFE. The rejection is unhandled,
the map silently stays on the ~9,835-tree sample, and the dots never fill in —
on the primary mobile platform. Reproduced in the harness: emulating the
missing API (deleting `Window.prototype.requestIdleCallback`) left the old
code at 9,835 of 167,191 trees with the exact `ReferenceError`.

**Decisions.**

1. **Guard with `typeof requestIdleCallback === "function"`, not a polyfill or
   `window.requestIdleCallback?.()`.** `typeof` is the one operator that is
   safe on undeclared identifiers, and a two-branch conditional at the single
   call site is smaller than pulling in (or hand-rolling) a polyfill for one
   use.

2. **`setTimeout(cb, 1)` as the fallback.** On browsers without the API the
   load fires on the next macrotask — the audit measured only ~52 ms of real
   deferral from the idle callback in production anyway, so nothing meaningful
   is lost.

3. **`{ timeout: 2000 }` on the real `requestIdleCallback` branch.** Without a
   timeout a busy main thread (large sample parse, map render) can starve the
   callback indefinitely; 2 s caps the wait while keeping the politeness.

4. **The fetch stays gated at the caller.** `ensurePoints` in `hexbin.ts`
   already defers the 51 MB fetch until zoom ≥ `FADE_LO` (the MA-01/MA-02 work
   under MSPT-4); this change deliberately does not touch that gating.

**Verification.** Playwright + headless Chromium (SwiftShader), phone
viewport, `Window.prototype.requestIdleCallback` deleted: no page errors, the
full set fetches after two zoom-in clicks, count reaches 167,191, dots render.
With the API intact the idle branch behaves as before. Still worth a spot
check on a real iOS ≤ 17.3 device, per the action's caveat.
