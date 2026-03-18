/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ROUTES.TS — Definicao central de todas as rotas do frontend
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Usa React Router v7 Data Mode (createBrowserRouter).
 * Todas as paginas publicas sao filhas do Layout (Header + Footer + Outlet).
 * O Admin tem rota propria sem Layout publico.
 *
 * All pages are directly imported (no lazy loading) to avoid dynamic import
 * failures in restricted environments.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { createBrowserRouter } from "react-router";
import React from "react";
import { Layout } from "./components/Layout";
import { HomePage } from "./pages/HomePage";
import { RouteErrorFallback } from "./components/RouteErrorFallback";
import { CatalogPage } from "./pages/CatalogPage";
import { ProductDetailPage } from "./pages/ProductDetailPage";
import { ContactPage } from "./pages/ContactPage";
import { AboutPage } from "./pages/AboutPage";
import { UserAuthPage } from "./pages/UserAuthPage";
import { UserResetPasswordPage } from "./pages/UserResetPasswordPage";
import { UserAccountPage } from "./pages/UserAccountPage";
import { CheckoutPage } from "./pages/CheckoutPage";
import { PrivacyPolicyPage } from "./pages/PrivacyPolicyPage";
import { TermsPage } from "./pages/TermsPage";
import { LgpdRightsPage } from "./pages/LgpdRightsPage";
import { BrandPage } from "./pages/BrandPage";
import { AffiliatePage } from "./pages/AffiliatePage";
import { CouponsPage } from "./pages/CouponsPage";
import { WishlistPage } from "./pages/WishlistPage";
import { TrackingPage } from "./pages/TrackingPage";
import { FaqPage } from "./pages/FaqPage";
import { DocsPage } from "./pages/DocsPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { AdminPage } from "./pages/admin/AdminPage";
import { AdminResetPasswordPage } from "./pages/admin/AdminResetPasswordPage";

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
    Component: AdminPage,
  },
  {
    path: "/admin/reset-password",
    Component: AdminResetPasswordPage,
  },
]);
