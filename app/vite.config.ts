import { defineConfig } from "vite";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// MSP_TREES_PUBLIC=1  → bind 0.0.0.0:8000 over HTTP. The user's edge layer
//                       handles TLS + auth on the public hostname.
// MSP_TREES_TLS=1     → additionally load the self-signed cert from .certs/
//                       (only useful if you're bypassing the edge entirely).
// (unset)             → bind 127.0.0.1:5173 over HTTP (dev default).
const publicMode = process.env.MSP_TREES_PUBLIC === "1";
const wantsTls = process.env.MSP_TREES_TLS === "1";

const CERT_DIR = resolve(__dirname, ".certs");
const KEY_PATH = resolve(CERT_DIR, "dev-key.pem");
const CRT_PATH = resolve(CERT_DIR, "dev-cert.pem");
const https =
  wantsTls && existsSync(KEY_PATH) && existsSync(CRT_PATH)
    ? { key: readFileSync(KEY_PATH), cert: readFileSync(CRT_PATH) }
    : undefined;

// Serve the data pipeline output under /data/* without copying files. The
// processed GeoJSON lives at <repo>/data/processed/ and is git-ignored.
const DATA_DIR = resolve(__dirname, "..", "data", "processed");

export default defineConfig({
  root: __dirname,
  appType: "mpa",
  build: {
    rollupOptions: {
      input: {
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
    // Nginx-forwarded requests arrive with the public Host header
    // (msp-trees.exe.xyz). Allow it explicitly so Vite's DNS-rebinding
    // protection doesn't reject them with HTTP 403.
    allowedHosts: ["msp-trees.exe.xyz", "localhost", "127.0.0.1"],
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
      // Clean URL: serve /species (and /species/) from species.html in both the
      // dev and preview servers. Installed in the configure*Server body (not the
      // returned hook) so it runs before Vite's own html-serving middleware.
      name: "species-clean-url",
      configureServer(server) {
        server.middlewares.use(rewriteSpecies);
      },
      configurePreviewServer(server) {
        server.middlewares.use(rewriteSpecies);
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
});

function rewriteSpecies(
  req: import("node:http").IncomingMessage,
  _res: import("node:http").ServerResponse,
  next: (err?: unknown) => void,
) {
  const path = (req.url ?? "/").split("?")[0];
  if (path === "/species" || path === "/species/") {
    req.url = "/species.html" + (req.url!.includes("?") ? req.url!.slice(req.url!.indexOf("?")) : "");
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
