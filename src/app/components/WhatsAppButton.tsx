import { useState, useEffect } from "react";
import { MessageCircle } from "lucide-react";

/**
 * WhatsAppButton — Floating WhatsApp button (bottom-right corner).
 * Opens a pre-filled WhatsApp Business chat.
 * Shows after 3s delay to avoid impacting FCP.
 * Smooth expand on hover with CSS transitions (no mount/unmount).
 */

const WHATSAPP_NUMBER = "5544997330202"; // Carretao Auto Pecas WhatsApp
const DEFAULT_MESSAGE = "Olá! Vim pelo site da Carretão Auto Peças e gostaria de mais informações.";

export function WhatsAppButton() {
  var [visible, setVisible] = useState(false);
  var [hover, setHover] = useState(false);
  var [isMobile, setIsMobile] = useState(false);

  useEffect(function () {
    // Check if mobile (< 768px matches md: breakpoint)
    function checkMobile() {
      setIsMobile(window.innerWidth < 768);
    }
    checkMobile();
    window.addEventListener("resize", checkMobile);

    var timer = setTimeout(function () {
      setVisible(true);
    }, 3000);
    return function () {
      clearTimeout(timer);
      window.removeEventListener("resize", checkMobile);
    };
  }, []);

  // Hide on mobile — WhatsApp is in the MobileBottomNav
  if (!visible || isMobile) return null;

  var url = "https://wa.me/" + WHATSAPP_NUMBER + "?text=" + encodeURIComponent(DEFAULT_MESSAGE);

  return (
    <>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Falar no WhatsApp"
        onMouseEnter={function () { setHover(true); }}
        onMouseLeave={function () { setHover(false); }}
        className="whatsapp-fab fixed z-50 flex items-center overflow-hidden"
        style={{
          bottom: "24px",
          right: "24px",
          height: "52px",
          borderRadius: "26px",
          background: "linear-gradient(135deg, #25D366 0%, #128C7E 100%)",
          color: "#fff",
          padding: "0 14px",
          gap: "0px",
          boxShadow: hover
            ? "0 8px 28px rgba(37, 211, 102, 0.55), 0 0 0 4px rgba(37, 211, 102, 0.15)"
            : "0 4px 16px rgba(37, 211, 102, 0.35)",
          transform: hover ? "translateY(-2px) scale(1.03)" : "translateY(0) scale(1)",
          transition: "box-shadow 0.4s cubic-bezier(.22,.61,.36,1), transform 0.35s cubic-bezier(.22,.61,.36,1), padding 0.4s cubic-bezier(.22,.61,.36,1), gap 0.4s cubic-bezier(.22,.61,.36,1)",
          textDecoration: "none",
          cursor: "pointer",
          animation: "whatsapp-entrance 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        }}
      >
        <MessageCircle
          className="w-6 h-6 shrink-0"
          style={{
            fill: "#fff",
            stroke: "#25D366",
            transition: "transform 0.35s cubic-bezier(.22,.61,.36,1)",
            transform: hover ? "rotate(-8deg) scale(1.1)" : "rotate(0) scale(1)",
          }}
        />
        <span
          className="whatsapp-label"
          style={{
            display: "inline-block",
            overflow: "hidden",
            whiteSpace: "nowrap",
            maxWidth: hover ? "130px" : "0px",
            opacity: hover ? 1 : 0,
            marginLeft: hover ? "10px" : "0px",
            fontSize: "0.85rem",
            fontWeight: 600,
            letterSpacing: "0.01em",
            transition: "max-width 0.4s cubic-bezier(.22,.61,.36,1), opacity 0.3s ease, margin-left 0.4s cubic-bezier(.22,.61,.36,1)",
          }}
        >
          Fale Conosco
        </span>
      </a>
      <style>{"\n@keyframes whatsapp-entrance {\n  0% { transform: scale(0) translateY(20px); opacity: 0; }\n  60% { transform: scale(1.08) translateY(-2px); opacity: 1; }\n  100% { transform: scale(1) translateY(0); opacity: 1; }\n}\n@keyframes whatsapp-pulse {\n  0%, 100% { box-shadow: 0 4px 16px rgba(37,211,102,0.35); }\n  50% { box-shadow: 0 4px 24px rgba(37,211,102,0.5), 0 0 0 6px rgba(37,211,102,0.1); }\n}\n.whatsapp-fab:not(:hover) { animation: whatsapp-entrance 0.6s cubic-bezier(0.34,1.56,0.64,1) both, whatsapp-pulse 3s ease-in-out 4s infinite; }\n"}</style>
    </>
  );
}