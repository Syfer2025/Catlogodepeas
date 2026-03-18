/**
 * COUPON MEGA MENU — Mega menu de cupons no Header (dropdown hover/click).
 * Exibe cupons ativos com codigo, desconto e countdown de validade.
 * Botao "Copiar codigo" com feedback visual (toast). Link para /cupons.
 * Lazy-loaded: so carrega quando usuario interage com o icone de cupom.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router";
import { Ticket, Copy, Check, Clock, Scissors, ArrowRight, Loader2, ChevronDown } from "lucide-react";
import * as api from "../services/api";
import type { PublicCoupon } from "../services/api";
import { toast } from "sonner";

/* ─── Countdown helper ─── */
function fmtTime(expiresAt: string | null): string {
  if (!expiresAt) return "";
  var diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Expirado";
  var d = Math.floor(diff / 86400000);
  var h = Math.floor((diff % 86400000) / 3600000);
  var m = Math.floor((diff % 3600000) / 60000);
  var s = Math.floor((diff % 60000) / 1000);
  if (d > 0) return d + "d " + String(h).padStart(2, "0") + "h";
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

function useCountdown(expiresAt: string | null) {
  var [text, setText] = useState(function () { return fmtTime(expiresAt); });
  useEffect(function () {
    if (!expiresAt) return;
    var timer = setInterval(function () { setText(fmtTime(expiresAt)); }, 1000);
    return function () { clearInterval(timer); };
  }, [expiresAt]);
  return text;
}

/* ─── Shared hook: smooth open/close visibility (same as CategoryMegaMenu) ─── */
function useDelayedVisibility(isOpen: boolean, closeDelay = 320) {
  var [mounted, setMounted] = useState(false);
  var [visible, setVisible] = useState(false);

  useEffect(function () {
    if (isOpen) {
      setMounted(true);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { setVisible(true); });
      });
    } else {
      setVisible(false);
      var t = setTimeout(function () { setMounted(false); }, closeDelay);
      return function () { clearTimeout(t); };
    }
  }, [isOpen, closeDelay]);

  return { mounted, visible };
}

