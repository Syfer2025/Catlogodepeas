/**
 * EXIT INTENT POPUP — Popup que aparece quando o usuario tenta sair do site.
 * Detecta mouseleave no topo da pagina (desktop) ou scroll rapido (mobile).
 * Mostra: cupom de desconto, campo de email, CTA. Config via admin panel.
 * Exibe no maximo 1x por sessao (flag em sessionStorage).
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { X, Gift, Mail, ArrowRight, CheckCircle2, Copy, Check, Sparkles } from "lucide-react";
import { useHomepageInit } from "../contexts/HomepageInitContext";
import type { ExitIntentConfig } from "../services/api";
import * as api from "../services/api";

// ═══════════════════════════════════════════════════════════════════
// Exit Intent Popup — captures leads when users are about to leave.
// Detects mouse leaving viewport (desktop) or scroll-up pattern on
// mobile. Shows a coupon/discount offer + email capture form.
// Respects localStorage to show only once per session/period.
// ═══════════════════════════════════════════════════════════════════

var DISMISSED_KEY = "exit_intent_dismissed";
var LEAD_CAPTURED_KEY = "exit_intent_lead_captured";
var DISMISS_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

var DEFAULT_CONFIG: ExitIntentConfig = {
  enabled: false,
  title: "Espere! Tem desconto pra você!",
  subtitle: "Deixe seu email e libere agora um cupom exclusivo de primeira compra!",
  couponCode: "PRIMEIRA10",
  discountText: "10% OFF na primeira compra",
  buttonText: "Liberar meu cupom!",
  successMessage: "Pronto! Aqui está seu cupom:",
  showAfterSeconds: 0,
  showOnMobile: false,
};

function shouldShow(): boolean {
  try {
    // Already captured a lead? Don't bother again
    if (localStorage.getItem(LEAD_CAPTURED_KEY) === "true") return false;

    var dismissed = localStorage.getItem(DISMISSED_KEY);
    if (dismissed) {
      var ts = parseInt(dismissed, 10);
      if (Date.now() - ts < DISMISS_COOLDOWN_MS) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function ExitIntentPopup() {
  var [visible, setVisible] = useState(false);
  var [animateOut, setAnimateOut] = useState(false);
  var [email, setEmail] = useState("");
  var [name, setName] = useState("");
  var [submitting, setSubmitting] = useState(false);
  var [success, setSuccess] = useState(false);
  var [copied, setCopied] = useState(false);
  var [error, setError] = useState("");
  var readyRef = useRef(false);
  var shownRef = useRef(false);
  var { data: initData } = useHomepageInit();

  var config: ExitIntentConfig = (initData && initData.exitIntentConfig)
    ? { ...DEFAULT_CONFIG, ...initData.exitIntentConfig }
    : DEFAULT_CONFIG;

  var logoUrl = (initData && initData.footerLogo && initData.footerLogo.hasLogo && initData.footerLogo.url)
    ? initData.footerLogo.url
    : (initData && initData.logo && initData.logo.hasLogo && initData.logo.url)
      ? initData.logo.url
      : null;

  // Determine if we should activate
  var shouldActivate = config.enabled && shouldShow();

  // Desktop: detect mouse leaving viewport top
  useEffect(function () {
    if (!shouldActivate || shownRef.current) return;

    var isMobile = window.innerWidth < 768;
    if (isMobile && !config.showOnMobile) return;

    // Wait for minimum delay
    var minDelay = (config.showAfterSeconds || 0) * 1000;
    var delayTimer = setTimeout(function () {
      readyRef.current = true;
    }, Math.max(minDelay, 5000)); // At least 5s before showing

    function handleMouseLeave(e: MouseEvent) {
      if (!readyRef.current || shownRef.current) return;
      // Only trigger when mouse goes above the viewport (exit intent)
      if (e.clientY <= 0) {
        shownRef.current = true;
        setVisible(true);
      }
    }

    // Mobile: detect rapid scroll up (approximation of "back" intent)
    var lastScrollY = window.scrollY;
    var rapidScrollCount = 0;

    function handleScroll() {
      if (!readyRef.current || shownRef.current || !isMobile || !config.showOnMobile) return;
      var currentY = window.scrollY;
      if (currentY < lastScrollY && lastScrollY - currentY > 100) {
        rapidScrollCount++;
        if (rapidScrollCount >= 3 && currentY < 200) {
          shownRef.current = true;
          setVisible(true);
        }
      } else {
        rapidScrollCount = 0;
      }
      lastScrollY = currentY;
    }

    document.addEventListener("mouseleave", handleMouseLeave);
    if (isMobile && config.showOnMobile) {
      window.addEventListener("scroll", handleScroll, { passive: true });
    }

    return function () {
      clearTimeout(delayTimer);
      document.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [shouldActivate, config.showAfterSeconds, config.showOnMobile]);

  var dismiss = useCallback(function () {
    setAnimateOut(true);
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {}
    setTimeout(function () {
      setVisible(false);
    }, 350);
  }, []);

  var handleSubmit = useCallback(async function (e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) {
      setError("Digite um email válido");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await api.captureExitIntentLead({
        email: email.trim(),
        name: name.trim(),
        page: window.location.pathname,
      });
      setSuccess(true);
      try {
        localStorage.setItem(LEAD_CAPTURED_KEY, "true");
      } catch {}
    } catch (err: any) {
      setError(err.message || "Erro ao enviar. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }, [email, name]);

  var handleCopyCoupon = useCallback(function () {
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
      navigator.clipboard.writeText(config.couponCode).then(onSuccess).catch(function () {
        fallbackCopy(config.couponCode);
        onSuccess();
      });
    } else {
      fallbackCopy(config.couponCode);
      onSuccess();
    }
  }, [config.couponCode]);

  if (!visible) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[10000]"
        style={{
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(4px)",
          animation: animateOut ? "eiPopFadeOut 0.35s ease-in forwards" : "eiPopFadeIn 0.3s ease-out forwards",
        }}
        onClick={dismiss}
      />

      {/* Modal */}
      <div
        className="fixed z-[10001] left-1/2 top-1/2"
        style={{
          transform: "translate(-50%, -50%)",
          animation: animateOut ? "eiPopSlideOut 0.35s ease-in forwards" : "eiPopSlideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
          width: "min(440px, calc(100vw - 32px))",
        }}
      >
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden relative">
          {/* Close button */}
          <button
            onClick={dismiss}
            className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Header gradient */}
          <div className="bg-gradient-to-br from-red-700 via-red-600 to-red-500 px-6 py-6 text-white text-center relative overflow-hidden">
            {/* Decorative sparkles */}
            <div className="absolute top-2 left-6 opacity-30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="absolute bottom-3 right-8 opacity-20">
              <Sparkles className="w-7 h-7" />
            </div>

            {logoUrl ? (
              <div className="mx-auto mb-3">
                <img
                  src={logoUrl}
                  alt="Carretão Auto Peças"
                  className="h-12 w-auto max-w-[180px] object-contain mx-auto drop-shadow-lg"
                />
              </div>
            ) : (
              <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <Gift className="w-7 h-7 text-white" />
              </div>
            )}
            <h2 style={{ fontSize: "1.2rem", fontWeight: 800, lineHeight: 1.3 }}>
              {config.title}
            </h2>
            <p className="mt-2 text-white/90" style={{ fontSize: "0.85rem", lineHeight: 1.5 }}>
              {config.subtitle}
            </p>
          </div>

          {/* Discount badge */}
          <div className="flex justify-center -mt-4 relative z-[1]">
            <div className="bg-amber-400 text-amber-900 px-5 py-2 rounded-full shadow-lg" style={{ fontSize: "0.88rem", fontWeight: 800 }}>
              {config.discountText}
            </div>
          </div>

          {/* Content */}
          <div className="px-6 pt-5 pb-6">
            {!success ? (
              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={function (e) { setEmail(e.target.value); }}
                      placeholder="Seu melhor email"
                      required
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl text-gray-800 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all"
                      style={{ fontSize: "0.9rem" }}
                    />
                  </div>
                </div>
                <div>
                  <input
                    type="text"
                    value={name}
                    onChange={function (e) { setName(e.target.value); }}
                    placeholder="Seu nome (opcional)"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-800 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all"
                    style={{ fontSize: "0.9rem" }}
                  />
                </div>

                {error && (
                  <p className="text-red-600 text-center" style={{ fontSize: "0.78rem" }}>{error}</p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3.5 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl cursor-pointer"
                  style={{ fontSize: "0.95rem", fontWeight: 700 }}
                >
                  {submitting ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Gift className="w-5 h-5" />
                      {config.buttonText}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <p className="text-center text-gray-400" style={{ fontSize: "0.68rem" }}>
                  Sem spam. Você pode cancelar a qualquer momento.
                </p>
              </form>
            ) : (
              <div className="text-center py-3">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-gray-900 mb-2" style={{ fontSize: "1.1rem", fontWeight: 700 }}>
                  {config.successMessage}
                </h3>

                {/* Show coupon code */}
                <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-4 mt-4">
                  <p className="text-gray-500 mb-1.5" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                    Seu cupom de desconto:
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <code className="text-red-600 bg-red-50 px-4 py-2 rounded-lg tracking-wider" style={{ fontSize: "1.3rem", fontWeight: 800 }}>
                      {config.couponCode}
                    </code>
                    <button
                      onClick={handleCopyCoupon}
                      className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                      title="Copiar cupom"
                    >
                      {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-gray-400 mt-2" style={{ fontSize: "0.72rem" }}>
                    Use este código no checkout para {config.discountText.toLowerCase()}
                  </p>
                </div>

                <button
                  onClick={dismiss}
                  className="mt-5 px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors cursor-pointer"
                  style={{ fontSize: "0.85rem", fontWeight: 600 }}
                >
                  Continuar comprando
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Animations */}
      <style>{
        "@keyframes eiPopFadeIn { from { opacity: 0; } to { opacity: 1; } }" +
        "@keyframes eiPopFadeOut { from { opacity: 1; } to { opacity: 0; } }" +
        "@keyframes eiPopSlideIn { from { opacity: 0; transform: translate(-50%, -48%) scale(0.92); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }" +
        "@keyframes eiPopSlideOut { from { opacity: 1; transform: translate(-50%, -50%) scale(1); } to { opacity: 0; transform: translate(-50%, -52%) scale(0.95); } }"
      }</style>
    </>
  );
}