import { Outlet, useLocation } from "react-router";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { HomepageInitProvider, useHomepageInit } from "../contexts/HomepageInitContext";
import { GA4Provider } from "./GA4Provider";
import { Suspense, lazy, useEffect, useState, Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { seedPriceConfig } from "./PriceBadge";
import { Toaster } from "sonner";
import * as api from "../services/api";
import { Wrench } from "lucide-react";

// ── Retry wrapper for lazy imports — retries up to 2× on network failure ──
function lazyWithRetry(importFn: () => Promise<any>, retries?: number) {
  var maxRetries = retries || 2;
  return lazy(function () {
    return importFn().catch(function (err: any) {
      if (maxRetries <= 0) throw err;
      return new Promise(function (resolve) {
        setTimeout(resolve, 1500);
      }).then(function () {
        maxRetries--;
        return importFn();
      }).catch(function (err2: any) {
        if (maxRetries <= 0) throw err2;
        return new Promise(function (resolve) {
          setTimeout(resolve, 3000);
        }).then(function () {
          maxRetries--;
          return importFn();
        });
      });
    });
  });
}

// ── Error boundary: catches failed lazy imports without crashing the whole app ──
interface LazyBoundaryProps { children: ReactNode; }
interface LazyBoundaryState { hasError: boolean; }

class LazyBoundary extends Component<LazyBoundaryProps, LazyBoundaryState> {
  constructor(props: LazyBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(_error: Error): LazyBoundaryState {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.log("[LazyBoundary] Component failed to load:", error.message);
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

// Lazy-load CartDrawer — defers the heavy 'motion' library from the critical path
const CartDrawer = lazyWithRetry(function () {
  return import("./CartDrawer").then(function (m) { return { default: m.CartDrawer }; });
});

// Lazy-load CookieConsentBanner — not needed for critical path
const CookieConsentBanner = lazyWithRetry(function () {
  return import("./CookieConsentBanner").then(function (m) { return { default: m.CookieConsentBanner }; });
});

// Lazy-load WhatsAppButton — not needed for initial render (desktop only)
const WhatsAppButton = lazyWithRetry(function () {
  return import("./WhatsAppButton").then(function (m) { return { default: m.WhatsAppButton }; });
});

// Lazy-load ScrollToTopButton — not needed for initial render
const ScrollToTopButton = lazyWithRetry(function () {
  return import("./ScrollToTopButton").then(function (m) { return { default: m.ScrollToTopButton }; });
});

// Lazy-load MobileBottomNav — only needed on mobile
const MobileBottomNav = lazyWithRetry(function () {
  return import("./MobileBottomNav").then(function (m) { return { default: m.MobileBottomNav }; });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * IIFE — runs at module load time, before React renders.
 * Injects SEO meta, structured data, OG tags, preconnects, and a
 * pre-render skeleton shell for faster perceived FCP.
 *
 * STEP 2: Google Fonts removed — Inter is now self-hosted via
 *         @fontsource-variable/inter (imported in fonts.css).
 *         This eliminates 2 DNS lookups + external stylesheet.
 *
 * STEP 3: Pre-render shell + JSON-LD + Open Graph tags.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function injectHeadAssets() {
  // Set lang on HTML element (a11y + SEO requirement — PageSpeed flags missing lang)
  document.documentElement.lang = "pt-BR";

  // ══════════════════════════════════════════════════════════════════════
  // Security meta tags — applied client-side because the CDN/edge layer
  // (Figma Sites / Cloudflare) serves the HTML without our custom headers.
  // These cover headers that support <meta> equivalents.
  // ══════════════════════════════════════════════════════════════════════

  // NOTE: Content-Security-Policy via <meta http-equiv> was intentionally
  // NOT added here because it breaks dynamic import() / code-splitting
  // used by React lazy(). The CSP policy is enforced on API responses
  // via the Hono backend middleware where it actually matters.
  // X-Frame-Options, X-Content-Type-Options, Permissions-Policy, COOP,
  // and CORP have no <meta> equivalents — they are HTTP-header-only.

  // Referrer-Policy via meta name
  if (!document.querySelector('meta[name="referrer"]')) {
    var refMeta = document.createElement("meta");
    refMeta.name = "referrer";
    refMeta.content = "strict-origin-when-cross-origin";
    document.head.appendChild(refMeta);
  }

  // ── FIX: Remove noindex injected by the hosting platform ──────────────
  // The platform injects <meta name="robots" content="noindex"> which blocks
  // search engine indexation. We remove it and set "index, follow" instead.
  var noindexMetas = document.querySelectorAll('meta[name="robots"]');
  for (var ri = 0; ri < noindexMetas.length; ri++) {
    noindexMetas[ri].remove();
  }
  var robotsMeta = document.createElement("meta");
  robotsMeta.name = "robots";
  robotsMeta.content = "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";
  document.head.appendChild(robotsMeta);

  // ── Meta description (SEO — PageSpeed flags missing description) ──
  if (!document.querySelector('meta[name="description"]')) {
    var metaDesc = document.createElement("meta");
    metaDesc.name = "description";
    metaDesc.content = "Carretão Auto Peças - Especialista em peças para caminhões. Catálogo com mais de 15.000 peças, entrega para todo o Brasil, garantia e atendimento especializado. Compre online com desconto no PIX.";
    document.head.appendChild(metaDesc);
  }

  // ── Theme color (Best Practices) ──
  if (!document.querySelector('meta[name="theme-color"]')) {
    var metaTheme = document.createElement("meta");
    metaTheme.name = "theme-color";
    metaTheme.content = "#dc2626";
    document.head.appendChild(metaTheme);
  }

  // ── Open Graph meta tags (SEO + social sharing) ──
  var ogTags: Array<{ property: string; content: string }> = [
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Carretão Auto Peças" },
    { property: "og:title", content: "Carretão Auto Peças - Peças para Caminhões" },
    { property: "og:description", content: "Catálogo com mais de 15.000 peças automotivas. Especialista em caminhões, entrega para todo o Brasil, garantia e atendimento especializado." },
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

  // ── JSON-LD Structured Data (LocalBusiness schema — SEO rich snippets) ──
  if (!document.querySelector('script[type="application/ld+json"]')) {
    var jsonLd = document.createElement("script");
    jsonLd.type = "application/ld+json";
    jsonLd.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "AutoPartsStore",
      "name": "Carretão Auto Peças",
      "description": "Especialista em peças para caminhões. Catálogo com mais de 15.000 peças.",
      "url": window.location.origin,
      "telephone": "0800 643 1170",
      "email": "contato@carretaoautopecas.com.br",
      "address": {
        "@type": "PostalAddress",
        "addressCountry": "BR"
      },
      "areaServed": "BR",
      "priceRange": "$$",
      "paymentAccepted": ["PIX", "Boleto", "Cartão de Crédito", "Cartão de Débito"],
      "currenciesAccepted": "BRL",
      "numberOfEmployees": { "@type": "QuantitativeValue", "minValue": 50 },
      "foundingDate": "2000",
      "sameAs": []
    });
    document.head.appendChild(jsonLd);
  }

  // ── JSON-LD WebSite + SearchAction (enables Google Sitelinks Search Box) ──
  if (!document.querySelector('script[data-website-jsonld]')) {
    var wsJsonLd = document.createElement("script");
    wsJsonLd.type = "application/ld+json";
    wsJsonLd.setAttribute("data-website-jsonld", "true");
    wsJsonLd.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "Carretão Auto Peças",
      "url": window.location.origin,
      "potentialAction": {
        "@type": "SearchAction",
        "target": {
          "@type": "EntryPoint",
          "urlTemplate": window.location.origin + "/catalogo?search={search_term_string}"
        },
        "query-input": "required name=search_term_string"
      }
    });
    document.head.appendChild(wsJsonLd);
  }

  // ── Preconnect to Supabase (used for API + storage images) ──
  // Two preconnects needed: one with crossorigin (for fetch/XHR API calls)
  // and one without (for <img> tags which use no-CORS mode).
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

  // ── DNS-prefetch for Supabase (backup for browsers that don't support preconnect) ──
  if (!document.querySelector('link[rel="dns-prefetch"][href="' + supabaseOrigin + '"]')) {
    var dnsPrefetch = document.createElement("link");
    dnsPrefetch.rel = "dns-prefetch";
    dnsPrefetch.href = supabaseOrigin;
    document.head.appendChild(dnsPrefetch);
  }

  // ── DNS-prefetch for Unsplash (fallback hero / CTA images) ──
  var unsplashOrigin = "https://images.unsplash.com";
  if (!document.querySelector('link[rel="dns-prefetch"][href="' + unsplashOrigin + '"]')) {
    var unsplashDns = document.createElement("link");
    unsplashDns.rel = "dns-prefetch";
    unsplashDns.href = unsplashOrigin;
    document.head.appendChild(unsplashDns);
  }

  // ── NOTE: Google Fonts preconnect and loading code has been REMOVED.             ──
  // ── Inter is now self-hosted via @fontsource-variable/inter (see fonts.css).     ──
  // ── This eliminates 2 external DNS lookups (fonts.googleapis.com,                ──
  // ── fonts.gstatic.com) and the render-blocking external stylesheet.              ──

  // ── Pre-render skeleton shell (Step 3) ──────────────────────────────────
  // Injects a lightweight CSS-only skeleton into #root BEFORE React hydrates.
  // This gives immediate visual feedback (perceived FCP improvement).
  // React will replace this content when the app mounts.
  var root = document.getElementById("root");
  if (root && root.children.length === 0) {
    root.innerHTML = [
      '<div style="min-height:100vh;display:flex;flex-direction:column;font-family:Inter Variable,Inter,system-ui,sans-serif">',
      // ── Header skeleton ──
      '  <header style="background:#fff;border-bottom:1px solid #e5e7eb;padding:12px 16px;display:flex;align-items:center;gap:12px">',
      '    <div style="width:140px;height:40px;background:#f3f4f6;border-radius:8px;animation:pulse 2s cubic-bezier(.4,0,.6,1) infinite"></div>',
      '    <div style="flex:1;max-width:400px;height:40px;background:#f3f4f6;border-radius:8px;animation:pulse 2s cubic-bezier(.4,0,.6,1) infinite"></div>',
      '    <div style="width:40px;height:40px;background:#f3f4f6;border-radius:50%;animation:pulse 2s cubic-bezier(.4,0,.6,1) infinite;margin-left:auto"></div>',
      '  </header>',
      // ── Banner skeleton ──
      '  <div style="background:#1f2937;width:100%;padding-bottom:clamp(200px,32vw,500px);animation:pulse 2s cubic-bezier(.4,0,.6,1) infinite"></div>',
      // ── Benefits strip skeleton ──
      '  <div style="padding:24px 16px;display:flex;gap:12px;flex-wrap:wrap;background:#fff;border-bottom:1px solid #f3f4f6">',
      '    <div style="flex:1;min-width:140px;height:56px;background:#f3f4f6;border-radius:12px;animation:pulse 2s cubic-bezier(.4,0,.6,1) infinite"></div>',
      '    <div style="flex:1;min-width:140px;height:56px;background:#f3f4f6;border-radius:12px;animation:pulse 2s cubic-bezier(.4,0,.6,1) infinite"></div>',
      '    <div style="flex:1;min-width:140px;height:56px;background:#f3f4f6;border-radius:12px;animation:pulse 2s cubic-bezier(.4,0,.6,1) infinite;display:none" class="shell-hide-sm"></div>',
      '    <div style="flex:1;min-width:140px;height:56px;background:#f3f4f6;border-radius:12px;animation:pulse 2s cubic-bezier(.4,0,.6,1) infinite;display:none" class="shell-hide-sm"></div>',
      '  </div>',
      // ── Products skeleton ──
      '  <div style="flex:1;background:#f9fafb;padding:48px 16px">',
      '    <div style="max-width:1280px;margin:0 auto">',
      '      <div style="width:200px;height:28px;background:#e5e7eb;border-radius:8px;margin-bottom:24px;animation:pulse 2s cubic-bezier(.4,0,.6,1) infinite"></div>',
      '      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:20px">',
      '        <div style="height:320px;background:#fff;border-radius:12px;border:1px solid #e5e7eb;animation:pulse 2s cubic-bezier(.4,0,.6,1) infinite"></div>',
      '        <div style="height:320px;background:#fff;border-radius:12px;border:1px solid #e5e7eb;animation:pulse 2s cubic-bezier(.4,0,.6,1) infinite"></div>',
      '        <div style="height:320px;background:#fff;border-radius:12px;border:1px solid #e5e7eb;animation:pulse 2s cubic-bezier(.4,0,.6,1) infinite"></div>',
      '        <div style="height:320px;background:#fff;border-radius:12px;border:1px solid #e5e7eb;animation:pulse 2s cubic-bezier(.4,0,.6,1) infinite"></div>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</div>',
      // ── Pulse animation (CSS @keyframes injected inline) ──
      '<style>@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}</style>',
    ].join("\n");
  }
})();

/** Seeds PriceBadge config cache from homepage-init to eliminate the /price-config call */
function PriceConfigSeeder() {
  var { data: initData, loading: initLoading } = useHomepageInit();
  useEffect(function () {
    if (!initLoading && initData && initData.priceConfig) {
      seedPriceConfig(initData.priceConfig);
    }
  }, [initData, initLoading]);
  return null;
}

function ScrollToTop() {
  var loc = useLocation();

  // Disable browser's native scroll restoration so it doesn't fight our manual scroll
  useEffect(function () {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  useEffect(function () {
    // Skip scroll-to-top when navigating to a hash anchor (e.g. #avaliacoes)
    if (loc.hash) return;

    // Force-reset scroll immediately via DOM properties (synchronous, not
    // affected by CSS scroll-behavior) AND via scrollTo with behavior:'instant'.
    // Using multiple approaches to guarantee it works across all browsers.
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0; // Safari fallback
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [loc.pathname, loc.search]);
  return null;
}

/** Loads favicon from backend and applies it to the page */
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
    }).catch(function () { /* ignore */ });
  }, []);
  return null;
}

