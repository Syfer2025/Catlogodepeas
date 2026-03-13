import { useEffect, useRef } from "react";
import { useHomepageInit } from "../contexts/HomepageInitContext";
import { hasAnalyticsConsent } from "./CookieConsentBanner";

// ═══════════════════════════════════════════════════════════════════
// Google Customer Reviews Badge
// Injects the GCR opt-in module and badge script from Google.
// Only activates when enabled via admin config and consent granted.
// ═══════════════════════════════════════════════════════════════════

export function GoogleReviewsBadge() {
  var loadedRef = useRef(false);
  var { data: initData } = useHomepageInit();

  useEffect(function () {
    if (loadedRef.current) return;
    if (!initData || !initData.googleReviewsConfig) return;

    var cfg = initData.googleReviewsConfig;
    if (!cfg.enabled || !cfg.merchantId) return;

    // Respect LGPD consent
    if (!hasAnalyticsConsent()) return;

    loadedRef.current = true;

    // Inject Google Customer Reviews script
    var inject = function () {
      // Set config before loading script
      (window as any).renderOptIn = function () {
        (window as any).gapi.load("surveyoptin", function () {
          (window as any).gapi.surveyoptin.render({
            merchant_id: cfg.merchantId,
            order_id: "",
            email: "",
            delivery_country: "BR",
            estimated_delivery_date: "",
          });
        });
      };

      // Badge config
      (window as any).__gcse = (window as any).__gcse || {};
      (window as any).__gcse.parsetags = "explicit";

      var script = document.createElement("script");
      script.src = "https://apis.google.com/js/platform.js?onload=renderBadge";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);

      (window as any).renderBadge = function () {
        var ratingBadgeContainer = document.getElementById("google-reviews-badge");
        if (ratingBadgeContainer && (window as any).gapi) {
          (window as any).gapi.load("ratingbadge", function () {
            (window as any).gapi.ratingbadge.render(ratingBadgeContainer, {
              merchant_id: cfg.merchantId,
              position: cfg.badgePosition || "BOTTOM_RIGHT",
            });
          });
        }
      };
    };

    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(inject, { timeout: 5000 });
    } else {
      setTimeout(inject, 3000);
    }
  }, [initData]);

  // Hidden container for Google to render badge into
  return <div id="google-reviews-badge" style={{ display: "none" }} />;
}
