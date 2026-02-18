import { projectId, publicAnonKey } from "/utils/supabase/info";
import type { Product, Category } from "../data/products";

const BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-b7b07654`;

const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${publicAnonKey}`,
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...headers, ...options?.headers },
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    const msg = errorBody?.error || `HTTP ${res.status} on ${path}`;
    console.error(`API Error [${path}]:`, msg);
    throw new Error(msg);
  }
  return res.json();
}

// ─── Seed ───
export const seedData = () => request<{ seeded: boolean }>("/seed", { method: "POST" });

// ─── Auth ───
export const forgotPassword = (email: string) =>
  request<{ sent: boolean; recoveryId?: string }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });

export const recoveryStatus = (rid: string) =>
  request<{ status: string }>(
    "/auth/recovery-status",
    {
      method: "POST",
      body: JSON.stringify({ rid }),
    }
  );

export const resetPassword = (rid: string, newPassword: string) =>
  request<{ ok?: boolean; error?: string }>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ rid, newPassword }),
  });

// ─── User Auth ───

export const userSignup = (data: { email: string; password: string; name: string; phone?: string; cpf?: string }) =>
  request<{ user: { id: string; email: string; name: string }; emailConfirmationRequired?: boolean }>("/auth/user/signup", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const userMe = (accessToken: string) =>
  request<{
    id: string;
    email: string;
    name: string;
    phone: string;
    role: string;
    cpf: string;
    address: string;
    city: string;
    state: string;
    cep: string;
    created_at: string;
  }>("/auth/user/me", {
    headers: { "X-User-Token": accessToken },
  });

export const userUpdateProfile = (
  accessToken: string,
  data: {
    name: string;
    phone: string;
    cpf: string;
    address: string;
    city: string;
    state: string;
    cep: string;
  }
) =>
  request<{ ok: boolean; profile: any }>("/auth/user/profile", {
    method: "PUT",
    body: JSON.stringify(data),
    headers: { "X-User-Token": accessToken },
  });

export const userChangePassword = (accessToken: string, newPassword: string) =>
  request<{ ok?: boolean; error?: string }>("/auth/user/change-password", {
    method: "POST",
    body: JSON.stringify({ newPassword }),
    headers: { "X-User-Token": accessToken },
  });

export const userForgotPassword = (email: string) =>
  request<{ sent: boolean; recoveryId?: string }>("/auth/user/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });

// ─── Admin: Clients ───

export interface ClientProfile {
  id: string;
  email: string;
  name: string;
  phone: string;
  cpf: string;
  address: string;
  city: string;
  state: string;
  cep: string;
  created_at: string;
  email_confirmed: boolean;
  last_sign_in: string | null;
}

export const getAdminClients = (accessToken: string) =>
  request<{ clients: ClientProfile[]; total: number }>("/auth/admin/clients", {
    headers: { "X-User-Token": accessToken },
  });

// ─── SIGE API ───
export const sigeSaveConfig = (accessToken: string, config: { baseUrl: string; email: string; password: string }) =>
  request<{ success: boolean }>("/sige/save-config", {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(config),
  });

export const sigeGetConfig = (accessToken: string) =>
  request<{ baseUrl?: string; email?: string; hasPassword?: boolean; updatedAt?: string }>("/sige/config", {
    headers: { "X-User-Token": accessToken },
  });

export const sigeConnect = (accessToken: string) =>
  request<{ connected: boolean; hasToken: boolean; hasRefreshToken: boolean; expiresAt: string; responseKeys: string[] }>("/sige/connect", {
    method: "POST",
    headers: { "X-User-Token": accessToken },
  });

export const sigeRefreshToken = (accessToken: string) =>
  request<{ refreshed: boolean; hasToken: boolean; expiresAt: string }>("/sige/refresh-token", {
    method: "POST",
    headers: { "X-User-Token": accessToken },
  });

export const sigeGetStatus = (accessToken: string) =>
  request<{
    configured: boolean; baseUrl?: string; email?: string; hasPassword?: boolean;
    hasToken: boolean; hasRefreshToken?: boolean; expired: boolean;
    createdAt?: string; expiresAt?: string; expiresInMs?: number;
  }>("/sige/status", {
    headers: { "X-User-Token": accessToken },
  });

export const sigeDisconnect = (accessToken: string) =>
  request<{ disconnected: boolean }>("/sige/disconnect", {
    method: "POST",
    headers: { "X-User-Token": accessToken },
  });

// ─── SIGE: Usuarios ───
export const sigeUserRegister = (accessToken: string, data: { name: string; email: string; password: string; baseUrl?: string }) =>
  request<any>("/sige/user/register", {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

export const sigeUserCreate = (accessToken: string, data: { name: string; email: string; password: string }) =>
  request<any>("/sige/user/create", {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

export const sigeUserMe = (accessToken: string) =>
  request<any>("/sige/user/me", {
    headers: { "X-User-Token": accessToken },
  });

export const sigeUserResetPassword = (accessToken: string, id: string, data: { password: string; newPassword: string }) =>
  request<any>(`/sige/user/reset/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

// ─── SIGE: Dependencias (generic GET proxy) ───
export const sigeDep = (accessToken: string, endpoint: string, params?: Record<string, string>) => {
  const cleaned = Object.fromEntries(
    Object.entries(params || {}).filter(([, v]) => v.trim() !== "")
  );
  const qs = Object.keys(cleaned).length > 0 ? "?" + new URLSearchParams(cleaned).toString() : "";
  return request<{ endpoint: string; sigeStatus: number; ok: boolean; data: any }>(`/sige/dep/${endpoint}${qs}`, {
    headers: { "X-User-Token": accessToken },
  });
};

// ─── SIGE: Categorias ───
export const sigeCategoryGet = (accessToken: string, params?: Record<string, string>) => {
  const cleaned = Object.fromEntries(
    Object.entries(params || {}).filter(([, v]) => v.trim() !== "")
  );
  const qs = Object.keys(cleaned).length > 0 ? "?" + new URLSearchParams(cleaned).toString() : "";
  return request<any>(`/sige/category${qs}`, {
    headers: { "X-User-Token": accessToken },
  });
};

export const sigeCategoryCreate = (accessToken: string, data: { codCategoria: string; nomeCategoria: string; classe: string }) =>
  request<any>("/sige/category", {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

export const sigeCategoryUpdate = (accessToken: string, id: string, data: { nomeCategoria: string; classe: string }) =>
  request<any>(`/sige/category/${id}`, {
    method: "PUT",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

export const sigeCategoryDelete = (accessToken: string, id: string) =>
  request<any>(`/sige/category/${id}`, {
    method: "DELETE",
    headers: { "X-User-Token": accessToken },
  });

// ─── SIGE: Clientes ───
export const sigeCustomerSearch = (accessToken: string, params?: Record<string, string>) => {
  const cleaned = Object.fromEntries(
    Object.entries(params || {}).filter(([, v]) => v.trim() !== "")
  );
  const qs = Object.keys(cleaned).length > 0 ? "?" + new URLSearchParams(cleaned).toString() : "";
  return request<any>(`/sige/customer${qs}`, {
    headers: { "X-User-Token": accessToken },
  });
};

export const sigeCustomerGetById = (accessToken: string, id: string, params?: Record<string, string>) => {
  const cleaned = Object.fromEntries(
    Object.entries(params || {}).filter(([, v]) => v.trim() !== "")
  );
  const qs = Object.keys(cleaned).length > 0 ? "?" + new URLSearchParams(cleaned).toString() : "";
  return request<any>(`/sige/customer/${id}${qs}`, {
    headers: { "X-User-Token": accessToken },
  });
};

export const sigeCustomerCreate = (accessToken: string, data: any) =>
  request<any>("/sige/customer", {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

export const sigeCustomerUpdate = (accessToken: string, id: string, data: any) =>
  request<any>(`/sige/customer/${id}`, {
    method: "PUT",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

// ─── SIGE: Cliente Endereco ───
export const sigeCustomerAddressGet = (accessToken: string, id: string, params?: Record<string, string>) => {
  const cleaned = Object.fromEntries(
    Object.entries(params || {}).filter(([, v]) => v.trim() !== "")
  );
  const qs = Object.keys(cleaned).length > 0 ? "?" + new URLSearchParams(cleaned).toString() : "";
  return request<any>(`/sige/customer/${id}/address${qs}`, {
    headers: { "X-User-Token": accessToken },
  });
};

export const sigeCustomerAddressCreate = (accessToken: string, id: string, data: any) =>
  request<any>(`/sige/customer/${id}/address`, {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

export const sigeCustomerAddressUpdate = (accessToken: string, id: string, data: any) =>
  request<any>(`/sige/customer/${id}/address`, {
    method: "PUT",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

// ─── SIGE: Cliente Complemento ───
export const sigeCustomerComplementGet = (accessToken: string, id: string) =>
  request<any>(`/sige/customer/${id}/complement`, {
    headers: { "X-User-Token": accessToken },
  });

export const sigeCustomerComplementCreate = (accessToken: string, id: string, data: any) =>
  request<any>(`/sige/customer/${id}/complement`, {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

export const sigeCustomerComplementUpdate = (accessToken: string, id: string, data: any) =>
  request<any>(`/sige/customer/${id}/complement`, {
    method: "PUT",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

// ─── SIGE: Cliente Contato ───
export const sigeCustomerContactGet = (accessToken: string, id: string, params?: Record<string, string>) => {
  const cleaned = Object.fromEntries(
    Object.entries(params || {}).filter(([, v]) => v.trim() !== "")
  );
  const qs = Object.keys(cleaned).length > 0 ? "?" + new URLSearchParams(cleaned).toString() : "";
  return request<any>(`/sige/customer/${id}/contact${qs}`, {
    headers: { "X-User-Token": accessToken },
  });
};

export const sigeCustomerContactCreate = (accessToken: string, id: string, data: any) =>
  request<any>(`/sige/customer/${id}/contact`, {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

export const sigeCustomerContactUpdate = (accessToken: string, id: string, nome: string, data: any) =>
  request<any>(`/sige/customer/${id}/contact?nome=${encodeURIComponent(nome)}`, {
    method: "PUT",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

// ─── SIGE: Produto ───
export const sigeProductGet = (accessToken: string, params?: Record<string, string>) => {
  const cleaned = Object.fromEntries(
    Object.entries(params || {}).filter(([, v]) => v.trim() !== "")
  );
  const qs = Object.keys(cleaned).length > 0 ? "?" + new URLSearchParams(cleaned).toString() : "";
  return request<any>(`/sige/product${qs}`, {
    headers: { "X-User-Token": accessToken },
  });
};

export const sigeProductCreate = (accessToken: string, data: any) =>
  request<any>("/sige/product", {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

export const sigeProductUpdate = (accessToken: string, id: string, data: any) =>
  request<any>(`/sige/product/${id}`, {
    method: "PUT",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

// ─── SIGE: Produto Saldo ───
export const sigeProductBalanceGet = (accessToken: string, id: string, params?: Record<string, string>) => {
  const cleaned = Object.fromEntries(
    Object.entries(params || {}).filter(([, v]) => v.trim() !== "")
  );
  const qs = Object.keys(cleaned).length > 0 ? "?" + new URLSearchParams(cleaned).toString() : "";
  return request<any>(`/sige/product/${id}/balance${qs}`, {
    headers: { "X-User-Token": accessToken },
  });
};

// ─── SIGE: Produto PCP ───
export const sigeProductPcpGet = (accessToken: string, id: string, params?: Record<string, string>) => {
  const cleaned = Object.fromEntries(
    Object.entries(params || {}).filter(([, v]) => v.trim() !== "")
  );
  const qs = Object.keys(cleaned).length > 0 ? "?" + new URLSearchParams(cleaned).toString() : "";
  return request<any>(`/sige/product/${id}/product-control-plan${qs}`, {
    headers: { "X-User-Token": accessToken },
  });
};

// ─── SIGE: Produto Promocao ───
export const sigeProductPromotionGet = (accessToken: string, id: string, params?: Record<string, string>) => {
  const cleaned = Object.fromEntries(
    Object.entries(params || {}).filter(([, v]) => v.trim() !== "")
  );
  const qs = Object.keys(cleaned).length > 0 ? "?" + new URLSearchParams(cleaned).toString() : "";
  return request<any>(`/sige/product/${id}/promotion${qs}`, {
    headers: { "X-User-Token": accessToken },
  });
};

// ─── SIGE: Produto Referencia ───
export const sigeProductReferenceGet = (accessToken: string, id: string, params?: Record<string, string>) => {
  const cleaned = Object.fromEntries(
    Object.entries(params || {}).filter(([, v]) => v.trim() !== "")
  );
  const qs = Object.keys(cleaned).length > 0 ? "?" + new URLSearchParams(cleaned).toString() : "";
  return request<any>(`/sige/product/${id}/reference${qs}`, {
    headers: { "X-User-Token": accessToken },
  });
};

export const sigeProductReferenceCreate = (accessToken: string, id: string, data: any) =>
  request<any>(`/sige/product/${id}/reference`, {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

export const sigeProductReferenceUpdate = (accessToken: string, id: string, data: any) =>
  request<any>(`/sige/product/${id}/reference`, {
    method: "PUT",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

// ─── SIGE: Produto Ficha Tecnica ───
export const sigeProductTechnicalSheetGet = (accessToken: string, id: string, params?: Record<string, string>) => {
  const cleaned = Object.fromEntries(
    Object.entries(params || {}).filter(([, v]) => v.trim() !== "")
  );
  const qs = Object.keys(cleaned).length > 0 ? "?" + new URLSearchParams(cleaned).toString() : "";
  return request<any>(`/sige/product/${id}/technical-sheet${qs}`, {
    headers: { "X-User-Token": accessToken },
  });
};

export const sigeProductTechnicalSheetCreate = (accessToken: string, id: string, data: any) =>
  request<any>(`/sige/product/${id}/technical-sheet`, {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

export const sigeProductTechnicalSheetUpdate = (accessToken: string, id: string, data: any) =>
  request<any>(`/sige/product/${id}/technical-sheet`, {
    method: "PUT",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

// ─── SIGE: Pedidos (Orders) ───
export const sigeOrderSearch = (accessToken: string, params?: Record<string, string>) => {
  const cleaned = Object.fromEntries(
    Object.entries(params || {}).filter(([, v]) => v.trim() !== "")
  );
  const qs = Object.keys(cleaned).length > 0 ? "?" + new URLSearchParams(cleaned).toString() : "";
  return request<any>(`/sige/order${qs}`, {
    headers: { "X-User-Token": accessToken },
  });
};

export const sigeOrderGetById = (accessToken: string, id: string) =>
  request<any>(`/sige/order/${id}`, {
    headers: { "X-User-Token": accessToken },
  });

export const sigeOrderCreate = (accessToken: string, data: any) =>
  request<any>(`/sige/order`, {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

// ─── SIGE: Pedidos Observacao ───
export const sigeOrderObservationGet = (accessToken: string, id: string) =>
  request<any>(`/sige/order/${id}/observation`, {
    headers: { "X-User-Token": accessToken },
  });

export const sigeOrderObservationCreate = (accessToken: string, id: string, data: any) =>
  request<any>(`/sige/order/${id}/observation`, {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

export const sigeOrderObservationUpdate = (accessToken: string, id: string, data: any) =>
  request<any>(`/sige/order/${id}/observation`, {
    method: "PUT",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

// ─── SIGE: Pedidos Parcelamento ───
export const sigeOrderInstallmentGet = (accessToken: string, id: string) =>
  request<any>(`/sige/order/${id}/installment`, {
    headers: { "X-User-Token": accessToken },
  });

// ─── SIGE: Pedidos Items ───
export const sigeOrderItemsGet = (accessToken: string, id: string) =>
  request<any>(`/sige/order-items/${id}`, {
    headers: { "X-User-Token": accessToken },
  });

export const sigeOrderItemsCreate = (accessToken: string, id: string, data: any) =>
  request<any>(`/sige/order-items/${id}`, {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

// ─── SIGE: Pedidos Items Text ───
export const sigeOrderItemsTextGet = (accessToken: string, id: string, params?: Record<string, string>) => {
  const cleaned = Object.fromEntries(
    Object.entries(params || {}).filter(([, v]) => v.trim() !== "")
  );
  const qs = Object.keys(cleaned).length > 0 ? "?" + new URLSearchParams(cleaned).toString() : "";
  return request<any>(`/sige/order-items/${id}/text${qs}`, {
    headers: { "X-User-Token": accessToken },
  });
};

export const sigeOrderItemsTextCreate = (accessToken: string, id: string, data: any) =>
  request<any>(`/sige/order-items/${id}/text`, {
    method: "POST",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

export const sigeOrderItemsTextUpdate = (accessToken: string, id: string, data: any) =>
  request<any>(`/sige/order-items/${id}/text`, {
    method: "PUT",
    headers: { "X-User-Token": accessToken },
    body: JSON.stringify(data),
  });

// ─── Products ───
export const getProducts = () => request<Product[]>("/products");
export const getProduct = (id: string) => request<Product>(`/products/${id}`);
export const createProduct = (product: Partial<Product>) =>
  request<Product>("/products", { method: "POST", body: JSON.stringify(product) });
export const updateProduct = (id: string, product: Partial<Product>) =>
  request<Product>(`/products/${id}`, { method: "PUT", body: JSON.stringify(product) });
export const deleteProduct = (id: string) =>
  request<{ deleted: boolean }>(`/products/${id}`, { method: "DELETE" });

// ─── Categories ───
export const getCategories = () => request<Category[]>("/categories");
export const createCategory = (category: Partial<Category>) =>
  request<Category>("/categories", { method: "POST", body: JSON.stringify(category) });
export const updateCategory = (id: string, category: Partial<Category>) =>
  request<Category>(`/categories/${id}`, { method: "PUT", body: JSON.stringify(category) });
export const deleteCategory = (id: string) =>
  request<{ deleted: boolean }>(`/categories/${id}`, { method: "DELETE" });

// ─── Category Tree (hierarchical) ───
export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  children?: CategoryNode[];
}

export const getCategoryTree = () => request<CategoryNode[]>("/category-tree");
export const saveCategoryTree = (tree: CategoryNode[]) =>
  request<CategoryNode[]>("/category-tree", { method: "PUT", body: JSON.stringify(tree) });

// ─── Messages ───
export interface Message {
  id: string;
  name: string;
  email: string;
  phone: string;
  subject: string;
  subjectLabel: string;
  message: string;
  date: string;
  read: boolean;
}

export const getMessages = () => request<Message[]>("/messages");
export const createMessage = (msg: Partial<Message>) =>
  request<Message>("/messages", { method: "POST", body: JSON.stringify(msg) });
export const updateMessage = (id: string, msg: Partial<Message>) =>
  request<Message>(`/messages/${id}`, { method: "PUT", body: JSON.stringify(msg) });
export const deleteMessage = (id: string) =>
  request<{ deleted: boolean }>(`/messages/${id}`, { method: "DELETE" });

// ─── Settings ───
export interface SiteSettings {
  storeName: string;
  storeSubtitle: string;
  email: string;
  phone: string;
  address: string;
  cep: string;
  cnpj: string;
  freeShippingMin: string;
  maxInstallments: string;
  workdaysHours: string;
  saturdayHours: string;
  whatsapp: string;
  facebook: string;
  instagram: string;
  youtube: string;
  primaryColor: string;
  emailNotifications: boolean;
  stockAlerts: boolean;
  newMessageAlerts: boolean;
  weeklyReport: boolean;
  maintenanceMode: boolean;
}

export const getSettings = () => request<SiteSettings>("/settings");
export const updateSettings = (settings: SiteSettings) =>
  request<SiteSettings>("/settings", { method: "PUT", body: JSON.stringify(settings) });

// ─── Produtos (Supabase DB Table) ───
export interface ProdutoDB {
  sku: string;
  titulo: string;
}

export interface ProdutosResponse {
  data: ProdutoDB[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export const getProdutosDB = (page = 1, limit = 24, search = "") => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search.trim()) params.set("search", search.trim());
  return request<ProdutosResponse>(`/produtos?${params.toString()}`);
};

// ─── Catalog (public, with category + visibility filtering) ───

export interface CatalogResponse {
  data: ProdutoDB[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  categoria: string | null;
  categoryName: string | null;
  categoryBreadcrumb: string[] | null;
}

export const getCatalog = (page = 1, limit = 24, search = "", categoria = "") => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit), public: "1" });
  if (search.trim()) params.set("search", search.trim());
  if (categoria.trim()) params.set("categoria", categoria.trim());
  return request<CatalogResponse>(`/produtos?${params.toString()}`);
};

/** Random visible products for the homepage — different on each page load */
export const getDestaques = (limit = 8) => {
  const params = new URLSearchParams({ limit: String(limit) });
  return request<{ data: ProdutoDB[] }>(`/produtos/destaques?${params.toString()}`);
};

export const getProdutoBySku = (sku: string) => {
  const params = new URLSearchParams({ sku, limit: "1" });
  return request<ProdutosResponse>(`/produtos?${params.toString()}`);
};

// ─── Match SKUs (bulk matching with normalized comparison) ───
export interface MatchSkusResponse {
  totalDb: number;
  totalDbUnique: number;
  matched: string[];
  unmatched: string[];
  totalMatched: number;
  totalUnmatched: number;
  matchDetails: {
    exact: number;
    normalized: number;
    aggressive: number;
  };
}

export const matchSkus = (skus: string[]) =>
  request<MatchSkusResponse>("/produtos/match-skus", {
    method: "POST",
    body: JSON.stringify({ skus }),
  });

// ─── Autocomplete (fuzzy search) ───
export interface AutocompleteResult {
  sku: string;
  titulo: string;
  matchType: "exact" | "sku" | "similar" | "fuzzy";
  score: number;
}

export interface AutocompleteResponse {
  results: AutocompleteResult[];
  query: string;
  totalMatches: number;
}

export const autocomplete = (q: string, limit = 8) => {
  const params = new URLSearchParams({ q, limit: String(limit) });
  return request<AutocompleteResponse>(`/produtos/autocomplete?${params.toString()}`);
};

// ─── Product Images (Supabase Storage) ───

const STORAGE_BASE = "https://aztdgagxvrlylszieujs.supabase.co/storage/v1/object/public/produtos";

export interface ProductImage {
  name: string;
  url: string;
  number: number;
  isPrimary: boolean;
}

export interface ProductImagesResponse {
  sku: string;
  images: ProductImage[];
  total: number;
  error?: string;
}

/** Get all images for a product from the backend (lists Storage bucket) */
export const getProductImages = (sku: string) => {
  return request<ProductImagesResponse>(`/produtos/imagens/${encodeURIComponent(sku)}`);
};

/**
 * Build the public URL for a product's primary image (image #1).
 * This is a direct URL — no API call needed.
 * Use with <img onError> fallback for products without images.
 */
export function getProductMainImageUrl(sku: string): string {
  return `${STORAGE_BASE}/${encodeURIComponent(sku)}/${encodeURIComponent(sku)}.1.webp`;
}

// ─── Product Attributes (CSV-based) ───

export interface ProductAttributesResponse {
  sku: string;
  attributes: Record<string, string | string[]> | null;
  found: boolean;
  error?: string;
}

/** Get dynamic attributes for a product (parsed from CSV in Storage) */
export const getProductAttributes = (sku: string) => {
  const params = new URLSearchParams({ sku });
  return request<ProductAttributesResponse>(`/produtos/atributos?${params.toString()}`);
};

// ─── Product Stock Balance (SIGE) ───

export interface ProductBalance {
  sku: string;
  found: boolean;
  sige: boolean;
  sigeId?: string;
  descricao?: string;
  quantidade: number | null;
  reservado?: number;
  disponivel?: number;
  locais?: Array<{
    local: string;
    filial: string;
    quantidade: number;
    reservado: number;
    disponivel: number;
  }>;
  balanceRaw?: any;
  balanceError?: string;
  cached?: boolean;
  error?: string;
  _priceKeys?: string[];
  _allKeys?: string[];
  _fetchedDetail?: boolean;
  _detailKeys?: number;
}

/** Get stock balance for a single product from SIGE (public, cached 5 min) */
export const getProductBalance = (sku: string, opts?: { force?: boolean; debug?: boolean }) => {
  const params = new URLSearchParams();
  if (opts?.force) params.set("force", "1");
  if (opts?.debug) params.set("debug", "1");
  const qs = params.toString();
  return request<ProductBalance & { _debug?: string[]; _sigeResponses?: any[] }>(
    `/produtos/saldo/${encodeURIComponent(sku)}${qs ? `?${qs}` : ""}`
  );
};

/** Get stock balances for multiple SKUs in bulk (admin) */
export const getProductBalances = (skus: string[]) =>
  request<{ results: ProductBalance[]; total: number }>("/produtos/saldos", {
    method: "POST",
    body: JSON.stringify({ skus }),
  });

/** Clear balance cache for all SKUs (admin, requires auth) */
export const clearBalanceCache = (accessToken: string) =>
  request<{ cleared: number; message: string }>("/produtos/saldo/cache", {
    method: "DELETE",
    headers: { "X-User-Token": accessToken },
  });

/** Clear balance cache for a single SKU (admin, requires auth) */
export const clearBalanceCacheSku = (accessToken: string, sku: string) =>
  request<{ cleared: boolean; sku: string; message: string }>(
    `/produtos/saldo/cache/${encodeURIComponent(sku)}`,
    { method: "DELETE", headers: { "X-User-Token": accessToken } }
  );

/** Global stock summary across ALL products */
export interface StockSummary {
  totalProducts: number;
  inStock: number;
  outOfStock: number;
  notFound: number;
  pending: number;
  totalCached: number;
  cached: boolean;
  _cachedAt: number;
  error?: string;
}

export const getStockSummary = () =>
  request<StockSummary>("/produtos/stock-summary");

/** Trigger balance scan for uncached/expired SKUs */
export interface StockScanResult {
  scanned: number;
  found: number;
  remaining: number;
  totalPending: number;
  message?: string;
  error?: string;
}

export const triggerStockScan = (batchSize = 50) =>
  request<StockScanResult>("/produtos/stock-scan", {
    method: "POST",
    body: JSON.stringify({ batchSize }),
  });

// ─── SIGE Product Mapping (match local SKUs ↔ SIGE IDs) ───

export interface SigeMapping {
  sku: string;
  sigeId: string;
  codProduto: string;
  descricao: string;
  matchType: string;
  matchedAt: number;
  matchedBy?: string;
}

export interface SigeSyncResult {
  ok: boolean;
  localProducts: number;
  sigeProducts: number;
  matched: number;
  unmatched: number;
  skipped: number;
  balanceFetched: number;
  matchResults: Array<{
    sku: string;
    matched: boolean;
    matchType?: string;
    sigeId?: string;
    codProduto?: string;
    descricao?: string;
    titulo?: string;
  }>;
  totalResults: number;
  error?: string;
}

/** Get all SIGE mappings */
export const getSigeMappings = () =>
  request<{ mappings: SigeMapping[]; total: number }>("/produtos/sige-map");

/** Manually map a local SKU to a SIGE product ID */
export const setSigeMapping = (
  accessToken: string,
  sku: string,
  data: { sigeId: string; codProduto?: string; descricao?: string }
) =>
  request<{ ok: boolean; sku: string; mapping: SigeMapping }>(
    `/produtos/sige-map/${encodeURIComponent(sku)}`,
    {
      method: "PUT",
      body: JSON.stringify(data),
      headers: { "X-User-Token": accessToken },
    }
  );

/** Remove mapping for a SKU */
export const deleteSigeMapping = (accessToken: string, sku: string) =>
  request<{ ok: boolean; sku: string; message: string }>(
    `/produtos/sige-map/${encodeURIComponent(sku)}`,
    {
      method: "DELETE",
      headers: { "X-User-Token": accessToken },
    }
  );

/** Auto-match local products with SIGE products */
export const triggerSigeSync = (
  accessToken: string,
  opts?: { fetchBalances?: boolean; clearExisting?: boolean; batchSize?: number }
) =>
  request<SigeSyncResult>("/produtos/sige-sync", {
    method: "POST",
    body: JSON.stringify(opts || {}),
    headers: { "X-User-Token": accessToken },
  });

// ─── Product CRUD (Admin) ───

export interface ProductMeta {
  sku?: string;
  visible?: boolean;
  description?: string;
  category?: string;
  brand?: string;
  price?: number;
  compatibility?: string[];
  customAttributes?: Record<string, string>;
}

export const getProductMeta = (sku: string) =>
  request<ProductMeta>(`/produtos/meta/${encodeURIComponent(sku)}`);

export const saveProductMeta = (sku: string, meta: Partial<ProductMeta>) =>
  request<ProductMeta>(`/produtos/meta/${encodeURIComponent(sku)}`, {
    method: "PUT",
    body: JSON.stringify(meta),
  });

export const updateProdutoTitulo = (sku: string, titulo: string, accessToken: string) =>
  request<{ sku: string; titulo: string; updated: boolean }>(
    `/produtos/${encodeURIComponent(sku)}/titulo`,
    {
      method: "PUT",
      body: JSON.stringify({ titulo }),
      headers: { "X-User-Token": accessToken },
    }
  );

export const renameProdutoSku = (oldSku: string, newSku: string, accessToken: string) =>
  request<{ oldSku: string; newSku: string; renamed: boolean }>(
    `/produtos/${encodeURIComponent(oldSku)}/rename`,
    {
      method: "PUT",
      body: JSON.stringify({ newSku }),
      headers: { "X-User-Token": accessToken },
    }
  );

export const createProduto = (
  sku: string,
  titulo: string,
  meta: Partial<ProductMeta>,
  accessToken: string
) =>
  request<{ sku: string; titulo: string; created: boolean }>("/produtos/create", {
    method: "POST",
    body: JSON.stringify({ sku, titulo, meta }),
    headers: { "X-User-Token": accessToken },
  });

export const deleteProduto = (sku: string, accessToken: string) =>
  request<{ sku: string; deleted: boolean }>(
    `/produtos/${encodeURIComponent(sku)}/delete`,
    {
      method: "DELETE",
      headers: { "X-User-Token": accessToken },
    }
  );

export const uploadProductImage = async (
  sku: string,
  file: File,
  filename: string,
  accessToken: string
) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("filename", filename);

  const res = await fetch(
    `${BASE_URL}/produtos/imagens/${encodeURIComponent(sku)}/upload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${publicAnonKey}`,
        "X-User-Token": accessToken,
      },
      body: formData,
    }
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data as { uploaded: boolean; path: string; url: string; filename: string };
};

export const deleteProductImage = (sku: string, filename: string, accessToken: string) =>
  request<{ deleted: boolean; path: string }>(
    `/produtos/imagens/${encodeURIComponent(sku)}/file`,
    {
      method: "DELETE",
      body: JSON.stringify({ filename }),
      headers: { "X-User-Token": accessToken },
    }
  );

export const getProductMetaBulk = (skus: string[]) =>
  request<Record<string, ProductMeta>>("/produtos/meta/bulk", {
    method: "POST",
    body: JSON.stringify({ skus }),
  });

// ─── Attributes Upload (Admin) ───

export interface UploadAttributesResult {
  success: boolean;
  totalCsv: number;
  totalDb: number;
  matched: number;
  unmatched: number;
  unmatchedSkus: string[];
  columns: string[];
  preview: { sku: string; attributes: Record<string, string | string[]> }[];
  message: string;
  error?: string;
}

/** Upload a CSV file with product attributes (requires auth) */
export const uploadAttributesCsv = async (
  file: File,
  accessToken: string
): Promise<UploadAttributesResult> => {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${BASE_URL}/produtos/atributos/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${publicAnonKey}`,
      "X-User-Token": accessToken,
    },
    body: formData,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
};

/** Get all attributes (for admin overview) */
export const getAllAttributes = () => {
  return request<{
    total: number;
    data: { sku: string; attributes: Record<string, string | string[]> }[];
  }>("/produtos/atributos");
};

/** Delete the attributes CSV from storage (requires auth) */
export const deleteAttributesCsv = async (accessToken: string) => {
  const res = await fetch(`${BASE_URL}/produtos/atributos`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${publicAnonKey}`,
      "X-User-Token": accessToken,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
};

// ─── Logo (Site Assets) ───

export interface LogoMeta {
  hasLogo: boolean;
  url: string | null;
  filename?: string;
  contentType?: string;
  size?: number;
  uploadedAt?: string;
}

export const getLogo = () => request<LogoMeta>("/logo");

export const uploadLogo = async (file: File, accessToken: string): Promise<LogoMeta & { uploaded: boolean }> => {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${BASE_URL}/logo/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${publicAnonKey}`,
      "X-User-Token": accessToken,
    },
    body: formData,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
};

export const deleteLogo = async (accessToken: string) => {
  const res = await fetch(`${BASE_URL}/logo`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${publicAnonKey}`,
      "X-User-Token": accessToken,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data as { deleted: boolean };
};

// ─── Footer Logo (Site Assets) ───

export const getFooterLogo = () => request<LogoMeta>("/footer-logo");

export const uploadFooterLogo = async (file: File, accessToken: string): Promise<LogoMeta & { uploaded: boolean }> => {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${BASE_URL}/footer-logo/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${publicAnonKey}`,
      "X-User-Token": accessToken,
    },
    body: formData,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
};

export const deleteFooterLogo = async (accessToken: string) => {
  const res = await fetch(`${BASE_URL}/footer-logo`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${publicAnonKey}`,
      "X-User-Token": accessToken,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data as { deleted: boolean };
};

// ─── Price Config ───

export interface PriceConfig {
  tier: "v1" | "v2" | "v3";
  showPrice: boolean;
  updatedAt?: number;
  listPriceMapping?: Record<string, string>;
}

export const getPriceConfig = () =>
  request<PriceConfig>("/price-config");

export const savePriceConfig = (config: Partial<PriceConfig>, accessToken: string) =>
  request<PriceConfig>("/price-config", {
    method: "PUT",
    body: JSON.stringify(config),
    headers: { "X-User-Token": accessToken },
  });

// ─── Product Price ───

export interface ProductPrice {
  sku: string;
  found: boolean;
  source: "sige" | "custom" | "none";
  price: number | null;
  v1: number | null;
  v2: number | null;
  v3: number | null;
  base?: number | null;
  tier: string;
  showPrice?: boolean;
  sigeId?: string;
  descricao?: string;
  cached?: boolean;
  error?: string;
  _priceListItems?: number;
  _detectedListCodes?: string[];
  _priceListDebug?: Array<{ codLista: string; price: number | null; descLista?: string | null }>;
  _itemSampleKeys?: string[];
  _listMapping?: Record<string, string>;
}

export const getProductPrice = (sku: string) =>
  request<ProductPrice>(`/produtos/preco/${encodeURIComponent(sku)}`);

export const setProductCustomPrice = (sku: string, price: number, accessToken: string) =>
  request<{ ok: boolean; sku: string; price: number }>(
    `/produtos/preco/${encodeURIComponent(sku)}`,
    {
      method: "PUT",
      body: JSON.stringify({ price }),
      headers: { "X-User-Token": accessToken },
    }
  );

export const deleteProductCustomPrice = (sku: string, accessToken: string) =>
  request<{ ok: boolean; sku: string; message: string }>(
    `/produtos/preco/${encodeURIComponent(sku)}`,
    {
      method: "DELETE",
      headers: { "X-User-Token": accessToken },
    }
  );

// ─── Custom Prices List ───

export interface CustomPriceEntry {
  sku: string;
  price: number;
  source: "custom";
  updatedAt: number | null;
}

export const getCustomPrices = (accessToken: string) =>
  request<{ customs: CustomPriceEntry[]; total: number }>("/produtos/custom-prices", {
    headers: { "X-User-Token": accessToken },
  });

export const clearPriceCache = (accessToken: string) =>
  request<{ cleared: number; message: string }>("/price-cache", {
    method: "DELETE",
    headers: { "X-User-Token": accessToken },
  });

// ─── SIGE List Price ───

export const getSigeListPrices = (accessToken: string) =>
  request<any>("/sige/list-price", {
    headers: { "X-User-Token": accessToken },
  });

export const getSigeListPriceItems = (accessToken: string, params?: { codProduto?: string; codLista?: string; limit?: number; offset?: number }) => {
  const cleaned: Record<string, string> = {};
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) cleaned[k] = String(v);
    }
  }
  const qs = Object.keys(cleaned).length > 0 ? "?" + new URLSearchParams(cleaned).toString() : "";
  return request<any>(`/sige/list-price-items${qs}`, {
    headers: { "X-User-Token": accessToken },
  });
};

// ─── PagHiper ───

export interface PagHiperConfig {
  configured: boolean;
  hasApiKey?: boolean;
  hasToken?: boolean;
  apiKeyPreview?: string | null;
  updatedAt?: number | null;
}

export const getPagHiperConfig = (accessToken: string) =>
  request<PagHiperConfig>("/paghiper/config", {
    headers: { "X-User-Token": accessToken },
  });

export const savePagHiperConfig = (accessToken: string, config: { apiKey: string; token: string }) =>
  request<{ success: boolean; configured: boolean }>("/paghiper/config", {
    method: "PUT",
    body: JSON.stringify(config),
    headers: { "X-User-Token": accessToken },
  });

export const deletePagHiperConfig = (accessToken: string) =>
  request<{ success: boolean; configured: boolean }>("/paghiper/config", {
    method: "DELETE",
    headers: { "X-User-Token": accessToken },
  });

// PIX

export interface PixCreatePayload {
  order_id: string;
  payer_email: string;
  payer_name: string;
  payer_cpf_cnpj: string;
  payer_phone?: string;
  days_due_date?: string;
  notification_url?: string;
  items: Array<{
    description: string;
    quantity: number;
    item_id: string;
    price_cents: number;
  }>;
}

export interface PixCreateResponse {
  success: boolean;
  transaction_id: string;
  status: string;
  qr_code_base64: string | null;
  pix_url: string | null;
  emv: string | null;
  bacen_url: string | null;
  due_date: string | null;
  value_cents: number | null;
  raw: any;
  error?: string;
}

export const createPixCharge = (payload: PixCreatePayload) =>
  request<PixCreateResponse>("/paghiper/pix/create", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const getPixStatus = (transaction_id: string) =>
  request<{
    transaction_id: string;
    status: string;
    status_label: string;
    value_cents: number | null;
    value_cents_paid: number | null;
    paid_date: string | null;
    due_date: string | null;
    raw: any;
  }>("/paghiper/pix/status", {
    method: "POST",
    body: JSON.stringify({ transaction_id }),
  });

export const cancelPixCharge = (accessToken: string, transaction_id: string) =>
  request<{ success: boolean; transaction_id: string }>("/paghiper/pix/cancel", {
    method: "POST",
    body: JSON.stringify({ transaction_id }),
    headers: { "X-User-Token": accessToken },
  });

// Boleto

export interface BoletoCreatePayload {
  order_id: string;
  payer_email: string;
  payer_name: string;
  payer_cpf_cnpj: string;
  payer_phone?: string;
  payer_street?: string;
  payer_number?: string;
  payer_complement?: string;
  payer_district?: string;
  payer_city?: string;
  payer_state?: string;
  payer_zip_code?: string;
  days_due_date?: string;
  notification_url?: string;
  items: Array<{
    description: string;
    quantity: number;
    item_id: string;
    price_cents: number;
  }>;
}

export interface BoletoCreateResponse {
  success: boolean;
  transaction_id: string;
  status: string;
  due_date: string | null;
  value_cents: number | null;
  bank_slip: {
    digitable_line: string | null;
    url_slip: string | null;
    url_slip_pdf: string | null;
  };
  raw: any;
  error?: string;
}

export const createBoletoCharge = (payload: BoletoCreatePayload) =>
  request<BoletoCreateResponse>("/paghiper/boleto/create", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const getBoletoStatus = (transaction_id: string) =>
  request<{
    transaction_id: string;
    status: string;
    status_label: string;
    value_cents: number | null;
    value_cents_paid: number | null;
    paid_date: string | null;
    due_date: string | null;
    raw: any;
  }>("/paghiper/boleto/status", {
    method: "POST",
    body: JSON.stringify({ transaction_id }),
  });

export const cancelBoletoCharge = (accessToken: string, transaction_id: string) =>
  request<{ success: boolean; transaction_id: string }>("/paghiper/boleto/cancel", {
    method: "POST",
    body: JSON.stringify({ transaction_id }),
    headers: { "X-User-Token": accessToken },
  });

// Transactions

export interface PagHiperTransaction {
  type: "pix" | "boleto";
  order_id: string;
  transaction_id: string;
  status: string;
  created_at: number;
  payer_email: string;
  payer_name: string;
  payer_cpf_cnpj: string;
  value_cents: number;
  paid_date?: string;
  canceled_at?: number;
  qr_code?: string | null;
  pix_url?: string | null;
  emv?: string | null;
  bank_slip?: {
    digitable_line: string | null;
    url_slip: string | null;
    url_slip_pdf: string | null;
  };
}

export const getPagHiperTransactions = (accessToken: string) =>
  request<{ transactions: PagHiperTransaction[]; total: number }>("/paghiper/transactions", {
    headers: { "X-User-Token": accessToken },
  });

export const getPagHiperTransaction = (transaction_id: string) =>
  request<PagHiperTransaction>(`/paghiper/transaction/${encodeURIComponent(transaction_id)}`);