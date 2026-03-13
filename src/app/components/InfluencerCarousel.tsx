import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router";
import { Play, X, ChevronLeft, ChevronRight, Volume2, VolumeX, ShoppingCart, Eye, Package, ShoppingBag, Star } from "lucide-react";
import * as api from "../services/api";
import type { ReelItem, ReelProduct, InfluencerItem, SuperPromo, SuperPromoProduct } from "../services/api";
import { useCart } from "../contexts/CartContext";
import { SwipeHint } from "./SwipeHint";

// ═══════════════════════════════════════════════════════════════════
// InfluencerCarousel — Instagram Stories-style influencer circles
//
// Shows circular profile photos of influencers in a horizontal carousel.
// Clicking an influencer opens a fullscreen TikTok-style reel viewer
// with their associated reels.
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

export function InfluencerCarousel() {
  var [influencers, setInfluencers] = useState<InfluencerItem[]>([]);
  var [loaded, setLoaded] = useState(false);
  var [selectedInfluencer, setSelectedInfluencer] = useState<InfluencerItem | null>(null);
  var [viewerOpen, setViewerOpen] = useState(false);
  var [priceMap, setPriceMap] = useState<Record<string, ReelPriceData>>({});
  var scrollRef = useRef<HTMLDivElement>(null);

  useEffect(function () {
    api.getInfluencers().then(function (res) {
      var infs = (res.influencers || []).filter(function (inf) {
        return inf.reels && inf.reels.length > 0;
      });
      setInfluencers(infs);
      if (infs.length > 0) {
        _loadAllPrices(infs);
      }
    }).catch(function (e) {
      console.error("[InfluencerCarousel] Load error:", e);
    }).finally(function () { setLoaded(true); });
  }, []);

  function _loadAllPrices(infs: InfluencerItem[]) {
    var skuSet: Record<string, boolean> = {};
    for (var i = 0; i < infs.length; i++) {
      var reels = infs[i].reels || [];
      for (var j = 0; j < reels.length; j++) {
        var prods = api.getReelProducts(reels[j]);
        for (var k = 0; k < prods.length; k++) {
          skuSet[prods[k].sku] = true;
        }
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
      for (var m = 0; m < prices.length; m++) {
        var p = prices[m];
        if (!p.found || !p.price) {
          map[p.sku] = { price: null, originalPrice: null, isPromo: false, discountLabel: "" };
          continue;
        }
        var sigePrice = p.price;
        var promoProduct = promoProductMap[p.sku];
        if (promoActive && promo && promoProduct) {
          var computed = api.computePromoPrice(sigePrice, promo, promoProduct);
          map[p.sku] = { price: computed.promoPrice, originalPrice: sigePrice, isPromo: true, discountLabel: computed.discountLabel };
        } else {
          map[p.sku] = { price: sigePrice, originalPrice: null, isPromo: false, discountLabel: "" };
        }
      }
      setPriceMap(map);
    }).catch(function (e) {
      console.error("[InfluencerCarousel] Price load error:", e);
    });
  }

  function openInfluencer(inf: InfluencerItem) {
    setSelectedInfluencer(inf);
    setViewerOpen(true);
  }

  var scroll = useCallback(function (dir: "left" | "right") {
    if (!scrollRef.current) return;
    var amount = dir === "left" ? -200 : 200;
    scrollRef.current.scrollBy({ left: amount, behavior: "smooth" });
  }, []);

  if (!loaded || influencers.length === 0) return null;

  return (
    <section className="bg-white py-8 md:py-10 border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="flex flex-col items-start md:items-center mb-5">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 rounded-lg flex items-center justify-center">
              <Star className="w-4 h-4 text-white fill-white" />
            </div>
            <div className="text-left md:text-center">
              <h3 className="text-gray-800" style={{ fontSize: "1rem", fontWeight: 700 }}>
                Quem Recomenda o Carretão
              </h3>
              <p className="text-gray-400" style={{ fontSize: "0.7rem" }}>
                Veja quem confia e indica nossas peças
              </p>
            </div>
          </div>

        </div>

        {/* Influencer Circles */}
        <div
          ref={scrollRef}
          className="flex gap-5 overflow-x-auto pt-2 pb-2 hide-scrollbar snap-x snap-mandatory md:justify-center -mt-2"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {influencers.map(function (inf) {
            var reelCount = (inf.reels || []).length;
            return (
              <InfluencerCircle
                key={inf.id}
                influencer={inf}
                reelCount={reelCount}
                onClick={function () { openInfluencer(inf); }}
              />
            );
          })}
        </div>
      </div>

      {/* Fullscreen Viewer */}
      {viewerOpen && selectedInfluencer && selectedInfluencer.reels && selectedInfluencer.reels.length > 0 && (
        <InfluencerReelsViewer
          influencer={selectedInfluencer}
          reels={selectedInfluencer.reels}
          priceMap={priceMap}
          onClose={function () { setViewerOpen(false); setSelectedInfluencer(null); }}
        />
      )}
    </section>
  );
}

