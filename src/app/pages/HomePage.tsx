import { Link } from "react-router";
import { ProductCard } from "../components/ProductCard";
import type { ProdutoItem } from "../components/ProductCard";
import {
  ArrowRight,
  ChevronRight,
  ChevronLeft,
  Package,
  MessageCircle,
  Sparkles,
  Search,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import * as api from "../services/api";
import type { BannerItem, ProductBalance, ProductPrice, HomepageCategoryCard, MidBanner } from "../services/api";
import { SuperPromoSection } from "../components/SuperPromoSection";
import { seedPriceCache } from "../components/PriceBadge";
import { seedStockCache } from "../components/StockBar";
import { seedReviewStarsCache } from "../components/ReviewStars";
import { useHomepageInit } from "../contexts/HomepageInitContext";
import { OptimizedImage } from "../components/OptimizedImage";
import React from "react";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { ProductCardSkeletonGrid } from "../components/ProductCardSkeleton";
import { RecentlyViewedSection } from "../components/RecentlyViewedSection";
import { BrandCarousel } from "../components/BrandCarousel";
import "../utils/emptyStateAnimations";

/** Hook to animate elements when they scroll into view */
function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, isVisible };
}

const DEFAULT_HERO_IMAGE = "https://images.unsplash.com/photo-1698998882494-57c3e043f340?crop=entropy&cs=tinysrgb&fit=max&fm=webp&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhdXRvbW90aXZlJTIwbWVjaGFuaWMlMjB3b3Jrc2hvcHxlbnwxfHx8fDE3NzA5ODY5MDh8MA&ixlib=rb-4.1.0&q=75&w=1080";

