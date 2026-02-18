import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router";
import * as api from "../../services/api";
import type { ProdutoDB, ProductMeta, ProductImage, CategoryNode } from "../../services/api";
import type { ProductBalance, StockSummary } from "../../services/api";
import { supabase } from "../../services/supabaseClient";
import { defaultCategoryTree } from "../../data/categoryTree";
import { SigeStockSync } from "./SigeStockSync";
import { PriceBadge } from "../../components/PriceBadge";
import {
  Search, Package, Loader2, RefreshCw, Hash, Eye, EyeOff,
  ChevronLeft, ChevronRight, Grid3X3, List, Database, X,
  Plus, Edit3, Trash2, Save, ImagePlus, Check,
  AlertCircle, CheckCircle2, ChevronDown,
  FileText, Tag, ExternalLink, Camera, PenLine,
  PackageCheck, PackageX, Filter, ArrowUpDown, SlidersHorizontal,
  BarChart3, TrendingUp, TrendingDown, AlertOctagon,
} from "lucide-react";

const ITEMS_PER_PAGE = 20;

// Filter/sort types
type StockFilter = "all" | "in_stock" | "out_of_stock" | "not_found";
type VisibilityFilter = "all" | "visible" | "hidden";
type SortOption = "default" | "name_asc" | "name_desc" | "sku_asc" | "sku_desc" | "stock_desc" | "stock_asc";

