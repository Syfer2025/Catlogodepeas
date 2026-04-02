import { useState, useEffect, useRef } from "react";
import { Play, Pause, Volume2, VolumeX, X } from "lucide-react";
import * as api from "../services/api";
import type { ReelItem } from "../services/api";

// ═══════════════════════════════════════════════════════════════════
// ProductReels — hook + clean player for product-linked reels.
// Exports useProductReels (fetches matching reels) and
// ProductReelPlayer (minimal fullscreen video, no cards/overlays).
// ═══════════════════════════════════════════════════════════════════

/** Hook: fetches active reels with showOnProduct=true for a given SKU */
export function useProductReels(sku: string) {
  var [reels, setReels] = useState<ReelItem[]>([]);
  var [loaded, setLoaded] = useState(false);

  useEffect(function () {
    if (!sku) { setLoaded(true); return; }
    api.getReels().then(function (res) {
      var all = res.reels || [];
      var matching = all.filter(function (reel) {
        if (reel.active === false) return false;
        if (!reel.showOnProduct) return false;
        // Exclude influencer reels — they should only appear in the influencer carousel
        if ((reel as any).influencerId) return false;
        // Must have products linked to be a product reel
        var products = api.getReelProducts(reel);
        if (products.length === 0) return false;
        return products.some(function (p) { return p.sku === sku; });
      });
      setReels(matching);
    }).catch(function () {}).finally(function () { setLoaded(true); });
  }, [sku]);

  return { reels, loaded };
}

/** Clean fullscreen player — video only, no product cards */
export function ProductReelPlayer({ reel, onClose }: { reel: ReelItem; onClose: () => void }) {
  var videoRef = useRef<HTMLVideoElement>(null);
  var progressRef = useRef<HTMLDivElement>(null);
  var [playing, setPlaying] = useState(true);
  var [muted, setMuted] = useState(false);
  var [currentTime, setCurrentTime] = useState(0);
  var [duration, setDuration] = useState(0);
  var [dragging, setDragging] = useState(false);

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

  useEffect(function () {
    var handler = function (e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return function () { window.removeEventListener("keydown", handler); };
  }, []);

  useEffect(function () {
    var vid = videoRef.current;
    if (!vid) return;
    vid.currentTime = 0;
    vid.muted = false;
    setMuted(false);
    vid.play().catch(function () {
      vid.muted = true;
      setMuted(true);
      vid.play().catch(function () {});
    });
  }, [reel.videoUrl]);

  function togglePlay() {
    var vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      vid.play().catch(function () {});
      setPlaying(true);
    } else {
      vid.pause();
      setPlaying(false);
    }
  }

  function toggleMute() {
    var vid = videoRef.current;
    if (!vid) return;
    vid.muted = !vid.muted;
    setMuted(vid.muted);
  }

  function handleTimeUpdate() {
    if (dragging) return;
    var vid = videoRef.current;
    if (vid) setCurrentTime(vid.currentTime);
  }

  function seekTo(clientX: number) {
    var bar = progressRef.current;
    var vid = videoRef.current;
    if (!bar || !vid || !vid.duration) return;
    var rect = bar.getBoundingClientRect();
    var ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    vid.currentTime = ratio * vid.duration;
    setCurrentTime(vid.currentTime);
  }

  function handleBarMouseDown(e: React.MouseEvent) {
    e.stopPropagation();
    setDragging(true);
    seekTo(e.clientX);
    function onMove(ev: MouseEvent) { seekTo(ev.clientX); }
    function onUp() {
      setDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function handleBarTouchStart(e: React.TouchEvent) {
    e.stopPropagation();
    setDragging(true);
    seekTo(e.touches[0].clientX);
    function onMove(ev: TouchEvent) { ev.preventDefault(); seekTo(ev.touches[0].clientX); }
    function onEnd() {
      setDragging(false);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    }
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
  }

  function fmtTime(s: number): string {
    if (!s || !isFinite(s)) return "0:00";
    var m = Math.floor(s / 60);
    var sec = Math.floor(s % 60);
    return m + ":" + (sec < 10 ? "0" : "") + sec;
  }

  var progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div
      className="fixed inset-0 z-[999] bg-black/95 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="relative bg-black rounded-2xl overflow-hidden shadow-2xl"
        style={{ width: "min(360px, 90vw)", height: "min(640px, 90vh)" }}
        onClick={function (e) { e.stopPropagation(); }}
      >
        {/* Video */}
        <video
          ref={videoRef}
          src={reel.videoUrl}
          className="w-full h-full object-contain"
          autoPlay
          muted={muted}
          playsInline
          loop
          onLoadedMetadata={function () {
            var vid = videoRef.current;
            if (vid) setDuration(vid.duration);
          }}
          onTimeUpdate={handleTimeUpdate}
          onPlay={function () { setPlaying(true); }}
          onPause={function () { setPlaying(false); }}
          onClick={togglePlay}
        />

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-9 h-9 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Title */}
        {reel.title && (
          <div className="absolute top-3 left-3 right-14 z-10">
            <p className="text-white drop-shadow-lg leading-tight" style={{ fontSize: "0.85rem", fontWeight: 700 }}>
              {reel.title}
            </p>
          </div>
        )}

        {/* Bottom controls */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent pt-10 pb-3 px-3 z-10">
          {/* Progress bar */}
          <div
            ref={progressRef}
            className="relative cursor-pointer group mb-2"
            style={{ height: "20px", display: "flex", alignItems: "center" }}
            onMouseDown={handleBarMouseDown}
            onTouchStart={handleBarTouchStart}
          >
            <div className="w-full h-1 bg-white/30 rounded-full overflow-hidden group-hover:h-1.5 transition-all">
              <div
                className="h-full bg-red-500 rounded-full"
                style={{ width: (progress * 100) + "%" }}
              />
            </div>
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-red-500 rounded-full shadow border-2 border-white opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: "calc(" + (progress * 100) + "% - 7px)" }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={togglePlay}
                className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white transition-colors"
              >
                {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>
              <button
                onClick={toggleMute}
                className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white transition-colors"
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>
            <span className="text-white/70 tabular-nums" style={{ fontSize: "0.7rem" }}>
              {fmtTime(currentTime)} / {fmtTime(duration)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}