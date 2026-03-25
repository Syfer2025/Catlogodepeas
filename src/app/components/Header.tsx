/**
 * HEADER — Cabecalho principal do site. Contém logo, campo de busca (SearchAutocomplete),
 * badge do carrinho, menu do usuario (login/conta), mega menu de categorias (lazy),
 * mega menu de cupons (lazy), input de CEP. Responsivo: mobile mostra menu hamburguer.
 * Dados: logo e categorias vem do HomepageInitContext. Auth: verifica sessao Supabase.
 */
import { useState, useEffect, useRef, startTransition } from "react";
import { Link, useNavigate } from "react-router";
import { Menu, X, Wrench, Headset, ChevronDown, MessageCircle, User, ShoppingCart, Package, LogOut, Heart, Layers, Phone } from "lucide-react";
import { SearchAutocomplete } from "./SearchAutocomplete";
import { supabase } from "../services/supabaseClient";
import { useCart } from "../contexts/CartContext";
import { useHomepageInit } from "../contexts/HomepageInitContext";
import { UserAvatar } from "./AvatarPicker";
import { HeaderCepInput } from "./HeaderCepInput";
import { CategoryMegaMenu, MobileCategoryMenu } from "./CategoryMegaMenu";
import { CouponMegaMenu } from "./CouponMegaMenu";

/* Badge bounce keyframes — now defined in /src/styles/index.css instead of runtime JS injection.
 * This avoids CSP 'unsafe-inline' issues and eliminates runtime DOM manipulation. */

const UNIDADES = [
  { nome: "Matriz (0800)", tel: "0800 643 1170", href: "tel:08006431170", estado: "PR" },
  { nome: "Maringá", tel: "(44) 3123-3000", href: "tel:+554431233000", estado: "PR" },
  { nome: "Curitiba", tel: "(41) 3123-8900", href: "tel:+554131238900", estado: "PR" },
  { nome: "Itajaí", tel: "(47) 3248-2100", href: "tel:+554732482100", estado: "SC" },
  { nome: "Sinop", tel: "(66) 3515-5115", href: "tel:+556635155115", estado: "MT" },
  { nome: "Sinop (Cel)", tel: "(66) 99673-6133", href: "tel:+5566996736133", estado: "MT", isMobile: true },
  { nome: "Matupá", tel: "(66) 99201-7474", href: "tel:+5566992017474", estado: "MT", isMobile: true },
  { nome: "Várzea Grande", tel: "(65) 2193-8550", href: "tel:+556521938550", estado: "MT" },
];

const LOGO_CACHE_KEY = "carretao_header_logo_url";

