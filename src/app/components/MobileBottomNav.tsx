/**
 * MOBILE BOTTOM NAV — Barra de navegacao fixa no rodape (mobile only).
 * 5 icones: Home, Favoritos, Carrinho (com badge), Cupons, Conta.
 * Oculta automaticamente durante scroll down; reaparece no scroll up.
 * Highlight ativo baseado na rota atual via useLocation().
 */
import { startTransition } from "react";
import { useLocation, useNavigate } from "react-router";
import { Home, Heart, ShoppingCart, Ticket, User } from "lucide-react";
import { useCart } from "../contexts/CartContext";
import { useWishlist } from "../contexts/WishlistContext";
import { useState, useEffect } from "react";
import { supabase } from "../services/supabaseClient";
import { getValidAccessToken } from "../services/supabaseClient";
import * as api from "../services/api";
import { UserAvatar } from "./AvatarPicker";

/* Badge bounce animation — injected once */
var _bottomNavCssInjected = false;
(function injectBottomNavCss() {
  if (_bottomNavCssInjected || typeof document === "undefined") return;
  _bottomNavCssInjected = true;
  var style = document.createElement("style");
  style.textContent = [
    "@keyframes bnav-badge-pop{0%{transform:scale(0.5)}50%{transform:scale(1.2)}100%{transform:scale(1)}}",
    "@keyframes bnav-cart-pulse{0%{box-shadow:0 -4px 20px rgba(220,38,38,0.25)}50%{box-shadow:0 -4px 28px rgba(220,38,38,0.4)}100%{box-shadow:0 -4px 20px rgba(220,38,38,0.25)}}",
  ].join("");
  document.head.appendChild(style);
})();

