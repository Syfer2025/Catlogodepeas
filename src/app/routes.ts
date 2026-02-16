import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { HomePage } from "./pages/HomePage";
import { CatalogPage } from "./pages/CatalogPage";
import { ProductDetailPage } from "./pages/ProductDetailPage";
import { ContactPage } from "./pages/ContactPage";
import { NotFoundPage } from "./pages/NotFoundPage";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: HomePage },
      { path: "catalogo", Component: CatalogPage },
      { path: "produto/:id", Component: ProductDetailPage },
      { path: "contato", Component: ContactPage },
      { path: "*", Component: NotFoundPage },
    ],
  },
  {
    path: "/admin",
    lazy: () =>
      import("./pages/admin/AdminPage").then((m) => ({
        Component: m.AdminPage,
      })),
    HydrateFallback: () => null,
  },
]);