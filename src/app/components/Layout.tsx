/**
 * Layout.tsx - Shell principal da aplicacao (Header + Outlet + Footer + overlays)
 *
 * Este componente envolve TODAS as paginas publicas via React Router <Outlet>.
 * O admin (/admin) tem layout proprio - nao passa por aqui.
 *
 * LAZY LOADING:
 * ~10 componentes sao carregados imperativamente (sem React.lazy) para evitar
 * "component suspended while responding to synchronous input". Os chunks sao
 * importados no momento da avaliacao do modulo e renderizados apos resolverem.
 */
import { Outlet, useLocation } from "react-router";
import { Header } from "./Header";
import { HomepageInitProvider, useHomepageInit } from "../contexts/HomepageInitContext";
import { GA4Provider } from "./GA4Provider";
import { MarketingPixelsProvider } from "./MarketingPixels";
import { GTMProvider } from "./GTMProvider";
import "../utils/utmTracker";
import { Suspense, useEffect, useState, useRef } from "react";
import type { ReactNode } from "react";
import { seedPriceConfig } from "./PriceBadge";
import { seedCatalogMode } from "../contexts/CatalogModeContext";
import { Toaster } from "sonner";
import * as api from "../services/api";
import { Wrench } from "lucide-react";
import { useIdlePrefetch } from "../hooks/useIdlePrefetch";

// ══════════════════════════════════════════════════════════════════════════
// NON-SUSPENDING IMPERATIVE LAZY LOADING
// ══════════════════════════════════════════════════════════════════════════
// React.lazy() throws a Promise (suspends) when the chunk isn't loaded yet.
// During synchronous renders (setState, context changes), React throws
// "component suspended while responding to synchronous input" which React
// Router catches in its RenderErrorBoundary, breaking the app.
//
// Instead, we load modules imperatively and store the resolved component
// in a module-level map. Each wrapper is a proper top-level named function
// so React Fast Refresh / HMR can track it correctly.
//
// Flow:
// 1. At module evaluation time, all imports start immediately.
// 2. Each Deferred* component renders null until its chunk resolves.
// 3. A shared listener list triggers re-renders when chunks finish loading.
// ══════════════════════════════════════════════════════════════════════════

var _loaded: Record<string, React.ComponentType<any>> = {};
var _loading: Record<string, Promise<void>> = {};
var _listeners: Set<() => void> = new Set();

function _notifyLoaded() {
  _listeners.forEach(function (fn) { fn(); });
}

function _startLoad(key: string, importFn: () => Promise<any>, exportName: string) {
  if (_loading[key]) return;
  _loading[key] = importFn()
    .then(function (mod) {
      var comp = mod[exportName] || mod.default;
      if (typeof comp === "function") {
        _loaded[key] = comp;
        _notifyLoaded();
      } else {
        console.error("[DeferredLoad] " + key + "." + exportName + " is not a component, got:", typeof comp);
      }
    })
    .catch(function (err) {
      console.error("[DeferredLoad] Failed to load " + key + ":", err);
      delete _loading[key]; // allow retry on next render
    });
}

// Start ALL imports immediately at module evaluation time
_startLoad("Footer", function () { return import("./Footer"); }, "Footer");
_startLoad("MobileBottomNav", function () { return import("./MobileBottomNav"); }, "MobileBottomNav");
_startLoad("CartDrawer", function () { return import("./CartDrawer"); }, "CartDrawer");
_startLoad("CookieConsentBanner", function () { return import("./CookieConsentBanner"); }, "CookieConsentBanner");
_startLoad("WhatsAppButton", function () { return import("./WhatsAppButton"); }, "WhatsAppButton");
_startLoad("ScrollToTopButton", function () { return import("./ScrollToTopButton"); }, "ScrollToTopButton");
_startLoad("ExitIntentPopup", function () { return import("./ExitIntentPopup"); }, "ExitIntentPopup");
_startLoad("GoogleReviewsBadge", function () { return import("./GoogleReviewsBadge"); }, "GoogleReviewsBadge");
_startLoad("CartAbandonedTracker", function () { return import("./CartAbandonedTracker"); }, "CartAbandonedTracker");
_startLoad("WebVitalsReporter", function () { return import("./WebVitalsReporter"); }, "WebVitalsReporter");

