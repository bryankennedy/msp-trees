// Pages Function: serve the full tree point set (~51 MB) from R2 at
// /data/trees.geojson. Every other /data/* path is a static Pages asset; only
// this file exceeds the 25 MiB Pages asset limit, so it lives in the
// msp-trees-data R2 bucket (binding TREES_DATA, see ../../wrangler.toml) and is
// streamed here. The client fetches the whole file once (see
// app/src/overview-common.ts), so no Range handling is needed; the edge cache
// keeps repeat loads off R2.
export async function onRequestGet({ request, env, waitUntil }) {
  const KEY = "trees.geojson";

  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).toString(), { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const object = await env.TREES_DATA.get(KEY);
  if (!object || !object.body) {
    return new Response("trees.geojson not found in R2", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", "application/geo+json");
  headers.set("ETag", object.httpEtag);
  // Immutable-ish: the pipeline rewrites this on a full re-extract, which we
  // treat as a new deploy. A day at the browser, a week at the edge.
  headers.set("Cache-Control", "public, max-age=86400, s-maxage=604800");

  const response = new Response(object.body, { headers });
  waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
