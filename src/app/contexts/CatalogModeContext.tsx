/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CATALOG MODE CONTEXT — Controle global de exibicao de precos
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * QUANDO ATIVO (catalogMode=true):
 * - Precos sao ocultados em todo o site (ProductCard, ProductDetail, SuperPromo)
 * - Em vez de preco, mostra "Consulte o preco" ou "Ver Detalhes"
 * - Botoes mudam de "Comprar" para "Ver Detalhes"
 * - Checkout e carrinho ficam desabilitados
 *
 * CASO DE USO: O dono da loja quer usar o site como catalogo digital
 * sem exibir precos (ex: para vendedores que negociam presencialmente).
 *
 * FONTE: Busca GET /settings na montagem e le o campo "catalogMode".
 * Admin configura em AdminSettings.tsx.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import React, { createContext, useContext, useState, useEffect } from "react";
import * as api from "../services/api";

interface CatalogModeContextValue {
  catalogMode: boolean;
  loading: boolean;
}

var CatalogModeCtx = createContext<CatalogModeContextValue>({ catalogMode: false, loading: true });

export function useCatalogMode() {
  return useContext(CatalogModeCtx);
}

export function CatalogModeProvider({ children }: { children: React.ReactNode }) {
  var [catalogMode, setCatalogMode] = useState(false);
  var [loading, setLoading] = useState(true);

  useEffect(function () {
    api.getSettings().then(function (s) {
      if (s && s.catalogMode) {
        setCatalogMode(true);
      }
      setLoading(false);
    }).catch(function () {
      setLoading(false);
    });
  }, []);

  return React.createElement(
    CatalogModeCtx.Provider,
    { value: { catalogMode: catalogMode, loading: loading } },
    children
  );
}