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
  request<{ sent: boolean }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({
      email,
      redirectTo: `${window.location.origin}/admin/reset-password`,
    }),
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