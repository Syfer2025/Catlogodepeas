import React, { useState, useCallback, useRef, useMemo } from "react";
import Play from "lucide-react/dist/esm/icons/play.js";
import CheckCircle2 from "lucide-react/dist/esm/icons/check-circle-2.js";
import XCircle from "lucide-react/dist/esm/icons/x-circle.js";
import AlertTriangle from "lucide-react/dist/esm/icons/alert-triangle.js";
import Loader2 from "lucide-react/dist/esm/icons/loader-2.js";
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw.js";
import Clock from "lucide-react/dist/esm/icons/clock.js";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down.js";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right.js";
import Globe from "lucide-react/dist/esm/icons/globe.js";
import FileCheck from "lucide-react/dist/esm/icons/file-check.js";
import Shield from "lucide-react/dist/esm/icons/shield.js";
import Database from "lucide-react/dist/esm/icons/database.js";
import ShoppingCart from "lucide-react/dist/esm/icons/shopping-cart.js";
import CreditCard from "lucide-react/dist/esm/icons/credit-card.js";
import Truck from "lucide-react/dist/esm/icons/truck.js";
import Users from "lucide-react/dist/esm/icons/users.js";
import Package from "lucide-react/dist/esm/icons/package.js";
import Image from "lucide-react/dist/esm/icons/image.js";
import Settings from "lucide-react/dist/esm/icons/settings.js";
import Tag from "lucide-react/dist/esm/icons/tag.js";
import Star from "lucide-react/dist/esm/icons/star.js";
import Mail from "lucide-react/dist/esm/icons/mail.js";
import LayoutDashboard from "lucide-react/dist/esm/icons/layout-dashboard.js";
import Filter from "lucide-react/dist/esm/icons/filter.js";
import Download from "lucide-react/dist/esm/icons/download.js";
import Copy from "lucide-react/dist/esm/icons/copy.js";
import Search from "lucide-react/dist/esm/icons/search.js";

import * as api from "../../services/api";
import { projectId, publicAnonKey } from "../../../../utils/supabase/info";
import { getValidAdminToken, getAdminToken } from "./adminAuth";

// ─── Types ────────────────────────────────────────────────────────────────────
interface TestResult {
  id: string;
  name: string;
  category: string;
  status: "pass" | "fail" | "warn" | "skip" | "running" | "pending";
  duration?: number;
  message?: string;
  details?: string;
}

interface TestCategory {
  key: string;
  label: string;
  icon: any;
  description: string;
  requiresAuth: boolean;
}

