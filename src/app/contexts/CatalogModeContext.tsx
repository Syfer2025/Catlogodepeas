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
