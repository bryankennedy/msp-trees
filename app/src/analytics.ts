// PostHog web analytics — shared init imported by every page entry (hexbin.ts,
// species.ts). The project key is read from VITE_POSTHOG_KEY at build time and
// baked into the client bundle; that key is public by design (it can only send
// events, not read data), so shipping it to the browser is expected. It still
// lives in .env (git-ignored) rather than in source, per repo secret hygiene.
//
// When the key is absent (e.g. a contributor without a .env), analytics is a
// silent no-op so local dev and the build keep working.
import posthog from "posthog-js";

const key = import.meta.env.VITE_POSTHOG_KEY;
// Use `||` (not `??`) so an empty VITE_POSTHOG_HOST="" in .env still falls back
// to the US host — an empty api_host makes PostHog send to the current origin.
const host = import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com";

if (key) {
  posthog.init(key, {
    api_host: host,
    // Multi-page app with real page loads, so PostHog's automatic pageview /
    // pageleave capture per navigation is exactly what web analytics wants.
    capture_pageview: true,
    capture_pageleave: true,
    // A public map has no logins; only create person profiles if we ever call
    // identify(). Keeps it anonymous-friendly and cheaper.
    person_profiles: "identified_only",
  });
} else if (import.meta.env.DEV) {
  console.warn("[analytics] VITE_POSTHOG_KEY not set — PostHog disabled.");
}

export default posthog;
