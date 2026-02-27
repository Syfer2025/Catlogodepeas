import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import { Cookie, Shield, X } from "lucide-react";

// ═══════════════════════════════════════════════════════════════════
// LGPD Cookie Consent Banner
// Stores consent in localStorage. GA4Provider reads this before
// injecting analytics scripts.
// ═══════════════════════════════════════════════════════════════════

var CONSENT_KEY = "lgpd_cookie_consent";
var CONSENT_DATE_KEY = "lgpd_consent_date";

export type ConsentValue = "accepted" | "rejected" | null;

export function getConsentValue(): ConsentValue {
  try {
    var val = localStorage.getItem(CONSENT_KEY);
    if (val === "accepted" || val === "rejected") return val;
    return null;
  } catch {
    return null;
  }
}

export function setConsentValue(value: "accepted" | "rejected") {
  try {
    localStorage.setItem(CONSENT_KEY, value);
    localStorage.setItem(CONSENT_DATE_KEY, new Date().toISOString());
  } catch {}
}

/** Returns true if user has accepted analytics cookies */
export function hasAnalyticsConsent(): boolean {
  return getConsentValue() === "accepted";
}

/** Fires a custom event so GA4Provider can react to consent changes */
function dispatchConsentChange(value: "accepted" | "rejected") {
  window.dispatchEvent(new CustomEvent("lgpd-consent-change", { detail: value }));
}

export function CookieConsentBanner() {
  var [visible, setVisible] = useState(false);
  var [animateOut, setAnimateOut] = useState(false);

  useEffect(function () {
    // Only show if no consent decision has been made yet
    var consent = getConsentValue();
    if (consent === null) {
      // Delay slightly so page loads first
      var timer = setTimeout(function () {
        setVisible(true);
      }, 1500);
      return function () { clearTimeout(timer); };
    }
  }, []);

  var dismiss = useCallback(function (value: "accepted" | "rejected") {
    setConsentValue(value);
    dispatchConsentChange(value);
    setAnimateOut(true);
    setTimeout(function () {
      setVisible(false);
    }, 350);
  }, []);

  var handleAcceptAll = useCallback(function () {
    dismiss("accepted");
  }, [dismiss]);

  var handleRejectOptional = useCallback(function () {
    dismiss("rejected");
  }, [dismiss]);

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[9999]"
      style={{
        animation: animateOut ? "lgpdSlideDown 0.35s ease-in forwards" : "lgpdSlideUp 0.45s ease-out forwards",
      }}
    >
      {/* Backdrop gradient */}
      <div className="bg-gradient-to-t from-black/20 to-transparent h-8 pointer-events-none" />

      <div className="bg-white border-t border-gray-200 shadow-2xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-5">
          <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4 lg:gap-6">
            {/* Icon + Text */}
            <div className="flex items-start gap-3 flex-1">
              <div className="bg-red-50 rounded-xl p-2.5 shrink-0 mt-0.5">
                <Cookie className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-gray-900 mb-1" style={{ fontSize: "0.95rem", fontWeight: 700 }}>
                  Sua privacidade é importante para nós
                </h3>
                <p className="text-gray-500 leading-relaxed" style={{ fontSize: "0.82rem" }}>
                  Utilizamos cookies essenciais para o funcionamento do site e cookies analíticos
                  (Google Analytics) para entender como você navega e melhorar sua experiência.
                  Você pode aceitar todos os cookies ou optar apenas pelos essenciais.
                  Consulte nossa{" "}
                  <Link
                    to="/politica-de-privacidade"
                    className="text-red-600 hover:text-red-700 underline underline-offset-2"
                  >
                    Política de Privacidade
                  </Link>{" "}
                  para mais detalhes.
                </p>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-3 shrink-0 w-full lg:w-auto">
              <button
                onClick={handleRejectOptional}
                className="flex-1 lg:flex-initial px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all cursor-pointer"
                style={{ fontSize: "0.82rem", fontWeight: 600 }}
              >
                Apenas Essenciais
              </button>
              <button
                onClick={handleAcceptAll}
                className="flex-1 lg:flex-initial px-5 py-2.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-all shadow-sm hover:shadow-md cursor-pointer"
                style={{ fontSize: "0.82rem", fontWeight: 600 }}
              >
                Aceitar Todos
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Animations (injected once) */}
      <style>{
        "@keyframes lgpdSlideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }" +
        "@keyframes lgpdSlideDown { from { transform: translateY(0); opacity: 1; } to { transform: translateY(100%); opacity: 0; } }"
      }</style>
    </div>
  );
}