// ─── Toast ───
function Toast({ toast }: { toast: { type: "success" | "error"; msg: string } | null }) {
  if (!toast) return null;
  return (
    <div className={`fixed top-4 right-4 z-[200] flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-white ${toast.type === "success" ? "bg-green-600" : "bg-red-600"}`} style={{ fontSize: "0.85rem", maxWidth: "400px" }}>
      {toast.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
      <span className="line-clamp-2">{toast.msg}</span>
    </div>
  );
}

// ─── Thumb ───
function ProductThumb({ sku, size = 40 }: { sku: string; size?: number }) {
  const [err, setErr] = useState(false);
  if (err) return <div className="rounded-lg bg-gray-100 flex items-center justify-center shrink-0" style={{ width: size, height: size }}><Package className="text-gray-300" style={{ width: size * 0.45, height: size * 0.45 }} /></div>;
  return <img src={api.getProductMainImageUrl(sku)} alt={sku} className="rounded-lg bg-gray-100 object-contain border border-gray-200 shrink-0" style={{ width: size, height: size }} loading="lazy" onError={() => setErr(true)} />;
}

// ─── Flatten category tree for dropdown ───
type FlatCategory = { label: string; slug: string; uniqueKey: string; name: string; parentNames: string[] };
function flattenCategories(nodes: CategoryNode[], prefix = "", parentNames: string[] = []): FlatCategory[] {
  const result: FlatCategory[] = [];
  for (const n of nodes) {
    const label = prefix ? `${prefix} > ${n.name}` : n.name;
    const uniqueKey = prefix ? `${prefix}/${n.slug}` : n.slug;
    result.push({ label, slug: n.slug, uniqueKey, name: n.name, parentNames });
    if (n.children) result.push(...flattenCategories(n.children, label, [...parentNames, n.name]));
  }
  return result;
}

// ─── Normalize text (remove accents) ───
function normalizeText(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// ═══════════════════════════════
// ─── MAIN COMPONENT ──────────
// ═══════════════════════════════

export function AdminProducts() {
  const navigate = useNavigate();
  const [produtos, setProdutos] = useState<ProdutoDB[]>([]);
  const [metaMap, setMetaMap] = useState<Record<string, ProductMeta>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [editSku, setEditSku] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ sku: string; titulo: string } | null>(null);
  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);

  // Stock balance from SIGE
  const [balanceMap, setBalanceMap] = useState<Record<string, ProductBalance>>({});
  const [balanceLoading, setBalanceLoading] = useState(false);

  // Filters & sorting
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("default");
  const [showFilters, setShowFilters] = useState(false);

  // Global stock summary (all products)
  const [globalSummary, setGlobalSummary] = useState<StockSummary | null>(null);
  const [globalSummaryLoading, setGlobalSummaryLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ scanned: number; remaining: number } | null>(null);

  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(searchQuery); setPage(1); }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load category tree
  useEffect(() => {
    api.getCategoryTree().then((tree) => {
      setCategoryTree(tree && tree.length > 0 ? tree : defaultCategoryTree);
    }).catch(() => setCategoryTree(defaultCategoryTree));
  }, []);

  const getToken = async (): Promise<string> => {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || "";
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getProdutosDB(page, ITEMS_PER_PAGE, debouncedSearch);
      setProdutos(result.data);
      setTotalPages(result.pagination.totalPages);
      setTotal(result.pagination.total);
      if (result.data.length > 0) {
        try {
          const bulkMeta = await api.getProductMetaBulk(result.data.map((p) => p.sku));
          setMetaMap((prev) => ({ ...prev, ...bulkMeta }));
        } catch {}
      }
    } catch (e: any) {
      setError(e.message || "Erro ao carregar produtos.");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => { loadData(); }, [loadData]);

  // Load stock balances from SIGE (after products load)
  useEffect(() => {
    if (produtos.length === 0) return;
    setBalanceLoading(true);
    const skus = produtos.map((p) => p.sku);
    api.getProductBalances(skus)
      .then((res) => {
        const map: Record<string, ProductBalance> = {};
        for (const b of (res.results || [])) { map[b.sku] = b; }
        setBalanceMap((prev) => ({ ...prev, ...map }));
      })
      .catch((e) => console.error("[AdminProducts] Bulk balance error:", e))
      .finally(() => setBalanceLoading(false));
  }, [produtos]);

  // Load global stock summary on mount
  const loadGlobalSummary = useCallback(() => {
    setGlobalSummaryLoading(true);
    api.getStockSummary()
      .then((res) => setGlobalSummary(res))
      .catch((e) => console.error("[AdminProducts] Global summary error:", e))
      .finally(() => setGlobalSummaryLoading(false));
  }, []);

  useEffect(() => { loadGlobalSummary(); }, [loadGlobalSummary]);

  // Scan uncached products
  const runStockScan = async () => {
    if (scanning) return;
    setScanning(true);
    setScanProgress(null);
    try {
      let remaining = Infinity;
      let totalScanned = 0;
      while (remaining > 0) {
        const result = await api.triggerStockScan(50);
        if (result.error) { showToast("error", result.error); break; }
        totalScanned += result.scanned;
        remaining = result.remaining;
        setScanProgress({ scanned: totalScanned, remaining });
        if (result.scanned === 0) break;
      }
      showToast("success", `Scan concluido! ${totalScanned} SKUs verificados.`);
      loadGlobalSummary();
    } catch (e: any) {
      showToast("error", `Erro no scan: ${e.message}`);
    } finally {
      setScanning(false);
      setScanProgress(null);
    }
  };

  const goToPage = (n: number) => { if (n >= 1 && n <= totalPages) setPage(n); };

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) { for (let i = 1; i <= totalPages; i++) pages.push(i); }
    else {
      pages.push(1);
      if (page > 3) pages.push("...");
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
      if (page < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  const clearSearch = () => { setSearchQuery(""); setDebouncedSearch(""); setPage(1); };

  const toggleVisibility = async (sku: string) => {
    const current = metaMap[sku]?.visible !== false;
    setMetaMap((prev) => ({ ...prev, [sku]: { ...prev[sku], visible: !current } }));
    try {
      await api.saveProductMeta(sku, { visible: !current });
      showToast("success", `Produto ${!current ? "ativado" : "desativado"}`);
    } catch (e: any) {
      setMetaMap((prev) => ({ ...prev, [sku]: { ...prev[sku], visible: current } }));
      showToast("error", e.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      const token = await getToken();
      await api.deleteProduto(deleteConfirm.sku, token);
      setProdutos((prev) => prev.filter((p) => p.sku !== deleteConfirm.sku));
      setTotal((prev) => prev - 1);
      showToast("success", `Produto ${deleteConfirm.sku} excluido.`);
      setDeleteConfirm(null);
    } catch (e: any) { showToast("error", e.message); }
  };

  const handleProductUpdated = (sku: string, newTitulo?: string, newSku?: string) => {
    if (newSku && newSku !== sku) {
      setProdutos((prev) => prev.map((p) => p.sku === sku ? { ...p, sku: newSku, titulo: newTitulo || p.titulo } : p));
      setEditSku(newSku);
    } else if (newTitulo) {
      setProdutos((prev) => prev.map((p) => p.sku === sku ? { ...p, titulo: newTitulo } : p));
    }
  };

  const openProductPage = (sku: string) => {
    navigate(`/produto/${encodeURIComponent(sku)}`);
  };

  // ─── Apply client-side filters and sorting ───
  const filteredProdutos = (() => {
    let list = [...produtos];

    // Stock filter
    if (stockFilter !== "all") {
      list = list.filter((p) => {
        const b = balanceMap[p.sku];
        if (stockFilter === "not_found") return !b || !b.found;
        if (stockFilter === "in_stock") return b && b.found && (b.disponivel ?? b.quantidade ?? 0) > 0;
        if (stockFilter === "out_of_stock") return b && b.found && (b.disponivel ?? b.quantidade ?? 0) === 0;
        return true;
      });
    }

    // Visibility filter
    if (visibilityFilter !== "all") {
      list = list.filter((p) => {
        const vis = metaMap[p.sku]?.visible !== false;
        return visibilityFilter === "visible" ? vis : !vis;
      });
    }

    // Sorting
    if (sortOption !== "default") {
      list.sort((a, b) => {
        switch (sortOption) {
          case "name_asc": return a.titulo.localeCompare(b.titulo, "pt-BR");
          case "name_desc": return b.titulo.localeCompare(a.titulo, "pt-BR");
          case "sku_asc": return a.sku.localeCompare(b.sku);
          case "sku_desc": return b.sku.localeCompare(a.sku);
          case "stock_desc": {
            const aQty = balanceMap[a.sku]?.found ? (balanceMap[a.sku].disponivel ?? balanceMap[a.sku].quantidade ?? 0) : -1;
            const bQty = balanceMap[b.sku]?.found ? (balanceMap[b.sku].disponivel ?? balanceMap[b.sku].quantidade ?? 0) : -1;
            return bQty - aQty;
          }
          case "stock_asc": {
            const aQty = balanceMap[a.sku]?.found ? (balanceMap[a.sku].disponivel ?? balanceMap[a.sku].quantidade ?? 0) : -1;
            const bQty = balanceMap[b.sku]?.found ? (balanceMap[b.sku].disponivel ?? balanceMap[b.sku].quantidade ?? 0) : -1;
            return aQty - bQty;
          }
          default: return 0;
        }
      });
    }

    return list;
  })();

  const hasActiveFilters = stockFilter !== "all" || visibilityFilter !== "all" || sortOption !== "default";

  const clearAllFilters = () => {
    setStockFilter("all");
    setVisibilityFilter("all");
    setSortOption("default");
  };

  // Stats for filter badges
  const stockStats = (() => {
    let inStock = 0, outOfStock = 0, notFound = 0;
    for (const p of produtos) {
      const b = balanceMap[p.sku];
      if (!b || !b.found) { notFound++; continue; }
      const avail = b.disponivel ?? b.quantidade ?? 0;
      if (avail > 0) inStock++; else outOfStock++;
    }
    return { inStock, outOfStock, notFound };
  })();

  return (
    <div className="space-y-5">
      <Toast toast={toast} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-red-600" />
            <h2 className="text-gray-800" style={{ fontSize: "1.25rem", fontWeight: 700 }}>Produtos do Supabase</h2>
          </div>
          <p className="text-gray-400 mt-1" style={{ fontSize: "0.85rem" }}>
            {loading ? "Carregando..." : `${total} produto${total !== 1 ? "s" : ""} na tabela "produtos"`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="hidden sm:flex border border-gray-200 rounded-lg overflow-hidden">
            <button onClick={() => setViewMode("table")} className={`p-2 transition-colors ${viewMode === "table" ? "bg-red-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}><List className="w-4 h-4" /></button>
            <button onClick={() => setViewMode("grid")} className={`p-2 transition-colors ${viewMode === "grid" ? "bg-red-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}><Grid3X3 className="w-4 h-4" /></button>
          </div>
          <button onClick={loadData} disabled={loading} className="flex items-center gap-1.5 text-gray-500 hover:text-red-600 border border-gray-200 px-3 py-2 rounded-lg transition-colors disabled:opacity-50" style={{ fontSize: "0.85rem" }}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
            <Plus className="w-4 h-4" /> Novo Produto
          </button>
        </div>
      </div>

      {/* ═══ Stock Overview Dashboard (GLOBAL — all products) ═══ */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-red-500" />
            <p className="text-gray-500" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
              Resumo Geral de Estoque
            </p>
            {globalSummary && !globalSummaryLoading && (
              <span className="text-gray-300" style={{ fontSize: "0.65rem" }}>
                ({globalSummary.totalProducts} produtos)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {globalSummary && globalSummary.pending > 0 && !scanning && (
              <button
                onClick={runStockScan}
                className="flex items-center gap-1 px-2.5 py-1 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
                style={{ fontSize: "0.7rem", fontWeight: 600 }}
                title={`${globalSummary.pending} produtos ainda nao verificados no SIGE`}
              >
                <RefreshCw className="w-3 h-3" />
                Verificar {globalSummary.pending} pendentes
              </button>
            )}
            {scanning && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 text-blue-600 bg-blue-50 border border-blue-200 rounded-lg" style={{ fontSize: "0.7rem", fontWeight: 600 }}>
                <Loader2 className="w-3 h-3 animate-spin" />
                Escaneando... {scanProgress ? `${scanProgress.scanned} feitos, ${scanProgress.remaining} restantes` : ""}
              </div>
            )}
            <button
              onClick={loadGlobalSummary}
              disabled={globalSummaryLoading}
              className="p-1 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
              title="Atualizar resumo"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${globalSummaryLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {globalSummaryLoading && !globalSummary ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-lg bg-gray-100 animate-pulse" />
                  <div className="w-4 h-4 rounded bg-gray-100 animate-pulse" />
                </div>
                <div className="h-7 w-12 bg-gray-100 rounded animate-pulse mb-1" />
                <div className="h-3 w-20 bg-gray-50 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : globalSummary ? (() => {
          const s = globalSummary;
          const verified = s.inStock + s.outOfStock + s.notFound;
          const pctIn = s.totalProducts > 0 ? (s.inStock / s.totalProducts) * 100 : 0;
          const pctOut = s.totalProducts > 0 ? (s.outOfStock / s.totalProducts) * 100 : 0;
          const pctNf = s.totalProducts > 0 ? (s.notFound / s.totalProducts) * 100 : 0;
          const pctPending = s.totalProducts > 0 ? (s.pending / s.totalProducts) * 100 : 0;
          return (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {/* Total */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-gray-300 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                    <Package className="w-[18px] h-[18px] text-gray-500" />
                  </div>
                  <BarChart3 className="w-4 h-4 text-gray-300" />
                </div>
                <p className="text-gray-800" style={{ fontSize: "1.5rem", fontWeight: 700, lineHeight: 1.1 }}>{s.totalProducts.toLocaleString("pt-BR")}</p>
                <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.72rem", fontWeight: 500 }}>Total Cadastrados</p>
                {/* Combined stacked bar */}
                <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5 overflow-hidden flex">
                  <div className="h-full bg-green-500 transition-all duration-700" style={{ width: `${pctIn}%` }} />
                  <div className="h-full bg-red-500 transition-all duration-700" style={{ width: `${pctOut}%` }} />
                  <div className="h-full bg-amber-400 transition-all duration-700" style={{ width: `${pctNf}%` }} />
                  <div className="h-full bg-gray-300 transition-all duration-700" style={{ width: `${pctPending}%` }} />
                </div>
              </div>

              {/* In stock */}
              <div
                className={`bg-white rounded-xl border p-4 hover:shadow-md transition-all cursor-pointer ${
                  stockFilter === "in_stock" ? "border-green-400 ring-2 ring-green-100 bg-green-50/30" : "border-gray-200 hover:border-green-300"
                }`}
                onClick={() => { setStockFilter(stockFilter === "in_stock" ? "all" : "in_stock"); setShowFilters(true); }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center">
                    <PackageCheck className="w-[18px] h-[18px] text-green-600" />
                  </div>
                  <TrendingUp className="w-4 h-4 text-green-400" />
                </div>
                <p className="text-green-700" style={{ fontSize: "1.5rem", fontWeight: 700, lineHeight: 1.1 }}>{s.inStock.toLocaleString("pt-BR")}</p>
                <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.72rem", fontWeight: 500 }}>Com Estoque</p>
                <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full transition-all duration-700" style={{ width: `${pctIn}%` }} />
                </div>
                <p className="text-green-600 mt-1" style={{ fontSize: "0.62rem", fontWeight: 600 }}>{pctIn.toFixed(1)}%</p>
              </div>

              {/* Out of stock */}
              <div
                className={`bg-white rounded-xl border p-4 hover:shadow-md transition-all cursor-pointer ${
                  stockFilter === "out_of_stock" ? "border-red-400 ring-2 ring-red-100 bg-red-50/30" : "border-gray-200 hover:border-red-300"
                }`}
                onClick={() => { setStockFilter(stockFilter === "out_of_stock" ? "all" : "out_of_stock"); setShowFilters(true); }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center">
                    <PackageX className="w-[18px] h-[18px] text-red-500" />
                  </div>
                  <TrendingDown className="w-4 h-4 text-red-400" />
                </div>
                <p className="text-red-600" style={{ fontSize: "1.5rem", fontWeight: 700, lineHeight: 1.1 }}>{s.outOfStock.toLocaleString("pt-BR")}</p>
                <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.72rem", fontWeight: 500 }}>Sem Estoque</p>
                <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                  <div className="h-full bg-red-500 rounded-full transition-all duration-700" style={{ width: `${pctOut}%` }} />
                </div>
                <p className="text-red-500 mt-1" style={{ fontSize: "0.62rem", fontWeight: 600 }}>{pctOut.toFixed(1)}%</p>
              </div>

              {/* Not found */}
              <div
                className={`bg-white rounded-xl border p-4 hover:shadow-md transition-all cursor-pointer ${
                  stockFilter === "not_found" ? "border-amber-400 ring-2 ring-amber-100 bg-amber-50/30" : "border-gray-200 hover:border-amber-300"
                }`}
                onClick={() => { setStockFilter(stockFilter === "not_found" ? "all" : "not_found"); setShowFilters(true); }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
                    <AlertOctagon className="w-[18px] h-[18px] text-amber-600" />
                  </div>
                </div>
                <p className="text-amber-600" style={{ fontSize: "1.5rem", fontWeight: 700, lineHeight: 1.1 }}>{s.notFound.toLocaleString("pt-BR")}</p>
                <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.72rem", fontWeight: 500 }}>Nao Localizado SIGE</p>
                <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                  <div className="h-full bg-amber-400 rounded-full transition-all duration-700" style={{ width: `${pctNf}%` }} />
                </div>
                <p className="text-amber-500 mt-1" style={{ fontSize: "0.62rem", fontWeight: 600 }}>{pctNf.toFixed(1)}%</p>
              </div>

              {/* Pending (not yet scanned) */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Loader2 className={`w-[18px] h-[18px] text-blue-500 ${scanning ? "animate-spin" : ""}`} />
                  </div>
                  {s.pending > 0 && !scanning && (
                    <button onClick={runStockScan} className="text-blue-500 hover:text-blue-700 transition-colors" title="Iniciar scan">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <p className="text-blue-600" style={{ fontSize: "1.5rem", fontWeight: 700, lineHeight: 1.1 }}>{s.pending.toLocaleString("pt-BR")}</p>
                <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.72rem", fontWeight: 500 }}>Pendentes de Scan</p>
                {s.pending > 0 && (
                  <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div className="h-full bg-blue-400 rounded-full transition-all duration-700" style={{ width: `${pctPending}%` }} />
                  </div>
                )}
                {s.pending === 0 && (
                  <p className="text-green-500 mt-2 flex items-center gap-1" style={{ fontSize: "0.62rem", fontWeight: 600 }}>
                    <CheckCircle2 className="w-3 h-3" /> 100% verificado
                  </p>
                )}
              </div>
            </div>
          );
        })() : null}
      </div>

      {/* SIGE Sync Panel */}
      <SigeStockSync onSyncComplete={() => {
        loadData();
        loadGlobalSummary();
      }} />

      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar por titulo ou SKU..."
            className="w-full pl-10 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all" style={{ fontSize: "0.85rem" }} />
          {searchQuery && <button onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>}
        </div>
        {debouncedSearch && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-gray-400" style={{ fontSize: "0.8rem" }}>Buscando:</span>
            <span className="bg-red-50 text-red-600 border border-red-200 px-2.5 py-0.5 rounded-full flex items-center gap-1" style={{ fontSize: "0.8rem" }}>
              "{debouncedSearch}" <button onClick={clearSearch}><X className="w-3 h-3" /></button>
            </span>
          </div>
        )}
      </div>

      {/* Filters & Sorting Bar */}
      {!loading && produtos.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Toggle + Quick stats */}
          <div className="px-4 py-3 flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors ${
                hasActiveFilters
                  ? "bg-red-50 border-red-200 text-red-600"
                  : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
              style={{ fontSize: "0.8rem", fontWeight: 600 }}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Filtros
              {hasActiveFilters && (
                <span className="bg-red-600 text-white w-4.5 h-4.5 rounded-full flex items-center justify-center" style={{ fontSize: "0.6rem", minWidth: "18px", height: "18px" }}>
                  {(stockFilter !== "all" ? 1 : 0) + (visibilityFilter !== "all" ? 1 : 0) + (sortOption !== "default" ? 1 : 0)}
                </span>
              )}
            </button>

            {/* Quick stock stats */}
            {!balanceLoading && Object.keys(balanceMap).length > 0 && (
              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={() => { setStockFilter(stockFilter === "in_stock" ? "all" : "in_stock"); setShowFilters(true); }}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${
                    stockFilter === "in_stock" ? "bg-green-100 text-green-700 ring-1 ring-green-300" : "text-gray-400 hover:text-green-600 hover:bg-green-50"
                  }`}
                  style={{ fontSize: "0.72rem", fontWeight: 500 }}
                  title="Filtrar com estoque"
                >
                  <PackageCheck className="w-3 h-3" />
                  <span>{stockStats.inStock}</span>
                </button>
                <button
                  onClick={() => { setStockFilter(stockFilter === "out_of_stock" ? "all" : "out_of_stock"); setShowFilters(true); }}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${
                    stockFilter === "out_of_stock" ? "bg-red-100 text-red-600 ring-1 ring-red-300" : "text-gray-400 hover:text-red-500 hover:bg-red-50"
                  }`}
                  style={{ fontSize: "0.72rem", fontWeight: 500 }}
                  title="Filtrar sem estoque"
                >
                  <PackageX className="w-3 h-3" />
                  <span>{stockStats.outOfStock}</span>
                </button>
                {stockStats.notFound > 0 && (
                  <button
                    onClick={() => { setStockFilter(stockFilter === "not_found" ? "all" : "not_found"); setShowFilters(true); }}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${
                      stockFilter === "not_found" ? "bg-amber-100 text-amber-700 ring-1 ring-amber-300" : "text-gray-400 hover:text-amber-600 hover:bg-amber-50"
                    }`}
                    style={{ fontSize: "0.72rem", fontWeight: 500 }}
                    title="Nao encontrado no SIGE"
                  >
                    <AlertCircle className="w-3 h-3" />
                    <span>{stockStats.notFound}</span>
                  </button>
                )}
              </div>
            )}
            {balanceLoading && (
              <div className="flex items-center gap-1.5 ml-auto text-gray-400" style={{ fontSize: "0.72rem" }}>
                <Loader2 className="w-3 h-3 animate-spin" /> Carregando saldos...
              </div>
            )}
          </div>

          {/* Expanded filter controls */}
          {showFilters && (
            <div className="px-4 pb-4 pt-1 border-t border-gray-100">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Stock filter */}
                <div>
                  <label className="block text-gray-400 mb-1.5" style={{ fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Estoque
                  </label>
                  <div className="relative">
                    <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <select
                      value={stockFilter}
                      onChange={(e) => setStockFilter(e.target.value as StockFilter)}
                      className="w-full pl-8 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 appearance-none cursor-pointer transition-all"
                      style={{ fontSize: "0.82rem" }}
                    >
                      <option value="all">Todos</option>
                      <option value="in_stock">Com estoque ({stockStats.inStock})</option>
                      <option value="out_of_stock">Sem estoque ({stockStats.outOfStock})</option>
                      <option value="not_found">Nao localizado SIGE ({stockStats.notFound})</option>
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                {/* Visibility filter */}
                <div>
                  <label className="block text-gray-400 mb-1.5" style={{ fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Visibilidade
                  </label>
                  <div className="relative">
                    <Eye className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <select
                      value={visibilityFilter}
                      onChange={(e) => setVisibilityFilter(e.target.value as VisibilityFilter)}
                      className="w-full pl-8 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 appearance-none cursor-pointer transition-all"
                      style={{ fontSize: "0.82rem" }}
                    >
                      <option value="all">Todos</option>
                      <option value="visible">Visiveis</option>
                      <option value="hidden">Ocultos</option>
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                {/* Sort */}
                <div>
                  <label className="block text-gray-400 mb-1.5" style={{ fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Ordenar por
                  </label>
                  <div className="relative">
                    <ArrowUpDown className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <select
                      value={sortOption}
                      onChange={(e) => setSortOption(e.target.value as SortOption)}
                      className="w-full pl-8 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 appearance-none cursor-pointer transition-all"
                      style={{ fontSize: "0.82rem" }}
                    >
                      <option value="default">Padrao</option>
                      <option value="name_asc">Nome A → Z</option>
                      <option value="name_desc">Nome Z → A</option>
                      <option value="sku_asc">SKU A → Z</option>
                      <option value="sku_desc">SKU Z → A</option>
                      <option value="stock_desc">Estoque: Maior → Menor</option>
                      <option value="stock_asc">Estoque: Menor → Maior</option>
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Active filter tags + clear */}
              {hasActiveFilters && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {stockFilter !== "all" && (
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border ${
                      stockFilter === "in_stock" ? "bg-green-50 text-green-700 border-green-200" :
                      stockFilter === "out_of_stock" ? "bg-red-50 text-red-600 border-red-200" :
                      "bg-amber-50 text-amber-700 border-amber-200"
                    }`} style={{ fontSize: "0.75rem" }}>
                      {stockFilter === "in_stock" ? "Com estoque" : stockFilter === "out_of_stock" ? "Sem estoque" : "Nao localizado"}
                      <button onClick={() => setStockFilter("all")} className="hover:opacity-70"><X className="w-3 h-3" /></button>
                    </span>
                  )}
                  {visibilityFilter !== "all" && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border bg-blue-50 text-blue-600 border-blue-200" style={{ fontSize: "0.75rem" }}>
                      {visibilityFilter === "visible" ? "Visiveis" : "Ocultos"}
                      <button onClick={() => setVisibilityFilter("all")} className="hover:opacity-70"><X className="w-3 h-3" /></button>
                    </span>
                  )}
                  {sortOption !== "default" && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border bg-purple-50 text-purple-600 border-purple-200" style={{ fontSize: "0.75rem" }}>
                      {{
                        name_asc: "Nome A→Z", name_desc: "Nome Z→A",
                        sku_asc: "SKU A→Z", sku_desc: "SKU Z→A",
                        stock_desc: "Estoque ↓", stock_asc: "Estoque ↑", default: "",
                      }[sortOption]}
                      <button onClick={() => setSortOption("default")} className="hover:opacity-70"><X className="w-3 h-3" /></button>
                    </span>
                  )}
                  <button onClick={clearAllFilters} className="text-gray-400 hover:text-red-600 transition-colors" style={{ fontSize: "0.75rem" }}>
                    Limpar tudo
                  </button>
                </div>
              )}

              {/* Result count when filtered */}
              {hasActiveFilters && (
                <p className="mt-2 text-gray-400" style={{ fontSize: "0.78rem" }}>
                  Mostrando {filteredProdutos.length} de {produtos.length} produtos nesta pagina
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <p className="text-red-700 mb-3" style={{ fontSize: "0.9rem" }}>{error}</p>
          <button onClick={loadData} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors" style={{ fontSize: "0.85rem" }}>Tentar novamente</button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
          <Loader2 className="w-10 h-10 mx-auto text-gray-300 animate-spin mb-3" />
          <p className="text-gray-500" style={{ fontSize: "0.9rem" }}>Carregando produtos...</p>
        </div>
      ) : !error && produtos.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
          <Package className="w-14 h-14 mx-auto text-gray-300 mb-3" />
          <h3 className="text-gray-700 mb-2" style={{ fontSize: "1.05rem", fontWeight: 600 }}>Nenhum produto encontrado</h3>
          <p className="text-gray-400" style={{ fontSize: "0.85rem" }}>{debouncedSearch ? `Nenhum resultado para "${debouncedSearch}".` : "A tabela esta vazia."}</p>
        </div>
      ) : !error && viewMode === "table" ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-gray-500 w-12" style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>#</th>
                  <th
                    className="text-left px-4 py-3 text-gray-500 cursor-pointer hover:text-red-600 transition-colors select-none"
                    style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}
                    onClick={() => setSortOption(sortOption === "name_asc" ? "name_desc" : "name_asc")}
                  >
                    <span className="flex items-center gap-1">
                      Produto
                      {sortOption === "name_asc" && <span className="text-red-500">↑</span>}
                      {sortOption === "name_desc" && <span className="text-red-500">↓</span>}
                      {sortOption !== "name_asc" && sortOption !== "name_desc" && <ArrowUpDown className="w-3 h-3 opacity-40" />}
                    </span>
                  </th>
                  <th
                    className="text-left px-4 py-3 text-gray-500 cursor-pointer hover:text-red-600 transition-colors select-none"
                    style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}
                    onClick={() => setSortOption(sortOption === "sku_asc" ? "sku_desc" : "sku_asc")}
                  >
                    <span className="flex items-center gap-1">
                      SKU
                      {sortOption === "sku_asc" && <span className="text-red-500">↑</span>}
                      {sortOption === "sku_desc" && <span className="text-red-500">↓</span>}
                      {sortOption !== "sku_asc" && sortOption !== "sku_desc" && <ArrowUpDown className="w-3 h-3 opacity-40" />}
                    </span>
                  </th>
                  <th
                    className="text-left px-4 py-3 text-gray-500 w-24 cursor-pointer hover:text-red-600 transition-colors select-none"
                    style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}
                    onClick={() => setSortOption(sortOption === "stock_desc" ? "stock_asc" : "stock_desc")}
                  >
                    <span className="flex items-center gap-1">
                      Saldo
                      {sortOption === "stock_desc" && <span className="text-red-500">↓</span>}
                      {sortOption === "stock_asc" && <span className="text-red-500">↑</span>}
                      {sortOption !== "stock_desc" && sortOption !== "stock_asc" && <ArrowUpDown className="w-3 h-3 opacity-40" />}
                    </span>
                  </th>
                  <th className="text-left px-4 py-3 text-gray-500 w-28" style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Preco</th>
                  <th className="text-center px-4 py-3 text-gray-500 w-16" style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Visivel</th>
                  <th className="text-right px-4 py-3 text-gray-500 w-28" style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {filteredProdutos.length === 0 && hasActiveFilters ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <Filter className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                      <p className="text-gray-500 mb-1" style={{ fontSize: "0.88rem", fontWeight: 500 }}>Nenhum produto corresponde aos filtros</p>
                      <button onClick={clearAllFilters} className="text-red-600 hover:text-red-700" style={{ fontSize: "0.82rem" }}>Limpar filtros</button>
                    </td>
                  </tr>
                ) : filteredProdutos.map((produto, idx) => {
                  const vis = metaMap[produto.sku]?.visible !== false;
                  return (
                    <tr key={produto.sku} className={`border-b border-gray-100 hover:bg-gray-50/50 transition-colors ${!vis ? "opacity-50" : ""}`}>
                      <td className="px-4 py-3"><span className="text-gray-400" style={{ fontSize: "0.75rem" }}>{idx + 1}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setEditSku(produto.sku)}>
                          <ProductThumb sku={produto.sku} size={36} />
                          <span className="text-gray-800 line-clamp-1 hover:text-red-600 transition-colors" style={{ fontSize: "0.85rem", fontWeight: 500 }}>{produto.titulo}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3"><span className="font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md inline-block" style={{ fontSize: "0.75rem" }}>{produto.sku}</span></td>
                      <td className="px-4 py-3">
                        {balanceLoading && !balanceMap[produto.sku] ? (
                          <Loader2 className="w-3.5 h-3.5 text-gray-300 animate-spin" />
                        ) : balanceMap[produto.sku] ? (() => {
                          const b = balanceMap[produto.sku];
                          if (!b.sige || !b.found) return <span className="text-gray-300" style={{ fontSize: "0.72rem" }}>—</span>;
                          const avail = b.disponivel ?? b.quantidade ?? 0;
                          const reserved = b.reservado ?? 0;
                          const inStock = avail > 0;
                          return (
                            <div className="flex items-center gap-1.5">
                              {inStock ? <PackageCheck className="w-3.5 h-3.5 text-green-500" /> : <PackageX className="w-3.5 h-3.5 text-red-400" />}
                              <span className={inStock ? "text-green-700" : "text-red-500"} style={{ fontSize: "0.78rem", fontWeight: 600 }}>{avail}</span>
                              {reserved > 0 && <span className="text-amber-500" style={{ fontSize: "0.65rem" }}>({reserved} res.)</span>}
                            </div>
                          );
                        })() : <span className="text-gray-300" style={{ fontSize: "0.72rem" }}>—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <PriceBadge sku={produto.sku} variant="compact" />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => toggleVisibility(produto.sku)} className={`p-1 rounded-md transition-colors ${vis ? "text-green-600 hover:bg-green-50" : "text-gray-400 hover:bg-gray-100"}`}>
                          {vis ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setEditSku(produto.sku)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Editar"><Edit3 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => openProductPage(produto.sku)} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Ver no site"><ExternalLink className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setDeleteConfirm({ sku: produto.sku, titulo: produto.titulo })} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Excluir"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : !error && (
        <div>
          {filteredProdutos.length === 0 && hasActiveFilters ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <Filter className="w-8 h-8 mx-auto text-gray-300 mb-2" />
              <p className="text-gray-500 mb-1" style={{ fontSize: "0.88rem", fontWeight: 500 }}>Nenhum produto corresponde aos filtros</p>
              <button onClick={clearAllFilters} className="text-red-600 hover:text-red-700" style={{ fontSize: "0.82rem" }}>Limpar filtros</button>
            </div>
          ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredProdutos.map((produto) => {
            const vis = metaMap[produto.sku]?.visible !== false;
            return (
              <div key={produto.sku} className={`bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-red-200 transition-all ${!vis ? "opacity-50" : ""}`}>
                <div className="flex items-start gap-3 cursor-pointer" onClick={() => setEditSku(produto.sku)}>
                  <ProductThumb sku={produto.sku} size={48} />
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-800 mb-1.5 line-clamp-2 hover:text-red-600 transition-colors" style={{ fontSize: "0.85rem", fontWeight: 500, lineHeight: 1.4 }}>{produto.titulo}</p>
                    <div className="flex items-center gap-1.5"><Hash className="w-3 h-3 text-gray-400" /><span className="font-mono text-gray-500 bg-gray-50 px-2 py-0.5 rounded" style={{ fontSize: "0.72rem" }}>{produto.sku}</span></div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {balanceMap[produto.sku]?.found && (() => {
                        const b = balanceMap[produto.sku];
                        const avail = b.disponivel ?? b.quantidade ?? 0;
                        const inStock = avail > 0;
                        return (
                          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border w-fit ${inStock ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-600 border-red-200"}`} style={{ fontSize: "0.65rem", fontWeight: 600 }}>
                            <div className={`w-1.5 h-1.5 rounded-full ${inStock ? "bg-green-500" : "bg-red-500"}`} />
                            {inStock ? `${avail} em estoque` : "Sem estoque"}
                          </div>
                        );
                      })()}
                      <PriceBadge sku={produto.sku} variant="compact" />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-3 pt-3 border-t border-gray-100">
                  <button onClick={() => toggleVisibility(produto.sku)} className={`p-1.5 rounded-lg transition-colors ${vis ? "text-green-600 hover:bg-green-50" : "text-gray-400 hover:bg-gray-100"}`}>{vis ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}</button>
                  <button onClick={() => setEditSku(produto.sku)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit3 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => openProductPage(produto.sku)} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"><ExternalLink className="w-3.5 h-3.5" /></button>
                  <div className="flex-1" />
                  <button onClick={() => setDeleteConfirm({ sku: produto.sku, titulo: produto.titulo })} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            );
          })}
        </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {!loading && !error && totalPages > 1 && (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-gray-400 order-2 sm:order-1" style={{ fontSize: "0.85rem" }}>
            Pagina {page} de {totalPages} — {total} produto{total !== 1 ? "s" : ""}
            {hasActiveFilters && ` (${filteredProdutos.length} filtrado${filteredProdutos.length !== 1 ? "s" : ""})`}
          </p>
          <div className="flex items-center gap-1 order-1 sm:order-2">
            <button onClick={() => goToPage(page - 1)} disabled={page === 1} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-red-50 hover:border-red-300 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"><ChevronLeft className="w-4 h-4" /></button>
            {getPageNumbers().map((p, i) => typeof p === "string" ? (
              <span key={`e-${i}`} className="px-2 text-gray-400" style={{ fontSize: "0.85rem" }}>...</span>
            ) : (
              <button key={p} onClick={() => goToPage(p)} className={`min-w-[36px] h-9 rounded-lg transition-colors ${p === page ? "bg-red-600 text-white" : "border border-gray-200 text-gray-600 hover:bg-red-50 hover:border-red-300 hover:text-red-600"}`} style={{ fontSize: "0.85rem", fontWeight: p === page ? 600 : 400 }}>{p}</button>
            ))}
            <button onClick={() => goToPage(page + 1)} disabled={page === totalPages} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-red-50 hover:border-red-300 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="bg-red-50 w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"><Trash2 className="w-6 h-6 text-red-600" /></div>
            <h3 className="text-center text-gray-800 mb-2" style={{ fontSize: "1.1rem", fontWeight: 600 }}>Excluir Produto?</h3>
            <p className="text-center text-gray-500 mb-1" style={{ fontSize: "0.85rem" }}><span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{deleteConfirm.sku}</span></p>
            <p className="text-center text-gray-400 mb-5 line-clamp-2" style={{ fontSize: "0.8rem" }}>{deleteConfirm.titulo}</p>
            <p className="text-center text-red-500 mb-5" style={{ fontSize: "0.75rem" }}>Exclui do banco, metadados e imagens.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors" style={{ fontSize: "0.85rem" }}>Cancelar</button>
              <button onClick={handleDelete} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors" style={{ fontSize: "0.85rem" }}>Excluir</button>
            </div>
          </div>
        </div>
      )}

      {showCreate && <CreateProductModal onClose={() => setShowCreate(false)} onCreated={() => { showToast("success", "Produto criado!"); loadData(); }} getToken={getToken} categoryTree={categoryTree} />}

      {editSku && (
        <ProductEditPanel
          sku={editSku}
          initialTitulo={produtos.find((p) => p.sku === editSku)?.titulo || ""}
          onClose={() => setEditSku(null)}
          onUpdated={handleProductUpdated}
          onDeleted={(s) => { setProdutos((prev) => prev.filter((p) => p.sku !== s)); setTotal((prev) => prev - 1); setEditSku(null); showToast("success", `Produto excluido.`); }}
          showToast={showToast}
          getToken={getToken}
          categoryTree={categoryTree}
          navigate={navigate}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════
// ─── CATEGORY DROPDOWN ───────────────
// ═══════════════════════════════════════

function CategorySelect({ value, onChange, tree }: { value: string; onChange: (v: string) => void; tree: CategoryNode[] }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const flat = flattenCategories(tree);

  // Advanced search: tokenize, normalize unicode, match name + slug + full label + parent names
  const filtered = (() => {
    if (!search.trim()) return flat;
    const tokens = normalizeText(search).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return flat;

    const scored: { item: FlatCategory; score: number }[] = [];
    for (const c of flat) {
      const nName = normalizeText(c.name);
      const nLabel = normalizeText(c.label);
      const nSlug = normalizeText(c.slug);
      const allText = `${nLabel} ${nSlug}`;

      // All tokens must match somewhere
      if (!tokens.every((t) => allText.includes(t))) continue;

      // Score: direct name match > slug match > parent match
      let score = 0;
      for (const t of tokens) {
        if (nName.includes(t)) score += 10;
        else if (nSlug.includes(t)) score += 5;
        else score += 1;
      }
      if (nName === normalizeText(search.trim())) score += 50;
      if (nName.startsWith(tokens[0])) score += 5;

      scored.push({ item: c, score });
    }

    scored.sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label));
    return scored.map((s) => s.item);
  })();

  const selectedLabel = flat.find((c) => c.slug === value)?.label || "";
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Highlight matching tokens in displayed text
  const highlightMatch = (text: string): React.ReactNode => {
    if (!search.trim()) return text;
    const tokens = normalizeText(search).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return text;
    const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const regex = new RegExp(`(${escaped.join("|")})`, "gi");
    const normalizedText = normalizeText(text);
    const parts: { text: string; hl: boolean }[] = [];
    let lastIdx = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(normalizedText)) !== null) {
      if (m.index > lastIdx) parts.push({ text: text.slice(lastIdx, m.index), hl: false });
      parts.push({ text: text.slice(m.index, m.index + m[0].length), hl: true });
      lastIdx = m.index + m[0].length;
    }
    if (lastIdx < text.length) parts.push({ text: text.slice(lastIdx), hl: false });
    if (parts.length === 0) return text;
    return <span>{parts.map((p, i) => p.hl ? <mark key={i} className="bg-yellow-200 text-yellow-900 rounded-sm px-0.5">{p.text}</mark> : <span key={i}>{p.text}</span>)}</span>;
  };

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 text-left outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
        style={{ fontSize: "0.85rem" }}>
        <span className={value ? "text-gray-800" : "text-gray-400"}>{selectedLabel || "Selecionar categoria..."}</span>
        <ChevronDown className="w-4 h-4 text-gray-400" />
      </button>
      {open && (
        <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-72 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar categoria ou subcategoria..."
                className="w-full pl-7 pr-7 border border-gray-200 rounded py-1.5 bg-gray-50 outline-none focus:border-red-400" style={{ fontSize: "0.8rem" }} autoFocus />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            {search.trim() && (
              <p className="text-gray-400 mt-1 px-1" style={{ fontSize: "0.7rem" }}>
                {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
              </p>
            )}
          </div>
          <div className="overflow-y-auto flex-1">
            <button type="button" onClick={() => { onChange(""); setOpen(false); setSearch(""); }}
              className="w-full text-left px-3 py-2 text-gray-400 hover:bg-gray-50 border-b border-gray-50" style={{ fontSize: "0.8rem" }}>
              Sem categoria
            </button>
            {filtered.map((c) => (
              <button key={c.uniqueKey} type="button" onClick={() => { onChange(c.slug); setOpen(false); setSearch(""); }}
                className={`w-full text-left px-3 py-2 hover:bg-red-50 hover:text-red-700 transition-colors ${c.slug === value ? "bg-red-50 text-red-700 font-medium" : "text-gray-700"}`}
                style={{ fontSize: "0.8rem" }}>
                {highlightMatch(c.label)}
              </button>
            ))}
            {filtered.length === 0 && <p className="px-3 py-4 text-gray-400 text-center" style={{ fontSize: "0.8rem" }}>Nenhuma categoria encontrada</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════
// ─── CREATE PRODUCT MODAL ────────────
// ═══════════════════════════════════════

function CreateProductModal({ onClose, onCreated, getToken, categoryTree }: {
  onClose: () => void;
  onCreated: () => void;
  getToken: () => Promise<string>;
  categoryTree: CategoryNode[];
}) {
  const [sku, setSku] = useState("");
  const [titulo, setTitulo] = useState("");
  const [description, setDescription] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sku.trim() || !titulo.trim()) return;
    setSaving(true);
    setError("");
    try {
      const token = await getToken();
      await api.createProduto(sku.trim(), titulo.trim(), { visible: true, description, brand, category }, token);
      onCreated();
      onClose();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h3 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "1.1rem", fontWeight: 600 }}><Plus className="w-5 h-5 text-red-600" /> Novo Produto</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg" style={{ fontSize: "0.8rem" }}>{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-600 mb-1" style={{ fontSize: "0.78rem", fontWeight: 500 }}>SKU *</label>
              <input type="text" required value={sku} onChange={(e) => setSku(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 font-mono" style={{ fontSize: "0.85rem" }} placeholder="ABC-123" />
            </div>
            <div>
              <label className="block text-gray-600 mb-1" style={{ fontSize: "0.78rem", fontWeight: 500 }}>Marca</label>
              <input type="text" value={brand} onChange={(e) => setBrand(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" style={{ fontSize: "0.85rem" }} placeholder="Ex: Bosch" />
            </div>
          </div>
          <div>
            <label className="block text-gray-600 mb-1" style={{ fontSize: "0.78rem", fontWeight: 500 }}>Titulo *</label>
            <input type="text" required value={titulo} onChange={(e) => setTitulo(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" style={{ fontSize: "0.85rem" }} placeholder="Titulo do produto" />
          </div>
          <div>
            <label className="block text-gray-600 mb-1" style={{ fontSize: "0.78rem", fontWeight: 500 }}>Categoria</label>
            <CategorySelect value={category} onChange={setCategory} tree={categoryTree} />
          </div>
          <div>
            <label className="block text-gray-600 mb-1" style={{ fontSize: "0.78rem", fontWeight: 500 }}>Descricao</label>
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 resize-none" style={{ fontSize: "0.85rem" }} placeholder="Descricao breve..." />
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors" style={{ fontSize: "0.85rem" }}>Cancelar</button>
            <button type="submit" disabled={saving || !sku.trim() || !titulo.trim()} className="px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-40 flex items-center gap-2" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Criar Produto
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// ─── PRODUCT EDIT PANEL (slide-over) ──
// ═══════════════════════════════════════

function ProductEditPanel({ sku, initialTitulo, onClose, onUpdated, onDeleted, showToast, getToken, categoryTree, navigate }: {
  sku: string;
  initialTitulo: string;
  onClose: () => void;
  onUpdated: (sku: string, newTitulo?: string, newSku?: string) => void;
  onDeleted: (sku: string) => void;
  showToast: (type: "success" | "error", msg: string) => void;
  getToken: () => Promise<string>;
  categoryTree: CategoryNode[];
  navigate: (path: string) => void;
}) {
  const [tab, setTab] = useState<"geral" | "imagens" | "atributos">("geral");
  const [titulo, setTitulo] = useState(initialTitulo);
  const [editingSku, setEditingSku] = useState(sku);
  const [skuEditing, setSkuEditing] = useState(false);
  const [meta, setMeta] = useState<api.ProductMeta>({ visible: true });
  const [images, setImages] = useState<ProductImage[]>([]);
  const [csvAttrs, setCsvAttrs] = useState<Record<string, string | string[]> | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingImages, setLoadingImages] = useState(true);
  const [loadingAttrs, setLoadingAttrs] = useState(true);
  const [savingTitle, setSavingTitle] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const [savingSku, setSavingSku] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getProductMeta(sku).then(setMeta).catch(() => {}).finally(() => setLoadingMeta(false));
    api.getProductImages(sku).then((r) => setImages(r.images)).catch(() => {}).finally(() => setLoadingImages(false));
    api.getProductAttributes(sku).then((r) => setCsvAttrs(r.attributes)).catch(() => {}).finally(() => setLoadingAttrs(false));
  }, [sku]);

  const saveTitle = async () => {
    if (!titulo.trim() || titulo.trim() === initialTitulo) return;
    setSavingTitle(true);
    try {
      const token = await getToken();
      await api.updateProdutoTitulo(sku, titulo.trim(), token);
      onUpdated(sku, titulo.trim());
      showToast("success", "Titulo atualizado!");
    } catch (e: any) { showToast("error", e.message); } finally { setSavingTitle(false); }
  };

  const saveSku = async () => {
    if (!editingSku.trim() || editingSku.trim() === sku) { setSkuEditing(false); return; }
    setSavingSku(true);
    try {
      const token = await getToken();
      await api.renameProdutoSku(sku, editingSku.trim(), token);
      onUpdated(sku, titulo, editingSku.trim());
      setSkuEditing(false);
      showToast("success", `SKU renomeado para ${editingSku.trim()}!`);
    } catch (e: any) { showToast("error", e.message); } finally { setSavingSku(false); }
  };

  const saveMeta = async () => {
    setSavingMeta(true);
    try {
      await api.saveProductMeta(sku, meta);
      showToast("success", "Metadados salvos!");
    } catch (e: any) { showToast("error", e.message); } finally { setSavingMeta(false); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const token = await getToken();
      const nextNum = images.length > 0 ? Math.max(...images.map((i) => i.number)) + 1 : 1;
      for (let i = 0; i < files.length; i++) {
        const ext = files[i].name.split(".").pop() || "webp";
        await api.uploadProductImage(sku, files[i], `${sku}.${nextNum + i}.${ext}`, token);
      }
      const result = await api.getProductImages(sku);
      setImages(result.images);
      showToast("success", `${files.length} imagem(ns) enviada(s)!`);
    } catch (e: any) { showToast("error", e.message); } finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  const handleDeleteImage = async (filename: string) => {
    try {
      const token = await getToken();
      await api.deleteProductImage(sku, filename, token);
      setImages((prev) => prev.filter((i) => i.name !== filename));
      showToast("success", "Imagem removida!");
    } catch (e: any) { showToast("error", e.message); }
  };

  const handleDeleteProduct = async () => {
    if (!confirm(`Excluir permanentemente o produto ${sku}?`)) return;
    try { const token = await getToken(); await api.deleteProduto(sku, token); onDeleted(sku); } catch (e: any) { showToast("error", e.message); }
  };

  // Editable CSV attributes — merge into customAttributes for editing
  const allEditableAttrs: Record<string, string> = {};
  if (csvAttrs) { for (const [k, v] of Object.entries(csvAttrs)) { allEditableAttrs[k] = Array.isArray(v) ? v.join(", ") : v; } }
  if (meta.customAttributes) { for (const [k, v] of Object.entries(meta.customAttributes)) { allEditableAttrs[k] = v; } }

  const tabs = [
    { id: "geral" as const, label: "Geral", icon: FileText },
    { id: "imagens" as const, label: `Imagens (${images.length})`, icon: Camera },
    { id: "atributos" as const, label: "Atributos", icon: Tag },
  ];

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/40" />
      <div className="w-full max-w-2xl bg-white shadow-2xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white z-10 border-b border-gray-200">
          <div className="flex items-center justify-between px-5 py-4">
            <div className="min-w-0 flex-1">
              {/* Editable SKU */}
              <div className="flex items-center gap-1.5 mb-0.5">
                {skuEditing ? (
                  <div className="flex items-center gap-1">
                    <input type="text" value={editingSku} onChange={(e) => setEditingSku(e.target.value)}
                      className="font-mono text-red-600 bg-red-50 border border-red-300 rounded px-2 py-0.5 outline-none focus:ring-2 focus:ring-red-200"
                      style={{ fontSize: "0.75rem", fontWeight: 600 }} autoFocus
                      onKeyDown={(e) => { if (e.key === "Enter") saveSku(); if (e.key === "Escape") { setEditingSku(sku); setSkuEditing(false); } }} />
                    <button onClick={saveSku} disabled={savingSku} className="text-green-600 hover:bg-green-50 p-0.5 rounded">
                      {savingSku ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => { setEditingSku(sku); setSkuEditing(false); }} className="text-gray-400 hover:text-gray-600 p-0.5 rounded"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ) : (
                  <>
                    <span className="font-mono text-red-600" style={{ fontSize: "0.75rem", fontWeight: 600 }}>{sku}</span>
                    <button onClick={() => setSkuEditing(true)} className="text-gray-400 hover:text-red-600 p-0.5 rounded" title="Editar SKU"><PenLine className="w-3 h-3" /></button>
                  </>
                )}
              </div>
              <h3 className="text-gray-800 truncate" style={{ fontSize: "1.05rem", fontWeight: 600 }}>{titulo || initialTitulo}</h3>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => navigate(`/produto/${encodeURIComponent(sku)}`)} className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Ver no site"><ExternalLink className="w-4 h-4" /></button>
              <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
            </div>
          </div>
          <div className="flex px-5 gap-1">
            {tabs.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg transition-colors ${tab === t.id ? "bg-red-50 text-red-700 border-b-2 border-red-600" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`} style={{ fontSize: "0.8rem", fontWeight: tab === t.id ? 600 : 400 }}>
                <t.icon className="w-3.5 h-3.5" />{t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5">
          {/* ── Tab Geral ── */}
          {tab === "geral" && (
            <div className="space-y-5">
              <div>
                <label className="block text-gray-600 mb-1.5" style={{ fontSize: "0.78rem", fontWeight: 600 }}>Titulo do Produto</label>
                <div className="flex gap-2">
                  <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" style={{ fontSize: "0.85rem" }} />
                  <button onClick={saveTitle} disabled={savingTitle || titulo.trim() === initialTitulo} className="px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors flex items-center gap-1.5" style={{ fontSize: "0.8rem", fontWeight: 500 }}>
                    {savingTitle ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Salvar
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3 border border-gray-200">
                <div>
                  <p className="text-gray-700" style={{ fontSize: "0.85rem", fontWeight: 500 }}>Visibilidade</p>
                  <p className="text-gray-400" style={{ fontSize: "0.75rem" }}>Controla se o produto aparece no catalogo</p>
                </div>
                <button onClick={() => setMeta((p) => ({ ...p, visible: p.visible === false }))} className={`relative w-12 h-6 rounded-full transition-colors ${meta.visible !== false ? "bg-green-500" : "bg-gray-300"}`}>
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${meta.visible !== false ? "translate-x-6" : "translate-x-0.5"}`} />
                </button>
              </div>

              {loadingMeta ? (
                <div className="flex items-center gap-2 py-6 justify-center text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /><span style={{ fontSize: "0.85rem" }}>Carregando...</span></div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-gray-600 mb-1" style={{ fontSize: "0.78rem", fontWeight: 500 }}>Marca</label>
                      <input type="text" value={meta.brand || ""} onChange={(e) => setMeta({ ...meta, brand: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" style={{ fontSize: "0.85rem" }} placeholder="Ex: Bosch" />
                    </div>
                    <div>
                      <label className="block text-gray-600 mb-1" style={{ fontSize: "0.78rem", fontWeight: 500 }}>Categoria</label>
                      <CategorySelect value={meta.category || ""} onChange={(v) => setMeta({ ...meta, category: v })} tree={categoryTree} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-gray-600 mb-1" style={{ fontSize: "0.78rem", fontWeight: 500 }}>Descricao</label>
                    <textarea rows={4} value={meta.description || ""} onChange={(e) => setMeta({ ...meta, description: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 resize-none" style={{ fontSize: "0.85rem" }} placeholder="Descricao detalhada..." />
                  </div>
                  <div>
                    <label className="block text-gray-600 mb-1" style={{ fontSize: "0.78rem", fontWeight: 500 }}>Compatibilidade (uma por linha)</label>
                    <textarea rows={3} value={(meta.compatibility || []).join("\n")} onChange={(e) => setMeta({ ...meta, compatibility: e.target.value.split("\n").filter(Boolean) })} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 resize-none font-mono" style={{ fontSize: "0.8rem" }} placeholder="Honda Civic 2018-2024" />
                  </div>
                  <button onClick={saveMeta} disabled={savingMeta} className="w-full py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                    {savingMeta ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar Metadados
                  </button>
                </>
              )}

              <div className="border-t border-gray-200 pt-5 mt-5">
                <p className="text-red-600 mb-3" style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Zona de Perigo</p>
                <button onClick={handleDeleteProduct} className="flex items-center gap-2 px-4 py-2.5 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors" style={{ fontSize: "0.85rem" }}>
                  <Trash2 className="w-4 h-4" /> Excluir Produto Permanentemente
                </button>
              </div>
            </div>
          )}

          {/* ── Tab Imagens ── */}
          {tab === "imagens" && (
            <div className="space-y-5">
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-red-400 transition-colors">
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileUpload} />
                <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="flex flex-col items-center gap-3 mx-auto">
                  {uploading ? <Loader2 className="w-8 h-8 text-red-500 animate-spin" /> : <div className="bg-red-50 rounded-full p-3"><ImagePlus className="w-6 h-6 text-red-600" /></div>}
                  <div>
                    <p className="text-gray-700" style={{ fontSize: "0.85rem", fontWeight: 500 }}>{uploading ? "Enviando..." : "Clique para adicionar imagens"}</p>
                    <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.75rem" }}>PNG, JPG, WebP — multiplos arquivos</p>
                  </div>
                </button>
              </div>
              {loadingImages ? (
                <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 text-gray-300 animate-spin" /></div>
              ) : images.length === 0 ? (
                <div className="text-center py-8"><Camera className="w-10 h-10 text-gray-300 mx-auto mb-2" /><p className="text-gray-400" style={{ fontSize: "0.85rem" }}>Nenhuma imagem cadastrada</p></div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {images.map((img) => (
                    <div key={img.name} className="relative group rounded-xl overflow-hidden border border-gray-200 hover:border-red-300 transition-colors bg-gray-50">
                      <div className="aspect-square"><img src={`${img.url}?t=${Date.now()}`} alt={img.name} className="w-full h-full object-contain p-2" /></div>
                      {img.isPrimary && <span className="absolute top-2 left-2 bg-red-600 text-white px-2 py-0.5 rounded-full" style={{ fontSize: "0.6rem", fontWeight: 700 }}>PRINCIPAL</span>}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <button onClick={() => handleDeleteImage(img.name)} className="opacity-0 group-hover:opacity-100 bg-red-600 text-white p-2 rounded-full shadow-lg hover:bg-red-700 transition-all"><Trash2 className="w-4 h-4" /></button>
                      </div>
                      <div className="px-2 py-1.5 bg-white border-t border-gray-100"><p className="text-gray-500 truncate font-mono" style={{ fontSize: "0.65rem" }}>{img.name}</p></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Tab Atributos ── */}
          {tab === "atributos" && (
            <div className="space-y-4">
              <p className="text-gray-500" style={{ fontSize: "0.8rem" }}>
                Edite, adicione ou remova atributos do produto. Atributos do CSV e personalizados sao exibidos juntos.
              </p>

              {loadingAttrs ? (
                <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 text-gray-300 animate-spin" /></div>
              ) : (
                <>
                  <FullAttributesEditor
                    attributes={allEditableAttrs}
                    onChange={(attrs) => setMeta({ ...meta, customAttributes: attrs })}
                  />
                  <button onClick={saveMeta} disabled={savingMeta} className="w-full py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                    {savingMeta ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar Atributos
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Full Attributes Editor (editable, deletable, addable) ───
function FullAttributesEditor({ attributes, onChange }: {
  attributes: Record<string, string>;
  onChange: (attrs: Record<string, string>) => void;
}) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editKeyValue, setEditKeyValue] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");
  const entries = Object.entries(attributes);

  const updateVal = (key: string, val: string) => onChange({ ...attributes, [key]: val });

  const removeAttr = (key: string) => {
    const next = { ...attributes };
    delete next[key];
    onChange(next);
  };

  const renameKey = (oldKey: string) => {
    if (!editKeyValue.trim() || editKeyValue.trim() === oldKey) { setEditingKey(null); return; }
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(attributes)) {
      next[k === oldKey ? editKeyValue.trim() : k] = v;
    }
    onChange(next);
    setEditingKey(null);
  };

  const addAttr = () => {
    if (!newKey.trim() || !newVal.trim()) return;
    onChange({ ...attributes, [newKey.trim()]: newVal.trim() });
    setNewKey("");
    setNewVal("");
  };

  return (
    <div className="space-y-2">
      {entries.length === 0 && (
        <div className="text-center py-6 bg-gray-50 rounded-xl border border-gray-200">
          <Tag className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-400" style={{ fontSize: "0.82rem" }}>Nenhum atributo. Adicione abaixo.</p>
        </div>
      )}

      {entries.map(([key, val]) => (
        <div key={key} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg p-2">
          {editingKey === key ? (
            <div className="w-1/3 flex items-center gap-1">
              <input type="text" value={editKeyValue} onChange={(e) => setEditKeyValue(e.target.value)}
                className="flex-1 border border-blue-300 rounded px-2 py-1.5 bg-blue-50 outline-none focus:ring-2 focus:ring-blue-200 font-mono" style={{ fontSize: "0.78rem" }}
                autoFocus onKeyDown={(e) => { if (e.key === "Enter") renameKey(key); if (e.key === "Escape") setEditingKey(null); }} />
              <button onClick={() => renameKey(key)} className="text-green-600 p-0.5"><Check className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <div className="w-1/3 flex items-center gap-1">
              <span className="font-mono text-gray-600 truncate" style={{ fontSize: "0.78rem" }}>{key}</span>
              <button onClick={() => { setEditingKey(key); setEditKeyValue(key); }} className="text-gray-400 hover:text-blue-600 p-0.5 shrink-0" title="Renomear chave"><PenLine className="w-3 h-3" /></button>
            </div>
          )}
          <input type="text" value={val} onChange={(e) => updateVal(key, e.target.value)}
            className="flex-1 border border-gray-200 rounded px-2.5 py-1.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" style={{ fontSize: "0.8rem" }} />
          <button onClick={() => removeAttr(key)} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors shrink-0" title="Remover atributo"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ))}

      {/* Add new */}
      <div className="flex items-center gap-2 pt-2 border-t border-gray-100 mt-2">
        <input type="text" value={newKey} onChange={(e) => setNewKey(e.target.value)}
          className="w-1/3 border border-gray-200 rounded-lg px-2.5 py-2 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 font-mono"
          style={{ fontSize: "0.8rem" }} placeholder="Nome do atributo"
          onKeyDown={(e) => e.key === "Enter" && addAttr()} />
        <input type="text" value={newVal} onChange={(e) => setNewVal(e.target.value)}
          className="flex-1 border border-gray-200 rounded-lg px-2.5 py-2 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
          style={{ fontSize: "0.8rem" }} placeholder="Valor"
          onKeyDown={(e) => e.key === "Enter" && addAttr()} />
        <button onClick={addAttr} disabled={!newKey.trim() || !newVal.trim()}
          className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-30 transition-colors flex items-center gap-1" style={{ fontSize: "0.78rem", fontWeight: 500 }}>
          <Plus className="w-3.5 h-3.5" /> Adicionar
        </button>
      </div>
    </div>
  );
}