/** Banner Carousel component — full-width responsive slider with smooth translateX transitions */
function HeroBannerCarousel({ banners }: { banners: BannerItem[] }) {
  const [current, setCurrent] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const touchStartRef = useRef<number>(0);
  const touchMoveRef = useRef<number>(0);
  const [dragOffset, setDragOffset] = useState(0);
  const isDragging = useRef(false);

  const count = banners.length;

  const goTo = useCallback((idx: number) => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setCurrent(((idx % count) + count) % count);
    setTimeout(() => setIsTransitioning(false), 550);
  }, [count, isTransitioning]);

  const next = useCallback(() => goTo(current + 1), [current, goTo]);
  const prev = useCallback(() => goTo(current - 1), [current, goTo]);

  // Auto-play
  useEffect(() => {
    if (count <= 1) return;
    timerRef.current = setInterval(next, 6000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [count, next]);

  // Reset timer on manual interaction
  const resetTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (count > 1) timerRef.current = setInterval(next, 6000);
  }, [count, next]);

  const handlePrev = () => { prev(); resetTimer(); };
  const handleNext = () => { next(); resetTimer(); };
  const handleDot = (idx: number) => { goTo(idx); resetTimer(); };

  // Touch swipe with drag feedback
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = e.touches[0].clientX;
    touchMoveRef.current = e.touches[0].clientX;
    isDragging.current = true;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    touchMoveRef.current = e.touches[0].clientX;
    const diff = touchMoveRef.current - touchStartRef.current;
    setDragOffset(diff);
  };
  const handleTouchEnd = () => {
    isDragging.current = false;
    const diff = touchStartRef.current - touchMoveRef.current;
    setDragOffset(0);
    if (Math.abs(diff) > 50) {
      if (diff > 0) handleNext();
      else handlePrev();
    }
  };

  return (
    <section
      className="relative group w-full"
      style={{ backgroundColor: "#111827" }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Slides — stacked. Active slide is in normal flow (defines height). Others are absolute + hidden. */}
      {banners.map((b, idx) => {
        const hasOverlay = b.title || b.subtitle || b.buttonText;
        const isExt = b.buttonLink?.startsWith("http");
        const isActive = idx === current;
        return (
          <div
            key={b.id}
            style={{
              position: isActive ? "relative" : "absolute",
              top: 0,
              left: 0,
              width: "100%",
              opacity: isActive ? 1 : 0,
              transition: "opacity 550ms ease-in-out",
              zIndex: isActive ? 1 : 0,
              pointerEvents: isActive ? "auto" as const : "none" as const,
            }}
          >
            {/* Image — pure block flow. width 100%, height auto. NO container, NO object-fit, NO absolute. */}
            <img
              src={b.imageUrl}
              alt={b.title || "Banner"}
              width={1920}
              height={647}
              style={{
                display: "block",
                width: "100%",
                height: "auto",
                maxWidth: "none",
                opacity: hasOverlay ? 0.45 : 1,
              }}
              // @ts-ignore
              fetchpriority={idx === 0 ? "high" : "low"}
              loading={idx === 0 ? "eager" : "lazy"}
              draggable={false}
            />

            {/* Dark background behind image for overlays */}
            {hasOverlay && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: "#111827",
                  zIndex: -1,
                }}
              />
            )}

            {/* Content overlay */}
            {hasOverlay && (
              <div className="absolute inset-0 flex items-center z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
                  <div className="max-w-2xl">
                    {b.title && (
                      <h1
                        className="text-white mb-3 sm:mb-4"
                        style={{ fontSize: "clamp(1.4rem, 4.5vw, 3rem)", fontWeight: 700, lineHeight: 1.15 }}
                      >
                        {b.title}
                      </h1>
                    )}
                    {b.subtitle && (
                      <p
                        className="text-gray-200 mb-5 sm:mb-8 max-w-lg"
                        style={{ fontSize: "clamp(0.8rem, 2vw, 1rem)", lineHeight: 1.7 }}
                      >
                        {b.subtitle}
                      </p>
                    )}
                    {b.buttonText && b.buttonLink && (
                      <div className="flex flex-wrap gap-3">
                        {isExt ? (
                          <a
                            href={b.buttonLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-red-600 hover:bg-red-700 text-white px-5 sm:px-6 py-2.5 sm:py-3 rounded-lg flex items-center gap-2 transition-colors"
                            style={{ fontSize: "clamp(0.8rem, 1.5vw, 0.95rem)", fontWeight: 500 }}
                          >
                            {b.buttonText}
                            <ArrowRight className="w-4 h-4" />
                          </a>
                        ) : (
                          <Link
                            to={b.buttonLink}
                            className="bg-red-600 hover:bg-red-700 text-white px-5 sm:px-6 py-2.5 sm:py-3 rounded-lg flex items-center gap-2 transition-colors"
                            style={{ fontSize: "clamp(0.8rem, 1.5vw, 0.95rem)", fontWeight: 500 }}
                          >
                            {b.buttonText}
                            <ArrowRight className="w-4 h-4" />
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Full-area link when no text overlay */}
            {!hasOverlay && b.buttonLink && (
              isExt ? (
                <a href={b.buttonLink} target="_blank" rel="noopener noreferrer" className="absolute inset-0 z-10" />
              ) : (
                <Link to={b.buttonLink} className="absolute inset-0 z-10" />
              )
            )}
          </div>
        );
      })}

      {/* Navigation Arrows */}
      {count > 1 && (
        <>
          <button
            onClick={handlePrev}
            className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 z-20 bg-black/30 hover:bg-black/60 text-white p-2 sm:p-2.5 rounded-full backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
            aria-label="Banner anterior"
          >
            <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
          <button
            onClick={handleNext}
            className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 z-20 bg-black/30 hover:bg-black/60 text-white p-2 sm:p-2.5 rounded-full backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
            aria-label="Próximo banner"
          >
            <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </>
      )}

      {/* Dot Indicators — uses transform+opacity for composited animations */}
      {count > 1 && (
        <div className="absolute bottom-3 sm:bottom-5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-black/20 backdrop-blur-sm px-3 py-1.5 rounded-full">
          {banners.map((_, idx) => {
            const isActive = idx === current;
            return (
              <button
                key={idx}
                onClick={() => handleDot(idx)}
                className="relative h-2.5 overflow-hidden rounded-full"
                style={{
                  width: "28px",
                  transform: isActive ? "scaleX(1)" : "scaleX(0.36)",
                  transformOrigin: "center",
                  transition: "transform 0.3s ease",
                }}
                aria-label={"Banner " + (idx + 1)}
              >
                {/* Inactive layer */}
                <span
                  className="absolute inset-0 rounded-full"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.4)",
                    opacity: isActive ? 0 : 1,
                    transition: "opacity 0.3s ease",
                  }}
                />
                {/* Active layer */}
                <span
                  className="absolute inset-0 rounded-full"
                  style={{
                    backgroundColor: "#ef4444",
                    opacity: isActive ? 1 : 0,
                    transition: "opacity 0.3s ease",
                  }}
                />
              </button>
            );
          })}
        </div>
      )}

      {/* Slide counter */}
      {count > 1 && (
        <div className="absolute top-3 right-3 z-20 bg-black/40 backdrop-blur-sm text-white px-2.5 py-1 rounded-md" style={{ fontSize: "0.72rem", fontWeight: 600 }}>
          {current + 1} / {count}
        </div>
      )}
    </section>
  );
}

