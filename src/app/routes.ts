/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ROUTES.TS — Definicao central de todas as rotas do frontend
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Usa React Router v7 Data Mode (createBrowserRouter).
 * Todas as paginas publicas sao filhas do Layout (Header + Footer + Outlet).
 * O Admin tem rota propria sem Layout publico.
 *
 * Public pages use React.lazy() for code splitting — each page loads only
 * when the user navigates to it, reducing the initial bundle size.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { createBrowserRouter } from "react-router";
import React from "react";
import { Layout } from "./components/Layout";
import { RouteErrorFallback } from "./components/RouteErrorFallback";
import { lazyWithRetry } from "./utils/lazyWithRetry";

// ── Public pages — lazy loaded for smaller initial bundle ────────────────────
const HomePage = React.lazy(() =>
  import("./pages/HomePage").then((m) => ({ default: m.HomePage }))
);
const CatalogPage = React.lazy(() =>
  import("./pages/CatalogPage").then((m) => ({ default: m.CatalogPage }))
);
const BannerLandingPage = React.lazy(() =>
  import("./pages/BannerLandingPage").then((m) => ({ default: m.BannerLandingPage }))
);
const ProductDetailPage = React.lazy(() =>
  import("./pages/ProductDetailPage").then((m) => ({ default: m.ProductDetailPage }))
);
const ContactPage = React.lazy(() =>
  import("./pages/ContactPage").then((m) => ({ default: m.ContactPage }))
);
const AboutPage = React.lazy(() =>
  import("./pages/AboutPage").then((m) => ({ default: m.AboutPage }))
);
const UserAuthPage = React.lazy(() =>
  import("./pages/UserAuthPage").then((m) => ({ default: m.UserAuthPage }))
);
const UserResetPasswordPage = React.lazy(() =>
  import("./pages/UserResetPasswordPage").then((m) => ({ default: m.UserResetPasswordPage }))
);
const UserAccountPage = React.lazy(() =>
  import("./pages/UserAccountPage").then((m) => ({ default: m.UserAccountPage }))
);
const CheckoutPage = React.lazy(() =>
  import("./pages/CheckoutPage").then((m) => ({ default: m.CheckoutPage }))
);
const PrivacyPolicyPage = React.lazy(() =>
  import("./pages/PrivacyPolicyPage").then((m) => ({ default: m.PrivacyPolicyPage }))
);
const TermsPage = React.lazy(() =>
  import("./pages/TermsPage").then((m) => ({ default: m.TermsPage }))
);
const LgpdRightsPage = React.lazy(() =>
  import("./pages/LgpdRightsPage").then((m) => ({ default: m.LgpdRightsPage }))
);
const BrandPage = React.lazy(() =>
  import("./pages/BrandPage").then((m) => ({ default: m.BrandPage }))
);
const AffiliatePage = React.lazy(() =>
  import("./pages/AffiliatePage").then((m) => ({ default: m.AffiliatePage }))
);
const CouponsPage = React.lazy(() =>
  import("./pages/CouponsPage").then((m) => ({ default: m.CouponsPage }))
);
const WishlistPage = React.lazy(() =>
  import("./pages/WishlistPage").then((m) => ({ default: m.WishlistPage }))
);
const TrackingPage = React.lazy(() =>
  import("./pages/TrackingPage").then((m) => ({ default: m.TrackingPage }))
);
const FaqPage = React.lazy(() =>
  import("./pages/FaqPage").then((m) => ({ default: m.FaqPage }))
);
const DocsPage = React.lazy(() =>
  import("./pages/DocsPage").then((m) => ({ default: m.DocsPage }))
);
const NotFoundPage = React.lazy(() =>
  import("./pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage }))
);

// ── Admin routes — lazy loaded (customers never download admin code) ─────────
const AdminEntryPage = lazyWithRetry(() =>
  import("./pages/admin/AdminEntryPage").then((m) => ({ default: m.AdminEntryPage }))
);
const AdminResetPasswordPage = lazyWithRetry(() =>
  import("./pages/admin/AdminResetPasswordPage").then((m) => ({ default: m.AdminResetPasswordPage }))
);

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    errorElement: React.createElement(RouteErrorFallback),
    children: [
      { index: true, Component: HomePage },
      {
        path: "catalogo",
        errorElement: React.createElement(RouteErrorFallback),
        Component: CatalogPage,
      },
      {
        path: "vitrine/banner/:bannerId",
        errorElement: React.createElement(RouteErrorFallback),
        Component: BannerLandingPage,
      },
      {
        path: "produto/:id",
        errorElement: React.createElement(RouteErrorFallback),
        Component: ProductDetailPage,
      },
      {
        path: "contato",
        errorElement: React.createElement(RouteErrorFallback),
        Component: ContactPage,
      },
      {
        path: "sobre",
        errorElement: React.createElement(RouteErrorFallback),
        Component: AboutPage,
      },
      {
        path: "conta",
        errorElement: React.createElement(RouteErrorFallback),
        Component: UserAuthPage,
      },
      {
        path: "conta/redefinir-senha",
        errorElement: React.createElement(RouteErrorFallback),
        Component: UserResetPasswordPage,
      },
      {
        path: "minha-conta",
        errorElement: React.createElement(RouteErrorFallback),
        Component: UserAccountPage,
      },
      {
        path: "checkout",
        errorElement: React.createElement(RouteErrorFallback),
        Component: CheckoutPage,
      },
      {
        path: "politica-de-privacidade",
        errorElement: React.createElement(RouteErrorFallback),
        Component: PrivacyPolicyPage,
      },
      {
        path: "termos-de-uso",
        errorElement: React.createElement(RouteErrorFallback),
        Component: TermsPage,
      },
      {
        path: "exercicio-de-direitos",
        errorElement: React.createElement(RouteErrorFallback),
        Component: LgpdRightsPage,
      },
      {
        path: "marca/:slug",
        errorElement: React.createElement(RouteErrorFallback),
        Component: BrandPage,
      },
      {
        path: "afiliados",
        errorElement: React.createElement(RouteErrorFallback),
        Component: AffiliatePage,
      },
      {
        path: "cupons",
        errorElement: React.createElement(RouteErrorFallback),
        Component: CouponsPage,
      },
      {
        path: "favoritos",
        errorElement: React.createElement(RouteErrorFallback),
        Component: WishlistPage,
      },
      {
        path: "rastreio/:orderId",
        errorElement: React.createElement(RouteErrorFallback),
        Component: TrackingPage,
      },
      {
        path: "faq",
        errorElement: React.createElement(RouteErrorFallback),
        Component: FaqPage,
      },
      {
        path: "docs",
        errorElement: React.createElement(RouteErrorFallback),
        Component: DocsPage,
      },
      {
        path: "*",
        errorElement: React.createElement(RouteErrorFallback),
        Component: NotFoundPage,
      },
    ],
  },
  {
    path: "/admin",
    errorElement: React.createElement(RouteErrorFallback),
    Component: AdminEntryPage,
  },
  {
    path: "/admin/reset-password",
    errorElement: React.createElement(RouteErrorFallback),
    Component: AdminResetPasswordPage,
  },
]);