/** Hook: subscribes to chunk-load notifications, re-renders when any chunk finishes */
function useDeferredReady(): number {
  var ref = useRef(0);
  var setState = useState(0)[1];
  useEffect(function () {
    function onLoad() {
      ref.current++;
      setState(ref.current);
    }
    _listeners.add(onLoad);
    // If chunks already loaded before mount, trigger a render
    if (Object.keys(_loaded).length > 0) {
      ref.current++;
      setState(ref.current);
    }
    return function () { _listeners.delete(onLoad); };
  }, []);
  return ref.current;
}

// ── Individually named wrapper components (NEVER suspend) ──────────────

function DeferredFooter() {
  useDeferredReady();
  var C = _loaded["Footer"];
  return C ? <C /> : null;
}

function DeferredCookieConsentBanner() {
  useDeferredReady();
  var C = _loaded["CookieConsentBanner"];
  return C ? <C /> : null;
}

function DeferredWhatsAppButton() {
  useDeferredReady();
  var C = _loaded["WhatsAppButton"];
  return C ? <C /> : null;
}

function DeferredScrollToTopButton() {
  useDeferredReady();
  var C = _loaded["ScrollToTopButton"];
  return C ? <C /> : null;
}

function DeferredExitIntentPopup() {
  useDeferredReady();
  var C = _loaded["ExitIntentPopup"];
  return C ? <C /> : null;
}

function DeferredGoogleReviewsBadge() {
  useDeferredReady();
  var C = _loaded["GoogleReviewsBadge"];
  return C ? <C /> : null;
}

function DeferredCartAbandonedTracker() {
  useDeferredReady();
  var C = _loaded["CartAbandonedTracker"];
  return C ? <C /> : null;
}

function DeferredWebVitalsReporter() {
  useDeferredReady();
  var C = _loaded["WebVitalsReporter"];
  return C ? <C /> : null;
}

function DeferredMobileBottomNav() {
  useDeferredReady();
  var C = _loaded["MobileBottomNav"];
  return C ? <C /> : null;
}

