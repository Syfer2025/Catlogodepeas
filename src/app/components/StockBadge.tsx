/**
 * STOCK BADGE — Badge textual de estoque com cores semanticas.
 * Modos: "full" (quantidade + detalhes), "compact" (dot colorido + label), "inline" (para tabelas).
 * Verde = em estoque, amarelo = estoque baixo (<=5), vermelho = esgotado.
 * Busca saldo via GET /sige/saldo/:sku com cache.
 *
 * CACHE DE MODULO:
 * - _stockCache: Map<sku, {data, fetchedAt}> com TTL de 15min (igual ao backend)
 * - seedStockCache: "planta" saldo no cache (chamado por CatalogPage/HomePage apos bulk-fetch)
 * - Debounce de 2500ms + stagger para deixar o bulk semear o cache primeiro
 */
import React, { useState, useEffect, useCallback } from "react";
import { Loader2, AlertTriangle, PackageCheck, PackageX, RefreshCw } from "lucide-react";
import * as api from "../services/api";
import type { ProductBalance } from "../services/api";

// ═══════════════════════════════════════════════════════════
// Module-level cache (mesma estrategia do PriceBadge/ReviewStars)
// ═══════════════════════════════════════════════════════════

const STOCK_CACHE_TTL = 15 * 60_000; // 15 min — alinhado ao TTL do backend
const _stockCache = new Map<string, { data: ProductBalance; fetchedAt: number }>();
const _stockInflight = new Map<string, Promise<ProductBalance>>();

const MAX_CONCURRENT = 2;
let _activeStockFetches = 0;
const _stockQueue: Array<() => void> = [];

/**
 * Seed the stock cache from bulk results.
 * Call from CatalogPage/HomePage after bulk balance fetch to prevent N individual requests.
 */
export function seedStockCache(entries: Array<{ sku: string; data: ProductBalance }>): void {
  const now = Date.now();
  for (const entry of entries) {
    if (entry.sku && entry.data) {
      _stockCache.set(entry.sku, { data: entry.data, fetchedAt: now });
    }
  }
}

function _runNextStock() {
  while (_activeStockFetches < MAX_CONCURRENT && _stockQueue.length > 0) {
    const next = _stockQueue.shift();
    if (next) { _activeStockFetches++; next(); }
  }
}

function _enqueueStock<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      fn().then(resolve).catch(reject).finally(() => { _activeStockFetches--; _runNextStock(); });
    };
    if (_activeStockFetches < MAX_CONCURRENT) { _activeStockFetches++; run(); }
    else { _stockQueue.push(run); }
  });
}

function fetchBalanceCached(sku: string): Promise<ProductBalance> {
  const cached = _stockCache.get(sku);
  if (cached && Date.now() - cached.fetchedAt < STOCK_CACHE_TTL) {
    return Promise.resolve(cached.data);
  }
  const existing = _stockInflight.get(sku);
  if (existing) return existing;
  const promise = _enqueueStock(() =>
    api.getProductBalance(sku, {}).then((data) => {
      _stockCache.set(sku, { data, fetchedAt: Date.now() });
      _stockInflight.delete(sku);
      return data;
    }).catch((err) => {
      _stockInflight.delete(sku);
      throw err;
    })
  );
  _stockInflight.set(sku, promise);
  return promise;
}

interface StockBadgeProps {
  sku: string;
  /** "full" shows quantity + details, "compact" just a colored dot/label, "inline" for table cells */
  variant?: "full" | "compact" | "inline";
  /** If balance data already loaded externally, pass it to avoid duplicate fetch */
  preloaded?: ProductBalance | null;
}

