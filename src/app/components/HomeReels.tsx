/**
 * HOME REELS — Videos curtos estilo TikTok/Instagram Reels na homepage.
 * Exibe thumbnails em grid; ao clicar, abre modal fullscreen com autoplay.
 * Navegacao: swipe ou setas. Cada reel pode ter produtos vinculados (cards overlay).
 * Dados: GET /reels. Videos hospedados no Supabase Storage.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router";
import { Play, X, ChevronLeft, ChevronRight, Volume2, VolumeX, ShoppingCart, Eye, Package, ShoppingBag } from "lucide-react";
import * as api from "../services/api";
import type { ReelItem, ReelProduct, SuperPromo, SuperPromoProduct } from "../services/api";
import { useCart } from "../contexts/CartContext";
import { SwipeHint } from "./SwipeHint";

// ═══════════════════════════════════════════════════════════════════
// HomeReels — TikTok/MercadoLivre-style short video carousel
//
// PERFORMANCE:
// ● Lazy-loaded via React.lazy() — zero initial bundle cost
// ● Thumbnails are static images with IntersectionObserver
// ● Videos use preload="none" until user clicks
// ● Real-time prices fetched from SIGE + Super Promo check
// ● Renders nothing if no reels configured
// ● Supports multiple products per reel
// ═══════════════════════════════════════════════════════════════════

function formatPrice(val: number | null | undefined): string {
  if (!val) return "";
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
}

interface ReelPriceData {
  price: number | null;
  originalPrice: number | null;
  isPromo: boolean;
  discountLabel: string;
}

/** Horizontal scrollable strip of reel thumbnails */
export function HomeReels() {
  var [reels, setReels] = useState<ReelItem[]>([]);
  var [loaded, setLoaded] = useState(false);
  var [viewerOpen, setViewerOpen] = useState(false);
  var [viewerIndex, setViewerIndex] = useState(0);
  var scrollRef = useRef<HTMLDivElement>(null);
  var [priceMap, setPriceMap] = useState<Record<string, ReelPriceData>>({});
  var [sellableSet, setSellableSet] = useState<Set<string> | null>(null);

  useEffect(function () {
    api.getReels().then(function (res) {
      var allReels = res.reels || [];
      var r = allReels.filter(function (reel) {
        if ((reel as any).influencerId) return false;
        var prods = api.getReelProducts(reel);
        if (prods.length === 0 && !(reel as any).productSku) return false;
        return true;
      });
      setReels(r);
      if (r.length > 0) {
        _loadPrices(r);
        // Fetch sellable status for all reel products
        var skuSet: Record<string, boolean> = {};
        for (var i = 0; i < r.length; i++) {
          var prods = api.getReelProducts(r[i]);
          for (var j = 0; j < prods.length; j++) skuSet[prods[j].sku] = true;
        }
        var allSkus = Object.keys(skuSet);
        if (allSkus.length > 0) {
          api.getProductMetaBulk(allSkus).then(function (metaRes) {
            var raw = metaRes || {};
            var set = new Set<string>();
            for (var mk in raw) { if (raw[mk].sellable === true) set.add(mk); }
            setSellableSet(set);
          }).catch(function () {});
        }
      }
    }).catch(function () {}).finally(function () { setLoaded(true); });
  }, []);

  // Load real prices from SIGE + check Super Promo
  function _loadPrices(reelsList: ReelItem[]) {
    var skuSet: Record<string, boolean> = {};
    for (var i = 0; i < reelsList.length; i++) {
      var prods = api.getReelProducts(reelsList[i]);
      for (var j = 0; j < prods.length; j++) {
        skuSet[prods[j].sku] = true;
      }
    }
    var skus = Object.keys(skuSet);
    if (skus.length === 0) return;

    Promise.all([
      api.getProductPricesBulkSafe(skus),
      api.getActivePromo().catch(function () { return { promo: null }; }),
    ]).then(function (results) {
      var priceResult = results[0];
      var promoResult = results[1];
      var prices = priceResult.results || [];
      var promo: SuperPromo | null = promoResult.promo || null;
      var now = Date.now();

      var promoActive = promo && promo.enabled && promo.startDate <= now && promo.endDate >= now;
      var promoProductMap: Record<string, SuperPromoProduct> = {};
      if (promoActive && promo && promo.products) {
        for (var pi = 0; pi < promo.products.length; pi++) {
          promoProductMap[promo.products[pi].sku] = promo.products[pi];
        }
      }

      var map: Record<string, ReelPriceData> = {};
      for (var k = 0; k < prices.length; k++) {
        var p = prices[k];
        if (!p.found || !p.price) {
          map[p.sku] = { price: null, originalPrice: null, isPromo: false, discountLabel: "" };
          continue;
        }

        var sigePrice = p.price;
        var promoProduct = promoProductMap[p.sku];

        if (promoActive && promo && promoProduct) {
          var computed = api.computePromoPrice(sigePrice, promo, promoProduct);
          map[p.sku] = {
            price: computed.promoPrice,
            originalPrice: sigePrice,
            isPromo: true,
            discountLabel: computed.discountLabel,
          };
        } else {
          map[p.sku] = { price: sigePrice, originalPrice: null, isPromo: false, discountLabel: "" };
        }
      }
      setPriceMap(map);
    }).catch(function (e) {
      console.error("[HomeReels] Price load error:", e);
    });
  }

  var openViewer = useCallback(function (index: number) {
    setViewerIndex(index);
    setViewerOpen(true);
  }, []);

  var scroll = useCallback(function (dir: "left" | "right") {
    if (!scrollRef.current) return;
    var amount = dir === "left" ? -220 : 220;
    scrollRef.current.scrollBy({ left: amount, behavior: "smooth" });
  }, []);

  if (loaded && reels.length === 0) return null;
  if (!loaded) return null;

  return (
    <section className="bg-white py-6 md:py-8 border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-red-500 to-red-600 rounded-lg flex items-center justify-center">
              <Play className="w-4 h-4 text-white fill-white" />
            </div>
            <div>
              <h3 className="text-gray-800" style={{ fontSize: "1rem", fontWeight: 700 }}>
                Vídeos
              </h3>
              <p className="text-gray-400" style={{ fontSize: "0.7rem" }}>
                Veja nossos produtos em ação
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1">
            <button
              onClick={function () { scroll("left"); }}
              className="p-1.5 rounded-full border border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={function () { scroll("right"); }}
              className="p-1.5 rounded-full border border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Thumbnail Strip */}
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar snap-x snap-mandatory"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {reels.map(function (reel, idx) {
            var prods = api.getReelProducts(reel);
            var firstSku = prods.length > 0 ? prods[0].sku : "";
            // Only show price on thumbnail if product is sellable
            var firstSellable = sellableSet ? sellableSet.has(firstSku) : true;
            return (
              <ReelThumbnail
                key={reel.id}
                reel={reel}
                products={prods}
                priceData={firstSku && firstSellable ? (priceMap[firstSku] || null) : null}
                productCount={prods.length}
                onClick={function () { openViewer(idx); }}
              />
            );
          })}
        </div>
      </div>

      {/* Fullscreen Viewer */}
      {viewerOpen && (
        <ReelsViewer
          reels={reels}
          priceMap={priceMap}
          initialIndex={viewerIndex}
          onClose={function () { setViewerOpen(false); }}
          sellableSet={sellableSet}
        />
      )}
    </section>
  );
}

