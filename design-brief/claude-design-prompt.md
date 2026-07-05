# Design brief: favicon & app icon for "Saint Paul Boulevard Trees"

Paste this whole document into Claude Design, and attach the two reference screenshots
in this folder (`app-map-desktop.png`, `app-species.png`).

---

## What I need
A single, cohesive **icon mark** for a web app, delivered as artwork I can slice into a
favicon and PWA/app icons. Design at large size; it must also survive being shrunk to 16px.

## What the app is
An interactive map of the ~167,000 boulevard (street) trees of Saint Paul, Minnesota. The
map reads like a **19th-century botanical engraving / scientific plate** — it's literally
titled "Plate I." Trees are aggregated into hexagonal cells, each tinted by its dominant
genus (maple, oak, linden, elm…), dissolving into individual specimens as you zoom in. The
whole thing feels like a naturalist's hand-tinted survey, not a modern tech dashboard.

See the attached screenshots for the exact aesthetic — note the aged-paper ground, the
italic serif headings, the small-caps labels, and the muted hand-tinted color dots.

## Aesthetic direction
- **Vintage botanical plate / antique engraving / letterpress.** Hand-tinted, warm, archival.
- Quiet and scholarly, not loud. Think herbarium specimen sheet, old field guide, map cartouche.
- Subtle paper texture and fine line-work are welcome at large sizes.

## Concept ideas (pick/combine, or propose better)
1. A single stylized **leaf** (maple or linden) rendered as an engraving — strongest at small sizes.
2. A **hexagon** holding a leaf or tree silhouette — nods to the hexbin map.
3. A small **boulevard tree** silhouette as a botanical specimen.
4. A **monogram** ("StP" or a tree glyph) set in the Spectral serif, like a plate signature.

My lean: a bold single-leaf or hex-leaf mark, because it stays legible at 16px.

## Exact brand tokens (use these)
**Palette**
- Paper / background: `#F2E9D2` (and a deeper `#EBE0C2`)
- Ink (primary line/fill): `#3A3026`, softer ink `#6A5A48`
- Rule / hairline: `#B3A07A`
- Sage greens (foliage): `#7A8C5C`, deep `#4F5D3A`
- Cyan accent (use sparingly): `#06A7E0`

**Genus tints (the hand-tinted map palette — good source for foliage colors)**
- Maple russet `#C44E34` · Oak brown `#7A5320` · Linden green `#7E9B2F` · Elm teal `#2E8B7F`
- Honeylocust gold `#D69A1E` · Hackberry steel-blue `#4E6E92` · Coffeetree violet `#6B4E9B`
- Birch silver-blue `#8FA3AE` · Apple blossom `#CE5D92` · Ginkgo yellow `#E7C13B`
- Lilac `#A06CC0` · Pine green `#2F6B3D`

**Type** (if any lettering): Spectral (serif, often italic for headings); Inter (sans, small-caps labels).

## Deliverables I need from you
1. **2–3 distinct concepts** to compare, each on the paper ground `#F2E9D2`.
2. The chosen mark as a clean **vector (SVG)** if possible, plus high-res PNG.
3. A **512×512 master** icon, and a **512×512 maskable** version (keep the mark inside a
   center safe-zone ≈ 80% / ~410px diameter, since launchers crop to a circle).
4. A **simplified 16–32px version** — fewer lines, bolder shapes — that still reads. This is
   the single most important constraint: detail that looks great at 512px turns to mud at 16px.
5. (Nice to have) a **wide social/OG card** using the same mark + the "Plate I." treatment.

## Constraints
- Must read at **16px**. Test by viewing your design shrunk way down.
- Keep it on-brand: warm, archival, restrained. Avoid glossy gradients, drop shadows, neon, or generic "leaf-in-a-circle app" clichés.
- A flat or two-tone version should exist for the smallest sizes; texture is for large sizes only.

---

### What happens next (my side — for your awareness)
I'll bring your artwork back into the codebase and generate the actual files
(`favicon.ico` 16/32/48, `apple-touch-icon.png` 180, `icon-192/512.png`,
`maskable-512.png`), write the `manifest.webmanifest`, add the `<link>`/`theme-color`
tags to `index.html`, and verify it in the browser. So you only need to produce the
**artwork + size variants**, not any code.