function StockBadgeInner({ sku, variant = "compact", preloaded }: StockBadgeProps) {
  const [balance, setBalance] = useState<ProductBalance | null>(preloaded ?? null);
  const [loading, setLoading] = useState(preloaded === undefined);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchBalance = useCallback((force = false) => {
    if (!sku) return;
    setLoading(true);
    setFetchError(null);
    api.getProductBalance(sku, { force, debug: force })
      .then((data) => {
        _stockCache.set(sku, { data, fetchedAt: Date.now() });
        setBalance(data);
        if (data.error) setFetchError(data.error);
      })
      .catch((e) => {
        console.error("[StockBadge] Fetch error for " + sku + ":", e);
        setFetchError(e.message || "Erro");
        setBalance(null);
      })
      .finally(() => setLoading(false));
  }, [sku]);

  useEffect(() => {
    // If preloaded is explicitly provided (even null), use it — no fetch
    if (preloaded !== undefined) {
      setBalance(preloaded);
      setLoading(false);
      setFetchError(null);
      return;
    }
    // Check module-level cache synchronously before scheduling any fetch
    const cached = _stockCache.get(sku);
    if (cached && Date.now() - cached.fetchedAt < STOCK_CACHE_TTL) {
      setBalance(cached.data);
      setLoading(false);
      return;
    }
    // Debounce 2500ms + stagger — gives bulk seed time to populate the cache first,
    // preventing thundering herd when many cards mount simultaneously.
    let cancelled = false;
    const stagger = 2500 + Math.random() * 800;
    const timer = setTimeout(() => {
      if (cancelled) return;
      // Re-check cache (bulk may have seeded during debounce)
      const c2 = _stockCache.get(sku);
      if (c2 && Date.now() - c2.fetchedAt < STOCK_CACHE_TTL) {
        setBalance(c2.data);
        setLoading(false);
        return;
      }
      fetchBalanceCached(sku).then((data) => {
        if (!cancelled) {
          setBalance(data);
          if (data.error) setFetchError(data.error);
          setLoading(false);
        }
      }).catch((e) => {
        if (!cancelled) {
          console.error("[StockBadge] Fetch error for " + sku + ":", e);
          setFetchError(e.message || "Erro");
          setBalance(null);
          setLoading(false);
        }
      });
    }, stagger);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [sku, preloaded, fetchBalance]);

  // ─── Loading state ───
  if (loading) {
    if (variant === "inline") {
      return <Loader2 className="w-3.5 h-3.5 text-gray-300 animate-spin" />;
    }
    if (variant === "compact") {
      return (
        <div className="flex items-center gap-1 text-gray-400" style={{ fontSize: "0.65rem" }}>
          <Loader2 className="w-3 h-3 animate-spin" />
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 text-gray-400 py-3 px-4 rounded-xl border border-gray-100 bg-gray-50" style={{ fontSize: "0.8rem" }}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Verificando disponibilidade...</span>
      </div>
    );
  }

  // ─── No data / SIGE not configured ───
  if (!balance || (!balance.sige && !balance.found)) {
    if (variant === "inline") {
      return <span className="text-gray-300" style={{ fontSize: "0.72rem" }}>—</span>;
    }
    if (variant === "compact") {
      return null; // Don't show on cards if SIGE not connected
    }
    // full variant — show info about missing SIGE
    return (
      <div className="flex items-center gap-2 text-gray-400 py-3 px-4 rounded-xl border border-gray-100 bg-gray-50" style={{ fontSize: "0.78rem" }}>
        <AlertTriangle className="w-4 h-4 text-amber-400" />
        <span className="flex-1">{fetchError || balance?.error || "Estoque indisponível"}</span>
        <button onClick={() => fetchBalance(true)} className="p-1 rounded-full hover:bg-gray-200 transition-colors" title="Tentar novamente">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // ─── Product not found in SIGE ───
  if (!balance.found) {
    if (variant === "inline") {
      return <span className="text-gray-400" style={{ fontSize: "0.72rem" }}>N/D</span>;
    }
    if (variant === "compact") {
      return null;
    }
    return (
      <div className="flex items-center gap-2 text-amber-600 py-3 px-4 rounded-xl border border-amber-100 bg-amber-50" style={{ fontSize: "0.78rem" }}>
        <AlertTriangle className="w-4 h-4" />
        <span className="flex-1">SKU não localizado no sistema SIGE</span>
        <button onClick={() => fetchBalance(true)} className="p-1 rounded-full hover:bg-amber-100 transition-colors" title="Forçar nova consulta (ignora cache)">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  const qty = balance.quantidade ?? 0;
  const available = balance.disponivel ?? qty;
  const reserved = balance.reservado ?? 0;
  const inStock = available > 0;

  // ─── Compact variant (for ProductCard) ───
  if (variant === "compact") {
    return (
      <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full border ${
        inStock
          ? "bg-green-50 text-green-700 border-green-200"
          : "bg-red-50 text-red-600 border-red-200"
      }`} style={{ fontSize: "0.68rem", fontWeight: 600 }}>
        <div className={`w-1.5 h-1.5 rounded-full ${inStock ? "bg-green-500" : "bg-red-500"}`} />
        {inStock ? `${available} disp.` : "Sem estoque"}
      </div>
    );
  }

  // ─── Inline variant (for admin tables) ───
  if (variant === "inline") {
    return (
      <div className="flex items-center gap-1.5">
        {inStock ? <PackageCheck className="w-3.5 h-3.5 text-green-500" /> : <PackageX className="w-3.5 h-3.5 text-red-400" />}
        <span className={inStock ? "text-green-700" : "text-red-500"} style={{ fontSize: "0.78rem", fontWeight: 600 }}>
          {available}
        </span>
        {reserved > 0 && (
          <span className="text-amber-500" style={{ fontSize: "0.65rem" }}>
            ({reserved} res.)
          </span>
        )}
      </div>
    );
  }

  // ─── Full variant (for ProductDetailPage) — simple single-line ───
  return (
    <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border ${
      inStock
        ? "bg-green-50 border-green-200"
        : "bg-red-50 border-red-200"
    }`}>
      {inStock ? (
        <PackageCheck className="w-5 h-5 text-green-600 shrink-0" />
      ) : (
        <PackageX className="w-5 h-5 text-red-500 shrink-0" />
      )}
      <p className={inStock ? "text-green-800" : "text-red-700"} style={{ fontSize: "0.9rem", fontWeight: 700 }}>
        {inStock
          ? `${available} disponíve${available !== 1 ? "is" : "l"} em estoque`
          : "Estoque zerado"}
      </p>
    </div>
  );
}

export const StockBadge = React.memo(StockBadgeInner);