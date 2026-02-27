import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "../services/supabaseClient";
import { getValidAccessToken } from "../services/supabaseClient";
import * as api from "../services/api";

interface WishlistContextValue {
  favorites: api.UserFavorite[];
  favoritesSet: Set<string>;
  loading: boolean;
  toggleFavorite: (sku: string, titulo: string) => Promise<void>;
  isFavorite: (sku: string) => boolean;
  count: number;
}

var WishlistCtx = createContext<WishlistContextValue>({
  favorites: [],
  favoritesSet: new Set(),
  loading: false,
  toggleFavorite: async () => {},
  isFavorite: () => false,
  count: 0,
});

export function useWishlist() {
  return useContext(WishlistCtx);
}

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  var [favorites, setFavorites] = useState<api.UserFavorite[]>([]);
  var [favoritesSet, setFavoritesSet] = useState<Set<string>>(new Set());
  var [loading, setLoading] = useState(false);
  var [accessToken, setAccessToken] = useState<string | null>(null);
  var loadedRef = useRef(false);

  // Keep set in sync
  function updateSet(favs: api.UserFavorite[]) {
    var s = new Set<string>();
    for (var i = 0; i < favs.length; i++) {
      s.add(favs[i].sku);
    }
    setFavoritesSet(s);
  }

  // Listen for auth changes
  useEffect(function () {
    var cancelled = false;

    async function init() {
      var token = await getValidAccessToken();
      if (token && !cancelled) {
        setAccessToken(token);
      }
    }
    init();

    var sub = supabase.auth.onAuthStateChange(function (_event, session) {
      // Ignore auth state changes triggered by admin token refresh
      // (refreshAdminToken calls setSession/signOut which fires this listener)
      if (window.location.pathname.startsWith("/admin")) {
        return;
      }
      if (session?.access_token) {
        setAccessToken(session.access_token);
      } else {
        setAccessToken(null);
        setFavorites([]);
        updateSet([]);
        loadedRef.current = false;
      }
    });

    return function () {
      cancelled = true;
      sub.data.subscription.unsubscribe();
    };
  }, []);

  // Load favorites when we have a token
  useEffect(function () {
    if (!accessToken || loadedRef.current) return;
    loadedRef.current = true;
    var cancelled = false;

    async function load() {
      try {
        var result = await api.getUserFavorites(accessToken!);
        if (!cancelled) {
          var favs = result.favorites || [];
          setFavorites(favs);
          updateSet(favs);
        }
      } catch (err) {
        // Token was already validated via getValidAccessToken; if this still fails, it's a real error
        console.warn("WishlistContext: failed to load favorites:", err);
      }
    }
    load();
    return function () { cancelled = true; };
  }, [accessToken]);

  var toggleFavorite = useCallback(async function (sku: string, titulo: string) {
    if (!accessToken) return;
    setLoading(true);
    try {
      var isCurrentlyFav = favoritesSet.has(sku);
      if (isCurrentlyFav) {
        var result = await api.removeUserFavorite(accessToken, sku);
        var favs = result.favorites || [];
        setFavorites(favs);
        updateSet(favs);
      } else {
        var result2 = await api.addUserFavorite(accessToken, sku, titulo);
        var favs2 = result2.favorites || [];
        setFavorites(favs2);
        updateSet(favs2);
      }
    } catch (err) {
      console.error("WishlistContext: toggle error:", err);
    } finally {
      setLoading(false);
    }
  }, [accessToken, favoritesSet]);

  var isFavorite = useCallback(function (sku: string): boolean {
    return favoritesSet.has(sku);
  }, [favoritesSet]);

  return React.createElement(WishlistCtx.Provider, {
    value: {
      favorites: favorites,
      favoritesSet: favoritesSet,
      loading: loading,
      toggleFavorite: toggleFavorite,
      isFavorite: isFavorite,
      count: favorites.length,
    },
  }, children);
}