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