/** Default Hero (fallback when no banners are configured) */
function DefaultHero() {
  return (
    <section className="relative bg-gray-900 overflow-hidden">
      <div className="absolute inset-0">
        <img
          src={DEFAULT_HERO_IMAGE}
          alt="Workshop"
          className="w-full h-full object-cover opacity-30"
          // @ts-ignore
          fetchpriority="high"
          width={1080}
          height={720}
        />
      </div>
      <div className="relative max-w-7xl mx-auto px-4 py-16 md:py-24 lg:py-32">
        <div className="max-w-2xl">
          <span
            className="inline-block bg-red-600 text-white px-3 py-1 rounded-full mb-4"
            style={{ fontSize: "0.8rem", fontWeight: 500 }}
          >
            Catálogo Online
          </span>
          <h1 className="text-white mb-4" style={{ fontSize: "clamp(1.8rem, 5vw, 3rem)", fontWeight: 700, lineHeight: 1.15 }}>
            Encontre as <span className="text-red-500">melhores peças</span> para seu veículo
          </h1>
          <p className="text-gray-300 mb-8 max-w-lg" style={{ fontSize: "1rem", lineHeight: 1.7 }}>
            Peças automotivas das melhores marcas. Qualidade garantida, entrega rápida e preços imbatíveis.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/catalogo"
              className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg flex items-center gap-2 transition-colors"
              style={{ fontSize: "0.95rem", fontWeight: 500 }}
            >
              Ver Catálogo
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/contato"
              className="bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-lg border border-white/20 transition-colors"
              style={{ fontSize: "0.95rem", fontWeight: 500 }}
            >
              Fale Conosco
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function HomePage() {
  useDocumentMeta({
    title: "Carretão Auto Peças - Peças para Caminhões | Catálogo Online",
    description: "Carretão Auto Peças: especialista em peças para caminhões. Catálogo com mais de 15.000 peças, entrega para todo o Brasil, garantia e atendimento especializado. Compre online com desconto no PIX.",
    ogTitle: "Carretão Auto Peças - Peças para Caminhões",
    ogDescription: "Catálogo com mais de 15.000 peças automotivas. Especialista em caminhões, entrega para todo o Brasil.",
    canonical: window.location.origin,
  });

  const [produtos, setProdutos] = useState<ProdutoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [banners, setBanners] = useState<BannerItem[]>([]);
  const [bannersLoaded, setBannersLoaded] = useState(false);
  const [balanceMap, setBalanceMap] = useState<Record<string, ProductBalance>>({});
  const [priceMap, setPriceMap] = useState<Record<string, ProductPrice>>({});
  const [reviewMap, setReviewMap] = useState<Record<string, { averageRating: number; totalReviews: number }>>({});
  // Benefits strip is ATF — do NOT use scroll reveal (causes CLS 0.184)
  // NOTE: productsReveal and ctaReveal use OPACITY-ONLY animation.
  // translate-y was removed because it caused CLS 0.410 in Lighthouse.
  const productsReveal = useScrollReveal();
  const ctaReveal = useScrollReveal();

  // Use banners from HomepageInit context
  const { data: initData, loading: initLoading } = useHomepageInit();

  // Debug: log homepage categories data to verify API integration
  useEffect(function () {
    if (initData) {
      var cats = initData.homepageCategories;
      console.log("[HomePage] initData.homepageCategories:", cats ? cats.length + " items" : "undefined", cats);
      var mbs = initData.midBanners;
      console.log("[HomePage] initData.midBanners:", mbs ? mbs.length + " items" : "undefined", mbs);
    }
  }, [initData]);

  // Preload cached banner URL immediately on mount (before API response — reduces LCP)
  useEffect(() => {
    const cachedBannerUrl = (() => {
      try { return localStorage.getItem("carretao_first_banner_url"); } catch { return null; }
    })();
    if (cachedBannerUrl) {
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "image";
      link.href = cachedBannerUrl;
      // @ts-ignore
      link.fetchPriority = "high";
      document.head.appendChild(link);
    }
  }, []);

  // Consume banners from context once loaded
  useEffect(() => {
    if (initLoading) return;

    const b = (initData && initData.banners) ? initData.banners : [];
    setBanners(b);
    // Cache the first banner URL for instant preload on next visit
    if (b.length > 0 && b[0].imageUrl) {
      try { localStorage.setItem("carretao_first_banner_url", b[0].imageUrl); } catch {}
    } else {
      try { localStorage.removeItem("carretao_first_banner_url"); } catch {}
    }
    setBannersLoaded(true);
  }, [initData, initLoading]);

  useEffect(() => {
    const load = async () => {
      try {
        const result = await api.getDestaques(10);
        setProdutos(result.data);
      } catch (e) {
        console.error("Erro ao carregar produtos do catalogo:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Bulk-load prices + stocks after products are fetched
  useEffect(() => {
    if (produtos.length === 0) return;
    // Wait for homepage-init to resolve first — this guarantees the edge function
    // is warm and avoids "Network error" on cold-start POST requests.
    if (initLoading) return;

    const ac = new AbortController();
    const skus = produtos.map((p) => p.sku);

    // Fetch prices and stocks in parallel (2 calls instead of 20)
    api.getProductPricesBulk(skus, { signal: ac.signal })
      .then((res) => {
        if (ac.signal.aborted) return;
        const map: Record<string, ProductPrice> = {};
        for (const p of (res.results || [])) { map[p.sku] = p; }
        setPriceMap(map);
        // Seed the PriceBadge module cache to prevent individual fetches
        seedPriceCache((res.results || []).map((p: ProductPrice) => ({ sku: p.sku, data: p })));
      })
      .catch((e) => { if (e && e.name !== "AbortError") console.error("[HomePage] Bulk price error:", e); });

    api.getProductBalances(skus, { signal: ac.signal })
      .then((res) => {
        if (ac.signal.aborted) return;
        const map: Record<string, ProductBalance> = {};
        for (const b of (res.results || [])) { map[b.sku] = b; }
        setBalanceMap(map);
        // Seed the StockBar module cache to prevent individual fetches
        seedStockCache((res.results || []).map((b: any) => ({
          sku: b.sku,
          qty: b.found ? (b.disponivel ?? b.quantidade ?? 0) : null,
        })));
      })
      .catch((e) => { if (e && e.name !== "AbortError") console.error("[HomePage] Bulk balance error:", e); });

    // Fetch review summaries in parallel (seeds ReviewStars cache)
    api.getReviewSummariesBatch(skus, { signal: ac.signal })
      .then((res) => {
        if (ac.signal.aborted) return;
        var entries: Array<{ sku: string; averageRating: number; totalReviews: number }> = [];
        var summaries = res.summaries || {};
        for (var sk in summaries) {
          entries.push({ sku: sk, averageRating: summaries[sk].averageRating, totalReviews: summaries[sk].totalReviews });
        }
        seedReviewStarsCache(entries);
        // Build reviewMap for ALL skus (default 0/0 for products without reviews)
        var rMap: Record<string, { averageRating: number; totalReviews: number }> = {};
        for (var si = 0; si < skus.length; si++) {
          var s = skus[si];
          rMap[s] = summaries[s]
            ? { averageRating: summaries[s].averageRating, totalReviews: summaries[s].totalReviews }
            : { averageRating: 0, totalReviews: 0 };
        }
        setReviewMap(rMap);
      })
      .catch((e) => { if (e && e.name !== "AbortError") console.error("[HomePage] Review batch error:", e); });

    return function () { ac.abort(); };
  }, [produtos, initLoading]);

  return (
    <div className="min-h-screen">
      {/* Hero Section — dynamic banners or default */}
      {!bannersLoaded ? (
        /* Skeleton — reserve reasonable space while loading */
        <section
          className="relative bg-gray-900 overflow-hidden"
          aria-hidden="true"
        >
          <div className="w-full bg-gray-800 animate-pulse" style={{ aspectRatio: "16 / 4" }} />
        </section>
      ) : banners.length > 0 ? (
        <HeroBannerCarousel banners={banners} />
      ) : (
        <DefaultHero />
      )}

      {/* Categories Strip — ATF, homepage categories with images (replaces old benefits) */}
      {(() => {
        var adminCats: HomepageCategoryCard[] = (initData && initData.homepageCategories) ? initData.homepageCategories : [];
        var treeCats = (initData && initData.categoryTree) ? initData.categoryTree : [];
        var catItems: Array<{ id: string; name: string; slug: string; imageUrl?: string }> = [];
        if (adminCats.length > 0) {
          for (var ci = 0; ci < adminCats.length; ci++) {
            catItems.push({ id: adminCats[ci].id, name: adminCats[ci].name, slug: adminCats[ci].categorySlug, imageUrl: adminCats[ci].imageUrl });
          }
        } else {
          for (var ti = 0; ti < treeCats.length; ti++) {
            catItems.push({ id: treeCats[ti].id || treeCats[ti].slug, name: treeCats[ti].name, slug: treeCats[ti].slug });
          }
        }
        // ── CLS FIX: Show skeleton while loading instead of returning null ──
        // This reserves vertical space and prevents 0.549 CLS on <main>.
        if (initLoading) {
          return (
            <section className="bg-white border-b border-gray-100 py-5" aria-hidden="true">
              <div className="max-w-7xl mx-auto px-4">
                <div className="h-4 bg-gray-100 rounded w-24 mb-3 animate-pulse" />
                <div className="flex gap-3 overflow-hidden">
                  {[1,2,3,4,5,6,7,8].map(function (i) {
                    return (
                      <div key={i} className="flex items-center gap-3 shrink-0 rounded-full border border-gray-100 pl-1.5 pr-5 py-1.5">
                        <div className="w-9 h-9 rounded-full bg-gray-100 animate-pulse" />
                        <div className="w-16 h-3.5 bg-gray-100 rounded animate-pulse" />
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        }
        if (catItems.length === 0) return null;
        var catScrollRef = React.createRef<HTMLDivElement>();
        var scrollCats = function (dir: "left" | "right") {
          if (!catScrollRef.current) return;
          var amount = dir === "left" ? -200 : 200;
          catScrollRef.current.scrollBy({ left: amount, behavior: "smooth" });
        };
        return (
          <section className="bg-white border-b border-gray-100 py-5">
            <div className="max-w-7xl mx-auto px-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-gray-700" style={{ fontSize: "0.85rem", fontWeight: 700 }}>
                  Categorias
                </h3>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={function () { scrollCats("left"); }}
                    className="p-1.5 rounded-full border border-gray-200 bg-white hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                    aria-label="Rolar categorias para esquerda"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={function () { scrollCats("right"); }}
                    className="p-1.5 rounded-full border border-gray-200 bg-white hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                    aria-label="Rolar categorias para direita"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div ref={catScrollRef} className="flex gap-3 overflow-x-auto pb-1 hide-scrollbar" style={{ WebkitOverflowScrolling: "touch" }}>
                {catItems.map(function (cat) {
                  return (
                    <Link
                      key={cat.id}
                      to={"/catalogo?categoria=" + cat.slug}
                      className={"group flex items-center gap-3 shrink-0 bg-white rounded-full border border-gray-200 hover:border-red-300 hover:shadow-sm transition-all duration-200 " + (cat.imageUrl ? "pl-1.5 pr-5 py-1.5" : "px-5 py-2.5")}
                    >
                      {cat.imageUrl && (
                        <div className="w-9 h-9 rounded-full overflow-hidden bg-gray-100 shrink-0">
                          <img
                            src={cat.imageUrl}
                            alt={cat.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            decoding="async"
                            width={36}
                            height={36}
                            draggable={false}
                          />
                        </div>
                      )}
                      <span
                        className="text-gray-700 group-hover:text-gray-900 whitespace-nowrap transition-colors"
                        style={{ fontSize: "0.8rem", fontWeight: 500 }}
                      >
                        {cat.name}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        );
      })()}

      {/* Super Promo Section — between categories and products */}
      <SuperPromoSection />

      {/* Mid-Page Banners (Position 1) — slots 3 & 4, after Super Promo */}
      {(() => {
        var mbs: MidBanner[] = (initData && initData.midBanners) ? initData.midBanners : [];
        var topMbs = mbs.filter(function (mb) { return (mb.slot === 3 || mb.slot === 4) && mb.active && mb.imageUrl; });
        if (topMbs.length === 0) return null;
        return (
          <section className="bg-white py-6 md:py-8">
            <div className="max-w-7xl mx-auto px-4">
              <div className={"grid gap-4 " + (topMbs.length === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1")}>
                {topMbs.map(function (mb) {
                  var inner = (
                    <div
                      className="relative w-full overflow-hidden rounded-xl bg-gray-100 group"
                      style={{ aspectRatio: "2048 / 595" }}
                    >
                      <img
                        src={mb.imageUrl!}
                        alt={"Banner " + mb.slot}
                        className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                        loading="lazy"
                        decoding="async"
                        width={2048}
                        height={595}
                        draggable={false}
                      />
                    </div>
                  );
                  if (mb.link) {
                    var isExt = mb.link.startsWith("http");
                    if (isExt) {
                      return (
                        <a key={mb.slot} href={mb.link} target="_blank" rel="noopener noreferrer" className="block hover:opacity-95 transition-opacity">
                          {inner}
                        </a>
                      );
                    }
                    return (
                      <Link key={mb.slot} to={mb.link} className="block hover:opacity-95 transition-opacity">
                        {inner}
                      </Link>
                    );
                  }
                  return <div key={mb.slot}>{inner}</div>;
                })}
              </div>
            </div>
          </section>
        );
      })()}

      {/* Products from DB */}
      <section className="py-12 md:py-16 bg-gray-50">
        <div
          ref={productsReveal.ref}
          className={"max-w-7xl mx-auto px-4 transition-opacity duration-700 " +
            (productsReveal.isVisible ? "opacity-100" : "opacity-0")}
        >
          <div className="flex items-end justify-between mb-8">
            <div>
              <span
                className="text-red-600 mb-1.5 block"
                style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}
              >
                Catálogo
              </span>
              <h2 className="text-gray-800" style={{ fontSize: "1.6rem", fontWeight: 800, letterSpacing: "-0.01em" }}>
                Peças em Destaque
              </h2>
            </div>
            <Link
              to="/catalogo"
              className="hidden sm:flex items-center gap-1.5 text-red-600 hover:text-red-700 transition-colors bg-red-50 hover:bg-red-100 px-4 py-2 rounded-lg"
              style={{ fontSize: "0.85rem", fontWeight: 600 }}
            >
              Ver todos
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          {loading ? (
            <ProductCardSkeletonGrid />
          ) : produtos.length === 0 ? (
            <div className="text-center py-16 flex flex-col items-center">
              <div className="relative mb-5">
                <div
                  className="w-24 h-24 rounded-full border-2 border-dashed border-gray-200 flex items-center justify-center"
                  style={{ animation: "es-spin 20s linear infinite" }}
                >
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-gray-50 to-red-50 flex items-center justify-center">
                    <Package className="w-7 h-7 text-gray-300" style={{ animation: "es-float 3s ease-in-out infinite" }} />
                  </div>
                </div>
                <Sparkles className="w-3 h-3 text-red-300 absolute -top-0.5 right-0" style={{ animation: "es-twinkle 2s ease-in-out infinite" }} />
              </div>
              <p className="text-gray-500 mb-1" style={{ fontSize: "0.95rem", fontWeight: 600 }}>
                Nenhum produto disponível
              </p>
              <p className="text-gray-400" style={{ fontSize: "0.82rem" }}>
                Estamos atualizando nosso catálogo. Volte em breve!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-5">
              {produtos.map((produto) => (
                <ProductCard
                  key={produto.sku}
                  product={produto}
                  balance={balanceMap[produto.sku]}
                  preloadedPrice={priceMap[produto.sku]}
                  reviewSummary={reviewMap[produto.sku] || null}
                />
              ))}
            </div>
          )}

          <div className="text-center mt-8 sm:hidden">
            <Link
              to="/catalogo"
              className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl transition-colors"
              style={{ fontSize: "0.9rem", fontWeight: 600 }}
            >
              Ver Catálogo Completo
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Mid-Page Banners (Position 2) — slots 1 & 2, after Products */}
      {(() => {
        var mbs: MidBanner[] = (initData && initData.midBanners) ? initData.midBanners : [];
        var activeMbs = mbs.filter(function (mb) { return (mb.slot === 1 || mb.slot === 2) && mb.active && mb.imageUrl; });
        if (activeMbs.length === 0) return null;
        return (
          <section className="bg-white py-6 md:py-8">
            <div className="max-w-7xl mx-auto px-4">
              <div className={"grid gap-4 " + (activeMbs.length === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1")}>
                {activeMbs.map(function (mb) {
                  var inner = (
                    <div
                      className="relative w-full overflow-hidden rounded-xl bg-gray-100 group"
                      style={{ aspectRatio: "2048 / 595" }}
                    >
                      <img
                        src={mb.imageUrl!}
                        alt={"Banner " + mb.slot}
                        className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                        loading="lazy"
                        decoding="async"
                        width={2048}
                        height={595}
                        draggable={false}
                      />
                    </div>
                  );
                  if (mb.link) {
                    var isExt = mb.link.startsWith("http");
                    if (isExt) {
                      return (
                        <a key={mb.slot} href={mb.link} target="_blank" rel="noopener noreferrer" className="block hover:opacity-95 transition-opacity">
                          {inner}
                        </a>
                      );
                    }
                    return (
                      <Link key={mb.slot} to={mb.link} className="block hover:opacity-95 transition-opacity">
                        {inner}
                      </Link>
                    );
                  }
                  return <div key={mb.slot}>{inner}</div>;
                })}
              </div>
            </div>
          </section>
        );
      })()}

      {/* Recently Viewed Products */}
      <RecentlyViewedSection />

      {/* Brand Carousel — after Recently Viewed, before CTA */}
      {initData && initData.brands && initData.brands.length > 0 && (
        <BrandCarousel brands={initData.brands} />
      )}

      {/* CTA Banner */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-red-600 via-red-600 to-red-700" />
        <div className="absolute inset-0 opacity-10">
          <img
            src="https://images.unsplash.com/photo-1767713328609-3ccdca8ef3ab?crop=entropy&cs=tinysrgb&fit=max&fm=webp&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhdXRvbW90aXZlJTIwZW5naW5lJTIwcGFydHMlMjBjbG9zZSUyMHVwfGVufDF8fHx8MTc3MTAxNDIwNXww&ixlib=rb-4.1.0&q=60&w=800"
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            width={800}
            height={533}
          />
        </div>
        <div
          ref={ctaReveal.ref}
          className={"relative max-w-7xl mx-auto px-4 py-14 md:py-16 transition-opacity duration-700 " +
            (ctaReveal.isVisible ? "opacity-100" : "opacity-0")}
        >
          <div className="max-w-2xl mx-auto text-center">
            <h2
              className="text-white mb-3"
              style={{ fontSize: "clamp(1.3rem, 3vw, 1.7rem)", fontWeight: 800, letterSpacing: "-0.01em" }}
            >
              Precisa de ajuda para encontrar a peça certa?
            </h2>
            <p className="text-red-100 mb-7 max-w-xl mx-auto" style={{ fontSize: "0.95rem", lineHeight: 1.6 }}>
              Nossa equipe de especialistas está pronta para ajudar. Entre em contato e encontre a peça ideal para seu veículo.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/contato"
                className="inline-flex items-center gap-2 bg-white text-red-600 hover:bg-gray-50 px-6 py-3 rounded-xl transition-all hover:shadow-lg active:scale-[0.98]"
                style={{ fontSize: "0.95rem", fontWeight: 700 }}
              >
                Falar com Especialista
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="https://wa.me/5544997330202"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white border border-white/20 px-6 py-3 rounded-xl transition-all backdrop-blur-sm"
                style={{ fontSize: "0.95rem", fontWeight: 500 }}
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}