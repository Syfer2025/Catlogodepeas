/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ROUTES.TS — Definicao central de todas as rotas do frontend
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Usa React Router v7 Data Mode (createBrowserRouter).
 * Todas as paginas publicas sao filhas do Layout (Header + Footer + Outlet).
 * O Admin tem rota propria sem Layout publico.
 *
 * LAZY LOADING: Todas as rotas (exceto "/" e Layout) usam lazy() do React Router.
 * Isso faz code splitting automatico — cada pagina e um chunk JS separado
 * que so e baixado quando o usuario navega para aquela rota.
 *
 * HYDRATE FALLBACK: Retorna null porque o Layout.tsx injeta um skeleton shell
 * pre-renderizado via IIFE antes do React montar, evitando flash branco.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { createBrowserRouter } from "react-router";
import React from "react";
import { Layout } from "./components/Layout";
import { HomePage } from "./pages/HomePage";
import { RouteErrorFallback } from "./components/RouteErrorFallback";

// ─── Route-level lazy loading (React Router handles loading before transition) ───
// This avoids the "component suspended while responding to synchronous input" error
// that React.lazy() causes with React Router navigations.

// Pre-render skeleton shell (injected in Layout.tsx IIFE) already provides
// visual feedback, so HydrateFallback returns null to avoid replacing it
// with a plain spinner that looks like a regression.
function HydrateFallback() {
  return null;
}

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    HydrateFallback: HydrateFallback,
    errorElement: React.createElement(RouteErrorFallback),
    children: [
      { index: true, Component: HomePage },
      {
        path: "catalogo",
        errorElement: React.createElement(RouteErrorFallback),
        lazy: function () { return import("./pages/CatalogPage").then(function (m) { return { Component: m.CatalogPage }; }); },
      },
      {
        path: "produto/:id",
        errorElement: React.createElement(RouteErrorFallback),
        lazy: function () { return import("./pages/ProductDetailPage").then(function (m) { return { Component: m.ProductDetailPage }; }); },
      },
      {
        path: "contato",
        errorElement: React.createElement(RouteErrorFallback),
        lazy: function () { return import("./pages/ContactPage").then(function (m) { return { Component: m.ContactPage }; }); },
      },
      {
        path: "sobre",
        errorElement: React.createElement(RouteErrorFallback),
        lazy: function () { return import("./pages/AboutPage").then(function (m) { return { Component: m.AboutPage }; }); },
      },
      {
        path: "conta",
        errorElement: React.createElement(RouteErrorFallback),
        lazy: function () { return import("./pages/UserAuthPage").then(function (m) { return { Component: m.UserAuthPage }; }); },
      },
      {
        path: "conta/redefinir-senha",
        errorElement: React.createElement(RouteErrorFallback),
        lazy: function () { return import("./pages/UserResetPasswordPage").then(function (m) { return { Component: m.UserResetPasswordPage }; }); },
      },
      {
        path: "minha-conta",
        errorElement: React.createElement(RouteErrorFallback),
        lazy: function () { return import("./pages/UserAccountPage").then(function (m) { return { Component: m.UserAccountPage }; }); },
      },
      {
        path: "checkout",
        errorElement: React.createElement(RouteErrorFallback),
        lazy: function () { return import("./pages/CheckoutPage").then(function (m) { return { Component: m.CheckoutPage }; }); },
      },
      {
        path: "politica-de-privacidade",
        errorElement: React.createElement(RouteErrorFallback),
        lazy: function () { return import("./pages/PrivacyPolicyPage").then(function (m) { return { Component: m.PrivacyPolicyPage }; }); },
      },
      {
        path: "termos-de-uso",
        errorElement: React.createElement(RouteErrorFallback),
        lazy: function () { return import("./pages/TermsPage").then(function (m) { return { Component: m.TermsPage }; }); },
      },
      {
        path: "exercicio-de-direitos",
        errorElement: React.createElement(RouteErrorFallback),
        lazy: function () { return import("./pages/LgpdRightsPage").then(function (m) { return { Component: m.LgpdRightsPage }; }); },
      },
      {
        path: "marca/:slug",
        errorElement: React.createElement(RouteErrorFallback),
        lazy: function () { return import("./pages/BrandPage").then(function (m) { return { Component: m.BrandPage }; }); },
      },
      {
        path: "afiliados",
        errorElement: React.createElement(RouteErrorFallback),
        lazy: function () { return import("./pages/AffiliatePage").then(function (m) { return { Component: m.AffiliatePage }; }); },
      },
      {
        path: "cupons",
        errorElement: React.createElement(RouteErrorFallback),
        lazy: function () { return import("./pages/CouponsPage").then(function (m) { return { Component: m.CouponsPage }; }); },
      },
      {
        path: "favoritos",
        errorElement: React.createElement(RouteErrorFallback),
        lazy: function () { return import("./pages/WishlistPage").then(function (m) { return { Component: m.WishlistPage }; }); },
      },
      {
        path: "rastreio/:orderId",
        errorElement: React.createElement(RouteErrorFallback),
        lazy: function () { return import("./pages/TrackingPage").then(function (m) { return { Component: m.TrackingPage }; }); },
      },
      {
        path: "faq",
        errorElement: React.createElement(RouteErrorFallback),
        lazy: function () { return import("./pages/FaqPage").then(function (m) { return { Component: m.FaqPage }; }); },
      },
      {
        path: "docs",
        errorElement: React.createElement(RouteErrorFallback),
        lazy: function () { return import("./pages/DocsPage").then(function (m) { return { Component: m.DocsPage }; }); },
      },
      {
        path: "*",
        errorElement: React.createElement(RouteErrorFallback),
        lazy: function () { return import("./pages/NotFoundPage").then(function (m) { return { Component: m.NotFoundPage }; }); },
      },
    ],
  },
  {
    path: "/admin",
    HydrateFallback: HydrateFallback,
    lazy: function () { return import("./pages/admin/AdminPage").then(function (m) { return { Component: m.AdminPage }; }); },
  },
  {
    path: "/admin/reset-password",
    HydrateFallback: HydrateFallback,
    lazy: function () { return import("./pages/admin/AdminResetPasswordPage").then(function (m) { return { Component: m.AdminResetPasswordPage }; }); },
  },
]);