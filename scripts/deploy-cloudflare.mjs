// Deploy the msp-trees site to Cloudflare Pages + R2.
//
// Pipeline (run all with `bun run deploy:cf`, or a single step with an arg):
//   build   → vite build (app/dist)
//   data    → stage the small pre-aggregated files into app/dist/data
//   r2      → upload the 51 MB trees.geojson to the msp-trees-data R2 bucket
//   pages   → wrangler pages deploy app/dist  (applies wrangler.toml + Functions)
//   domains → attach msptrees.com + www.msptrees.com as custom domains
//   app     → build → data → pages   (CI / app-only deploy; skips the R2 upload)
//   all     → build → data → r2 → pages   (default; `domains` is a one-time step)
//
// Secrets: CLOUDFLARE_API_TOKEN is loaded with dotenv from app/.env (git-ignored,
// per global rules) and passed to wrangler via the environment — never inlined.
// CLOUDFLARE_ACCOUNT_ID is optional here (wrangler infers it from a single-account
// token) but honored if present.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const APP = resolve(ROOT, "app");
const DIST = resolve(APP, "dist");
const PROCESSED = resolve(ROOT, "data", "processed");

// Wrangler must run under Node — it explicitly does NOT support the Bun runtime
// (`bunx wrangler` silently fails Pages uploads). We pin wrangler in this
// package (scripts/node_modules) and run its bin with a Node-bearing PATH. The
// local Node LTS lives at ~/.local/node/bin (see scripts/README.md).
const WRANGLER_BIN = resolve(__dirname, "node_modules", ".bin", "wrangler");
const NODE_BIN_DIR = resolve(homedir(), ".local", "node", "bin");
const PATH_WITH_NODE = `${NODE_BIN_DIR}:${process.env.PATH ?? ""}`;

// Load app/.env so CLOUDFLARE_API_TOKEN (and optional CLOUDFLARE_ACCOUNT_ID) are
// available to wrangler. app/.env is the project's single secrets file.
dotenv.config({ path: resolve(APP, ".env") });

const PROJECT = "msp-trees";
const BUCKET = "msp-trees-data";
const R2_KEY = "trees.geojson";
const ZONE = "msptrees.com";
const APEX = "msptrees.com";
const WWW = "www.msptrees.com";

// Small files that ship as static Pages assets under /data/*. The big
// trees.geojson is intentionally excluded — it goes to R2 (see `r2` step).
const STATIC_DATA = ["hexbin.geojson", "species-counts.json", "trees.sample.geojson"];

const die = (msg) => {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
};

function requireToken() {
  if (!process.env.CLOUDFLARE_API_TOKEN) {
    die(
      "CLOUDFLARE_API_TOKEN is not set. Add it to app/.env (git-ignored):\n" +
        "    CLOUDFLARE_API_TOKEN=your_scoped_token\n" +
        "Create one at https://dash.cloudflare.com/profile/api-tokens with the\n" +
        "scopes documented in scripts/README.md.",
    );
  }
}

// Run wrangler with the loaded credentials, streaming output. `cwd` defaults to
// app/ so wrangler.toml and functions/ are discovered. `soft:true` returns the
// exit status instead of aborting (used for idempotent create-if-missing steps).
function wrangler(args, { cwd = APP, soft = false } = {}) {
  console.log(`\n$ wrangler ${args.join(" ")}`);
  const res = spawnSync(WRANGLER_BIN, args, {
    cwd,
    stdio: "inherit",
    // Wrangler's shebang is `#!/usr/bin/env node`; prepend Node LTS to PATH so
    // it resolves. CLOUDFLARE_API_TOKEN / _ACCOUNT_ID ride along from dotenv.
    env: { ...process.env, PATH: PATH_WITH_NODE },
  });
  if (res.status !== 0 && !soft) die(`wrangler ${args[0]} failed (exit ${res.status}).`);
  return res.status ?? 1;
}

// Create the Pages project if it doesn't already exist. A repeat create returns
// non-zero ("project already exists"), which we tolerate.
function ensureProject() {
  wrangler(
    ["pages", "project", "create", PROJECT, "--production-branch=main"],
    { soft: true },
  );
}

function run(cmd, args, cwd) {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);
  const res = spawnSync(cmd, args, { cwd, stdio: "inherit", env: process.env });
  if (res.status !== 0) die(`${cmd} ${args[0]} failed (exit ${res.status}).`);
}

// --- Cloudflare REST API -----------------------------------------------------
// Pages custom-domain management and DNS have no wrangler subcommand in v4, so
// the `domains` step drives the API directly. The token needs Pages Edit (for
// the domain attach) plus Zone Read + DNS Edit on the msptrees.com zone.
const CF_API = "https://api.cloudflare.com/client/v4";