function DeferredCartDrawerInner() {
  useDeferredReady();
  var C = _loaded["CartDrawer"];
  return C ? <C /> : null;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * IIFE - runs at module load time, before React renders.
 * Injects SEO meta, structured data, OG tags, preconnects, and a
 * pre-render skeleton shell for faster perceived FCP.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function injectHeadAssets() {
  document.documentElement.lang = "pt-BR";

  // Referrer-Policy via meta name
  if (!document.querySelector('meta[name="referrer"]')) {
    var refMeta = document.createElement("meta");
    refMeta.name = "referrer";
    refMeta.content = "strict-origin-when-cross-origin";
    document.head.appendChild(refMeta);
  }

  // Remove noindex injected by the hosting platform
  var noindexMetas = document.querySelectorAll('meta[name="robots"]');
  for (var ri = 0; ri < noindexMetas.length; ri++) {
    noindexMetas[ri].remove();
  }
  var robotsMeta = document.createElement("meta");
  robotsMeta.name = "robots";
  robotsMeta.content = "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";
  document.head.appendChild(robotsMeta);

  // Meta description
  if (!document.querySelector('meta[name="description"]')) {
    var metaDesc = document.createElement("meta");
    metaDesc.name = "description";
    metaDesc.content = "Carretao Auto Pecas - Especialista em pecas para caminhoes. Catalogo com mais de 15.000 pecas, entrega para todo o Brasil, garantia e atendimento especializado. Compre online com desconto no PIX.";
    document.head.appendChild(metaDesc);
  }

  // Theme color
  if (!document.querySelector('meta[name="theme-color"]')) {
    var metaTheme = document.createElement("meta");
    metaTheme.name = "theme-color";
    metaTheme.content = "#dc2626";
    document.head.appendChild(metaTheme);
  }

  // Open Graph
  var ogTags: Array<{ property: string; content: string }> = [
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Carretao Auto Pecas" },
    { property: "og:title", content: "Carretao Auto Pecas - Pecas para Caminhoes" },
    { property: "og:description", content: "Catalogo com mais de 15.000 pecas automotivas. Especialista em caminhoes, entrega para todo o Brasil, garantia e atendimento especializado." },
    { property: "og:locale", content: "pt_BR" },
  ];
  for (var i = 0; i < ogTags.length; i++) {
    var og = ogTags[i];
    if (!document.querySelector('meta[property="' + og.property + '"]')) {
      var ogMeta = document.createElement("meta");
      ogMeta.setAttribute("property", og.property);
      ogMeta.content = og.content;
      document.head.appendChild(ogMeta);
    }
  }

  // JSON-LD LocalBusiness
  if (!document.querySelector('script[type="application/ld+json"]')) {
    var jsonLd = document.createElement("script");
    jsonLd.type = "application/ld+json";
    jsonLd.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "AutoPartsStore",
      "name": "Carretao Auto Pecas",
      "description": "Especialista em pecas para caminhoes. Catalogo com mais de 15.000 pecas.",
      "url": window.location.origin,
      "telephone": "0800 643 1170",
      "email": "contato@carretaoautopecas.com.br",
      "address": { "@type": "PostalAddress", "addressCountry": "BR" },
      "areaServed": "BR",
      "priceRange": "$$",
      "paymentAccepted": ["PIX", "Boleto", "Cartao de Credito", "Cartao de Debito"],
      "currenciesAccepted": "BRL",
      "numberOfEmployees": { "@type": "QuantitativeValue", "minValue": 50 },
      "foundingDate": "2000",
      "sameAs": []
    });
    document.head.appendChild(jsonLd);
  }

  // JSON-LD WebSite + SearchAction
  if (!document.querySelector('script[data-website-jsonld]')) {
    var wsJsonLd = document.createElement("script");
    wsJsonLd.type = "application/ld+json";
    wsJsonLd.setAttribute("data-website-jsonld", "true");
    wsJsonLd.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "Carretao Auto Pecas",
      "url": window.location.origin,
      "potentialAction": {
        "@type": "SearchAction",
        "target": {
          "@type": "EntryPoint",
          "urlTemplate": window.location.origin + "/catalogo?busca={search_term_string}"
        },
        "query-input": "required name=search_term_string"
      }
    });
    document.head.appendChild(wsJsonLd);
  }

  // Preconnect to Supabase
  var supabaseOrigin = "https://aztdgagxvrlylszieujs.supabase.co";
  if (!document.querySelector('link[rel="preconnect"][href="' + supabaseOrigin + '"]:not([crossorigin])')) {
    var linkNoCors = document.createElement("link");
    linkNoCors.rel = "preconnect";
    linkNoCors.href = supabaseOrigin;
    document.head.appendChild(linkNoCors);
  }
  if (!document.querySelector('link[rel="preconnect"][href="' + supabaseOrigin + '"][crossorigin]')) {
    var linkCors = document.createElement("link");
    linkCors.rel = "preconnect";
    linkCors.href = supabaseOrigin;
    linkCors.crossOrigin = "anonymous";
    document.head.appendChild(linkCors);
  }

  // DNS-prefetch for Supabase
  if (!document.querySelector('link[rel="dns-prefetch"][href="' + supabaseOrigin + '"]')) {
    var dnsPrefetch = document.createElement("link");
    dnsPrefetch.rel = "dns-prefetch";
    dnsPrefetch.href = supabaseOrigin;
    document.head.appendChild(dnsPrefetch);
  }

  // DNS-prefetch for Unsplash
  var unsplashOrigin = "https://images.unsplash.com";
  if (!document.querySelector('link[rel="dns-prefetch"][href="' + unsplashOrigin + '"]')) {
    var unsplashDns = document.createElement("link");
    unsplashDns.rel = "dns-prefetch";
    unsplashDns.href = unsplashOrigin;
    document.head.appendChild(unsplashDns);
  }

  // Pre-render skeleton shell
  var root = document.getElementById("root");
  if (root && root.children.length === 0) {
    root.innerHTML = [
      '<div style="min-height:100vh;display:flex;flex-direction:column;font-family:Inter Variable,Inter,system-ui,sans-serif">',
      '  <a href="#main-content" style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;z-index:9999;background:#fff;color:#b91c1c;padding:8px 16px;font-weight:600;font-size:0.9rem;border-radius:0 0 8px 0">Pular para o conteudo</a>',
      '  <header role="banner" style="background:#fff;border-bottom:1px solid #e5e7eb;padding:12px 16px;display:flex;align-items:center;gap:12px">',
      '    <div style="width:140px;height:40px;background:#f3f4f6;border-radius:8px;animation:pulse 2s cubic-bezier(.4,0,.6,1) infinite"></div>',
      '    <div style="flex:1;max-width:400px;height:40px;background:#f3f4f6;border-radius:8px;animation:pulse 2s cubic-bezier(.4,0,.6,1) infinite"></div>',
      '    <div style="width:40px;height:40px;background:#f3f4f6;border-radius:50%;animation:pulse 2s cubic-bezier(.4,0,.6,1) infinite;margin-left:auto"></div>',
      '  </header>',
      '  <main id="main-content" role="main" style="flex:1;display:flex;flex-direction:column">',
      '    <div style="background:#1f2937;width:100%;padding-bottom:clamp(200px,32vw,500px);animation:pulse 2s cubic-bezier(.4,0,.6,1) infinite"></div>',
      '    <div style="padding:24px 16px;display:flex;gap:12px;flex-wrap:wrap;background:#fff;border-bottom:1px solid #f3f4f6">',
      '      <div style="flex:1;min-width:140px;height:56px;background:#f3f4f6;border-radius:12px;animation:pulse 2s cubic-bezier(.4,0,.6,1) infinite"></div>',
      '      <div style="flex:1;min-width:140px;height:56px;background:#f3f4f6;border-radius:12px;animation:pulse 2s cubic-bezier(.4,0,.6,1) infinite"></div>',
      '    </div>',
      '    <div style="background:#f9fafb;padding:48px 16px;flex:1">',
      '      <div style="max-width:1280px;margin:0 auto">',
      '        <div style="width:200px;height:28px;background:#e5e7eb;border-radius:8px;margin-bottom:24px;animation:pulse 2s cubic-bezier(.4,0,.6,1) infinite"></div>',
      '        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:20px">',
      '          <div style="height:320px;background:#fff;border-radius:12px;border:1px solid #e5e7eb;animation:pulse 2s cubic-bezier(.4,0,.6,1) infinite"></div>',
      '          <div style="height:320px;background:#fff;border-radius:12px;border:1px solid #e5e7eb;animation:pulse 2s cubic-bezier(.4,0,.6,1) infinite"></div>',
      '          <div style="height:320px;background:#fff;border-radius:12px;border:1px solid #e5e7eb;animation:pulse 2s cubic-bezier(.4,0,.6,1) infinite"></div>',
      '          <div style="height:320px;background:#fff;border-radius:12px;border:1px solid #e5e7eb;animation:pulse 2s cubic-bezier(.4,0,.6,1) infinite"></div>',
      '        </div>',
      '      </div>',
      '    </div>',
      '  </main>',
      '</div>',
      '<style>@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}</style>',
    ].join("\n");
  }
})();

