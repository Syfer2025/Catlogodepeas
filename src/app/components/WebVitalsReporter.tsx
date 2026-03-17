import { useEffect, useRef } from "react";
import { onCLS, onINP, onLCP, onFCP, onTTFB } from "web-vitals";
import type { Metric } from "web-vitals";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import { hasAnalyticsConsent } from "./CookieConsentBanner";

/**
 * WEB VITALS REPORTER — Coleta metricas Core Web Vitals (LCP, FID, CLS, FCP, TTFB).
 * Usa a API PerformanceObserver nativa. Envia para GA4 como custom events.
 * Lazy-loaded: so monta apos idle do browser para nao impactar performance.
 */

var BASE_URL = "https://" + projectId + ".supabase.co/functions/v1/make-server-b7b07654";

// Buffer to batch-send metrics (reduces network calls)
var _vitalsBuffer: Array<{
  name: string;
  value: number;
  delta: number;
  id: string;
  rating: string;
  navigationType: string;
  url: string;
  timestamp: number;
}> = [];
var _flushTimer: ReturnType<typeof setTimeout> | null = null;

function flushVitals() {
  if (_vitalsBuffer.length === 0) return;
  var payload = _vitalsBuffer.splice(0);
  // Fire-and-forget via sendBeacon (survives page unload)
  var body = JSON.stringify({ metrics: payload });
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    var sent = navigator.sendBeacon(
      BASE_URL + "/web-vitals",
      new Blob([body], { type: "application/json" })
    );
    if (!sent) {
      // Fallback to fetch if sendBeacon fails
      fetch(BASE_URL + "/web-vitals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + publicAnonKey,
        },
        body: body,
        keepalive: true,
      }).catch(function () { /* silent */ });
    }
  } else {
    fetch(BASE_URL + "/web-vitals", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + publicAnonKey,
      },
      body: body,
      keepalive: true,
    }).catch(function () { /* silent */ });
  }
}

function reportMetric(metric: Metric) {
  // Push to buffer
  _vitalsBuffer.push({
    name: metric.name,
    value: Math.round(metric.value * 1000) / 1000,
    delta: Math.round(metric.delta * 1000) / 1000,
    id: metric.id,
    rating: metric.rating,
    navigationType: metric.navigationType || "unknown",
    url: window.location.pathname,
    timestamp: Date.now(),
  });

  // Send to GA4 if available
  if (typeof window !== "undefined" && window.gtag && hasAnalyticsConsent()) {
    window.gtag("event", metric.name, {
      event_category: "Web Vitals",
      event_label: metric.id,
      value: Math.round(metric.name === "CLS" ? metric.delta * 1000 : metric.delta),
      non_interaction: true,
      metric_id: metric.id,
      metric_value: metric.value,
      metric_delta: metric.delta,
      metric_rating: metric.rating,
    });
  }

  // Debounce flush — wait 3s for more metrics to arrive before sending
  if (_flushTimer) clearTimeout(_flushTimer);
  _flushTimer = setTimeout(flushVitals, 3000);
}

export function WebVitalsReporter() {
  var initialized = useRef(false);

  useEffect(function () {
    if (initialized.current) return;
    initialized.current = true;

    // Delay metric collection by 1s to not interfere with critical rendering
    var timer = setTimeout(function () {
      try {
        onCLS(reportMetric);
        onINP(reportMetric);
        onLCP(reportMetric);
        onFCP(reportMetric);
        onTTFB(reportMetric);
      } catch (e) {
        // web-vitals may not work in all browsers — fail silently
        console.debug("[WebVitals] Init error:", e);
      }
    }, 1000);

    // Flush any remaining metrics on page unload
    function onUnload() {
      flushVitals();
    }
    window.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") flushVitals();
    });
    window.addEventListener("pagehide", onUnload);

    return function () {
      clearTimeout(timer);
      window.removeEventListener("pagehide", onUnload);
    };
  }, []);

  return null;
}