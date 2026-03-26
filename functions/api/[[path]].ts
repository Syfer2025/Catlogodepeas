/**
 * ═══════════════════════════════════════════════════════════════════
 * Cloudflare Pages Function — API Gateway + KV Edge Cache
 * ═══════════════════════════════════════════════════════════════════
 *
 * Proxies /api/* to the Supabase Edge Function, adding:
 *  - KV edge cache for static/semi-static GET endpoints
 *  - Automatic cache invalidation on admin mutations
 *  - Rate limiting per IP (auth: 10/min, POST: 60/min, global: 300/min)
 *  - Security headers (strips server info, adds nosniff/DENY)
 *  - X-Forwarded-For / X-Real-IP for real client IP on the server
 *
 * Route: /api/<anything> → Supabase Edge Function /<anything>
 */

// ── Cacheable routes and their TTLs (seconds) ────────────────────
// These are public GET endpoints that return data which changes
// infrequently. TTLs are tuned per route based on change frequency.
var CACHE_RULES: Array<{ prefix: string; ttl: number; tag: string }> = [
  // High-stability data (changes daily or less)
  { prefix: "category-tree",          ttl: 86400,  tag: "categories" },   // 24h
  { prefix: "brands",                 ttl: 604800, tag: "brands" },       // 7 days
  { prefix: "settings",               ttl: 21600,  tag: "settings" },     // 6h
  { prefix: "price-config",           ttl: 21600,  tag: "settings" },     // 6h
  { prefix: "footer-badges",          ttl: 604800, tag: "settings" },     // 7 days
  { prefix: "branches",               ttl: 604800, tag: "branches" },     // 7 days
  { prefix: "faq",                    ttl: 86400,  tag: "faq" },          // 24h
  { prefix: "about",                  ttl: 86400,  tag: "about" },        // 24h
  { prefix: "warranty",               ttl: 86400,  tag: "warranty" },     // 24h
  // Medium-stability data (changes a few times per day)
  { prefix: "banners",                ttl: 21600,  tag: "banners" },      // 6h
  { prefix: "homepage-categories",    ttl: 21600,  tag: "categories" },   // 6h
  { prefix: "homepage",               ttl: 300,    tag: "homepage" },     // 5min
  { prefix: "super-promo",            ttl: 3600,   tag: "promo" },        // 1h
  { prefix: "mid-banners",            ttl: 21600,  tag: "banners" },      // 6h
  { prefix: "reels",                  ttl: 3600,   tag: "reels" },        // 1h
  { prefix: "influencers",            ttl: 3600,   tag: "influencers" },  // 1h
  // Lower-stability (cache briefly to absorb traffic spikes)
  { prefix: "coupons/public",         ttl: 300,    tag: "coupons" },      // 5min
  { prefix: "produtos/destaques",     ttl: 300,    tag: "products" },     // 5min
  { prefix: "products",               ttl: 120,    tag: "products" },     // 2min
];

// ── Admin mutation routes that invalidate cache tags ─────────────
// When an admin POST/PUT/DELETE hits one of these prefixes,
// all KV entries with the matching tag are purged.
var INVALIDATION_MAP: Record<string, string[]> = {
  "admin/banners":              ["banners", "homepage"],
  "admin/mid-banners":          ["banners", "homepage"],
  "admin/categories":           ["categories", "homepage"],
  "admin/homepage-categories":  ["categories", "homepage"],
  "admin/brands":               ["brands"],
  "admin/settings":             ["settings", "homepage"],
  "admin/super-promo":          ["promo", "homepage"],
  "admin/coupons":              ["coupons"],
  "admin/products":             ["products", "homepage"],
  "admin/reels":                ["reels"],
  "admin/influencers":          ["influencers"],
  "admin/faq":                  ["faq"],
  "admin/footer-badges":        ["settings"],
  "admin/branches":             ["branches"],
  "admin/warranty":             ["warranty"],
  // Product image uploads also invalidate product cache
  "produtos/imagens":           ["products"],
};

// ── In-memory rate limiting (per-isolate, best-effort) ──────────
var _limits = new Map<string, { count: number; reset: number }>();

function _allowed(key: string, max: number, windowSec: number): boolean {
  var now = Math.floor(Date.now() / 1000);
  var entry = _limits.get(key);
  if (!entry || now >= entry.reset) {
    _limits.set(key, { count: 1, reset: now + windowSec });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

// Periodically prune stale entries to avoid memory leak
var _lastPrune = Date.now();
function _prune() {
  if (Date.now() - _lastPrune < 60_000) return;
  _lastPrune = Date.now();
  var now = Math.floor(Date.now() / 1000);
  for (var [k, v] of _limits) {
    if (now >= v.reset) _limits.delete(k);
  }
}

function _tooMany(): Response {
  return new Response(
    JSON.stringify({ error: "Too many requests" }),
    { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "60" } }
  );
}

// ── KV helpers ──────────────────────────────────────────────────

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string }): Promise<{ keys: Array<{ name: string }> }>;
}

/** Build a deterministic cache key from the request path + query */
function cacheKey(path: string, search: string): string {
  return "api:" + path + (search || "");
}

/** Find the cache rule that matches a given path */
function matchCacheRule(path: string): { ttl: number; tag: string } | null {
  for (var i = 0; i < CACHE_RULES.length; i++) {
    if (path === CACHE_RULES[i].prefix || path.startsWith(CACHE_RULES[i].prefix + "/") || path.startsWith(CACHE_RULES[i].prefix + "?")) {
      return CACHE_RULES[i];
    }
  }
  return null;
}

