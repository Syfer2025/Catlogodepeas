import { useState, useEffect, useCallback } from "react";
import { Loader2, Zap, CreditCard } from "lucide-react";
import * as api from "../services/api";
import type { ProductPrice, PriceConfig } from "../services/api";
import { useCatalogMode } from "../contexts/CatalogModeContext";

interface PriceBadgeProps {
  sku: string;
  /** "full" for product detail page, "compact" for cards */
  variant?: "full" | "compact";
  /** If price data already loaded externally, pass it to avoid duplicate fetch */
  preloaded?: ProductPrice | null;
  /** Force show even if showPrice is off (for admin test) */
  forceShow?: boolean;
}

function formatPrice(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

// ═══════════════════════════════════════════════════════════
// Module-level concurrency limiter + dedup cache + retry
// ═══════════════════════════════════════════════════════════

const MAX_CONCURRENT = 2;
const PRICE_CACHE_TTL = 5 * 60_000;

let _activeFetches = 0;
const _queue: Array<() => void> = [];
const _priceCache = new Map<string, { data: ProductPrice; fetchedAt: number }>();
const _inflightRequests = new Map<string, Promise<ProductPrice>>();

/**
 * Seed the price cache from bulk results (called by HomePage/CatalogPage).
 * This prevents individual fetches when components mount before bulk data arrives.
 */
export function seedPriceCache(entries: Array<{ sku: string; data: ProductPrice }>): void {
  const now = Date.now();
  for (const entry of entries) {
    if (entry.sku && entry.data) {
      _priceCache.set(entry.sku, { data: entry.data, fetchedAt: now });
    }
  }
}

function _runNext() {
  while (_activeFetches < MAX_CONCURRENT && _queue.length > 0) {
    const next = _queue.shift();
    if (next) {
      _activeFetches++;
      next();
    }
  }
}

function _enqueue<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      fn()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          _activeFetches--;
          _runNext();
        });
    };

    if (_activeFetches < MAX_CONCURRENT) {
      _activeFetches++;
      run();
    } else {
      _queue.push(run);
    }
  });
}

function fetchPriceThrottled(sku: string): Promise<ProductPrice> {
  const cached = _priceCache.get(sku);
  if (cached && Date.now() - cached.fetchedAt < PRICE_CACHE_TTL) {
    return Promise.resolve(cached.data);
  }

  const inflight = _inflightRequests.get(sku);
  if (inflight) return inflight;

  const promise = _enqueue(() => api.getProductPrice(sku))
    .then((data) => {
      _priceCache.set(sku, { data, fetchedAt: Date.now() });
      _inflightRequests.delete(sku);
      return data;
    })
    .catch((e) => {
      _inflightRequests.delete(sku);
      throw e;
    });

  _inflightRequests.set(sku, promise);
  return promise;
}

// ═══════════════════════════════════════════════════════════
// Module-level config cache
// ═══════════════════════════════════════════════════════════

let _priceConfigCache: { value: PriceConfig; fetchedAt: number } | null = null;
const CONFIG_CACHE_TTL = 5 * 60_000; // 5 min — matches homepage-init refresh cycle

// Waiters: resolved when seedPriceConfig fires (avoids redundant /price-config call)
let _seedWaiters: Array<(cfg: PriceConfig) => void> = [];

const PRICE_CONFIG_DEFAULTS: PriceConfig = {
  tier: "v2", showPrice: true, pixDiscountEnabled: false,
  pixDiscountPercent: 5, installmentsCount: 0, installmentsMinValue: 0,
};

/**
 * Seed the price config cache from homepage-init data.
 * Resolves any pending waiters so PriceBadge doesn't need a separate API call.
 */
export function seedPriceConfig(cfg: PriceConfig): void {
  if (cfg) {
    _priceConfigCache = { value: cfg, fetchedAt: Date.now() };
    // Resolve all components waiting for the seed
    var waiters = _seedWaiters;
    _seedWaiters = [];
    for (var i = 0; i < waiters.length; i++) {
      waiters[i](cfg);
    }
  }
}

// In-flight promise for the fallback /price-config call (dedup)
let _configFetchPromise: Promise<PriceConfig> | null = null;

async function _fetchPriceConfigFallback(): Promise<PriceConfig> {
  if (_configFetchPromise) return _configFetchPromise;
  _configFetchPromise = api.getPriceConfig()
    .then(function (cfg) {
      _priceConfigCache = { value: cfg, fetchedAt: Date.now() };
      _configFetchPromise = null;
      // Also resolve any remaining waiters
      var waiters = _seedWaiters;
      _seedWaiters = [];
      for (var i = 0; i < waiters.length; i++) {
        waiters[i](cfg);
      }
      return cfg;
    })
    .catch(function (e) {
      console.warn("[PriceBadge] Fallback /price-config error, using defaults:", e);
      _configFetchPromise = null;
      _priceConfigCache = { value: PRICE_CONFIG_DEFAULTS, fetchedAt: Date.now() };
      return PRICE_CONFIG_DEFAULTS;
    });
  return _configFetchPromise;
}

