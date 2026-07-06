# Decisions

Architecture and process decisions. Each entry is keyed to its issue (e.g.
`MSPT-2`), not a global running number, so parallel work doesn't collide. Append
new entries at the end.

### MSPT-2 — GitHub Actions auto-deploy to Cloudflare Pages

**Context.** Every push to `main` should deploy the site to Cloudflare, matching
the setup in the Progress app.

**Decision.**

- A single `.github/workflows/ci.yml` with a `test` gate (typecheck) and a
  `deploy` job that runs only on push to `main`, only after `test` passes.
- Deploy uses **GitHub Actions driving `wrangler`** with an API token — not
  Cloudflare's Pages Git integration — because the repo is hosted on a
  self-hosted GitHub-compatible host the Cloudflare GitHub App can't reach.
- Wrangler is run **under Node, never Bun**: `bunx wrangler` silently fails Pages
  uploads. The deploy job pins Node LTS via `setup-node`, and the deploy script
  spawns wrangler's bin (node shebang) so it always executes under Node.
- CI deploys **app-only** (`build → stage data → pages`, the new `deploy:cf app`
  step). The 51 MB `trees.geojson` in R2 changes only on a full data re-extract
  and is uploaded manually with `deploy:cf r2`, so CI never re-ships 51 MB on a
  routine commit.
- The three small pre-aggregated files (`hexbin.geojson`, `species-counts.json`,
  `trees.sample.geojson`, ~4.2 MB total) are **committed to the repo**, overriding
  the default "derived data isn't source-controlled" rule. They're small, stable
  build inputs the Pages deploy must include; committing them makes every CI build
  reproducible from a clean checkout with zero extra fetch/re-extract work — the
  fastest and least fragile option.

**Secrets** (repo → Settings → Secrets and variables → Actions):
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

**Branch protection.** Protect `main`: require the `test` status check to pass
before merge, require a PR (no direct pushes), and require branches to be up to
date. This keeps a red typecheck from ever reaching the `deploy` job.
