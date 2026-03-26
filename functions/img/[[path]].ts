/**
 * ═══════════════════════════════════════════════════════════════════
 * Cloudflare Pages Function — Image Proxy / R2 + Edge Cache
 * ═══════════════════════════════════════════════════════════════════
 *
 * Serves images with a two-tier strategy:
 *  1. Cloudflare edge cache (instant, ~20ms)
 *  2. R2 bucket (when available — low-latency object storage)
 *  3. Supabase Storage fallback (origin, ~150ms)
 *
 * When R2 is enabled, images are served from R2 and lazily migrated
 * from Supabase on first access (read-through cache pattern).
 *
 * Routing:
 *   /img/{bucket}/{path}                → R2 or Supabase
 *   /img/{bucket}/{path}?width=X&...    → Supabase render (resizing)
 *
 * Only GET is allowed. Responses are cached 30 days at the edge.
 */

interface R2Bucket {
  get(key: string): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string } } | null>;
  put(key: string, body: ReadableStream | ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }): Promise<void>;
}

export async function onRequest(context: {
  request: Request;
  env: Record<string, unknown> & { IMAGES?: R2Bucket };
  params: { path?: string | string[] };
  waitUntil: (p: Promise<unknown>) => void;
}) {
  var { request, env, params } = context;

  // Only GET for images
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  var url = new URL(request.url);
  var pathSegments = params.path;
  var path = Array.isArray(pathSegments) ? pathSegments.join("/") : (pathSegments || "");

  if (!path) {
    return new Response("Not Found", { status: 404 });
  }

  // ── Check Cloudflare edge cache ───────────────────────────────
  var cache = caches.default;
  var cacheKeyReq = new Request(url.toString(), { method: "GET" });
  var cached = await cache.match(cacheKeyReq);
  if (cached) return cached;

  var supabaseUrl = (env.SUPABASE_URL as string) || "https://aztdgagxvrlylszieujs.supabase.co";
  var r2 = env.IMAGES || null;
  var hasTransform = url.searchParams.has("width");

  // ── Try R2 first (only for non-transformed images) ────────────
  // Transformed images (resize) always go to Supabase render endpoint
  if (r2 && !hasTransform) {
    try {
      var r2Obj = await r2.get(path);
      if (r2Obj) {
        var r2Headers = new Headers();
        r2Headers.set("Content-Type", r2Obj.httpMetadata?.contentType || "image/webp");
        r2Headers.set("Cache-Control", "public, max-age=2592000, s-maxage=2592000, immutable");
        r2Headers.set("X-Content-Type-Options", "nosniff");
        r2Headers.set("X-Source", "r2");

        var r2Response = new Response(r2Obj.body, { status: 200, headers: r2Headers });
        context.waitUntil(cache.put(cacheKeyReq, r2Response.clone()));
        return r2Response;
      }
    } catch (_e) {
      // R2 error — fall through to Supabase
    }
  }

  // ── Fetch from Supabase Storage (origin) ──────────────────────
  var targetUrl: string;
  if (hasTransform) {
    // Transformed image → render endpoint (server-side resize)
    targetUrl = supabaseUrl + "/storage/v1/render/image/public/" + path + url.search;
  } else {
    // Original image → object endpoint
    targetUrl = supabaseUrl + "/storage/v1/object/public/" + path;
  }

  var resp = await fetch(targetUrl, {
    headers: { "Accept": request.headers.get("Accept") || "image/*" },
  });

  if (!resp.ok) {
    return new Response(resp.body, { status: resp.status, headers: resp.headers });
  }

  // ── Lazily migrate to R2 (read-through pattern) ───────────────
  // If R2 is available and this is a non-transformed image,
  // store a copy in R2 so future requests are served from R2.
  if (r2 && !hasTransform) {
    var contentType = resp.headers.get("Content-Type") || "image/webp";
    // Clone the response body so we can both serve it and store it
    var [streamForResponse, streamForR2] = resp.body!.tee();

    // Fire-and-forget: store in R2
    context.waitUntil(
      new Response(streamForR2).arrayBuffer().then(function (buf) {
        return r2!.put(path, buf, {
          httpMetadata: { contentType: contentType },
        });
      }).catch(function () { /* ignore R2 write errors */ })
    );

    // Build cached response from the first stream
    var outHeaders = new Headers(resp.headers);
    outHeaders.set("Cache-Control", "public, max-age=2592000, s-maxage=2592000, immutable");
    outHeaders.set("X-Content-Type-Options", "nosniff");
    outHeaders.set("X-Source", "supabase+r2-migrate");
    outHeaders.delete("server");

    var cachedResponse = new Response(streamForResponse, {
      status: 200,
      headers: outHeaders,
    });
    context.waitUntil(cache.put(cacheKeyReq, cachedResponse.clone()));
    return cachedResponse;
  }

  // ── Build cached response (no R2 available) ───────────────────
  var outHeaders2 = new Headers(resp.headers);
  outHeaders2.set("Cache-Control", "public, max-age=2592000, s-maxage=2592000, immutable");
  outHeaders2.set("X-Content-Type-Options", "nosniff");
  outHeaders2.set("X-Source", "supabase");
  outHeaders2.delete("server");

  var cachedResponse2 = new Response(resp.body, {
    status: 200,
    headers: outHeaders2,
  });

  // Store in edge cache (fire-and-forget)
  context.waitUntil(cache.put(cacheKeyReq, cachedResponse2.clone()));

  return cachedResponse2;
}