/** Seeds PriceBadge config cache from homepage-init */
function PriceConfigSeeder() {
  var { data: initData, loading: initLoading } = useHomepageInit();
  useEffect(function () {
    if (!initLoading && initData) {
      if (initData.priceConfig) {
        seedPriceConfig(initData.priceConfig);
      }
      if (initData.settings) {
        seedCatalogMode(!!initData.settings.catalogMode);
      }
    }
  }, [initData, initLoading]);
  return null;
}

function ScrollToTop() {
  var loc = useLocation();
  useEffect(function () {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);
  useEffect(function () {
    if (loc.hash) return;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [loc.pathname, loc.search]);
  return null;
}

/** Loads favicon from backend */
function FaviconLoader() {
  useEffect(function () {
    api.getFavicon().then(function (data) {
      if (data && data.hasFavicon && data.url) {
        var existing = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
        if (!existing) {
          existing = document.createElement("link");
          existing.rel = "icon";
          document.head.appendChild(existing);
        }
        existing.href = data.url;
      }
    }).catch(function () {});
  }, []);
  return null;
}

/** Lazy-mount CartDrawer after first user interaction or 4s idle */
function DeferredCartDrawerMount() {
  var [ready, setReady] = useState(false);
  useEffect(function () {
    if (ready) return;
    var mounted = true;
    var timer: ReturnType<typeof setTimeout>;
    function trigger() {
      if (mounted && !ready) setReady(true);
      cleanup();
    }
    function cleanup() {
      clearTimeout(timer);
      document.removeEventListener("click", trigger);
      document.removeEventListener("touchstart", trigger);
      document.removeEventListener("keydown", trigger);
      document.removeEventListener("scroll", trigger);
    }
    timer = setTimeout(trigger, 4000);
    document.addEventListener("click", trigger, { once: true, passive: true });
    document.addEventListener("touchstart", trigger, { once: true, passive: true });
    document.addEventListener("keydown", trigger, { once: true });
    document.addEventListener("scroll", trigger, { once: true, passive: true });
    return function () { mounted = false; cleanup(); };
  }, [ready]);
  if (!ready) return null;
  return <DeferredCartDrawerInner />;
}

/** MaintenanceGate - checks maintenance mode */
function MaintenanceGate({ children }: { children: ReactNode }) {
  var [maintenance, setMaintenance] = useState(false);
  var [bypassed, setBypassed] = useState(false);
  var isDocsPage = typeof window !== "undefined" && window.location.pathname === "/docs";

  useEffect(function () {
    if (isDocsPage) return;
    var BYPASS_TOKEN = "carretao2026";
    var COOKIE_NAME = "maint_bypass";
    try {
      var params = new URLSearchParams(window.location.search);
      var previewParam = params.get("preview");
      if (previewParam === BYPASS_TOKEN) {
        document.cookie = COOKIE_NAME + "=" + BYPASS_TOKEN + ";path=/;max-age=86400;SameSite=Lax";
        setBypassed(true);
        params.delete("preview");
        var cleanUrl = window.location.pathname + (params.toString() ? "?" + params.toString() : "") + window.location.hash;
        window.history.replaceState({}, "", cleanUrl);
        return;
      }
      if (previewParam === "off") {
        document.cookie = COOKIE_NAME + "=;path=/;max-age=0;SameSite=Lax";
        params.delete("preview");
        var cleanUrl2 = window.location.pathname + (params.toString() ? "?" + params.toString() : "") + window.location.hash;
        window.history.replaceState({}, "", cleanUrl2);
      }
    } catch (e) {}
    try {
      var cookies = document.cookie.split(";");
      for (var ci = 0; ci < cookies.length; ci++) {
        var parts = cookies[ci].trim().split("=");
        if (parts[0] === COOKIE_NAME && parts[1] === BYPASS_TOKEN) {
          setBypassed(true);
          return;
        }
      }
    } catch (e) {}
    var host = window.location.hostname;
    var isProduction = host === "autopecascarretao.com" || host === "autopecascarretao.com.br" || host === "www.autopecascarretao.com" || host === "www.autopecascarretao.com.br" || host.endsWith(".catalogo-pecas.pages.dev") || host === "catalogo-pecas.pages.dev";
    if (!isProduction) return;
    // Default to maintenance ON — only turns OFF if API explicitly returns maintenanceMode:false.
    // This ensures the site stays locked if the backend is unreachable.
    setMaintenance(true);
    var attempts = 0;
    var maxAttempts = 3;
    function tryCheck() {
      attempts++;
      api.getSettings().then(function (s) {
        if (s && s.maintenanceMode === false) setMaintenance(false);
      }).catch(function () {
        if (attempts < maxAttempts) {
          setTimeout(tryCheck, 2000);
        } else {
          console.warn("[MaintenanceGate] API unreachable after " + maxAttempts + " attempts — keeping maintenance ON");
        }
      });
    }
    tryCheck();
  }, []);

  if (bypassed && maintenance) {
    return (
      <>
        <div
          style={{
            position: "fixed", bottom: 16, left: 16, zIndex: 99999,
            background: "linear-gradient(135deg, #b91c1c, #dc2626)",
            color: "#fff", padding: "8px 16px", borderRadius: 10,
            fontSize: "0.75rem", fontWeight: 700,
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            display: "flex", alignItems: "center", gap: 8,
            letterSpacing: "0.02em", userSelect: "none",
          }}
        >
          <span style={{ fontSize: "1rem" }}>&#128295;</span>
          <span>PREVIEW - Site em manutencao para visitantes</span>
          <button
            onClick={function () {
              document.cookie = "maint_bypass=;path=/;max-age=0;SameSite=Lax";
              window.location.reload();
            }}
            style={{
              background: "rgba(255,255,255,0.2)", border: "none",
              color: "#fff", padding: "2px 8px", borderRadius: 6,
              cursor: "pointer", fontSize: "0.7rem", fontWeight: 600, marginLeft: 4,
            }}
            title="Desativar preview"
          >
            Sair
          </button>
        </div>
        {children}
      </>
    );
  }
  if (bypassed || isDocsPage) return <>{children}</>;
  if (maintenance) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-lg">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-red-100 rounded-full mb-6">
            <Wrench className="w-10 h-10 text-red-600" />
          </div>
          <h1 className="text-gray-900 mb-3" style={{ fontSize: "1.8rem", fontWeight: 800 }}>
            Estamos em manutencao
          </h1>
          <p className="text-gray-500 mb-6" style={{ fontSize: "1rem", lineHeight: 1.6 }}>
            Nosso site esta passando por uma manutencao programada para melhorias.
            Voltaremos em breve! Agradecemos a compreensao.
          </p>
          <div className="bg-white border border-gray-200 rounded-xl p-5 inline-block">
            <p className="text-gray-600 mb-1" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
              Precisa de ajuda? Ligue para nosso televendas:
            </p>
            <a
              href="tel:08006431170"
              className="text-red-600 hover:text-red-700 transition-colors"
              style={{ fontSize: "1.3rem", fontWeight: 700 }}
            >
              0800 643 1170
            </a>
          </div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

/** Shows a test-mode banner ONLY on the Figma Site domain */
function TesterBanner() {
  var [show, setShow] = useState(false);
  useEffect(function () {
    var host = window.location.hostname;
    if (host === "cafe-puce-47800704.figma.site") setShow(true);
  }, []);
  if (!show) return null;
  return (
    <div
      className="w-full text-center text-white font-bold tracking-wide flex items-center justify-center gap-2 select-none"
      style={{
        background: "repeating-linear-gradient(135deg, #b91c1c, #b91c1c 10px, #991b1b 10px, #991b1b 20px)",
        padding: "10px 16px", fontSize: "0.82rem", letterSpacing: "0.04em",
        zIndex: 9999, position: "relative",
      }}
    >
      <span style={{ fontSize: "1.1rem" }}>&#9888;</span>
      <span>VERSAO DE TESTES - Este site e apenas para demonstracao. Compras realizadas aqui NAO serao processadas.</span>
      <span style={{ fontSize: "1.1rem" }}>&#9888;</span>
    </div>
  );
}

export function Layout() {
  useIdlePrefetch();

  return (
    <MaintenanceGate>
      <HomepageInitProvider>
        <GTMProvider>
        <GA4Provider>
        <MarketingPixelsProvider>
          <div className="min-h-screen flex flex-col">
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:fixed focus:top-0 focus:left-0 focus:z-[9999] focus:bg-white focus:text-red-700 focus:px-4 focus:py-2 focus:font-semibold focus:text-sm focus:rounded-br-lg focus:shadow-lg"
            >
              Pular para o conteudo
            </a>
            <TesterBanner />
            <ScrollToTop />
            <PriceConfigSeeder />
            <FaviconLoader />
            <Header />
            <main id="main-content" className="flex-1">
              <Suspense
                fallback={
                  <div className="flex items-center justify-center py-24">
                    <div className="w-8 h-8 border-3 border-red-200 border-t-red-600 rounded-full animate-spin" />
                  </div>
                }
              >
                <Outlet />
              </Suspense>
            </main>
            <DeferredFooter />
            {/* Spacer for mobile bottom nav */}
            <div className="md:hidden" style={{ height: "68px" }} />
            <DeferredCartDrawerMount />
            <DeferredCookieConsentBanner />
            <DeferredWhatsAppButton />
            <DeferredScrollToTopButton />
            <DeferredMobileBottomNav />
            <DeferredExitIntentPopup />
            <DeferredGoogleReviewsBadge />
            <DeferredCartAbandonedTracker />
            <DeferredWebVitalsReporter />
            <Toaster position="top-right" richColors closeButton duration={3500} />
          </div>
        </MarketingPixelsProvider>
        </GA4Provider>
        </GTMProvider>
      </HomepageInitProvider>
    </MaintenanceGate>
  );
}
