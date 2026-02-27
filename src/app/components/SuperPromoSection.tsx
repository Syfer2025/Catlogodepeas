import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router";
import { Flame, ChevronLeft, ChevronRight, Package, Zap, ArrowRight, Loader2 } from "lucide-react";
import * as api from "../services/api";
import type { SuperPromo } from "../services/api";
import type { ProductPrice, ProductBalance } from "../services/api";
import { computePromoPrice } from "../services/api";
import { StockBar } from "./StockBar";
import { seedPriceCache } from "./PriceBadge";
import { seedStockCache } from "./StockBar";
import { seedReviewStarsCache } from "./ReviewStars";
import { useHomepageInit } from "../contexts/HomepageInitContext";
import { ProductImage } from "./ProductImage";
import { ReviewStars } from "./ReviewStars";
import { useCatalogMode } from "../contexts/CatalogModeContext";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

/* ═══════ Countdown ═══════ */
function Countdown({ endDate }: { endDate: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endDate]);

  const diff = Math.max(0, endDate - now);
  if (diff <= 0) return <span className="text-yellow-300 font-bold text-xs">Encerrada</span>;

  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);

  const Block = ({ v, l }: { v: number; l: string }) => (
    <div className="bg-white rounded-md px-2 py-1.5 text-center min-w-[38px]" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
      <span className="text-red-600 font-mono font-extrabold block" style={{ fontSize: "1rem", lineHeight: 1 }}>{pad2(v)}</span>
      <span className="text-gray-400 block" style={{ fontSize: "0.5rem", fontWeight: 600, textTransform: "uppercase" }}>{l}</span>
    </div>
  );

  const timeLabel = d + " dias, " + h + " horas, " + m + " minutos e " + s + " segundos restantes";

  return (
    <div className="flex items-center gap-1.5" role="timer" aria-live="off" aria-label={timeLabel}>
      <Block v={d} l="d" />
      <span className="text-white/60 font-bold text-sm" aria-hidden="true">:</span>
      <Block v={h} l="h" />
      <span className="text-white/60 font-bold text-sm" aria-hidden="true">:</span>
      <Block v={m} l="m" />
      <span className="text-white/60 font-bold text-sm" aria-hidden="true">:</span>
      <Block v={s} l="s" />
    </div>
  );
}

/* ═══════ Promo Price Display ("De X por Y") ═══════ */
function PromoPriceDisplay({ sku, promo, product, preloadedPrice, hidePrices }: { sku: string; promo: SuperPromo; product: api.SuperPromoProduct; preloadedPrice?: number | null; hidePrices?: boolean }) {
  if (hidePrices) {
    return (
      <div className="flex items-center gap-1.5" style={{ minHeight: "2.5rem" }}>
        <span className="text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg" style={{ fontSize: "0.68rem", fontWeight: 600 }}>
          Consulte o preco
        </span>
      </div>
    );
  }
  const originalPrice = preloadedPrice ?? null;

  if (originalPrice === null || originalPrice === undefined) {
    return (
      <div className="flex items-center gap-1 py-1" style={{ minHeight: "2.5rem" }}>
        <Loader2 className="w-3 h-3 text-gray-300 animate-spin" />
      </div>
    );
  }

  if (originalPrice <= 0) {
    return null;
  }

  const { promoPrice, discountLabel } = computePromoPrice(originalPrice, promo, product);

  return (
    <div className="space-y-0.5" style={{ minHeight: "2.5rem" }}>
      {/* "De R$ X" — strikethrough */}
      <p className="text-gray-400 line-through" style={{ fontSize: "0.68rem", lineHeight: 1.3 }}>
        De {formatBRL(originalPrice)}
      </p>
      {/* "Por R$ Y" — highlighted */}
      <div className="flex items-center gap-1">
        <span
          className="text-emerald-700"
          style={{ fontSize: "1rem", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.2 }}
        >
          {formatBRL(promoPrice)}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <span
          className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded flex items-center gap-0.5"
          style={{ fontSize: "0.56rem", fontWeight: 700 }}
        >
          <Zap className="w-2.5 h-2.5" />
          {discountLabel}
        </span>
      </div>
    </div>
  );
}