/** Individual influencer circle — Instagram Stories style */
function InfluencerCircle({ influencer, reelCount, onClick }: {
  influencer: InfluencerItem;
  reelCount: number;
  onClick: () => void;
}) {
  var [imgLoaded, setImgLoaded] = useState(false);

  return (
    <div
      className="shrink-0 snap-start cursor-pointer flex flex-col items-center gap-1.5 group"
      style={{ width: "80px" }}
      onClick={onClick}
    >
      {/* Gradient ring around photo */}
      <div className="relative group-hover:scale-105 transition-transform duration-200">
        <div
          className="w-[72px] h-[72px] rounded-full p-[3px]"
          style={{
            background: "linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888, #8a3ab9, #4c68d7, #6dc8f3)",
          }}
        >
          <div className="w-full h-full rounded-full bg-white p-[2px]">
            <div className="w-full h-full rounded-full overflow-hidden bg-gray-200 relative">
              {influencer.photoUrl ? (
                <img
                  src={influencer.photoUrl}
                  alt={influencer.name}
                  className={"w-full h-full object-cover transition-opacity duration-300 " + (imgLoaded ? "opacity-100" : "opacity-0")}
                  onLoad={function () { setImgLoaded(true); }}
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center">
                  <span className="text-white" style={{ fontSize: "1.2rem", fontWeight: 700 }}>
                    {(influencer.name || "?").charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              {!imgLoaded && influencer.photoUrl && (
                <div className="absolute inset-0 bg-gray-200 animate-pulse rounded-full" />
              )}
            </div>
          </div>
        </div>
        {/* Play badge */}
        <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 bg-red-600 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
          <Play className="w-3 h-3 text-white fill-white ml-0.5" />
        </div>
      </div>
      {/* Name */}
      <p
        className="text-gray-700 text-center truncate w-full px-0.5 group-hover:text-gray-900 transition-colors"
        style={{ fontSize: "0.7rem", fontWeight: 600, lineHeight: 1.2 }}
      >
        {influencer.name}
      </p>
      {reelCount > 1 && (
        <p className="text-gray-400 text-center" style={{ fontSize: "0.55rem", marginTop: "-2px" }}>
          {reelCount} vídeos
        </p>
      )}
    </div>
  );
}

/** Fullscreen viewer for influencer reels */
function InfluencerReelsViewer({ influencer, reels, priceMap, onClose }: {
  influencer: InfluencerItem;
  reels: ReelItem[];
  priceMap: Record<string, ReelPriceData>;
  onClose: () => void;
}) {
  var [currentIndex, setCurrentIndex] = useState(0);
  var [muted, setMuted] = useState(false);
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

  // Auto-play when index changes
  useEffect(function () {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(function () {});
    }
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

  function handleAddToCart(prod: ReelProduct) {
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

  // Compute total price for "Add All" button
  var allTotal = 0;
  var allHavePrice = currentProducts.length > 0;
  for (var _ti = 0; _ti < currentProducts.length; _ti++) {
    var _pd = priceMap[currentProducts[_ti].sku];
    if (_pd && _pd.price) {
      allTotal += _pd.price;
    } else {
      allHavePrice = false;
    }
  }

  // ─── Bottom panel height measurement ───
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
    function onMove(ev: MouseEvent) { seekTo(ev.clientX); }
    function onUp(ev: MouseEvent) { seekTo(ev.clientX); setIsSeeking(false); window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function handleProgressTouchStart(e: React.TouchEvent) {
    e.stopPropagation();
    setIsSeeking(true);
    seekTo(e.touches[0].clientX);
    function onMove(ev: TouchEvent) { ev.preventDefault(); seekTo(ev.touches[0].clientX); }
    function onEnd(ev: TouchEvent) { seekTo(ev.changedTouches[0].clientX); setIsSeeking(false); window.removeEventListener("touchmove", onMove); window.removeEventListener("touchend", onEnd); }
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
        ref={videoRef}
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
        <SwipeHint visible={reels.length > 1} />
      )}

      {/* Top controls */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 z-10"
        style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)" }}
      >
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="w-10 h-10 bg-black/40 rounded-full flex items-center justify-center text-white hover:bg-black/60 transition-colors">
            <X className="w-5 h-5" />
          </button>
          {/* Influencer info */}
          <div className="flex items-center gap-2">
            {influencer.photoUrl && (
              <img src={influencer.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover border-2 border-white/50" />
            )}
            <span className="text-white" style={{ fontSize: "0.85rem", fontWeight: 700, textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>
              {influencer.name}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleMute} className="w-10 h-10 bg-black/40 rounded-full flex items-center justify-center text-white hover:bg-black/60 transition-colors">
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Progress dots */}
      {reels.length > 1 && (
        <div className="absolute top-16 left-0 right-0 flex items-center justify-center gap-1.5 z-10 px-4">
          {reels.map(function (_, idx) {
            return (
              <div
                key={idx}
                className={"h-0.5 rounded-full transition-all duration-300 " + (idx === currentIndex ? "bg-white flex-[2]" : "bg-white/30 flex-1")}
              />
            );
          })}
        </div>
      )}

      {/* Navigation arrows (desktop) */}
      {reels.length > 1 && (
        <>
          {currentIndex > 0 && (
            <button
              onClick={goPrev}
              className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-black/40 rounded-full flex items-center justify-center text-white hover:bg-black/60 transition-colors hidden md:flex"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          {currentIndex < reels.length - 1 && (
            <button
              onClick={goNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-black/40 rounded-full flex items-center justify-center text-white hover:bg-black/60 transition-colors hidden md:flex"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </>
      )}

      {/* Right side actions — positioned above bottom panel */}
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
        {currentProducts.length === 1 && priceMap[currentProducts[0].sku]?.price && (
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
        {currentProducts.length > 1 && (
          <>
            <div className="flex flex-col items-center gap-1">
              <div className="w-11 h-11 bg-blue-600/80 rounded-full flex items-center justify-center text-white">
                <Package className="w-5 h-5" />
              </div>
              <span className="text-white text-center" style={{ fontSize: "0.6rem", fontWeight: 600, textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>
                {currentProducts.length} itens
              </span>
            </div>
            {allHavePrice && (
              <button
                onClick={function () { handleAddAllToCart(); }}
                className="flex flex-col items-center gap-1"
              >
                <div className={"w-11 h-11 rounded-full flex items-center justify-center text-white shadow-lg transition-colors " + (addedAll > 0 ? "bg-green-500" : "bg-red-600 hover:bg-red-700")}>
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <span className="text-white text-center whitespace-pre-line" style={{ fontSize: "0.6rem", fontWeight: 600, textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>
                  {addedAll > 0 ? "Adicionados!" : "Comprar\ntodos"}
                </span>
              </button>
            )}
          </>
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
              <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden group-hover:h-1.5 transition-all">
                <div
                  className="h-full bg-white rounded-full transition-[width] duration-75"
                  style={{ width: (progress * 100) + "%" }}
                />
              </div>
              {/* Drag thumb */}
              <div
                className="absolute w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: "calc(" + (progress * 100) + "% - 6px)", top: "50%", transform: "translateY(-50%)" }}
              />
            </div>
            <span className="text-white/70 shrink-0 tabular-nums" style={{ fontSize: "0.65rem", minWidth: "32px" }}>
              {formatTime(duration)}
            </span>
          </div>

          {/* Product cards */}
          {currentProducts.length > 0 && (
            <div className="mt-2 pb-3">
              <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1" style={{ touchAction: "pan-x" }}>
                {currentProducts.map(function (prod) {
                  var pd = priceMap[prod.sku] || null;
                  return (
                    <Link
                      key={prod.sku}
                      to={"/produto/" + encodeURIComponent(prod.sku)}
                      onClick={onClose}
                      className="shrink-0 flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-lg p-2 hover:bg-white/20 transition-colors"
                      style={{ maxWidth: "200px" }}
                    >
                      <img
                        src={prod.imageUrl || api.getProductMainImageUrl(prod.sku)}
                        alt=""
                        className="w-10 h-10 rounded-md object-cover bg-white/20"
                        onError={function (e: any) { e.target.style.display = "none"; }}
                      />
                      <div className="min-w-0">
                        <p className="text-white truncate" style={{ fontSize: "0.7rem", fontWeight: 600 }}>
                          {prod.title || prod.sku}
                        </p>
                        {pd?.price ? (
                          <p className={pd.isPromo ? "text-green-400" : "text-white/80"} style={{ fontSize: "0.75rem", fontWeight: 700 }}>
                            {formatPrice(pd.price)}
                          </p>
                        ) : (
                          <p className="text-white/50" style={{ fontSize: "0.65rem" }}>Consulte</p>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        {/* Safe area */}
        <div className="h-[env(safe-area-inset-bottom,0px)] bg-black" />
      </div>
    </div>
  );
}