/** Invalidate all KV entries that match the given tags */
async function invalidateByTags(kv: KVNamespace, tags: string[]): Promise<void> {
  // List all keys with the tag prefix and delete them
  var promises: Promise<void>[] = [];
  for (var t = 0; t < tags.length; t++) {
    var list = await kv.list({ prefix: "tag:" + tags[t] + ":" });
    for (var k = 0; k < list.keys.length; k++) {
      var apiKey = list.keys[k].name.replace("tag:" + tags[t] + ":", "");
      promises.push(kv.delete(apiKey));
      promises.push(kv.delete(list.keys[k].name));
    }
  }
  await Promise.all(promises);
}

// ── Main handler ────────────────────────────────────────────────
export async function onRequest(context: {
  request: Request;
  env: Record<string, unknown> & { CACHE?: KVNamespace };
  params: { path?: string | string[] };
  waitUntil: (p: Promise<unknown>) => void;
}) {
  var { request, env, params } = context;
  var url = new URL(request.url);
  var ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";

  _prune();

  // Rebuild the sub-path after /api/
  var pathSegments = params.path;
  var path = Array.isArray(pathSegments) ? pathSegments.join("/") : (pathSegments || "");

  // ── Rate limits ───────────────────────────────────────────────
  // Auth endpoints: strict 10 req/min
  if (path.startsWith("auth/")) {
    if (!_allowed("auth:" + ip, 10, 60)) return _tooMany();
  }
  // POST mutations: 60 req/min
  if (request.method === "POST") {
    if (!_allowed("post:" + ip, 60, 60)) return _tooMany();
  }
  // Global per-IP: 300 req/min
  if (!_allowed("all:" + ip, 300, 60)) return _tooMany();

  var kv = env.CACHE || null;

  // ── KV Cache: check for GET requests on cacheable routes ──────
  if (request.method === "GET" && kv) {
    var rule = matchCacheRule(path);
    if (rule) {
      var key = cacheKey(path, url.search);
      try {
        var cached = await kv.get(key);
        if (cached) {
          var parsed = JSON.parse(cached);
          return new Response(parsed.body, {
            status: parsed.status,
            headers: {
              "Content-Type": parsed.contentType || "application/json",
              "Cache-Control": "public, max-age=60, s-maxage=" + rule.ttl,
              "X-Cache": "HIT",
              "X-Cache-TTL": String(rule.ttl),
              "X-Content-Type-Options": "nosniff",
              "X-Frame-Options": "DENY",
              "Referrer-Policy": "strict-origin-when-cross-origin",
            },
          });
        }
      } catch (_e) {
        // KV error — fall through to origin
      }
    }
  }

  // ── KV Cache: invalidate on admin mutations ───────────────────
  if (request.method !== "GET" && request.method !== "HEAD" && kv) {
    for (var prefix in INVALIDATION_MAP) {
      if (path === prefix || path.startsWith(prefix + "/")) {
        var tagsToInvalidate = INVALIDATION_MAP[prefix];
        context.waitUntil(invalidateByTags(kv, tagsToInvalidate));
        break;
      }
    }
  }

  // ── Build Supabase target URL ─────────────────────────────────
  var supabaseUrl = (env.SUPABASE_URL as string) || "https://aztdgagxvrlylszieujs.supabase.co";
  var functionPath = (env.SUPABASE_FUNCTION_PATH as string) || "/functions/v1/make-server-b7b07654";
  var targetUrl = supabaseUrl + functionPath + "/" + path + url.search;

  // ── Forward request ───────────────────────────────────────────
  var fwdHeaders = new Headers(request.headers);
  fwdHeaders.delete("Host");
  fwdHeaders.set("X-Forwarded-For", ip);
  fwdHeaders.set("X-Real-IP", ip);

  try {
    var resp = await fetch(targetUrl, {
      method: request.method,
      headers: fwdHeaders,
      body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
    });

    var outHeaders = new Headers(resp.headers);
    // Security: strip server identity, add protective headers
    outHeaders.delete("server");
    outHeaders.delete("x-powered-by");
    outHeaders.set("X-Content-Type-Options", "nosniff");
    outHeaders.set("X-Frame-Options", "DENY");
    outHeaders.set("Referrer-Policy", "strict-origin-when-cross-origin");

    // ── KV Cache: store successful GET responses ──────────────
    if (request.method === "GET" && kv && resp.ok) {
      var rule2 = matchCacheRule(path);
      if (rule2) {
        var bodyText = await resp.text();
        var key2 = cacheKey(path, url.search);
        var contentType = resp.headers.get("Content-Type") || "application/json";
        var cacheEntry = JSON.stringify({
          body: bodyText,
          status: resp.status,
          contentType: contentType,
        });
        // Store the cache entry and a tag pointer (fire-and-forget)
        context.waitUntil(
          Promise.all([
            kv.put(key2, cacheEntry, { expirationTtl: rule2.ttl }),
            kv.put("tag:" + rule2.tag + ":" + key2, "1", { expirationTtl: rule2.ttl }),
          ])
        );
        outHeaders.set("X-Cache", "MISS");
        outHeaders.set("X-Cache-TTL", String(rule2.ttl));
        return new Response(bodyText, {
          status: resp.status,
          statusText: resp.statusText,
          headers: outHeaders,
        });
      }
    }

    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: outHeaders,
    });
  } catch (_e) {
    return new Response(
      JSON.stringify({ error: "Gateway error" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}
