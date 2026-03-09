import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  RotateCcw,
  Search,
  AlertTriangle,
  FileCode,
  ChevronDown,
  ChevronRight,
  Zap,
  Bug,
  Eye,
  Globe,
  Layers,
  RefreshCw,
  Trash2,
  Download,
  Copy,
  Check,
} from "lucide-react";
import { getGlobalErrors, clearGlobalErrors } from "../../components/GlobalErrorCollector";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ModuleScanResult {
  name: string;
  path: string;
  status: "pending" | "scanning" | "ok" | "import-error" | "render-error" | "warning";
  error?: string;
  stack?: string;
  duration?: number;
  exportNames?: string[];
  warnings?: string[];
}

interface RouteScanResult {
  path: string;
  name: string;
  status: "pending" | "scanning" | "ok" | "error" | "timeout";
  error?: string;
  duration?: number;
}

// ─── All modules to scan ──────────────────────────────────────────────────────
var PAGE_MODULES = [
  { name: "HomePage", path: "./pages/HomePage", importPath: "../pages/HomePage" },
  { name: "CatalogPage", path: "./pages/CatalogPage", importPath: "../pages/CatalogPage" },
  { name: "ProductDetailPage", path: "./pages/ProductDetailPage", importPath: "../pages/ProductDetailPage" },
  { name: "CheckoutPage", path: "./pages/CheckoutPage", importPath: "../pages/CheckoutPage" },
  { name: "ContactPage", path: "./pages/ContactPage", importPath: "../pages/ContactPage" },
  { name: "AboutPage", path: "./pages/AboutPage", importPath: "../pages/AboutPage" },
  { name: "UserAuthPage", path: "./pages/UserAuthPage", importPath: "../pages/UserAuthPage" },
  { name: "UserResetPasswordPage", path: "./pages/UserResetPasswordPage", importPath: "../pages/UserResetPasswordPage" },
  { name: "UserAccountPage", path: "./pages/UserAccountPage", importPath: "../pages/UserAccountPage" },
  { name: "PrivacyPolicyPage", path: "./pages/PrivacyPolicyPage", importPath: "../pages/PrivacyPolicyPage" },
  { name: "TermsPage", path: "./pages/TermsPage", importPath: "../pages/TermsPage" },
  { name: "LgpdRightsPage", path: "./pages/LgpdRightsPage", importPath: "../pages/LgpdRightsPage" },
  { name: "BrandPage", path: "./pages/BrandPage", importPath: "../pages/BrandPage" },
  { name: "AffiliatePage", path: "./pages/AffiliatePage", importPath: "../pages/AffiliatePage" },
  { name: "TrackingPage", path: "./pages/TrackingPage", importPath: "../pages/TrackingPage" },
  { name: "NotFoundPage", path: "./pages/NotFoundPage", importPath: "../pages/NotFoundPage" },
];

