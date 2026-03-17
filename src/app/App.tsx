/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * APP.TSX — Raiz da aplicacao React
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Monta a arvore de providers globais e o RouterProvider.
 *
 * ORDEM DOS PROVIDERS (de fora pra dentro):
 * 1. ErrorBoundary      → Captura erros fatais, mostra fallback amigavel
 * 2. CatalogModeProvider → Busca GET /settings; se catalogMode=true, oculta precos
 * 3. AffiliateProvider   → Captura ?ref=CODE da URL, persiste em cookie 30 dias
 * 4. CartProvider        → Carrinho persistido em localStorage, estado React
 * 5. WishlistProvider    → Favoritos sincronizados com servidor (se logado)
 * 6. RouterProvider      → React Router com Data Mode (routes.ts)
 *
 * PREFETCH: Apos 3s do mount, importa chunks mais usados (Catalogo + Detalhe)
 * para que navegacoes futuras sejam instantaneas (browser cacheia o modulo).
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { RouterProvider } from "react-router";
import { useEffect } from "react";
import { router } from "./routes";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { CartProvider } from "./contexts/CartContext";
import { WishlistProvider } from "./contexts/WishlistContext";
import { AffiliateProvider } from "./contexts/AffiliateContext";
import { CatalogModeProvider } from "./contexts/CatalogModeContext";
import { prefetchCatalog, prefetchProductDetail } from "./utils/prefetch";

// Force clean rebuild
export default function App() {
  // Prefetch the most common route chunks after initial hydration
  useEffect(function () {
    var t = setTimeout(function () {
      prefetchCatalog();
      prefetchProductDetail();
    }, 3000);
    return function () { clearTimeout(t); };
  }, []);

  return (
    <ErrorBoundary>
      <CatalogModeProvider>
        <AffiliateProvider>
          <CartProvider>
            <WishlistProvider>
              <RouterProvider router={router} />
            </WishlistProvider>
          </CartProvider>
        </AffiliateProvider>
      </CatalogModeProvider>
    </ErrorBoundary>
  );
}