// Lazy-mount wrapper: only renders CartDrawer after first user interaction or 4s idle
function DeferredCartDrawer() {
  var [ready, setReady] = useState(false);

  useEffect(function () {
    // Mount after user interacts or after 4s idle (whichever comes first)
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

    // Defer 4s or first interaction
    timer = setTimeout(trigger, 4000);
    document.addEventListener("click", trigger, { once: true, passive: true });
    document.addEventListener("touchstart", trigger, { once: true, passive: true });
    document.addEventListener("keydown", trigger, { once: true });
    document.addEventListener("scroll", trigger, { once: true, passive: true });

    return function () {
      mounted = false;
      cleanup();
    };
  }, [ready]);

  if (!ready) return null;

  return (
    <LazyBoundary>
      <Suspense fallback={null}>
        <CartDrawer />
      </Suspense>
    </LazyBoundary>
  );
}

/** Checks maintenance mode and renders overlay if active */
function MaintenanceGate({ children }: { children: ReactNode }) {
  var [maintenance, setMaintenance] = useState(false);
  var [checked, setChecked] = useState(false);

  useEffect(function () {
    // Only enforce maintenance mode on production domains
    var host = window.location.hostname;
    var isProduction = host === "autopecascarretao.com" || host === "autopecascarretao.com.br" || host === "www.autopecascarretao.com" || host === "www.autopecascarretao.com.br";
    if (!isProduction) {
      setChecked(true);
      return;
    }

    var attempts = 0;
    var maxAttempts = 3;

    function tryCheck() {
      attempts++;
      api.getSettings().then(function (s) {
        if (s && s.maintenanceMode) {
          setMaintenance(true);
        }
        setChecked(true);
      }).catch(function () {
        if (attempts < maxAttempts) {
          // Retry after 2s — could be a transient network issue
          setTimeout(tryCheck, 2000);
        } else {
          // FAIL-CLOSED: if API is unreachable after 3 attempts on production,
          // assume maintenance is active to protect the site
          console.log("[MaintenanceGate] API unreachable after " + maxAttempts + " attempts — failing closed (showing maintenance)");
          setMaintenance(true);
          setChecked(true);
        }
      });
    }

    tryCheck();
  }, []);

  if (!checked) return null;

  if (maintenance) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-lg">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-red-100 rounded-full mb-6">
            <Wrench className="w-10 h-10 text-red-600" />
          </div>
          <h1 className="text-gray-900 mb-3" style={{ fontSize: "1.8rem", fontWeight: 800 }}>
            Estamos em manutenção
          </h1>
          <p className="text-gray-500 mb-6" style={{ fontSize: "1rem", lineHeight: 1.6 }}>
            Nosso site está passando por uma manutenção programada para melhorias.
            Voltaremos em breve! Agradecemos a compreensão.
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
    if (host === "cafe-puce-47800704.figma.site") {
      setShow(true);
    }
  }, []);
  if (!show) return null;
  return (
    <div
      className="w-full text-center text-white font-bold tracking-wide flex items-center justify-center gap-2 select-none"
      style={{
        background: "repeating-linear-gradient(135deg, #b91c1c, #b91c1c 10px, #991b1b 10px, #991b1b 20px)",
        padding: "10px 16px",
        fontSize: "0.82rem",
        letterSpacing: "0.04em",
        zIndex: 9999,
        position: "relative",
      }}
    >
      <span style={{ fontSize: "1.1rem" }}>⚠</span>
      <span>VERSÃO DE TESTES — Este site é apenas para demonstração. Compras realizadas aqui NÃO serão processadas.</span>
      <span style={{ fontSize: "1.1rem" }}>⚠</span>
    </div>
  );
}

export function Layout() {
  return (
    <MaintenanceGate>
      <HomepageInitProvider>
        <GA4Provider>
          <div className="min-h-screen flex flex-col">
            <TesterBanner />
            <ScrollToTop />
            <PriceConfigSeeder />
            <FaviconLoader />
            <Header />
            <main className="flex-1">
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
            <Footer />
            {/* Spacer for mobile bottom nav so footer content isn't hidden behind it */}
            <div className="md:hidden" style={{ height: "68px" }} />
            <DeferredCartDrawer />
            <LazyBoundary>
              <Suspense fallback={null}>
                <CookieConsentBanner />
              </Suspense>
            </LazyBoundary>
            <LazyBoundary>
              <Suspense fallback={null}>
                <WhatsAppButton />
              </Suspense>
            </LazyBoundary>
            <LazyBoundary>
              <Suspense fallback={null}>
                <ScrollToTopButton />
              </Suspense>
            </LazyBoundary>
            <LazyBoundary>
              <Suspense fallback={null}>
                <MobileBottomNav />
              </Suspense>
            </LazyBoundary>
            <Toaster position="top-right" richColors closeButton duration={3500} />
          </div>
        </GA4Provider>
      </HomepageInitProvider>
    </MaintenanceGate>
  );
}