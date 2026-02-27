import { useState, useEffect } from "react";
import { ArrowUp } from "lucide-react";

/**
 * ScrollToTopButton — Floating button that appears after scrolling 400px.
 * Smooth scroll to top with CSS-only entrance/exit animation.
 * Positioned above the WhatsApp FAB.
 */

var SCROLL_THRESHOLD = 400;

export function ScrollToTopButton() {
  var [visible, setVisible] = useState(false);
  var [isMobile, setIsMobile] = useState(false);

  useEffect(function () {
    var ticking = false;

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        setVisible(window.scrollY > SCROLL_THRESHOLD);
        ticking = false;
      });
    }

    function checkMobile() {
      setIsMobile(window.innerWidth < 768);
    }
    checkMobile();
    window.addEventListener("resize", checkMobile);
    window.addEventListener("scroll", onScroll, { passive: true });
    // Check initial position
    onScroll();

    return function () {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", checkMobile);
    };
  }, []);

  // On mobile, position above the bottom nav (60px + safe area); on desktop, above WhatsApp FAB
  var bottomPos = isMobile ? "80px" : "88px";

  return (
    <>
      <button
        onClick={function () {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        aria-label="Voltar ao topo"
        className="scroll-top-btn fixed z-50"
        style={{
          bottom: bottomPos,
          right: "24px",
          width: "44px",
          height: "44px",
          borderRadius: "50%",
          background: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)",
          color: "#fff",
          border: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          boxShadow: "0 4px 14px rgba(220, 38, 38, 0.35)",
          transition: "opacity 0.35s cubic-bezier(.22,.61,.36,1), transform 0.35s cubic-bezier(.22,.61,.36,1), box-shadow 0.35s cubic-bezier(.22,.61,.36,1)",
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0) scale(1)" : "translateY(16px) scale(0.8)",
          pointerEvents: visible ? "auto" : "none",
        }}
        onMouseEnter={function (e) {
          e.currentTarget.style.boxShadow = "0 6px 20px rgba(220, 38, 38, 0.5), 0 0 0 4px rgba(220, 38, 38, 0.12)";
          e.currentTarget.style.transform = "translateY(-2px) scale(1.08)";
        }}
        onMouseLeave={function (e) {
          e.currentTarget.style.boxShadow = "0 4px 14px rgba(220, 38, 38, 0.35)";
          e.currentTarget.style.transform = visible ? "translateY(0) scale(1)" : "translateY(16px) scale(0.8)";
        }}
      >
        <ArrowUp className="w-5 h-5" strokeWidth={2.5} />
      </button>
    </>
  );
}