async function cf(path, { method = "GET", body } = {}) {
  requireToken();
  const res = await fetch(`${CF_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!json.success) {
    const errs = (json.errors ?? []).map((e) => `${e.code} ${e.message}`).join("; ");
    die(`Cloudflare API ${method} ${path} failed: ${errs || res.status}`);
  }
  return json.result;
}

const fmtMB = (bytes) => `${(bytes / 1_048_576).toFixed(1)} MB`;

function stepBuild() {
  console.log("\n▶ build — vite build");
  run("bunx", ["vite", "build"], APP);
}

function stepData() {
  console.log("\n▶ data — staging pre-aggregated files into dist/data");
  if (!existsSync(DIST)) die("dist/ missing — run the build step first.");
  const dataDir = resolve(DIST, "data");
  mkdirSync(dataDir, { recursive: true });
  for (const name of STATIC_DATA) {
    const src = resolve(PROCESSED, name);
    if (!existsSync(src)) die(`missing ${src} — run the extract pipeline first.`);
    copyFileSync(src, resolve(dataDir, name));
    console.log(`  + data/${name} (${fmtMB(statSync(src).size)})`);
  }
}

function stepR2() {
  console.log("\n▶ r2 — uploading trees.geojson to R2");
  requireToken();
  const src = resolve(PROCESSED, R2_KEY);
  if (!existsSync(src)) die(`missing ${src} — run the extract pipeline first.`);
  console.log(`  ${R2_KEY} is ${fmtMB(statSync(src).size)} — this upload can take a minute.`);
  wrangler([
    "r2",
    "object",
    "put",
    `${BUCKET}/${R2_KEY}`,
    `--file=${src}`,
    "--content-type=application/geo+json",
    "--remote",
  ]);
}

function stepPages() {
  console.log("\n▶ pages — deploying to Cloudflare Pages");
  requireToken();
  if (!existsSync(resolve(DIST, "index.html"))) die("dist/index.html missing — build first.");
  ensureProject();
  wrangler(["pages", "deploy", "dist", `--project-name=${PROJECT}`]);
}

async function stepDomains() {
  console.log("\n▶ domains — attaching custom domains + repointing DNS (one-time)");
  requireToken();
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!account) die("CLOUDFLARE_ACCOUNT_ID is required for the domains step (add it to app/.env).");

  // Resolve the zone once.
  const zones = await cf(`/zones?name=${ZONE}`);
  if (!zones.length) die(`zone ${ZONE} not found (does the token have Zone:Read on it?).`);
  const zoneId = zones[0].id;
  const records = await cf(`/zones/${zoneId}/dns_records?per_page=100`);

  for (const name of [APEX, WWW]) {
    // 1. Register the custom domain on the Pages project (idempotent: a repeat
    //    attach returns an already-exists error we tolerate).
    const attach = await fetch(
      `${CF_API}/accounts/${account}/pages/projects/${PROJECT}/domains`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      },
    ).then((r) => r.json());
    console.log(`  ${name}: attach → ${attach.success ? attach.result.status : "already attached"}`);

    // 2. Point a proxied CNAME at the Pages subdomain (update in place if a
    //    record already exists, else create).
    const existing = records.find((r) => r.name === name);
    const desired = { type: "CNAME", name, content: `${PROJECT}.pages.dev`, proxied: true };
    if (existing) {
      await cf(`/zones/${zoneId}/dns_records/${existing.id}`, { method: "PATCH", body: desired });
    } else {
      await cf(`/zones/${zoneId}/dns_records`, { method: "POST", body: { ...desired, ttl: 1 } });
    }
    console.log(`  ${name}: DNS → ${PROJECT}.pages.dev (proxied)`);
  }
  console.log(`\n  ${APEX} + ${WWW} live on Pages; www → apex handled by dist/_redirects.`);
}

const STEPS = {
  build: stepBuild,
  data: stepData,
  r2: stepR2,
  pages: stepPages,
  domains: stepDomains,
};

const arg = process.argv[2] ?? "all";
if (arg === "all") {
  stepBuild();
  stepData();
  stepR2();
  stepPages();
  console.log(
    `\n✔ Deployed. If custom domains aren't attached yet, run:  bun run deploy:cf domains`,
  );
} else if (arg === "app") {
  // CI / app-only deploy: build → stage the committed pre-aggregated files →
  // Pages. Deliberately skips the `r2` step: the 51 MB trees.geojson changes
  // only on a full data re-extract and is uploaded manually with `deploy:cf r2`,
  // so it isn't re-shipped on every push to main.
  stepBuild();
  stepData();
  stepPages();
  console.log("\n✔ App deployed to Pages (R2 point set left untouched).");
} else if (STEPS[arg]) {
  await STEPS[arg]();
  console.log("\n✔ done");
} else {
  die(`unknown step "${arg}". Use one of: ${Object.keys(STEPS).join(", ")}, all`);
}
