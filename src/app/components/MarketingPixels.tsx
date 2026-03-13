// ═══════════════════════════════════════════════════════════════════════════
// Marketing Pixels Provider — Meta Pixel, Google Ads, Microsoft Clarity
//
// Similar pattern to GA4Provider: reads config from HomepageInit combined
// data, respects LGPD consent, injects scripts, and exposes tracking
// functions via React context.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useRef, createContext, useContext, useCallback, useState } from "react";
import { useLocation } from "react-router";
import { useHomepageInit } from "../contexts/HomepageInitContext";
import { hasAnalyticsConsent } from "./CookieConsentBanner";
import { isGTMEnabled } from "./GTMProvider";

// ── Window extensions for pixel globals ──
declare global {
  interface Window {
    fbq: any;
    _fbq: any;
    ttq: any;
  }
}

// ── Config types ──
export interface MarketingConfig {
  // Meta Pixel
  metaPixelId: string;
  metaPixelEnabled: boolean;
  // Google Ads
  googleAdsId: string;         // e.g., "AW-123456789"
  googleAdsConversionLabel: string; // e.g., "AbCdEfGhIjKl"
  googleAdsEnabled: boolean;
  // Microsoft Clarity
  clarityProjectId: string;    // e.g., "abc123def"
  clarityEnabled: boolean;
  // TikTok Pixel
  tiktokPixelId: string;       // e.g., "CXXXXXXXXXXXXXXX"
  tiktokPixelEnabled: boolean;
}

export var DEFAULT_MARKETING_CONFIG: MarketingConfig = {
  gtmId: "",
  gtmEnabled: false,
  metaPixelId: "",
  metaPixelEnabled: false,
  googleAdsId: "",
  googleAdsConversionLabel: "",
  googleAdsEnabled: false,
  clarityProjectId: "",
  clarityEnabled: false,
  tiktokPixelId: "",
  tiktokPixelEnabled: false,
};

// ── Context ──
interface MarketingContextValue {
  trackMetaEvent: (eventName: string, params?: Record<string, any>) => void;
  trackGoogleAdsConversion: (params?: { value?: number; currency?: string; transaction_id?: string }) => void;
  trackTikTokEvent: (eventName: string, params?: Record<string, any>) => void;
  config: MarketingConfig | null;
}

var MarketingContext = createContext<MarketingContextValue>({
  trackMetaEvent: function () {},
  trackGoogleAdsConversion: function () {},
  trackTikTokEvent: function () {},
  config: null,
});

export function useMarketing() {
  return useContext(MarketingContext);
}

