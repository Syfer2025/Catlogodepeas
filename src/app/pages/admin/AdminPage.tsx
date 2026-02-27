import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import {
  Package,
  Layers,
  Settings,
  ExternalLink,
  Menu,
  X,
  LogOut,
  User,
  ChevronRight,
  Loader2,
  Tag,
  Users,
  Plug,
  CreditCard,
  BarChart3,
  Truck,
  Wallet,
  ShoppingCart,
  ScrollText,
  Image,
  LayoutGrid,
  Flame,
  ShieldCheck,
  AlertTriangle,
  Shield,
  Columns2,
  BadgeCheck,
  Mail,
  LayoutDashboard,
  Ticket,
  FileCheck,
  Award,
  Zap,
  Star,
  Handshake,
  Building2,
} from "lucide-react";
import { AdminProducts } from "./AdminProducts";
import { AdminCategories } from "./AdminCategories";
import { AdminSettings } from "./AdminSettings";
import { AdminLoginPage } from "./AdminLoginPage";
import { AdminAttributes } from "./AdminAttributes";
import { AdminClients } from "./AdminClients";
import { AdminApiSige } from "./AdminApiSige";
import { AdminPagHiper } from "./AdminPagHiper";
import { AdminGA4 } from "./AdminGA4";
import { AdminShipping } from "./AdminShipping";
import { AdminMercadoPago } from "./AdminMercadoPago";
import { AdminOrders } from "./AdminOrders";
import { AdminAuditLog } from "./AdminAuditLog";
import { AdminBanners } from "./AdminBanners";
import { AdminSuperPromo } from "./AdminSuperPromo";
import { AdminAdmins } from "./AdminAdmins";
import { AdminHomepageCategories } from "./AdminHomepageCategories";
import { AdminMidBanners } from "./AdminMidBanners";
import { AdminFooterBadges } from "./AdminFooterBadges";
import { AdminEmailMarketing } from "./AdminEmailMarketing";
import { AdminDashboard } from "./AdminDashboard";
import { AdminCoupons } from "./AdminCoupons";
import { AdminLgpdRequests } from "./AdminLgpdRequests";
import { AdminBrands } from "./AdminBrands";
import { AdminAutoCateg } from "./AdminAutoCateg";
import { AdminReviews } from "./AdminReviews";
import { AdminWarranty } from "./AdminWarranty";
import { AdminAffiliates } from "./AdminAffiliates";
import { AdminSisfreteWT } from "./AdminSisfreteWT";
import { AdminSafrapay } from "./AdminSafrapay";
import { AdminBranches } from "./AdminBranches";
import * as api from "../../services/api";
import { supabase } from "../../services/supabaseClient";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { getValidAdminToken, refreshAdminToken, clearAdminStorage, saveAdminSession, ADMIN_EMAIL_KEY, ADMIN_NAME_KEY } from "./adminAuth";

const ADMIN_LOGO_CACHE_KEY = "carretao_admin_logo_url";

type Tab = "dashboard" | "orders" | "products" | "categories" | "attributes" | "clients" | "coupons" | "banners" | "mid-banners" | "hp-categories" | "super-promo" | "brands" | "auto-categ" | "reviews" | "api-sige" | "paghiper" | "mercadopago" | "safrapay" | "shipping" | "sisfrete-wt" | "ga4" | "audit-log" | "settings" | "admins" | "footer-badges" | "email-marketing" | "lgpd-requests" | "warranty" | "affiliates" | "branches";

const navItems: { id: Tab; label: string; icon: typeof Package }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "orders", label: "Pedidos", icon: ShoppingCart },
  { id: "products", label: "Produtos", icon: Package },
  { id: "categories", label: "Categorias", icon: Layers },
  { id: "attributes", label: "Atributos", icon: Tag },
  { id: "brands", label: "Marcas", icon: Award },
  { id: "auto-categ", label: "Auto-Categ.", icon: Zap },
  { id: "coupons", label: "Cupons", icon: Ticket },
  { id: "warranty", label: "Garantia", icon: ShieldCheck },
  { id: "affiliates", label: "Afiliados", icon: Handshake },
  { id: "clients", label: "Clientes", icon: Users },
  { id: "reviews", label: "Avaliações", icon: Star },
  { id: "email-marketing", label: "Email Marketing", icon: Mail },
  { id: "banners", label: "Banners Topo", icon: Image },
  { id: "mid-banners", label: "Banners Mid", icon: Columns2 },
  { id: "hp-categories", label: "Categorias HP", icon: LayoutGrid },
  { id: "super-promo", label: "Super Promo", icon: Flame },
  { id: "footer-badges", label: "Selos Rodapé", icon: BadgeCheck },
  { id: "api-sige", label: "API SIGE", icon: Plug },
  { id: "paghiper", label: "PagHiper", icon: CreditCard },
  { id: "mercadopago", label: "Mercado Pago", icon: Wallet },
  { id: "safrapay", label: "SafraPay", icon: CreditCard },
  { id: "shipping", label: "SisFrete", icon: Truck },
  { id: "sisfrete-wt", label: "SisFrete WT", icon: Truck },
  { id: "ga4", label: "Analytics", icon: BarChart3 },
  { id: "settings", label: "Configurações", icon: Settings },
  { id: "admins", label: "Administradores", icon: Shield },
  { id: "audit-log", label: "Log de Alterações", icon: ScrollText },
  { id: "lgpd-requests", label: "LGPD", icon: FileCheck },
  { id: "branches", label: "Filiais", icon: Building2 },
];

// Grouped navigation for sidebar sections
interface NavSection {
  label: string;
  items: Tab[];
}

const navSections: NavSection[] = [
  { label: "Geral", items: ["dashboard"] },
  { label: "Vendas", items: ["orders", "coupons", "warranty", "affiliates"] },
  { label: "Catálogo", items: ["products", "categories", "attributes", "brands", "auto-categ"] },
  { label: "Clientes", items: ["clients", "reviews", "email-marketing"] },
  { label: "Aparência", items: ["banners", "mid-banners", "hp-categories", "super-promo", "footer-badges", "branches"] },
  { label: "Integrações", items: ["api-sige", "paghiper", "mercadopago", "safrapay", "shipping", "sisfrete-wt", "ga4"] },
  { label: "Sistema", items: ["settings", "admins", "audit-log", "lgpd-requests"] },
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
      console.log("[AdminPage] Periodic token refresh check...");
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
        console.log("[Bootstrap] Admin claimed:", result.email);
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
      case "safrapay":
        return <AdminSafrapay />;
      case "shipping":
        return <AdminShipping />;
      case "sisfrete-wt":
        return <AdminSisfreteWT />;
      case "ga4":
        return <AdminGA4 />;
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
          {navSections.map((section) => {
            const visibleItems = section.items.filter((id) => {
              if (isMaster) return true;
              return allowedTabs.indexOf(id) >= 0;
            });
            if (visibleItems.length === 0) return null;
            return (
              <div key={section.label}>
                <p className="text-gray-600 px-3 pt-3 pb-1" style={{ fontSize: "0.6rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {section.label}
                </p>
                {visibleItems.map((id) => {
                  const item = getNavItem(id);
                  if (!item) return null;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        markTabAsSeen(item.id);
                        setSidebarOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                        activeTab === item.id
                          ? "bg-red-600 text-white"
                          : "text-gray-400 hover:text-white hover:bg-gray-800"
                      }`}
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
            );
          })}

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

        {/* Logout */}
        <div className="p-3 border-t border-gray-800">
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
            {renderContent()}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}