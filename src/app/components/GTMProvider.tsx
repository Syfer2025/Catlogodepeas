// ═══════════════════════════════════════════════════════════════════════════
// Google Tag Manager (GTM) Provider
//
// Loads the GTM container script. When GTM is enabled, it acts as a
// single container that manages ALL marketing pixels (GA4, Meta Pixel,
// Google Ads, TikTok Pixel, MS Clarity) — configured via tagmanager.google.com.
//
// Respects LGPD consent: only injects the GTM script after user accepts cookies.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState, createContext, useContext } from "react";
import { useHomepageInit } from "../contexts/HomepageInitContext";
import { hasAnalyticsConsent } from "./CookieConsentBanner";

interface GTMContextValue {
  /** Whether GTM is enabled and loaded */
  gtmActive: boolean;
  /** Push a custom event to dataLayer */
  pushEvent: (event: string, params?: Record<string, any>) => void;
}

var GTMContext = createContext<GTMContextValue>({
  gtmActive: false,
  pushEvent: function () {},
});

export function useGTM() {
  return useContext(GTMContext);
}

/** Check if GTM is enabled in the marketing config from HomepageInit data */
export function isGTMEnabled(marketingConfig: any): boolean {
  return !!(marketingConfig && marketingConfig.gtmEnabled && marketingConfig.gtmId);
}

export function GTMProvider({ children }: { children: React.ReactNode }) {
  var loadedRef = useRef(false);
  var gtmActiveRef = useRef(false);
  var { data: initData } = useHomepageInit();
  var [consentGranted, setConsentGranted] = useState(hasAnalyticsConsent());

  // Listen for LGPD consent changes
  useEffect(function () {
    function onConsentChange(e: Event) {
      var detail = (e as CustomEvent).detail;
      setConsentGranted(detail === "accepted");
    }
    window.addEventListener("lgpd-consent-change", onConsentChange);
    return function () {
      window.removeEventListener("lgpd-consent-change", onConsentChange);
    };
  }, []);

  // Load GTM container script
  useEffect(function () {
    if (!initData || !initData.marketingConfig) return;
    var cfg = initData.marketingConfig as any;

    if (!cfg.gtmEnabled || !cfg.gtmId) return;

    // Validate GTM ID format: GTM-XXXXXXX
    if (!cfg.gtmId.match(/^GTM-[A-Z0-9]+$/)) return;

    // LGPD: Do NOT inject GTM without analytics consent
    if (!consentGranted) return;

    // Don't re-inject
    if (loadedRef.current) return;
    loadedRef.current = true;
    gtmActiveRef.current = true;

    // Initialize dataLayer before GTM script loads
    window.dataLayer = window.dataLayer || [];

    // Set up default consent state for GTM Consent Mode v2
    window.dataLayer.push({
      "event": "gtm_consent_granted",
      "analytics_storage": "granted",
      "ad_storage": "granted",
      "ad_user_data": "granted",
      "ad_personalization": "granted",
    });

    // Defer GTM injection for non-blocking load
    var injectGTM = function () {
      // Standard GTM snippet
      (function (w: any, d: any, s: any, l: any, i: any) {
        w[l] = w[l] || [];
        w[l].push({ "gtm.start": new Date().getTime(), event: "gtm.js" });
        var f = d.getElementsByTagName(s)[0];
        var j = d.createElement(s) as HTMLScriptElement;
        var dl = l !== "dataLayer" ? "&l=" + l : "";
        j.async = true;
        j.src = "https://www.googletagmanager.com/gtm.js?id=" + i + dl;
        f.parentNode.insertBefore(j, f);
      })(window, document, "script", "dataLayer", cfg.gtmId);

      // Also inject the noscript iframe (for crawlers)
      var noscript = document.createElement("noscript");
      var iframe = document.createElement("iframe");
      iframe.src = "https://www.googletagmanager.com/ns.html?id=" + cfg.gtmId;
      iframe.height = "0";
      iframe.width = "0";
      iframe.style.display = "none";
      iframe.style.visibility = "hidden";
      noscript.appendChild(iframe);
      document.body.insertBefore(noscript, document.body.firstChild);
    };

    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(injectGTM, { timeout: 2500 });
    } else {
      setTimeout(injectGTM, 1500);
    }
  }, [initData, consentGranted]);

  // Push custom event to dataLayer
  var pushEvent = function (event: string, params?: Record<string, any>) {
    if (!gtmActiveRef.current) return;
    window.dataLayer = window.dataLayer || [];
    var payload: Record<string, any> = { event: event };
    if (params) {
      for (var key in params) {
        payload[key] = params[key];
      }
    }
    window.dataLayer.push(payload);
  };

  return (
    <GTMContext.Provider value={{
      gtmActive: gtmActiveRef.current,
      pushEvent: pushEvent,
    }}>
      {children}
    </GTMContext.Provider>
  );
}
