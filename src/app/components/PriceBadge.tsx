import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import * as api from "../services/api";
import type { ProductPrice } from "../services/api";

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

// Module-level cache for showPrice config (avoid fetching per component)
let _showPriceCache: { value: boolean; fetchedAt: number } | null = null;
const SHOW_PRICE_CACHE_TTL = 60_000; // 1 min

async function getShowPrice(): Promise<boolean> {
  if (_showPriceCache && Date.now() - _showPriceCache.fetchedAt < SHOW_PRICE_CACHE_TTL) {
    return _showPriceCache.value;
  }
  try {
    const cfg = await api.getPriceConfig();
    const val = cfg.showPrice !== false;
    _showPriceCache = { value: val, fetchedAt: Date.now() };
    return val;
  } catch {
    return true; // default show
  }
}

export function PriceBadge({ sku, variant = "full", preloaded, forceShow }: PriceBadgeProps) {
  const [priceData, setPriceData] = useState<ProductPrice | null>(preloaded ?? null);
  const [loading, setLoading] = useState(preloaded === undefined);
  const [showPrice, setShowPrice] = useState(true);

  const fetchPrice = useCallback(() => {
    if (!sku) return;
    setLoading(true);
    api
      .getProductPrice(sku)
      .then((data) => {
        console.log(`[PriceBadge] ${sku}: price=${data.price}, source=${data.source}, tier=${data.tier}, showPrice=${data.showPrice}`);
        setPriceData(data);
        // The backend now returns showPrice in the response
        if (data.showPrice !== undefined) {
          setShowPrice(data.showPrice);
          // Update module-level cache
          _showPriceCache = { value: data.showPrice, fetchedAt: Date.now() };
        }
      })
      .catch((e) => {
        console.error(`[PriceBadge] Fetch error for ${sku}:`, e);
        setPriceData(null);
      })
      .finally(() => setLoading(false));
  }, [sku]);

  useEffect(() => {
    if (preloaded !== undefined) {
      setPriceData(preloaded);
      setLoading(false);
      return;
    }
    // Check showPrice first from cache, then fetch price
    getShowPrice().then((sp) => {
      setShowPrice(sp);
      if (!sp && !forceShow) {
        setLoading(false);
        return;
      }
      fetchPrice();
    });
  }, [sku, preloaded, fetchPrice, forceShow]);

  // Don't render if showPrice is false (unless forceShow)
  if (!showPrice && !forceShow) {
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
        <span>Consultando preco...</span>
      </div>
    );
  }

  // ─── No data or not found ───
  if (!priceData || !priceData.found || priceData.price === null || priceData.price === undefined) {
    if (variant === "compact") return null;
    return null;
  }

  const price = priceData.price;

  // ─── Compact (for ProductCard) ───
  if (variant === "compact") {
    return (
      <span
        className="text-red-600"
        style={{ fontSize: "0.9rem", fontWeight: 700 }}
      >
        {formatPrice(price)}
      </span>
    );
  }

  // ─── Full (for ProductDetailPage) ───
  return (
    <div className="flex items-baseline gap-2 mb-1">
      <span
        className="text-red-600"
        style={{ fontSize: "1.6rem", fontWeight: 800, letterSpacing: "-0.02em" }}
      >
        {formatPrice(price)}
      </span>
      {priceData.source === "custom" && (
        <span
          className="text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded"
          style={{ fontSize: "0.6rem", fontWeight: 500 }}
        >
          preco personalizado
        </span>
      )}
    </div>
  );
}
