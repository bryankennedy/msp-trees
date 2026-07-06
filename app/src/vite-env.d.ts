/// <reference types="vite/client" />

// Only VITE_-prefixed vars are exposed to client code by Vite. The server-side
// MSP_TREES_* vars live in vite.config.ts and are intentionally NOT declared
// here — they must never reach the browser bundle.
interface ImportMetaEnv {
  /** PostHog project API key (public `phc_…`, safe to ship to the client). */
  readonly VITE_POSTHOG_KEY?: string;
  /** PostHog ingestion host: the managed reverse proxy (https://v.msptrees.com) in
   *  production, else https://us.i.posthog.com (US) / https://eu.i.posthog.com (EU). */
  readonly VITE_POSTHOG_HOST?: string;
  /** PostHog app host for UI links/toolbar, needed when VITE_POSTHOG_HOST is a proxy.
   *  https://us.posthog.com (US) or https://eu.posthog.com (EU). */
  readonly VITE_POSTHOG_UI_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
