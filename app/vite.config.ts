import { defineConfig, loadEnv } from "vite";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const CERT_DIR = resolve(__dirname, ".certs");
const KEY_PATH = resolve(CERT_DIR, "dev-key.pem");
const CRT_PATH = resolve(CERT_DIR, "dev-cert.pem");

// Serve the data pipeline output under /data/* without copying files. The
// processed GeoJSON lives at <repo>/data/processed/ and is git-ignored.
const DATA_DIR = resolve(__dirname, "..", "data", "processed");

// Runtime config comes from the environment / a local .env (see .env.example):
//   MSP_TREES_PUBLIC=1     → bind 0.0.0.0:8000 (an edge layer terminates TLS +
//                            auth); unset → 127.0.0.1:5173 (dev default).
//   MSP_TREES_TLS=1        → also load the self-signed cert from .certs/.
//   MSP_TREES_ALLOWED_HOST → comma-separated public/proxied hostname(s) to
//                            accept. Keeps the deployment hostname out of source.
export default defineConfig(({ mode }) => {
  // Merge .env files with the real process environment. Prefix "" loads all
  // keys (not just VITE_*); these are used server-side only and are never
  // injected into the client bundle.
  const env = loadEnv(mode, __dirname, "");
  const publicMode = env.MSP_TREES_PUBLIC === "1";
  const wantsTls = env.MSP_TREES_TLS === "1";

  const https =
    wantsTls && existsSync(KEY_PATH) && existsSync(CRT_PATH)
      ? { key: readFileSync(KEY_PATH), cert: readFileSync(CRT_PATH) }
      : undefined;

  // localhost is always allowed; add public/proxied hostname(s) via
  // MSP_TREES_ALLOWED_HOST so a reverse proxy's forwarded Host header isn't
  // rejected (HTTP 403) by Vite's DNS-rebinding protection.
  const extraHosts = (env.MSP_TREES_ALLOWED_HOST ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);

  return {
    root: __dirname,
    appType: "mpa",
    build: {
      rollupOptions: {
        input: {
          // index.html is the hexbin map (the default route); species.html is the
          // species index / histogram. The former dots + heatmap plates are kept
          // under archive/ and intentionally excluded from the build.
          main: resolve(__dirname, "index.html"),
          species: resolve(__dirname, "species.html"),
        },
      },
    },
    server: {
      host: publicMode ? "0.0.0.0" : "127.0.0.1",
      port: publicMode ? 8000 : 5173,
      strictPort: true,
      https,
      allowedHosts: ["localhost", "127.0.0.1", ...extraHosts],
      fs: { allow: [resolve(__dirname, ".."), __dirname] },
    },
    preview: {
      host: publicMode ? "0.0.0.0" : "127.0.0.1",
      port: publicMode ? 8000 : 5173,
      strictPort: true,
      https,
    },
    plugins: [
      {
        // Clean URLs: serve /species (with or without a trailing slash) from
        // species.html in both the dev and preview servers. Installed in the
        // configure*Server body (not the returned hook) so it runs before Vite's
        // own html-serving middleware.
        name: "clean-urls",
        configureServer(server) {
          server.middlewares.use(rewriteCleanUrls);
        },
        configurePreviewServer(server) {
          server.middlewares.use(rewriteCleanUrls);
        },
      },
      {
        name: "serve-processed-data",
        configureServer(server) {
          server.middlewares.use("/data", (req, res, next) => {
            const url = (req.url ?? "/").split("?")[0];
            if (!url || url === "/") return next();
            const safe = url.replace(/\.\.+/g, "");
            const file = resolve(DATA_DIR, "." + safe);
            if (!file.startsWith(DATA_DIR) || !existsSync(file)) return next();
            res.setHeader("Content-Type", "application/geo+json");
            res.setHeader("Cache-Control", "public, max-age=60");
            readFileAndStream(file, res);
          });
        },
      },
    ],
  };
});

// Clean-URL routes → their HTML entry point (trailing slash optional).
const CLEAN_URLS: Record<string, string> = {
  "/species": "/species.html",
};

// The dots + heatmap plates were archived and the hexbin view became the home
// page; redirect the old map routes to "/" so existing links don't 404.
const REDIRECTS: Record<string, string> = {
  "/hexbin": "/",
  "/heatmap": "/",
};

function rewriteCleanUrls(
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse,
  next: (err?: unknown) => void,
) {
  const path = (req.url ?? "/").split("?")[0].replace(/\/$/, "");
  if (REDIRECTS[path]) {
    res.statusCode = 308;
    res.setHeader("Location", REDIRECTS[path]);
    res.end();
    return;
  }
  const target = CLEAN_URLS[path];
  if (target) {
    const query = req.url!.includes("?") ? req.url!.slice(req.url!.indexOf("?")) : "";
    req.url = target + query;
  }
  next();
}

function readFileAndStream(file: string, res: import("node:http").ServerResponse) {
  import("node:fs").then(({ createReadStream }) => {
    createReadStream(file).on("error", () => {
      res.statusCode = 500;
      res.end("read error");
    }).pipe(res);
  });
}
