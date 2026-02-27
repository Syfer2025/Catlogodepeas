import { useParams, Link } from "react-router";
import {
  Home,
  ArrowLeft,
  Package,
  Hash,
  Loader2,
  ChevronLeft,
  ChevronRight,
  X,
  Tag,
  Info,
  MessageCircle,
  Copy,
  Check,
  Flame,
  Zap,
  Share2,
  ShieldCheck,
} from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import * as api from "../services/api";
import type { ProductImage, SuperPromo, ProductBalance, ProductPrice } from "../services/api";
import { computePromoPrice, getProductOgUrl } from "../services/api";
import { ProductCard } from "../components/ProductCard";
import type { ProdutoItem } from "../components/ProductCard";
import { StockBadge } from "../components/StockBadge";
import { PriceBadge } from "../components/PriceBadge";
import { seedPriceCache } from "../components/PriceBadge";
import { seedStockCache } from "../components/StockBar";
import { AddToCartButton } from "../components/AddToCartButton";
import { ShippingCalculator } from "../components/ShippingCalculator";
import { WishlistButton } from "../components/WishlistButton";
import { copyToClipboard } from "../utils/clipboard";
import { useGA4 } from "../components/GA4Provider";
import { useHomepageInit } from "../contexts/HomepageInitContext";
import { OptimizedImage } from "../components/OptimizedImage";
import { seedProductImageCache } from "../components/ProductImage";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { toast } from "sonner";
import { useRecentlyViewed } from "../hooks/useRecentlyViewed";
import { RecentlyViewedSection } from "../components/RecentlyViewedSection";
import { consumeProductDataCache } from "../utils/prefetch";
import { ProductReviews } from "../components/ProductReviews";
import { JsonLdBreadcrumb } from "../components/JsonLdBreadcrumb";
import { ShareButtons } from "../components/ShareButtons";

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/* ═══════ Countdown for product detail ═══════ */
function PromoCountdown({ endDate }: { endDate: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endDate]);

  const diff = Math.max(0, endDate - now);
  if (diff <= 0) {
    return (
      <span className="text-red-500 font-bold" style={{ fontSize: "0.85rem" }}>
        Promoção encerrada
      </span>
    );
  }

  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);

  const Block = ({ v, label }: { v: number; label: string }) => (
    <div className="bg-white rounded-lg px-2.5 py-1.5 text-center min-w-[44px] border border-red-200" style={{ boxShadow: "0 2px 8px rgba(220,38,38,0.12)" }}>
      <span className="text-red-600 font-mono font-extrabold block" style={{ fontSize: "1.1rem", lineHeight: 1 }}>{pad2(v)}</span>
      <span className="text-gray-400 block" style={{ fontSize: "0.5rem", fontWeight: 600, textTransform: "uppercase" }}>{label}</span>
    </div>
  );

  return (
    <div className="flex items-center gap-1.5">
      {d > 0 && (
        <>
          <Block v={d} label="dias" />
          <span className="text-red-400 font-bold text-sm">:</span>
        </>
      )}
      <Block v={h} label="hrs" />
      <span className="text-red-400 font-bold text-sm">:</span>
      <Block v={m} label="min" />
      <span className="text-red-400 font-bold text-sm">:</span>
      <Block v={s} label="seg" />
    </div>
  );
}