/* ═══════ Product Card ═══════ */
function PromoCard({ product, promo, preloadedPrice, preloadedBalance }: { product: api.SuperPromoProduct; promo: SuperPromo; preloadedPrice?: number | null; preloadedBalance?: ProductBalance | null }) {
  const { catalogMode } = useCatalogMode();

  // Compute effective discount label for this product
  const effectiveLabel = (() => {
    if (catalogMode) return "PROMO";
    if (product.promoPrice != null && product.promoPrice > 0) {
      return formatBRL(product.promoPrice);
    }
    const dType = product.customDiscountType || promo.discountType;
    const dValue = (product.customDiscountValue != null && product.customDiscountValue > 0)
      ? product.customDiscountValue : promo.discountValue;
    return dType === "percentage"
      ? "-" + dValue + "%"
      : "-R$" + dValue.toFixed(2).replace(".", ",");
  })();

  return (
    <Link
      to={"/produto/" + encodeURIComponent(product.sku)}
      className="group bg-white rounded-xl border border-gray-100 overflow-hidden flex flex-col"
      style={{
        boxShadow: "0 1px 8px rgba(0,0,0,0.08)",
        transition: "transform 0.35s cubic-bezier(.22,.61,.36,1), box-shadow 0.35s cubic-bezier(.22,.61,.36,1)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-4px)";
        e.currentTarget.style.boxShadow = "0 12px 28px rgba(0,0,0,0.18)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 1px 8px rgba(0,0,0,0.08)";
      }}
    >
      {/* Image */}
      <div className="relative bg-white aspect-square flex items-center justify-center overflow-hidden">
        {/* Discount badge */}
        <div
          className="absolute top-2 left-2 z-10 text-white px-2 py-0.5 rounded-md flex items-center gap-1"
          style={{ fontSize: "0.62rem", fontWeight: 800, background: "#16a34a" }}
        >
          <Zap className="w-3 h-3" />
          {effectiveLabel}
        </div>
        <ProductImage
          sku={product.sku}
          alt={product.titulo}
          className="w-full h-full object-contain p-4"
          style={{ transition: "transform 0.5s cubic-bezier(.22,.61,.36,1)" }}
          onMouseEnter={(e) => { (e.target as HTMLImageElement).style.transform = "scale(1.06)"; }}
          onMouseLeave={(e) => { (e.target as HTMLImageElement).style.transform = "scale(1)"; }}
          fallback={
            <div className="flex flex-col items-center justify-center gap-1 text-gray-200">
              <Package className="w-10 h-10" />
              <span style={{ fontSize: "0.65rem" }} className="text-gray-300">Sem imagem</span>
            </div>
          }
        />
      </div>

      {/* Info */}
      <div className="p-3 border-t border-gray-100 flex flex-col flex-1">
        <h4
          className="text-gray-800 line-clamp-2 leading-tight mb-1 group-hover:text-red-600 transition-colors flex-1"
          style={{ fontSize: "0.75rem", fontWeight: 600, minHeight: "2.4em" }}
        >
          {product.titulo}
        </h4>

        {/* Review Stars */}
        <div className="mb-1">
          <ReviewStars sku={product.sku} />
        </div>

        {/* "De X por Y" */}
        <PromoPriceDisplay sku={product.sku} promo={promo} product={product} preloadedPrice={preloadedPrice} hidePrices={catalogMode} />

        {/* Stock bar */}
        <StockBar sku={product.sku} preloaded={preloadedBalance} />

        {/* CTA */}
        <div
          className={"mt-2.5 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg " + (catalogMode ? "bg-gray-600 text-white group-hover:bg-gray-700" : "bg-red-600 text-white group-hover:bg-red-700")}
          style={{
            fontSize: "0.7rem",
            fontWeight: 700,
            transition: "background 0.3s ease, box-shadow 0.3s ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.boxShadow = catalogMode ? "0 4px 12px rgba(75,85,99,0.35)" : "0 4px 12px rgba(220,38,38,0.35)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; }}
        >
          {catalogMode ? "Ver Detalhes" : "Comprar"}
          <ArrowRight className="w-3.5 h-3.5" />
        </div>
      </div>
    </Link>
  );
}

