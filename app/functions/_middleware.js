// Pages middleware: canonical-host redirect. Runs ahead of every request
// (static assets and Functions alike). Cloudflare Pages `_redirects` does NOT
// reliably match on hostname — only on path — so the www → apex 301 lives here
// instead. Matches www explicitly (not "anything but apex") so the *.pages.dev
// preview URLs keep working for testing.
export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.hostname === "www.msptrees.com") {
    url.hostname = "msptrees.com";
    return Response.redirect(url.toString(), 301);
  }
  return context.next();
}