// ─── Test Categories ──────────────────────────────────────────────────────────
var CATEGORIES: TestCategory[] = [
  { key: "health", label: "Saude do Servidor", icon: Globe, description: "Edge Function, conectividade, health check", requiresAuth: false },
  { key: "public-api", label: "APIs Publicas", icon: Database, description: "Endpoints que nao exigem autenticacao", requiresAuth: false },
  { key: "products", label: "Produtos & Catalogo", icon: Package, description: "Listagem, busca, destaques, autocomplete", requiresAuth: false },
  { key: "prices", label: "Precos & Estoque", icon: Tag, description: "SIGE precos, saldos, cache", requiresAuth: false },
  { key: "images", label: "Imagens & Assets", icon: Image, description: "Logo, favicon, banners, imagens de produtos", requiresAuth: false },
  { key: "shipping", label: "Frete & CEP", icon: Truck, description: "ViaCEP, calculo de frete, configuracao", requiresAuth: false },
  { key: "frontend", label: "Frontend & Rotas", icon: LayoutDashboard, description: "Lazy loading, componentes, React Router", requiresAuth: false },
  { key: "auth", label: "Autenticacao", icon: Shield, description: "Login, signup check, brute-force protection", requiresAuth: false },
  { key: "admin-core", label: "Admin Core", icon: Settings, description: "Dashboard, pedidos, clientes, configs", requiresAuth: true },
  { key: "admin-content", label: "Admin Conteudo", icon: FileCheck, description: "Banners, categorias, marcas, reels, FAQ", requiresAuth: true },
  { key: "sige", label: "Integracao SIGE", icon: Database, description: "Status, conexao, mapeamentos", requiresAuth: true },
  { key: "payments", label: "Pagamentos", icon: CreditCard, description: "PagHiper, MercadoPago", requiresAuth: true },
  { key: "marketing", label: "Marketing", icon: Mail, description: "Email marketing, cupons, afiliados, GA4", requiresAuth: true },
  { key: "reviews", label: "Avaliacoes & Garantia", icon: Star, description: "Reviews, moderacao, garantia estendida", requiresAuth: true },
  { key: "advanced", label: "Avancado", icon: Shield, description: "LGPD, auditoria, SisFrete WT, filiais", requiresAuth: true },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtMs(ms: number): string {
  if (ms < 1) return "<1ms";
  if (ms < 1000) return ms.toFixed(0) + "ms";
  return (ms / 1000).toFixed(2) + "s";
}

var _testIdCounter = 0;
function nextId(): string {
  return "t" + (++_testIdCounter);
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function AdminRegressionTest() {
  var [results, setResults] = useState<TestResult[]>([]);
  var [running, setRunning] = useState(false);
  var [runningCategory, setRunningCategory] = useState<string | null>(null);
  var [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  var [filterStatus, setFilterStatus] = useState<string>("all");
  var [searchQuery, setSearchQuery] = useState("");
  var startTimeRef = useRef(0);
  var [totalTime, setTotalTime] = useState(0);
  var abortRef = useRef<AbortController | null>(null);
  var _tokenRef = useRef<string>("");

  async function getToken(): Promise<string> {
    if (_tokenRef.current) return _tokenRef.current;
    var t = await getValidAdminToken();
    if (t) _tokenRef.current = t;
    return t || "";
  }
  // accessToken is resolved per-function via getToken()

  // ── Add result helper ──
  function addResult(r: TestResult) {
    setResults(function (prev) { return prev.concat([r]); });
  }

  function updateResult(id: string, updates: Partial<TestResult>) {
    setResults(function (prev) {
      return prev.map(function (r) {
        if (r.id === id) return { ...r, ...updates };
        return r;
      });
    });
  }

  // ── Run a single test ──
  async function runTest(
    category: string,
    name: string,
    fn: () => Promise<{ ok: boolean; message: string; details?: string; warn?: boolean }>
  ): Promise<TestResult> {
    var id = nextId();
    var r: TestResult = { id: id, name: name, category: category, status: "running", message: "Executando..." };
    addResult(r);
    var t0 = performance.now();
    try {
      var result = await fn();
      var elapsed = performance.now() - t0;
      var updates: Partial<TestResult> = {
        status: result.ok ? (result.warn ? "warn" : "pass") : "fail",
        duration: elapsed,
        message: result.message,
        details: result.details,
      };
      updateResult(id, updates);
      return { ...r, ...updates };
    } catch (e: any) {
      var elapsed2 = performance.now() - t0;
      var updates2: Partial<TestResult> = {
        status: "fail",
        duration: elapsed2,
        message: "Erro: " + (e.message || String(e)).substring(0, 200),
      };
      updateResult(id, updates2);
      return { ...r, ...updates2 };
    }
  }

  // ════════════════════════════════════════════════════════════════
  // TEST RUNNERS — one per category
  // ════════════════════════════════════════════════════════════════

  async function runHealthTests() {
    var BASE = "https://" + projectId + ".supabase.co/functions/v1/make-server-b7b07654";

    await runTest("health", "Edge Function Health Check", async function () {
      var res = await fetch(BASE + "/health", {
        headers: { Authorization: "Bearer " + publicAnonKey },
      });
      if (res.ok) return { ok: true, message: "HTTP " + res.status + " - Edge Function online", details: "URL: " + BASE + "/health" };
      return { ok: false, message: "HTTP " + res.status };
    });

    await runTest("health", "Seed/Database", async function () {
      var r = await api.seedData();
      return { ok: !!r, message: r.seeded ? "Database ja seedada" : "Seed executado", details: JSON.stringify(r) };
    });

    await runTest("health", "Latencia media (3 pings)", async function () {
      var times: number[] = [];
      for (var i = 0; i < 3; i++) {
        var t0 = performance.now();
        await fetch(BASE + "/health", { headers: { Authorization: "Bearer " + publicAnonKey } });
        times.push(performance.now() - t0);
      }
      var avg = times.reduce(function (a, b) { return a + b; }, 0) / times.length;
      var warn = avg > 3000;
      return {
        ok: true,
        warn: warn,
        message: "Media: " + fmtMs(avg) + " (" + times.map(fmtMs).join(", ") + ")",
        details: warn ? "Latencia alta — possivel cold start" : "Latencia aceitavel",
      };
    });
  }

  async function runPublicApiTests() {
    await runTest("public-api", "Homepage Init (combinado)", async function () {
      var d = await api.getHomepageInit();
      var parts: string[] = [];
      if (d.banners) parts.push(d.banners.length + " banners");
      if (d.categoryTree) parts.push(d.categoryTree.length + " categorias");
      if (d.brands) parts.push(d.brands.length + " marcas");
      if (d.promo) parts.push("promo ativa");
      return { ok: true, message: "OK — " + parts.join(", "), details: "Endpoint combinado /homepage-init" };
    });

    await runTest("public-api", "Settings (configuracoes)", async function () {
      var s = await api.getSettings();
      return { ok: !!s.storeName, message: "Loja: " + s.storeName, details: "Email: " + s.email + ", Phone: " + s.phone };
    });

    await runTest("public-api", "Category Tree", async function () {
      var tree = await api.getCategoryTree();
      return { ok: Array.isArray(tree), message: tree.length + " categorias raiz" };
    });

    await runTest("public-api", "Price Config", async function () {
      var c = await api.getPriceConfig();
      return { ok: true, message: "Tier: " + c.tier + ", Show: " + c.showPrice, details: "PIX: " + (c.pixDiscountEnabled ? c.pixDiscountPercent + "%" : "off") };
    });

    await runTest("public-api", "Banners publicos", async function () {
      var b = await api.getBanners();
      return { ok: true, message: b.banners.length + " banners ativos" };
    });

    await runTest("public-api", "Marcas publicas", async function () {
      var b = await api.getBrands();
      return { ok: true, message: b.brands.length + " marcas" };
    });

    await runTest("public-api", "Homepage Categories", async function () {
      var c = await api.getHomepageCategories();
      return { ok: true, message: c.categories.length + " cards de categoria" };
    });

    await runTest("public-api", "FAQ publico", async function () {
      var f = await api.getPublicFaq();
      return { ok: true, message: f.items.length + " perguntas" };
    });

    await runTest("public-api", "Cupons publicos", async function () {
      var c = await api.getPublicCoupons();
      return { ok: true, message: c.coupons.length + " cupons disponiveis" };
    });

    await runTest("public-api", "Promo ativa", async function () {
      var p = await api.getActivePromo();
      if (p.promo) return { ok: true, message: "Promo: " + p.promo.title + " (" + p.promo.products.length + " produtos)" };
      return { ok: true, message: "Nenhuma promo ativa", warn: false };
    });

    await runTest("public-api", "Reels publicos", async function () {
      var r = await api.getReels();
      return { ok: true, message: r.reels.length + " reels" };
    });

    await runTest("public-api", "Influencers publicos", async function () {
      var r = await api.getInfluencers();
      return { ok: true, message: r.influencers.length + " influenciadores" };
    });

    await runTest("public-api", "Filiais publicas", async function () {
      var r = await api.getBranches();
      return { ok: true, message: r.branches.length + " filiais" };
    });

    await runTest("public-api", "Exit Intent Config", async function () {
      var c = await api.getExitIntentConfig();
      return { ok: true, message: "Enabled: " + c.enabled, details: c.enabled ? "Cupom: " + c.couponCode : "" };
    });

    await runTest("public-api", "GA4 Config", async function () {
      var c = await api.getGA4Config();
      return { ok: true, message: "Enabled: " + c.enabled, details: c.enabled ? "ID: " + c.measurementId : "Desabilitado" };
    });

    await runTest("public-api", "Marketing Config", async function () {
      var c = await api.getMarketingConfig();
      var active: string[] = [];
      if (c.gtmEnabled) active.push("GTM");
      if (c.metaPixelEnabled) active.push("Meta");
      if (c.googleAdsEnabled) active.push("GAds");
      if (c.clarityEnabled) active.push("Clarity");
      if (c.tiktokPixelEnabled) active.push("TikTok");
      return { ok: true, message: active.length > 0 ? active.join(", ") + " ativos" : "Nenhum pixel ativo", details: c.gtmEnabled ? "GTM ID: " + c.gtmId : "" };
    });

    await runTest("public-api", "MercadoPago habilitado?", async function () {
      var r = await api.checkMPEnabled();
      return { ok: true, message: "Enabled: " + r.enabled + (r.sandbox ? " (SANDBOX)" : ""), warn: r.sandbox };
    });

    await runTest("public-api", "Google Reviews Config", async function () {
      var c = await api.getGoogleReviewsConfig();
      return { ok: true, message: "Enabled: " + c.enabled, details: c.enabled ? "MerchantId: " + c.merchantId : "" };
    });
  }

  async function runProductTests() {
    await runTest("products", "Catalogo (pagina 1)", async function () {
      var r = await api.getCatalog(1, 24);
      return { ok: r.data.length > 0, message: r.data.length + " produtos, total: " + r.pagination.total, details: r.pagination.totalPages + " paginas" };
    });

    await runTest("products", "Destaques", async function () {
      var r = await api.getDestaques(8);
      return { ok: true, message: r.data.length + " produtos destaque", warn: r.data.length === 0 };
    });

    var firstSku = "";
    await runTest("products", "Busca por termo", async function () {
      var r = await api.getCatalog(1, 5, "filtro");
      firstSku = r.data.length > 0 ? r.data[0].sku : "";
      return { ok: true, message: r.data.length + " resultados para 'filtro'", details: "Total: " + r.pagination.total };
    });

    await runTest("products", "Autocomplete", async function () {
      var r = await api.autocomplete("oleo", 5);
      return { ok: true, message: r.results.length + " sugestoes para 'oleo'", details: r.results.map(function (x) { return x.titulo.substring(0, 30); }).join(", ") };
    });

    // Get a real SKU for further tests
    if (!firstSku) {
      var catalog = await api.getCatalog(1, 1);
      if (catalog.data.length > 0) firstSku = catalog.data[0].sku;
    }

    if (firstSku) {
      await runTest("products", "Detalhe do produto (init)", async function () {
        var r = await api.getProductDetailInit(firstSku);
        var parts: string[] = [];
        if (r.product?.data?.length) parts.push("produto OK");
        if (r.images?.images?.length) parts.push(r.images.images.length + " imagens");
        if (r.price) parts.push("preco: R$" + (r.price.price || 0).toFixed(2));
        if (r.balance) parts.push("estoque: " + (r.balance.quantidade || 0));
        return { ok: true, message: "SKU " + firstSku + " — " + parts.join(", ") };
      });

      await runTest("products", "Product Meta", async function () {
        var r = await api.getProductMeta(firstSku);
        return { ok: true, message: "Visible: " + r.visible + ", Cat: " + (r.category || "N/A"), details: "Brand: " + (r.brand || "N/A") };
      });

      await runTest("products", "Product Attributes", async function () {
        var r = await api.getProductAttributes(firstSku);
        var count = r.attributes ? Object.keys(r.attributes).length : 0;
        return { ok: true, message: r.found ? count + " atributos" : "Sem atributos", warn: !r.found };
      });

      await runTest("products", "Product Images", async function () {
        var r = await api.getProductImages(firstSku);
        return { ok: true, message: r.images.length + " imagens para " + firstSku };
      });

      await runTest("products", "Reviews do produto", async function () {
        var r = await api.getProductReviews(firstSku);
        return { ok: true, message: r.total + " avaliacoes" };
      });

      await runTest("products", "Review Summary", async function () {
        var r = await api.getReviewSummary(firstSku);
        return { ok: true, message: "Media: " + r.averageRating.toFixed(1) + " (" + r.totalReviews + " reviews)" };
      });

      await runTest("products", "Warranty Plans", async function () {
        var r = await api.getProductWarrantyPlans(firstSku);
        return { ok: true, message: r.plans.length + " planos de garantia" };
      });
    } else {
      await runTest("products", "Catalogo vazio", async function () {
        return { ok: false, message: "Nenhum produto encontrado no catalogo" };
      });
    }

    await runTest("products", "Meta Bulk (10 SKUs)", async function () {
      var cat = await api.getCatalog(1, 10);
      if (cat.data.length === 0) return { ok: true, message: "Sem produtos para testar", warn: true };
      var skus = cat.data.map(function (p) { return p.sku; });
      var r = await api.getProductMetaBulk(skus);
      return { ok: true, message: Object.keys(r).length + " metas retornadas" };
    });
  }

  async function runPriceStockTests() {
    var cat = await api.getCatalog(1, 5);
    var skus = cat.data.map(function (p) { return p.sku; });
    if (skus.length === 0) {
      await runTest("prices", "Sem produtos", async function () {
        return { ok: false, message: "Catalogo vazio — impossivel testar precos/estoque" };
      });
      return;
    }

    await runTest("prices", "Preco individual (" + skus[0] + ")", async function () {
      var r = await api.getProductPriceSafe(skus[0]);
      if (r.source === "error") return { ok: false, message: "Erro ao buscar preco" };
      return { ok: true, message: "Source: " + r.source + ", Preco: R$" + (r.price || 0).toFixed(2), details: "v1=" + r.v1 + " v2=" + r.v2 + " v3=" + r.v3 };
    });

    await runTest("prices", "Precos bulk (" + skus.length + " SKUs)", async function () {
      var r = await api.getProductPricesBulkSafe(skus);
      var found = r.results.filter(function (p) { return p.found; }).length;
      return { ok: true, message: found + "/" + skus.length + " precos encontrados", warn: found === 0 };
    });

    await runTest("prices", "Saldo individual (" + skus[0] + ")", async function () {
      var r = await api.getProductBalance(skus[0]);
      return { ok: true, message: "Qtd: " + (r.quantidade || 0) + ", Disponivel: " + (r.disponivel || 0), details: "Found: " + r.found + ", SIGE: " + r.sige };
    });

    await runTest("prices", "Saldos bulk (" + skus.length + " SKUs)", async function () {
      var r = await api.getProductBalances(skus);
      var withStock = r.results.filter(function (b) { return (b.quantidade || 0) > 0; }).length;
      return { ok: true, message: withStock + "/" + r.results.length + " com estoque > 0" };
    });

    await runTest("prices", "Stock Summary", async function () {
      var r = await api.getStockSummary();
      return { ok: true, message: "Total: " + r.totalProducts + ", Em estoque: " + r.inStock + ", Sem: " + r.outOfStock, details: "Cached: " + r.cached };
    });

    await runTest("prices", "Review Summaries Batch", async function () {
      var r = await api.getReviewSummariesBatch(skus);
      var count = Object.keys(r.summaries).length;
      return { ok: true, message: count + " summaries retornados" };
    });
  }

  async function runImageTests() {
    await runTest("images", "Logo principal", async function () {
      var r = await api.getLogo();
      return { ok: true, message: r.hasLogo ? "Logo encontrado" : "Sem logo", details: r.url || "N/A", warn: !r.hasLogo };
    });

    await runTest("images", "Footer Logo", async function () {
      var r = await api.getFooterLogo();
      return { ok: true, message: r.hasLogo ? "Footer logo encontrado" : "Sem footer logo", warn: !r.hasLogo };
    });

    await runTest("images", "Favicon", async function () {
      var r = await api.getFavicon();
      return { ok: true, message: r.hasFavicon ? "Favicon encontrado" : "Sem favicon", warn: !r.hasFavicon };
    });

    await runTest("images", "Product Image URL builder", async function () {
      var cat = await api.getCatalog(1, 1);
      if (cat.data.length === 0) return { ok: true, message: "Sem produtos para testar", warn: true };
      var url = api.getProductMainImageUrl(cat.data[0].sku);
      var res = await fetch(url, { method: "HEAD" }).catch(function () { return null; });
      if (res && res.ok) return { ok: true, message: "Imagem acessivel: " + cat.data[0].sku };
      return { ok: true, message: "Imagem nao encontrada (produto sem foto)", warn: true, details: url };
    });
  }

  async function runShippingTests() {
    await runTest("shipping", "CEP Lookup (01001000)", async function () {
      var r = await api.lookupCep("01001000");
      if (r.error) return { ok: false, message: "Erro: " + r.error };
      return { ok: true, message: r.localidade + "/" + r.uf, details: r.logradouro || "" };
    });

    await runTest("shipping", "CEP Lookup (88015100)", async function () {
      var r = await api.lookupCep("88015100");
      return { ok: !r.error, message: r.localidade ? r.localidade + "/" + r.uf : "Erro: " + r.error };
    });

    await runTest("shipping", "Calculo de frete (SP)", async function () {
      var cat = await api.getCatalog(1, 1);
      if (cat.data.length === 0) return { ok: true, message: "Sem produtos para testar frete", warn: true };
      var items = [{ sku: cat.data[0].sku, quantity: 1 }];
      try {
        var r = await api.calculateShipping("01001000", items, 100);
        if (r.error) return { ok: false, message: "Erro: " + r.error };
        return { ok: true, message: r.options.length + " opcoes de frete", details: r.options.map(function (o) { return o.carrierName + ": R$" + o.price.toFixed(2); }).join(", ") };
      } catch (e: any) {
        return { ok: false, message: e.message || "Erro no calculo" };
      }
    });

    await runTest("shipping", "CEP invalido (00000000)", async function () {
      try {
        var r = await api.lookupCep("00000000");
        // Should fail gracefully
        return { ok: true, message: r.error ? "Erro tratado corretamente" : "Retornou dados inesperados", warn: !r.error };
      } catch (e: any) {
        // request() throws on non-2xx — an error for invalid CEP is expected behavior
        var msg = e.message || String(e);
        var isExpected = /n.o encontrado|invalido|not found/i.test(msg);
        return { ok: isExpected, message: isExpected ? "Erro tratado corretamente (throw): " + msg : "Erro inesperado: " + msg };
      }
    });
  }

  async function runFrontendTests() {
    var ROUTES = [
      { path: "CatalogPage", fn: function () { return import("../CatalogPage"); } },
      { path: "ProductDetailPage", fn: function () { return import("../ProductDetailPage"); } },
      { path: "ContactPage", fn: function () { return import("../ContactPage"); } },
      { path: "AboutPage", fn: function () { return import("../AboutPage"); } },
      { path: "UserAuthPage", fn: function () { return import("../UserAuthPage"); } },
      { path: "UserAccountPage", fn: function () { return import("../UserAccountPage"); } },
      { path: "CheckoutPage", fn: function () { return import("../CheckoutPage"); } },
      { path: "PrivacyPolicyPage", fn: function () { return import("../PrivacyPolicyPage"); } },
      { path: "TermsPage", fn: function () { return import("../TermsPage"); } },
      { path: "LgpdRightsPage", fn: function () { return import("../LgpdRightsPage"); } },
      { path: "AffiliatePage", fn: function () { return import("../AffiliatePage"); } },
      { path: "CouponsPage", fn: function () { return import("../CouponsPage"); } },
      { path: "FaqPage", fn: function () { return import("../FaqPage"); } },
      { path: "BrandPage", fn: function () { return import("../BrandPage"); } },
      { path: "TrackingPage", fn: function () { return import("../TrackingPage"); } },
      { path: "NotFoundPage", fn: function () { return import("../NotFoundPage"); } },
      { path: "UserResetPasswordPage", fn: function () { return import("../UserResetPasswordPage"); } },
      { path: "HomePage", fn: function () { return import("../HomePage"); } },
    ];

    for (var i = 0; i < ROUTES.length; i++) {
      var route = ROUTES[i];
      await runTest("frontend", "Lazy: " + route.path, async function () {
        var t0 = performance.now();
        var mod = await route.fn();
        var elapsed = performance.now() - t0;
        var exported = Object.keys(mod);
        return { ok: exported.length > 0, message: "OK (" + fmtMs(elapsed) + ")", details: "Exports: " + exported.join(", ") };
      });
    }

    var COMPONENTS = [
      { name: "Header", fn: function () { return import("../../components/Header"); } },
      { name: "Footer", fn: function () { return import("../../components/Footer"); } },
      { name: "ProductCard", fn: function () { return import("../../components/ProductCard"); } },
      { name: "CartDrawer", fn: function () { return import("../../components/CartDrawer"); } },
      { name: "PriceBadge", fn: function () { return import("../../components/PriceBadge"); } },
      { name: "StockBadge", fn: function () { return import("../../components/StockBadge"); } },
      { name: "StockBar", fn: function () { return import("../../components/StockBar"); } },
      { name: "WishlistButton", fn: function () { return import("../../components/WishlistButton"); } },
      { name: "OptimizedImage", fn: function () { return import("../../components/OptimizedImage"); } },
      { name: "ProductImage", fn: function () { return import("../../components/ProductImage"); } },
      { name: "SearchAutocomplete", fn: function () { return import("../../components/SearchAutocomplete"); } },
      { name: "CategoryMegaMenu", fn: function () { return import("../../components/CategoryMegaMenu"); } },
      { name: "ShippingCalculator", fn: function () { return import("../../components/ShippingCalculator"); } },
      { name: "ProductReviews", fn: function () { return import("../../components/ProductReviews"); } },
      { name: "ShareButtons", fn: function () { return import("../../components/ShareButtons"); } },
      { name: "CookieConsentBanner", fn: function () { return import("../../components/CookieConsentBanner"); } },
      { name: "ErrorBoundary", fn: function () { return import("../../components/ErrorBoundary"); } },
      { name: "BrandCarousel", fn: function () { return import("../../components/BrandCarousel"); } },
      { name: "CouponCarousel", fn: function () { return import("../../components/CouponCarousel"); } },
      { name: "MobileBottomNav", fn: function () { return import("../../components/MobileBottomNav"); } },
      { name: "WhatsAppButton", fn: function () { return import("../../components/WhatsAppButton"); } },
      { name: "ScrollToTopButton", fn: function () { return import("../../components/ScrollToTopButton"); } },
      { name: "ExitIntentPopup", fn: function () { return import("../../components/ExitIntentPopup"); } },
      { name: "SuperPromoSection", fn: function () { return import("../../components/SuperPromoSection"); } },
      { name: "RecentlyViewedSection", fn: function () { return import("../../components/RecentlyViewedSection"); } },
      { name: "VirtualProductGrid", fn: function () { return import("../../components/VirtualProductGrid"); } },
    ];

    for (var j = 0; j < COMPONENTS.length; j++) {
      var comp = COMPONENTS[j];
      await runTest("frontend", "Comp: " + comp.name, async function () {
        var mod = await comp.fn();
        var exported = Object.keys(mod);
        return { ok: exported.length > 0, message: "Importado OK", details: "Exports: " + exported.join(", ") };
      });
    }

    // Admin pages
    var ADMIN_PAGES = [
      { name: "AdminPage", fn: function () { return import("./AdminPage"); } },
      { name: "AdminDashboard", fn: function () { return import("./AdminDashboard"); } },
      { name: "AdminOrders", fn: function () { return import("./AdminOrders"); } },
      { name: "AdminProducts", fn: function () { return import("./AdminProducts"); } },
      { name: "AdminCategories", fn: function () { return import("./AdminCategories"); } },
      { name: "AdminClients", fn: function () { return import("./AdminClients"); } },
      { name: "AdminCoupons", fn: function () { return import("./AdminCoupons"); } },
      { name: "AdminBanners", fn: function () { return import("./AdminBanners"); } },
      { name: "AdminBrands", fn: function () { return import("./AdminBrands"); } },
      { name: "AdminSettings", fn: function () { return import("./AdminSettings"); } },
      { name: "AdminShipping", fn: function () { return import("./AdminShipping"); } },
      { name: "AdminReviews", fn: function () { return import("./AdminReviews"); } },
      { name: "AdminWarranty", fn: function () { return import("./AdminWarranty"); } },
      { name: "AdminAffiliates", fn: function () { return import("./AdminAffiliates"); } },
      { name: "AdminEmailMarketing", fn: function () { return import("./AdminEmailMarketing"); } },
      { name: "AdminAuditLog", fn: function () { return import("./AdminAuditLog"); } },
      { name: "AdminLgpdRequests", fn: function () { return import("./AdminLgpdRequests"); } },
      { name: "AdminFaq", fn: function () { return import("./AdminFaq"); } },
      { name: "AdminReels", fn: function () { return import("./AdminReels"); } },
      { name: "AdminInfluencers", fn: function () { return import("./AdminInfluencers"); } },
      { name: "AdminBranches", fn: function () { return import("./AdminBranches"); } },
      { name: "AdminApiSige", fn: function () { return import("./AdminApiSige"); } },
      { name: "AdminPagHiper", fn: function () { return import("./AdminPagHiper"); } },
      { name: "AdminMercadoPago", fn: function () { return import("./AdminMercadoPago"); } },
      { name: "AdminGA4", fn: function () { return import("./AdminGA4"); } },
      { name: "AdminSisfreteWT", fn: function () { return import("./AdminSisfreteWT"); } },
      { name: "AdminWhatsApp", fn: function () { return import("./AdminWhatsApp"); } },
      { name: "AdminAttributes", fn: function () { return import("./AdminAttributes"); } },
      { name: "AdminDimensions", fn: function () { return import("./AdminDimensions"); } },
      { name: "AdminAutoCateg", fn: function () { return import("./AdminAutoCateg"); } },
      { name: "AdminHomepageCategories", fn: function () { return import("./AdminHomepageCategories"); } },
      { name: "AdminMidBanners", fn: function () { return import("./AdminMidBanners"); } },
      { name: "AdminFooterBadges", fn: function () { return import("./AdminFooterBadges"); } },
      { name: "AdminSuperPromo", fn: function () { return import("./AdminSuperPromo"); } },
      { name: "AdminAdmins", fn: function () { return import("./AdminAdmins"); } },
      { name: "AdminMarketing", fn: function () { return import("./AdminMarketing"); } },
      { name: "AdminExitIntent", fn: function () { return import("./AdminExitIntent"); } },
      { name: "AdminInfrastructure", fn: function () { return import("./AdminInfrastructure"); } },
    ];

    for (var k = 0; k < ADMIN_PAGES.length; k++) {
      var ap = ADMIN_PAGES[k];
      await runTest("frontend", "Admin: " + ap.name, async function () {
        var mod = await ap.fn();
        return { ok: Object.keys(mod).length > 0, message: "Importado OK" };
      });
    }
  }

  async function runAuthTests() {
    await runTest("auth", "Pre-login check (rate limit)", async function () {
      var r = await api.preLoginCheck("test@example.com");
      return { ok: !!r.ok || !!r.error, message: r.ok ? "OK — sem lockout" : "Resposta: " + (r.error || "locked"), details: r.locked ? "Conta bloqueada" : "" };
    });

    await runTest("auth", "Signup availability check", async function () {
      var r = await api.checkSignupAvailability({ email: "test-nonexistent@example.com" });
      return { ok: true, message: "emailTaken: " + r.emailTaken };
    });

    await runTest("auth", "CAPTCHA site key", async function () {
      var r = await api.getCaptchaSiteKey();
      return { ok: !!r.siteKey, message: r.siteKey ? "Key: " + r.siteKey.substring(0, 20) + "..." : "Sem key" };
    });

    await runTest("auth", "CNPJ Lookup (00000000000191 - BRF)", async function () {
      try {
        var r = await api.cnpjLookup("00000000000191");
        return { ok: !!r.razaoSocial, message: r.razaoSocial || "Nao encontrado", details: r.situacao || "" };
      } catch (e: any) {
        return { ok: false, message: e.message };
      }
    });
  }

  async function runAdminCoreTests() {
    var at = await getToken();
    if (!at) {
      await runTest("admin-core", "Sem token de admin", async function () {
        return { ok: false, message: "Token de admin nao disponivel. Faca login como admin primeiro." };
      });
      return;
    }

    await runTest("admin-core", "Check Admin", async function () {
      var r = await api.checkAdmin(at);
      return { ok: r.isAdmin, message: "Admin: " + r.isAdmin + ", Master: " + (r.isMaster || false), details: "Email: " + (r.email || "N/A") };
    });

    await runTest("admin-core", "Dashboard Stats", async function () {
      var r = await api.getDashboardStats(at);
      return { ok: true, message: "Pedidos: " + r.totalOrders + ", Receita: R$" + r.totalRevenue.toFixed(2) + ", Clientes: " + r.totalClients };
    });

    await runTest("admin-core", "Pending Counts", async function () {
      var r = await api.getAdminPendingCounts(at);
      return { ok: true, message: "Pedidos pagos: " + r.orders.paid + ", Reviews: " + r.reviews + ", LGPD: " + r.lgpd };
    });

    await runTest("admin-core", "Admin Orders", async function () {
      var r = await api.adminGetOrders(at);
      return { ok: true, message: r.total + " pedidos no sistema" };
    });

    await runTest("admin-core", "Admin Clients", async function () {
      var r = await api.getAdminClients(at);
      return { ok: true, message: r.total + " clientes registrados" };
    });

    await runTest("admin-core", "Admin List", async function () {
      var r = await api.getAdminList(at);
      return { ok: true, message: r.admins.length + " admins, " + r.allTabs.length + " abas disponiveis" };
    });

    await runTest("admin-core", "Audit Logs", async function () {
      var r = await api.getAuditLogs(at);
      return { ok: true, message: r.total + " entradas de auditoria" };
    });

    await runTest("admin-core", "Settings (admin)", async function () {
      var s = await api.getSettings();
      return { ok: true, message: "Modo manutencao: " + s.maintenanceMode + ", Catalogo: " + s.catalogMode };
    });
  }

  async function runAdminContentTests() {
    var at = await getToken();
    if (!at) return;

    await runTest("admin-content", "Admin Banners", async function () {
      var r = await api.getAdminBanners(at);
      return { ok: true, message: r.banners.length + " banners totais (ativos + inativos)" };
    });

    await runTest("admin-content", "Admin Promo", async function () {
      var r = await api.getAdminPromo(at);
      if (r.promo) return { ok: true, message: "Promo: " + r.promo.title + " (" + r.promo.products.length + " produtos)" };
      return { ok: true, message: "Nenhuma promo configurada" };
    });

    await runTest("admin-content", "Homepage Categories (admin)", async function () {
      var c = await api.getHomepageCategories();
      return { ok: true, message: c.categories.length + " cards" };
    });

    await runTest("admin-content", "Mid Banners", async function () {
      var r = await api.getMidBanners(at);
      return { ok: true, message: r.banners.length + " slots de mid-banner" };
    });

    await runTest("admin-content", "Footer Badges", async function () {
      var r = await api.getFooterBadges(at);
      return { ok: true, message: r.badges.length + " badges no footer" };
    });

    await runTest("admin-content", "Admin Reels", async function () {
      var r = await api.getAdminReels(at);
      return { ok: true, message: r.reels.length + " reels totais" };
    });

    await runTest("admin-content", "Admin Influencers", async function () {
      var r = await api.getAdminInfluencers(at);
      return { ok: true, message: r.influencers.length + " influenciadores" };
    });

    await runTest("admin-content", "Admin Branches", async function () {
      var r = await api.getAdminBranches(at);
      return { ok: true, message: r.branches.length + " filiais" };
    });

    await runTest("admin-content", "Admin FAQ", async function () {
      var r = await api.getAdminFaq(at);
      return { ok: true, message: r.total + " perguntas" };
    });

    await runTest("admin-content", "All Attributes", async function () {
      var r = await api.getAllAttributes();
      return { ok: true, message: r.total + " produtos com atributos" };
    });

    await runTest("admin-content", "SIGE Mappings", async function () {
      var r = await api.getSigeMappings();
      return { ok: true, message: r.total + " mapeamentos SKU/SIGE" };
    });

    await runTest("admin-content", "Custom Prices", async function () {
      var r = await api.getCustomPrices(at);
      return { ok: true, message: r.total + " precos customizados" };
    });

    await runTest("admin-content", "Physical Bulk List", async function () {
      var r = await api.getPhysicalBulkList(at);
      var items = r && Array.isArray(r.items) ? r.items : [];
      return { ok: true, message: items.length + " produtos com dados fisicos", warn: !r || !Array.isArray(r.items) };
    });

    await runTest("admin-content", "Meta All Compact", async function () {
      var r = await api.getMetaAllCompact(at);
      return { ok: true, message: r.items.length + " metas compactas" };
    });
  }

  async function runSigeTests() {
    var at = await getToken();
    if (!at) return;

    await runTest("sige", "SIGE Status", async function () {
      var r = await api.sigeGetStatus(at);
      return { ok: r.configured, message: "Configured: " + r.configured + ", Token: " + r.hasToken + ", Expired: " + r.expired, warn: r.expired };
    });

    await runTest("sige", "SIGE Config", async function () {
      var r = await api.sigeGetConfig(at);
      return { ok: !!r.baseUrl, message: "URL: " + (r.baseUrl || "N/A") + ", Email: " + (r.email || "N/A") };
    });

    await runTest("sige", "SIGE Connect", async function () {
      try {
        var r = await api.sigeConnect(at);
        return { ok: r.connected, message: "Connected: " + r.connected + ", Token: " + r.hasToken, details: "Expira: " + r.expiresAt };
      } catch (e: any) {
        return { ok: false, message: e.message, warn: true };
      }
    });

    await runTest("sige", "SIGE Situations", async function () {
      try {
        var r = await api.sigeListSituations(at);
        return { ok: true, message: r.total + " situacoes encontradas" };
      } catch (e: any) {
        return { ok: false, message: e.message };
      }
    });

    await runTest("sige", "Sync Customer Status", async function () {
      var r = await api.sigeSyncCustomerStatus(at);
      return { ok: true, message: JSON.stringify(r).substring(0, 150) };
    });
  }

  async function runPaymentTests() {
    var at = await getToken();
    if (!at) return;

    await runTest("payments", "PagHiper Config", async function () {
      var r = await api.getPagHiperConfig(at);
      return { ok: true, message: "Configured: " + r.configured, details: r.hasApiKey ? "API Key presente" : "Sem API Key", warn: !r.configured };
    });

    await runTest("payments", "PagHiper Transactions", async function () {
      var r = await api.getPagHiperTransactions(at);
      return { ok: true, message: r.total + " transacoes" };
    });

    await runTest("payments", "MercadoPago Config", async function () {
      var r = await api.getMercadoPagoConfig(at);
      return { ok: true, message: "Configured: " + r.configured + (r.sandbox ? " (SANDBOX)" : ""), warn: !r.configured };
    });

    await runTest("payments", "MercadoPago Test Connection", async function () {
      try {
        var r = await api.testMercadoPagoConnection(at);
        if (r.success) return { ok: true, message: "Conectado: " + (r.user?.email || "OK") };
        // Not configured is expected — warn instead of fail
        var notConfigured = /n.o configurado|not configured/i.test(r.error || "");
        return { ok: notConfigured, message: r.error || "Falha na conexao", warn: notConfigured };
      } catch (e: any) {
        var msg = e.message || String(e);
        var notCfg = /n.o configurado|not configured/i.test(msg);
        return { ok: notCfg, message: msg, warn: notCfg };
      }
    });

    await runTest("payments", "MercadoPago Transactions", async function () {
      var r = await api.getMPTransactions(at);
      return { ok: true, message: r.transactions.length + " transacoes MP" };
    });

    await runTest("payments", "Shipping Config", async function () {
      var r = await api.getShippingConfig(at);
      return { ok: true, message: "CEP origem: " + r.originCep + ", " + r.carriers.length + " transportadoras, Mode: " + (r.calcMode || "manual") };
    });

    await runTest("payments", "Shipping Tables", async function () {
      var r = await api.getShippingTables(at);
      return { ok: true, message: r.tables.length + " tabelas de frete" };
    });
  }

  async function runMarketingTests() {
    var at = await getToken();
    if (!at) return;

    await runTest("marketing", "Admin Coupons", async function () {
      var r = await api.getAdminCoupons(at);
      var active = r.coupons.filter(function (c) { return c.active; }).length;
      return { ok: true, message: r.coupons.length + " cupons (" + active + " ativos)" };
    });

    await runTest("marketing", "Validate Coupon (inexistente)", async function () {
      var r = await api.validateCoupon("TESTE_INVALIDO_123", 100);
      return { ok: true, message: r.valid ? "Cupom valido (inesperado)" : "Corretamente rejeitado: " + (r.error || "invalido") };
    });

    await runTest("marketing", "Email Marketing Config", async function () {
      var r = await api.getEmktConfig(at);
      return { ok: true, message: "SMTP: " + (r.smtpConfigured ? r.smtpHost : "nao configurado"), warn: !r.smtpConfigured };
    });

    await runTest("marketing", "Email Subscribers", async function () {
      var r = await api.getEmktSubscribers(at);
      return { ok: true, message: r.total + " assinantes" };
    });

    await runTest("marketing", "Email Templates", async function () {
      var r = await api.getEmktTemplates(at);
      return { ok: true, message: r.templates.length + " templates" };
    });

    await runTest("marketing", "Email Campaigns", async function () {
      var r = await api.getEmktCampaigns(at);
      return { ok: true, message: r.campaigns.length + " campanhas" };
    });

    await runTest("marketing", "Email Send Logs", async function () {
      var r = await api.getEmktSendLogs(at);
      return { ok: true, message: r.logs.length + " logs de envio" };
    });

    await runTest("marketing", "Affiliate Config", async function () {
      var r = await api.adminGetAffiliateConfig(at);
      return { ok: true, message: "Enabled: " + r.config.enabled + ", Comissao: " + r.config.commissionPercent + "%" };
    });

    await runTest("marketing", "Affiliates List", async function () {
      var r = await api.adminGetAffiliates(at);
      return { ok: true, message: r.total + " afiliados" };
    });

    await runTest("marketing", "WhatsApp Config", async function () {
      var r = await api.getWhatsAppConfig(at);
      return { ok: true, message: "Enabled: " + r.enabled + ", Provider: " + r.provider, warn: !r.enabled };
    });

    await runTest("marketing", "Abandoned Carts", async function () {
      var r = await api.getAbandonedCarts(at);
      return { ok: true, message: r.carts.length + " carrinhos abandonados" };
    });

    await runTest("marketing", "Exit Intent Leads", async function () {
      var r = await api.getExitIntentLeads(at);
      return { ok: true, message: r.leads.length + " leads capturados" };
    });
  }

  async function runReviewTests() {
    var at = await getToken();
    if (!at) return;

    await runTest("reviews", "Admin Reviews (all)", async function () {
      var r = await api.getAdminReviews(at);
      return { ok: true, message: r.total + " reviews totais" };
    });

    await runTest("reviews", "Admin Review Stats", async function () {
      var r = await api.getAdminReviewStats(at);
      return { ok: true, message: "Pending: " + r.pending + ", Approved: " + r.approved + ", Rejected: " + r.rejected + ", Images: " + r.totalImages };
    });

    await runTest("reviews", "Warranty Plans (admin)", async function () {
      var r = await api.getAdminWarrantyPlans(at);
      var active = r.plans.filter(function (p) { return p.active; }).length;
      return { ok: true, message: r.plans.length + " planos (" + active + " ativos)" };
    });
  }

  async function runAdvancedTests() {
    var at = await getToken();
    if (!at) return;

    await runTest("advanced", "LGPD Requests", async function () {
      var r = await api.getAdminLgpdRequests(at);
      var pending = r.requests.filter(function (x) { return x.status === "pending"; }).length;
      return { ok: true, message: r.total + " solicitacoes (" + pending + " pendentes)" };
    });

    await runTest("advanced", "SisFrete WT Config", async function () {
      try {
        var r = await api.sisfreteWTGetConfig(at);
        return { ok: true, message: "Enabled: " + r.enabled, details: r.enabled ? "Canal: " + r.canalVenda : "" };
      } catch (e: any) {
        return { ok: false, message: e.message, warn: true };
      }
    });

    await runTest("advanced", "SisFrete WT Sent Orders", async function () {
      try {
        var r = await api.sisfreteWTGetSentOrders(at);
        return { ok: true, message: r.total + " pedidos enviados" };
      } catch (e: any) {
        return { ok: false, message: e.message };
      }
    });

    await runTest("advanced", "SisFrete Delivery Config", async function () {
      try {
        var r = await api.sisfreteDeliveryGetConfig(at);
        return { ok: true, message: "Enabled: " + r.enabled };
      } catch (e: any) {
        return { ok: false, message: e.message, warn: true };
      }
    });

    await runTest("advanced", "Auto-Categorize Data", async function () {
      var r = await api.getAutoCategData(at);
      return { ok: true, message: r.products.length + " produtos, " + r.categoryTree.length + " categorias, " + Object.keys(r.metas).length + " metas" };
    });

    await runTest("advanced", "SIGE API Docs", async function () {
      var r = await api.getApiDocs(at);
      return { ok: true, message: r.found ? r.sections.length + " secoes (" + r.size + " bytes)" : "Sem docs salvos", warn: !r.found };
    });
  }

  // ════════════════════════════════════════════════════════════════
  // MASTER RUN FUNCTION
  // ════════════════════════════════════════════════════════════════

  var runAllTests = useCallback(async function () {
    setRunning(true);
    setResults([]);
    _testIdCounter = 0;
    startTimeRef.current = performance.now();

    try {
      await runHealthTests();
      await runPublicApiTests();
      await runProductTests();
      await runPriceStockTests();
      await runImageTests();
      await runShippingTests();
      await runFrontendTests();
      await runAuthTests();
      await runAdminCoreTests();
      await runAdminContentTests();
      await runSigeTests();
      await runPaymentTests();
      await runMarketingTests();
      await runReviewTests();
      await runAdvancedTests();
    } catch (e) {
      console.error("[TestRunner] Fatal:", e);
    }

    setTotalTime(performance.now() - startTimeRef.current);
    setRunning(false);
    setRunningCategory(null);
  }, []);

  var runCategoryTests = useCallback(async function (catKey: string) {
    setRunning(true);
    setRunningCategory(catKey);
    _testIdCounter = 0;
    // Remove previous results for this category
    setResults(function (prev) { return prev.filter(function (r) { return r.category !== catKey; }); });
    startTimeRef.current = performance.now();

    try {
      switch (catKey) {
        case "health": await runHealthTests(); break;
        case "public-api": await runPublicApiTests(); break;
        case "products": await runProductTests(); break;
        case "prices": await runPriceStockTests(); break;
        case "images": await runImageTests(); break;
        case "shipping": await runShippingTests(); break;
        case "frontend": await runFrontendTests(); break;
        case "auth": await runAuthTests(); break;
        case "admin-core": await runAdminCoreTests(); break;
        case "admin-content": await runAdminContentTests(); break;
        case "sige": await runSigeTests(); break;
        case "payments": await runPaymentTests(); break;
        case "marketing": await runMarketingTests(); break;
        case "reviews": await runReviewTests(); break;
        case "advanced": await runAdvancedTests(); break;
      }
    } catch (e) {
      console.error("[TestRunner] Error in " + catKey + ":", e);
    }

    setTotalTime(performance.now() - startTimeRef.current);
    setRunning(false);
    setRunningCategory(null);
  }, []);

  // ── Computed stats ──
  var stats = useMemo(function () {
    var pass = 0, fail = 0, warn = 0, skip = 0, total = results.length;
    for (var i = 0; i < results.length; i++) {
      if (results[i].status === "pass") pass++;
      else if (results[i].status === "fail") fail++;
      else if (results[i].status === "warn") warn++;
      else if (results[i].status === "skip") skip++;
    }
    return { pass: pass, fail: fail, warn: warn, skip: skip, total: total };
  }, [results]);

  var categoryStats = useMemo(function () {
    var map: Record<string, { pass: number; fail: number; warn: number; total: number }> = {};
    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      if (!map[r.category]) map[r.category] = { pass: 0, fail: 0, warn: 0, total: 0 };
      map[r.category].total++;
      if (r.status === "pass") map[r.category].pass++;
      else if (r.status === "fail") map[r.category].fail++;
      else if (r.status === "warn") map[r.category].warn++;
    }
    return map;
  }, [results]);

  var filteredResults = useMemo(function () {
    var filtered = results;
    if (filterStatus !== "all") {
      filtered = filtered.filter(function (r) { return r.status === filterStatus; });
    }
    if (searchQuery.trim()) {
      var q = searchQuery.toLowerCase();
      filtered = filtered.filter(function (r) {
        return r.name.toLowerCase().indexOf(q) >= 0 || r.category.toLowerCase().indexOf(q) >= 0 || (r.message || "").toLowerCase().indexOf(q) >= 0;
      });
    }
    return filtered;
  }, [results, filterStatus, searchQuery]);

  var groupedResults = useMemo(function () {
    var groups: Record<string, TestResult[]> = {};
    for (var i = 0; i < filteredResults.length; i++) {
      var cat = filteredResults[i].category;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(filteredResults[i]);
    }
    return groups;
  }, [filteredResults]);

  // ── Export results ──
  function exportResults() {
    var lines = ["Teste de Regressao Completo — " + new Date().toLocaleString("pt-BR"), ""];
    lines.push("Total: " + stats.total + " | Pass: " + stats.pass + " | Fail: " + stats.fail + " | Warn: " + stats.warn);
    lines.push("Tempo total: " + fmtMs(totalTime));
    lines.push("═".repeat(80));
    var cats = Object.keys(groupedResults);
    for (var i = 0; i < cats.length; i++) {
      var catResults = groupedResults[cats[i]];
      lines.push("\n[" + cats[i].toUpperCase() + "] (" + catResults.length + " testes)");
      for (var j = 0; j < catResults.length; j++) {
        var r = catResults[j];
        var icon = r.status === "pass" ? "OK" : r.status === "fail" ? "FAIL" : r.status === "warn" ? "WARN" : r.status;
        lines.push("  [" + icon + "] " + r.name + (r.duration ? " (" + fmtMs(r.duration) + ")" : ""));
        if (r.message) lines.push("       " + r.message);
        if (r.details) lines.push("       > " + r.details);
      }
    }
    var blob = new Blob([lines.join("\n")], { type: "text/plain" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "regression-test-" + new Date().toISOString().slice(0, 10) + ".txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyResults() {
    var lines: string[] = [];
    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      var icon = r.status === "pass" ? "✓" : r.status === "fail" ? "✗" : "⚠";
      lines.push(icon + " [" + r.category + "] " + r.name + " — " + (r.message || ""));
    }
    navigator.clipboard.writeText(lines.join("\n")).catch(function () {});
  }

  function toggleSection(key: string) {
    setExpandedSections(function (prev) {
      var next = { ...prev };
      next[key] = !prev[key];
      return next;
    });
  }

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-gray-900 flex items-center gap-2" style={{ fontSize: "1.3rem", fontWeight: 700 }}>
            <FileCheck className="w-6 h-6 text-red-600" />
            Teste Completo do Sistema
          </h1>
          <p className="text-gray-500 mt-1" style={{ fontSize: "0.82rem" }}>
            {CATEGORIES.length} categorias — APIs, frontend, pagamentos, SIGE, marketing e mais
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={runAllTests}
          disabled={running}
          className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-xl transition-colors"
          style={{ fontSize: "0.9rem", fontWeight: 600 }}
        >
          {running && !runningCategory ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Executando TODOS...</>
          ) : (
            <><Play className="w-4 h-4" /> Executar TODOS os Testes</>
          )}
        </button>
        {stats.total > 0 && (
          <>
            <button onClick={exportResults} className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors" style={{ fontSize: "0.8rem" }}>
              <Download className="w-3.5 h-3.5" /> Exportar
            </button>
            <button onClick={copyResults} className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors" style={{ fontSize: "0.8rem" }}>
              <Copy className="w-3.5 h-3.5" /> Copiar
            </button>
            <button onClick={function () { setResults([]); setTotalTime(0); }} className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors" style={{ fontSize: "0.8rem" }}>
              <RotateCcw className="w-3.5 h-3.5" /> Limpar
            </button>
          </>
        )}
      </div>

      {/* Stats bar */}
      {stats.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-gray-800" style={{ fontSize: "1.3rem", fontWeight: 700 }}>{stats.total}</p>
            <p className="text-gray-500" style={{ fontSize: "0.72rem" }}>Total</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3 text-center">
            <p className="text-green-600" style={{ fontSize: "1.3rem", fontWeight: 700 }}>{stats.pass}</p>
            <p className="text-green-600" style={{ fontSize: "0.72rem" }}>Passou</p>
          </div>
          <div className="bg-red-50 rounded-lg p-3 text-center">
            <p className="text-red-500" style={{ fontSize: "1.3rem", fontWeight: 700 }}>{stats.fail}</p>
            <p className="text-red-500" style={{ fontSize: "0.72rem" }}>Falhou</p>
          </div>
          <div className="bg-amber-50 rounded-lg p-3 text-center">
            <p className="text-amber-500" style={{ fontSize: "1.3rem", fontWeight: 700 }}>{stats.warn}</p>
            <p className="text-amber-500" style={{ fontSize: "0.72rem" }}>Aviso</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-3 text-center">
            <p className="text-blue-600" style={{ fontSize: "1.3rem", fontWeight: 700 }}>{fmtMs(totalTime)}</p>
            <p className="text-blue-600" style={{ fontSize: "0.72rem" }}>Tempo</p>
          </div>
        </div>
      )}

      {/* Category cards — run individual categories */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {CATEGORIES.map(function (cat) {
          var cs = categoryStats[cat.key];
          var hasFails = cs && cs.fail > 0;
          var allPass = cs && cs.total > 0 && cs.fail === 0 && cs.warn === 0;
          var border = hasFails ? "border-red-200 bg-red-50/30" : allPass ? "border-green-200 bg-green-50/30" : "border-gray-200";

          return (
            <div key={cat.key} className={"rounded-xl border p-4 " + border}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <cat.icon className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-800" style={{ fontSize: "0.85rem", fontWeight: 600 }}>{cat.label}</span>
                </div>
                {cs && (
                  <div className="flex items-center gap-1.5" style={{ fontSize: "0.68rem" }}>
                    {cs.pass > 0 && <span className="text-green-600">{cs.pass}✓</span>}
                    {cs.fail > 0 && <span className="text-red-500">{cs.fail}✗</span>}
                    {cs.warn > 0 && <span className="text-amber-500">{cs.warn}⚠</span>}
                  </div>
                )}
              </div>
              <p className="text-gray-400 mb-3" style={{ fontSize: "0.72rem" }}>{cat.description}</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={function () { runCategoryTests(cat.key); }}
                  disabled={running}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white rounded-lg transition-colors"
                  style={{ fontSize: "0.75rem", fontWeight: 500 }}
                >
                  {running && runningCategory === cat.key ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Play className="w-3 h-3" />
                  )}
                  Testar
                </button>
                {cat.requiresAuth && !getAdminToken() && (
                  <span className="text-amber-500" style={{ fontSize: "0.65rem" }}>Requer admin</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      {stats.total > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-gray-400" />
            {["all", "pass", "fail", "warn"].map(function (s) {
              var labels: Record<string, string> = { all: "Todos", pass: "Passou", fail: "Falhou", warn: "Aviso" };
              return (
                <button
                  key={s}
                  onClick={function () { setFilterStatus(s); }}
                  className={"px-2.5 py-1 rounded-lg transition-colors " + (filterStatus === s ? "bg-red-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}
                  style={{ fontSize: "0.75rem", fontWeight: 500 }}
                >
                  {labels[s]}
                </button>
              );
            })}
          </div>
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar testes..."
              value={searchQuery}
              onChange={function (e) { setSearchQuery(e.target.value); }}
              className="w-full pl-8 pr-3 py-1.5 bg-gray-100 rounded-lg text-gray-700 placeholder-gray-400 border-0 outline-none focus:ring-2 focus:ring-red-200"
              style={{ fontSize: "0.8rem" }}
            />
          </div>
          <span className="text-gray-400 ml-auto" style={{ fontSize: "0.72rem" }}>
            {filteredResults.length} de {stats.total} testes
          </span>
        </div>
      )}

      {/* Results grouped by category */}
      <div className="space-y-3">
        {Object.keys(groupedResults).map(function (category) {
          var catResults = groupedResults[category];
          var catMeta = CATEGORIES.find(function (c) { return c.key === category; });
          var catPass = catResults.filter(function (r) { return r.status === "pass"; }).length;
          var catFail = catResults.filter(function (r) { return r.status === "fail"; }).length;
          var catWarn = catResults.filter(function (r) { return r.status === "warn"; }).length;
          var isExpanded = expandedSections[category] !== false;
          var Icon = catMeta ? catMeta.icon : Globe;

          return (
            <div key={category} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button
                onClick={function () { toggleSection(category); }}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  <Icon className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-800" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                    {catMeta ? catMeta.label : category}
                  </span>
                  <span className="text-gray-400" style={{ fontSize: "0.75rem" }}>
                    ({catResults.length})
                  </span>
                </div>
                <div className="flex items-center gap-2" style={{ fontSize: "0.75rem" }}>
                  {catPass > 0 && <span className="flex items-center gap-1 text-green-600"><CheckCircle2 className="w-3.5 h-3.5" />{catPass}</span>}
                  {catFail > 0 && <span className="flex items-center gap-1 text-red-500"><XCircle className="w-3.5 h-3.5" />{catFail}</span>}
                  {catWarn > 0 && <span className="flex items-center gap-1 text-amber-500"><AlertTriangle className="w-3.5 h-3.5" />{catWarn}</span>}
                </div>
              </button>
              {isExpanded && (
                <div className="border-t border-gray-100">
                  {catResults.map(function (r) {
                    return (
                      <div key={r.id} className="flex items-start gap-3 px-5 py-2.5 border-b border-gray-50 last:border-b-0 hover:bg-gray-50/50">
                        <div className="mt-0.5">
                          {r.status === "pass" && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                          {r.status === "fail" && <XCircle className="w-4 h-4 text-red-500" />}
                          {r.status === "warn" && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                          {r.status === "running" && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                          {r.status === "pending" && <Clock className="w-4 h-4 text-gray-300" />}
                          {r.status === "skip" && <Clock className="w-4 h-4 text-gray-300" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-800 truncate" style={{ fontSize: "0.82rem", fontWeight: 500 }}>
                              {r.name}
                            </span>
                            {r.duration !== undefined && (
                              <span className="text-gray-400 shrink-0" style={{ fontSize: "0.68rem" }}>
                                {fmtMs(r.duration)}
                              </span>
                            )}
                          </div>
                          <p className={"truncate " + (r.status === "fail" ? "text-red-500" : "text-gray-400")} style={{ fontSize: "0.72rem" }}>
                            {r.message}
                          </p>
                          {r.details && (
                            <p className="text-gray-300 truncate" style={{ fontSize: "0.65rem" }}>
                              {r.details}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {stats.total === 0 && !running && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <FileCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600" style={{ fontSize: "0.95rem", fontWeight: 600 }}>
            Pronto para testar
          </p>
          <p className="text-gray-400 mt-1" style={{ fontSize: "0.82rem" }}>
            Clique em "Executar TODOS os Testes" para validar todas as funcoes do sistema, ou teste categorias individuais acima
          </p>
        </div>
      )}
    </div>
  );
}