/* ═══════ CONSTANTS ═══════ */
const VISIBLE_DESKTOP = 7;
const GAP_PX = 10;

/* ═══════ Main Section ═══════ */
export function SuperPromoSection() {
  const [promo, setPromo] = useState<SuperPromo | null>(null);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canL, setCanL] = useState(false);
  const [canR, setCanR] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const autoScrollRef = useRef<number | null>(null);
  const scrollDirRef = useRef<1 | -1>(1);
  const [priceMap, setPriceMap] = useState<Record<string, number | null>>({});
  const [balanceMap, setBalanceMap] = useState<Record<string, ProductBalance | null>>({});

  // Check if last visit had an active promo (to decide whether to reserve space while loading)
  const [hadPromoLastVisit] = useState<boolean>(() => {
    try { return localStorage.getItem("carretao_had_promo") === "1"; } catch { return false; }
  });

  // Use promo data from HomepageInit context (avoids separate /promo/active API call)
  const { data: initData, loading: initLoading } = useHomepageInit();

  useEffect(() => {
    if (initLoading) return;
    const p = (initData && initData.promo) ? initData.promo : null;

    // Client-side expiration check — don't show expired promos from cache
    if (p && p.endDate && Date.now() > p.endDate) {
      setPromo(null);
      setLoading(false);
      try { localStorage.removeItem("carretao_had_promo"); } catch {}
      return;
    }

    setPromo(p);
    setLoading(false);
    // Cache whether promo exists for next visit's CLS prevention
    try {
      if (p && p.products && p.products.length > 0) {
        localStorage.setItem("carretao_had_promo", "1");
      } else {
        localStorage.removeItem("carretao_had_promo");
      }
    } catch {}

    // Auto-hide: schedule removal when endDate arrives (if user stays on homepage)
    if (p && p.endDate) {
      const remaining = p.endDate - Date.now();
      if (remaining > 0) {
        const timerId = setTimeout(() => {
          setPromo(null);
          try { localStorage.removeItem("carretao_had_promo"); } catch {}
        }, remaining);
        return () => clearTimeout(timerId);
      }
    }
  }, [initData, initLoading]);

  // Bulk-fetch prices and balances when promo loads.
  // Stagger by 800ms to let HomePage bulk calls go first (they share the global concurrency limiter).
  useEffect(() => {
    if (!promo || !promo.products || promo.products.length === 0) return;
    const skus = promo.products.map((p) => p.sku);
    const ac = new AbortController();

    const timer = setTimeout(() => {
      if (ac.signal.aborted) return;

      api.getProductPricesBulk(skus, { signal: ac.signal })
        .then((res) => {
          if (ac.signal.aborted) return;
          const map: Record<string, number | null> = {};
          for (const p of (res.results || [])) {
            map[p.sku] = (p.found && p.price != null) ? p.price : null;
          }
          setPriceMap(map);
          // Seed PriceBadge module cache with full ProductPrice objects
          seedPriceCache((res.results || []).map((p: ProductPrice) => ({ sku: p.sku, data: p })));
        })
        .catch((e) => { if (e && e.name !== "AbortError") console.error("[SuperPromo] Bulk price error:", e); });

      api.getProductBalances(skus, { signal: ac.signal })
        .then((res) => {
          if (ac.signal.aborted) return;
          const map: Record<string, ProductBalance | null> = {};
          for (const b of (res.results || [])) {
            map[b.sku] = b;
          }
          setBalanceMap(map);
          // Seed StockBar module cache
          seedStockCache((res.results || []).map((b: any) => ({
            sku: b.sku,
            qty: b.found ? (b.disponivel ?? b.quantidade ?? 0) : null,
          })));
        })
        .catch((e) => { if (e && e.name !== "AbortError") console.error("[SuperPromo] Bulk balance error:", e); });

      // Seed ReviewStars cache for promo products
      api.getReviewSummariesBatch(skus, { signal: ac.signal })
        .then((res) => {
          if (ac.signal.aborted) return;
          var summaries = res.summaries || {};
          var entries: Array<{ sku: string; averageRating: number; totalReviews: number }> = [];
          for (var si = 0; si < skus.length; si++) {
            var s = skus[si];
            entries.push(summaries[s]
              ? { sku: s, averageRating: summaries[s].averageRating, totalReviews: summaries[s].totalReviews }
              : { sku: s, averageRating: 0, totalReviews: 0 });
          }
          seedReviewStarsCache(entries);
        })
        .catch((e) => { if (e && e.name !== "AbortError") console.error("[SuperPromo] Bulk review summaries error:", e); });
    }, 800);

    return () => { ac.abort(); clearTimeout(timer); };
  }, [promo]);

  const totalProducts = promo?.products?.length || 0;
  const hasOverflow = totalProducts > VISIBLE_DESKTOP;

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanL(el.scrollLeft > 2);
    setCanR(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const t = setTimeout(checkScroll, 200);
    el.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    return () => { clearTimeout(t); el.removeEventListener("scroll", checkScroll); window.removeEventListener("resize", checkScroll); };
  }, [promo, checkScroll]);

  /* Auto-scroll when > 7 products, pauses on hover */
  useEffect(() => {
    if (!hasOverflow || isHovered) {
      if (autoScrollRef.current) {
        cancelAnimationFrame(autoScrollRef.current);
        autoScrollRef.current = null;
      }
      return;
    }

    const el = scrollRef.current;
    if (!el) return;

    const speed = 0.4;
    const tick = () => {
      if (!el) return;
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (el.scrollLeft >= maxScroll - 1) {
        scrollDirRef.current = -1;
      } else if (el.scrollLeft <= 1) {
        scrollDirRef.current = 1;
      }
      el.scrollLeft += speed * scrollDirRef.current;
      autoScrollRef.current = requestAnimationFrame(tick);
    };

    const delay = setTimeout(() => {
      autoScrollRef.current = requestAnimationFrame(tick);
    }, 2000);

    return () => {
      clearTimeout(delay);
      if (autoScrollRef.current) {
        cancelAnimationFrame(autoScrollRef.current);
        autoScrollRef.current = null;
      }
    };
  }, [hasOverflow, isHovered, promo]);

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const cardWidth = el.clientWidth / VISIBLE_DESKTOP;
    el.scrollBy({ left: dir === "left" ? -(cardWidth * 2) : (cardWidth * 2), behavior: "smooth" });
  };

  if (loading) {
    // Only reserve space if last visit had a promo (avoids 320px→0px CLS when no promo)
    if (!hadPromoLastVisit) return null;
    return (
      <section style={{ minHeight: "320px" }} aria-hidden="true" />
    );
  }

  if (!promo || !promo.products || promo.products.length === 0) return null;

  const bg = promo.bgColor || "#e52020";

  return (
    <section className="relative" style={{ overflow: "clip" }}>
      {/* Gradient base — vibrant red */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #ef2020 0%, " + bg + " 40%, #dc2626 70%, #c81e1e 100%)" }} />
      {/* Shine sweep effect — passes over the red bg only, not over products */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ overflow: "hidden", contain: "strict" }}
      >
        <div className="super-promo-shine" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 py-6 sm:py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center shrink-0 relative">
              <div className="promo-fire-glow-layer" />
              <Flame className="w-6 h-6 text-yellow-300 promo-fire-icon" />
            </div>
            <div>
              <h2 className="leading-tight">
                <span
                  className="bg-white text-red-600 px-3 py-1 rounded-md inline-block"
                  style={{ fontSize: "clamp(1rem, 3vw, 1.35rem)", fontWeight: 800, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}
                >
                  {(promo.title || "Super Promoção").replace("Promocao", "Promoção")}
                </span>
              </h2>
              {promo.subtitle && (
                <p className="text-white/80 mt-1" style={{ fontSize: "0.78rem", lineHeight: 1.3, fontWeight: 500 }}>{promo.subtitle}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-yellow-300 hidden sm:inline animate-pulse" style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Acaba em
            </span>
            <Countdown endDate={promo.endDate} />
          </div>
        </div>

        {/* Carousel */}
        <div
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div
            ref={scrollRef}
            className="flex overflow-x-auto promo-no-scrollbar"
            style={{
              gap: GAP_PX + "px",
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              WebkitOverflowScrolling: "touch",
              scrollBehavior: "auto",
              padding: "8px 4px 36px 4px",
              margin: "0 -4px -24px -4px",
            }}
          >
            {promo.products.map((p) => (
              <div
                key={p.sku}
                className="flex-shrink-0"
                style={{
                  width: "calc((100% - " + (VISIBLE_DESKTOP - 1) * GAP_PX + "px) / " + VISIBLE_DESKTOP + ")",
                  minWidth: "140px",
                }}
              >
                <PromoCard
                  product={p}
                  promo={promo}
                  preloadedPrice={priceMap[p.sku]}
                  preloadedBalance={balanceMap[p.sku]}
                />
              </div>
            ))}
          </div>

          {/* Nav buttons BELOW — only when > 7 products on desktop */}
          {hasOverflow && (
            <div className="hidden lg:flex items-center justify-center gap-3 mt-4">
              <button
                onClick={() => scroll("left")}
                disabled={!canL}
                className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/35 disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center"
                style={{ transition: "background 0.25s ease, opacity 0.25s ease, transform 0.2s ease" }}
                onMouseEnter={(e) => { if (canL) e.currentTarget.style.transform = "scale(1.12)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
              >
                <ChevronLeft className="w-4 h-4 text-white" />
              </button>

              <div className="flex items-center gap-1.5">
                {Array.from({ length: Math.ceil(totalProducts / VISIBLE_DESKTOP) }).map((_, i) => (
                  <div
                    key={i}
                    className="rounded-full bg-white/30"
                    style={{
                      width: i === 0 ? "16px" : "6px",
                      height: "6px",
                      transition: "all 0.3s ease",
                    }}
                  />
                ))}
              </div>

              <button
                onClick={() => scroll("right")}
                disabled={!canR}
                className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/35 disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center"
                style={{ transition: "background 0.25s ease, opacity 0.25s ease, transform 0.2s ease" }}
                onMouseEnter={(e) => { if (canR) e.currentTarget.style.transform = "scale(1.12)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
              >
                <ChevronRight className="w-4 h-4 text-white" />
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{".promo-no-scrollbar::-webkit-scrollbar{display:none}.super-promo-shine{position:absolute;top:-50%;width:45%;height:200%;background:linear-gradient(105deg,transparent 38%,rgba(255,255,255,0.07) 43%,rgba(255,255,255,0.14) 50%,rgba(255,255,255,0.07) 57%,transparent 62%);transform:translateX(-200%) skewX(-15deg);animation:superShine 12s cubic-bezier(.4,0,.2,1) infinite;will-change:transform}@keyframes superShine{0%{transform:translateX(-200%) skewX(-15deg);opacity:0}5%{opacity:1}45%{transform:translateX(400%) skewX(-15deg);opacity:1}50%{transform:translateX(400%) skewX(-15deg);opacity:0}100%{transform:translateX(400%) skewX(-15deg);opacity:0}}.promo-fire-icon{animation:fireFloat 2s ease-in-out infinite;transform-origin:bottom center;filter:drop-shadow(0 0 6px rgba(253,224,71,0.6)) drop-shadow(0 0 12px rgba(239,68,68,0.3))}.promo-fire-glow-layer{position:absolute;inset:-4px;border-radius:12px;background:radial-gradient(circle,rgba(253,224,71,0.3) 0%,rgba(239,68,68,0.15) 50%,transparent 70%);animation:fireGlow 2s ease-in-out infinite;pointer-events:none}@keyframes fireFloat{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-2px) scale(1.05)}}@keyframes fireGlow{0%,100%{opacity:0.4}50%{opacity:0.9}}"}</style>
    </section>
  );
}