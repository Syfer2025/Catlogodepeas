import { useState, useEffect, useRef } from "react";
import { Clock, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { ProductCard } from "./ProductCard";
import type { ProdutoItem } from "./ProductCard";
import type { ProductBalance, ProductPrice } from "../services/api";
import * as api from "../services/api";
import { seedPriceCache } from "./PriceBadge";
import { seedStockCache } from "./StockBar";
import { useRecentlyViewed } from "../hooks/useRecentlyViewed";

interface RecentlyViewedSectionProps {
  /** SKU to exclude (current product page) */
  excludeSku?: string;
  /** Max items to show */
  maxItems?: number;
  /** Text color variant for dark backgrounds (e.g. promo pages) */
  darkMode?: boolean;
}

export function RecentlyViewedSection({ excludeSku, maxItems = 10, darkMode = false }: RecentlyViewedSectionProps) {
  var { getItems, clearAll } = useRecentlyViewed();
  var [products, setProducts] = useState<ProdutoItem[]>([]);
  var [balanceMap, setBalanceMap] = useState<Record<string, ProductBalance>>({});
  var [priceMap, setPriceMap] = useState<Record<string, ProductPrice>>({});
  var scrollRef = useRef<HTMLDivElement>(null);

  var recentItems = getItems(excludeSku).slice(0, maxItems);

  useEffect(function () {
    if (recentItems.length === 0) {
      setProducts([]);
      return;
    }

    // Build products from stored data (avoids API calls for product info)
    var prods: ProdutoItem[] = recentItems.map(function (item) {
      return { sku: item.sku, titulo: item.titulo };
    });
    setProducts(prods);

    // Bulk-load prices and balances
    var skus = prods.map(function (p) { return p.sku; });
    var ac = new AbortController();

    api.getProductPricesBulk(skus, { signal: ac.signal })
      .then(function (res) {
        if (ac.signal.aborted) return;
        var map: Record<string, ProductPrice> = {};
        for (var i = 0; i < (res.results || []).length; i++) {
          var p = res.results[i];
          map[p.sku] = p;
        }
        setPriceMap(map);
        seedPriceCache((res.results || []).map(function (p: ProductPrice) { return { sku: p.sku, data: p }; }));
      })
      .catch(function (e) { if (e && e.name !== "AbortError") console.error("[RecentlyViewed] Bulk price error:", e); });

    api.getProductBalances(skus, { signal: ac.signal })
      .then(function (res) {
        if (ac.signal.aborted) return;
        var map: Record<string, ProductBalance> = {};
        for (var i = 0; i < (res.results || []).length; i++) {
          var b = res.results[i];
          map[b.sku] = b;
        }
        setBalanceMap(map);
        seedStockCache((res.results || []).map(function (b: any) {
          return { sku: b.sku, qty: b.found ? (b.disponivel ?? b.quantidade ?? 0) : null };
        }));
      })
      .catch(function (e) { if (e && e.name !== "AbortError") console.error("[RecentlyViewed] Bulk balance error:", e); });

    return function () { ac.abort(); };
  }, [recentItems.length, excludeSku]);

  if (products.length === 0) return null;

  var scroll = function (dir: "left" | "right") {
    if (!scrollRef.current) return;
    var amount = dir === "left" ? -300 : 300;
    scrollRef.current.scrollBy({ left: amount, behavior: "smooth" });
  };

  return (
    <section className={darkMode ? "py-10" : "py-10 bg-white border-t border-gray-100"}>
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className={"w-8 h-8 rounded-lg flex items-center justify-center " + (darkMode ? "bg-white/10" : "bg-gray-100")}>
              <Clock className={"w-4 h-4 " + (darkMode ? "text-white/70" : "text-gray-500")} />
            </div>
            <div>
              <h2
                className={darkMode ? "text-white" : "text-gray-800"}
                style={{ fontSize: "1.1rem", fontWeight: 700 }}
              >
                Vistos Recentemente
              </h2>
              <p
                className={darkMode ? "text-white/50" : "text-gray-400"}
                style={{ fontSize: "0.75rem" }}
              >
                {products.length} {products.length === 1 ? "produto" : "produtos"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={function () { clearAll(); setProducts([]); }}
              className={"flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors " +
                (darkMode
                  ? "text-white/50 hover:text-white hover:bg-white/10"
                  : "text-gray-400 hover:text-red-600 hover:bg-red-50")}
              style={{ fontSize: "0.75rem", fontWeight: 500 }}
              title="Limpar histórico"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Limpar</span>
            </button>
            <button
              onClick={function () { scroll("left"); }}
              className={"p-1.5 rounded-full border transition-colors " +
                (darkMode
                  ? "border-white/20 text-white/60 hover:text-white hover:bg-white/10"
                  : "border-gray-200 bg-white hover:bg-gray-100 text-gray-500 hover:text-gray-700")}
              aria-label="Rolar para esquerda"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={function () { scroll("right"); }}
              className={"p-1.5 rounded-full border transition-colors " +
                (darkMode
                  ? "border-white/20 text-white/60 hover:text-white hover:bg-white/10"
                  : "border-gray-200 bg-white hover:bg-gray-100 text-gray-500 hover:text-gray-700")}
              aria-label="Rolar para direita"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Horizontal scroll of cards */}
        <div
          ref={scrollRef}
          className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 hide-scrollbar snap-x snap-mandatory"
          style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {products.map(function (product) {
            return (
              <div
                key={product.sku}
                className="shrink-0 snap-start"
                style={{ width: "clamp(160px, 42vw, 230px)" }}
              >
                <ProductCard
                  product={product}
                  balance={balanceMap[product.sku]}
                  preloadedPrice={priceMap[product.sku]}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}