async function getPriceConfigCached(): Promise<PriceConfig> {
  // 1. Return from cache if valid
  if (_priceConfigCache && Date.now() - _priceConfigCache.fetchedAt < CONFIG_CACHE_TTL) {
    return _priceConfigCache.value;
  }
  // 2. Wait for homepage-init seed (up to 3s) instead of making a separate /price-config call.
  //    homepage-init already includes priceConfig, so a separate call is redundant and
  //    wastes a semaphore slot — causing timeouts under high concurrency.
  //    If the seed doesn't arrive in time, fall back to an actual API call rather than defaults.
  return new Promise<PriceConfig>(function (resolve) {
    // Check once more in case seed arrived between the first check and this line
    if (_priceConfigCache && Date.now() - _priceConfigCache.fetchedAt < CONFIG_CACHE_TTL) {
      resolve(_priceConfigCache.value);
      return;
    }
    var timer = setTimeout(function () {
      // Remove this waiter
      _seedWaiters = _seedWaiters.filter(function (w) { return w !== waiter; });
      // Timed out waiting for seed — fetch from /price-config endpoint as fallback
      _fetchPriceConfigFallback().then(resolve);
    }, 3000);
    var waiter = function (cfg: PriceConfig) {
      clearTimeout(timer);
      resolve(cfg);
    };
    _seedWaiters.push(waiter);
  });
}

