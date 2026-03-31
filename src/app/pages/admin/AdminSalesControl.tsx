import { useState, useEffect, useMemo, useRef } from "react";
import {
  Search, Loader2, Package, Check, X, AlertTriangle,
  ShoppingCart, Ban, Ruler, CheckCircle2, XCircle,
  ChevronDown, ChevronUp, Filter, ToggleLeft, ToggleRight,
  RefreshCw, Download, Layers, Tag, Info, Zap
} from "lucide-react";
import * as api from "../../services/api";
import type { CategoryNode } from "../../services/api";
import { getValidAdminToken } from "./adminAuth";
import { ProductImage } from "../../components/ProductImage";

// =====================================================================
// AdminSalesControl — Gestao de Vendas por Medidas
//
// Mostra todos os produtos com status de dimensoes (do SIGE/manual)
// e permite habilitar/desabilitar para venda (campo sellable no meta).
// Produtos sem medidas nao calculam frete e devem ser desabilitados.
// =====================================================================

interface ProductRow {
  sku: string;
  titulo: string;
}

interface PhysicalData {
  weight: number;
  length: number;
  width: number;
  height: number;
}

interface MetaCompact {
  sku: string;
  category: string;
  brand: string;
  visible?: boolean;
  sellable?: boolean;
}

type DimFilter = "all" | "with_dims" | "without_dims";
type SellableFilter = "all" | "enabled" | "disabled";

const PAGE_SIZE = 30;

function removeAccents(str: string): string {
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

async function getToken(): Promise<string> {
  var token = await getValidAdminToken();
  if (!token) throw new Error("Sessao expirada. Faca login novamente.");
  return token;
}

function flattenCategories(nodes: CategoryNode[], parentPath = ""): Array<{ slug: string; name: string; path: string }> {
  var result: Array<{ slug: string; name: string; path: string }> = [];
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    var path = parentPath ? parentPath + " > " + n.name : n.name;
    result.push({ slug: n.slug, name: n.name, path: path });
    if (n.children && n.children.length > 0) {
      result = result.concat(flattenCategories(n.children, path));
    }
  }
  return result;
}

function hasDimensions(phys: PhysicalData | undefined): boolean {
  if (!phys) return false;
  return (phys.weight > 0) && (phys.length > 0 || phys.width > 0 || phys.height > 0);
}

function hasPartialDimensions(phys: PhysicalData | undefined): boolean {
  if (!phys) return false;
  var hasAny = phys.weight > 0 || phys.length > 0 || phys.width > 0 || phys.height > 0;
  var hasAll = phys.weight > 0 && phys.length > 0 && phys.width > 0 && phys.height > 0;
  return hasAny && !hasAll;
}

