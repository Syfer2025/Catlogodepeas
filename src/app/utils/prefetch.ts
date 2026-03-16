/**
 * Route chunk prefetch utilities.
 *
 * Triggers dynamic import() of route chunks ahead of navigation.
 * The browser caches the module, so subsequent navigations are instant.
 * All prefetch calls are idempotent and fire-and-forget.
 */

var _prefetched: Record<string, boolean> = {};

function _once(key: string, fn: () => void) {
  if (_prefetched[key]) return;
  _prefetched[key] = true;
  fn();
}

/** Prefetch the ProductDetailPage chunk */
export function prefetchProductDetail() {
  _once("productDetail", function () {
    import("../pages/ProductDetailPage").catch(function () {});
  });
}

/** Prefetch the CatalogPage chunk */
export function prefetchCatalog() {
  _once("catalog", function () {
    import("../pages/CatalogPage").catch(function () {});
  });
}

/** Prefetch the CheckoutPage chunk */
export function prefetchCheckout() {
  _once("checkout", function () {
    import("../pages/CheckoutPage").catch(function () {});
  });
}

/** Prefetch the ContactPage chunk */
export function prefetchContact() {
  _once("contact", function () {
    import("../pages/ContactPage").catch(function () {});
  });
}

/** Prefetch the UserAuthPage chunk */
export function prefetchAuth() {
  _once("auth", function () {
    import("../pages/UserAuthPage").catch(function () {});
  });
}

/** Prefetch the UserAccountPage chunk */
export function prefetchAccount() {
  _once("account", function () {
    import("../pages/UserAccountPage").catch(function () {});
  });
}

// ═══════════════════════════════════════════════════════════════════════
// ─── DATA PREFETCH — Pre-loads product detail API data on hover ──────
// ═══════════════════════════════════════════════════════════════════════
// When a user hovers over a ProductCard, we fire a background request
// to /produto-detail-init/:sku. The result is cached in-memory so the
// ProductDetailPage can consume it instantly without a redundant call.
// Each SKU is fetched at most once. A 200ms delay prevents prefetch
// on fast scroll-throughs.

var _dataCache: Record<string, { data: any; fetchedAt: number }> = {};
var _dataInFlight: Record<string, boolean> = {};
var _hoverTimers: Record<string, ReturnType<typeof setTimeout>> = {};
var DATA_CACHE_TTL = 2 * 60 * 1000; // 2 minutes — keep prefetched data for revisits

/**
 * Schedule a data prefetch for a product SKU.
 * Call on mouseEnter; cancel with cancelProductDataPrefetch on mouseLeave.
 */
export function scheduleProductDataPrefetch(sku: string) {
  if (!sku || _dataInFlight[sku]) return;
  // Skip if cache entry exists and is still fresh
  if (_dataCache[sku] && (Date.now() - _dataCache[sku].fetchedAt) < DATA_CACHE_TTL) return;
  // Debounce: only fetch if hover persists 200ms
  _hoverTimers[sku] = setTimeout(function () {
    _fireDataPrefetch(sku);
  }, 200);
}

/** Cancel a pending prefetch (user moved mouse away quickly). */
export function cancelProductDataPrefetch(sku: string) {
  if (_hoverTimers[sku]) {
    clearTimeout(_hoverTimers[sku]);
    delete _hoverTimers[sku];
  }
}

function _fireDataPrefetch(sku: string) {
  if (_dataInFlight[sku]) return;
  if (_dataCache[sku] && (Date.now() - _dataCache[sku].fetchedAt) < DATA_CACHE_TTL) return;
  _dataInFlight[sku] = true;
  // Dynamic import to avoid circular dependency with api.ts at module level
  import("../services/api").then(function (api) {
    return api.getProductDetailInit(sku);
  }).then(function (data) {
    _dataCache[sku] = { data: data, fetchedAt: Date.now() };
    delete _dataInFlight[sku];
  }).catch(function () {
    delete _dataInFlight[sku];
  });
}

/**
 * Consume prefetched data for a SKU.
 * NON-DESTRUCTIVE: keeps the data in cache (with TTL) so revisiting
 * the same product within 2 minutes is instant (back/forward navigation).
 * Returns null if not available or expired.
 */
export function consumeProductDataCache(sku: string): any | null {
  var entry = _dataCache[sku];
  if (!entry) return null;
  if ((Date.now() - entry.fetchedAt) > DATA_CACHE_TTL) {
    delete _dataCache[sku];
    return null;
  }
  return entry.data;
}

/** Check if data is available without consuming it. */
export function hasProductDataCache(sku: string): boolean {
  var entry = _dataCache[sku];
  if (!entry) return false;
  if ((Date.now() - entry.fetchedAt) > DATA_CACHE_TTL) {
    delete _dataCache[sku];
    return false;
  }
  return true;
}