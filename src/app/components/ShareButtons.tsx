import { useState, useRef, useEffect } from "react";
import { Share2, Copy, Check, X } from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════
// ShareButtons — Social sharing buttons for product pages.
// WhatsApp, Facebook, and Copy Link.
// Essential for auto parts stores in Brazil where WhatsApp sharing
// drives significant referral traffic.
// ═══════════════════════════════════════════════════════════════════════

interface Props {
  url: string;
  title: string;
  /** Optional extra text for WhatsApp (e.g. "SKU: ABC123 - R$ 99,90") */
  extraText?: string;
}

// Inline WhatsApp SVG — matches lucide-react style
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

// Inline Facebook SVG
function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

export function ShareButtons({ url, title, extraText }: Props) {
  var [open, setOpen] = useState(false);
  var [copied, setCopied] = useState(false);
  var popRef = useRef<HTMLDivElement>(null);
  var btnRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(function () {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        popRef.current && !popRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return function () { document.removeEventListener("mousedown", handleClick); };
  }, [open]);

  // Close on ESC
  useEffect(function () {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return function () { document.removeEventListener("keydown", handleKey); };
  }, [open]);

  function handleWhatsApp() {
    var text = title;
    if (extraText) text = text + "\n" + extraText;
    text = text + "\n\n" + url;
    var waUrl = "https://api.whatsapp.com/send?text=" + encodeURIComponent(text);
    window.open(waUrl, "_blank", "noopener,noreferrer");
    setOpen(false);
  }

  function handleFacebook() {
    var fbUrl = "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url);
    window.open(fbUrl, "_blank", "noopener,noreferrer,width=600,height=400");
    setOpen(false);
  }

  function handleCopy() {
    navigator.clipboard.writeText(url).then(function () {
      setCopied(true);
      setTimeout(function () { setCopied(false); }, 2500);
    }).catch(function () {
      // Fallback for HTTP or older browsers
      var ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); setCopied(true); setTimeout(function () { setCopied(false); }, 2500); } catch {}
      document.body.removeChild(ta);
    });
  }

  return (
    <div className="relative inline-block">
      <button
        ref={btnRef}
        onClick={function () { setOpen(!open); }}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-800 hover:border-gray-300 transition-all duration-200"
        style={{ fontSize: "0.82rem", fontWeight: 500 }}
        title="Compartilhar"
        aria-label="Compartilhar este produto"
        aria-expanded={open}
      >
        <Share2 className="w-4 h-4" />
        <span className="hidden sm:inline">Compartilhar</span>
      </button>

      {open && (
        <div
          ref={popRef}
          className="absolute right-0 top-full mt-2 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden"
          style={{ minWidth: "220px", animation: "fadeInScale 150ms ease-out" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50">
            <span className="text-gray-700" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
              Compartilhar
            </span>
            <button
              onClick={function () { setOpen(false); }}
              className="text-gray-400 hover:text-gray-600 transition-colors p-0.5"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* WhatsApp */}
          <button
            onClick={handleWhatsApp}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-green-50 transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
              <WhatsAppIcon className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <span className="text-gray-800 block" style={{ fontSize: "0.85rem", fontWeight: 600 }}>WhatsApp</span>
              <span className="text-gray-400 block" style={{ fontSize: "0.72rem" }}>Enviar para contato ou grupo</span>
            </div>
          </button>

          {/* Facebook */}
          <button
            onClick={handleFacebook}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 transition-colors text-left border-t border-gray-50"
          >
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
              <FacebookIcon className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <span className="text-gray-800 block" style={{ fontSize: "0.85rem", fontWeight: 600 }}>Facebook</span>
              <span className="text-gray-400 block" style={{ fontSize: "0.72rem" }}>Publicar no feed</span>
            </div>
          </button>

          {/* Copy Link */}
          <button
            onClick={handleCopy}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left border-t border-gray-50"
          >
            <div className={"w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors " + (copied ? "bg-green-100" : "bg-gray-100")}>
              {copied
                ? <Check className="w-4 h-4 text-green-600" />
                : <Copy className="w-4 h-4 text-gray-500" />
              }
            </div>
            <div>
              <span className={"block " + (copied ? "text-green-700" : "text-gray-800")} style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                {copied ? "Link copiado!" : "Copiar link"}
              </span>
              <span className="text-gray-400 block" style={{ fontSize: "0.72rem" }}>
                {copied ? "Pronto para colar" : "Copiar URL do produto"}
              </span>
            </div>
          </button>
        </div>
      )}

      {/* Animation keyframes */}
      <style>{`
        @keyframes fadeInScale {
          0% { opacity: 0; transform: scale(0.95) translateY(-4px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
