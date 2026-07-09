### MSPT-4 — Repo-specific mobile-audit skill

**Context.** MSPT-4 asks for a repo-specific mobile audit *skill* (WCAG
accessibility, low-bandwidth behaviour, efficient use of space with touch-safe
breathing room) — the deliverable is the skill, not fixes to the app.

**Decisions.**

1. **A project skill, not a fix PR.** Added `.claude/skills/mobile-audit/` so
   the audit is a reusable, versioned capability. It complements (does not
   duplicate) the generic `mobile-first-audit` skill by grounding every check in
   this repo's real markup, breakpoints (`app/src/styles.css` `760px`/`640px`),
   and data sizes. The skill's frontmatter states it produces a findings report
   and does not ship fixes unless explicitly asked — matching the task scope.

2. **Ship a phone-viewport screenshot harness.** `screenshot-mobile.mjs` renders
   `/` and `/species` at three real phone viewports with touch emulation +
   `deviceScaleFactor`, following the `browser-verification` memory (Playwright +
   headless Chromium, run with `bun`). It forwards `console`/`pageerror` so
   MapLibre runtime paint bugs surface, and takes an optional `THROTTLE=1`
   Slow-3G pass for the low-bandwidth gate.

3. **Force SwiftShader in headless.** The VM has no GPU, so MapLibre's WebGL
   shaders fail to compile ("Could not compile fragment shader") and the map
   never renders. The harness launches Chromium with
   `--use-angle=swiftshader --enable-unsafe-swiftshader` so the map paints
   headlessly. Verified end-to-end: map resolves in ~3.5 s, 0 runtime errors.

4. **Count-wait matches the formatted DOM.** `#tree-count` renders with a
   thousands separator ("167,191"), so the wait strips non-digits before the
   6-digit check — an earlier consecutive-`\d{6}` regex never matched and forced
   a false 45 s timeout on every map shot.
