/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ADMIN PAGE — Shell principal do painel administrativo (/admin)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * FUNCIONA ASSIM:
 * 1. Verifica se usuario esta autenticado como admin (via adminAuth.ts)
 * 2. Se nao: mostra AdminLoginPage (login separado do cliente)
 * 3. Se sim: mostra sidebar com ~40 tabs, cada uma lazy-loaded
 * 4. Permissoes por tab: master admin ve tudo; outros admins veem so tabs permitidas
 *
 * SEGURANCA:
 * - Sessao admin isolada em localStorage proprio (nao contamina sessao cliente)
 * - Token refresh automatico via getValidAdminToken()
 * - Verificacao server-side via isAdminUser() em cada chamada API
 *
 * PERFORMANCE:
 * - Cada tab e um chunk JS separado (lazyWithRetry)
 * - So baixa quando o admin clica na tab
 * - Logo do admin cacheada em localStorage
 *
 * TABS (agrupadas na sidebar):
 * - Dashboard, Pedidos, Produtos, Categorias, Atributos, Dimensoes
 * - Clientes, Cupons, Banners, Mid-Banners, Super Promo, HP Categories
 * - Marcas, Auto-Categ, Reviews, Garantia, Afiliados, Filiais
 * - Reels, Influenciadores, FAQ
 * - API SIGE, PagHiper, Mercado Pago, Frete, Sisfrete
 * - GA4, Marketing, Email Marketing, Exit Intent, WhatsApp
 * - Footer Badges, Selos, Logo
 * - Audit Log, Admins, LGPD, Configuracoes
 * - Infraestrutura, Testes de Regressao, Error Scanner
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { Link } from "react-router";
import { Package, Layers, Settings, ExternalLink, Menu, X, LogOut, User, ChevronRight, Loader2, Tag, Users, Plug, CreditCard, Truck, ShoppingCart, ScrollText, Image, LayoutGrid, Flame, ShieldCheck, AlertTriangle, Shield, Columns2, BadgeCheck, Mail, LayoutDashboard, Ticket, FileCheck, Award, Zap, Star, Handshake, Building2, FlaskConical, Bug, Megaphone, Gift, MessageCircle, Search, ChevronDown, Wallet, BarChart3, Palette, Wrench, MousePointerClick, Video, Sparkles, HelpCircle, Ruler, BookOpen } from "lucide-react";
import { AdminLoginPage } from "./AdminLoginPage";
import * as api from "../../services/api";
import { supabase } from "../../services/supabaseClient";
import { getValidAdminToken, refreshAdminToken, clearAdminStorage, ADMIN_EMAIL_KEY, ADMIN_NAME_KEY } from "./adminAuth";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { lazyWithRetry } from "../../utils/lazyWithRetry";

var ADMIN_LOGO_CACHE_KEY = "carretao_admin_logo_url";

