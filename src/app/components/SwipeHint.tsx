import { useState, useEffect } from "react";
import { Hand, ChevronUp } from "lucide-react";

// ═══════════════════════════════════════════════════════════════════
// SwipeHint — Temporary animated overlay with a hand icon showing
// users how to swipe up to see the next video. Auto-dismisses
// after ~3s or on first touch/click.
// ═══════════════════════════════════════════════════════════════════

var HINT_DURATION = 3000;

// CSS keyframes now defined in /src/styles/index.css to avoid CSP violations.
// No runtime style injection needed.

export function SwipeHint({ visible }: { visible: boolean }) {
  var [show, setShow] = useState(true);
  var [fading, setFading] = useState(false);

  // Auto-dismiss
  useEffect(function () {
    if (!visible) return;
    var fadeTimer = setTimeout(function () {
      setFading(true);
    }, HINT_DURATION - 500);
    var hideTimer = setTimeout(function () {
      setShow(false);
    }, HINT_DURATION);
    return function () {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, [visible]);

  // Dismiss on touch/click
  useEffect(function () {
    if (!visible || !show) return;
    function dismiss() {
      setFading(true);
      setTimeout(function () { setShow(false); }, 300);
    }
    window.addEventListener("touchstart", dismiss, { once: true, passive: true });
    window.addEventListener("mousedown", dismiss, { once: true });
    return function () {
      window.removeEventListener("touchstart", dismiss);
      window.removeEventListener("mousedown", dismiss);
    };
  }, [visible, show]);

  if (!visible || !show) return null;

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none"
      style={{
        animation: fading ? "swipeHintFadeOut 0.4s ease-out forwards" : "swipeHintFadeIn 0.3s ease-out",
      }}
    >
      {/* Dark scrim */}
      <div className="absolute inset-0 bg-black/30 rounded-lg" />

      {/* Animated content */}
      <div className="relative flex flex-col items-center gap-2">
        {/* Animated hand + arrow */}
        <div
          style={{
            animation: "swipeHandMove 1.4s ease-in-out infinite",
          }}
          className="flex flex-col items-center"
        >
          {/* Chevron up arrow */}
          <ChevronUp
            className="w-8 h-8 text-white drop-shadow-lg"
            strokeWidth={2.5}
          />

          {/* Hand icon */}
          <Hand
            className="w-11 h-11 text-white drop-shadow-xl mt-0.5"
            strokeWidth={1.8}
            style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.4))" }}
          />
        </div>

        {/* Text */}
        <p
          className="text-white text-center mt-1"
          style={{
            fontSize: "0.85rem",
            fontWeight: 600,
            textShadow: "0 2px 8px rgba(0,0,0,0.7)",
            letterSpacing: "0.02em",
          }}
        >
          Deslize para cima
        </p>
        <p
          className="text-white/70 text-center"
          style={{
            fontSize: "0.7rem",
            fontWeight: 500,
            textShadow: "0 1px 4px rgba(0,0,0,0.5)",
          }}
        >
          para o próximo vídeo
        </p>
      </div>
    </div>
  );
}