export function MobileBottomNav() {
  var location = useLocation();
  var navigate = useNavigate();
  var { totalItems, openDrawer } = useCart();
  var { count: favCount } = useWishlist();
  var AVATAR_CACHE_KEY = "carretao_user_session_cache";
  var [loggedIn, setLoggedIn] = useState(false);
  // Initialize avatar from localStorage cache to prevent flash
  var [avatarInfo, setAvatarInfo] = useState<{ avatarId?: string | null; customAvatarUrl?: string | null } | null>(function () {
    try {
      var cached = localStorage.getItem(AVATAR_CACHE_KEY);
      if (cached) {
        var parsed = JSON.parse(cached);
        return { avatarId: parsed.avatarId, customAvatarUrl: parsed.customAvatarUrl };
      }
    } catch {}
    return null;
  });

  useEffect(function () {
    function fetchAvatar(token: string) {
      // Use getValidAccessToken to ensure fresh token before calling userMe
      getValidAccessToken().then(function (freshToken) {
        var t = freshToken || token;
        api.userMe(t).then(function (p) {
          setAvatarInfo({ avatarId: p.avatarId, customAvatarUrl: p.customAvatarUrl });
        }).catch(function () {});
      });
    }
    supabase.auth.getSession().then(function (r) {
      if (r.data.session && r.data.session.user) {
        setLoggedIn(true);
        fetchAvatar(r.data.session.access_token);
      }
    });
    var sub = supabase.auth.onAuthStateChange(function (_ev, session) {
      // Ignore auth events triggered by admin operations or initial session load
      if (window.location.pathname.startsWith("/admin")) return;
      if (_ev === "INITIAL_SESSION") return;

      if (session && session.user) {
        setLoggedIn(true);
        fetchAvatar(session.access_token);
      } else if (_ev === "SIGNED_OUT") {
        // Only clear if not contaminated by admin token operations
        var adminToken = null;
        try { adminToken = localStorage.getItem("carretao_admin_at"); } catch {}
        if (!adminToken) {
          setLoggedIn(false);
          setAvatarInfo(null);
        }
      }
    });
    return function () { sub.data.subscription.unsubscribe(); };
  }, []);

  var path = location.pathname;

  var isHome = path === "/";
  var isFavorites = path === "/minha-conta" && location.search.includes("tab=favoritos");
  var isCupons = path === "/cupons";
  var isProfile = path === "/minha-conta" || path === "/conta";

  function goTo(to: string) {
    startTransition(function () { navigate(to); });
  }

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200"
      style={{
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        boxShadow: "0 -2px 16px rgba(0,0,0,0.06)",
      }}
    >
      <div className="flex items-end justify-around px-2" style={{ height: "60px" }}>
        {/* Home */}
        <button
          onClick={function () { goTo("/"); }}
          className={"flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 transition-colors cursor-pointer " + (isHome ? "text-red-600" : "text-gray-400")}
          aria-label="Início"
        >
          <Home className="w-5 h-5" strokeWidth={isHome ? 2.5 : 1.8} />
          <span style={{ fontSize: "0.6rem", fontWeight: isHome ? 700 : 500 }}>Início</span>
        </button>

        {/* Favoritos */}
        <button
          onClick={function () { goTo("/minha-conta?tab=favoritos"); }}
          className={"flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 transition-colors relative cursor-pointer " + (isFavorites ? "text-red-600" : "text-gray-400")}
          aria-label={"Favoritos" + (favCount > 0 ? ", " + favCount + " itens" : "")}
        >
          <div className="relative">
            <Heart className="w-5 h-5" strokeWidth={isFavorites ? 2.5 : 1.8} fill={isFavorites ? "currentColor" : "none"} />
            {favCount > 0 && (
              <span
                key={"fav-" + favCount}
                className="absolute -top-1.5 -right-2.5 bg-red-600 text-white rounded-full min-w-[15px] h-[15px] flex items-center justify-center"
                style={{ fontSize: "0.5rem", fontWeight: 700, animation: "bnav-badge-pop 0.35s ease-out" }}
              >
                {favCount > 99 ? "99+" : favCount}
              </span>
            )}
          </div>
          <span style={{ fontSize: "0.6rem", fontWeight: isFavorites ? 700 : 500 }}>Favoritos</span>
        </button>

        {/* Carrinho — center, raised */}
        <button
          onClick={openDrawer}
          className="flex flex-col items-center justify-center flex-1 relative cursor-pointer"
          aria-label={"Carrinho" + (totalItems > 0 ? ", " + totalItems + " itens" : "")}
          style={{ marginTop: "-18px" }}
        >
          <div
            className="relative flex items-center justify-center rounded-full bg-gradient-to-br from-red-600 to-red-700 text-white"
            style={{
              width: "52px",
              height: "52px",
              boxShadow: "0 -4px 20px rgba(220,38,38,0.25)",
              animation: totalItems > 0 ? "bnav-cart-pulse 3s ease-in-out infinite" : "none",
            }}
          >
            <ShoppingCart className="w-6 h-6" strokeWidth={2} />
            {totalItems > 0 && (
              <span
                key={"cart-" + totalItems}
                className="absolute -top-1 -right-1 bg-white text-red-600 rounded-full min-w-[18px] h-[18px] flex items-center justify-center border-2 border-red-600"
                style={{ fontSize: "0.55rem", fontWeight: 800, animation: "bnav-badge-pop 0.35s ease-out" }}
              >
                {totalItems > 99 ? "99+" : totalItems}
              </span>
            )}
          </div>
          <span className="text-red-600" style={{ fontSize: "0.6rem", fontWeight: 700, marginTop: "2px" }}>Carrinho</span>
        </button>

        {/* Cupons */}
        <button
          onClick={function () { goTo("/cupons"); }}
          className={"flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 transition-colors cursor-pointer " + (isCupons ? "text-red-600" : "text-gray-400")}
          aria-label="Cupons"
        >
          <Ticket className="w-5 h-5" strokeWidth={isCupons ? 2.5 : 1.8} />
          <span style={{ fontSize: "0.6rem", fontWeight: isCupons ? 700 : 500 }}>Cupons</span>
        </button>

        {/* Perfil / Conta */}
        <button
          onClick={function () { goTo(loggedIn ? "/minha-conta" : "/conta"); }}
          className={"flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 transition-colors cursor-pointer " + (isProfile && !isFavorites ? "text-red-600" : "text-gray-400")}
          aria-label={loggedIn ? "Minha Conta" : "Entrar"}
        >
          {loggedIn && avatarInfo ? (
            <UserAvatar avatarId={avatarInfo.avatarId} customAvatarUrl={avatarInfo.customAvatarUrl} size="xs" />
          ) : (
            <User className="w-5 h-5" strokeWidth={isProfile && !isFavorites ? 2.5 : 1.8} />
          )}
          <span style={{ fontSize: "0.6rem", fontWeight: isProfile && !isFavorites ? 700 : 500 }}>
            {loggedIn ? "Conta" : "Entrar"}
          </span>
        </button>
      </div>
    </nav>
  );
}