export function ProductDetailPage() {
  const { id } = useParams();
  const sku = id ? decodeURIComponent(id) : "";
  const [product, setProduct] = useState<ProdutoItem | null>(null);
  const [related, setRelated] = useState<ProdutoItem[]>([]);
  const [relatedBalanceMap, setRelatedBalanceMap] = useState<Record<string, ProductBalance>>({});
  const [relatedPriceMap, setRelatedPriceMap] = useState<Record<string, ProductPrice>>({});
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Image gallery state
  const [images, setImages] = useState<ProductImage[]>([]);
  const [imagesLoading, setImagesLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [mainImgError, setMainImgError] = useState(false);

  // Zoom state
  const [isZooming, setIsZooming] = useState(false);
  // PERF: Use ref for zoom origin to avoid re-renders on every mousemove
  const zoomImgRef = useRef<HTMLImageElement>(null);
  const mainImageRef = useRef<HTMLDivElement>(null);
  const thumbnailsRef = useRef<HTMLDivElement>(null);

  // Attributes state
  const [attributes, setAttributes] = useState<Record<string, string | string[]> | null>(null);
  const [attrsLoading, setAttrsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const { trackEvent } = useGA4();

  // Super Promo state — use HomepageInitContext instead of separate API call
  const { data: initData } = useHomepageInit();
  const [activePromo, setActivePromo] = useState<SuperPromo | null>(null);
  const [promoProduct, setPromoProduct] = useState<{ promoPrice: number; originalPrice: number; discountLabel: string } | null>(null);

  // PERF: Preloaded price + stock for the main product — fetched in initial parallel load
  const [mainPrice, setMainPrice] = useState<ProductPrice | null>(null);
  const [mainBalance, setMainBalance] = useState<ProductBalance | null>(null);

  // Review summary for JSON-LD AggregateRating
  var [reviewSummary, setReviewSummary] = useState<{ averageRating: number; totalReviews: number } | null>(null);

  // Extended warranty plans
  var [warrantyPlans, setWarrantyPlans] = useState<api.WarrantyPlanPublic[]>([]);
  var [selectedWarranty, setSelectedWarranty] = useState<string | null>(null);

  // Recently viewed
  var { addItem: addRecentlyViewed } = useRecentlyViewed();

  // Lightbox zoom state
  var [lbZoom, setLbZoom] = useState(1);
  var [lbPan, setLbPan] = useState({ x: 0, y: 0 });
  var lbDragging = useRef(false);
  var lbLastPos = useRef({ x: 0, y: 0 });

  // ── Dynamic SEO meta tags per product ──
  var _metaTitle = product ? product.titulo + " - Carretão Auto Peças" : "Carregando... - Carretão Auto Peças";
  var _metaDesc = product ? "Compre " + product.titulo + " (SKU: " + product.sku + ") na Carretão Auto Peças. Entrega para todo o Brasil, garantia de fábrica." : "";
  // Use primary image for og:image (not just images[0])
  var _primaryImage = (function () {
    if (!product || images.length === 0) return null;
    var primary = images.find(function (img) { return img.isPrimary; });
    return primary || images[0];
  })();
  var _metaImg = _primaryImage ? _primaryImage.url : "";
  var _productUrl = product ? window.location.origin + "/produto/" + encodeURIComponent(product.sku) : undefined;
  // Build JSON-LD structured data for Google rich results
  var _jsonLd = product ? JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    "name": product.titulo,
    "sku": product.sku,
    "image": _metaImg || undefined,
    "description": _metaDesc,
    "url": _productUrl,
    "brand": { "@type": "Brand", "name": (attributes && attributes["Marca"] ? (Array.isArray(attributes["Marca"]) ? attributes["Marca"][0] : attributes["Marca"]) : "Carretão Auto Peças") },
    "offers": mainPrice && mainPrice.found && mainPrice.price ? {
      "@type": "Offer",
      "url": _productUrl,
      "priceCurrency": "BRL",
      "price": mainPrice.price.toFixed(2),
      "availability": mainBalance && mainBalance.found && (mainBalance.disponivel ?? mainBalance.quantidade ?? 0) > 0
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      "seller": { "@type": "Organization", "name": "Carretão Auto Peças" },
    } : undefined,
    "aggregateRating": reviewSummary && reviewSummary.totalReviews > 0 ? {
      "@type": "AggregateRating",
      "ratingValue": reviewSummary.averageRating.toFixed(1),
      "reviewCount": reviewSummary.totalReviews,
      "bestRating": "5",
      "worstRating": "1",
    } : undefined,
  }) : undefined;

  useDocumentMeta({
    title: _metaTitle,
    description: _metaDesc,
    ogTitle: product ? product.titulo : undefined,
    ogDescription: _metaDesc || undefined,
    ogImage: _metaImg || undefined,
    ogImageWidth: _metaImg ? "800" : undefined,
    ogImageHeight: _metaImg ? "800" : undefined,
    ogImageAlt: product ? product.titulo : undefined,
    ogUrl: _productUrl,
    ogType: product ? "product" : undefined,
    canonical: _productUrl,
    productPrice: mainPrice && mainPrice.found && mainPrice.price ? mainPrice.price.toFixed(2) : undefined,
    productCurrency: "BRL",
    jsonLd: _jsonLd,
  });

  // ═══════════════════════════════════════════════════════════════════════
  // PERF: Combined endpoint — single API call replaces 6 parallel calls
  // Before: 6 parallel HTTP calls (product, meta, images, attrs, price, balance)
  // After: 1 call to /produto-detail-init/:sku — server does all 6 in parallel
  // ═══════════════════════════════════════════════════════════════════════
  useEffect(() => {
    var abortCtrl = new AbortController();
    var cancelled = false;
    var load = async function () {
      setLoading(true);
      setNotFound(false);
      setImages([]);
      setActiveIndex(0);
      setMainImgError(false);
      setAttributes(null);
      setImagesLoading(true);
      setAttrsLoading(true);
      setMainPrice(null);
      setMainBalance(null);
      try {
        // PERF: Check if data was pre-fetched on hover (from prefetch.ts cache)
        var cachedData = consumeProductDataCache(sku);
        var initData = cachedData || (await api.getProductDetailInit(sku, { signal: abortCtrl.signal }));

        if (cancelled) return;

        var skuResult = initData.product;
        var metaResult = initData.meta;
        var imagesResult = initData.images;
        var attrsResult = initData.attributes;
        var priceResult = initData.price as ProductPrice | null;
        var balanceResult = initData.balance as ProductBalance | null;
        var reviewSummaryResult = initData.reviewSummary || null;

        // Visibility check
        if (!skuResult.data || skuResult.data.length === 0 || metaResult.visible === false) {
          setNotFound(true);
          setLoading(false);
          setImagesLoading(false);
          setAttrsLoading(false);
          return;
        }

        var prod = skuResult.data[0];
        setProduct(prod);
        setImages(imagesResult.images || []);
        setImagesLoading(false);

        // Seed ProductImage cache with real URLs from API
        if (imagesResult.images && imagesResult.images.length > 0) {
          var primaryImg = imagesResult.images.find(function (img: any) { return img.isPrimary; });
          if (!primaryImg) primaryImg = imagesResult.images[0];
          if (primaryImg) seedProductImageCache(prod.sku, primaryImg.url);
        }

        setAttributes(attrsResult.found ? attrsResult.attributes : null);
        setAttrsLoading(false);
        setMainPrice(priceResult);
        setMainBalance(balanceResult);
        setReviewSummary(reviewSummaryResult);

        // Seed module caches so PriceBadge/StockBar don't re-fetch
        if (priceResult) {
          seedPriceCache([{ sku: sku, data: priceResult }]);
        }
        if (balanceResult) {
          seedStockCache([{
            sku: sku,
            qty: balanceResult.found ? (balanceResult.disponivel ?? balanceResult.quantidade ?? 0) : null,
          }]);
        }

        // GA4: track view_item
        trackEvent("view_item", {
          currency: "BRL",
          items: [{ item_id: sku, item_name: prod.titulo }],
        });

        // Save to recently viewed
        addRecentlyViewed(sku, prod.titulo);

        if (initData._elapsed) {
          console.log("[ProductDetail] Server-side init completed in " + initData._elapsed + "ms");
        }
      } catch (e: any) {
        // If aborted (navigation away), exit silently — no fallback needed
        if (cancelled || (e && e.name === "AbortError")) return;
        console.error("[ProductDetail] Combined endpoint failed, attempting individual fallback:", e);

        // ── FALLBACK: 6 individual parallel calls ──
        try {
          var fallbackResults = await Promise.allSettled([
            api.getProdutoBySku(sku),
            api.getProductMeta(sku),
            api.getProductImages(sku),
            api.getProductAttributes(sku),
            api.getProductPrice(sku),
            api.getProductBalance(sku),
          ]);

          if (cancelled) return;

          var fbProduct = fallbackResults[0].status === "fulfilled" ? fallbackResults[0].value : null;
          var fbMeta = fallbackResults[1].status === "fulfilled" ? fallbackResults[1].value : null;
          var fbImages = fallbackResults[2].status === "fulfilled" ? fallbackResults[2].value : null;
          var fbAttrs = fallbackResults[3].status === "fulfilled" ? fallbackResults[3].value : null;
          var fbPrice = fallbackResults[4].status === "fulfilled" ? (fallbackResults[4].value as ProductPrice) : null;
          var fbBalance = fallbackResults[5].status === "fulfilled" ? (fallbackResults[5].value as ProductBalance) : null;

          // Visibility check — product must exist and not be hidden
          if (
            !fbProduct || !fbProduct.data || fbProduct.data.length === 0 ||
            (fbMeta && fbMeta.visible === false)
          ) {
            setNotFound(true);
            setLoading(false);
            setImagesLoading(false);
            setAttrsLoading(false);
            return;
          }

          var fbProd = fbProduct.data[0];
          setProduct(fbProd);
          setImages(fbImages && fbImages.images ? fbImages.images : []);
          setImagesLoading(false);

          // Seed ProductImage cache with real URLs from API (fallback path)
          if (fbImages && fbImages.images && fbImages.images.length > 0) {
            var fbPrimaryImg = fbImages.images.find(function (img: any) { return img.isPrimary; });
            if (!fbPrimaryImg) fbPrimaryImg = fbImages.images[0];
            if (fbPrimaryImg) seedProductImageCache(fbProd.sku, fbPrimaryImg.url);
          }

          setAttributes(fbAttrs && fbAttrs.found ? fbAttrs.attributes : null);
          setAttrsLoading(false);
          setMainPrice(fbPrice);
          setMainBalance(fbBalance);

          // Seed module caches so PriceBadge/StockBar don't re-fetch
          if (fbPrice) {
            seedPriceCache([{ sku: sku, data: fbPrice }]);
          }
          if (fbBalance) {
            seedStockCache([{
              sku: sku,
              qty: fbBalance.found ? (fbBalance.disponivel ?? fbBalance.quantidade ?? 0) : null,
            }]);
          }

          // GA4: track view_item
          trackEvent("view_item", {
            currency: "BRL",
            items: [{ item_id: sku, item_name: fbProd.titulo }],
          });

          // Save to recently viewed (fallback path)
          addRecentlyViewed(sku, fbProd.titulo);

          console.log("[ProductDetail] Fallback completed successfully (6 individual calls)");
        } catch (fallbackErr) {
          console.error("[ProductDetail] Fallback also failed:", fallbackErr);
          if (!cancelled) {
            setNotFound(true);
            setImagesLoading(false);
            setAttrsLoading(false);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return function () { cancelled = true; abortCtrl.abort(); };
  }, [sku]);

  // ═══════ STOCK VALIDATION LAYER 1: Background force-refresh ═══════
  // After initial cached load, fetch real-time stock from SIGE (bypassing cache)
  // to ensure the customer sees the true balance, not stale cached data.
  useEffect(function () {
    if (loading || !product || !sku) return;
    var cancelled = false;
    // Small delay so the page renders first with cached data
    var timer = setTimeout(function () {
      api.getProductBalance(sku, { force: true })
        .then(function (fresh) {
          if (cancelled) return;
          setMainBalance(fresh);
          // Update stock cache so StockBadge/StockBar reflect real-time data
          seedStockCache([{
            sku: sku,
            qty: fresh.found ? (fresh.disponivel ?? fresh.quantidade ?? 0) : null,
          }]);
          console.log("[ProductDetail] Layer 1 stock validation: force-refreshed balance for " + sku +
            " -> disponivel=" + (fresh.disponivel ?? "?") + " qty=" + (fresh.quantidade ?? "?"));
        })
        .catch(function (e) {
          console.warn("[ProductDetail] Layer 1 stock validation failed (non-blocking):", e);
        });
    }, 1500);
    return function () { cancelled = true; clearTimeout(timer); };
  }, [loading, product, sku]);

  // Fetch warranty plans for this product
  useEffect(function () {
    if (loading || !product || !sku) return;
    var cancelled = false;
    api.getProductWarrantyPlans(sku)
      .then(function (res) {
        if (cancelled) return;
        setWarrantyPlans(res.plans || []);
        setSelectedWarranty(null);
      })
      .catch(function (e) {
        console.warn("[ProductDetail] Warranty plans fetch failed (non-blocking):", e);
      });
    return function () { cancelled = true; };
  }, [loading, product, sku]);

  // Scroll to #avaliacoes when hash is present and product is loaded
  useEffect(function () {
    if (loading || !product) return;
    if (window.location.hash === "#avaliacoes") {
      var el = document.getElementById("avaliacoes");
      if (el) {
        setTimeout(function () {
          el!.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 400);
      }
    }
  }, [loading, product]);

  // ═══════════════════════════════════════════════════════════════════════
  // PERF: Use HomepageInitContext for promo — eliminates separate
  // getActivePromo() API call. Price is now preloaded — eliminates
  // the separate getProductPrice() call that caused a waterfall.
  // ═══════════════════════════════════════════════════════════════════════
  useEffect(function () {
    if (!sku || notFound || !product) {
      setActivePromo(null);
      setPromoProduct(null);
      return;
    }

    // Get promo from HomepageInitContext (cached) instead of separate API call
    var promo = initData && initData.promo ? initData.promo : null;
    if (!promo || !promo.enabled || !promo.products) {
      setActivePromo(null);
      setPromoProduct(null);
      return;
    }

    // Client-side expiration check — revert to normal when endDate passes
    if (promo.endDate && Date.now() > promo.endDate) {
      setActivePromo(null);
      setPromoProduct(null);
      return;
    }

    var found = promo.products.find(function (p) { return p.sku === sku; });
    if (!found) {
      setActivePromo(null);
      setPromoProduct(null);
      return;
    }

    setActivePromo(promo);

    // PERF: Use preloaded price instead of fetching again
    if (!mainPrice || !mainPrice.found || !mainPrice.price) {
      setPromoProduct(null);
      return;
    }
    var original = mainPrice.price;
    // Use computePromoPrice helper — respects per-product custom discounts
    var computed = computePromoPrice(original, promo, found);
    setPromoProduct({ promoPrice: computed.promoPrice, originalPrice: original, discountLabel: computed.discountLabel });

    // Auto-revert: schedule state clear when endDate arrives (if user is on page)
    if (promo.endDate) {
      var remaining = promo.endDate - Date.now();
      if (remaining > 0) {
        var timerId = setTimeout(function () {
          setActivePromo(null);
          setPromoProduct(null);
        }, remaining);
        return function () { clearTimeout(timerId); };
      }
    }
  }, [sku, notFound, product, initData, mainPrice]);

  // ═══════════════════════════════════════════════════════════════════════
  // Deferred: Load related products separately (non-blocking)
  // Uses title keywords to find products from the same category/type
  // ═══════════════════════════════════════════════════════════════════════
  useEffect(function () {
    if (!sku || notFound || !product) return;
    var cancelled = false;

    // Extract meaningful keywords from product title (skip short/common words)
    var stopWords = ["de", "do", "da", "dos", "das", "para", "com", "sem", "em", "um", "uma", "e", "ou", "o", "a", "os", "as", "no", "na", "nos", "nas", "por", "ao", "que"];
    var words = product.titulo.split(/[\s\-\/\(\),]+/).filter(function (w) {
      var lower = w.toLowerCase();
      return w.length >= 3 && stopWords.indexOf(lower) === -1;
    });
    // Use the first 2 meaningful words as search term for relevance
    var searchTerm = words.slice(0, 2).join(" ");

    var fetchRelated = searchTerm.length >= 3
      ? api.getCatalog(1, 8, searchTerm)
      : api.getCatalog(1, 8);

    fetchRelated
      .then(function (res) {
        if (cancelled) return;
        var filtered = res.data.filter(function (p) { return p.sku !== sku; }).slice(0, 4);
        setRelated(filtered);
      })
      .catch(function (e) { console.error("[ProductDetail] Related products error:", e); });
    return function () { cancelled = true; };
  }, [sku, notFound, product]);

  // Bulk-load prices + stocks for related products
  useEffect(() => {
    if (related.length === 0) return;
    const ac = new AbortController();
    const skus = related.map((p) => p.sku);

    api.getProductPricesBulk(skus, { signal: ac.signal })
      .then((res) => {
        if (ac.signal.aborted) return;
        const map: Record<string, ProductPrice> = {};
        for (const p of (res.results || [])) { map[p.sku] = p; }
        setRelatedPriceMap(map);
        seedPriceCache((res.results || []).map((p: ProductPrice) => ({ sku: p.sku, data: p })));
      })
      .catch((e) => { if (e && e.name !== "AbortError") console.error("[ProductDetail] Bulk price error:", e); });

    api.getProductBalances(skus, { signal: ac.signal })
      .then((res) => {
        if (ac.signal.aborted) return;
        const map: Record<string, ProductBalance> = {};
        for (const b of (res.results || [])) { map[b.sku] = b; }
        setRelatedBalanceMap(map);
        seedStockCache((res.results || []).map((b: any) => ({
          sku: b.sku,
          qty: b.found ? (b.disponivel ?? b.quantidade ?? 0) : null,
        })));
      })
      .catch((e) => { if (e && e.name !== "AbortError") console.error("[ProductDetail] Bulk balance error:", e); });

    return function () { ac.abort(); };
  }, [related]);

  const goToPrev = useCallback(() => {
    setActiveIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
    setMainImgError(false);
    setIsZooming(false);
  }, [images.length]);

  const goToNext = useCallback(() => {
    setActiveIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
    setMainImgError(false);
    setIsZooming(false);
  }, [images.length]);

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (!lightboxOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goToPrev();
      else if (e.key === "ArrowRight") goToNext();
      else if (e.key === "Escape") setLightboxOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxOpen, goToPrev, goToNext]);

  // Auto-scroll thumbnails to keep active one visible
  useEffect(() => {
    const container = thumbnailsRef.current;
    if (!container) return;
    const activeThumb = container.children[activeIndex] as HTMLElement | undefined;
    if (!activeThumb) return;
    const thumbLeft = activeThumb.offsetLeft;
    const thumbWidth = activeThumb.offsetWidth;
    const containerWidth = container.clientWidth;
    const scrollTarget = thumbLeft - containerWidth / 2 + thumbWidth / 2;
    container.scrollTo({ left: scrollTarget, behavior: "smooth" });
  }, [activeIndex]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* ── Skeleton shell — matches product detail layout for zero CLS ── */}
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="w-16 h-4 bg-gray-200 rounded animate-pulse" />
              <span className="text-gray-300">/</span>
              <div className="w-20 h-4 bg-gray-200 rounded animate-pulse" />
              <span className="text-gray-300">/</span>
              <div className="w-40 h-4 bg-gray-200 rounded animate-pulse" />
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-start">
            {/* Image skeleton */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="aspect-square bg-gray-100 animate-pulse flex items-center justify-center">
                <Package className="w-16 h-16 text-gray-200" />
              </div>
              <div className="px-4 py-3 flex gap-2">
                {[1, 2, 3, 4].map(function (i) {
                  return <div key={i} className="w-16 h-16 bg-gray-100 rounded-lg animate-pulse shrink-0" />;
                })}
              </div>
            </div>
            {/* Info skeleton */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 lg:p-8 space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-24 h-6 bg-gray-100 rounded-lg animate-pulse" />
              </div>
              <div className="w-full h-8 bg-gray-100 rounded animate-pulse" />
              <div className="w-3/4 h-8 bg-gray-100 rounded animate-pulse" />
              <div className="h-px bg-gray-100 my-2" />
              <div className="w-32 h-10 bg-gray-100 rounded-lg animate-pulse" />
              <div className="w-48 h-5 bg-gray-100 rounded animate-pulse" />
              <div className="h-px bg-gray-100 my-2" />
              <div className="w-full h-12 bg-green-50 rounded-xl animate-pulse" />
              <div className="w-full h-10 bg-gray-100 rounded-lg animate-pulse" />
              <div className="w-full h-14 bg-red-50 rounded-lg animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !product) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Package className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h2 className="text-gray-700 mb-4" style={{ fontSize: "1.5rem", fontWeight: 600 }}>
            Produto não encontrado
          </h2>
          <p className="text-gray-400 mb-6" style={{ fontSize: "0.9rem" }}>
            O SKU <code className="bg-gray-100 px-2 py-0.5 rounded font-mono">{sku}</code> não foi localizado.
          </p>
          <Link
            to="/catalogo"
            className="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors inline-flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao Catálogo
          </Link>
        </div>
      </div>
    );
  }

  const activeImage = images[activeIndex] || null;
  const hasImages = images.length > 0;
  const attrEntries = attributes ? Object.entries(attributes) : [];

  const isInPromo = !!(activePromo && promoProduct);

  return (
    <div className="min-h-screen" style={{ background: isInPromo ? "#b91c1c" : "#f9fafb" }}>
      {/* Breadcrumb */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3">
          <nav className="flex items-center gap-1.5 sm:gap-2 text-gray-400 flex-wrap" style={{ fontSize: "0.75rem" }}>
            <Link to="/" className="flex items-center gap-1 hover:text-red-600 transition-colors shrink-0">
              <Home className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Início</span>
            </Link>
            <span className="text-gray-300">/</span>
            <Link to="/catalogo" className="hover:text-red-600 transition-colors shrink-0">
              Catálogo
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-600 truncate max-w-[180px] sm:max-w-[300px]">{product.titulo}</span>
          </nav>
        </div>
      </div>
      {/* JSON-LD BreadcrumbList for Google rich results */}
      <JsonLdBreadcrumb items={[
        { name: "Início", url: "/" },
        { name: "Catálogo", url: "/catalogo" },
        { name: product.titulo },
      ]} />

      {/* Super Promo Banner — yellow */}
      {isInPromo && activePromo && (
        <div
          className="relative overflow-hidden"
          style={{ background: "#facc15" }}
        >
          <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-red-600 flex items-center justify-center shrink-0" style={{ boxShadow: "0 2px 8px rgba(220,38,38,0.3)" }}>
                <Flame className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-300" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  <span
                    className="bg-red-600 text-white px-2 sm:px-2.5 py-0.5 rounded-md inline-block truncate"
                    style={{ fontSize: "0.75rem", fontWeight: 800, boxShadow: "0 2px 8px rgba(220,38,38,0.3)" }}
                  >
                    {(activePromo.title || "Super Promoção").replace("Promocao", "Promoção")}
                  </span>
                  <span
                    className="bg-white text-red-700 px-1.5 sm:px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0"
                    style={{ fontSize: "0.65rem", fontWeight: 800 }}
                  >
                    <Zap className="w-3 h-3" />
                    {promoProduct!.discountLabel}
                  </span>
                </div>
                {activePromo.subtitle && (
                  <p className="text-red-800/70 mt-0.5" style={{ fontSize: "0.72rem", fontWeight: 500 }}>{activePromo.subtitle}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              {/* Countdown */}
              {activePromo.endDate && (
                <div className="hidden md:flex items-center gap-2">
                  <span className="text-red-700 animate-pulse" style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Acaba em
                  </span>
                  <PromoCountdown endDate={activePromo.endDate} />
                </div>
              )}
              <Link
                to="/"
                className="hidden sm:flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg transition-colors"
                style={{ fontSize: "0.72rem", fontWeight: 600 }}
              >
                Ver todas as ofertas
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
          {/* Mobile countdown */}
          {activePromo.endDate && (
            <div className="md:hidden max-w-7xl mx-auto px-4 pb-3 flex items-center gap-2">
              <span className="text-red-700 animate-pulse" style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Acaba em
              </span>
              <PromoCountdown endDate={activePromo.endDate} />
            </div>
          )}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* Product Details — dual scroll: images sticky, info scrolls */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-8 sm:mb-10 items-start">
          {/* Image Gallery — sticky on desktop */}
          <div className="lg:sticky lg:top-[130px] lg:self-start">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden relative">
              {/* Promo badge on image gallery */}
              {isInPromo && (
                <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5">
                  <span
                    className="bg-red-600 text-white px-2.5 py-1 rounded-lg flex items-center gap-1.5"
                    style={{ fontSize: "0.72rem", fontWeight: 800, boxShadow: "0 2px 8px rgba(220,38,38,0.4)" }}
                  >
                    <Flame className="w-3.5 h-3.5 text-yellow-300" />
                    SUPER PROMO
                  </span>
                  <span
                    className="bg-emerald-500 text-white px-2 py-1 rounded-lg flex items-center gap-1"
                    style={{ fontSize: "0.68rem", fontWeight: 700 }}
                  >
                    <Zap className="w-3 h-3" />
                    {promoProduct!.discountLabel}
                  </span>
                </div>
              )}
              {/* Main image */}
              <div className="group/gallery relative flex items-center justify-center min-h-[240px] sm:min-h-[300px] lg:min-h-[450px] p-3 sm:p-4">
                {imagesLoading ? (
                  <Loader2 className="w-10 h-10 text-gray-300 animate-spin" />
                ) : hasImages && !mainImgError ? (
                  <>
                    <div
                      ref={mainImageRef}
                      className="relative w-full h-full flex items-center justify-center overflow-hidden cursor-zoom-in bg-white rounded-lg"
                      style={{ minHeight: "280px" }}
                      onMouseEnter={() => setIsZooming(true)}
                      onMouseLeave={() => setIsZooming(false)}
                      onMouseMove={(e) => {
                        if (!mainImageRef.current) return;
                        const rect = mainImageRef.current.getBoundingClientRect();
                        const x = ((e.clientX - rect.left) / rect.width) * 100;
                        const y = ((e.clientY - rect.top) / rect.height) * 100;
                        if (zoomImgRef.current) {
                          zoomImgRef.current.style.transformOrigin = `${x}% ${y}%`;
                        }
                      }}
                      onClick={() => setLightboxOpen(true)}
                    >
                      <img
                        ref={zoomImgRef}
                        src={activeImage!.url}
                        alt={`${product.titulo} - Imagem ${activeImage!.number}`}
                        className="max-w-full max-h-[420px] object-contain transition-transform duration-200 ease-out pointer-events-none select-none"
                        style={{
                          transform: isZooming ? "scale(2.5)" : "scale(1)",
                        }}
                        onError={() => setMainImgError(true)}
                      />
                    </div>
                    {images.length > 1 && (
                      <>
                        <button
                          onClick={goToPrev}
                          className="absolute left-0 top-1/2 -translate-y-1/2 w-10 h-20 flex items-center justify-center bg-gradient-to-r from-black/5 to-transparent hover:from-black/15 text-gray-400 hover:text-red-600 transition-all duration-200 opacity-0 group-hover/gallery:opacity-100 rounded-r-xl"
                          aria-label="Imagem anterior"
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button
                          onClick={goToNext}
                          className="absolute right-0 top-1/2 -translate-y-1/2 w-10 h-20 flex items-center justify-center bg-gradient-to-l from-black/5 to-transparent hover:from-black/15 text-gray-400 hover:text-red-600 transition-all duration-200 opacity-0 group-hover/gallery:opacity-100 rounded-l-xl"
                          aria-label="Proxima imagem"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </button>
                      </>
                    )}
                    {images.length > 1 && (
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                        {images.map((_, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              setActiveIndex(idx);
                              setMainImgError(false);
                            }}
                            className={`rounded-full transition-all duration-200 ${
                              idx === activeIndex
                                ? "w-6 h-2 bg-red-500"
                                : "w-2 h-2 bg-gray-300 hover:bg-gray-400"
                            }`}
                            aria-label={`Ir para imagem ${idx + 1}`}
                          />
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center">
                    <Package className="w-24 h-24 text-gray-200 mx-auto mb-4" />
                    <p className="text-gray-400" style={{ fontSize: "0.85rem" }}>
                      Peca automotiva
                    </p>
                  </div>
                )}
              </div>

              {/* Thumbnails with navigation arrows */}
              {hasImages && images.length > 1 && (
                <div className="px-2 pb-4">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={goToPrev}
                      className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      aria-label="Miniatura anterior"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div
                      className="flex-1 flex gap-2 overflow-x-auto hide-scrollbar"
                      ref={thumbnailsRef}
                      style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                    >
                      {images.map((img, idx) => (
                        <button
                          key={img.name}
                          onClick={() => {
                            setActiveIndex(idx);
                            setMainImgError(false);
                          }}
                          className={`shrink-0 w-16 h-16 rounded-lg border-2 overflow-hidden transition-all duration-200 ${
                            idx === activeIndex
                              ? "border-red-500 shadow-md ring-1 ring-red-300"
                              : "border-gray-200 hover:border-red-300 opacity-70 hover:opacity-100"
                          }`}
                        >
                          <OptimizedImage
                            src={img.url}
                            alt={"Miniatura " + img.number}
                            variant="thumbnail"
                            quality={60}
                            className="w-full h-full object-contain p-1 bg-white"
                            loading="lazy"
                            width={64}
                            height={64}
                          />
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={goToNext}
                      className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      aria-label="Proxima miniatura"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Info + Attributes — scrolls freely */}
          <div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden p-4 sm:p-6 lg:p-8 flex flex-col">
              {/* SKU badge + share actions — always single line */}
              <div className="flex items-center justify-between gap-1.5 mb-4">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Hash className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span
                    className="font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded-lg truncate"
                    style={{ fontSize: "0.72rem" }}
                  >
                    {product.sku}
                  </span>
                </div>
                <div className="flex items-center gap-0 shrink-0">
                  <button
                    onClick={() => {
                      var ogUrl = getProductOgUrl(product.sku);
                      copyToClipboard(ogUrl);
                      setCopied(true);
                      toast.success("Link copiado!");
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="flex items-center gap-1 text-gray-400 hover:text-red-600 transition-colors px-1.5 py-1 rounded-lg hover:bg-red-50"
                    title="Copiar link para compartilhar (com preview)"
                    style={{ fontSize: "0.68rem" }}
                  >
                    {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                    <span className="hidden sm:inline">{copied ? "Copiado!" : "Copiar"}</span>
                  </button>
                  <a
                    href={"https://wa.me/?text=" + encodeURIComponent(product.titulo + " - Confira na Carretão Auto Peças: " + getProductOgUrl(product.sku))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-gray-400 hover:text-green-600 transition-colors px-1.5 py-1 rounded-lg hover:bg-green-50"
                    title="Enviar pelo WhatsApp"
                    style={{ fontSize: "0.68rem" }}
                  >
                    <MessageCircle className="w-3 h-3" />
                    <span className="hidden sm:inline">WhatsApp</span>
                  </a>
                  <button
                    onClick={() => {
                      var shareUrl = getProductOgUrl(product.sku);
                      if (navigator.share) {
                        navigator.share({
                          title: product.titulo,
                          text: product.titulo + " - Carretão Auto Peças",
                          url: shareUrl,
                        }).catch(function () {});
                      } else {
                        copyToClipboard(shareUrl);
                        toast.success("Link copiado!");
                      }
                    }}
                    className="flex items-center gap-1 text-gray-400 hover:text-blue-600 transition-colors px-1.5 py-1 rounded-lg hover:bg-blue-50"
                    title="Compartilhar"
                    style={{ fontSize: "0.68rem" }}
                  >
                    <Share2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Title + Wishlist + Share */}
              <div className="flex items-start gap-2 mb-3">
                <h1 className="text-gray-800 flex-1" style={{ fontSize: "clamp(1.15rem, 4vw, 1.5rem)", fontWeight: 700, lineHeight: 1.3 }}>
                  {product.titulo}
                </h1>
                <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                  <ShareButtons
                    url={getProductOgUrl(product.sku)}
                    title={product.titulo + " - Carretão Auto Peças"}
                    extraText={"SKU: " + product.sku + (mainPrice && mainPrice.found && mainPrice.price ? " - " + formatBRL(mainPrice.price) : "")}
                  />
                  <WishlistButton sku={product.sku} titulo={product.titulo} size="lg" />
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-gray-100 mb-4" />

              {/* Super Promo Price Override */}
              {isInPromo && promoProduct ? (
                <div className="mb-4">
                  <div
                    className="rounded-xl border-2 border-red-200 p-4"
                    style={{ background: "linear-gradient(135deg, #fef2f2 0%, #fff1f2 100%)" }}
                  >
                    {/* "Super Promo" mini badge */}
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="bg-red-600 text-white px-2 py-0.5 rounded flex items-center gap-1"
                        style={{ fontSize: "0.65rem", fontWeight: 700 }}
                      >
                        <Flame className="w-3 h-3" />
                        SUPER PROMO
                      </span>
                      <span
                        className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded flex items-center gap-1"
                        style={{ fontSize: "0.65rem", fontWeight: 700 }}
                      >
                        <Zap className="w-3 h-3" />
                        {promoProduct.discountLabel}
                      </span>
                    </div>

                    {/* Original price struck through */}
                    <p className="text-gray-400 line-through" style={{ fontSize: "0.95rem", fontWeight: 500 }}>
                      De {formatBRL(promoProduct.originalPrice)}
                    </p>

                    {/* Promo price — big + prominent */}
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-red-600" style={{ fontSize: "clamp(1.6rem, 5vw, 2.2rem)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1 }}>
                        {formatBRL(promoProduct.promoPrice)}
                      </span>
                    </div>

                    {/* Savings */}
                    <p className="text-emerald-600 mt-1.5" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                      Você economiza {formatBRL(promoProduct.originalPrice - promoProduct.promoPrice)}
                    </p>

                    {/* Countdown */}
                    {activePromo.endDate && (
                      <div className="mt-2">
                        <PromoCountdown endDate={activePromo.endDate} />
                      </div>
                    )}
                  </div>

                  {/* Regular PriceBadge below for PIX/installment info */}
                  <div className="mt-3 opacity-60">
                    <p className="text-gray-400 mb-1" style={{ fontSize: "0.7rem", fontWeight: 500 }}>
                      Preço sem promoção:
                    </p>
                    <PriceBadge sku={product.sku} variant="full" preloaded={mainPrice} />
                  </div>
                </div>
              ) : (
                /* Normal Price */
                <div className="mb-4">
                  <PriceBadge sku={product.sku} variant="full" preloaded={mainPrice} />
                </div>
              )}

              {/* WhatsApp CTA removed — start dead code */}
              {false && <a
                href={`https://wa.me/5544997330202?text=${encodeURIComponent(`Olá! Gostaria de informações sobre a peça:\n\n📦 ${product.titulo}\n🔖 SKU: ${product.sku}\n\n${window.location.href}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 bg-green-50 hover:bg-green-100 border border-green-200 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 mb-4 sm:mb-5 transition-all group"
              >
                <div className="bg-green-500 rounded-full p-2 shrink-0 group-hover:scale-105 transition-transform">
                  <MessageCircle className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-green-800" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                    Consultar disponibilidade
                  </p>
                  <p className="text-green-600" style={{ fontSize: "0.72rem" }}>
                    Fale com um especialista via WhatsApp
                  </p>
                </div>
                <span className="text-green-600 group-hover:translate-x-0.5 transition-transform" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                  &rarr;
                </span>
              </a>}

              {/* Stock Balance from SIGE */}
              <div className="mb-4 sm:mb-5">
                <StockBadge sku={product.sku} variant="full" preloaded={mainBalance} />
              </div>

              {/* Extended Warranty Selector */}
              {warrantyPlans.length > 0 && (function () {
                var _productPrice = (isInPromo && promoProduct) ? promoProduct.promoPrice : (mainPrice && mainPrice.found ? mainPrice.price : null);
                return (
                  <div className="mb-4 sm:mb-5">
                    <div className="border border-blue-200 rounded-xl bg-blue-50/50 overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-100/60">
                        <ShieldCheck className="w-4 h-4 text-blue-600" />
                        <span className="text-blue-800" style={{ fontSize: "0.85rem", fontWeight: 700 }}>Garantia Estendida</span>
                      </div>
                      <div className="p-3 space-y-2">
                        {/* No warranty option */}
                        <label
                          className={"flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors border " +
                            (selectedWarranty === null ? "border-blue-400 bg-white shadow-sm" : "border-transparent hover:bg-white/60")}
                        >
                          <input
                            type="radio"
                            name="warranty"
                            checked={selectedWarranty === null}
                            onChange={function () { setSelectedWarranty(null); }}
                            className="accent-blue-600"
                          />
                          <span className="text-gray-700" style={{ fontSize: "0.82rem", fontWeight: 500 }}>
                            Sem garantia estendida
                          </span>
                        </label>
                        {/* Warranty plan options */}
                        {warrantyPlans.map(function (plan) {
                          var wPrice = plan.priceType === "percentage"
                            ? (_productPrice ? Math.round(_productPrice * (plan.priceValue / 100) * 100) / 100 : null)
                            : plan.priceValue;
                          return (
                            <label
                              key={plan.id}
                              className={"flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors border " +
                                (selectedWarranty === plan.id ? "border-blue-400 bg-white shadow-sm" : "border-transparent hover:bg-white/60")}
                            >
                              <input
                                type="radio"
                                name="warranty"
                                checked={selectedWarranty === plan.id}
                                onChange={function () { setSelectedWarranty(plan.id); }}
                                className="accent-blue-600"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-gray-800" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                                    {plan.name}
                                  </span>
                                  <span className="text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-md" style={{ fontSize: "0.65rem", fontWeight: 700 }}>
                                    {plan.durationMonths} {plan.durationMonths === 1 ? "mes" : "meses"}
                                  </span>
                                </div>
                                {plan.description && (
                                  <p className="text-gray-500 mt-0.5" style={{ fontSize: "0.7rem" }}>{plan.description}</p>
                                )}
                              </div>
                              <span className="text-blue-700 whitespace-nowrap" style={{ fontSize: "0.85rem", fontWeight: 700 }}>
                                {wPrice !== null ? "+ " + formatBRL(wPrice) : plan.priceValue + "%"}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Add to Cart Button */}
              <div className="mb-4 sm:mb-5">
                <AddToCartButton
                  sku={product.sku}
                  titulo={product.titulo}
                  overridePrice={isInPromo && promoProduct ? promoProduct.promoPrice : undefined}
                  preloadedPrice={mainPrice && mainPrice.found ? mainPrice.price : undefined}
                  outOfStock={mainBalance ? (mainBalance.found && (mainBalance.disponivel ?? mainBalance.quantidade ?? 0) <= 0) : false}
                  availableQty={mainBalance && mainBalance.found ? (mainBalance.disponivel ?? mainBalance.quantidade ?? null) : null}
                  onStockUpdate={function (available, isOos) {
                    if (available !== null) {
                      setMainBalance(function (prev) {
                        if (!prev) return prev;
                        return { ...prev, disponivel: available, found: true };
                      });
                      seedStockCache([{ sku: product.sku, qty: available }]);
                    }
                  }}
                  warranty={selectedWarranty ? (function () {
                    var _wp = warrantyPlans.find(function (p) { return p.id === selectedWarranty; });
                    if (!_wp) return null;
                    var _pp = (isInPromo && promoProduct) ? promoProduct.promoPrice : (mainPrice && mainPrice.found ? mainPrice.price : null);
                    var _wprice = _wp.priceType === "percentage"
                      ? (_pp ? Math.round(_pp * (_wp.priceValue / 100) * 100) / 100 : 0)
                      : _wp.priceValue;
                    return { planId: _wp.id, name: _wp.name, price: _wprice, durationMonths: _wp.durationMonths };
                  })() : null}
                />
              </div>

              {/* Shipping Calculator */}
              <div className="mb-4 sm:mb-5">
                <ShippingCalculator
                  items={[{ sku: product.sku, quantity: 1 }]}
                  totalValue={0}
                  compact={false}
                  showSavedAddress={true}
                />
              </div>

              {/* Dynamic Attributes */}
              {attrsLoading ? (
                <div className="flex items-center gap-2 text-gray-400 py-6">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span style={{ fontSize: "0.85rem" }}>Carregando especificacoes...</span>
                </div>
              ) : attrEntries.length > 0 ? (
                <div className="flex-1">
                  {/* Section header */}
                  <div className="flex items-center gap-2 mb-3">
                    <Tag className="w-4 h-4 text-red-600" />
                    <span className="text-gray-700" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                      Especificacoes Tecnicas
                    </span>
                    <span
                      className="bg-red-50 text-red-600 px-2 py-0.5 rounded-full"
                      style={{ fontSize: "0.7rem", fontWeight: 500 }}
                    >
                      {attrEntries.length}
                    </span>
                  </div>

                  {/* Attributes table */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    {attrEntries.map(([key, value], idx) => (
                      <div
                        key={key}
                        className={`grid grid-cols-[110px_1fr] sm:grid-cols-[160px_1fr] lg:grid-cols-[180px_1fr] ${
                          idx < attrEntries.length - 1 ? "border-b border-gray-100" : ""
                        } ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/60"}`}
                      >
                        <div
                          className="px-3 py-2.5 text-gray-500 border-r border-gray-100"
                          style={{ fontSize: "0.8rem", fontWeight: 500 }}
                        >
                          {key}
                        </div>
                        <div className="px-3 py-2.5">
                          {Array.isArray(value) ? (
                            <div className="flex flex-wrap gap-1">
                              {value.map((v, vi) => (
                                <span
                                  key={vi}
                                  className="bg-red-50 text-red-700 border border-red-100 px-2 py-0.5 rounded"
                                  style={{ fontSize: "0.78rem" }}
                                >
                                  {v}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-800" style={{ fontSize: "0.83rem" }}>
                              {value}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-gray-400 py-4">
                  <Info className="w-4 h-4" />
                  <span style={{ fontSize: "0.85rem" }}>
                    Especificações não disponíveis para este produto.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Product Reviews */}
        <div id="avaliacoes" className={isInPromo ? "bg-white rounded-xl p-3 sm:p-6" : ""}>
          <ProductReviews sku={sku} />
        </div>

        {/* Related Products */}
        {related.length > 0 && (
          <div className="mt-6 sm:mt-8">
            <h2 className={"mb-4 sm:mb-6 " + (isInPromo ? "text-white" : "text-gray-800")} style={{ fontSize: "clamp(1.05rem, 3.5vw, 1.3rem)", fontWeight: 700 }}>
              Você Também Pode Gostar
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
              {related.map((p) => (
                <ProductCard
                  key={p.sku}
                  product={p}
                  balance={relatedBalanceMap[p.sku]}
                  preloadedPrice={relatedPriceMap[p.sku]}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Recently Viewed Products */}
      <RecentlyViewedSection excludeSku={sku} darkMode={isInPromo} />

      {/* Footer spacer for promo pages */}
      {isInPromo && (
        <div className="bg-gray-50 h-8" />
      )}

      {/* Lightbox Modal — with zoom (scroll/click/pinch) + pan */}
      {lightboxOpen && hasImages && (
        <div
          className="fixed inset-0 bg-black/90 z-[999] flex items-center justify-center"
          onClick={function () { setLightboxOpen(false); setLbZoom(1); setLbPan({ x: 0, y: 0 }); }}
          onWheel={function (e) {
            e.preventDefault();
            setLbZoom(function (prev) {
              var next = prev + (e.deltaY < 0 ? 0.3 : -0.3);
              if (next < 1) { setLbPan({ x: 0, y: 0 }); return 1; }
              if (next > 5) return 5;
              return next;
            });
          }}
        >
          {/* Close */}
          <button
            onClick={function () { setLightboxOpen(false); setLbZoom(1); setLbPan({ x: 0, y: 0 }); }}
            className="absolute top-4 right-4 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors z-10"
          >
            <X className="w-6 h-6" />
          </button>

          {/* Top info bar */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-3 z-10">
            {images.length > 1 && (
              <span className="text-white/70 bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm" style={{ fontSize: "0.8rem" }}>
                {activeIndex + 1} / {images.length}
              </span>
            )}
            {lbZoom > 1 && (
              <span className="text-white/70 bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm" style={{ fontSize: "0.8rem" }}>
                {Math.round(lbZoom * 100)}%
              </span>
            )}
          </div>

          {/* Zoom controls */}
          <div className="absolute bottom-20 right-4 flex flex-col gap-2 z-10" onClick={function (e) { e.stopPropagation(); }}>
            <button
              onClick={function () { setLbZoom(function (z) { return Math.min(z + 0.5, 5); }); }}
              className="w-9 h-9 flex items-center justify-center bg-white/10 hover:bg-white/25 text-white rounded-full backdrop-blur-sm transition-colors"
              style={{ fontSize: "1.2rem", fontWeight: 700 }}
              title="Aumentar zoom"
            >
              +
            </button>
            <button
              onClick={function () { setLbZoom(function (z) { var n = z - 0.5; if (n < 1) { setLbPan({ x: 0, y: 0 }); return 1; } return n; }); }}
              className="w-9 h-9 flex items-center justify-center bg-white/10 hover:bg-white/25 text-white rounded-full backdrop-blur-sm transition-colors"
              style={{ fontSize: "1.2rem", fontWeight: 700 }}
              title="Diminuir zoom"
            >
              -
            </button>
            {lbZoom > 1 && (
              <button
                onClick={function () { setLbZoom(1); setLbPan({ x: 0, y: 0 }); }}
                className="w-9 h-9 flex items-center justify-center bg-white/10 hover:bg-white/25 text-white rounded-full backdrop-blur-sm transition-colors"
                style={{ fontSize: "0.65rem", fontWeight: 600 }}
                title="Resetar zoom"
              >
                1:1
              </button>
            )}
          </div>

          {/* Main image with zoom + pan */}
          <div
            className="max-w-[90vw] max-h-[85vh] flex items-center justify-center overflow-hidden"
            style={{ cursor: lbZoom > 1 ? "grab" : "zoom-in" }}
            onClick={function (e) {
              e.stopPropagation();
              if (lbZoom <= 1) {
                setLbZoom(2.5);
              } else {
                setLbZoom(1);
                setLbPan({ x: 0, y: 0 });
              }
            }}
            onMouseDown={function (e) {
              if (lbZoom <= 1) return;
              e.preventDefault();
              lbDragging.current = true;
              lbLastPos.current = { x: e.clientX, y: e.clientY };
              (e.currentTarget as HTMLDivElement).style.cursor = "grabbing";
            }}
            onMouseMove={function (e) {
              if (!lbDragging.current || lbZoom <= 1) return;
              var dx = e.clientX - lbLastPos.current.x;
              var dy = e.clientY - lbLastPos.current.y;
              lbLastPos.current = { x: e.clientX, y: e.clientY };
              setLbPan(function (prev) { return { x: prev.x + dx, y: prev.y + dy }; });
            }}
            onMouseUp={function (e) {
              lbDragging.current = false;
              (e.currentTarget as HTMLDivElement).style.cursor = lbZoom > 1 ? "grab" : "zoom-in";
            }}
            onMouseLeave={function (e) {
              lbDragging.current = false;
              (e.currentTarget as HTMLDivElement).style.cursor = lbZoom > 1 ? "grab" : "zoom-in";
            }}
            onTouchStart={function (e) {
              if (lbZoom <= 1 || e.touches.length !== 1) return;
              lbDragging.current = true;
              lbLastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }}
            onTouchMove={function (e) {
              if (!lbDragging.current || lbZoom <= 1 || e.touches.length !== 1) return;
              var dx = e.touches[0].clientX - lbLastPos.current.x;
              var dy = e.touches[0].clientY - lbLastPos.current.y;
              lbLastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
              setLbPan(function (prev) { return { x: prev.x + dx, y: prev.y + dy }; });
            }}
            onTouchEnd={function () { lbDragging.current = false; }}
          >
            <img
              src={activeImage!.url}
              alt={product.titulo + " - Imagem " + activeImage!.number}
              className="max-w-full max-h-[85vh] object-contain select-none pointer-events-none"
              style={{
                transform: "scale(" + lbZoom + ") translate(" + (lbPan.x / lbZoom) + "px, " + (lbPan.y / lbZoom) + "px)",
                transition: lbDragging.current ? "none" : "transform 0.2s ease-out",
              }}
              draggable={false}
            />
          </div>

          {images.length > 1 && (
            <>
              <button
                onClick={function (e) {
                  e.stopPropagation();
                  goToPrev();
                  setLbZoom(1);
                  setLbPan({ x: 0, y: 0 });
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white rounded-full p-3 transition-colors"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                onClick={function (e) {
                  e.stopPropagation();
                  goToNext();
                  setLbZoom(1);
                  setLbPan({ x: 0, y: 0 });
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white rounded-full p-3 transition-colors"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}

          {images.length > 1 && (
            <div
              className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 max-w-[90vw] overflow-x-auto px-4 pb-1"
              onClick={function (e) { e.stopPropagation(); }}
            >
              {images.map(function (img, idx) {
                return (
                  <button
                    key={img.name}
                    onClick={function () {
                      setActiveIndex(idx);
                      setMainImgError(false);
                      setLbZoom(1);
                      setLbPan({ x: 0, y: 0 });
                    }}
                    className={"shrink-0 w-14 h-14 rounded-lg border-2 overflow-hidden transition-all " +
                      (idx === activeIndex
                        ? "border-white shadow-lg"
                        : "border-white/30 opacity-50 hover:opacity-80")}
                  >
                    <img
                      src={img.url}
                      alt={"Miniatura " + img.number}
                      className="w-full h-full object-contain bg-white p-0.5"
                      loading="lazy"
                    />
                  </button>
                );
              })}
            </div>
          )}

          {/* Hint text */}
          {lbZoom <= 1 && (
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 text-white/40 pointer-events-none" style={{ fontSize: "0.75rem" }}>
              Clique ou use o scroll para zoom
            </div>
          )}
        </div>
      )}
    </div>
  );
}