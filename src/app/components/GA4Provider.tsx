import { useEffect, useRef, createContext, useContext, useCallback, useState } from "react";
import { useLocation } from "react-router";
import type { GA4Config } from "../services/api";
import { useHomepageInit } from "../contexts/HomepageInitContext";
import { hasAnalyticsConsent } from "./CookieConsentBanner";

// Extend window for gtag
declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
  }
}

interface GA4ContextValue {
  trackEvent: (eventName: string, params?: Record<string, any>) => void;
  config: GA4Config | null;
}

const GA4Context = createContext<GA4ContextValue>({
  trackEvent: function () {},
  config: null,
});

export function useGA4() {
  return useContext(GA4Context);
}

export function GA4Provider({ children }: { children: React.ReactNode }) {
  var configRef = useRef<GA4Config | null>(null);
  var loadedRef = useRef(false);
  var location = useLocation();
  var { data: initData } = useHomepageInit();
  var [consentGranted, setConsentGranted] = useState(hasAnalyticsConsent);

  // Listen for LGPD consent changes (user clicking "Aceitar Todos")
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

  // Use GA4 config from combined init data (no separate API call)
  // Only inject GA4 scripts if user has consented to analytics cookies (LGPD)
  useEffect(function () {
    if (!initData || !initData.ga4Config) return;
    var cfg = initData.ga4Config;
    configRef.current = cfg;

    if (!cfg.enabled || !cfg.measurementId || !cfg.measurementId.match(/^G-[A-Z0-9]+$/)) {
      return;
    }

    // LGPD: Do NOT inject GA4 without analytics consent
    if (!consentGranted) {
      return;
    }

    // Don't re-inject
    if (loadedRef.current) return;
    loadedRef.current = true;

    // Defer GA4 script injection using requestIdleCallback (non-blocking)
    var inject = function () {
      var script = document.createElement("script");
      script.async = true;
      script.src = "https://www.googletagmanager.com/gtag/js?id=" + cfg.measurementId;
      document.head.appendChild(script);

      window.dataLayer = window.dataLayer || [];
      window.gtag = function gtag() {
        window.dataLayer.push(arguments);
      };
      window.gtag("js", new Date());
      window.gtag("config", cfg.measurementId, {
        send_page_view: false,
      });

      console.log("[GA4] Initialized with " + cfg.measurementId);
    };

    // Use requestIdleCallback if available, else setTimeout 2s
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(inject, { timeout: 3000 });
    } else {
      setTimeout(inject, 2000);
    }
  }, [initData, consentGranted]);

  // Track page views on route change
  useEffect(function () {
    var cfg = configRef.current;
    if (!cfg || !cfg.enabled || !cfg.trackPageViews || !window.gtag) return;

    window.gtag("event", "page_view", {
      page_path: location.pathname + location.search,
      page_title: document.title,
    });
  }, [location.pathname, location.search]);

  var trackEvent = useCallback(function (eventName: string, params?: Record<string, any>) {
    var cfg = configRef.current;
    if (!cfg || !cfg.enabled || !window.gtag) return;

    var eventMap: Record<string, keyof GA4Config> = {
      view_item: "trackViewItem",
      add_to_cart: "trackAddToCart",
      begin_checkout: "trackCheckout",
      purchase: "trackPurchase",
      search: "trackSearch",
    };

    var configKey = eventMap[eventName];
    if (configKey && !cfg[configKey]) return;

    window.gtag("event", eventName, params);
    console.log("[GA4] Event: " + eventName, params);
  }, []);

  return (
    <GA4Context.Provider value={{ trackEvent: trackEvent, config: configRef.current }}>
      {children}
    </GA4Context.Provider>
  );
}