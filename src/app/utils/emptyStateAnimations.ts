/**
 * Shared CSS keyframe animations for empty state illustrations.
 * Injected once via IIFE on first import.
 */

var _injected = false;

export function injectEmptyStateCSS(): void {
  if (_injected || typeof document === "undefined") return;
  _injected = true;
  var style = document.createElement("style");
  style.textContent = [
    // Slow rotation for dashed circles
    "@keyframes es-spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}",
    // Gentle float up/down
    "@keyframes es-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}",
    // Sparkle twinkle
    "@keyframes es-twinkle{0%,100%{opacity:0.3;transform:scale(0.7)}50%{opacity:1;transform:scale(1.2)}}",
    // Heartbeat pulse
    "@keyframes es-heartbeat{0%,100%{transform:scale(1)}14%{transform:scale(1.2)}28%{transform:scale(0.95)}42%{transform:scale(1.1)}70%{transform:scale(1)}}",
    // Pin drop bounce
    "@keyframes es-pin-drop{0%{transform:translateY(-18px);opacity:0}40%{transform:translateY(2px);opacity:1}55%{transform:translateY(-6px)}70%{transform:translateY(1px)}85%{transform:translateY(-2px)}100%{transform:translateY(0)}}",
    // Gentle shake (search miss)
    "@keyframes es-shake{0%,100%{transform:translateX(0)}15%{transform:translateX(-4px) rotate(-3deg)}30%{transform:translateX(3px) rotate(2deg)}45%{transform:translateX(-2px) rotate(-1deg)}60%{transform:translateX(1px) rotate(1deg)}75%{transform:translateX(-1px)}90%{transform:translateX(0)}}",
    // Receipt slide out from bag
    "@keyframes es-receipt{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}",
    // Fade in up (for CTA buttons)
    "@keyframes es-fade-up{0%{opacity:0;transform:translateY(10px)}100%{opacity:1;transform:translateY(0)}}",
    // 404 float with rotation
    "@keyframes es-404-float{0%,100%{transform:translateY(0) rotate(0deg)}25%{transform:translateY(-4px) rotate(2deg)}75%{transform:translateY(2px) rotate(-2deg)}}",
    // Expanding ring (pulse outward)
    "@keyframes es-ring{0%{transform:scale(1);opacity:0.4}100%{transform:scale(1.6);opacity:0}}",
  ].join("");
  document.head.appendChild(style);
}

// Auto-inject on import
injectEmptyStateCSS();
