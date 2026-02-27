import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import {
  Menu,
  X,
  Wrench,
  Headset,
  ChevronDown,
  MapPin,
  Clock,
  MessageCircle,
  Building2,
  User,
  ShoppingCart,
  Lock,
  Package,
  LogOut,
  Heart,
  Layers,
} from "lucide-react";
import { SearchAutocomplete } from "./SearchAutocomplete";
import { CategoryMegaMenu, MobileCategoryMenu } from "./CategoryMegaMenu";
import { supabase } from "../services/supabaseClient";
import { getValidAccessToken } from "../services/supabaseClient";
import * as api from "../services/api";
import { useCart } from "../contexts/CartContext";
import { useHomepageInit } from "../contexts/HomepageInitContext";
import { UserAvatar } from "./AvatarPicker";
import { HeaderCepInput } from "./HeaderCepInput";

/* Badge bounce keyframes — injected once */
var _badgeCssInjected = false;
(function injectBadgeCss() {
  if (_badgeCssInjected || typeof document === "undefined") return;
  _badgeCssInjected = true;
  var style = document.createElement("style");
  style.textContent = "@keyframes cart-badge-bounce{0%{transform:scale(1)}15%{transform:scale(1.35)}30%{transform:scale(0.85)}45%{transform:scale(1.15)}60%{transform:scale(0.95)}75%{transform:scale(1.05)}100%{transform:scale(1)}}";
  document.head.appendChild(style);
})();

const UNIDADES = [
  { nome: "Matriz", tel: "0800 643 1170", href: "tel:08006431170" },
  { nome: "Maringá-PR", tel: "(44) 3123-3000", href: "tel:+554431233000" },
  { nome: "Curitiba-PR", tel: "(41) 3123-8900", href: "tel:+554131238900" },
  { nome: "Itajaí-SC", tel: "(47) 3248-2100", href: "tel:+554732482100" },
  { nome: "Sinop-MT", tel: "(66) 3515-5115", href: "tel:+556635155115" },
  { nome: "Sinop-MT", tel: "(66) 99673-6133", href: "tel:+5566996736133", isMobile: true },
  { nome: "Matupá-MT", tel: "(66) 99201-7474", href: "tel:+5566992017474", isMobile: true },
  { nome: "Várzea Grande-MT", tel: "(65) 2193-8550", href: "tel:+556521938550" },
];

const LOGO_CACHE_KEY = "carretao_header_logo_url";

