#!/usr/bin/env bun
// Phone-viewport screenshot harness for the MSP Trees mobile audit skill.
//
// Renders each app route at real phone viewports with TOUCH emulation and a
// device pixel ratio, waits for the tree dataset to stream in (the map page
// swaps a 10k sample for the full ~167k-point layer — see the
// `browser-verification` project memory), then writes PNGs you read back to
// grade the mobile layout. Also forwards `console` + `pageerror`, because
// MapLibre paint-expression bugs only fail at runtime, never in `tsc`/`build`.
//
// Run from app/ (so the dev server is reachable):
//   cd app && bun run ../.claude/skills/mobile-audit/screenshot-mobile.mjs
//
// Env:
//   BASE_URL   default http://127.0.0.1:5173  (use http://127.0.0.1:8000 for the systemd unit)
//   OUT_DIR    where PNGs go (default: the session scratchpad, else ./mobile-audit-shots)
//   THROTTLE   "1" → apply a Slow-3G-ish network profile via CDP (low-bandwidth pass)

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:5173";
const OUT_DIR = resolve(
  process.env.OUT_DIR ??
    process.env.CLAUDE_SCRATCHPAD_DIR ??
    "./mobile-audit-shots",
);
const THROTTLE = process.env.THROTTLE === "1";

// Real phone viewports. deviceScaleFactor + isMobile + hasTouch make Chromium
// emulate the device, not just a narrow window (matters for touch targets and
// media queries that key off pointer/coarse via touch).
const DEVICES = [
  { name: "iphone-se", width: 375, height: 667, dsf: 2 },
  { name: "iphone-14-pro", width: 393, height: 852, dsf: 3 },
  { name: "pixel-7", width: 412, height: 915, dsf: 2.625 },
];

const ROUTES = [
  { name: "map", path: "/" },
  { name: "species", path: "/species" },
];

// Rough Slow-3G profile (bytes/s + latency) applied per-page via CDP.
const SLOW_3G = {
  offline: false,
  downloadThroughput: (500 * 1024) / 8,
  uploadThroughput: (500 * 1024) / 8,
  latency: 400,
};

async function waitForData(page, route) {
  // Map: #tree-count fills from the sample first, then the full dataset — wait
  // until it shows 6 digits so we screenshot the streamed-in state. Species:
  // #report-body un-hides once the tally renders.
  try {
    if (route.name === "map") {
      // The count renders formatted ("167,191"), so strip separators before
      // checking for the full 6-digit dataset (the 10k sample loads first).
      await page.waitForFunction(
        () =>
          (document.querySelector("#tree-count")?.textContent ?? "").replace(/\D/g, "")
            .length >= 6,
        { timeout: 45000 },
      );
      await page.waitForTimeout(2500); // let basemap tiles paint
    } else {
      await page.waitForSelector("#report-body:not([hidden])", { timeout: 30000 });
      await page.waitForTimeout(500);
    }
  } catch {
    console.warn(`  [warn] ${route.name}: data wait timed out — shooting current state`);
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`base: ${BASE_URL}`);
  console.log(`out:  ${OUT_DIR}`);
  if (THROTTLE) console.log("network: Slow-3G emulation ON");

  // Headless Chromium on this VM has no real GPU; MapLibre needs WebGL, so fall
  // back to the SwiftShader software rasteriser or the map fails to compile its
  // shaders ("Could not compile fragment shader") and never renders.
  const browser = await chromium.launch({
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
    ],
  });
  const results = [];

  for (const device of DEVICES) {
    const context = await browser.newContext({
      viewport: { width: device.width, height: device.height },
      deviceScaleFactor: device.dsf,
      isMobile: true,
      hasTouch: true,
    });

    for (const route of ROUTES) {
      const page = await context.newPage();
      const problems = [];
      page.on("console", (m) => {
        if (m.type() === "error") problems.push(`console.error: ${m.text()}`);
      });
      page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));

      if (THROTTLE) {
        const cdp = await context.newCDPSession(page);
        await cdp.send("Network.emulateNetworkConditions", SLOW_3G);
      }

      const url = BASE_URL + route.path;
      process.stdout.write(`${device.name} ${route.name} … `);
      const started = Date.now();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      await waitForData(page, route);
      const elapsed = Date.now() - started;

      const file = resolve(OUT_DIR, `${device.name}-${route.name}.png`);
      await page.screenshot({ path: file, fullPage: route.name === "species" });
      console.log(`${elapsed} ms → ${file}${problems.length ? `  [${problems.length} runtime error(s)]` : ""}`);
      problems.forEach((p) => console.log(`    ! ${p}`));

      results.push({ device: device.name, route: route.name, ms: elapsed, problems });
      await page.close();
    }
    await context.close();
  }

  await browser.close();

  const errs = results.reduce((n, r) => n + r.problems.length, 0);
  console.log(`\ndone — ${results.length} shots, ${errs} runtime error(s).`);
  console.log("Read the PNGs back to grade layout, touch targets, safe areas, and space usage.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
