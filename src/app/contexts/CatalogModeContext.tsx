/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CATALOG MODE CONTEXT — Controle global de exibicao de precos
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * QUANDO ATIVO (catalogMode=true):
 * - Precos sao ocultados em todo o site (ProductCard, ProductDetail, SuperPromo)
 * - Em vez de preco, mostra "Consulte o preço" ou "Ver Detalhes"
 * - Botoes mudam de "Comprar" para "Ver Detalhes"
 * - Checkout e carrinho ficam desabilitados
 *
 * CASO DE USO: O dono da loja quer usar o site como catalogo digital
 * sem exibir precos (ex: para vendedores que negociam presencialmente).
 *
 * FONTE: Anteriormente fazia GET /settings separado. Agora le de
 * HomepageInitData.settings (piggyback na chamada /homepage-init),
 * com fallback para GET /settings quando fora do HomepageInitProvider.
 * Admin configura em AdminSettings.tsx.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import React, { createContext, useContext, useState, useEffect } from "react";
import * as api from "../services/api";

interface CatalogModeContextValue {
  catalogMode: boolean;
  loading: boolean;
}

const CatalogModeCtx = createContext<CatalogModeContextValue>({ catalogMode: false, loading: true });

export function useCatalogMode() {
  return useContext(CatalogModeCtx);
}

/**
 * Seed function: called by HomepageInitProvider when settings data arrives
 * from /homepage-init. This avoids the separate GET /settings call.
 */
let _seededCatalogMode: boolean | null = null;
const _seedListeners: Array<(v: boolean) => void> = [];

export function seedCatalogMode(catalogMode: boolean) {
  _seededCatalogMode = catalogMode;
  for (let i = 0; i < _seedListeners.length; i++) {
    _seedListeners[i](catalogMode);
  }
}

export function CatalogModeProvider({ children }: { children: React.ReactNode }) {
  const [catalogMode, setCatalogMode] = useState(
    _seededCatalogMode !== null ? _seededCatalogMode : false
  );
  const [loading, setLoading] = useState(_seededCatalogMode === null);

  useEffect(function () {
    // If already seeded (from HomepageInitProvider), use that value
    if (_seededCatalogMode !== null) {
      setCatalogMode(_seededCatalogMode);
      setLoading(false);
      return;
    }

    // Listen for seed from HomepageInitProvider
    function onSeed(v: boolean) {
      setCatalogMode(v);
      setLoading(false);
    }
    _seedListeners.push(onSeed);

    // Fallback: if no seed arrives within 5s, fetch settings directly.
    // This covers the case where CatalogModeProvider is rendered outside
    // HomepageInitProvider (e.g. admin routes).
    const fallbackTimer = setTimeout(function () {
      if (_seededCatalogMode === null) {
        api.getSettings().then(function (s) {
          if (s && s.catalogMode) {
            setCatalogMode(true);
          }
          setLoading(false);
        }).catch(function () {
          setLoading(false);
        });
      }
    }, 5000);

    return function () {
      clearTimeout(fallbackTimer);
      const idx = _seedListeners.indexOf(onSeed);
      if (idx !== -1) _seedListeners.splice(idx, 1);
    };
  }, []);

  return React.createElement(
    CatalogModeCtx.Provider,
    { value: { catalogMode: catalogMode, loading: loading } },
    children
  );
}