// ── Lazy-loaded admin tab components (only load when the tab is activated) ──
const AdminProducts = lazyWithRetry(function () { return import("./AdminProducts").then(function (m) { return { default: m.AdminProducts }; }); });
const AdminCategories = lazyWithRetry(function () { return import("./AdminCategories").then(function (m) { return { default: m.AdminCategories }; }); });
const AdminSettings = lazyWithRetry(function () { return import("./AdminSettings").then(function (m) { return { default: m.AdminSettings }; }); });
const AdminAttributes = lazyWithRetry(function () { return import("./AdminAttributes").then(function (m) { return { default: m.AdminAttributes }; }); });
const AdminClients = lazyWithRetry(function () { return import("./AdminClients").then(function (m) { return { default: m.AdminClients }; }); });
const AdminApiSige = lazyWithRetry(function () { return import("./AdminApiSige").then(function (m) { return { default: m.AdminApiSige }; }); });
const AdminPagHiper = lazyWithRetry(function () { return import("./AdminPagHiper").then(function (m) { return { default: m.AdminPagHiper }; }); });
const AdminShipping = lazyWithRetry(function () { return import("./AdminShipping").then(function (m) { return { default: m.AdminShipping }; }); });
const AdminMercadoPago = lazyWithRetry(function () { return import("./AdminMercadoPago").then(function (m) { return { default: m.AdminMercadoPago }; }); });
const AdminOrders = lazyWithRetry(function () { return import("./AdminOrders").then(function (m) { return { default: m.AdminOrders }; }); });
const AdminAuditLog = lazyWithRetry(function () { return import("./AdminAuditLog").then(function (m) { return { default: m.AdminAuditLog }; }); });
const AdminBanners = lazyWithRetry(function () { return import("./AdminBanners").then(function (m) { return { default: m.AdminBanners }; }); });
const AdminSuperPromo = lazyWithRetry(function () { return import("./AdminSuperPromo").then(function (m) { return { default: m.AdminSuperPromo }; }); });
const AdminAdmins = lazyWithRetry(function () { return import("./AdminAdmins").then(function (m) { return { default: m.AdminAdmins }; }); });
const AdminHomepageCategories = lazyWithRetry(function () { return import("./AdminHomepageCategories").then(function (m) { return { default: m.AdminHomepageCategories }; }); });
const AdminMidBanners = lazyWithRetry(function () { return import("./AdminMidBanners").then(function (m) { return { default: m.AdminMidBanners }; }); });
const AdminFooterBadges = lazyWithRetry(function () { return import("./AdminFooterBadges").then(function (m) { return { default: m.AdminFooterBadges }; }); });
const AdminEmailMarketing = lazyWithRetry(function () { return import("./AdminEmailMarketing").then(function (m) { return { default: m.AdminEmailMarketing }; }); });
const AdminDashboard = lazyWithRetry(function () { return import("./AdminDashboard").then(function (m) { return { default: m.AdminDashboard }; }); });
const AdminCoupons = lazyWithRetry(function () { return import("./AdminCoupons").then(function (m) { return { default: m.AdminCoupons }; }); });
const AdminLgpdRequests = lazyWithRetry(function () { return import("./AdminLgpdRequests").then(function (m) { return { default: m.AdminLgpdRequests }; }); });
const AdminBrands = lazyWithRetry(function () { return import("./AdminBrands").then(function (m) { return { default: m.AdminBrands }; }); });
const AdminAutoCateg = lazyWithRetry(function () { return import("./AdminAutoCateg").then(function (m) { return { default: m.AdminAutoCateg }; }); });
const AdminReviews = lazyWithRetry(function () { return import("./AdminReviews").then(function (m) { return { default: m.AdminReviews }; }); });
const AdminWarranty = lazyWithRetry(function () { return import("./AdminWarranty").then(function (m) { return { default: m.AdminWarranty }; }); });
const AdminAffiliates = lazyWithRetry(function () { return import("./AdminAffiliates").then(function (m) { return { default: m.AdminAffiliates }; }); });
const AdminBranches = lazyWithRetry(function () { return import("./AdminBranches").then(function (m) { return { default: m.AdminBranches }; }); });
const AdminSisfreteWT = lazyWithRetry(function () { return import("./AdminSisfreteWT").then(function (m) { return { default: m.AdminSisfreteWT }; }); });
const AdminRegressionTest = lazyWithRetry(function () { return import("./AdminRegressionTest").then(function (m) { return { default: m.AdminRegressionTest }; }); });
const AdminErrorScanner = lazyWithRetry(function () { return import("./AdminErrorScanner").then(function (m) { return { default: m.AdminErrorScanner }; }); });
const AdminMarketing = lazyWithRetry(function () { return import("./AdminMarketing").then(function (m) { return { default: m.AdminMarketing }; }); });
const AdminExitIntent = lazyWithRetry(function () { return import("./AdminExitIntent").then(function (m) { return { default: m.AdminExitIntent }; }); });
const AdminWhatsApp = lazyWithRetry(function () { return import("./AdminWhatsApp").then(function (m) { return { default: m.AdminWhatsApp }; }); });

const AdminReels = lazyWithRetry(function () { return import("./AdminReels").then(function (m) { return { default: m.AdminReels }; }); });
const AdminInfluencers = lazyWithRetry(function () { return import("./AdminInfluencers").then(function (m) { return { default: m.AdminInfluencers }; }); });

const AdminInfrastructure = lazyWithRetry(function () { return import("./AdminInfrastructure").then(function (m) { return { default: m.AdminInfrastructure }; }); });
const AdminFaq = lazyWithRetry(function () { return import("./AdminFaq").then(function (m) { return { default: m.AdminFaq }; }); });
const AdminDimensions = lazyWithRetry(function () { return import("./AdminDimensions").then(function (m) { return { default: m.AdminDimensions }; }); });

type Tab = "dashboard" | "orders" | "products" | "categories" | "attributes" | "clients" | "coupons" | "banners" | "mid-banners" | "hp-categories" | "super-promo" | "brands" | "auto-categ" | "reviews" | "api-sige" | "paghiper" | "mercadopago" | "shipping" | "sisfrete-wt" | "marketing" | "audit-log" | "settings" | "admins" | "footer-badges" | "email-marketing" | "lgpd-requests" | "warranty" | "affiliates" | "branches" | "regression-test" | "error-scanner" | "exit-intent" | "whatsapp" | "reels" | "influencers" | "infrastructure" | "faq" | "dimensions";