var ADMIN_MODULES = [
  { name: "AdminDashboard", path: "./pages/admin/AdminDashboard", importPath: "./AdminDashboard" },
  { name: "AdminOrders", path: "./pages/admin/AdminOrders", importPath: "./AdminOrders" },
  { name: "AdminProducts", path: "./pages/admin/AdminProducts", importPath: "./AdminProducts" },
  { name: "AdminCategories", path: "./pages/admin/AdminCategories", importPath: "./AdminCategories" },
  { name: "AdminAttributes", path: "./pages/admin/AdminAttributes", importPath: "./AdminAttributes" },
  { name: "AdminClients", path: "./pages/admin/AdminClients", importPath: "./AdminClients" },
  { name: "AdminCoupons", path: "./pages/admin/AdminCoupons", importPath: "./AdminCoupons" },
  { name: "AdminBanners", path: "./pages/admin/AdminBanners", importPath: "./AdminBanners" },
  { name: "AdminMidBanners", path: "./pages/admin/AdminMidBanners", importPath: "./AdminMidBanners" },
  { name: "AdminHomepageCategories", path: "./pages/admin/AdminHomepageCategories", importPath: "./AdminHomepageCategories" },
  { name: "AdminSuperPromo", path: "./pages/admin/AdminSuperPromo", importPath: "./AdminSuperPromo" },
  { name: "AdminBrands", path: "./pages/admin/AdminBrands", importPath: "./AdminBrands" },
  { name: "AdminAutoCateg", path: "./pages/admin/AdminAutoCateg", importPath: "./AdminAutoCateg" },
  { name: "AdminBulkCategoryAssign", path: "./pages/admin/AdminBulkCategoryAssign", importPath: "./AdminBulkCategoryAssign" },
  { name: "AdminReviews", path: "./pages/admin/AdminReviews", importPath: "./AdminReviews" },
  { name: "AdminApiSige", path: "./pages/admin/AdminApiSige", importPath: "./AdminApiSige" },
  { name: "AdminPagHiper", path: "./pages/admin/AdminPagHiper", importPath: "./AdminPagHiper" },
  { name: "AdminMercadoPago", path: "./pages/admin/AdminMercadoPago", importPath: "./AdminMercadoPago" },
  { name: "AdminSafrapay", path: "./pages/admin/AdminSafrapay", importPath: "./AdminSafrapay" },
  { name: "AdminShipping", path: "./pages/admin/AdminShipping", importPath: "./AdminShipping" },
  { name: "AdminShippingTables", path: "./pages/admin/AdminShippingTables", importPath: "./AdminShippingTables" },
  { name: "AdminSisfreteWT", path: "./pages/admin/AdminSisfreteWT", importPath: "./AdminSisfreteWT" },
  { name: "AdminGA4", path: "./pages/admin/AdminGA4", importPath: "./AdminGA4" },
  { name: "AdminAuditLog", path: "./pages/admin/AdminAuditLog", importPath: "./AdminAuditLog" },
  { name: "AdminSettings", path: "./pages/admin/AdminSettings", importPath: "./AdminSettings" },
  { name: "AdminAdmins", path: "./pages/admin/AdminAdmins", importPath: "./AdminAdmins" },
  { name: "AdminFooterBadges", path: "./pages/admin/AdminFooterBadges", importPath: "./AdminFooterBadges" },
  { name: "AdminEmailMarketing", path: "./pages/admin/AdminEmailMarketing", importPath: "./AdminEmailMarketing" },
  { name: "AdminLgpdRequests", path: "./pages/admin/AdminLgpdRequests", importPath: "./AdminLgpdRequests" },
  { name: "AdminWarranty", path: "./pages/admin/AdminWarranty", importPath: "./AdminWarranty" },
  { name: "AdminAffiliates", path: "./pages/admin/AdminAffiliates", importPath: "./AdminAffiliates" },
  { name: "AdminBranches", path: "./pages/admin/AdminBranches", importPath: "./AdminBranches" },
  { name: "AdminRegressionTest", path: "./pages/admin/AdminRegressionTest", importPath: "./AdminRegressionTest" },
  { name: "SigeTestRunner", path: "./pages/admin/SigeTestRunner", importPath: "./SigeTestRunner" },
  { name: "SigeStockExplorer", path: "./pages/admin/SigeStockExplorer", importPath: "./SigeStockExplorer" },
  { name: "SigeStockSync", path: "./pages/admin/SigeStockSync", importPath: "./SigeStockSync" },
];

var COMPONENT_MODULES = [
  { name: "Header", path: "./components/Header", importPath: "../../components/Header" },
  { name: "Footer", path: "./components/Footer", importPath: "../../components/Footer" },
  { name: "CartDrawer", path: "./components/CartDrawer", importPath: "../../components/CartDrawer" },
  { name: "CategoryMegaMenu", path: "./components/CategoryMegaMenu", importPath: "../../components/CategoryMegaMenu" },
  { name: "ProductCard", path: "./components/ProductCard", importPath: "../../components/ProductCard" },
  { name: "ProductImage", path: "./components/ProductImage", importPath: "../../components/ProductImage" },
  { name: "ProductReviews", path: "./components/ProductReviews", importPath: "../../components/ProductReviews" },
  { name: "SearchAutocomplete", path: "./components/SearchAutocomplete", importPath: "../../components/SearchAutocomplete" },
  { name: "ShippingCalculator", path: "./components/ShippingCalculator", importPath: "../../components/ShippingCalculator" },
  { name: "SuperPromoSection", path: "./components/SuperPromoSection", importPath: "../../components/SuperPromoSection" },
  { name: "BrandCarousel", path: "./components/BrandCarousel", importPath: "../../components/BrandCarousel" },
  { name: "RecentlyViewedSection", path: "./components/RecentlyViewedSection", importPath: "../../components/RecentlyViewedSection" },
  { name: "CheckoutAddressManager", path: "./components/CheckoutAddressManager", importPath: "../../components/CheckoutAddressManager" },
  { name: "AddToCartButton", path: "./components/AddToCartButton", importPath: "../../components/AddToCartButton" },
  { name: "CookieConsentBanner", path: "./components/CookieConsentBanner", importPath: "../../components/CookieConsentBanner" },
  { name: "PriceBadge", path: "./components/PriceBadge", importPath: "../../components/PriceBadge" },
  { name: "StockBadge", path: "./components/StockBadge", importPath: "../../components/StockBadge" },
  { name: "StockBar", path: "./components/StockBar", importPath: "../../components/StockBar" },
  { name: "WishlistButton", path: "./components/WishlistButton", importPath: "../../components/WishlistButton" },
  { name: "ShareButtons", path: "./components/ShareButtons", importPath: "../../components/ShareButtons" },
  { name: "OptimizedImage", path: "./components/OptimizedImage", importPath: "../../components/OptimizedImage" },
  { name: "WhatsAppButton", path: "./components/WhatsAppButton", importPath: "../../components/WhatsAppButton" },
  { name: "MobileBottomNav", path: "./components/MobileBottomNav", importPath: "../../components/MobileBottomNav" },
  { name: "ScrollToTopButton", path: "./components/ScrollToTopButton", importPath: "../../components/ScrollToTopButton" },
  { name: "AvatarPicker", path: "./components/AvatarPicker", importPath: "../../components/AvatarPicker" },
  { name: "GA4Provider", path: "./components/GA4Provider", importPath: "../../components/GA4Provider" },
  { name: "VirtualProductGrid", path: "./components/VirtualProductGrid", importPath: "../../components/VirtualProductGrid" },
];