// ─── Toast ───
function Toast({ toast }: { toast: { type: "success" | "error" | "warning"; msg: string } | null }) {
  if (!toast) return null;
  var bgMap = { success: "bg-green-600", error: "bg-red-600", warning: "bg-amber-600" };
  return (
    <div className={"fixed top-4 right-4 z-[200] flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-white " + bgMap[toast.type]} style={{ fontSize: "0.85rem", maxWidth: "420px" }}>
      {toast.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : toast.type === "error" ? <XCircle className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
      <span className="line-clamp-2">{toast.msg}</span>
    </div>
  );
}

export function AdminSalesControl() {
  // ─── State ───
  var [allProducts, setAllProducts] = useState<ProductRow[]>([]);
  var [physicalMap, setPhysicalMap] = useState<Record<string, PhysicalData>>({});
  var [metaMap, setMetaMap] = useState<Record<string, MetaCompact>>({});
  var [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);
  var [flatCats, setFlatCats] = useState<Array<{ slug: string; name: string; path: string }>>([]);
  var [loading, setLoading] = useState(true);
  var [loadingStep, setLoadingStep] = useState("");
  var [toast, setToast] = useState<{ type: "success" | "error" | "warning"; msg: string } | null>(null);

  // Filters
  var [searchTerm, setSearchTerm] = useState("");
  var [debouncedSearch, setDebouncedSearch] = useState("");
  var [dimFilter, setDimFilter] = useState<DimFilter>("all");
  var [sellableFilter, setSellableFilter] = useState<SellableFilter>("all");
  var [categoryFilter, setCategoryFilter] = useState("__all__");
  var [page, setPage] = useState(1);
  var [showFilters, setShowFilters] = useState(false);

  // Bulk action
  var [bulkLoading, setBulkLoading] = useState(false);
  var [selected, setSelected] = useState<Set<string>>(new Set());

  // Single toggle loading state
  var [togglingSkus, setTogglingSkus] = useState<Set<string>>(new Set());

  var searchRef = useRef<HTMLInputElement>(null);

  function showToast(type: "success" | "error" | "warning", msg: string) {
    setToast({ type, msg });
    setTimeout(function () { setToast(null); }, 3500);
  }

  // ─── Load data ───
  useEffect(function () {
    var cancelled = false;
    async function loadAll() {
      try {
        var token = await getToken();

        setLoadingStep("Carregando categorias...");
        try {
          var catResult = await api.getCategoryTree();
          if (cancelled) return;
          var tree = Array.isArray(catResult) ? catResult : [];
          setCategoryTree(tree);
          setFlatCats(flattenCategories(tree));
        } catch (e: any) {
          console.warn("[AdminSalesControl] Category tree error:", e);
        }
        if (cancelled) return;

        setLoadingStep("Carregando metadados e dimensoes...");
        var [metaSettled, physSettled] = await Promise.allSettled([
          api.getMetaAllCompact(token),
          api.getPhysicalBulkList(token),
        ]);
        if (cancelled) return;

        // Process meta
        var metaResult = metaSettled.status === "fulfilled" ? metaSettled.value : null;
        var mMap: Record<string, MetaCompact> = {};
        var metaItems = Array.isArray(metaResult?.items) ? metaResult!.items : [];
        for (var j = 0; j < metaItems.length; j++) {
          var m = metaItems[j];
          if (m?.sku) mMap[m.sku] = m;
        }
        setMetaMap(mMap);

        // Process physical
        var physResult = physSettled.status === "fulfilled" ? physSettled.value : null;
        var pMap: Record<string, PhysicalData> = {};
        var physItems = Array.isArray(physResult?.items) ? physResult!.items : [];
        for (var i = 0; i < physItems.length; i++) {
          var item = physItems[i];
          if (item?.sku) pMap[item.sku] = { weight: item.weight || 0, length: item.length || 0, width: item.width || 0, height: item.height || 0 };
        }
        setPhysicalMap(pMap);

        if (cancelled) return;

        // Load products paginated
        setLoadingStep("Carregando produtos...");
        var allProds: ProductRow[] = [];
        var pg = 1;
        var hasMore = true;
        while (hasMore) {
          try {
            var res = await api.getProdutosDB(pg, 200, "");
            if (cancelled) return;
            var data = Array.isArray(res?.data) ? res.data : [];
            allProds = allProds.concat(data.map(function (p) { return { sku: p.sku, titulo: p.titulo }; }));
            hasMore = !!(res?.pagination?.hasNext);
            setLoadingStep("Carregando produtos... (" + allProds.length + (res?.pagination?.total ? "/" + res.pagination.total : "") + ")");
          } catch (e: any) {
            hasMore = false;
          }
          pg++;
          if (pg > 100) break;
        }
        if (cancelled) return;
        setAllProducts(allProds);
      } catch (e: any) {
        console.error("[AdminSalesControl] Load error:", e);
        showToast("error", "Erro ao carregar: " + e.message);
      } finally {
        if (!cancelled) { setLoading(false); setLoadingStep(""); }
      }
    }
    loadAll();
    return function () { cancelled = true; };
  }, []);

  // ─── Debounce search ───
  useEffect(function () {
    var tid = setTimeout(function () { setDebouncedSearch(searchTerm); setPage(1); }, 250);
    return function () { clearTimeout(tid); };
  }, [searchTerm]);

  // ─── Stats ───
  var stats = useMemo(function () {
    var total = allProducts.length;
    var withDims = 0;
    var withoutDims = 0;
    var partialDims = 0;
    var enabledForSale = 0;
    var disabledForSale = 0;
    var withDimsDisabled = 0;
    var withoutDimsEnabled = 0;

    for (var i = 0; i < allProducts.length; i++) {
      var sku = allProducts[i].sku;
      var phys = physicalMap[sku];
      var meta = metaMap[sku];
      var isSellable = meta?.sellable === true;
      var dims = hasDimensions(phys);
      var partial = hasPartialDimensions(phys);

      if (dims) withDims++;
      else if (partial) partialDims++;
      else withoutDims++;

      if (isSellable) enabledForSale++;
      else disabledForSale++;

      if (dims && !isSellable) withDimsDisabled++;
      if (!dims && !partial && isSellable) withoutDimsEnabled++;
    }

    return { total, withDims, withoutDims, partialDims, enabledForSale, disabledForSale, withDimsDisabled, withoutDimsEnabled };
  }, [allProducts, physicalMap, metaMap]);

  // ─── Filtered + paginated list ───
  var filteredProducts = useMemo(function () {
    var list = allProducts;

    // Text search
    if (debouncedSearch) {
      var q = removeAccents(debouncedSearch);
      list = list.filter(function (p) {
        return removeAccents(p.sku).indexOf(q) !== -1 || removeAccents(p.titulo).indexOf(q) !== -1;
      });
    }

    // Category filter
    if (categoryFilter !== "__all__") {
      list = list.filter(function (p) {
        var meta = metaMap[p.sku];
        return meta && meta.category === categoryFilter;
      });
    }

    // Dimension filter
    if (dimFilter !== "all") {
      list = list.filter(function (p) {
        var phys = physicalMap[p.sku];
        var dims = hasDimensions(phys);
        if (dimFilter === "with_dims") return dims;
        return !dims;
      });
    }

    // Sellable filter
    if (sellableFilter !== "all") {
      list = list.filter(function (p) {
        var meta = metaMap[p.sku];
        var isSellable = meta?.sellable === true;
        if (sellableFilter === "enabled") return isSellable;
        return !isSellable;
      });
    }

    return list;
  }, [allProducts, debouncedSearch, categoryFilter, dimFilter, sellableFilter, metaMap, physicalMap]);

  var totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  var pagedProducts = filteredProducts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ─── Toggle sellable for single product ───
  async function toggleSellable(sku: string) {
    var current = metaMap[sku]?.sellable === true;
    var newValue = !current;

    setTogglingSkus(function (prev) { var s = new Set(prev); s.add(sku); return s; });
    setMetaMap(function (prev) {
      var copy = { ...prev };
      copy[sku] = { ...(copy[sku] || { sku, category: "", brand: "" }), sellable: newValue };
      return copy;
    });

    try {
      var token = await getToken();
      await api.saveProductMeta(sku, { sellable: newValue }, token);
    } catch (e: any) {
      // Revert
      setMetaMap(function (prev) {
        var copy = { ...prev };
        copy[sku] = { ...(copy[sku] || { sku, category: "", brand: "" }), sellable: current };
        return copy;
      });
      showToast("error", "Erro ao atualizar: " + e.message);
    } finally {
      setTogglingSkus(function (prev) { var s = new Set(prev); s.delete(sku); return s; });
    }
  }

  // ─── Bulk: Disable all without dimensions ───
  async function bulkDisableWithoutDims() {
    var targets = allProducts.filter(function (p) {
      var phys = physicalMap[p.sku];
      var meta = metaMap[p.sku];
      return !hasDimensions(phys) && meta?.sellable === true;
    });

    if (targets.length === 0) {
      showToast("warning", "Nenhum produto sem medidas para desabilitar.");
      return;
    }

    setBulkLoading(true);
    var success = 0;
    var failed = 0;

    try {
      var token = await getToken();
      // Process in batches of 10
      for (var i = 0; i < targets.length; i += 10) {
        var batch = targets.slice(i, i + 10);
        var results = await Promise.allSettled(
          batch.map(function (p) { return api.saveProductMeta(p.sku, { sellable: false }, token); })
        );
        for (var r = 0; r < results.length; r++) {
          if (results[r].status === "fulfilled") {
            success++;
            var batchSku = batch[r].sku;
            setMetaMap(function (prev) {
              var copy = { ...prev };
              copy[batchSku] = { ...(copy[batchSku] || { sku: batchSku, category: "", brand: "" }), sellable: false };
              return copy;
            });
          } else {
            failed++;
          }
        }
      }
      showToast("success", success + " produtos desabilitados para venda." + (failed > 0 ? " (" + failed + " falharam)" : ""));
    } catch (e: any) {
      showToast("error", "Erro na operacao em lote: " + e.message);
    } finally {
      setBulkLoading(false);
    }
  }

  // ─── Bulk: Enable all with dimensions ───
  async function bulkEnableWithDims() {
    var targets = allProducts.filter(function (p) {
      var phys = physicalMap[p.sku];
      var meta = metaMap[p.sku];
      return hasDimensions(phys) && meta?.sellable !== true;
    });

    if (targets.length === 0) {
      showToast("warning", "Nenhum produto com medidas para habilitar.");
      return;
    }

    setBulkLoading(true);
    var success = 0;
    var failed = 0;

    try {
      var token = await getToken();
      for (var i = 0; i < targets.length; i += 10) {
        var batch = targets.slice(i, i + 10);
        var results = await Promise.allSettled(
          batch.map(function (p) { return api.saveProductMeta(p.sku, { sellable: true }, token); })
        );
        for (var r = 0; r < results.length; r++) {
          if (results[r].status === "fulfilled") {
            success++;
            var batchSku = batch[r].sku;
            setMetaMap(function (prev) {
              var copy = { ...prev };
              copy[batchSku] = { ...(copy[batchSku] || { sku: batchSku, category: "", brand: "" }), sellable: true };
              return copy;
            });
          } else {
            failed++;
          }
        }
      }
      showToast("success", success + " produtos habilitados para venda." + (failed > 0 ? " (" + failed + " falharam)" : ""));
    } catch (e: any) {
      showToast("error", "Erro na operacao em lote: " + e.message);
    } finally {
      setBulkLoading(false);
    }
  }

  // ─── Bulk: Toggle selected products ───
  async function bulkToggleSelected(sellable: boolean) {
    if (selected.size === 0) {
      showToast("warning", "Nenhum produto selecionado.");
      return;
    }

    setBulkLoading(true);
    var success = 0;
    var failed = 0;
    var targets = Array.from(selected);

    try {
      var token = await getToken();
      for (var i = 0; i < targets.length; i += 10) {
        var batch = targets.slice(i, i + 10);
        var results = await Promise.allSettled(
          batch.map(function (sku) { return api.saveProductMeta(sku, { sellable: sellable }, token); })
        );
        for (var r = 0; r < results.length; r++) {
          if (results[r].status === "fulfilled") {
            success++;
            var batchSku = batch[r];
            setMetaMap(function (prev) {
              var copy = { ...prev };
              copy[batchSku] = { ...(copy[batchSku] || { sku: batchSku, category: "", brand: "" }), sellable: sellable };
              return copy;
            });
          } else {
            failed++;
          }
        }
      }
      setSelected(new Set());
      showToast("success", success + " produtos " + (sellable ? "habilitados" : "desabilitados") + "." + (failed > 0 ? " (" + failed + " falharam)" : ""));
    } catch (e: any) {
      showToast("error", "Erro na operacao em lote: " + e.message);
    } finally {
      setBulkLoading(false);
    }
  }

  // ─── Select/deselect ───
  function toggleSelect(sku: string) {
    setSelected(function (prev) {
      var s = new Set(prev);
      if (s.has(sku)) s.delete(sku); else s.add(sku);
      return s;
    });
  }

  function selectAllFiltered() {
    setSelected(new Set(filteredProducts.map(function (p) { return p.sku; })));
  }

  function deselectAll() {
    setSelected(new Set());
  }

  // ─── CSV Export ───
  function exportCSV() {
    var rows = [["SKU", "Titulo", "Peso (kg)", "Comp (cm)", "Larg (cm)", "Alt (cm)", "Medidas OK", "Habilitado Venda"].join(";")];
    for (var i = 0; i < filteredProducts.length; i++) {
      var p = filteredProducts[i];
      var phys = physicalMap[p.sku];
      var meta = metaMap[p.sku];
      rows.push([
        p.sku,
        '"' + p.titulo.replace(/"/g, '""') + '"',
        phys ? String(phys.weight) : "0",
        phys ? String(phys.length) : "0",
        phys ? String(phys.width) : "0",
        phys ? String(phys.height) : "0",
        hasDimensions(phys) ? "Sim" : "Nao",
        meta?.sellable === true ? "Sim" : "Nao",
      ].join(";"));
    }
    var csv = rows.join("\n");
    var blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "gestao_vendas_" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
    URL.revokeObjectURL(url);
    showToast("success", "CSV exportado com " + filteredProducts.length + " produtos.");
  }

  // ─── Render ───

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-red-500" />
        <p className="text-gray-500" style={{ fontSize: "0.9rem" }}>{loadingStep || "Carregando..."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Toast toast={toast} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "1.25rem", fontWeight: 700 }}>
            <ShoppingCart className="w-5 h-5 text-red-600" />
            Gestao de Vendas
          </h2>
          <p className="text-gray-500 mt-0.5" style={{ fontSize: "0.8rem" }}>
            Habilite ou desabilite produtos para venda com base nas medidas cadastradas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors text-xs font-medium cursor-pointer">
            <Download className="w-3.5 h-3.5" /> Exportar CSV
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Package className="w-4 h-4 text-gray-400" />
            <span className="text-gray-500" style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Total</span>
          </div>
          <p className="text-gray-800" style={{ fontSize: "1.5rem", fontWeight: 700 }}>{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl border border-green-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Ruler className="w-4 h-4 text-green-500" />
            <span className="text-green-600" style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Com medidas</span>
          </div>
          <p className="text-green-700" style={{ fontSize: "1.5rem", fontWeight: 700 }}>{stats.withDims}</p>
        </div>
        <div className="bg-white rounded-xl border border-red-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span className="text-red-600" style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Sem medidas</span>
          </div>
          <p className="text-red-700" style={{ fontSize: "1.5rem", fontWeight: 700 }}>{stats.withoutDims}</p>
          {stats.partialDims > 0 && (
            <p className="text-amber-600 mt-0.5" style={{ fontSize: "0.7rem" }}>+ {stats.partialDims} parciais</p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-blue-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShoppingCart className="w-4 h-4 text-blue-500" />
            <span className="text-blue-600" style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Habilitados</span>
          </div>
          <p className="text-blue-700" style={{ fontSize: "1.5rem", fontWeight: 700 }}>{stats.enabledForSale}</p>
          <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.7rem" }}>{stats.disabledForSale} desabilitados</p>
        </div>
      </div>

      {/* Alerts */}
      {stats.withoutDimsEnabled > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-800" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
              {stats.withoutDimsEnabled} produto{stats.withoutDimsEnabled > 1 ? "s" : ""} sem medidas esta{stats.withoutDimsEnabled > 1 ? "o" : ""} habilitado{stats.withoutDimsEnabled > 1 ? "s" : ""} para venda
            </p>
            <p className="text-amber-700 mt-0.5" style={{ fontSize: "0.78rem" }}>
              Esses produtos nao conseguem calcular frete. Use a acao rapida abaixo para desabilita-los.
            </p>
          </div>
        </div>
      )}

      {stats.withDimsDisabled > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-blue-800" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
              {stats.withDimsDisabled} produto{stats.withDimsDisabled > 1 ? "s" : ""} com medidas esta{stats.withDimsDisabled > 1 ? "o" : ""} desabilitado{stats.withDimsDisabled > 1 ? "s" : ""} para venda
            </p>
            <p className="text-blue-700 mt-0.5" style={{ fontSize: "0.78rem" }}>
              Esses produtos tem medidas cadastradas e podem ser habilitados.
            </p>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-gray-700 mb-3 flex items-center gap-2" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
          <Zap className="w-4 h-4 text-amber-500" /> Acoes Rapidas
        </h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={bulkDisableWithoutDims}
            disabled={bulkLoading || stats.withoutDimsEnabled === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {bulkLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
            Desabilitar todos SEM medidas ({stats.withoutDimsEnabled})
          </button>
          <button
            onClick={bulkEnableWithDims}
            disabled={bulkLoading || stats.withDimsDisabled === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {bulkLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Habilitar todos COM medidas ({stats.withDimsDisabled})
          </button>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              ref={searchRef}
              type="text"
              value={searchTerm}
              onChange={function (e) { setSearchTerm(e.target.value); }}
              placeholder="Buscar por SKU ou nome..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
            />
            {searchTerm && (
              <button onClick={function () { setSearchTerm(""); searchRef.current?.focus(); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filter toggles */}
          <button onClick={function () { setShowFilters(!showFilters); }} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors text-xs font-medium cursor-pointer">
            <Filter className="w-3.5 h-3.5" />
            Filtros
            {showFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-3 pt-2 border-t border-gray-100">
            {/* Dimension filter */}
            <div>
              <label className="block text-gray-500 mb-1" style={{ fontSize: "0.7rem", fontWeight: 600 }}>MEDIDAS</label>
              <select value={dimFilter} onChange={function (e) { setDimFilter(e.target.value as DimFilter); setPage(1); }} className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs bg-white cursor-pointer">
                <option value="all">Todos</option>
                <option value="with_dims">Com medidas</option>
                <option value="without_dims">Sem medidas</option>
              </select>
            </div>

            {/* Sellable filter */}
            <div>
              <label className="block text-gray-500 mb-1" style={{ fontSize: "0.7rem", fontWeight: 600 }}>VENDA</label>
              <select value={sellableFilter} onChange={function (e) { setSellableFilter(e.target.value as SellableFilter); setPage(1); }} className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs bg-white cursor-pointer">
                <option value="all">Todos</option>
                <option value="enabled">Habilitados</option>
                <option value="disabled">Desabilitados</option>
              </select>
            </div>

            {/* Category filter */}
            <div>
              <label className="block text-gray-500 mb-1" style={{ fontSize: "0.7rem", fontWeight: 600 }}>CATEGORIA</label>
              <select value={categoryFilter} onChange={function (e) { setCategoryFilter(e.target.value); setPage(1); }} className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs bg-white max-w-[200px] cursor-pointer">
                <option value="__all__">Todas</option>
                {flatCats.map(function (c) {
                  return <option key={c.slug} value={c.slug}>{c.path}</option>;
                })}
              </select>
            </div>
          </div>
        )}

        {/* Selection bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
            <span className="text-gray-600 text-xs font-medium">{selected.size} selecionado{selected.size > 1 ? "s" : ""}</span>
            <button onClick={function () { bulkToggleSelected(true); }} disabled={bulkLoading} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50">
              <ToggleRight className="w-3.5 h-3.5" /> Habilitar
            </button>
            <button onClick={function () { bulkToggleSelected(false); }} disabled={bulkLoading} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50">
              <ToggleLeft className="w-3.5 h-3.5" /> Desabilitar
            </button>
            <button onClick={deselectAll} className="text-gray-400 hover:text-gray-600 text-xs cursor-pointer">Limpar</button>
          </div>
        )}
      </div>

      {/* Results info */}
      <div className="flex items-center justify-between">
        <p className="text-gray-500" style={{ fontSize: "0.78rem" }}>
          {filteredProducts.length} produto{filteredProducts.length !== 1 ? "s" : ""} encontrado{filteredProducts.length !== 1 ? "s" : ""}
          {selected.size === 0 && filteredProducts.length > 0 && (
            <button onClick={selectAllFiltered} className="ml-2 text-red-600 hover:underline cursor-pointer">Selecionar todos</button>
          )}
        </p>
        {totalPages > 1 && (
          <p className="text-gray-400" style={{ fontSize: "0.75rem" }}>
            Pagina {page} de {totalPages}
          </p>
        )}
      </div>

      {/* Product Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Table header */}
        <div className="hidden sm:grid grid-cols-[40px_48px_1fr_140px_100px_100px_80px] gap-3 px-4 py-2.5 bg-gray-50 border-b border-gray-200">
          <span></span>
          <span></span>
          <span className="text-gray-500" style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Produto</span>
          <span className="text-gray-500" style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>SKU</span>
          <span className="text-gray-500 text-center" style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Medidas</span>
          <span className="text-gray-500 text-center" style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Peso</span>
          <span className="text-gray-500 text-center" style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Venda</span>
        </div>

        {pagedProducts.length === 0 ? (
          <div className="py-12 text-center text-gray-400" style={{ fontSize: "0.85rem" }}>
            Nenhum produto encontrado com os filtros aplicados.
          </div>
        ) : (
          pagedProducts.map(function (p, idx) {
            var phys = physicalMap[p.sku];
            var meta = metaMap[p.sku];
            var dims = hasDimensions(phys);
            var partial = hasPartialDimensions(phys);
            var isSellable = meta?.sellable === true;
            var isToggling = togglingSkus.has(p.sku);
            var isSelected = selected.has(p.sku);

            return (
              <div
                key={p.sku}
                className={"grid grid-cols-[40px_48px_1fr_140px_100px_100px_80px] gap-3 px-4 py-2.5 items-center transition-colors " +
                  (isSelected ? "bg-red-50 " : "hover:bg-gray-50 ") +
                  (idx < pagedProducts.length - 1 ? "border-b border-gray-100" : "")}
              >
                {/* Checkbox */}
                <div className="flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={function () { toggleSelect(p.sku); }}
                    className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-200 cursor-pointer"
                  />
                </div>

                {/* Thumb */}
                <div className="flex items-center justify-center">
                  <ProductImage
                    sku={p.sku}
                    alt={p.sku}
                    className="rounded-lg bg-gray-100 object-contain border border-gray-200"
                    style={{ width: 40, height: 40 }}
                    fallback={
                      <div className="rounded-lg bg-gray-100 flex items-center justify-center" style={{ width: 40, height: 40 }}>
                        <Package className="text-gray-300 w-4 h-4" />
                      </div>
                    }
                  />
                </div>

                {/* Title */}
                <div className="min-w-0">
                  <p className="text-gray-800 truncate" style={{ fontSize: "0.82rem", fontWeight: 500 }}>{p.titulo}</p>
                  {meta?.category && (
                    <p className="text-gray-400 truncate" style={{ fontSize: "0.68rem" }}>
                      <Tag className="w-3 h-3 inline mr-1" />{meta.category}
                    </p>
                  )}
                </div>

                {/* SKU */}
                <span className="font-mono text-gray-500 truncate" style={{ fontSize: "0.72rem" }}>{p.sku}</span>

                {/* Dimensions status */}
                <div className="flex items-center justify-center">
                  {dims ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700" style={{ fontSize: "0.68rem", fontWeight: 600 }}>
                      <CheckCircle2 className="w-3 h-3" /> OK
                    </span>
                  ) : partial ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700" style={{ fontSize: "0.68rem", fontWeight: 600 }} title={formatDims(phys)}>
                      <AlertTriangle className="w-3 h-3" /> Parcial
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700" style={{ fontSize: "0.68rem", fontWeight: 600 }}>
                      <XCircle className="w-3 h-3" /> Falta
                    </span>
                  )}
                </div>

                {/* Weight */}
                <div className="text-center">
                  {phys && phys.weight > 0 ? (
                    <span className="text-gray-600" style={{ fontSize: "0.75rem" }}>{phys.weight} kg</span>
                  ) : (
                    <span className="text-gray-300" style={{ fontSize: "0.75rem" }}>--</span>
                  )}
                </div>

                {/* Sellable toggle */}
                <div className="flex items-center justify-center">
                  <button
                    onClick={function () { toggleSellable(p.sku); }}
                    disabled={isToggling || bulkLoading}
                    className="cursor-pointer disabled:cursor-not-allowed"
                    title={isSellable ? "Habilitado - clique para desabilitar" : "Desabilitado - clique para habilitar"}
                  >
                    {isToggling ? (
                      <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                    ) : isSellable ? (
                      <ToggleRight className="w-6 h-6 text-green-600" />
                    ) : (
                      <ToggleLeft className="w-6 h-6 text-gray-300" />
                    )}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={function () { setPage(Math.max(1, page - 1)); }}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            Anterior
          </button>
          {Array.from({ length: Math.min(7, totalPages) }, function (_, i) {
            var p: number;
            if (totalPages <= 7) {
              p = i + 1;
            } else if (page <= 4) {
              p = i + 1;
            } else if (page >= totalPages - 3) {
              p = totalPages - 6 + i;
            } else {
              p = page - 3 + i;
            }
            return (
              <button
                key={p}
                onClick={function () { setPage(p); }}
                className={"px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer " +
                  (p === page ? "bg-red-600 text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50")}
              >
                {p}
              </button>
            );
          })}
          <button
            onClick={function () { setPage(Math.min(totalPages, page + 1)); }}
            disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            Proximo
          </button>
        </div>
      )}
    </div>
  );
}

function formatDims(phys: PhysicalData | undefined): string {
  if (!phys) return "Sem dados";
  return "Peso: " + phys.weight + "kg | " + phys.length + "x" + phys.width + "x" + phys.height + " cm";
}