export function Header() {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileContactOpen, setMobileContactOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(function () {
    try { return localStorage.getItem(LOGO_CACHE_KEY); } catch { return null; }
  });

  // Auth state
  const [userLoggedIn, setUserLoggedIn] = useState(false);
  const [userName, setUserName] = useState("");
  const [userAvatarId, setUserAvatarId] = useState<string | undefined>(undefined);
  const [customAvatarUrl, setCustomAvatarUrl] = useState<string | undefined>(undefined);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [contactDropdownOpen, setContactDropdownOpen] = useState(false);
  const contactCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cart
  const { totalItems, openDrawer } = useCart();
  const [cartBounce, setCartBounce] = useState(false);

  // HomepageInit data
  const { data: initData } = useHomepageInit();

  // ── Load logo from HomepageInit ──
  useEffect(function () {
    if (initData && initData.logo && initData.logo.url) {
      setLogoUrl(initData.logo.url);
      try { localStorage.setItem(LOGO_CACHE_KEY, initData.logo.url); } catch {}
    }
  }, [initData]);

  // ── Auth check ──
  useEffect(function () {
    var cancelled = false;
    async function checkAuth() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session && session.user) {
          setUserLoggedIn(true);
          const meta = session.user.user_metadata || {};
          setUserName(meta.name || meta.full_name || session.user.email?.split("@")[0] || "");
          setUserAvatarId(meta.avatarId);
          setCustomAvatarUrl(meta.customAvatarUrl);
        }
      } catch {}
    }
    checkAuth();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(function (_event, session) {
      if (cancelled) return;
      if (session && session.user) {
        setUserLoggedIn(true);
        const meta = session.user.user_metadata || {};
        setUserName(meta.name || meta.full_name || session.user.email?.split("@")[0] || "");
        setUserAvatarId(meta.avatarId);
        setCustomAvatarUrl(meta.customAvatarUrl);
      } else {
        setUserLoggedIn(false);
        setUserName("");
        setUserAvatarId(undefined);
        setCustomAvatarUrl(undefined);
      }
    });
    function onAvatarUpdated(e: Event) {
      var detail = (e as CustomEvent).detail;
      if (detail) {
        setUserAvatarId(detail.avatarId ?? undefined);
        setCustomAvatarUrl(detail.customAvatarUrl ?? undefined);
      }
    }
    window.addEventListener("carretao-avatar-updated", onAvatarUpdated);
    return function () {
      cancelled = true;
      subscription.unsubscribe();
      window.removeEventListener("carretao-avatar-updated", onAvatarUpdated);
    };
  }, []);

  // ── Cart badge bounce ──
  useEffect(function () {
    if (totalItems > 0) {
      setCartBounce(true);
      const timer = setTimeout(function () { setCartBounce(false); }, 600);
      return function () { clearTimeout(timer); };
    }
  }, [totalItems]);

  // ── Close mobile menu on navigation ──
  function closeMobileMenu() {
    setMobileMenuOpen(false);
    setMobileContactOpen(false);
  }

  // ── Logout ──
  async function handleLogout() {
    try {
      await supabase.auth.signOut();
      setUserLoggedIn(false);
      setUserName("");
      setUserMenuOpen(false);
      startTransition(function () { navigate("/"); });
    } catch {}
  }

  // ── Close dropdown on outside click ──
  useEffect(function () {
    if (!userMenuOpen && !contactDropdownOpen) return;
    function onClickOutside(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-user-menu]") && !t.closest("[data-contact-dropdown]")) {
        setUserMenuOpen(false);
        setContactDropdownOpen(false);
      }
    }
    document.addEventListener("click", onClickOutside);
    return function () { document.removeEventListener("click", onClickOutside); };
  }, [userMenuOpen, contactDropdownOpen]);

  // Lock body scroll when mobile menu is open
  useEffect(function () {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return function () { document.body.style.overflow = ""; };
  }, [mobileMenuOpen]);

  return (
    <header role="banner" className="sticky top-0 z-50 bg-white shadow-sm">
      {/* ══════ TOP BAR (desktop) — removed per user request ══════ */}

      {/* ══════ MAIN HEADER ══════ */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 flex items-center h-16 gap-3">
          {/* Mobile hamburger */}
          <button
            className="lg:hidden p-2 -ml-2 text-gray-700 hover:text-red-600 transition-colors"
            onClick={function () { setMobileMenuOpen(!mobileMenuOpen); }}
            aria-label={mobileMenuOpen ? "Fechar menu" : "Abrir menu"}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>

          {/* Logo — centered on mobile */}
          <Link to="/" className="shrink-0 md:mr-0 mx-auto md:mx-0" onClick={closeMobileMenu}>
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Carretão Auto Peças"
                className="h-[50px] w-auto max-w-[200px] object-contain"
                loading="eager"
              />
            ) : (
              <div className="flex items-center gap-2">
                <Wrench className="w-7 h-7 text-red-600" />
                <span className="text-lg font-bold text-gray-900 hidden sm:block">Carretão</span>
              </div>
            )}
          </Link>

          {/* Search — desktop */}
          <div className="hidden lg:flex flex-1 max-w-xl mx-4">
            <SearchAutocomplete />
          </div>

          {/* Right-side actions */}
          <div className="flex items-center gap-1 sm:gap-2 ml-auto">
            {/* Wishlist (desktop) */}
            <Link
              to="/favoritos"
              className="hidden sm:flex items-center gap-1 px-3 py-2 text-gray-600 hover:text-red-600 transition-colors rounded-lg hover:bg-red-50 text-sm"
              title="Favoritos"
            >
              <Heart className="w-5 h-5" />
              <span className="hidden md:inline">Favoritos</span>
            </Link>

            {/* Cart button — hidden on mobile (already in MobileBottomNav) */}
            <button
              onClick={openDrawer}
              className="hidden md:flex relative items-center gap-1 px-3 py-2 text-gray-600 hover:text-red-600 transition-colors rounded-lg hover:bg-red-50 text-sm"
              aria-label={"Carrinho" + (totalItems > 0 ? " (" + totalItems + " itens)" : "")}
            >
              <ShoppingCart className="w-5 h-5" />
              <span className="hidden md:inline">Carrinho</span>
              {totalItems > 0 && (
                <span
                  className={"absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1" + (cartBounce ? " animate-[cart-badge-bounce_0.5s_ease]" : "")}
                >
                  {totalItems > 99 ? "99+" : totalItems}
                </span>
              )}
            </button>

            {/* User menu — hidden on mobile (already in MobileBottomNav) */}
            <div className="hidden md:block relative" data-user-menu>
              {userLoggedIn ? (
                <>
                  <button
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                    onClick={function () { setUserMenuOpen(!userMenuOpen); }}
                  >
                    <UserAvatar avatarId={userAvatarId} customAvatarUrl={customAvatarUrl} size="sm" />
                    <span className="hidden lg:block text-sm text-gray-700 max-w-[100px] truncate">
                      {userName || "Minha Conta"}
                    </span>
                    <ChevronDown className={"w-3.5 h-3.5 text-gray-500 transition-transform hidden lg:block" + (userMenuOpen ? " rotate-180" : "")} />
                  </button>
                  {userMenuOpen && (
                    <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-gray-200 py-2 w-56 z-50">
                      <div className="px-4 py-2 border-b border-gray-100">
                        <p className="text-sm font-medium text-gray-900 truncate">{userName}</p>
                      </div>
                      <Link
                        to="/minha-conta"
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        onClick={function () { setUserMenuOpen(false); }}
                      >
                        <User className="w-4 h-4 text-gray-400" />
                        Minha Conta
                      </Link>
                      <Link
                        to="/minha-conta?tab=pedidos"
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        onClick={function () { setUserMenuOpen(false); }}
                      >
                        <Package className="w-4 h-4 text-gray-400" />
                        Meus Pedidos
                      </Link>
                      <Link
                        to="/favoritos"
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        onClick={function () { setUserMenuOpen(false); }}
                      >
                        <Heart className="w-4 h-4 text-gray-400" />
                        Favoritos
                      </Link>
                      <div className="border-t border-gray-100 mt-1 pt-1">
                        <button
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors w-full text-left"
                          onClick={handleLogout}
                        >
                          <LogOut className="w-4 h-4" />
                          Sair
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <Link
                  to="/conta"
                  className="flex items-center gap-1.5 px-3 py-2 text-gray-600 hover:text-red-600 transition-colors rounded-lg hover:bg-red-50 text-sm"
                >
                  <User className="w-5 h-5" />
                  <span className="hidden lg:inline">Entrar</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ══════ NAV BAR (desktop) — Categories, Coupons, Contact, CEP ══════ */}
      <div className="hidden lg:block text-white" style={{ backgroundColor: "#DE0316" }}>
        <div className="max-w-7xl mx-auto px-4 flex items-center h-11 gap-0.5">
          <CategoryMegaMenu onNavigate={closeMobileMenu} />
          <CouponMegaMenu />

          {/* Spacer */}
          <div className="flex-1" />

          {/* Fale Conosco */}
          <div
            className="relative"
            data-contact-dropdown
            onMouseEnter={function () {
              if (contactCloseTimer.current) { clearTimeout(contactCloseTimer.current); contactCloseTimer.current = null; }
              setContactDropdownOpen(true);
            }}
            onMouseLeave={function () {
              contactCloseTimer.current = setTimeout(function () { setContactDropdownOpen(false); }, 220);
            }}
          >
            <button
              className={
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all text-sm font-medium cursor-pointer " +
                (contactDropdownOpen
                  ? "bg-white/15 text-white"
                  : "text-white hover:bg-white/15")
              }
            >
              <Headset className="w-4 h-4" />
              Fale Conosco
              <ChevronDown
                className="w-3 h-3"
                style={{
                  transition: "transform 250ms cubic-bezier(0.4,0,0.2,1)",
                  transform: contactDropdownOpen ? "rotate(180deg)" : "rotate(0)",
                }}
              />
            </button>
            {contactDropdownOpen && (
              <div
                className="absolute right-0 top-full z-[200] bg-white overflow-hidden"
                style={{
                  marginTop: "0px",
                  width: "280px",
                  borderRadius: "0 0 10px 10px",
                  boxShadow: "0 12px 36px -8px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.06)",
                  animation: "contactDropIn 200ms cubic-bezier(0.16,1,0.3,1) forwards",
                }}
              >
                {/* Accent line */}
                <div style={{ height: "2px", background: "linear-gradient(90deg, #dc2626, #f87171, #dc2626)" }} />

                {/* Phone list — compact */}
                <div className="py-1">
                  {UNIDADES.map(function (u, i) {
                    return (
                      <a
                        key={i}
                        href={u.href}
                        className="group flex items-center justify-between px-3.5 py-1.5 hover:bg-red-50 transition-colors"
                      >
                        <span className="flex items-center gap-2 text-[0.8rem] text-gray-700 group-hover:text-gray-900">
                          <Phone className="w-3 h-3 text-gray-300 group-hover:text-red-500 transition-colors" />
                          {u.nome}
                        </span>
                        <span className="text-[0.72rem] font-semibold text-red-600 tabular-nums">
                          {u.tel}
                        </span>
                      </a>
                    );
                  })}
                </div>

                {/* WhatsApp */}
                <div className="border-t border-gray-100 px-3 py-2">
                  <a
                    href="https://wa.me/5544991001170"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-1.5 rounded-md bg-green-500 hover:bg-green-600 text-white transition-colors"
                    style={{ fontSize: "0.78rem", fontWeight: 600 }}
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    WhatsApp: (44) 99100-1170
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* CEP Input */}
          <HeaderCepInput />
        </div>
      </div>

      {/* ══════ MOBILE SEARCH BAR ══════ */}
      <div className="lg:hidden bg-white border-b border-gray-200 px-4 py-2">
        <SearchAutocomplete />
      </div>

      {/* ══════ MOBILE MENU OVERLAY ══════ */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 animate-[fadeIn_200ms_ease]"
            onClick={closeMobileMenu}
          />
          {/* Drawer */}
          <div
            className="absolute left-0 top-0 bottom-0 w-[82%] max-w-xs bg-white shadow-2xl flex flex-col animate-[slideInLeft_250ms_cubic-bezier(0.32,0.72,0,1)]"
            style={{ willChange: "transform" }}
          >
            {/* Mobile menu header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-red-600 to-red-700 text-white shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                {userLoggedIn ? (
                  <>
                    <UserAvatar avatarId={userAvatarId} customAvatarUrl={customAvatarUrl} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{userName || "Minha Conta"}</p>
                      <Link
                        to="/minha-conta"
                        className="text-xs text-red-100 hover:text-white"
                        onClick={closeMobileMenu}
                      >
                        Ver perfil →
                      </Link>
                    </div>
                  </>
                ) : (
                  <Link
                    to="/conta"
                    className="flex items-center gap-2 text-white font-medium text-sm"
                    onClick={closeMobileMenu}
                  >
                    <User className="w-5 h-5" />
                    Entrar / Criar Conta
                  </Link>
                )}
              </div>
              <button
                onClick={closeMobileMenu}
                className="p-1.5 rounded-full bg-white/15 hover:bg-white/25 transition-colors"
                aria-label="Fechar menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable content — hide scrollbar */}
            <div
              className="flex-1 overflow-y-auto overscroll-contain"
              style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}
            >
              <div className="mobile-drawer-scroll">
                {/* Quick nav links */}
                <div className="py-1">
                  <Link
                    to="/catalogo"
                    className="flex items-center gap-3 px-4 py-3 text-gray-700 active:bg-gray-100 transition-colors"
                    onClick={closeMobileMenu}
                  >
                    <Layers className="w-5 h-5 text-red-500" />
                    <span className="text-sm font-medium">Ver Catálogo</span>
                  </Link>
                  <Link
                    to="/favoritos"
                    className="flex items-center gap-3 px-4 py-3 text-gray-700 active:bg-gray-100 transition-colors"
                    onClick={closeMobileMenu}
                  >
                    <Heart className="w-5 h-5 text-red-500" />
                    <span className="text-sm font-medium">Favoritos</span>
                  </Link>
                  {userLoggedIn && (
                    <Link
                      to="/minha-conta?tab=pedidos"
                      className="flex items-center gap-3 px-4 py-3 text-gray-700 active:bg-gray-100 transition-colors"
                      onClick={closeMobileMenu}
                    >
                      <Package className="w-5 h-5 text-red-500" />
                      <span className="text-sm font-medium">Meus Pedidos</span>
                    </Link>
                  )}
                </div>

                {/* Mobile categories accordion */}
                <div className="border-t border-gray-100">
                  <MobileCategoryMenu onNavigate={closeMobileMenu} />
                </div>

                {/* Mobile contact */}
                <div className="border-t border-gray-100">
                  <button
                    className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-gray-700 active:bg-gray-50"
                    onClick={function () { setMobileContactOpen(!mobileContactOpen); }}
                  >
                    <span className="flex items-center gap-3">
                      <Headset className="w-5 h-5 text-red-500" />
                      Fale Conosco
                    </span>
                    <ChevronDown className={"w-4 h-4 text-gray-400 transition-transform duration-200" + (mobileContactOpen ? " rotate-180" : "")} />
                  </button>
                  {mobileContactOpen && (
                    <div className="px-4 pb-3">
                      {UNIDADES.map(function (u, i) {
                        return (
                          <a
                            key={i}
                            href={u.href}
                            className="flex items-center justify-between py-2 px-2 rounded-md text-sm text-gray-600 active:bg-gray-50"
                          >
                            <span className="flex items-center gap-2">
                              <Phone className="w-3.5 h-3.5 text-gray-300" />
                              {u.nome}
                            </span>
                            <span className="text-red-600 font-semibold text-xs tabular-nums">{u.tel}</span>
                          </a>
                        );
                      })}
                      <a
                        href="https://wa.me/5544991001170"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 mt-2 py-2.5 rounded-lg bg-green-500 active:bg-green-600 text-white text-sm font-semibold"
                      >
                        <MessageCircle className="w-4 h-4" />
                        WhatsApp: (44) 99100-1170
                      </a>
                    </div>
                  )}
                </div>

                {/* Mobile CEP */}
                <div className="border-t border-gray-100 px-4 py-3">
                  <HeaderCepInput />
                </div>
              </div>
            </div>

            {/* Logout — fixed at bottom of drawer */}
            {userLoggedIn && (
              <div className="border-t border-gray-100 px-4 py-3 shrink-0 bg-gray-50">
                <button
                  className="flex items-center gap-2 text-sm text-red-600 font-medium active:text-red-800"
                  onClick={function () { handleLogout(); closeMobileMenu(); }}
                >
                  <LogOut className="w-4 h-4" />
                  Sair da Conta
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}