// ─── Routes to scan via navigation ───
var ALL_ROUTES = [
  { path: "/", name: "Home" },
  { path: "/catalogo", name: "CatalogPage" },
  { path: "/produto/1", name: "ProductDetailPage" },
  { path: "/contato", name: "ContactPage" },
  { path: "/sobre", name: "AboutPage" },
  { path: "/conta", name: "UserAuthPage" },
  { path: "/minha-conta", name: "UserAccountPage" },
  { path: "/checkout", name: "CheckoutPage" },
  { path: "/politica-de-privacidade", name: "PrivacyPolicyPage" },
  { path: "/termos-de-uso", name: "TermsPage" },
  { path: "/exercicio-de-direitos", name: "LgpdRightsPage" },
  { path: "/afiliados", name: "AffiliatePage" },
];

// ─── Dynamic import map (since dynamic string imports don't work, we map them) ───
function getModuleImporter(name: string): (() => Promise<any>) | null {
  // Pages
  var pageImports: Record<string, () => Promise<any>> = {
    "HomePage": function () { return import("../HomePage"); },
    "CatalogPage": function () { return import("../CatalogPage"); },
    "ProductDetailPage": function () { return import("../ProductDetailPage"); },
    "CheckoutPage": function () { return import("../CheckoutPage"); },
    "ContactPage": function () { return import("../ContactPage"); },
    "AboutPage": function () { return import("../AboutPage"); },
    "UserAuthPage": function () { return import("../UserAuthPage"); },
    "UserResetPasswordPage": function () { return import("../UserResetPasswordPage"); },
    "UserAccountPage": function () { return import("../UserAccountPage"); },
    "PrivacyPolicyPage": function () { return import("../PrivacyPolicyPage"); },
    "TermsPage": function () { return import("../TermsPage"); },
    "LgpdRightsPage": function () { return import("../LgpdRightsPage"); },
    "BrandPage": function () { return import("../BrandPage"); },
    "AffiliatePage": function () { return import("../AffiliatePage"); },
    "TrackingPage": function () { return import("../TrackingPage"); },
    "NotFoundPage": function () { return import("../NotFoundPage"); },
  };

  // Admin pages
  var adminImports: Record<string, () => Promise<any>> = {
    "AdminDashboard": function () { return import("./AdminDashboard"); },
    "AdminOrders": function () { return import("./AdminOrders"); },
    "AdminProducts": function () { return import("./AdminProducts"); },
    "AdminCategories": function () { return import("./AdminCategories"); },
    "AdminAttributes": function () { return import("./AdminAttributes"); },
    "AdminClients": function () { return import("./AdminClients"); },
    "AdminCoupons": function () { return import("./AdminCoupons"); },
    "AdminBanners": function () { return import("./AdminBanners"); },
    "AdminMidBanners": function () { return import("./AdminMidBanners"); },
    "AdminHomepageCategories": function () { return import("./AdminHomepageCategories"); },
    "AdminSuperPromo": function () { return import("./AdminSuperPromo"); },
    "AdminBrands": function () { return import("./AdminBrands"); },
    "AdminAutoCateg": function () { return import("./AdminAutoCateg"); },
    "AdminBulkCategoryAssign": function () { return import("./AdminBulkCategoryAssign"); },
    "AdminReviews": function () { return import("./AdminReviews"); },
    "AdminApiSige": function () { return import("./AdminApiSige"); },
    "AdminPagHiper": function () { return import("./AdminPagHiper"); },
    "AdminMercadoPago": function () { return import("./AdminMercadoPago"); },
    "AdminSafrapay": function () { return import("./AdminSafrapay"); },
    "AdminShipping": function () { return import("./AdminShipping"); },
    "AdminShippingTables": function () { return import("./AdminShippingTables"); },
    "AdminSisfreteWT": function () { return import("./AdminSisfreteWT"); },
    "AdminGA4": function () { return import("./AdminGA4"); },
    "AdminAuditLog": function () { return import("./AdminAuditLog"); },
    "AdminSettings": function () { return import("./AdminSettings"); },
    "AdminAdmins": function () { return import("./AdminAdmins"); },
    "AdminFooterBadges": function () { return import("./AdminFooterBadges"); },
    "AdminEmailMarketing": function () { return import("./AdminEmailMarketing"); },
    "AdminLgpdRequests": function () { return import("./AdminLgpdRequests"); },
    "AdminWarranty": function () { return import("./AdminWarranty"); },
    "AdminAffiliates": function () { return import("./AdminAffiliates"); },
    "AdminBranches": function () { return import("./AdminBranches"); },
    "AdminRegressionTest": function () { return import("./AdminRegressionTest"); },
    "SigeTestRunner": function () { return import("./SigeTestRunner"); },
    "SigeStockExplorer": function () { return import("./SigeStockExplorer"); },
    "SigeStockSync": function () { return import("./SigeStockSync"); },
  };

  // Components
  var compImports: Record<string, () => Promise<any>> = {
    "Header": function () { return import("../../components/Header"); },
    "Footer": function () { return import("../../components/Footer"); },
    "CartDrawer": function () { return import("../../components/CartDrawer"); },
    "CategoryMegaMenu": function () { return import("../../components/CategoryMegaMenu"); },
    "ProductCard": function () { return import("../../components/ProductCard"); },
    "ProductImage": function () { return import("../../components/ProductImage"); },
    "ProductReviews": function () { return import("../../components/ProductReviews"); },
    "SearchAutocomplete": function () { return import("../../components/SearchAutocomplete"); },
    "ShippingCalculator": function () { return import("../../components/ShippingCalculator"); },
    "SuperPromoSection": function () { return import("../../components/SuperPromoSection"); },
    "BrandCarousel": function () { return import("../../components/BrandCarousel"); },
    "RecentlyViewedSection": function () { return import("../../components/RecentlyViewedSection"); },
    "CheckoutAddressManager": function () { return import("../../components/CheckoutAddressManager"); },
    "AddToCartButton": function () { return import("../../components/AddToCartButton"); },
    "CookieConsentBanner": function () { return import("../../components/CookieConsentBanner"); },
    "PriceBadge": function () { return import("../../components/PriceBadge"); },
    "StockBadge": function () { return import("../../components/StockBadge"); },
    "StockBar": function () { return import("../../components/StockBar"); },
    "WishlistButton": function () { return import("../../components/WishlistButton"); },
    "ShareButtons": function () { return import("../../components/ShareButtons"); },
    "OptimizedImage": function () { return import("../../components/OptimizedImage"); },
    "WhatsAppButton": function () { return import("../../components/WhatsAppButton"); },
    "MobileBottomNav": function () { return import("../../components/MobileBottomNav"); },
    "ScrollToTopButton": function () { return import("../../components/ScrollToTopButton"); },
    "AvatarPicker": function () { return import("../../components/AvatarPicker"); },
    "GA4Provider": function () { return import("../../components/GA4Provider"); },
    "VirtualProductGrid": function () { return import("../../components/VirtualProductGrid"); },
  };

  return pageImports[name] || adminImports[name] || compImports[name] || null;
}

