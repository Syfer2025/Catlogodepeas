import { RouterProvider } from "react-router";
import { router } from "./routes";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { CartProvider } from "./contexts/CartContext";
import { WishlistProvider } from "./contexts/WishlistContext";
import { AffiliateProvider } from "./contexts/AffiliateContext";
import { CatalogModeProvider } from "./contexts/CatalogModeContext";

export default function App() {
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