const navItems: { id: Tab; label: string; icon: typeof Package }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "orders", label: "Pedidos", icon: ShoppingCart },
  { id: "products", label: "Produtos", icon: Package },
  { id: "categories", label: "Categorias", icon: Layers },
  { id: "attributes", label: "Atributos", icon: Tag },
  { id: "brands", label: "Marcas", icon: Award },
  { id: "auto-categ", label: "Auto-Categorias", icon: Zap },
  { id: "coupons", label: "Cupons", icon: Ticket },
  { id: "warranty", label: "Garantia Estendida", icon: ShieldCheck },
  { id: "affiliates", label: "Afiliados", icon: Handshake },
  { id: "clients", label: "Clientes", icon: Users },
  { id: "reviews", label: "Avaliacoes", icon: Star },
  { id: "email-marketing", label: "Email Marketing", icon: Mail },
  { id: "whatsapp", label: "WhatsApp Cart", icon: MessageCircle },
  { id: "exit-intent", label: "Popup de Saida", icon: MousePointerClick },
  { id: "marketing", label: "Pixels & Analytics", icon: BarChart3 },
  { id: "banners", label: "Banners Hero", icon: Image },
  { id: "mid-banners", label: "Banners Central", icon: Columns2 },
  { id: "hp-categories", label: "Vitrine Home", icon: LayoutGrid },
  { id: "super-promo", label: "Super Promo", icon: Flame },
  { id: "footer-badges", label: "Selos & Badges", icon: BadgeCheck },
  { id: "branches", label: "Filiais", icon: Building2 },
  { id: "paghiper", label: "PagHiper (PIX/Boleto)", icon: CreditCard },
  { id: "mercadopago", label: "Mercado Pago", icon: Wallet },
  { id: "dimensions", label: "Dimensoes & Peso", icon: Ruler },
  { id: "shipping", label: "SisFrete Config", icon: Truck },
  { id: "sisfrete-wt", label: "Tabela de Frete", icon: Truck },
  { id: "api-sige", label: "API SIGE / ERP", icon: Plug },
  { id: "settings", label: "Configuracoes", icon: Settings },
  { id: "admins", label: "Administradores", icon: Shield },
  { id: "audit-log", label: "Log de Auditoria", icon: ScrollText },
  { id: "lgpd-requests", label: "LGPD & Privacidade", icon: FileCheck },
  { id: "regression-test", label: "Teste de Regressao", icon: FlaskConical },
  { id: "error-scanner", label: "Error Scanner", icon: Bug },
  { id: "reels", label: "Reels", icon: Video },
  { id: "influencers", label: "Influencers", icon: Sparkles },
  { id: "infrastructure", label: "Infraestrutura", icon: Wrench },
  { id: "faq", label: "FAQ", icon: HelpCircle },
];

// Grouped navigation for sidebar sections
interface NavSection {
  label: string;
  icon: typeof Package;
  items: Tab[];
  collapsible?: boolean;
}

var COLLAPSED_KEY = "carretao_admin_collapsed";