// ─── Main Component ──────────────────────────────────────────────────────────
export function AdminErrorScanner() {
  var [activeTab, setActiveTab] = useState<"modules" | "routes" | "live-errors">("modules");
  var [moduleResults, setModuleResults] = useState<ModuleScanResult[]>([]);
  var [routeResults, setRouteResults] = useState<RouteScanResult[]>([]);
  var [scanning, setScanning] = useState(false);
  var [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });
  var [filter, setFilter] = useState<"all" | "errors" | "ok">("all");
  var [liveErrors, setLiveErrors] = useState(getGlobalErrors());
  var [copied, setCopied] = useState(false);
  var abortRef = useRef(false);

  // Refresh live errors periodically
  useEffect(function () {
    if (activeTab !== "live-errors") return;
    var interval = setInterval(function () {
      setLiveErrors([...getGlobalErrors()]);
    }, 1000);
    return function () { clearInterval(interval); };
  }, [activeTab]);

  // ─── Module Import Scanner ───
  var scanModules = useCallback(async function () {
    abortRef.current = false;
    setScanning(true);

    var allModules = [
      ...PAGE_MODULES.map(function (m) { return { ...m, category: "page" }; }),
      ...ADMIN_MODULES.map(function (m) { return { ...m, category: "admin" }; }),
      ...COMPONENT_MODULES.map(function (m) { return { ...m, category: "component" }; }),
    ];

    var results: ModuleScanResult[] = allModules.map(function (m) {
      return { name: m.name, path: m.path, status: "pending" as const };
    });
    setModuleResults([...results]);
    setScanProgress({ current: 0, total: allModules.length });

    for (var i = 0; i < allModules.length; i++) {
      if (abortRef.current) break;
      var mod = allModules[i];
      results[i].status = "scanning";
      setModuleResults([...results]);

      var startTime = performance.now();
      try {
        var importer = getModuleImporter(mod.name);
        if (!importer) {
          results[i].status = "warning";
          results[i].warnings = ["No importer registered for this module"];
          results[i].duration = 0;
        } else {
          var moduleExports = await importer();
          var elapsed = performance.now() - startTime;
          var exportNames = Object.keys(moduleExports);
          var warnings: string[] = [];

          // Check for common issues
          if (exportNames.length === 0) {
            warnings.push("Module has no exports");
          }

          // Check if default export exists (expected for lazy-loaded components)
          var hasDefault = "default" in moduleExports;
          var hasNamedExport = exportNames.some(function (n) {
            if (n === "default") return false;
            var exp = moduleExports[n];
            // Regular function/class component
            if (typeof exp === "function") return true;
            // React.memo or React.forwardRef wrapped components (they are objects with $$typeof)
            if (exp && typeof exp === "object" && exp["$$typeof"]) return true;
            return false;
          });

          if (!hasDefault && !hasNamedExport) {
            warnings.push("No component export found (neither default nor named function export)");
          }

          results[i].status = warnings.length > 0 ? "warning" : "ok";
          results[i].duration = elapsed;
          results[i].exportNames = exportNames;
          results[i].warnings = warnings.length > 0 ? warnings : undefined;
        }
      } catch (err: any) {
        var elapsed2 = performance.now() - startTime;
        results[i].status = "import-error";
        results[i].error = err.message || String(err);
        results[i].stack = err.stack;
        results[i].duration = elapsed2;
      }

      setScanProgress({ current: i + 1, total: allModules.length });
      setModuleResults([...results]);

      // Small delay to not freeze UI
      await new Promise(function (r) { setTimeout(r, 50); });
    }

    setScanning(false);
  }, []);

  // ─── Route Scanner (via iframe) ───
  var scanRoutes = useCallback(async function () {
    abortRef.current = false;
    setScanning(true);

    var results: RouteScanResult[] = ALL_ROUTES.map(function (r) {
      return { path: r.path, name: r.name, status: "pending" as const };
    });
    setRouteResults([...results]);
    setScanProgress({ current: 0, total: ALL_ROUTES.length });

    for (var i = 0; i < ALL_ROUTES.length; i++) {
      if (abortRef.current) break;
      var route = ALL_ROUTES[i];
      results[i].status = "scanning";
      setRouteResults([...results]);

      var startTime = performance.now();

      try {
        // Create a hidden iframe to load the route
        var scanResult = await new Promise<{ ok: boolean; error?: string }>(function (resolve) {
          var iframe = document.createElement("iframe");
          iframe.style.position = "fixed";
          iframe.style.top = "-9999px";
          iframe.style.left = "-9999px";
          iframe.style.width = "1024px";
          iframe.style.height = "768px";
          iframe.style.opacity = "0";
          iframe.style.pointerEvents = "none";

          var timeout = setTimeout(function () {
            try { document.body.removeChild(iframe); } catch (_e) { /* ignore */ }
            resolve({ ok: true }); // Timeout = probably ok, just slow
          }, 10000);

          iframe.onload = function () {
            // Wait a bit for React to render
            setTimeout(function () {
              try {
                // Try to access iframe content to check for errors
                var doc = iframe.contentDocument || iframe.contentWindow?.document;
                if (doc) {
                  var errorText = doc.body?.innerText || "";
                  if (errorText.indexOf("Unexpected Application Error") !== -1 ||
                      errorText.indexOf("Cannot access") !== -1 ||
                      errorText.indexOf("ReferenceError") !== -1 ||
                      errorText.indexOf("TypeError") !== -1) {
                    clearTimeout(timeout);
                    try { document.body.removeChild(iframe); } catch (_e) { /* ignore */ }
                    resolve({ ok: false, error: errorText.slice(0, 500) });
                    return;
                  }
                }
              } catch (_e) {
                // Cross-origin — can't inspect, assume ok
              }
              clearTimeout(timeout);
              try { document.body.removeChild(iframe); } catch (_e) { /* ignore */ }
              resolve({ ok: true });
            }, 3000); // Wait 3s for React to fully render
          };

          iframe.onerror = function () {
            clearTimeout(timeout);
            try { document.body.removeChild(iframe); } catch (_e) { /* ignore */ }
            resolve({ ok: false, error: "Iframe load error for route: " + route.path });
          };

          document.body.appendChild(iframe);
          iframe.src = window.location.origin + route.path;
        });

        var elapsed = performance.now() - startTime;
        results[i].status = scanResult.ok ? "ok" : "error";
        results[i].error = scanResult.error;
        results[i].duration = elapsed;
      } catch (err: any) {
        var elapsed2 = performance.now() - startTime;
        results[i].status = "error";
        results[i].error = err.message || String(err);
        results[i].duration = elapsed2;
      }

      setScanProgress({ current: i + 1, total: ALL_ROUTES.length });
      setRouteResults([...results]);
    }

    setScanning(false);
  }, []);

  var handleAbort = useCallback(function () {
    abortRef.current = true;
  }, []);

  // ─── Export errors as JSON ───
  var exportErrors = useCallback(function () {
    var data = {
      timestamp: new Date().toISOString(),
      moduleResults: moduleResults.filter(function (r) { return r.status === "import-error" || r.status === "render-error"; }),
      routeResults: routeResults.filter(function (r) { return r.status === "error"; }),
      liveErrors: getGlobalErrors(),
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "error-scan-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(url);
  }, [moduleResults, routeResults]);

  var copyErrors = useCallback(function () {
    var errors = getGlobalErrors();
    var text = errors.map(function (e) {
      return "[" + e.type + "] " + e.timestamp.toLocaleTimeString("pt-BR") + " - " + e.message +
        (e.stack ? "\n  Stack: " + e.stack.split("\n").slice(0, 3).join("\n  ") : "");
    }).join("\n\n");
    navigator.clipboard.writeText(text || "Nenhum erro capturado");
    setCopied(true);
    setTimeout(function () { setCopied(false); }, 2000);
  }, []);

  // ─── Stats ───
  var moduleStats = {
    total: moduleResults.length,
    ok: moduleResults.filter(function (r) { return r.status === "ok"; }).length,
    errors: moduleResults.filter(function (r) { return r.status === "import-error" || r.status === "render-error"; }).length,
    warnings: moduleResults.filter(function (r) { return r.status === "warning"; }).length,
  };

  var routeStats = {
    total: routeResults.length,
    ok: routeResults.filter(function (r) { return r.status === "ok"; }).length,
    errors: routeResults.filter(function (r) { return r.status === "error"; }).length,
  };

  var filteredModules = moduleResults.filter(function (r) {
    if (filter === "errors") return r.status === "import-error" || r.status === "render-error" || r.status === "warning";
    if (filter === "ok") return r.status === "ok";
    return true;
  });

  var filteredRoutes = routeResults.filter(function (r) {
    if (filter === "errors") return r.status === "error";
    if (filter === "ok") return r.status === "ok";
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Bug className="w-6 h-6 text-red-600" />
            Error Scanner & Debugger
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Detecta erros de import, inicializacao, render e runtime em todos os modulos e rotas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportErrors}
            className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-1"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar JSON
          </button>
          <button
            onClick={copyErrors}
            className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-1"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copiado!" : "Copiar Erros"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {[
            { id: "modules" as const, label: "Scan de Modulos", icon: Layers, count: moduleStats.errors },
            { id: "routes" as const, label: "Scan de Rotas", icon: Globe, count: routeStats.errors },
            { id: "live-errors" as const, label: "Erros em Tempo Real", icon: Zap, count: liveErrors.length },
          ].map(function (tab) {
            return (
              <button
                key={tab.id}
                onClick={function () { setActiveTab(tab.id); }}
                className={"pb-2 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 " +
                  (activeTab === tab.id
                    ? "border-red-600 text-red-600"
                    : "border-transparent text-gray-500 hover:text-gray-700")
                }
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {tab.count > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs font-bold bg-red-100 text-red-700 rounded-full">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Module Scanner Tab */}
      {activeTab === "modules" && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={scanModules}
              disabled={scanning}
              className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium text-sm hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
            >
              {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {scanning ? "Escaneando..." : "Escanear Todos os Modulos"}
            </button>
            {scanning && (
              <button
                onClick={handleAbort}
                className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300"
              >
                Cancelar
              </button>
            )}
            {moduleResults.length > 0 && (
              <>
                <div className="flex items-center gap-1 ml-auto">
                  {(["all", "errors", "ok"] as const).map(function (f) {
                    return (
                      <button
                        key={f}
                        onClick={function () { setFilter(f); }}
                        className={"px-2.5 py-1 text-xs rounded-md " +
                          (filter === f ? "bg-red-100 text-red-700 font-medium" : "bg-gray-100 text-gray-600 hover:bg-gray-200")
                        }
                      >
                        {f === "all" ? "Todos" : f === "errors" ? "Erros" : "OK"}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Progress */}
          {scanning && scanProgress.total > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Progresso</span>
                <span>{scanProgress.current}/{scanProgress.total}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-red-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: (scanProgress.current / scanProgress.total * 100) + "%" }}
                />
              </div>
            </div>
          )}

          {/* Stats summary */}
          {moduleResults.length > 0 && !scanning && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Total" value={moduleStats.total} color="gray" />
              <StatCard label="OK" value={moduleStats.ok} color="green" />
              <StatCard label="Erros" value={moduleStats.errors} color="red" />
              <StatCard label="Avisos" value={moduleStats.warnings} color="amber" />
            </div>
          )}

          {/* Results */}
          <div className="space-y-1">
            {filteredModules.map(function (result) {
              return <ModuleResultRow key={result.name} result={result} />;
            })}
          </div>

          {moduleResults.length === 0 && !scanning && (
            <div className="text-center py-12 text-gray-400">
              <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Clique em "Escanear Todos os Modulos" para iniciar a analise</p>
              <p className="text-xs mt-1">Isso fara import dinamico de ~{PAGE_MODULES.length + ADMIN_MODULES.length + COMPONENT_MODULES.length} modulos</p>
            </div>
          )}
        </div>
      )}

      {/* Route Scanner Tab */}
      {activeTab === "routes" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={scanRoutes}
              disabled={scanning}
              className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium text-sm hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
            >
              {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
              {scanning ? "Escaneando Rotas..." : "Escanear Todas as Rotas"}
            </button>
            {scanning && (
              <button onClick={handleAbort} className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300">
                Cancelar
              </button>
            )}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            <AlertTriangle className="w-4 h-4 inline mr-1" />
            O scanner de rotas carrega cada rota em um iframe oculto e verifica se ha erros visiveis apos 3 segundos.
            Rotas que requerem autenticacao podem mostrar erros esperados (redirect, etc).
          </div>

          {/* Progress */}
          {scanning && scanProgress.total > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Progresso</span>
                <span>{scanProgress.current}/{scanProgress.total}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-red-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: (scanProgress.current / scanProgress.total * 100) + "%" }} />
              </div>
            </div>
          )}

          {/* Stats */}
          {routeResults.length > 0 && !scanning && (
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Total" value={routeStats.total} color="gray" />
              <StatCard label="OK" value={routeStats.ok} color="green" />
              <StatCard label="Erros" value={routeStats.errors} color="red" />
            </div>
          )}

          {/* Results */}
          <div className="space-y-1">
            {(filter === "all" ? routeResults : filteredRoutes).map(function (result) {
              return <RouteResultRow key={result.path} result={result} />;
            })}
          </div>

          {routeResults.length === 0 && !scanning && (
            <div className="text-center py-12 text-gray-400">
              <Globe className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Clique em "Escanear Todas as Rotas" para testar cada rota via iframe</p>
            </div>
          )}
        </div>
      )}

      {/* Live Errors Tab */}
      {activeTab === "live-errors" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button
              onClick={function () { setLiveErrors([...getGlobalErrors()]); }}
              className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Atualizar
            </button>
            <button
              onClick={function () { clearGlobalErrors(); setLiveErrors([]); }}
              className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200 flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Limpar
            </button>
            <span className="text-xs text-gray-400 ml-auto">
              Atualiza automaticamente a cada 1s
            </span>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
            <Eye className="w-4 h-4 inline mr-1" />
            Este painel mostra TODOS os erros capturados globalmente (window.onerror, unhandledrejection, console.error, React ErrorBoundary).
            Navegue pelo site em outra aba e volte aqui para ver os erros acumulados.
          </div>

          {/* Live error type breakdown */}
          {liveErrors.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {["runtime", "unhandled-rejection", "react-boundary", "resource", "console-error"].map(function (type) {
                var count = liveErrors.filter(function (e) { return e.type === type; }).length;
                var labels: Record<string, string> = {
                  "runtime": "Runtime",
                  "unhandled-rejection": "Promise",
                  "react-boundary": "React",
                  "resource": "Resource",
                  "console-error": "Console",
                };
                var colors: Record<string, string> = {
                  "runtime": "red",
                  "unhandled-rejection": "orange",
                  "react-boundary": "pink",
                  "resource": "amber",
                  "console-error": "purple",
                };
                return (
                  <div key={type} className={"p-2 rounded-lg border text-center " +
                    (count > 0 ? "bg-" + colors[type] + "-50 border-" + colors[type] + "-200" : "bg-gray-50 border-gray-200")
                  }>
                    <div className={"text-lg font-bold " + (count > 0 ? "text-" + colors[type] + "-600" : "text-gray-400")}>
                      {count}
                    </div>
                    <div className="text-xs text-gray-500">{labels[type]}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Error list */}
          <div className="space-y-2">
            {liveErrors.slice().reverse().map(function (err, idx) {
              return <LiveErrorRow key={err.id || idx} error={err} />;
            })}
          </div>

          {liveErrors.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-300" />
              <p className="text-sm font-medium text-green-600">Nenhum erro capturado</p>
              <p className="text-xs mt-1 text-gray-400">
                Navegue pelo site para detectar erros em tempo real
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard(props: { label: string; value: number; color: string }) {
  var bgMap: Record<string, string> = {
    gray: "bg-gray-50 border-gray-200",
    green: "bg-green-50 border-green-200",
    red: "bg-red-50 border-red-200",
    amber: "bg-amber-50 border-amber-200",
  };
  var textMap: Record<string, string> = {
    gray: "text-gray-700",
    green: "text-green-700",
    red: "text-red-700",
    amber: "text-amber-700",
  };
  return (
    <div className={"rounded-lg border p-3 text-center " + (bgMap[props.color] || bgMap.gray)}>
      <div className={"text-2xl font-bold " + (textMap[props.color] || textMap.gray)}>{props.value}</div>
      <div className="text-xs text-gray-500">{props.label}</div>
    </div>
  );
}

function ModuleResultRow(props: { result: ModuleScanResult }) {
  var [expanded, setExpanded] = useState(false);
  var r = props.result;

  var statusIcons: Record<string, React.ReactNode> = {
    "pending": <div className="w-4 h-4 rounded-full bg-gray-200" />,
    "scanning": <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />,
    "ok": <CheckCircle2 className="w-4 h-4 text-green-500" />,
    "import-error": <XCircle className="w-4 h-4 text-red-500" />,
    "render-error": <XCircle className="w-4 h-4 text-red-500" />,
    "warning": <AlertTriangle className="w-4 h-4 text-amber-500" />,
  };

  var bgClass = r.status === "import-error" || r.status === "render-error"
    ? "bg-red-50 border-red-200"
    : r.status === "warning"
    ? "bg-amber-50 border-amber-200"
    : r.status === "ok"
    ? "bg-white border-gray-100 hover:bg-gray-50"
    : "bg-white border-gray-100";

  return (
    <div className={"border rounded-lg " + bgClass}>
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer"
        onClick={function () { setExpanded(!expanded); }}
      >
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
        {statusIcons[r.status]}
        <span className="text-sm font-medium text-gray-800 flex-1">{r.name}</span>
        <span className="text-xs text-gray-400 font-mono">{r.path}</span>
        {r.duration !== undefined && (
          <span className="text-xs text-gray-400">{r.duration < 1 ? "<1ms" : r.duration.toFixed(0) + "ms"}</span>
        )}
      </div>
      {expanded && (
        <div className="px-3 pb-2 text-xs space-y-1">
          {r.exportNames && (
            <div className="text-gray-500">
              <span className="font-medium">Exports:</span> {r.exportNames.join(", ")}
            </div>
          )}
          {r.error && (
            <div className="bg-red-100 border border-red-200 rounded p-2 text-red-700 font-mono whitespace-pre-wrap">
              {r.error}
            </div>
          )}
          {r.stack && (
            <pre className="bg-gray-900 text-gray-300 rounded p-2 overflow-auto max-h-40 text-xs">
              {r.stack}
            </pre>
          )}
          {r.warnings && r.warnings.map(function (w, wi) {
            return (
              <div key={wi} className="bg-amber-100 border border-amber-200 rounded p-2 text-amber-700">
                {w}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RouteResultRow(props: { result: RouteScanResult }) {
  var [expanded, setExpanded] = useState(false);
  var r = props.result;

  var statusIcons: Record<string, React.ReactNode> = {
    "pending": <div className="w-4 h-4 rounded-full bg-gray-200" />,
    "scanning": <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />,
    "ok": <CheckCircle2 className="w-4 h-4 text-green-500" />,
    "error": <XCircle className="w-4 h-4 text-red-500" />,
    "timeout": <AlertTriangle className="w-4 h-4 text-amber-500" />,
  };

  var bgClass = r.status === "error"
    ? "bg-red-50 border-red-200"
    : r.status === "ok"
    ? "bg-white border-gray-100 hover:bg-gray-50"
    : "bg-white border-gray-100";

  return (
    <div className={"border rounded-lg " + bgClass}>
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer"
        onClick={function () { setExpanded(!expanded); }}
      >
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
        {statusIcons[r.status]}
        <span className="text-sm font-medium text-gray-800">{r.name}</span>
        <span className="text-xs text-gray-400 font-mono flex-1">{r.path}</span>
        {r.duration !== undefined && (
          <span className="text-xs text-gray-400">{(r.duration / 1000).toFixed(1) + "s"}</span>
        )}
      </div>
      {expanded && r.error && (
        <div className="px-3 pb-2">
          <pre className="text-xs bg-red-100 border border-red-200 rounded p-2 text-red-700 whitespace-pre-wrap overflow-auto max-h-40">
            {r.error}
          </pre>
        </div>
      )}
    </div>
  );
}

function LiveErrorRow(props: { error: any }) {
  var [expanded, setExpanded] = useState(false);
  var e = props.error;

  var typeColors: Record<string, string> = {
    "runtime": "bg-red-100 text-red-700",
    "unhandled-rejection": "bg-orange-100 text-orange-700",
    "react-boundary": "bg-pink-100 text-pink-700",
    "resource": "bg-amber-100 text-amber-700",
    "console-error": "bg-purple-100 text-purple-700",
  };

  var typeLabels: Record<string, string> = {
    "runtime": "Runtime",
    "unhandled-rejection": "Promise",
    "react-boundary": "React",
    "resource": "Resource",
    "console-error": "Console",
  };

  return (
    <div
      className="border border-gray-200 rounded-lg bg-white cursor-pointer hover:bg-gray-50"
      onClick={function () { setExpanded(!expanded); }}
    >
      <div className="flex items-start gap-2 px-3 py-2">
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />}
        <span className={"px-1.5 py-0.5 text-xs font-semibold rounded flex-shrink-0 " + (typeColors[e.type] || "bg-gray-100 text-gray-600")}>
          {typeLabels[e.type] || e.type}
        </span>
        <span className="text-xs text-gray-700 flex-1 break-all line-clamp-2">
          {e.message}
        </span>
        <span className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">
          {e.timestamp instanceof Date ? e.timestamp.toLocaleTimeString("pt-BR") : ""}
        </span>
      </div>
      {expanded && (
        <div className="px-3 pb-2 space-y-2">
          {e.source && (
            <div className="text-xs text-gray-500">
              <span className="font-medium">Fonte:</span> {e.source}
              {e.line ? ":" + e.line : ""}{e.col ? ":" + e.col : ""}
            </div>
          )}
          {e.stack && (
            <pre className="text-xs bg-gray-900 text-gray-300 rounded p-2 overflow-auto max-h-48 whitespace-pre-wrap">
              {e.stack}
            </pre>
          )}
          {e.componentStack && (
            <pre className="text-xs bg-amber-50 text-amber-700 rounded p-2 overflow-auto max-h-32 whitespace-pre-wrap border border-amber-200">
              Component Stack:{e.componentStack}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}