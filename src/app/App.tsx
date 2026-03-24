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
 * PREFETCH: Delegado ao useIdlePrefetch() no Layout.tsx, que usa
 * requestIdleCallback para carregar chunks progressivamente durante
 * tempo ocioso do browser — mais eficiente que o setTimeout fixo anterior.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { RouterProvider } from "react-router";
import { Suspense } from "react";
import { router } from "./routes";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { CartProvider } from "./contexts/CartContext";
import { WishlistProvider } from "./contexts/WishlistContext";
import { AffiliateProvider } from "./contexts/AffiliateContext";
import { CatalogModeProvider } from "./contexts/CatalogModeContext";

// Force clean rebuild
export default function App() {
  // Prefetch is now handled by useIdlePrefetch() in Layout.tsx
  // which uses requestIdleCallback for better scheduling.

  return (
    <ErrorBoundary>
      <CatalogModeProvider>
        <AffiliateProvider>
          <CartProvider>
            <WishlistProvider>
              <Suspense fallback={null}>
                <RouterProvider router={router} />
              </Suspense>
            </WishlistProvider>
          </CartProvider>
        </AffiliateProvider>
      </CatalogModeProvider>
    </ErrorBoundary>
  );
}