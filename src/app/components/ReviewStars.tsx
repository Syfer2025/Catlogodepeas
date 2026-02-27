import { useState, useEffect } from "react";
import { Star } from "lucide-react";
import * as api from "../services/api";

// ═══════════════════════════════════════════════════════
// Module-level cache (same pattern as PriceBadge/StockBar)
// ═══════════════════════════════════════════════════════

var REVIEW_CACHE_TTL = 10 * 60 * 1000; // 10 min
var _reviewCache = new Map<string, { avg: number; total: number; fetchedAt: number }>();
var _reviewInflight = new Map<string, Promise<{ averageRating: number; totalReviews: number }>>();

var MAX_CONCURRENT = 2;
var _active = 0;
var _queue: Array<() => void> = [];

/**
 * Seed the review stars cache from batch results.
 * Called by HomePage / CatalogPage after bulk fetch.
 */
export function seedReviewStarsCache(
  entries: Array<{ sku: string; averageRating: number; totalReviews: number }>
): void {
  var now = Date.now();
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    if (e.sku) {
      _reviewCache.set(e.sku, { avg: e.averageRating, total: e.totalReviews, fetchedAt: now });
    }
  }
}

function _runNext() {
  while (_active < MAX_CONCURRENT && _queue.length > 0) {
    var next = _queue.shift();
    if (next) { _active++; next(); }
  }
}

function _enqueue<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>(function (resolve, reject) {
    var run = function () {
      fn()
        .then(resolve)
        .catch(reject)
        .finally(function () { _active--; _runNext(); });
    };
    if (_active < MAX_CONCURRENT) { _active++; run(); }
    else { _queue.push(run); }
  });
}

function fetchReviewSummary(sku: string): Promise<{ averageRating: number; totalReviews: number }> {
  var cached = _reviewCache.get(sku);
  if (cached && Date.now() - cached.fetchedAt < REVIEW_CACHE_TTL) {
    return Promise.resolve({ averageRating: cached.avg, totalReviews: cached.total });
  }
  var existing = _reviewInflight.get(sku);
  if (existing) return existing;
  var promise = _enqueue(function () {
    return api.getReviewSummary(sku).then(function (res) {
      _reviewCache.set(sku, { avg: res.averageRating, total: res.totalReviews, fetchedAt: Date.now() });
      _reviewInflight.delete(sku);
      return { averageRating: res.averageRating, totalReviews: res.totalReviews };
    }).catch(function () {
      _reviewInflight.delete(sku);
      return { averageRating: 0, totalReviews: 0 };
    });
  });
  _reviewInflight.set(sku, promise);
  return promise;
}

// ═══════════════════════════════════════════════════════
// Mini Star Rating component for ProductCard
// ═══════════════════════════════════════════════════════

interface ReviewStarsProps {
  sku: string;
  /** If summary was pre-loaded, pass it to skip fetch */
  preloaded?: { averageRating: number; totalReviews: number } | null;
}

export function ReviewStars({ sku, preloaded }: ReviewStarsProps) {
  var [avg, setAvg] = useState<number>(preloaded ? preloaded.averageRating : 0);
  var [total, setTotal] = useState<number>(preloaded ? preloaded.totalReviews : 0);
  var [loaded, setLoaded] = useState(!!preloaded);

  useEffect(function () {
    if (preloaded) {
      setAvg(preloaded.averageRating);
      setTotal(preloaded.totalReviews);
      setLoaded(true);
      return;
    }
    // Check cache first (synchronous)
    var cached = _reviewCache.get(sku);
    if (cached && Date.now() - cached.fetchedAt < REVIEW_CACHE_TTL) {
      setAvg(cached.avg);
      setTotal(cached.total);
      setLoaded(true);
      return;
    }
    var cancelled = false;
    // Debounce individual fetch by 2500ms + stagger to let bulk seed the cache first
    var stagger = 2500 + Math.random() * 800;
    var timer = setTimeout(function () {
      if (cancelled) return;
      // Re-check cache (bulk may have seeded it during debounce)
      var c2 = _reviewCache.get(sku);
      if (c2 && Date.now() - c2.fetchedAt < REVIEW_CACHE_TTL) {
        setAvg(c2.avg);
        setTotal(c2.total);
        setLoaded(true);
        return;
      }
      fetchReviewSummary(sku).then(function (res) {
        if (!cancelled) {
          setAvg(res.averageRating);
          setTotal(res.totalReviews);
          setLoaded(true);
        }
      });
    }, stagger);
    return function () { cancelled = true; clearTimeout(timer); };
  }, [sku, preloaded]);

  // Don't show anything while still loading
  if (!loaded) return null;

  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center gap-px">
        {[1, 2, 3, 4, 5].map(function (i) {
          var fill = avg >= i ? "full" : avg >= i - 0.5 ? "half" : "empty";
          return (
            <span key={i} className="relative inline-block" style={{ width: 12, height: 12 }}>
              <Star
                className="absolute inset-0 text-gray-200"
                style={{ width: 12, height: 12 }}
                fill="#e5e7eb"
                strokeWidth={0}
              />
              {fill !== "empty" && (
                <span
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: fill === "half" ? 6 : 12 }}
                >
                  <Star
                    className="text-amber-400"
                    style={{ width: 12, height: 12 }}
                    fill="#fbbf24"
                    strokeWidth={0}
                  />
                </span>
              )}
            </span>
          );
        })}
      </div>
      {total > 0 ? (
        <>
          <span className="text-gray-400" style={{ fontSize: "0.65rem", fontWeight: 500, lineHeight: 1 }}>
            {avg.toFixed(1)}
          </span>
          <span className="text-gray-300" style={{ fontSize: "0.6rem", lineHeight: 1 }}>
            {"(" + total + ")"}
          </span>
        </>
      ) : (
        <span className="text-gray-300" style={{ fontSize: "0.6rem", lineHeight: 1 }}>
          (0)
        </span>
      )}
    </div>
  );
}