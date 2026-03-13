/**
 * useIdlePrefetch — Preloads route chunks during browser idle time.
 *
 * Uses requestIdleCallback (with setTimeout fallback for Safari) to
 * progressively import route modules when the main thread is free.
 * This ensures navigations feel instant because the JS is already cached.
 *
 * Routes are prioritized by likelihood of navigation from the homepage:
 *   1. CatalogPage (most common next page)
 *   2. ProductDetailPage (clicked from catalog or product cards)
 *   3. UserAuthPage (login/signup)
 *   4. CheckoutPage (cart → checkout)
 *   5. ContactPage (CTA button)
 *   6. AboutPage, CouponsPage, etc.
 *
 * Each chunk is loaded at most once (idempotent). The hook runs only
 * once on mount and spaces out imports across multiple idle callbacks
 * to avoid saturating the network.
 */

import { useEffect } from "react";

/** Cross-browser requestIdleCallback with setTimeout fallback */
var ric = typeof window !== "undefined" && "requestIdleCallback" in window
  ? (window as any).requestIdleCallback
  : function (cb: () => void) { return setTimeout(cb, 200); };

var cric = typeof window !== "undefined" && "cancelIdleCallback" in window
  ? (window as any).cancelIdleCallback
  : clearTimeout;

/** Sentinel to ensure we only prefetch once per session */
var _idlePrefetchDone = false;

/** Route chunks to prefetch, in priority order */
var ROUTE_CHUNKS = [
  function () { return import("../pages/CatalogPage"); },
  function () { return import("../pages/ProductDetailPage"); },
  function () { return import("../pages/UserAuthPage"); },
  function () { return import("../pages/CheckoutPage"); },
  function () { return import("../pages/ContactPage"); },
  function () { return import("../pages/AboutPage"); },
  function () { return import("../pages/UserAccountPage"); },
  function () { return import("../pages/CouponsPage"); },
  function () { return import("../pages/BrandPage"); },
  function () { return import("../pages/TrackingPage"); },
  function () { return import("../pages/AffiliatePage"); },
];

export function useIdlePrefetch() {
  useEffect(function () {
    // Only run once per page load
    if (_idlePrefetchDone) return;
    _idlePrefetchDone = true;

    var idx = 0;
    var cancelled = false;
    var currentHandle: any;

    // Wait 3 seconds after mount before starting — let critical resources load first
    var startTimer = setTimeout(function () {
      if (cancelled) return;
      scheduleNext();
    }, 3000);

    function scheduleNext() {
      if (cancelled || idx >= ROUTE_CHUNKS.length) return;

      currentHandle = ric(function (deadline?: { timeRemaining?: () => number }) {
        if (cancelled) return;

        // If deadline API is available, check we have at least 20ms of idle time
        var hasTime = !deadline || !deadline.timeRemaining || deadline.timeRemaining() > 20;
        if (!hasTime) {
          // Not enough idle time — reschedule
          scheduleNext();
          return;
        }

        // Fire the import (fire-and-forget, errors are silently swallowed)
        var chunkFn = ROUTE_CHUNKS[idx];
        idx++;
        chunkFn().catch(function () {});

        // Schedule next chunk after a small gap (150ms) to avoid network saturation
        if (idx < ROUTE_CHUNKS.length) {
          setTimeout(function () {
            if (!cancelled) scheduleNext();
          }, 150);
        }
      }, { timeout: 5000 }); // Force execution within 5s if no idle time
    }

    return function () {
      cancelled = true;
      clearTimeout(startTimer);
      if (currentHandle) cric(currentHandle);
    };
  }, []);
}
