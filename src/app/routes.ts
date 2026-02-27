import { createBrowserRouter } from "react-router";
import React from "react";
import { Layout } from "./components/Layout";
import { HomePage } from "./pages/HomePage";

// ─── Route-level lazy loading (React Router handles loading before transition) ───
// This avoids the "component suspended while responding to synchronous input" error
// that React.lazy() causes with React Router navigations.

// Simple spinner shown during initial hydration while lazy routes load
function HydrateFallback() {
  return React.createElement("div", {
    style: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }
  }, React.createElement("div", {
    style: {
      width: "32px", height: "32px",
      border: "3px solid #fecaca", borderTopColor: "#dc2626",
      borderRadius: "50%",
      animation: "spin 0.8s linear infinite"
    }
  }));
}

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    HydrateFallback: HydrateFallback,
    children: [
      { index: true, Component: HomePage },
      {
        path: "catalogo",
        lazy: function () { return import("./pages/CatalogPage").then(function (m) { return { Component: m.CatalogPage }; }); },
      },
      {
        path: "produto/:id",
        lazy: function () { return import("./pages/ProductDetailPage").then(function (m) { return { Component: m.ProductDetailPage }; }); },
      },
      {
        path: "contato",
        lazy: function () { return import("./pages/ContactPage").then(function (m) { return { Component: m.ContactPage }; }); },
      },
      {
        path: "sobre",
        lazy: function () { return import("./pages/AboutPage").then(function (m) { return { Component: m.AboutPage }; }); },
      },
      {
        path: "conta",
        lazy: function () { return import("./pages/UserAuthPage").then(function (m) { return { Component: m.UserAuthPage }; }); },
      },
      {
        path: "conta/redefinir-senha",
        lazy: function () { return import("./pages/UserResetPasswordPage").then(function (m) { return { Component: m.UserResetPasswordPage }; }); },
      },
      {
        path: "minha-conta",
        lazy: function () { return import("./pages/UserAccountPage").then(function (m) { return { Component: m.UserAccountPage }; }); },
      },
      {
        path: "checkout",
        lazy: function () { return import("./pages/CheckoutPage").then(function (m) { return { Component: m.CheckoutPage }; }); },
      },
      {
        path: "politica-de-privacidade",
        lazy: function () { return import("./pages/PrivacyPolicyPage").then(function (m) { return { Component: m.PrivacyPolicyPage }; }); },
      },
      {
        path: "termos-de-uso",
        lazy: function () { return import("./pages/TermsPage").then(function (m) { return { Component: m.TermsPage }; }); },
      },
      {
        path: "exercicio-de-direitos",
        lazy: function () { return import("./pages/LgpdRightsPage").then(function (m) { return { Component: m.LgpdRightsPage }; }); },
      },
      {
        path: "marca/:slug",
        lazy: function () { return import("./pages/BrandPage").then(function (m) { return { Component: m.BrandPage }; }); },
      },
      {
        path: "afiliados",
        lazy: function () { return import("./pages/AffiliatePage").then(function (m) { return { Component: m.AffiliatePage }; }); },
      },
      {
        path: "rastreio/:orderId",
        lazy: function () { return import("./pages/TrackingPage").then(function (m) { return { Component: m.TrackingPage }; }); },
      },
      {
        path: "*",
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