function loadCollapsedSections(): Record<string, boolean> {
  try {
    var raw = localStorage.getItem(COLLAPSED_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveCollapsedSections(state: Record<string, boolean>): void {
  try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify(state)); } catch {}
}

const navSections: NavSection[] = [
  { label: "Geral", icon: LayoutDashboard, items: ["dashboard"], collapsible: false },
  { label: "Vendas", icon: ShoppingCart, items: ["orders", "coupons", "warranty"], collapsible: true },
  { label: "Catalogo", icon: Package, items: ["products", "categories", "attributes", "brands", "auto-categ"], collapsible: true },
  { label: "Clientes", icon: Users, items: ["clients", "reviews"], collapsible: true },
  { label: "Marketing", icon: Megaphone, items: ["affiliates", "email-marketing", "whatsapp", "exit-intent", "marketing"], collapsible: true },
  { label: "Aparencia", icon: Palette, items: ["reels", "influencers", "banners", "mid-banners", "hp-categories", "super-promo", "footer-badges", "branches", "faq"], collapsible: true },
  { label: "Pagamentos & Frete", icon: Wallet, items: ["paghiper", "mercadopago", "dimensions", "shipping", "sisfrete-wt"], collapsible: true },
  { label: "Integracoes", icon: Plug, items: ["api-sige"], collapsible: true },
  { label: "Sistema", icon: Wrench, items: ["settings", "admins", "audit-log", "lgpd-requests", "regression-test", "error-scanner", "infrastructure"], collapsible: true },
];

function getNavItem(id: Tab) {
  return navItems.find(function (n) { return n.id === id; });
}

// Helper to log admin actions
async function logAdminAction(action: string, email: string, userName: string, details?: string) {
  try {
    var token = await getValidAdminToken();
    if (!token) return;
    await api.saveAuditLog(token, {
      action,
      email,
      userName,
      details: details || "",
      userAgent: navigator.userAgent,
    });
  } catch (e) {
    console.error("Erro ao registrar log de auditoria:", e);
  }
}

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [navSearch, setNavSearch] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(loadCollapsedSections);

  // Logo state
  const [logoUrl, setLogoUrl] = useState<string | null>(() => {
    try { return localStorage.getItem(ADMIN_LOGO_CACHE_KEY); } catch { return null; }
  });
  const [logoLoading, setLogoLoading] = useState(true);

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [isMaster, setIsMaster] = useState(false);
  const [allowedTabs, setAllowedTabs] = useState<string[]>([]);

  // Bootstrap state: shown when user has valid session but no admins configured yet
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [bootstrapEmail, setBootstrapEmail] = useState("");
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  // Pending counts for sidebar badges
  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({});

  // "Seen" counts — tracks what the admin has already seen per tab
  // Only shows badge for NEW items since the admin last visited that tab
  const SEEN_KEY_PREFIX = "carretao_admin_seen_";
  function _getSeenKey(): string { return SEEN_KEY_PREFIX + (userEmail || "default"); }

  function _loadSeenCounts(): Record<string, number> {
    try {
      var raw = localStorage.getItem(_getSeenKey());
      if (raw) return JSON.parse(raw);
    } catch {}
    return {};
  }

  function _saveSeenCounts(seen: Record<string, number>): void {
    try { localStorage.setItem(_getSeenKey(), JSON.stringify(seen)); } catch {}
  }

  const [seenCounts, setSeenCounts] = useState<Record<string, number>>({});

  // Load seen counts when authenticated
  useEffect(() => {
    if (isAuthenticated && userEmail) {
      setSeenCounts(_loadSeenCounts());
    }
  }, [isAuthenticated, userEmail]);

  // Compute display badges: only show NEW items (current - seen)
  function getNewCount(tabId: string): number {
    var current = pendingCounts[tabId] || 0;
    var seen = seenCounts[tabId] || 0;
    // If current > seen, there are new items
    // If current <= seen, admin has already seen these (or items were resolved)
    if (current > seen) return current - seen;
    return 0;
  }

  // Mark a tab as "seen" — save the current count so badge goes away
  function markTabAsSeen(tabId: string): void {
    var current = pendingCounts[tabId] || 0;
    if (current > 0) {
      var updated = { ..._loadSeenCounts(), [tabId]: current };
      _saveSeenCounts(updated);
      setSeenCounts(updated);
    }
  }

  // Fetch pending counts for sidebar badges
  const fetchPendingCounts = useCallback(async () => {
    try {
      var token = await getValidAdminToken();
      if (!token) return;
      const data = await api.getAdminPendingCounts(token);
      const counts: Record<string, number> = {};
      if (data.orders && data.orders.total > 0) counts["orders"] = data.orders.total;
      if (data.reviews && data.reviews > 0) counts["reviews"] = data.reviews;
      if (data.lgpd && data.lgpd > 0) counts["lgpd-requests"] = data.lgpd;
      if (data.affiliates && data.affiliates > 0) counts["affiliates"] = data.affiliates;
      setPendingCounts(counts);

      // Auto-adjust seen counts: if actual count dropped below what was seen,
      // reset the seen count to the current value (items were resolved)
      setSeenCounts(function (prevSeen) {
        var adjusted = { ...prevSeen };
        var changed = false;
        for (var key in adjusted) {
          var current = counts[key] || 0;
          if (adjusted[key] > current) {
            adjusted[key] = current;
            changed = true;
          }
        }
        if (changed) {
          _saveSeenCounts(adjusted);
        }
        return changed ? adjusted : prevSeen;
      });
    } catch (e) {
      console.error("[AdminPage] Failed to fetch pending counts:", e);
    }
  }, []);

  // Poll pending counts every 60s when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    fetchPendingCounts();
    const interval = setInterval(fetchPendingCounts, 60000);
    return () => clearInterval(interval);
  }, [isAuthenticated, fetchPendingCounts]);

  // Periodically refresh admin token (every 45 minutes)
  useEffect(() => {
    if (!isAuthenticated) return;
    var refreshInterval = setInterval(async function () {
      var refreshed = await getValidAdminToken();
      if (!refreshed) {
        console.warn("[AdminPage] Auto-refresh failed. Admin will need to re-login.");
        clearAdminStorage();
        setIsAuthenticated(false);
      }
    }, 2700000); // 45 minutes
    return function () { clearInterval(refreshInterval); };
  }, [isAuthenticated]);

  // Filter navItems based on permissions
  const visibleNavItems = isMaster
    ? navItems
    : navItems.filter((item) => allowedTabs.indexOf(item.id) >= 0);

  // Check for existing session on mount — SECURITY: verify admin role
  useEffect(() => {
    const checkSession = async () => {
      try {
        // Read admin token from admin-specific localStorage, auto-refreshing if needed
        var storedToken = await getValidAdminToken();
        if (!storedToken) {
          setIsAuthenticated(false);
          setCheckingSession(false);
          return;
        }
        // Verify the stored token is still a valid admin
        try {
          const adminCheck = await api.checkAdmin(storedToken);
          if (adminCheck.isAdmin) {
            setIsAuthenticated(true);
            var savedEmail = "";
            var savedName = "Admin";
            try { savedEmail = localStorage.getItem(ADMIN_EMAIL_KEY) || ""; } catch {}
            try { savedName = localStorage.getItem(ADMIN_NAME_KEY) || "Admin"; } catch {}
            setUserEmail(savedEmail);
            setUserName(savedName);
            setIsMaster(adminCheck.isMaster || false);
            setAllowedTabs(adminCheck.permissions || []);
            if (adminCheck.permissions && adminCheck.permissions.length > 0) {
              const firstAllowed = adminCheck.permissions[0] as Tab;
              if (navItems.some((n) => n.id === firstAllowed)) {
                setActiveTab(firstAllowed);
              }
            }
          } else {
            // Token returned isAdmin:false — could be expired JWT that the server
            // rejected silently (returns 200 + isAdmin:false instead of throwing).
            // Try refreshing before giving up.
            console.warn("[AdminPage] Stored token failed admin check. Attempting refresh…");
            var refreshedToken = await refreshAdminToken();
            if (refreshedToken) {
              try {
                var retryCheck = await api.checkAdmin(refreshedToken);
                if (retryCheck.isAdmin) {
                  setIsAuthenticated(true);
                  var savedEmailR = "";
                  var savedNameR = "Admin";
                  try { savedEmailR = localStorage.getItem(ADMIN_EMAIL_KEY) || ""; } catch {}
                  try { savedNameR = localStorage.getItem(ADMIN_NAME_KEY) || "Admin"; } catch {}
                  setUserEmail(savedEmailR);
                  setUserName(savedNameR);
                  setIsMaster(retryCheck.isMaster || false);
                  setAllowedTabs(retryCheck.permissions || []);
                  if (retryCheck.permissions && retryCheck.permissions.length > 0) {
                    const firstAllowedR = retryCheck.permissions[0] as Tab;
                    if (navItems.some((n) => n.id === firstAllowedR)) {
                      setActiveTab(firstAllowedR);
                    }
                  }
                } else {
                  console.warn("[AdminPage] Refreshed token still not admin. Clearing.");
                  clearAdminStorage();
                  setIsAuthenticated(false);
                }
              } catch {
                console.warn("[AdminPage] Retry checkAdmin after refresh failed. Clearing.");
                clearAdminStorage();
                setIsAuthenticated(false);
              }
            } else {
              console.warn("[AdminPage] Token refresh failed. Clearing.");
              clearAdminStorage();
              setIsAuthenticated(false);
            }
          }
        } catch (adminErr) {
          console.error("Erro ao verificar permissao admin:", adminErr);
          // Token might be expired — try refresh
          var refreshed2 = await refreshAdminToken();
          if (refreshed2) {
            try {
              var adminCheck2 = await api.checkAdmin(refreshed2);
              if (adminCheck2.isAdmin) {
                setIsAuthenticated(true);
                var savedEmail2 = "";
                var savedName2 = "Admin";
                try { savedEmail2 = localStorage.getItem(ADMIN_EMAIL_KEY) || ""; } catch {}
                try { savedName2 = localStorage.getItem(ADMIN_NAME_KEY) || "Admin"; } catch {}
                setUserEmail(savedEmail2);
                setUserName(savedName2);
                setIsMaster(adminCheck2.isMaster || false);
                setAllowedTabs(adminCheck2.permissions || []);
              } else {
                clearAdminStorage();
                setIsAuthenticated(false);
              }
            } catch {
              clearAdminStorage();
              setIsAuthenticated(false);
            }
          } else {
            clearAdminStorage();
            setIsAuthenticated(false);
          }
        }
      } catch (e) {
        console.error("Exceção ao verificar sessão:", e);
        setIsAuthenticated(false);
      } finally {
        setCheckingSession(false);
      }
    };
    checkSession();
  }, []);

  // Fetch header logo
  useEffect(() => {
    api.getLogo()
      .then((data) => {
        if (data?.hasLogo && data.url) {
          setLogoUrl(data.url);
          try { localStorage.setItem(ADMIN_LOGO_CACHE_KEY, data.url); } catch {}
        } else {
          setLogoUrl(null);
          try { localStorage.removeItem(ADMIN_LOGO_CACHE_KEY); } catch {}
        }
      })
      .catch(() => {})
      .finally(() => setLogoLoading(false));
  }, []);

  // Seed data on first load (only when authenticated)
  useEffect(() => {
    if (!isAuthenticated) {
      setInitializing(false);
      return;
    }

    const init = async () => {
      setInitializing(true);
      try {
        await api.seedData();
      } catch (e) {
        console.error("Error during admin init seed:", e);
      } finally {
        setInitializing(false);
      }
    };
    init();
  }, [isAuthenticated]);

  const handleLoginSuccess = async (accessToken: string, email: string, name: string, loginIsMaster: boolean, loginPermissions: string[]) => {
    setIsAuthenticated(true);
    setUserEmail(email);
    setUserName(name);
    // Use permissions data already fetched by AdminLoginPage (avoids redundant checkAdmin call that could fail)
    setIsMaster(loginIsMaster);
    setAllowedTabs(loginPermissions);
    if (!loginIsMaster && loginPermissions.length > 0) {
      const firstAllowed = loginPermissions[0] as Tab;
      if (navItems.some((n) => n.id === firstAllowed)) {
        setActiveTab(firstAllowed);
      }
    }
    // Log the login event
    logAdminAction("login", email, name, "Login realizado com sucesso no painel admin");
  };

  const handleLogout = async () => {
    // Log the logout event before signing out
    await logAdminAction("logout", userEmail, userName, "Logout do painel admin");
    // Clear admin-specific localStorage (also clears Supabase local session)
    clearAdminStorage();
    // On LOGOUT (unlike login), calling signOut is safe and desired:
    // it clears the Supabase client's in-memory session so it doesn't
    // leak to the customer-facing side if the user navigates away.
    // JWT revocation on logout is acceptable since the admin is done.
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch (e) {
      console.warn("[AdminLogout] signOut error (ignored):", e);
    }
    setIsAuthenticated(false);
    setUserEmail("");
    setUserName("");
    setActiveTab("orders");
  };

  // Bootstrap: claim admin with current session token
  const handleClaimAdmin = async () => {
    setBootstrapLoading(true);
    setBootstrapError(null);
    try {
      const result = await api.claimAdmin(bootstrapToken);
      if (result.ok) {
        // Refresh session to pick up updated metadata
        const { data: { session } } = await supabase.auth.getSession();
        const email = session?.user?.email || bootstrapEmail;
        const name = session?.user?.user_metadata?.name || "Admin";
        setNeedsBootstrap(false);
        setIsAuthenticated(true);
        setUserEmail(email);
        setUserName(name);
        logAdminAction("bootstrap", email, name, "Primeiro administrador configurado via bootstrap");
      } else {
        setBootstrapError(result.error || "Erro ao ativar admin.");
      }
    } catch (err: any) {
      console.error("[Bootstrap] Error:", err);
      setBootstrapError(err.message || "Erro ao ativar admin.");
    } finally {
      setBootstrapLoading(false);
    }
  };

  const renderContent = () => {
    // Permission guard: if not master and tab not in allowed list, deny
    if (!isMaster && allowedTabs.length > 0 && allowedTabs.indexOf(activeTab) === -1) {
      return (
        <div className="flex flex-col items-center justify-center py-20">
          <Shield className="w-12 h-12 text-gray-300 mb-3" />
          <p className="text-gray-600" style={{ fontSize: "1rem", fontWeight: 600 }}>Acesso Restrito</p>
          <p className="text-gray-400 mt-1" style={{ fontSize: "0.85rem" }}>
            Você não tem permissão para acessar esta aba.
          </p>
        </div>
      );
    }
    switch (activeTab) {
      case "dashboard":
        return <AdminDashboard />;
      case "orders":
        return <AdminOrders />;
      case "products":
        return <AdminProducts />;
      case "categories":
        return <AdminCategories />;
      case "attributes":
        return <AdminAttributes />;
      case "clients":
        return <AdminClients />;
      case "banners":
        return <AdminBanners />;
      case "mid-banners":
        return <AdminMidBanners />;
      case "footer-badges":
        return <AdminFooterBadges />;
      case "hp-categories":
        return <AdminHomepageCategories />;
      case "super-promo":
        return <AdminSuperPromo />;
      case "brands":
        return <AdminBrands />;
      case "auto-categ":
        return <AdminAutoCateg />;
      case "reviews":
        return <AdminReviews />;
      case "api-sige":
        return <AdminApiSige />;
      case "paghiper":
        return <AdminPagHiper />;
      case "mercadopago":
        return <AdminMercadoPago />;
      case "shipping":
        return <AdminShipping />;
      case "sisfrete-wt":
        return <AdminSisfreteWT />;
      case "audit-log":
        return <AdminAuditLog />;
      case "settings":
        return <AdminSettings />;
      case "admins":
        return <AdminAdmins />;
      case "email-marketing":
        return <AdminEmailMarketing />;
      case "coupons":
        return <AdminCoupons />;
      case "warranty":
        return <AdminWarranty />;
      case "lgpd-requests":
        return <AdminLgpdRequests />;
      case "affiliates":
        return <AdminAffiliates />;
      case "branches":
        return <AdminBranches />;
      case "regression-test":
        return <AdminRegressionTest />;
      case "error-scanner":
        return <AdminErrorScanner />;
      case "marketing":
        return <AdminMarketing />;
      case "exit-intent":
        return <AdminExitIntent />;
      case "whatsapp":
        return <AdminWhatsApp />;
      case "reels":
        return <AdminReels />;
      case "influencers":
        return <AdminInfluencers />;
      case "infrastructure":
        return <AdminInfrastructure />;
      case "faq":
        return <AdminFaq />;
      case "dimensions":
        return <AdminDimensions />;
    }
  };

  // Session check loading
  if (checkingSession) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-red-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-400" style={{ fontSize: "0.9rem" }}>
            Verificando sessao...
          </p>
        </div>
      </div>
    );
  }

  // Not authenticated — show login
  if (!isAuthenticated) {
    // Bootstrap screen: no admins exist yet, user has valid session
    if (needsBootstrap) {
      return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-amber-600/5 rounded-full blur-3xl" />
          </div>
          <div className="relative w-full max-w-md">
            <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-2xl overflow-hidden">
              <div className="bg-gray-800 border-b border-gray-700 px-8 pt-8 pb-6 text-center">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="Carretão Auto Peças"
                    className="h-14 w-auto max-w-[220px] object-contain mx-auto mb-4"
                    decoding="async"
                  />
                ) : null}
                <h1 className="text-white mb-1" style={{ fontSize: "1.25rem", fontWeight: 600 }}>
                  Configuração Inicial
                </h1>
                <p className="text-gray-400" style={{ fontSize: "0.85rem" }}>
                  Painel Administrativo
                </p>
              </div>

              <div className="p-8">
                <div className="bg-amber-900/30 border border-amber-700/50 rounded-xl p-5 mb-5">
                  <ShieldCheck className="w-10 h-10 text-amber-400 mx-auto mb-3" />
                  <p className="text-amber-300 mb-2 text-center" style={{ fontSize: "0.95rem", fontWeight: 600 }}>
                    Primeiro Administrador
                  </p>
                  <p className="text-amber-400/70 leading-relaxed text-center" style={{ fontSize: "0.8rem" }}>
                    Nenhum administrador foi configurado ainda. Deseja ativar{" "}
                    <span className="text-amber-300 font-medium">{bootstrapEmail}</span>{" "}
                    como administrador do painel?
                  </p>
                </div>

                {bootstrapError && (
                  <div className="bg-red-900/30 border border-red-800/50 rounded-xl p-4 mb-4 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-red-300" style={{ fontSize: "0.85rem" }}>
                      {bootstrapError}
                    </p>
                  </div>
                )}

                <button
                  onClick={handleClaimAdmin}
                  disabled={bootstrapLoading}
                  className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-amber-800 disabled:cursor-not-allowed text-white py-3 rounded-xl flex items-center justify-center gap-2 transition-colors mb-3"
                  style={{ fontSize: "0.95rem", fontWeight: 600 }}
                >
                  {bootstrapLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Ativando...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-5 h-5" />
                      Sim, ativar como admin
                    </>
                  )}
                </button>

                <div className="text-center">
                  <Link
                    to="/"
                    className="inline-flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors"
                    style={{ fontSize: "0.85rem" }}
                  >
                    Voltar ao site
                  </Link>
                </div>
              </div>

              <div className="border-t border-gray-700 px-8 py-4 text-center">
                <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>
                  Esta ação só está disponível quando nenhum admin existe
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return <AdminLoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  // Initializing admin data
  if (initializing) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-red-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600" style={{ fontSize: "0.95rem" }}>
            Carregando painel administrativo...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar Overlay (mobile) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-64 bg-gray-900 flex flex-col transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Logo */}
        <div className="p-5 border-b border-gray-800 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 min-w-0">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Carretão Auto Peças"
                className="h-10 w-auto max-w-[180px] object-contain"
                onError={() => {
                  setLogoUrl(null);
                  try { localStorage.removeItem(ADMIN_LOGO_CACHE_KEY); } catch {}
                }}
                decoding="async"
              />
            ) : logoLoading ? (
              <div className="h-10 w-[140px] bg-gray-800 rounded-lg animate-pulse" />
            ) : null}
            <span className="text-gray-500 border-l border-gray-700 pl-2.5 shrink-0" style={{ fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Admin
            </span>
          </Link>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Admin profile */}
        <div className="px-4 py-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className={"w-9 h-9 rounded-full flex items-center justify-center " + (isMaster ? "bg-amber-600" : "bg-red-600")}>
              <User className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-white truncate" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                  {userName}
                </p>
                {isMaster && (
                  <span className="px-1.5 py-0.5 bg-amber-600/30 text-amber-400 rounded shrink-0" style={{ fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.05em" }}>
                    MASTER
                  </span>
                )}
              </div>
              <p className="text-gray-500 truncate" style={{ fontSize: "0.7rem" }}>
                {userEmail}
              </p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {/* Search filter */}
          <div className="px-1 pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <input
                type="text"
                value={navSearch}
                onChange={function (e) { setNavSearch(e.target.value); }}
                placeholder="Buscar..."
                className="w-full pl-8 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:border-gray-600 focus:ring-1 focus:ring-gray-600"
                style={{ fontSize: "0.78rem" }}
              />
              {navSearch && (
                <button onClick={function () { setNavSearch(""); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {navSections.map(function (section) {
            var visibleItems = section.items.filter(function (id) {
              if (!isMaster && allowedTabs.indexOf(id) < 0) return false;
              return true;
            });
            if (visibleItems.length === 0) return null;

            // Apply search filter
            var searchLower = navSearch.trim().toLowerCase();
            var filteredItems = searchLower
              ? visibleItems.filter(function (id) {
                  var item = getNavItem(id);
                  if (!item) return false;
                  return item.label.toLowerCase().indexOf(searchLower) >= 0 || id.toLowerCase().indexOf(searchLower) >= 0;
                })
              : visibleItems;

            if (filteredItems.length === 0) return null;

            // Aggregate badge count for section header
            var sectionBadgeCount = 0;
            visibleItems.forEach(function (id) { sectionBadgeCount += getNewCount(id); });

            var isCollapsed = section.collapsible !== false && !!collapsedSections[section.label] && !searchLower;
            // Auto-expand if active tab is in this section
            var activeInSection = section.items.indexOf(activeTab) >= 0;
            var showItems = !isCollapsed || activeInSection || !!searchLower;

            function toggleSection() {
              if (section.collapsible === false) return;
              setCollapsedSections(function (prev) {
                var next = { ...prev, [section.label]: !prev[section.label] };
                saveCollapsedSections(next);
                return next;
              });
            }

            return (
              <div key={section.label} className="mb-0.5">
                <button
                  onClick={toggleSection}
                  className={"w-full flex items-center gap-2 px-3 pt-3 pb-1.5 group transition-colors " + (section.collapsible !== false ? "cursor-pointer hover:bg-gray-800/50 rounded-md" : "cursor-default")}
                >
                  <section.icon className="w-3 h-3 text-gray-600 shrink-0" />
                  <span className="text-gray-500 group-hover:text-gray-400 transition-colors flex-1 text-left" style={{ fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {section.label}
                  </span>
                  {sectionBadgeCount > 0 && isCollapsed && !activeInSection && (
                    <span className="bg-red-500 text-white rounded-full flex items-center justify-center" style={{ fontSize: "0.55rem", fontWeight: 700, minWidth: "16px", height: "16px", padding: "0 4px" }}>
                      {sectionBadgeCount > 99 ? "99+" : sectionBadgeCount}
                    </span>
                  )}
                  {section.collapsible !== false && (
                    <ChevronDown className={"w-3 h-3 text-gray-600 transition-transform duration-200 " + (showItems ? "rotate-0" : "-rotate-90")} />
                  )}
                </button>

                {showItems && (
                  <div className="mt-0.5 space-y-0.5">
                    {filteredItems.map(function (id) {
                      var item = getNavItem(id);
                      if (!item) return null;
                      return (
                        <button
                          key={item.id}
                          onClick={function () {
                            setActiveTab(item!.id);
                            markTabAsSeen(item!.id);
                            setSidebarOpen(false);
                          }}
                          className={"w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors " + (
                            activeTab === item.id
                              ? "bg-red-600 text-white"
                              : "text-gray-400 hover:text-white hover:bg-gray-800"
                          )}
                          style={{ fontSize: "0.82rem" }}
                        >
                          <item.icon className="w-4 h-4 shrink-0" />
                          <span className="truncate">{item.label}</span>
                          {getNewCount(item.id) > 0 && (
                            <span
                              className={"ml-auto shrink-0 flex items-center justify-center rounded-full " + (activeTab === item.id ? "bg-white text-red-600" : "bg-red-500 text-white")}
                              style={{ fontSize: "0.6rem", fontWeight: 700, minWidth: "18px", height: "18px", padding: "0 5px", lineHeight: 1 }}
                            >
                              {getNewCount(item.id) > 99 ? "99+" : getNewCount(item.id)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* No results message */}
          {navSearch.trim() && navSections.every(function (section) {
            var searchLower = navSearch.trim().toLowerCase();
            return section.items.every(function (id) {
              var item = getNavItem(id);
              return !item || (item.label.toLowerCase().indexOf(searchLower) < 0 && id.toLowerCase().indexOf(searchLower) < 0);
            });
          }) && (
            <div className="px-3 py-6 text-center">
              <Search className="w-5 h-5 text-gray-600 mx-auto mb-2" />
              <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>Nenhum item encontrado</p>
            </div>
          )}

          <div className="pt-3 mt-3 border-t border-gray-800">
            <p className="text-gray-600 px-3 pt-1 pb-1" style={{ fontSize: "0.6rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Links Rápidos
            </p>
            <Link
              to="/"
              className="flex items-center gap-3 px-3 py-2.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              style={{ fontSize: "0.85rem" }}
            >
              <ExternalLink className="w-4 h-4" />
              Ver Site
            </Link>
            <Link
              to="/catalogo"
              className="flex items-center gap-3 px-3 py-2.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              style={{ fontSize: "0.85rem" }}
            >
              <Package className="w-4 h-4" />
              Catálogo
            </Link>
          </div>
        </nav>

        {/* Docs + Logout */}
        <div className="p-3 border-t border-gray-800 space-y-1">
          <Link
            to="/docs"
            target="_blank"
            className="w-full flex items-center gap-3 px-3 py-2.5 text-gray-400 hover:text-blue-400 hover:bg-gray-800 rounded-lg transition-colors"
            style={{ fontSize: "0.85rem" }}
          >
            <BookOpen className="w-4 h-4" />
            Documentacao Tecnica
            <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors"
            style={{ fontSize: "0.85rem" }}
          >
            <LogOut className="w-4 h-4" />
            Sair da Conta
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
          <div className="flex items-center justify-between px-4 lg:px-6 py-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-1.5 text-gray-400" style={{ fontSize: "0.8rem" }}>
                <span>Admin</span>
                <ChevronRight className="w-3.5 h-3.5" />
                {(function () {
                  var sec = navSections.find(function (s) { return s.items.indexOf(activeTab) >= 0; });
                  if (sec && sec.label !== "Geral") {
                    return (
                      <>
                        <span>{sec.label}</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </>
                    );
                  }
                  return null;
                })()}
                <span className="text-gray-700" style={{ fontWeight: 500 }}>
                  {navItems.find((n) => n.id === activeTab)?.label}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/"
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:text-red-600 hover:border-red-200 transition-colors"
                style={{ fontSize: "0.8rem" }}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Ver Site
              </Link>
              <div className="flex items-center gap-2">
                <span className="hidden md:block text-gray-500" style={{ fontSize: "0.8rem" }}>
                  {userEmail}
                </span>
                <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 lg:p-6">
          <ErrorBoundary>
            <Suspense fallback={
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
              </div>
            }>
              {renderContent()}
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}