/* ─── Coupon card inside dropdown ─── */
function CouponDropdownCard({ coupon }: { coupon: PublicCoupon }) {
  var [copied, setCopied] = useState(false);
  var countdown = useCountdown(coupon.expiresAt);

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
      toast.success("Cupom \"" + coupon.code + "\" copiado!", {
        description: "Cole no campo de cupom durante o checkout.",
        duration: 3000,
      });
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

  var isPerc = coupon.discountType === "percentage";

  return (
    <div className="flex bg-white rounded-lg border border-gray-100 hover:border-red-200 hover:shadow-sm transition-all overflow-hidden">
      {/* Left accent strip */}
      <div className={
        "relative flex flex-col items-center justify-center px-3 py-3 min-w-[60px] " +
        (isPerc ? "bg-gradient-to-b from-red-600 to-red-700" : "bg-gradient-to-b from-amber-500 to-orange-600")
      }>
        <Scissors className="absolute -right-1.5 top-2 w-2.5 h-2.5 text-white/30 rotate-90" />
        <div className="text-white text-center">
          {isPerc ? (
            <>
              <div style={{ fontSize: "1.25rem", fontWeight: 900, lineHeight: 1 }}>{coupon.discountValue}%</div>
              <div style={{ fontSize: "0.5rem", fontWeight: 700, letterSpacing: "0.05em" }}>OFF</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: "0.5rem", fontWeight: 600, opacity: 0.8 }}>R$</div>
              <div style={{ fontSize: "1.15rem", fontWeight: 900, lineHeight: 1 }}>{coupon.discountValue.toFixed(0)}</div>
              <div style={{ fontSize: "0.5rem", fontWeight: 700, letterSpacing: "0.05em" }}>OFF</div>
            </>
          )}
        </div>
      </div>

      {/* Serrated edge */}
      <div className="relative w-0 flex-shrink-0">
        <div className="absolute -top-2 -left-2 w-4 h-4 bg-white rounded-full" style={{ zIndex: 2 }} />
        <div className="absolute -bottom-2 -left-2 w-4 h-4 bg-white rounded-full" style={{ zIndex: 2 }} />
        <div className="absolute top-2 bottom-2 left-0 border-l border-dashed border-gray-200" style={{ zIndex: 1 }} />
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col justify-between p-2.5 pl-3.5 min-w-0">
        <div>
          {coupon.description && (
            <p className="text-gray-500 truncate" style={{ fontSize: "0.68rem" }}>
              {coupon.description}
            </p>
          )}
          {coupon.minOrderValue > 0 && (
            <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.62rem" }}>
              Pedido min. R$ {coupon.minOrderValue.toFixed(0)}
            </p>
          )}
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <button
            onClick={handleCopy}
            className={
              "flex items-center gap-1 px-2 py-1 rounded border border-dashed transition-all cursor-pointer " +
              (copied
                ? "border-green-400 bg-green-50 text-green-700"
                : "border-gray-300 bg-gray-50 hover:border-red-400 hover:bg-red-50 text-gray-700 hover:text-red-600")
            }
          >
            <code style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.04em" }}>{coupon.code}</code>
            {copied ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5 opacity-50" />}
          </button>
          {countdown && (
            <div className="flex items-center gap-1 text-gray-400 shrink-0" style={{ fontSize: "0.58rem", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
              <Clock className="w-2.5 h-2.5" />
              {countdown}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Desktop Coupon Mega-Menu (header nav)
   — Same open/close effects as CategoryMegaMenu:
   ● useDelayedVisibility for smooth mount/unmount
   ● Backdrop overlay
   ● Animated red accent bar with shimmer
   ● cubic-bezier transitions (scale + translateY)
   ● Icon rotation on button
   ● Rich box-shadow
   ═══════════════════════════════════════════════════ */
export function CouponMegaMenu() {
  var [coupons, setCoupons] = useState<PublicCoupon[]>([]);
  var [loading, setLoading] = useState(true);
  var [isOpen, setIsOpen] = useState(false);
  var containerRef = useRef<HTMLDivElement>(null);
  var closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  var [fetched, setFetched] = useState(false);

  var { mounted, visible } = useDelayedVisibility(isOpen, 320);

  // Lazy-fetch: only load coupons on first hover
  var fetchCoupons = useCallback(function () {
    if (fetched) return;
    setFetched(true);
    api.getPublicCoupons()
      .then(function (res) { setCoupons(res.coupons || []); })
      .catch(function (err) { console.error("[CouponMegaMenu] Error:", err); })
      .finally(function () { setLoading(false); });
  }, [fetched]);

  var handleMouseEnter = function () {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setIsOpen(true);
    fetchCoupons();
  };

  var handleMouseLeave = function () {
    closeTimerRef.current = setTimeout(function () {
      setIsOpen(false);
    }, 250);
  };

  // Close on outside click
  useEffect(function () {
    var handler = function (e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return function () {
      document.removeEventListener("mousedown", handler);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseLeave={handleMouseLeave}
    >
      {/* Trigger button — polished transitions */}
      <button
        onClick={function () { setIsOpen(!isOpen); fetchCoupons(); }}
        onMouseEnter={handleMouseEnter}
        className={
          "flex items-center gap-1.5 px-4 py-2.5 relative cursor-pointer " +
          (isOpen
            ? "text-white rounded-t-lg z-[201]"
            : "text-white hover:bg-white/15 rounded-lg")
        }
        style={{
          fontSize: "0.9rem",
          fontWeight: isOpen ? 600 : 500,
          transition: "background-color 220ms ease, color 220ms ease, box-shadow 220ms ease, border-radius 220ms ease, font-weight 220ms ease",
          boxShadow: isOpen ? "0 -2px 12px rgba(222,3,22,0.2)" : "none",
          backgroundColor: isOpen ? "#b50212" : undefined,
        }}
      >
        <Ticket
          className="w-4 h-4"
          style={{
            transition: "transform 300ms cubic-bezier(0.4, 0, 0.2, 1)",
            transform: isOpen ? "rotate(-15deg) scale(1.08)" : "rotate(0) scale(1)",
          }}
        />
        Cupons
        <ChevronDown
          className="w-3.5 h-3.5"
          style={{
            transition: "transform 350ms cubic-bezier(0.4, 0, 0.2, 1)",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {/* Dropdown — mounted while animating, same pattern as CategoryMegaMenu */}
      {mounted && (
        <>
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 z-[199]"
            style={{
              backgroundColor: visible ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0)",
              transition: "background-color 300ms ease",
              pointerEvents: visible ? "auto" : "none",
            }}
            onMouseEnter={handleMouseLeave}
          />
          <div
            className="absolute top-full left-0 z-[200]"
            style={{ marginTop: "-1px", minWidth: "380px" }}
            onMouseEnter={function () {
              if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
            }}
          >
            <div
              style={{
                transition: visible
                  ? "opacity 280ms cubic-bezier(0.16,1,0.3,1), transform 280ms cubic-bezier(0.16,1,0.3,1)"
                  : "opacity 180ms ease, transform 180ms ease",
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(-8px)",
                transformOrigin: "top left",
                pointerEvents: visible ? "auto" : "none",
              }}
            >
              {/* Animated red accent bar with shimmer */}
              <div
                style={{
                  height: "3px",
                  background: "linear-gradient(90deg, rgb(220 38 38), rgb(248 113 113), rgb(220 38 38))",
                  backgroundSize: "200% 100%",
                  transform: visible ? "scaleX(1)" : "scaleX(0)",
                  transformOrigin: "left",
                  transition: visible
                    ? "transform 350ms cubic-bezier(0.16,1,0.3,1) 60ms"
                    : "transform 120ms ease",
                  animationName: visible ? "couponMenuShimmer" : "none",
                  animationDuration: "3s",
                  animationTimingFunction: "ease-in-out",
                  animationIterationCount: "infinite",
                }}
              />

              <div
                className="bg-white overflow-hidden w-full"
                style={{
                  borderRadius: "0 0 0.75rem 0.75rem",
                  boxShadow: visible
                    ? "0 20px 60px -12px rgba(0,0,0,0.18), 0 8px 20px -8px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)"
                    : "0 4px 12px rgba(0,0,0,0.05)",
                  transition: "box-shadow 400ms ease",
                }}
              >
                {/* Header */}
                <div className="bg-gradient-to-r from-red-600 to-red-700 px-5 py-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="bg-white/20 rounded-full p-1.5">
                        <Ticket className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <h3 className="text-white" style={{ fontSize: "0.95rem", fontWeight: 700 }}>
                          Cupons de Desconto
                        </h3>
                        <p className="text-red-200" style={{ fontSize: "0.68rem" }}>
                          Aproveite antes que acabem!
                        </p>
                      </div>
                    </div>
                    <Link
                      to="/cupons"
                      onClick={function () { setIsOpen(false); }}
                      className="flex items-center gap-1 text-white/80 hover:text-white transition-colors"
                      style={{ fontSize: "0.72rem", fontWeight: 600 }}
                    >
                      Ver todos
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>

                {/* Content */}
                <div className="p-4 max-h-[400px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                  {loading ? (
                    <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span style={{ fontSize: "0.85rem" }}>Carregando cupons...</span>
                    </div>
                  ) : coupons.length === 0 ? (
                    <div className="text-center py-8">
                      <Ticket className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                      <p className="text-gray-500" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                        Nenhum cupom disponível
                      </p>
                      <p className="text-gray-400 mt-1" style={{ fontSize: "0.75rem" }}>
                        Volte em breve para novas ofertas!
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {coupons.map(function (coupon, idx) {
                        return (
                          <div
                            key={coupon.code}
                            style={{
                              animationName: visible ? "couponCardFadeIn" : "none",
                              animationDuration: "200ms",
                              animationTimingFunction: "ease",
                              animationDelay: (idx * 40) + "ms",
                              animationFillMode: "both",
                            }}
                          >
                            <CouponDropdownCard coupon={coupon} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Footer */}
                {coupons.length > 0 && (
                  <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/50">
                    <Link
                      to="/cupons"
                      onClick={function () { setIsOpen(false); }}
                      className="flex items-center justify-center gap-2 w-full text-red-600 hover:text-red-700 transition-colors"
                      style={{ fontSize: "0.82rem", fontWeight: 600 }}
                    >
                      Ver todos os cupons
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Keyframes */}
          <style>{`
            @keyframes couponMenuShimmer {
              0%   { background-position: -200% 0; }
              100% { background-position: 200% 0; }
            }
            @keyframes couponCardFadeIn {
              from { opacity: 0; transform: translateY(4px); }
              to   { opacity: 1; transform: translateY(0); }
            }
          `}</style>
        </>
      )}
    </div>
  );
}