/** Individual thumbnail card */
function ReelThumbnail({ reel, products, priceData, productCount, onClick }: {
  reel: ReelItem;
  products: ReelProduct[];
  priceData: ReelPriceData | null;
  productCount: number;
  onClick: () => void;
}) {
  var [imgLoaded, setImgLoaded] = useState(false);
  var containerRef = useRef<HTMLDivElement>(null);
  var [visible, setVisible] = useState(false);

  useEffect(function () {
    var el = containerRef.current;
    if (!el) return;
    var obs = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) {
        setVisible(true);
        obs.disconnect();
      }
    }, { rootMargin: "200px" });
    obs.observe(el);
    return function () { obs.disconnect(); };
  }, []);

  var displayPrice = priceData?.price;
  var originalPrice = priceData?.originalPrice;
  var isPromo = priceData?.isPromo || false;
  var firstProd = products[0] || null;

  return (
    <div
      ref={containerRef}
      className="shrink-0 snap-start cursor-pointer group"
      style={{ width: "140px" }}
      onClick={onClick}
    >
      <div
        className="relative rounded-xl overflow-hidden bg-gray-100 mb-2"
        style={{ aspectRatio: "9 / 16" }}
      >
        {visible && reel.thumbnailUrl && (
          <img
            src={reel.thumbnailUrl}
            alt={reel.title || "Video"}
            className={"w-full h-full object-cover transition-opacity duration-300 " + (imgLoaded ? "opacity-100" : "opacity-0")}
            loading="lazy"
            decoding="async"
            onLoad={function () { setImgLoaded(true); }}
          />
        )}
        {(!visible || !imgLoaded) && (
          <div className="absolute inset-0 bg-gradient-to-b from-gray-200 to-gray-300 animate-pulse" />
        )}

        {/* Play overlay */}
        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-colors flex items-center justify-center">
          <div className="w-10 h-10 bg-white/90 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
            <Play className="w-5 h-5 text-red-600 fill-red-600 ml-0.5" />
          </div>
        </div>

        {/* Promo badge */}
        {isPromo && priceData?.discountLabel && (
          <div className="absolute top-2 left-2">
            <span className="bg-green-500 text-white px-1.5 py-0.5 rounded-md shadow-sm" style={{ fontSize: "0.6rem", fontWeight: 700 }}>
              {priceData.discountLabel}
            </span>
          </div>
        )}

        {/* Multi-product badge */}
        {productCount > 1 && (
          <div className="absolute top-2 right-2">
            <span className="bg-blue-600 text-white px-1.5 py-0.5 rounded-md shadow-sm flex items-center gap-0.5" style={{ fontSize: "0.6rem", fontWeight: 700 }}>
              <Package className="w-2.5 h-2.5" />
              {productCount}
            </span>
          </div>
        )}

        {/* Product price badge */}
        {firstProd && (
          <div className="absolute bottom-2 left-2 right-2">
            <div className="bg-white/95 backdrop-blur-sm rounded-lg px-2 py-1.5 shadow-sm">
              {/* Stacked product images for multi-product reels */}
              {productCount > 1 && (
                <div className="flex items-center mb-1">
                  <div className="flex -space-x-2">
                    {products.slice(0, 3).map(function (prod, i) {
                      return (
                        <img
                          key={prod.sku}
                          src={prod.imageUrl || api.getProductMainImageUrl(prod.sku)}
                          alt=""
                          className="w-5 h-5 rounded-full object-cover border-2 border-white bg-gray-100"
                          style={{ zIndex: 3 - i }}
                          onError={function (e: any) { e.target.style.display = "none"; }}
                        />
                      );
                    })}
                    {productCount > 3 && (
                      <div className="w-5 h-5 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center" style={{ zIndex: 0 }}>
                        <span className="text-gray-500" style={{ fontSize: "0.45rem", fontWeight: 700 }}>+{productCount - 3}</span>
                      </div>
                    )}
                  </div>
                  <span className="text-gray-500 ml-1.5" style={{ fontSize: "0.55rem", fontWeight: 600 }}>
                    {productCount} produtos
                  </span>
                </div>
              )}
              <p className="text-gray-800 truncate" style={{ fontSize: "0.65rem", fontWeight: 600 }}>
                {firstProd.title || firstProd.sku}
                {productCount > 1 ? " +" + (productCount - 1) : ""}
              </p>
              {displayPrice ? (
                <div>
                  {isPromo && originalPrice ? (
                    <>
                      <p className="text-gray-400 line-through" style={{ fontSize: "0.6rem" }}>
                        {formatPrice(originalPrice)}
                      </p>
                      <p className="text-green-600" style={{ fontSize: "0.75rem", fontWeight: 800 }}>
                        {formatPrice(displayPrice)}
                      </p>
                    </>
                  ) : (
                    <p className="text-red-600" style={{ fontSize: "0.75rem", fontWeight: 800 }}>
                      {formatPrice(displayPrice)}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-gray-400" style={{ fontSize: "0.65rem" }}>Consulte</p>
              )}
            </div>
          </div>
        )}
      </div>

      {reel.title && (
        <p className="text-gray-600 truncate px-0.5" style={{ fontSize: "0.72rem", fontWeight: 500 }}>
          {reel.title}
        </p>
      )}
    </div>
  );
}

/** Fullscreen TikTok-style video viewer with swipe navigation */
function ReelsViewer({ reels, priceMap, initialIndex, onClose, sellableSet }: {
  reels: ReelItem[];
  priceMap: Record<string, ReelPriceData>;
  initialIndex: number;
  onClose: () => void;
  sellableSet: Set<string> | null;
}) {
  var [currentIndex, setCurrentIndex] = useState(initialIndex);
  var [muted, setMuted] = useState(true);
  var videoRef = useRef<HTMLVideoElement>(null);
  var touchStartY = useRef(0);
  var touchStartX = useRef(0);
  var { addItem, openDrawer } = useCart();

  var current = reels[currentIndex];
  var currentProducts = current ? api.getReelProducts(current) : [];

  // Lock body scroll — robust technique that works on iOS Safari too
  useEffect(function () {
    var scrollY = window.scrollY;
    var origStyle = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      left: document.body.style.left,
      right: document.body.style.right,
      width: document.body.style.width,
    };
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = "-" + scrollY + "px";
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
    return function () {
      document.body.style.overflow = origStyle.overflow;
      document.body.style.position = origStyle.position;
      document.body.style.top = origStyle.top;
      document.body.style.left = origStyle.left;
      document.body.style.right = origStyle.right;
      document.body.style.width = origStyle.width;
      window.scrollTo(0, scrollY);
    };
  }, []);

  // Auto-play when index changes — fallback to muted if browser blocks unmuted autoplay
  useEffect(function () {
    var vid = videoRef.current;
    if (!vid) return;
    vid.currentTime = 0;
    vid.play().catch(function () {
      vid.muted = true;
      setMuted(true);
      vid.play().catch(function () {});
    });
  }, [currentIndex]);

  // Keyboard navigation
  useEffect(function () {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        setCurrentIndex(function (prev) { return prev < reels.length - 1 ? prev + 1 : prev; });
      }
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        setCurrentIndex(function (prev) { return prev > 0 ? prev - 1 : prev; });
      }
    }
    window.addEventListener("keydown", handleKey);
    return function () { window.removeEventListener("keydown", handleKey); };
  }, [onClose, reels.length]);

  function goNext() {
    setCurrentIndex(function (prev) { return prev < reels.length - 1 ? prev + 1 : prev; });
  }

  function goPrev() {
    setCurrentIndex(function (prev) { return prev > 0 ? prev - 1 : prev; });
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    var deltaY = e.changedTouches[0].clientY - touchStartY.current;
    var deltaX = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 60) {
      if (deltaY < 0) goNext();
      if (deltaY > 0) goPrev();
    }
  }

  function toggleMute() {
    setMuted(function (prev) { return !prev; });
    if (videoRef.current) videoRef.current.muted = !videoRef.current.muted;
  }

  function isSellable(sku: string) {
    return !sellableSet || sellableSet.has(sku);
  }

  function handleAddToCart(prod: ReelProduct) {
    if (!isSellable(prod.sku)) return;
    var priceData = priceMap[prod.sku] || null;
    var price = priceData?.price || null;
    addItem({
      sku: prod.sku,
      titulo: prod.title || prod.sku,
      precoUnitario: price,
      imageUrl: prod.imageUrl || api.getProductMainImageUrl(prod.sku),
      isPromo: priceData?.isPromo || false,
    });
  }

  function handleAddAllToCart() {
    var added = 0;
    for (var i = 0; i < currentProducts.length; i++) {
      var prod = currentProducts[i];
      if (!isSellable(prod.sku)) continue;
      var pd = priceMap[prod.sku] || null;
      var price = pd?.price || null;
      if (price) {
        addItem({
          sku: prod.sku,
          titulo: prod.title || prod.sku,
          precoUnitario: price,
          imageUrl: prod.imageUrl || api.getProductMainImageUrl(prod.sku),
          isPromo: pd?.isPromo || false,
        });
        added++;
      }
    }
    setAddedAll(added);
    setTimeout(function () {
      setAddedAll(0);
      if (added > 0) {
        onClose();
        openDrawer();
      }
    }, 800);
  }

  var [addedAll, setAddedAll] = useState(0);

  // Compute total price for "Add All" button (only sellable products)
  var sellableProducts = currentProducts.filter(function (p) { return isSellable(p.sku); });
  var allTotal = 0;
  var allHavePrice = sellableProducts.length > 0;
  for (var _ti = 0; _ti < sellableProducts.length; _ti++) {
    var _pd = priceMap[sellableProducts[_ti].sku];
    if (_pd && _pd.price) {
      allTotal += _pd.price;
    } else {
      allHavePrice = false;
    }
  }

  // ─── Bottom panel height measurement (for right-side button positioning) ───
  var bottomPanelRef = useRef<HTMLDivElement>(null);
  var [bottomH, setBottomH] = useState(200);

  useEffect(function () {
    var el = bottomPanelRef.current;
    if (!el) return;
    function measure() {
      if (el) setBottomH(el.offsetHeight);
    }
    measure();
    var ro = new ResizeObserver(measure);
    ro.observe(el);
    return function () { ro.disconnect(); };
  }, [currentIndex]);

  // ─── Video progress bar state ───
  var [progress, setProgress] = useState(0);
  var [duration, setDuration] = useState(0);
  var [isSeeking, setIsSeeking] = useState(false);
  var progressBarRef = useRef<HTMLDivElement>(null);

  useEffect(function () {
    var vid = videoRef.current;
    if (!vid) return;
    function onTimeUpdate() {
      if (!isSeeking && vid && vid.duration) {
        setProgress(vid.currentTime / vid.duration);
      }
    }
    function onLoadedMetadata() {
      if (vid) setDuration(vid.duration);
    }
    function onDurationChange() {
      if (vid && vid.duration && isFinite(vid.duration)) setDuration(vid.duration);
    }
    vid.addEventListener("timeupdate", onTimeUpdate);
    vid.addEventListener("loadedmetadata", onLoadedMetadata);
    vid.addEventListener("durationchange", onDurationChange);
    return function () {
      vid.removeEventListener("timeupdate", onTimeUpdate);
      vid.removeEventListener("loadedmetadata", onLoadedMetadata);
      vid.removeEventListener("durationchange", onDurationChange);
    };
  }, [currentIndex, isSeeking]);

  // Reset progress when changing reel
  useEffect(function () {
    setProgress(0);
    setDuration(0);
  }, [currentIndex]);

  function seekTo(clientX: number) {
    var bar = progressBarRef.current;
    var vid = videoRef.current;
    if (!bar || !vid || !vid.duration) return;
    var rect = bar.getBoundingClientRect();
    var ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    vid.currentTime = ratio * vid.duration;
    setProgress(ratio);
  }

  function handleProgressMouseDown(e: React.MouseEvent) {
    e.stopPropagation();
    setIsSeeking(true);
    seekTo(e.clientX);

    function onMove(ev: MouseEvent) {
      seekTo(ev.clientX);
    }
    function onUp(ev: MouseEvent) {
      seekTo(ev.clientX);
      setIsSeeking(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function handleProgressTouchStart(e: React.TouchEvent) {
    e.stopPropagation();
    setIsSeeking(true);
    seekTo(e.touches[0].clientX);

    function onMove(ev: TouchEvent) {
      ev.preventDefault();
      seekTo(ev.touches[0].clientX);
    }
    function onEnd(ev: TouchEvent) {
      seekTo(ev.changedTouches[0].clientX);
      setIsSeeking(false);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    }
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
  }

  function formatTime(s: number): string {
    if (!s || !isFinite(s)) return "0:00";
    var m = Math.floor(s / 60);
    var sec = Math.floor(s % 60);
    return m + ":" + (sec < 10 ? "0" : "") + sec;
  }

  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black flex items-center justify-center"
      style={{ overscrollBehavior: "contain", touchAction: "none" }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onWheel={function (e) { e.stopPropagation(); }}
    >
      {/* Video */}
      <video
        ref={function (el) {
          (videoRef as any).current = el;
          if (el) {
            el.play().catch(function () {});
          }
        }}
        src={current.videoUrl}
        className="absolute inset-0 w-full h-full object-contain"
        playsInline
        autoPlay
        loop
        muted={muted}
        preload="auto"
        onClick={function () {
          if (videoRef.current) {
            if (videoRef.current.paused) videoRef.current.play().catch(function () {});
            else videoRef.current.pause();
          }
        }}
      />

      {/* Swipe hint — only on mobile when multiple reels exist */}
      {reels.length > 1 && (
        <div className="md:hidden">
          <SwipeHint visible={reels.length > 1} />
        </div>
      )}

      {/* Top controls */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 z-10"
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)" }}
      >
        <button onClick={onClose} className="w-10 h-10 bg-black/40 rounded-full flex items-center justify-center text-white hover:bg-black/60 transition-colors">
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <button onClick={toggleMute} className="w-10 h-10 bg-black/40 rounded-full flex items-center justify-center text-white hover:bg-black/60 transition-colors">
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Navigation arrows — bigger on desktop */}
      {reels.length > 1 && (
        <>
          <button
            onClick={goPrev}
            disabled={currentIndex === 0}
            className="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 z-20 w-10 h-10 md:w-14 md:h-14 rounded-full text-white transition-all duration-200 hover:scale-110"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", opacity: currentIndex === 0 ? 0.3 : 1, pointerEvents: currentIndex === 0 ? "none" : "auto" }}
          >
            <ChevronLeft className="w-5 h-5 md:w-7 md:h-7" />
          </button>
          <button
            onClick={goNext}
            disabled={currentIndex === reels.length - 1}
            className="absolute right-3 md:right-6 top-1/2 -translate-y-1/2 z-20 w-10 h-10 md:w-14 md:h-14 rounded-full text-white transition-all duration-200 hover:scale-110"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", opacity: currentIndex === reels.length - 1 ? 0.3 : 1, pointerEvents: currentIndex === reels.length - 1 ? "none" : "auto" }}
          >
            <ChevronRight className="w-5 h-5 md:w-7 md:h-7" />
          </button>
        </>
      )}

      {/* Right side actions (TikTok-style) — positioned above bottom panel */}
      <div
        className="absolute right-3 flex flex-col items-center gap-5 z-20"
        style={{ bottom: (bottomH + 12) + "px" }}
      >
        {currentProducts.length === 1 && (
          <Link
            to={"/produto/" + encodeURIComponent(currentProducts[0].sku)}
            onClick={onClose}
            className="flex flex-col items-center gap-1"
          >
            <div className="w-11 h-11 bg-black/40 rounded-full flex items-center justify-center text-white hover:bg-black/60 transition-colors">
              <Eye className="w-5 h-5" />
            </div>
            <span className="text-white text-center" style={{ fontSize: "0.6rem", fontWeight: 600, textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>Ver</span>
          </Link>
        )}
        {currentProducts.length === 1 && priceMap[currentProducts[0].sku]?.price && isSellable(currentProducts[0].sku) && (
          <button
            onClick={function () { handleAddToCart(currentProducts[0]); }}
            className="flex flex-col items-center gap-1"
          >
            <div className="w-11 h-11 bg-red-600 rounded-full flex items-center justify-center text-white hover:bg-red-700 transition-colors shadow-lg">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <span className="text-white text-center" style={{ fontSize: "0.6rem", fontWeight: 600, textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>Comprar</span>
          </button>
        )}
      </div>

      {/* Bottom panel: progress bar + product cards — isolate touch events so swipe navigation doesn't fire */}
      <div
        ref={bottomPanelRef}
        className="absolute bottom-0 left-0 right-0 z-10"
        onTouchStart={function (e) { e.stopPropagation(); }}
        onTouchEnd={function (e) { e.stopPropagation(); }}
        onTouchMove={function (e) { e.stopPropagation(); }}
      >
        {/* Video progress bar */}
        <div
          className="px-4 pb-2 pt-6"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)" }}
        >
          <div className="flex items-center gap-2">
            <span className="text-white/70 shrink-0 tabular-nums" style={{ fontSize: "0.65rem", minWidth: "32px", textAlign: "right" }}>
              {formatTime(progress * duration)}
            </span>
            <div
              ref={progressBarRef}
              className="flex-1 relative cursor-pointer group"
              style={{ height: "20px", display: "flex", alignItems: "center" }}
              onMouseDown={handleProgressMouseDown}
              onTouchStart={handleProgressTouchStart}
            >
              {/* Track bg */}
              <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden group-hover:h-1.5 transition-all">
                {/* Filled */}
                <div
                  className="h-full bg-white rounded-full transition-[width] duration-75"
                  style={{ width: (progress * 100) + "%" }}
                />
              </div>
              {/* Thumb */}
              <div
                className={"absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-lg transition-opacity " + (isSeeking ? "opacity-100 scale-110" : "opacity-0 group-hover:opacity-100")}
                style={{ left: "calc(" + (progress * 100) + "% - 7px)" }}
              />
            </div>
            <span className="text-white/70 shrink-0 tabular-nums" style={{ fontSize: "0.65rem", minWidth: "32px" }}>
              {formatTime(duration)}
            </span>
          </div>
        </div>

        {/* Product cards area */}
        <div
          className="px-4 pb-6"
          style={{ background: "rgba(0,0,0,0.7)" }}
        >
          {/* Video title */}
          {current.title && (
            <p className="text-white mb-3 max-w-[75%]" style={{ fontSize: "0.9rem", fontWeight: 500, textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>
              {current.title}
            </p>
          )}

          {/* Product cards — scrollable if multiple */}
          {currentProducts.length > 0 && (
            <div
              className={currentProducts.length > 1 ? "flex gap-2.5 overflow-x-auto pb-1 hide-scrollbar snap-x snap-mandatory" : ""}
              style={currentProducts.length > 1 ? { touchAction: "pan-x" } : undefined}
            >
              {currentProducts.map(function (prod) {
                var prodSellable = isSellable(prod.sku);
                var pd = prodSellable ? (priceMap[prod.sku] || null) : null;
                var displayPrice = pd?.price;
                var originalPrice = pd?.originalPrice;
                var isPromo = pd?.isPromo || false;

                return (
                  <Link
                    key={prod.sku}
                    to={"/produto/" + encodeURIComponent(prod.sku)}
                    onClick={onClose}
                    className={"flex items-center gap-3 bg-white/95 backdrop-blur-md rounded-xl p-3 shadow-xl hover:bg-white transition-colors " + (currentProducts.length > 1 ? "shrink-0 snap-start" : "max-w-sm")}
                    style={currentProducts.length > 1 ? { width: "280px" } : undefined}
                  >
                    {/* Product image */}
                    <img
                      src={prod.imageUrl || api.getProductMainImageUrl(prod.sku)}
                      alt={prod.title || ""}
                      className="w-14 h-14 rounded-lg object-cover bg-gray-100 shrink-0"
                      onError={function (e: any) { e.target.style.display = "none"; }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-gray-800 truncate" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                        {prod.title || prod.sku}
                      </p>
                      {prodSellable && displayPrice ? (
                        <div className="mt-0.5">
                          {isPromo && originalPrice ? (
                            <div className="flex items-center gap-2">
                              <span className="text-gray-400 line-through" style={{ fontSize: "0.72rem" }}>
                                {formatPrice(originalPrice)}
                              </span>
                              {pd?.discountLabel && (
                                <span className="bg-green-100 text-green-700 px-1 py-0.5 rounded" style={{ fontSize: "0.55rem", fontWeight: 700 }}>
                                  {pd.discountLabel}
                                </span>
                              )}
                            </div>
                          ) : null}
                          <p className={isPromo ? "text-green-600" : "text-red-600"} style={{ fontSize: "1rem", fontWeight: 800 }}>
                            {formatPrice(displayPrice)}
                          </p>
                        </div>
                      ) : !prodSellable ? (
                        <p className="text-amber-500 mt-0.5" style={{ fontSize: "0.72rem", fontWeight: 600 }}>Indisponível para venda</p>
                      ) : (
                        <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.78rem" }}>Consulte o preco</p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                      {prodSellable && displayPrice && (
                        <button
                          onClick={function (e) { e.preventDefault(); e.stopPropagation(); handleAddToCart(prod); }}
                          className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center text-white hover:bg-red-700 transition-colors shadow"
                          title="Adicionar ao carrinho"
                        >
                          <ShoppingCart className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Scroll hint for multiple products */}
          {currentProducts.length > 1 && (
            <div className="flex items-center justify-center mt-2 gap-1.5">
              {currentProducts.map(function (prod) {
                return (
                  <div key={prod.sku} className="w-1.5 h-1.5 rounded-full bg-white/50" />
                );
              })}
              <span className="text-white/50 ml-1" style={{ fontSize: "0.6rem" }}>
                Deslize para ver todos
              </span>
            </div>
          )}

          {/* "Add All" combo button for multi-product reels (only sellable) */}
          {sellableProducts.length > 1 && allHavePrice && (
            <button
              onClick={function (e) { e.stopPropagation(); handleAddAllToCart(); }}
              className={"flex items-center justify-center gap-2 w-full mt-2.5 py-2.5 rounded-xl shadow-lg transition-all " + (addedAll > 0 ? "bg-green-500 hover:bg-green-600" : "bg-red-600 hover:bg-red-700")}
            >
              {addedAll > 0 ? (
                <>
                  <ShoppingBag className="w-4 h-4 text-white" />
                  <span className="text-white" style={{ fontSize: "0.82rem", fontWeight: 700 }}>
                    {addedAll} {addedAll === 1 ? "produto adicionado" : "produtos adicionados"}!
                  </span>
                </>
              ) : (
                <>
                  <ShoppingBag className="w-4 h-4 text-white" />
                  <span className="text-white" style={{ fontSize: "0.82rem", fontWeight: 700 }}>
                    Adicionar Todos ({sellableProducts.length}) — {formatPrice(allTotal)}
                  </span>
                </>
              )}
            </button>
          )}

          {/* Counter */}
          <div className="flex items-center justify-center mt-3">
            <span className="text-white/60" style={{ fontSize: "0.7rem" }}>
              {currentIndex + 1} / {reels.length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}