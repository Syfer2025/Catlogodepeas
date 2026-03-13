import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router";
import { Ticket, Copy, Check, Clock, ChevronLeft, ChevronRight, AlertCircle, Scissors, ArrowRight } from "lucide-react";
import * as api from "../services/api";
import type { PublicCoupon } from "../services/api";

// ─── Countdown for carousel mini cards ───
function useMiniCountdown(expiresAt: string | null) {
  var [text, setText] = useState(function () { return fmtTime(expiresAt); });
  useEffect(function () {
    if (!expiresAt) return;
    var timer = setInterval(function () { setText(fmtTime(expiresAt)); }, 1000);
    return function () { clearInterval(timer); };
  }, [expiresAt]);
  return text;
}

function fmtTime(expiresAt: string | null): string {
  if (!expiresAt) return "";
  var diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Expirado";
  var d = Math.floor(diff / 86400000);
  var h = Math.floor((diff % 86400000) / 3600000);
  var m = Math.floor((diff % 3600000) / 60000);
  var s = Math.floor((diff % 60000) / 1000);
  if (d > 0) return d + "d " + String(h).padStart(2, "0") + "h " + String(m).padStart(2, "0") + "m";
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

// ─── Mini Coupon Ticket ───
function MiniCouponTicket({ coupon }: { coupon: PublicCoupon }) {
  var [copied, setCopied] = useState(false);
  var countdown = useMiniCountdown(coupon.expiresAt);

  var handleCopy = useCallback(function (e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    function fallbackCopy(text: string) {
      var textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "-9999px";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try { document.execCommand("copy"); } catch (_e) { /* ignore */ }
      document.body.removeChild(textarea);
    }

    function onSuccess() {
      setCopied(true);
      setTimeout(function () { setCopied(false); }, 2000);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(coupon.code).then(onSuccess).catch(function () {
        fallbackCopy(coupon.code);
        onSuccess();
      });
    } else {
      fallbackCopy(coupon.code);
      onSuccess();
    }
  }, [coupon.code]);

  var discountLabel = coupon.discountType === "percentage"
    ? coupon.discountValue + "% OFF"
    : "R$ " + coupon.discountValue.toFixed(0) + " OFF";

  var isPerc = coupon.discountType === "percentage";

  return (
    <div
      className="flex-shrink-0 select-none"
      style={{ width: "280px" }}
    >
      <div className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow overflow-hidden border border-gray-100 h-full">
        <div className="flex h-full">
          {/* Left strip */}
          <div className={
            "relative flex flex-col items-center justify-center px-3 py-4 min-w-[72px] " +
            (isPerc ? "bg-gradient-to-b from-red-600 to-red-700" : "bg-gradient-to-b from-amber-500 to-orange-600")
          }>
            <Scissors className="absolute -right-2 top-2.5 w-3 h-3 text-white/30 rotate-90" />
            <div className="text-white text-center">
              {isPerc ? (
                <>
                  <div style={{ fontSize: "1.6rem", fontWeight: 900, lineHeight: 1 }}>{coupon.discountValue}%</div>
                  <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.05em" }}>OFF</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: "0.55rem", fontWeight: 600, opacity: 0.8 }}>R$</div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 900, lineHeight: 1 }}>{coupon.discountValue.toFixed(0)}</div>
                  <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.05em" }}>OFF</div>
                </>
              )}
            </div>
          </div>

          {/* Serrated edge */}
          <div className="relative w-0 flex-shrink-0">
            <div className="absolute -top-2.5 -left-2.5 w-5 h-5 bg-gray-50 rounded-full" style={{ zIndex: 2 }} />
            <div className="absolute -bottom-2.5 -left-2.5 w-5 h-5 bg-gray-50 rounded-full" style={{ zIndex: 2 }} />
            <div className="absolute top-2 bottom-2 left-0 border-l-[1.5px] border-dashed border-gray-200" style={{ zIndex: 1 }} />
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col justify-between p-3 pl-4 min-w-0">
            <div>
              <p className="text-gray-900 truncate" style={{ fontSize: "0.8rem", fontWeight: 700 }}>
                {discountLabel}
              </p>
              {coupon.description && (
                <p className="text-gray-400 truncate mt-0.5" style={{ fontSize: "0.7rem" }}>
                  {coupon.description}
                </p>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                onClick={handleCopy}
                className={
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-dashed transition-all cursor-pointer " +
                  (copied
                    ? "border-green-400 bg-green-50 text-green-700"
                    : "border-gray-300 bg-gray-50 hover:border-red-400 hover:bg-red-50 text-gray-700 hover:text-red-600")
                }
              >
                <code style={{ fontSize: "0.72rem", fontWeight: 800, letterSpacing: "0.05em" }}>{coupon.code}</code>
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3 opacity-50" />}
              </button>
              {countdown && (
                <div className="flex items-center gap-1 text-gray-400 shrink-0" style={{ fontSize: "0.62rem", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  <Clock className="w-2.5 h-2.5" />
                  {countdown}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Carousel ───
export function CouponCarousel() {
  var [coupons, setCoupons] = useState<PublicCoupon[]>([]);
  var [loading, setLoading] = useState(true);
  var scrollRef = useRef<HTMLDivElement>(null);
  var [canScrollLeft, setCanScrollLeft] = useState(false);
  var [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(function () {
    api.getPublicCoupons()
      .then(function (res) {
        setCoupons(res.coupons || []);
      })
      .catch(function (err) {
        console.error("[CouponCarousel] Error:", err);
      })
      .finally(function () {
        setLoading(false);
      });
  }, []);

  var updateScrollBtns = useCallback(function () {
    var el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  }, []);

  useEffect(function () {
    var el = scrollRef.current;
    if (!el) return;
    updateScrollBtns();
    el.addEventListener("scroll", updateScrollBtns, { passive: true });
    window.addEventListener("resize", updateScrollBtns);
    return function () {
      el.removeEventListener("scroll", updateScrollBtns);
      window.removeEventListener("resize", updateScrollBtns);
    };
  }, [coupons, updateScrollBtns]);

  var scroll = useCallback(function (dir: number) {
    var el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 300, behavior: "smooth" });
  }, []);

  if (loading || coupons.length === 0) return null;

  return (
    <section className="py-8 md:py-10">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
              <Ticket className="w-4 h-4 text-red-600" />
            </div>
            <div>
              <h2 className="text-gray-900" style={{ fontSize: "1.1rem", fontWeight: 800 }}>
                Cupons de Desconto
              </h2>
              <p className="text-gray-400" style={{ fontSize: "0.72rem" }}>
                Aproveite antes que acabem!
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Nav arrows */}
            <div className="hidden sm:flex items-center gap-1.5 mr-2">
              <button
                onClick={function () { scroll(-1); }}
                disabled={!canScrollLeft}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-default flex items-center justify-center transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4 text-gray-600" />
              </button>
              <button
                onClick={function () { scroll(1); }}
                disabled={!canScrollRight}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-default flex items-center justify-center transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4 text-gray-600" />
              </button>
            </div>
            <Link
              to="/cupons"
              className="text-red-600 hover:text-red-700 flex items-center gap-1 transition-colors"
              style={{ fontSize: "0.82rem", fontWeight: 600 }}
            >
              Ver todos
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Scrollable coupon cards */}
        <div className="relative">
          <div
            ref={scrollRef}
            className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide"
            style={{ scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch", scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {coupons.map(function (coupon) {
              return (
                <div key={coupon.code} style={{ scrollSnapAlign: "start" }}>
                  <MiniCouponTicket coupon={coupon} />
                </div>
              );
            })}
            {/* "Ver mais" card */}
            <div className="flex-shrink-0" style={{ width: "140px", scrollSnapAlign: "start" }}>
              <Link
                to="/cupons"
                className="h-full min-h-[110px] flex flex-col items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 border-2 border-dashed border-gray-200 hover:border-red-300 rounded-xl transition-all"
              >
                <Ticket className="w-6 h-6 text-gray-400" />
                <span className="text-gray-500" style={{ fontSize: "0.78rem", fontWeight: 600 }}>Ver todos</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}