export function PriceBadge({ sku, variant = "full", preloaded, forceShow }: PriceBadgeProps) {
  const { catalogMode } = useCatalogMode();
  const [priceData, setPriceData] = useState<ProductPrice | null>(preloaded ?? null);
  const [loading, setLoading] = useState(preloaded === undefined);
  const [config, setConfig] = useState<PriceConfig | null>(null);

  const fetchPrice = useCallback(() => {
    if (!sku) return;
    setLoading(true);
    fetchPriceThrottled(sku)
      .then((data) => {
        setPriceData(data);
        if (data.showPrice !== undefined) {
          // Update module cache
          if (_priceConfigCache) {
            _priceConfigCache.value.showPrice = data.showPrice;
          }
        }
      })
      .catch((e: any) => {
        if (e && e.name === "AbortError") return; // silently ignore aborted requests
        console.error("[PriceBadge] Fetch error for " + sku + ":", e);
        setPriceData(null);
      })
      .finally(() => setLoading(false));
  }, [sku]);

  useEffect(() => {
    let cancelled = false;
    // Load config first
    getPriceConfigCached().then((cfg) => {
      if (cancelled) return;
      setConfig(cfg);
      if (!cfg.showPrice && !forceShow) {
        setLoading(false);
        return;
      }
      if (preloaded !== undefined) {
        setPriceData(preloaded);
        setLoading(false);
        return;
      }
      // Debounce individual fetch by 2500ms + random stagger to let bulk results
      // seed the cache first and avoid thundering herd when debounce expires.
      var stagger = 2500 + Math.random() * 800;
      setTimeout(() => {
        if (cancelled) return;
        // Re-check if cache was seeded by bulk during the debounce window
        const cached = _priceCache.get(sku);
        if (cached && Date.now() - cached.fetchedAt < PRICE_CACHE_TTL) {
          setPriceData(cached.data);
          setLoading(false);
          return;
        }
        fetchPrice();
      }, stagger);
    });
    return () => { cancelled = true; };
  }, [sku, preloaded, fetchPrice, forceShow]);

  // Don't render if catalogMode is active (global setting — blocks all prices)
  if (catalogMode && !forceShow) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg" style={{ fontSize: variant === "compact" ? "0.68rem" : "0.85rem", fontWeight: 600 }}>
          Consulte o preco
        </span>
      </div>
    );
  }

  // Don't render if showPrice is false (unless forceShow)
  if (config && !config.showPrice && !forceShow) {
    return null;
  }

  // ─── Loading ───
  if (loading) {
    if (variant === "compact") {
      return (
        <div className="flex items-center gap-1 text-gray-300" style={{ fontSize: "0.65rem" }}>
          <Loader2 className="w-3 h-3 animate-spin" />
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 text-gray-400" style={{ fontSize: "0.85rem" }}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Carregando preço...</span>
      </div>
    );
  }

  // ─── No data or not found ───
  if (!priceData || !priceData.found || priceData.price === null || priceData.price === undefined) {
    if (variant === "compact") return null;
    return null;
  }

  const price = priceData.price;
  const pixEnabled = config?.pixDiscountEnabled === true;
  const pixPercent = config?.pixDiscountPercent ?? 5;
  const pixPrice = pixEnabled ? price * (1 - pixPercent / 100) : null;
  const installments = config?.installmentsCount || 0;
  const installMinVal = config?.installmentsMinValue || 0;
  const maxInstallments = installments > 0 && price >= installMinVal
    ? Math.min(installments, Math.floor(price / (installMinVal > 0 ? installMinVal : 1)))
    : 0;
  const installmentValue = maxInstallments > 0 ? price / maxInstallments : 0;

  // ─── Compact (for ProductCard) ───
  if (variant === "compact") {
    return (
      <div className="space-y-1">
        {/* PIX price — prominent */}
        {pixEnabled && pixPrice !== null ? (
          <>
            <div className="flex items-center gap-1.5">
              <span
                className="text-emerald-700 flex items-center gap-1"
                style={{ fontSize: "1.05rem", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.2 }}
              >
                {formatPrice(pixPrice)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded flex items-center gap-1" style={{ fontSize: "0.62rem", fontWeight: 700 }}>
                <Zap className="w-2.5 h-2.5" />
                {pixPercent}% OFF no PIX
              </span>
            </div>
            <p className="text-gray-400" style={{ fontSize: "0.73rem", lineHeight: 1.3 }}>
              ou <span className="text-gray-700 font-semibold">{formatPrice(price)}</span>
              {maxInstallments > 1 && (
                <span> em {maxInstallments}x de <span className="font-semibold">{formatPrice(installmentValue)}</span></span>
              )}
            </p>
          </>
        ) : (
          <>
            <span
              className="text-gray-900"
              style={{ fontSize: "1.05rem", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.2 }}
            >
              {formatPrice(price)}
            </span>
            {maxInstallments > 1 && (
              <p className="text-gray-400" style={{ fontSize: "0.72rem", lineHeight: 1.3 }}>
                em {maxInstallments}x de <span className="text-gray-500 font-semibold">{formatPrice(installmentValue)}</span>
              </p>
            )}
          </>
        )}
      </div>
    );
  }

  // ─── Full (for ProductDetailPage) ───
  return (
    <div className="space-y-2">
      {pixEnabled && pixPrice !== null ? (
        <>
          {/* Original price with strikethrough */}
          <div className="flex items-center gap-2">
            <span className="text-gray-400 line-through" style={{ fontSize: "0.95rem", fontWeight: 500 }}>
              {formatPrice(price)}
            </span>
            {priceData.source === "custom" && (
              <span className="text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded" style={{ fontSize: "0.6rem", fontWeight: 500 }}>
                preço personalizado
              </span>
            )}
          </div>
          {/* PIX discounted price */}
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className="text-emerald-700"
              style={{ fontSize: "2rem", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1 }}
            >
              {formatPrice(pixPrice)}
            </span>
            <span className="bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-lg flex items-center gap-1.5" style={{ fontSize: "0.78rem", fontWeight: 700 }}>
              <Zap className="w-3.5 h-3.5" />
              {pixPercent}% OFF no PIX
            </span>
          </div>
          {/* Installment info */}
          {maxInstallments > 1 && (
            <p className="text-gray-500 flex items-center gap-1.5" style={{ fontSize: "0.88rem" }}>
              <CreditCard className="w-4 h-4 text-gray-400" />
              ou <span className="font-bold text-gray-700">{formatPrice(price)}</span>
              &nbsp;em <span className="font-bold text-gray-700">{maxInstallments}x</span> de
              <span className="font-bold text-gray-700">{formatPrice(installmentValue)}</span>
              <span className="text-gray-400">s/ juros</span>
            </p>
          )}
          {!maxInstallments && (
            <p className="text-gray-500 flex items-center gap-1.5" style={{ fontSize: "0.88rem" }}>
              <CreditCard className="w-4 h-4 text-gray-400" />
              ou <span className="font-bold text-gray-700">{formatPrice(price)}</span> no cartão
            </p>
          )}
        </>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span
              className="text-gray-900"
              style={{ fontSize: "2rem", fontWeight: 800, letterSpacing: "-0.03em" }}
            >
              {formatPrice(price)}
            </span>
            {priceData.source === "custom" && (
              <span className="text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded" style={{ fontSize: "0.6rem", fontWeight: 500 }}>
                preço personalizado
              </span>
            )}
          </div>
          {maxInstallments > 1 && (
            <p className="text-gray-500 flex items-center gap-1.5" style={{ fontSize: "0.88rem" }}>
              <CreditCard className="w-4 h-4 text-gray-400" />
              em <span className="font-bold text-gray-700">{maxInstallments}x</span> de
              <span className="font-bold text-gray-700">{formatPrice(installmentValue)}</span>
              <span className="text-gray-400">s/ juros</span>
            </p>
          )}
        </>
      )}
    </div>
  );
}