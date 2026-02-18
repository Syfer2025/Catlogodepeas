import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { HomePage } from "./pages/HomePage";
import { CatalogPage } from "./pages/CatalogPage";
import { ProductDetailPage } from "./pages/ProductDetailPage";
import { ContactPage } from "./pages/ContactPage";
import { UserAuthPage } from "./pages/UserAuthPage";
import { UserAccountPage } from "./pages/UserAccountPage";
import { UserResetPasswordPage } from "./pages/UserResetPasswordPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { AdminPage } from "./pages/admin/AdminPage";
import { AdminResetPasswordPage } from "./pages/admin/AdminResetPasswordPage";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: HomePage },
      { path: "catalogo", Component: CatalogPage },
      { path: "produto/:id", Component: ProductDetailPage },
      { path: "contato", Component: ContactPage },
      { path: "conta", Component: UserAuthPage },
      { path: "conta/redefinir-senha", Component: UserResetPasswordPage },
      { path: "minha-conta", Component: UserAccountPage },
      { path: "*", Component: NotFoundPage },
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