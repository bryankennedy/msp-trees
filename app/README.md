# Tree viewer web app

Vite + TypeScript + MapLibre GL JS app that renders the Saint Paul boulevard
trees. The home page (`/`) is the **hexbin** map (trees aggregated into a
dominant-genus hex grid that dissolves into individual specimens as you zoom);
`/species` is the species index / histogram. The retired dots and heatmap views
are kept under [`archive/`](archive/) but excluded from the build.

All commands below run from this `app/` directory.

## Prerequisites

- [Bun](https://bun.sh) (package manager + runner)
- Node.js LTS (for tooling parity)
- Install dependencies once: `bun install`

## Data

The map reads processed GeoJSON from `../data/processed/` (`trees.geojson` and
`trees.sample.geojson`), served at `/data/*` by the dev server. That directory is
git-ignored — generate it first with the pipeline in [`../scripts/`](../scripts/)
(`cd ../scripts && bun run extract`). Without it the map loads but shows no trees.

## Configuration (`.env`)

Runtime settings are read from the environment / a local `.env` (git-ignored).
Copy the template and edit:

```bash
cp .env.example .env
```

| Variable | Purpose | Default |
|----------|---------|---------|
| `MSP_TREES_PUBLIC` | `1` → bind `0.0.0.0:8000` (for an edge/reverse proxy). Unset → `127.0.0.1:5173`. | unset (local) |
| `MSP_TREES_TLS` | `1` → load the self-signed cert from `.certs/` for local HTTPS. | unset |
| `MSP_TREES_ALLOWED_HOST` | Comma-separated public/proxied hostname(s) to accept (Vite DNS-rebinding check). | none |

> For the public deployment, `MSP_TREES_ALLOWED_HOST` **must** be set to the
> public hostname or proxied requests get HTTP 403.

## Run locally

```bash
bun run dev        # http://127.0.0.1:5173
```

`bun run build` produces a production build in `dist/`; `bun run preview` serves it.

## Run publicly (one-off)

```bash
MSP_TREES_PUBLIC=1 bun run dev     # http://0.0.0.0:8000
```

This is session-scoped — it stops when the shell/session ends. For a server that
**survives logout and reboot**, use the systemd service below.

## Keep it running (systemd user service)

A user unit at `~/.config/systemd/user/msp-trees.service` runs the app in public
mode on port `:8000`, restarts it on failure, and logs to
`../outputs/msp-trees.log`.

> **Run these from your own SSH login shell.** `systemctl --user` needs the user
> session D-Bus, which non-interactive/automation shells don't have (you'll see
> `Failed to connect to bus: No medium found`).

**Start it and enable it at boot:**

```bash
systemctl --user daemon-reload
systemctl --user enable --now msp-trees.service   # start now + on login
loginctl enable-linger "$USER"                    # also start at boot, without a login session
```

**Day-to-day:**

```bash
systemctl --user status  msp-trees.service        # is it running?
systemctl --user restart msp-trees.service        # restart (e.g. after code/.env changes)
systemctl --user stop    msp-trees.service        # stop
systemctl --user disable msp-trees.service        # don't start on login anymore
journalctl --user -u msp-trees.service -f         # follow service logs
tail -f ../outputs/msp-trees.log                  # or the app's own stdout/stderr log
```

If you edit `msp-trees.service`, run `systemctl --user daemon-reload` then
`restart`.

## How it's served

The edge layer dials port `:8000` on the host; the systemd service answers there
directly (Vite in `MSP_TREES_PUBLIC=1` mode). An nginx vhost
(`/etc/nginx/sites-available/msp-trees`) exists as an alternative front but is
**not enabled** and not part of the live path.

## Routes

- `/` — hexbin map (default)
- `/species` — species index / histogram
- `/hexbin`, `/heatmap` — 308-redirect to `/` (archived views)