export function MarketingPixelsProvider({ children }: { children: React.ReactNode }) {
  var configRef = useRef<MarketingConfig | null>(null);
  var metaLoadedRef = useRef(false);
  var gadsLoadedRef = useRef(false);
  var clarityLoadedRef = useRef(false);
  var tiktokLoadedRef = useRef(false);
  var location = useLocation();
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

  // ── Load marketing pixels when config is available + consent granted ──
  useEffect(function () {
    if (!initData || !initData.marketingConfig) return;
    var cfg = initData.marketingConfig as MarketingConfig;
    configRef.current = cfg;

    if (!consentGranted) return;

    // When GTM is enabled, it manages all pixel scripts — skip individual loading.
    // Event tracking functions (fbq, ttq, gtag) will be provided by GTM.
    if (isGTMEnabled(cfg)) return;

    // ── Meta Pixel ──
    if (cfg.metaPixelEnabled && cfg.metaPixelId && !metaLoadedRef.current) {
      metaLoadedRef.current = true;
      var injectMeta = function () {
        // Standard Meta Pixel base code
        (function (f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) {
          if (f.fbq) return;
          n = f.fbq = function () {
            n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
          };
          if (!f._fbq) f._fbq = n;
          n.push = n;
          n.loaded = !0;
          n.version = "2.0";
          n.queue = [];
          t = b.createElement(e);
          t.async = !0;
          t.src = v;
          s = b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t, s);
        })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");

        window.fbq("init", cfg.metaPixelId);
        window.fbq("track", "PageView");
      };

      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(injectMeta, { timeout: 3000 });
      } else {
        setTimeout(injectMeta, 2000);
      }
    }

    // ── Google Ads ──
    if (cfg.googleAdsEnabled && cfg.googleAdsId && !gadsLoadedRef.current) {
      gadsLoadedRef.current = true;
      var injectGads = function () {
        // Google Ads uses the same gtag.js as GA4 — check if already loaded
        if (!window.gtag) {
          var script = document.createElement("script");
          script.async = true;
          script.src = "https://www.googletagmanager.com/gtag/js?id=" + cfg.googleAdsId;
          document.head.appendChild(script);

          window.dataLayer = window.dataLayer || [];
          window.gtag = function gtag() {
            window.dataLayer.push(arguments);
          };
          window.gtag("js", new Date());
        }
        window.gtag("config", cfg.googleAdsId);
      };

      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(injectGads, { timeout: 3000 });
      } else {
        setTimeout(injectGads, 2000);
      }
    }

    // ── Microsoft Clarity ──
    if (cfg.clarityEnabled && cfg.clarityProjectId && !clarityLoadedRef.current) {
      clarityLoadedRef.current = true;
      var injectClarity = function () {
        (function (c: any, l: any, a: any, r: any, i: any, t?: any, y?: any) {
          c[a] = c[a] || function () {
            (c[a].q = c[a].q || []).push(arguments);
          };
          t = l.createElement(r);
          t.async = 1;
          t.src = "https://www.clarity.ms/tag/" + i;
          y = l.getElementsByTagName(r)[0];
          y.parentNode.insertBefore(t, y);
        })(window, document, "clarity", "script", cfg.clarityProjectId);
      };

      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(injectClarity, { timeout: 4000 });
      } else {
        setTimeout(injectClarity, 2500);
      }
    }

    // ── TikTok Pixel ──
    if (cfg.tiktokPixelEnabled && cfg.tiktokPixelId && !tiktokLoadedRef.current) {
      tiktokLoadedRef.current = true;
      var injectTikTok = function () {
        // Standard TikTok Pixel base code
        (function (w: any, d: any, t: any) {
          w.TiktokAnalyticsObject = t;
          var ttq = w[t] = w[t] || [];
          ttq.methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie"];
          ttq.setAndDefer = function (t: any, e: any) {
            t[e] = function () {
              t.push([e].concat(Array.prototype.slice.call(arguments, 0)));
            };
          };
          for (var i = 0; i < ttq.methods.length; i++) {
            ttq.setAndDefer(ttq, ttq.methods[i]);
          }
          ttq.instance = function (t: any) {
            var e = ttq._i[t] || [];
            for (var n = 0; n < ttq.methods.length; n++) {
              ttq.setAndDefer(e, ttq.methods[n]);
            }
            return e;
          };
          ttq.load = function (e: any, n?: any) {
            var i = "https://analytics.tiktok.com/i18n/pixel/events.js";
            ttq._i = ttq._i || {};
            ttq._i[e] = [];
            ttq._i[e]._u = i;
            ttq._t = ttq._t || {};
            ttq._t[e] = +new Date();
            ttq._o = ttq._o || {};
            ttq._o[e] = n || {};
            var o = d.createElement("script");
            o.type = "text/javascript";
            o.async = true;
            o.src = i + "?sdkid=" + e + "&lib=" + t;
            var a = d.getElementsByTagName("script")[0];
            a.parentNode.insertBefore(o, a);
          };
          ttq.load(cfg.tiktokPixelId);
          ttq.page();
        })(window, document, "ttq");
      };

      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(injectTikTok, { timeout: 4000 });
      } else {
        setTimeout(injectTikTok, 2500);
      }
    }
  }, [initData, consentGranted]);

  // ── Track Meta Pixel PageView on route change ──
  useEffect(function () {
    var cfg = configRef.current;
    if (!cfg || !cfg.metaPixelEnabled || !window.fbq) return;
    window.fbq("track", "PageView");
  }, [location.pathname]);

  // ── Track TikTok Pixel PageView on route change ──
  useEffect(function () {
    var cfg = configRef.current;
    if (!cfg || !cfg.tiktokPixelEnabled || !window.ttq) return;
    window.ttq.page();
  }, [location.pathname]);

  // ── Meta Pixel event tracker ──
  var trackMetaEvent = useCallback(function (eventName: string, params?: Record<string, any>) {
    var cfg = configRef.current;
    if (!cfg || !cfg.metaPixelEnabled || !window.fbq) return;
    if (params) {
      window.fbq("track", eventName, params);
    } else {
      window.fbq("track", eventName);
    }
  }, []);

  // ── TikTok Pixel event tracker ──
  var trackTikTokEvent = useCallback(function (eventName: string, params?: Record<string, any>) {
    var cfg = configRef.current;
    if (!cfg || !cfg.tiktokPixelEnabled || !window.ttq) return;
    if (params) {
      window.ttq.track(eventName, params);
    } else {
      window.ttq.track(eventName);
    }
  }, []);

  // ── Google Ads conversion tracker ──
  var trackGoogleAdsConversion = useCallback(function (params?: { value?: number; currency?: string; transaction_id?: string }) {
    var cfg = configRef.current;
    if (!cfg || !cfg.googleAdsEnabled || !cfg.googleAdsId || !cfg.googleAdsConversionLabel || !window.gtag) return;

    var conversionData: Record<string, any> = {
      send_to: cfg.googleAdsId + "/" + cfg.googleAdsConversionLabel,
    };
    if (params) {
      if (params.value !== undefined) conversionData.value = params.value;
      if (params.currency) conversionData.currency = params.currency;
      if (params.transaction_id) conversionData.transaction_id = params.transaction_id;
    }
    window.gtag("event", "conversion", conversionData);
  }, []);

  return (
    <MarketingContext.Provider value={{
      trackMetaEvent: trackMetaEvent,
      trackGoogleAdsConversion: trackGoogleAdsConversion,
      trackTikTokEvent: trackTikTokEvent,
      config: configRef.current,
    }}>
      {children}
    </MarketingContext.Provider>
  );
}