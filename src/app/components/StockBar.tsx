import { useState, useEffect } from "react";
import * as api from "../services/api";
import type { ProductBalance } from "../services/api";

const STOCK_MAX = 50; // units considered "100%"

function getStockColor(pct: number): string {
  if (pct <= 0) return "#dc2626";
  if (pct <= 15) return "#dc2626";
  if (pct <= 30) return "#c2410c";
  if (pct <= 50) return "#a16207";
  if (pct <= 75) return "#4d7c0f";
  return "#15803d";
}

function getStockLabel(qty: number): string {
  if (qty <= 0) return "Esgotado";
  if (qty <= 3) return "Ultimas unidades!";
  if (qty <= 10) return "Poucas unidades";
  if (qty <= 25) return "Em estoque";
  return "Estoque alto";
}

/* Cache so we don't re-fetch on every mount */
const STOCK_CACHE = new Map<string, { qty: number | null; fetchedAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 min

/**
 * Seed the stock cache from bulk results (called by HomePage/CatalogPage).
 * Prevents individual API calls when components mount before bulk data arrives.
 */
export function seedStockCache(entries: Array<{ sku: string; qty: number | null }>): void {
  const now = Date.now();
  for (const entry of entries) {
    if (entry.sku) {
      STOCK_CACHE.set(entry.sku, { qty: entry.qty, fetchedAt: now });
    }
  }
}

/* Concurrency is now handled by the auto-batching layer in api.ts */
const _stockInflight = new Map<string, Promise<number | null>>();

function fetchStock(sku: string): Promise<number | null> {
  const cached = STOCK_CACHE.get(sku);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return Promise.resolve(cached.qty);
  }

  // Dedup inflight requests
  const inflight = _stockInflight.get(sku);
  if (inflight) return inflight;

  const promise = api.getProductBalance(sku)
    .then((data) => {
      const qty = data && data.found
        ? (data.disponivel ?? data.quantidade ?? 0)
        : null;
      STOCK_CACHE.set(sku, { qty, fetchedAt: Date.now() });
      return qty;
    })
    .catch(() => {
      STOCK_CACHE.set(sku, { qty: null, fetchedAt: Date.now() });
      return null;
    })
    .finally(() => {
      _stockInflight.delete(sku);
    });

  _stockInflight.set(sku, promise);
  return promise;
}

interface StockBarProps {
  sku: string;
  /** If provided, skip fetch and use this balance data */
  preloaded?: ProductBalance | null;
}

export function StockBar({ sku, preloaded }: StockBarProps) {
  const [qty, setQty] = useState<number | null>(() => {
    if (preloaded !== undefined && preloaded !== null && preloaded.found) {
      return preloaded.disponivel ?? preloaded.quantidade ?? 0;
    }
    return null;
  });
  const [loading, setLoading] = useState(() => preloaded === undefined);

  useEffect(() => {
    // If preloaded data was given, use it directly
    if (preloaded !== undefined) {
      if (preloaded !== null && preloaded.found) {
        setQty(preloaded.disponivel ?? preloaded.quantidade ?? 0);
      } else {
        setQty(null);
      }
      setLoading(false);
      return;
    }
    // Fetch from API
    let cancelled = false;
    setLoading(true);
    // Debounce individual fetch by 2500ms + random stagger to let bulk results
    // seed the cache first and avoid thundering herd when debounce expires.
    var stagger = 2500 + Math.random() * 800;
    const timer = setTimeout(() => {
      if (cancelled) return;
      // Re-check if cache was seeded by bulk during the debounce window
      const cached = STOCK_CACHE.get(sku);
      if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
        setQty(cached.qty);
        setLoading(false);
        return;
      }
      fetchStock(sku).then((q) => {
        if (!cancelled) {
          setQty(q);
          setLoading(false);
        }
      });
    }, stagger);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [sku, preloaded]);

  if (loading) {
    return (
      <div className="mt-1.5" style={{ height: "18px" }}>
        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full w-1/3 bg-gray-200 rounded-full animate-pulse" />
        </div>
      </div>
    );
  }

  if (qty === null) return null;

  const pct = Math.min(100, Math.max(0, (qty / STOCK_MAX) * 100));
  const barWidth = Math.max(pct, 4); // min 4% so it's always visible
  const color = getStockColor(pct);
  const label = getStockLabel(qty);

  return (
    <div className="mt-1.5">
      <div className="flex items-center justify-between mb-0.5">
        <span style={{ fontSize: "0.6rem", fontWeight: 700, color: color }}>
          {label}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: barWidth + "%",
            background: color,
            transition: "width 0.8s cubic-bezier(.22,.61,.36,1), background 0.5s ease",
          }}
        />
      </div>
    </div>
  );
}