export function Header() {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileContactOpen, setMobileContactOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(function () {
    try { return localStorage.getItem(LOGO_CACHE_KEY); } catch { return null; }
  });
  const [logoLoading, setLogoLoading] = useState(true);

  // ── Avatar cache key ──
  var AVATAR_CACHE_KEY = "carretao_user_session_cache";

  // Initialize userSession from localStorage cache to prevent avatar flash
  const [userSession, setUserSession] = useState<{ name: string; avatarId?: string | null; customAvatarUrl?: string | null } | null>(function () {
    try {
      var cached = localStorage.getItem(AVATAR_CACHE_KEY);
      if (cached) return JSON.parse(cached);
    } catch {}
    return null;
  });

  const { totalItems, openDrawer } = useCart();
  const { data: initData, loading: initLoading } = useHomepageInit();

  // Use logo from combined init data
  useEffect(function () {
    if (initLoading) return;
    if (initData && initData.logo) {
      if (initData.logo.hasLogo && initData.logo.url) {
        setLogoUrl(initData.logo.url);
        try { localStorage.setItem(LOGO_CACHE_KEY, initData.logo.url); } catch {}
      } else {
        setLogoUrl(null);
        try { localStorage.removeItem(LOGO_CACHE_KEY); } catch {}
      }
    }
    setLogoLoading(false);
  }, [initData, initLoading]);

  useEffect(function () {
    // Helper to set session + fetch avatar data
    // IMPORTANT: Does NOT reset avatar to null — keeps cached/previous value
    // until the API responds, preventing the avatar "flash"
    function setSessionWithAvatar(u: any, token: string) {
      var sessionName = (u.user_metadata && u.user_metadata.name) || (u.email ? u.email.split("@")[0] : "Usuário");

      // Only set the name immediately IF we don't already have a cached session.
      // This avoids resetting avatarId/customAvatarUrl to null (which causes flash).
      setUserSession(function (prev) {
        if (prev && prev.avatarId !== undefined) return prev; // keep cached data
        return { name: sessionName, avatarId: null, customAvatarUrl: null };
      });

      // Fetch avatar from profile (non-blocking)
      // Use getValidAccessToken to ensure we have a fresh token before calling userMe
      getValidAccessToken().then(function (freshToken) {
        var t = freshToken || token;
        api.userMe(t).then(function (prof) {
          var newSession = { name: prof.name || sessionName, avatarId: prof.avatarId || null, customAvatarUrl: prof.customAvatarUrl || null };
          setUserSession(newSession);
          try { localStorage.setItem(AVATAR_CACHE_KEY, JSON.stringify(newSession)); } catch {}
        }).catch(function () {});
      });
    }

    // Check user session
    supabase.auth.getSession().then(function (result) {
      var data = result.data;
      if (data.session && data.session.user) {
        setSessionWithAvatar(data.session.user, data.session.access_token);
      } else {
        setUserSession(null);
        try { localStorage.removeItem(AVATAR_CACHE_KEY); } catch {}
      }
    });
  }, []);

  return (
    <header className="w-full sticky top-0 z-50">
      {/* Main header */}
      <div className="bg-white shadow-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 py-2 md:py-3 flex items-center justify-between gap-3 md:gap-4">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0 group" aria-label="Carretão Auto Peças - Página inicial">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Carretão Auto Peças"
                className="h-10 md:h-14 w-auto max-w-[220px] object-contain"
                onError={function () {
                  setLogoUrl(null);
                  try { localStorage.removeItem(LOGO_CACHE_KEY); } catch {}
                }}
                width={220}
                height={56}
                decoding="async"
                sizes="220px"
              />
            ) : logoLoading ? (
              <div className="h-14 w-[180px] bg-gray-100 rounded-lg animate-pulse" />
            ) : (
              <>
                <div className="bg-gradient-to-br from-red-600 to-red-700 rounded-xl p-2 shadow-sm group-hover:shadow-md transition-shadow">
                  <Wrench className="w-6 h-6 text-white" />
                </div>
                <div className="hidden sm:block">
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-red-600" style={{ fontSize: "1.4rem", fontWeight: 800, letterSpacing: "-0.02em" }}>
                      Auto
                    </span>
                    <span className="text-gray-800" style={{ fontSize: "1.4rem", fontWeight: 800, letterSpacing: "-0.02em" }}>
                      Parts
                    </span>
                  </div>
                  <p
                    className="text-gray-400"
                    style={{ fontSize: "0.62rem", lineHeight: 1, marginTop: "-3px", letterSpacing: "0.08em", textTransform: "uppercase" }}
                  >
                    Catálogo de Peças
                  </p>
                </div>
              </>
            )}
          </Link>

          {/* Search bar — desktop */}
          <div className="flex-1 max-w-xl hidden md:block">
            <SearchAutocomplete variant="header" />
          </div>

          {/* Central de Atendimento — desktop */}
          <div className="hidden lg:block relative group shrink-0">
            {/* Trigger */}
            <button className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-600 hover:text-red-600 hover:bg-red-50/70 transition-all cursor-pointer" aria-label="Central de Atendimento" aria-haspopup="true">
              <div className="bg-red-50 group-hover:bg-red-100 rounded-full p-2 transition-colors">
                <Headset className="w-5 h-5 text-red-600" />
              </div>
              <div className="text-left">
                <p style={{ fontSize: "0.8rem", fontWeight: 600 }} className="text-gray-800 group-hover:text-red-600 transition-colors leading-tight">
                  Fale Conosco
                </p>
                <p style={{ fontSize: "0.65rem" }} className="text-gray-500 leading-tight">
                  Central de Atendimento
                </p>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400 group-hover:text-red-500 transition-transform group-hover:rotate-180" />
            </button>

            {/* Dropdown — hover */}
            <div className="absolute right-0 top-full pt-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-[200]">
              <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-[370px] overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-red-600 to-red-700 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-white/20 rounded-full p-2">
                      <Headset className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-white" style={{ fontSize: "1rem", fontWeight: 700 }}>
                        Fale Conosco
                      </h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Clock className="w-3 h-3 text-red-200" />
                        <p className="text-red-100" style={{ fontSize: "0.72rem" }}>
                          Seg. a Sex. 8h as 18h &bull; Sab. 8h as 12h
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* WhatsApp */}
                <div className="px-5 py-3.5 border-b border-gray-100">
                  <a
                    href="https://wa.me/5544997330202"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg px-4 py-3 transition-colors group/wa"
                  >
                    <div className="bg-green-500 rounded-full p-2 shrink-0">
                      <MessageCircle className="w-4.5 h-4.5 text-white" />
                    </div>
                    <div className="flex-1">
                      <p
                        className="text-green-800"
                        style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}
                      >
                        WhatsApp Oficial
                      </p>
                      <p className="text-green-700" style={{ fontSize: "1rem", fontWeight: 700 }}>
                        (44) 99733-0202
                      </p>
                    </div>
                    <span
                      className="text-green-600 group-hover/wa:translate-x-0.5 transition-transform"
                      style={{ fontSize: "0.75rem", fontWeight: 500 }}
                    >
                      Chamar &rarr;
                    </span>
                  </a>
                </div>

                {/* Nossas Unidades */}
                <div className="px-5 py-3">
                  <div className="flex items-center gap-2 mb-2.5">
                    <Building2 className="w-3.5 h-3.5 text-red-600" />
                    <h4
                      className="text-gray-800"
                      style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}
                    >
                      Nossas Unidades
                    </h4>
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    {UNIDADES.map(function (u, i) {
                      return (
                        <a
                          key={u.nome + "-" + i}
                          href={u.href}
                          className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-red-50 transition-colors group/unit"
                        >
                          <MapPin
                            className="w-3 h-3 text-gray-300 group-hover/unit:text-red-500 mt-0.5 shrink-0 transition-colors"
                          />
                          <div className="min-w-0">
                            <p
                              className="text-gray-500 group-hover/unit:text-gray-700 truncate transition-colors"
                              style={{ fontSize: "0.68rem", fontWeight: 500, lineHeight: 1.3 }}
                            >
                              {u.nome}
                            </p>
                            <p
                              className="text-gray-800 group-hover/unit:text-red-600 font-mono transition-colors"
                              style={{ fontSize: "0.75rem", fontWeight: 600, lineHeight: 1.3 }}
                            >
                              {u.tel}
                            </p>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* User account — desktop */}
          {userSession ? (
            <div className="hidden md:block relative group/account shrink-0">
              {/* Trigger */}
              <button
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-600 hover:text-red-600 hover:bg-red-50/70 transition-all cursor-pointer"
                aria-label={"Minha conta - " + userSession.name}
                aria-haspopup="true"
              >
                <UserAvatar avatarId={userSession.avatarId} customAvatarUrl={userSession.customAvatarUrl} size="sm" />
                <div className="text-left">
                  <p style={{ fontSize: "0.8rem", fontWeight: 600 }} className="leading-tight">
                    {userSession.name.split(" ")[0]}
                  </p>
                  <p style={{ fontSize: "0.65rem" }} className="text-gray-500 leading-tight">
                    Minha Conta
                  </p>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-gray-400 group-hover/account:text-red-500 transition-transform group-hover/account:rotate-180" />
              </button>

              {/* Dropdown — hover */}
              <div className="absolute right-0 top-full pt-1 opacity-0 invisible group-hover/account:opacity-100 group-hover/account:visible transition-all duration-200 z-[200]">
                <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-[220px] overflow-hidden">
                  {/* Header greeting */}
                  <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2.5">
                    <UserAvatar avatarId={userSession.avatarId} customAvatarUrl={userSession.customAvatarUrl} size="sm" />
                    <p className="text-gray-800" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                      {"Olá, " + userSession.name.split(" ")[0] + "!"}
                    </p>
                  </div>

                  {/* Quick links */}
                  <nav className="py-1">
                    <Link
                      to="/minha-conta?tab=perfil"
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-red-50 transition-colors group/item"
                    >
                      <User className="w-4 h-4 text-gray-400 group-hover/item:text-red-600 transition-colors" />
                      <span className="text-gray-700 group-hover/item:text-red-600 transition-colors" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                        Meus Dados
                      </span>
                    </Link>
                    <Link
                      to="/minha-conta?tab=senha"
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-red-50 transition-colors group/item"
                    >
                      <Lock className="w-4 h-4 text-gray-400 group-hover/item:text-red-600 transition-colors" />
                      <span className="text-gray-700 group-hover/item:text-red-600 transition-colors" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                        Alterar Senha
                      </span>
                    </Link>
                    <Link
                      to="/minha-conta?tab=pedidos"
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-red-50 transition-colors group/item"
                    >
                      <Package className="w-4 h-4 text-gray-400 group-hover/item:text-red-600 transition-colors" />
                      <span className="text-gray-700 group-hover/item:text-red-600 transition-colors" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                        Meus Pedidos
                      </span>
                    </Link>
                    <Link
                      to="/minha-conta?tab=enderecos"
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-red-50 transition-colors group/item"
                    >
                      <MapPin className="w-4 h-4 text-gray-400 group-hover/item:text-red-600 transition-colors" />
                      <span className="text-gray-700 group-hover/item:text-red-600 transition-colors" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                        Endereços
                      </span>
                    </Link>
                    <Link
                      to="/minha-conta?tab=favoritos"
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-red-50 transition-colors group/item"
                    >
                      <Heart className="w-4 h-4 text-gray-400 group-hover/item:text-red-600 transition-colors" />
                      <span className="text-gray-700 group-hover/item:text-red-600 transition-colors" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                        Favoritos
                      </span>
                    </Link>
                  </nav>

                  {/* Divider + Logout */}
                  <div className="border-t border-gray-100 py-1">
                    <button
                      onClick={function () {
                        supabase.auth.signOut().then(function () {
                          api.invalidateUserMeCache();
                          setUserSession(null);
                          try { localStorage.removeItem(AVATAR_CACHE_KEY); } catch {}
                          navigate("/conta", { replace: true });
                        });
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-red-50 transition-colors group/item cursor-pointer"
                    >
                      <LogOut className="w-4 h-4 text-gray-400 group-hover/item:text-red-600 transition-colors" />
                      <span className="text-gray-700 group-hover/item:text-red-600 transition-colors" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                        Sair
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <Link
              to="/conta"
              className="hidden md:flex items-center gap-2 px-3 py-2 rounded-lg text-gray-600 hover:text-red-600 hover:bg-red-50/70 transition-all shrink-0"
              aria-label="Entrar ou cadastrar"
            >
              <div className="rounded-full p-2 transition-colors bg-gray-100">
                <User className="w-4.5 h-4.5 text-gray-500" />
              </div>
              <div className="text-left">
                <p style={{ fontSize: "0.8rem", fontWeight: 600 }} className="leading-tight">
                  Entrar
                </p>
                <p style={{ fontSize: "0.65rem" }} className="text-gray-500 leading-tight">
                  ou Cadastre-se
                </p>
              </div>
            </Link>
          )}

          {/* Cart — desktop */}
          <button
            onClick={openDrawer}
            className="hidden md:flex items-center gap-2 px-3 py-2 rounded-lg text-gray-600 hover:text-red-600 hover:bg-red-50/70 transition-all shrink-0 relative cursor-pointer"
            aria-label={"Carrinho de compras" + (totalItems > 0 ? ", " + totalItems + " " + (totalItems === 1 ? "item" : "itens") : ", vazio")}
          >
            <div className="bg-gray-100 hover:bg-red-100 rounded-full p-2 transition-colors relative">
              <ShoppingCart className="w-4.5 h-4.5 text-gray-500" />
              {totalItems > 0 && (
                <span
                  key={"desktop-badge-" + totalItems}
                  className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full min-w-[18px] h-[18px] flex items-center justify-center"
                  style={{ fontSize: "0.6rem", fontWeight: 700, animation: "cart-badge-bounce 0.5s cubic-bezier(.22,.61,.36,1)" }}
                >
                  {totalItems > 99 ? "99+" : totalItems}
                </span>
              )}
            </div>
            <div className="text-left">
              <p style={{ fontSize: "0.8rem", fontWeight: 600 }} className="leading-tight">
                Carrinho
              </p>
              <p style={{ fontSize: "0.65rem" }} className="text-gray-500 leading-tight">
                {totalItems === 0 ? "Vazio" : totalItems + " " + (totalItems === 1 ? "item" : "itens")}
              </p>
            </div>
          </button>

          {/* Mobile menu button */}
          <div className="flex items-center gap-1 md:hidden">
            {/* CEP — mobile */}
            <HeaderCepInput />
            {/* Categories — mobile */}
            <button
              onClick={function () { setMobileMenuOpen(!mobileMenuOpen); }}
              className={"p-2 rounded-lg transition-colors cursor-pointer " + (mobileMenuOpen ? "bg-red-50 text-red-600" : "text-gray-600 hover:text-red-600 hover:bg-red-50")}
              aria-label={mobileMenuOpen ? "Fechar categorias" : "Ver categorias"}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Layers className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Navigation — only Categories */}
        <nav className="bg-gray-50/80 border-t border-gray-100 hidden md:block">
          <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
            <CategoryMegaMenu />
            <div className="shrink-0 ml-4">
              <HeaderCepInput />
            </div>
          </div>
        </nav>

        {/* Search bar — mobile (always visible) */}
        <div className="md:hidden px-3 py-2 bg-white border-t border-gray-50">
          <SearchAutocomplete variant="mobile" placeholder="Buscar peas, marcas..." />
        </div>
      </div>

      {/* Mobile categories drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-b border-gray-200 shadow-lg animate-in slide-in-from-top-2 duration-200">
          <div className="px-4 py-3">
            <MobileCategoryMenu onNavigate={function () { setMobileMenuOpen(false); }} />
          </div>
        </div>
      )}
    </header>
  );
}