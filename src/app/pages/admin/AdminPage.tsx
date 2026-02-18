import { useState, useEffect } from "react";
import { Link } from "react-router";
import {
  LayoutDashboard,
  Package,
  Layers,
  MessageSquare,
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
} from "lucide-react";
import { AdminDashboard } from "./AdminDashboard";
import { AdminProducts } from "./AdminProducts";
import { AdminCategories } from "./AdminCategories";
import { AdminMessages } from "./AdminMessages";
import { AdminSettings } from "./AdminSettings";
import { AdminLoginPage } from "./AdminLoginPage";
import { AdminAttributes } from "./AdminAttributes";
import { AdminClients } from "./AdminClients";
import { AdminApiSige } from "./AdminApiSige";
import { AdminPagHiper } from "./AdminPagHiper";
import * as api from "../../services/api";
import { supabase } from "../../services/supabaseClient";
import { ErrorBoundary } from "../../components/ErrorBoundary";

const ADMIN_LOGO_CACHE_KEY = "carretao_admin_logo_url";

type Tab = "dashboard" | "products" | "categories" | "messages" | "attributes" | "clients" | "api-sige" | "paghiper" | "settings";

const navItems: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "products", label: "Produtos", icon: Package },
  { id: "categories", label: "Categorias", icon: Layers },
  { id: "messages", label: "Mensagens", icon: MessageSquare },
  { id: "attributes", label: "Atributos", icon: Tag },
  { id: "clients", label: "Clientes", icon: Users },
  { id: "api-sige", label: "API SIGE", icon: Plug },
  { id: "paghiper", label: "PagHiper", icon: CreditCard },
  { id: "settings", label: "Configuracoes", icon: Settings },
];

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

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

  // Check for existing session on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error("Erro ao verificar sessão existente:", error.message);
          setIsAuthenticated(false);
        } else if (session?.access_token) {
          setIsAuthenticated(true);
          setUserEmail(session.user?.email || "");
          setUserName(session.user?.user_metadata?.name || "Admin");
        } else {
          setIsAuthenticated(false);
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

  // Seed data on first load & get unread count (only when authenticated)
  useEffect(() => {
    if (!isAuthenticated) {
      setInitializing(false);
      return;
    }

    const init = async () => {
      setInitializing(true);
      try {
        await api.seedData();
        const messages = await api.getMessages();
        setUnreadCount(messages.filter((m) => !m.read).length);
      } catch (e) {
        console.error("Error during admin init seed:", e);
      } finally {
        setInitializing(false);
      }
    };
    init();
  }, [isAuthenticated]);

  const refreshUnread = async () => {
    try {
      const messages = await api.getMessages();
      setUnreadCount(messages.filter((m) => !m.read).length);
    } catch (e) {
      console.error("Error refreshing unread count:", e);
    }
  };

  const handleLoginSuccess = (accessToken: string, email: string, name: string) => {
    setIsAuthenticated(true);
    setUserEmail(email);
    setUserName(name);
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error("Erro ao fazer logout:", e);
    }
    setIsAuthenticated(false);
    setUserEmail("");
    setUserName("");
    setActiveTab("dashboard");
  };

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return <AdminDashboard />;
      case "products":
        return <AdminProducts />;
      case "categories":
        return <AdminCategories />;
      case "messages":
        return <AdminMessages onUpdate={refreshUnread} />;
      case "attributes":
        return <AdminAttributes />;
      case "clients":
        return <AdminClients />;
      case "api-sige":
        return <AdminApiSige />;
      case "paghiper":
        return <AdminPagHiper />;
      case "settings":
        return <AdminSettings />;
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
            <div className="w-9 h-9 bg-red-600 rounded-full flex items-center justify-center">
              <User className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-white truncate" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                {userName}
              </p>
              <p className="text-gray-500 truncate" style={{ fontSize: "0.7rem" }}>
                {userEmail}
              </p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <p className="text-gray-600 px-3 pt-2 pb-1" style={{ fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Menu Principal
          </p>
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                activeTab === item.id
                  ? "bg-red-600 text-white"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
              style={{ fontSize: "0.85rem" }}
            >
              <item.icon className="w-4.5 h-4.5" />
              <span>{item.label}</span>
              {item.id === "messages" && unreadCount > 0 && (
                <span
                  className={`ml-auto px-1.5 py-0.5 rounded-full ${
                    activeTab === item.id ? "bg-white/20 text-white" : "bg-red-600 text-white"
                  }`}
                  style={{ fontSize: "0.65rem", fontWeight: 600 }}
                >
                  {unreadCount}
                </span>
              )}
            </button>
          ))}

          <div className="pt-4 mt-4 border-t border-gray-800">
            <p className="text-gray-600 px-3 pt-1 pb-2" style={{ fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Links Rapidos
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
              Catalogo
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