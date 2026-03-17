import { useState, useEffect, useRef, useMemo } from "react";
import {
  Search, Loader2, Save, Check, X, Package, Ruler,
  CheckSquare, Square, ChevronDown, ChevronUp,
  AlertTriangle, Info, ArrowRight, Download, Layers,
  MinusSquare, Upload, BarChart3, FileSpreadsheet, Tag, FolderOpen
} from "lucide-react";
import * as api from "../../services/api";
import type { CategoryNode } from "../../services/api";
import { getValidAdminToken } from "./adminAuth";
import { ProductImage } from "../../components/ProductImage";

// ═══════════════════════════════════════════════════════════════════
// AdminDimensions — Bulk product dimensions & weight management
//
// Features:
// 1. Search products by name/SKU with debounced input
// 2. Filter by category or brand
// 3. View/edit weight, length, width, height per product
// 4. Select multiple products for bulk operations
// 5. Sync weight from SIGE for selected products
// 6. Coverage report showing % complete by category
// 7. CSV export/import for spreadsheet editing
// ═══════════════════════════════════════════════════════════════════

interface ProductRow {
  sku: string;
  titulo: string;
}

interface PhysicalData {
  weight: number;
  length: number;
  width: number;
  height: number;
  updatedAt?: number;
  updatedBy?: string;
}

interface MetaCompact {
  sku: string;
  category: string;
  brand: string;
}

type StatusFilter = "all" | "with-data" | "without-data" | "complete" | "partial";
type SubTab = "editor" | "report";

const PAGE_SIZE = 30;

function removeAccents(str: string): string {
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

async function getToken(): Promise<string> {
  var token = await getValidAdminToken();
  if (!token) throw new Error("Sessao expirada. Faca login novamente.");
  return token;
}

// Flatten category tree to list of { slug, name, path }
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

// Collect slug + all descendant slugs
function collectDescendantSlugs(nodes: CategoryNode[], targetSlug: string): string[] {
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i].slug === targetSlug) {
      var all: string[] = [targetSlug];
      function walk(n: CategoryNode) { all.push(n.slug); if (n.children) n.children.forEach(walk); }
      if (nodes[i].children) nodes[i].children!.forEach(walk);
      return all;
    }
    if (nodes[i].children) {
      var found = collectDescendantSlugs(nodes[i].children!, targetSlug);
      if (found.length > 0) return found;
    }
  }
  return [];
}

export function AdminDimensions() {
  // ─── State ───
  var [allProducts, setAllProducts] = useState<ProductRow[]>([]);
  var [physicalMap, setPhysicalMap] = useState<Record<string, PhysicalData>>({});
  var [metaMap, setMetaMap] = useState<Record<string, MetaCompact>>({});
  var [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);
  var [flatCats, setFlatCats] = useState<Array<{ slug: string; name: string; path: string }>>([]);
  var [brands, setBrands] = useState<string[]>([]);
  var [loading, setLoading] = useState(true);
  var [loadingStep, setLoadingStep] = useState("");
  var [searchTerm, setSearchTerm] = useState("");
  var [debouncedSearch, setDebouncedSearch] = useState("");
  var [selected, setSelected] = useState<Set<string>>(new Set());
  var [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  var [categoryFilter, setCategoryFilter] = useState("__all__");
  var [brandFilter, setBrandFilter] = useState("__all__");
  var [saving, setSaving] = useState(false);
  var [syncing, setSyncing] = useState(false);
  var [savedMsg, setSavedMsg] = useState("");
  var [errorMsg, setErrorMsg] = useState("");
  var [page, setPage] = useState(1);
  var [subTab, setSubTab] = useState<SubTab>("editor");

  // Bulk action panel
  var [bulkWeight, setBulkWeight] = useState("");
  var [bulkLength, setBulkLength] = useState("");
  var [bulkWidth, setBulkWidth] = useState("");
  var [bulkHeight, setBulkHeight] = useState("");
  var [bulkPanelOpen, setBulkPanelOpen] = useState(false);

  // Inline edits: sku -> { weight, length, width, height }
  var [edits, setEdits] = useState<Record<string, { weight: string; length: string; width: string; height: string }>>({});
  var [dirtySkus, setDirtySkus] = useState<Set<string>>(new Set());

  // CSV import
  var fileInputRef = useRef<HTMLInputElement>(null);
  var [importing, setImporting] = useState(false);

  var searchRef = useRef<HTMLInputElement>(null);

  // ─── Load data sequentially to avoid overwhelming edge function on cold start ───
  useEffect(function () {
    var cancelled = false;
    async function loadAll() {
      var warnings: string[] = [];
      try {
        var token = await getToken();

        // Step 1: Category tree (lightweight, public — warms the edge function)
        setLoadingStep("Carregando categorias...");
        try {
          var catResult = await api.getCategoryTree();
          if (cancelled) return;
          var tree = Array.isArray(catResult) ? catResult : [];
          setCategoryTree(tree);
          setFlatCats(flattenCategories(tree));
        } catch (e: any) {
          console.warn("[AdminDimensions] Category tree error:", e);
          warnings.push("categorias");
        }
        if (cancelled) return;

        // Step 2: Meta compact + physical data (2 admin requests in parallel — edge is warm now)
        setLoadingStep("Carregando metadados e dimensoes...");
        var [metaSettled, physSettled] = await Promise.allSettled([
          api.getMetaAllCompact(token),
          api.getPhysicalBulkList(token),
        ]);
        if (cancelled) return;

        // Process meta
        var metaResult = metaSettled.status === "fulfilled" ? metaSettled.value : null;
        var mMap: Record<string, MetaCompact> = {};
        var brandSet: Record<string, boolean> = {};
        var metaItems = Array.isArray(metaResult?.items) ? metaResult!.items : [];
        for (var j = 0; j < metaItems.length; j++) {
          var m = metaItems[j];
          if (m?.sku) {
            if (m.brand) m.brand = String(m.brand).trim();
            mMap[m.sku] = m;
            if (m.brand) brandSet[m.brand.toLowerCase()] = true;
          }
        }
        setMetaMap(mMap);
        setBrands(Object.keys(brandSet).sort());
        if (metaSettled.status === "rejected") { console.warn("[AdminDimensions] Meta error:", metaSettled.reason); warnings.push("metadados"); }

        // Process physical
        var physResult = physSettled.status === "fulfilled" ? physSettled.value : null;
        var pMap: Record<string, PhysicalData> = {};
        var physItems = Array.isArray(physResult?.items) ? physResult!.items : [];
        for (var i = 0; i < physItems.length; i++) {
          var item = physItems[i];
          if (item?.sku) pMap[item.sku] = { weight: item.weight || 0, length: item.length || 0, width: item.width || 0, height: item.height || 0, updatedAt: item.updatedAt, updatedBy: item.updatedBy };
        }
        setPhysicalMap(pMap);
        if (physSettled.status === "rejected") { console.warn("[AdminDimensions] Physical error:", physSettled.reason); warnings.push("dados fisicos"); }

        if (cancelled) return;

        // Step 3: Products — paginate sequentially (each page waits for the previous)
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
            console.warn("[AdminDimensions] Products page " + pg + " error:", e);
            // If first page fails, mark warning; otherwise use what we have
            if (pg === 1) warnings.push("produtos");
            hasMore = false;
          }
          pg++;
          if (pg > 100) break;
        }
        if (cancelled) return;
        setAllProducts(allProds);

        if (warnings.length > 0) setErrorMsg("Aviso: falha parcial ao carregar " + warnings.join(", ") + ". Alguns dados podem estar incompletos.");
      } catch (e: any) {
        console.error("[AdminDimensions] Load error:", e);
        setErrorMsg("Erro ao carregar: " + e.message);
      } finally {
        if (!cancelled) { setLoading(false); setLoadingStep(""); }
      }
    }
    loadAll();
    return function () { cancelled = true; };
  }, []);

  // ─── Debounce search ───
  useEffect(function () {
    var timer = setTimeout(function () {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 250);
    return function () { clearTimeout(timer); };
  }, [searchTerm]);

  // ─── Filtered products ───
  var filteredProducts = useMemo(function () {
    var searchNorm = removeAccents(debouncedSearch.trim());
    var searchTokens = searchNorm.split(/\s+/).filter(Boolean);

    // Pre-compute category filter slugs (include descendants)
    var catSlugs: Set<string> | null = null;
    if (categoryFilter !== "__all__" && categoryFilter !== "__uncategorized__") {
      var slugs = collectDescendantSlugs(categoryTree, categoryFilter);
      catSlugs = new Set(slugs.length > 0 ? slugs : [categoryFilter]);
    }

    return allProducts.filter(function (p) {
      var pd = physicalMap[p.sku];
      var hasData = !!pd && (pd.weight > 0 || pd.length > 0 || pd.width > 0 || pd.height > 0);
      var complete = !!pd && pd.weight > 0 && pd.length > 0 && pd.width > 0 && pd.height > 0;
      var partial = hasData && !complete;

      // Status filter
      if (statusFilter === "with-data" && !hasData) return false;
      if (statusFilter === "without-data" && hasData) return false;
      if (statusFilter === "complete" && !complete) return false;
      if (statusFilter === "partial" && !partial) return false;

      // Category filter
      var meta = metaMap[p.sku];
      if (categoryFilter === "__uncategorized__") {
        if (meta && meta.category) return false;
      } else if (catSlugs) {
        if (!meta || !meta.category || !catSlugs.has(meta.category)) return false;
      }

      // Brand filter
      if (brandFilter !== "__all__") {
        if (!meta || !meta.brand || meta.brand.toLowerCase() !== brandFilter) return false;
      }

      // Search filter
      if (searchTokens.length === 0) return true;
      var textNorm = removeAccents(p.sku + " " + p.titulo);
      for (var i = 0; i < searchTokens.length; i++) {
        if (!textNorm.includes(searchTokens[i])) return false;
      }
      return true;
    });
  }, [allProducts, debouncedSearch, physicalMap, statusFilter, categoryFilter, brandFilter, metaMap, categoryTree]);

  var totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  var currentPage = Math.min(page, totalPages);
  var pageProducts = filteredProducts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // ─── Stats ───
  var stats = useMemo(function () {
    var total = allProducts.length;
    var withData = 0;
    var withWeight = 0;
    var withDims = 0;
    for (var i = 0; i < allProducts.length; i++) {
      var pd = physicalMap[allProducts[i].sku];
      if (pd) {
        if (pd.weight > 0 || pd.length > 0 || pd.width > 0 || pd.height > 0) withData++;
        if (pd.weight > 0) withWeight++;
        if (pd.length > 0 && pd.width > 0 && pd.height > 0) withDims++;
      }
    }
    return { total, withData, withWeight, withDims, withoutData: total - withData };
  }, [allProducts, physicalMap]);

  // ─── Coverage report data ───
  var coverageData = useMemo(function () {
    // Build per-category stats
    var catStats: Record<string, { name: string; path: string; total: number; withWeight: number; withDims: number; complete: number }> = {};
    var uncategorized = { total: 0, withWeight: 0, withDims: 0, complete: 0 };

    for (var i = 0; i < allProducts.length; i++) {
      var sku = allProducts[i].sku;
      var meta = metaMap[sku];
      var pd = physicalMap[sku];
      var hasWeight = !!pd && pd.weight > 0;
      var hasDims = !!pd && pd.length > 0 && pd.width > 0 && pd.height > 0;
      var isComplete = hasWeight && hasDims;

      var catSlug = meta?.category || "";
      if (!catSlug) {
        uncategorized.total++;
        if (hasWeight) uncategorized.withWeight++;
        if (hasDims) uncategorized.withDims++;
        if (isComplete) uncategorized.complete++;
      } else {
        if (!catStats[catSlug]) {
          var catInfo = flatCats.find(function (c) { return c.slug === catSlug; });
          catStats[catSlug] = { name: catInfo?.name || catSlug, path: catInfo?.path || catSlug, total: 0, withWeight: 0, withDims: 0, complete: 0 };
        }
        catStats[catSlug].total++;
        if (hasWeight) catStats[catSlug].withWeight++;
        if (hasDims) catStats[catSlug].withDims++;
        if (isComplete) catStats[catSlug].complete++;
      }
    }

    // Sort by total descending
    var catList = Object.entries(catStats).map(function (e) { return { slug: e[0], ...e[1] }; });
    catList.sort(function (a, b) { return b.total - a.total; });

    // Brand stats
    var brandStats: Record<string, { total: number; withWeight: number; withDims: number; complete: number }> = {};
    for (var j = 0; j < allProducts.length; j++) {
      var sku2 = allProducts[j].sku;
      var meta2 = metaMap[sku2];
      var pd2 = physicalMap[sku2];
      var brand = meta2?.brand ? meta2.brand.trim().toLowerCase() : "(Sem marca)";
      if (!brandStats[brand]) brandStats[brand] = { total: 0, withWeight: 0, withDims: 0, complete: 0 };
      brandStats[brand].total++;
      if (pd2?.weight && pd2.weight > 0) brandStats[brand].withWeight++;
      if (pd2 && pd2.length > 0 && pd2.width > 0 && pd2.height > 0) brandStats[brand].withDims++;
      if (pd2 && pd2.weight > 0 && pd2.length > 0 && pd2.width > 0 && pd2.height > 0) brandStats[brand].complete++;
    }
    var brandList = Object.entries(brandStats).map(function (e) { return { brand: e[0], ...e[1] }; });
    brandList.sort(function (a, b) { return b.total - a.total; });

    return { categories: catList, uncategorized, brands: brandList };
  }, [allProducts, physicalMap, metaMap, flatCats]);

  // ─── Selection helpers ───
  function toggleSelect(sku: string) {
    setSelected(function (prev) {
      var next = new Set(prev);
      if (next.has(sku)) next.delete(sku); else next.add(sku);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected(function (prev) {
      var next = new Set(prev);
      for (var i = 0; i < filteredProducts.length; i++) next.add(filteredProducts[i].sku);
      return next;
    });
  }

  function selectPageVisible() {
    setSelected(function (prev) {
      var next = new Set(prev);
      for (var i = 0; i < pageProducts.length; i++) next.add(pageProducts[i].sku);
      return next;
    });
  }

  function deselectAll() { setSelected(new Set()); }

  // ─── Inline edit helpers ───
  function getEditValues(sku: string) {
    if (edits[sku]) return edits[sku];
    var pd = physicalMap[sku];
    return {
      weight: pd && pd.weight ? String(pd.weight) : "",
      length: pd && pd.length ? String(pd.length) : "",
      width: pd && pd.width ? String(pd.width) : "",
      height: pd && pd.height ? String(pd.height) : "",
    };
  }

  function setEditField(sku: string, field: string, value: string) {
    setEdits(function (prev) {
      var curr = prev[sku] || getEditValues(sku);
      return { ...prev, [sku]: { ...curr, [field]: value } };
    });
    setDirtySkus(function (prev) { var next = new Set(prev); next.add(sku); return next; });
  }

  // ─── Save inline edits ───
  async function saveInlineEdits() {
    var skusToSave = Array.from(dirtySkus);
    if (skusToSave.length === 0) return;
    setSaving(true); setErrorMsg(""); setSavedMsg("");
    try {
      var token = await getToken();
      var items = skusToSave.map(function (sku) {
        var vals = edits[sku] || getEditValues(sku);
        return { sku, weight: parseFloat(vals.weight) || 0, length: parseFloat(vals.length) || 0, width: parseFloat(vals.width) || 0, height: parseFloat(vals.height) || 0 };
      });
      var res = await api.savePhysicalBulk(token, items);
      setPhysicalMap(function (prev) {
        var next = { ...prev };
        for (var i = 0; i < items.length; i++) next[items[i].sku] = { weight: items[i].weight, length: items[i].length, width: items[i].width, height: items[i].height, updatedAt: Date.now() };
        return next;
      });
      setDirtySkus(new Set());
      setSavedMsg((res?.saved || items.length) + " produto(s) salvo(s)!");
      if (res?.errors?.length) setErrorMsg("Erros: " + res.errors.join(", "));
      setTimeout(function () { setSavedMsg(""); }, 3000);
    } catch (e: any) { setErrorMsg("Erro ao salvar: " + e.message); }
    finally { setSaving(false); }
  }

  // ─── Bulk apply dimensions ───
  async function bulkApplyToSelected() {
    if (selected.size === 0) return;
    var w = parseFloat(bulkWeight) || 0;
    var l = parseFloat(bulkLength) || 0;
    var wi = parseFloat(bulkWidth) || 0;
    var h = parseFloat(bulkHeight) || 0;
    if (w === 0 && l === 0 && wi === 0 && h === 0) { setErrorMsg("Preencha pelo menos um valor."); return; }
    setSaving(true); setErrorMsg(""); setSavedMsg("");
    try {
      var token = await getToken();
      var skuList = Array.from(selected);
      var items = skuList.map(function (sku) {
        var existing = physicalMap[sku] || { weight: 0, length: 0, width: 0, height: 0 };
        return { sku, weight: w > 0 ? w : existing.weight, length: l > 0 ? l : existing.length, width: wi > 0 ? wi : existing.width, height: h > 0 ? h : existing.height };
      });
      var totalSaved = 0;
      for (var batch = 0; batch < items.length; batch += 500) {
        var res = await api.savePhysicalBulk(token, items.slice(batch, batch + 500));
        totalSaved += res?.saved || 0;
      }
      setPhysicalMap(function (prev) {
        var next = { ...prev };
        for (var i = 0; i < items.length; i++) next[items[i].sku] = { weight: items[i].weight, length: items[i].length, width: items[i].width, height: items[i].height, updatedAt: Date.now() };
        return next;
      });
      setEdits(function (prev) { var next = { ...prev }; skuList.forEach(function (s) { delete next[s]; }); return next; });
      setDirtySkus(function (prev) { var next = new Set(prev); skuList.forEach(function (s) { next.delete(s); }); return next; });
      setSavedMsg(totalSaved + " produto(s) atualizados em massa!");
      setTimeout(function () { setSavedMsg(""); }, 3000);
    } catch (e: any) { setErrorMsg("Erro: " + e.message); }
    finally { setSaving(false); }
  }

  // ─── Sync SIGE weight ───
  async function syncSigeForSelected() {
    if (selected.size === 0) return;
    setSyncing(true); setErrorMsg(""); setSavedMsg("");
    try {
      var token = await getToken();
      var skuList = Array.from(selected);
      var allResults: Array<{ sku: string; found: boolean; weight: number; length: number; width: number; height: number }> = [];
      for (var batch = 0; batch < skuList.length; batch += 30) {
        var res = await api.syncSigeWeightBulk(token, skuList.slice(batch, batch + 30));
        allResults = allResults.concat(Array.isArray(res?.results) ? res.results : []);
      }
      var itemsToSave: Array<{ sku: string; weight: number; length: number; width: number; height: number }> = [];
      var foundCount = 0, notFoundCount = 0;
      for (var i = 0; i < allResults.length; i++) {
        var r = allResults[i];
        if (r.found && (r.weight > 0 || r.length > 0)) {
          foundCount++;
          var existing = physicalMap[r.sku] || { weight: 0, length: 0, width: 0, height: 0 };
          itemsToSave.push({ sku: r.sku, weight: r.weight > 0 ? r.weight : existing.weight, length: r.length > 0 ? r.length : existing.length, width: r.width > 0 ? r.width : existing.width, height: r.height > 0 ? r.height : existing.height });
        } else { notFoundCount++; }
      }
      if (itemsToSave.length > 0) {
        for (var b2 = 0; b2 < itemsToSave.length; b2 += 500) {
          await api.savePhysicalBulk(token, itemsToSave.slice(b2, b2 + 500));
        }
        setPhysicalMap(function (prev) {
          var next = { ...prev };
          for (var j = 0; j < itemsToSave.length; j++) next[itemsToSave[j].sku] = { weight: itemsToSave[j].weight, length: itemsToSave[j].length, width: itemsToSave[j].width, height: itemsToSave[j].height, updatedAt: Date.now() };
          return next;
        });
      }
      setSavedMsg("SIGE: " + foundCount + " com dados, " + notFoundCount + " sem dados. " + itemsToSave.length + " salvo(s).");
      setTimeout(function () { setSavedMsg(""); }, 5000);
    } catch (e: any) { setErrorMsg("Erro SIGE: " + e.message); }
    finally { setSyncing(false); }
  }

  // ─── CSV Export ───
  function exportCSV() {
    var rows = [["SKU", "Titulo", "Categoria", "Marca", "Peso (kg)", "Comprimento (cm)", "Largura (cm)", "Altura (cm)", "Status"]];
    var prods = filteredProducts.length > 0 ? filteredProducts : allProducts;
    for (var i = 0; i < prods.length; i++) {
      var p = prods[i];
      var pd = physicalMap[p.sku];
      var meta = metaMap[p.sku];
      var catInfo = meta?.category ? flatCats.find(function (c) { return c.slug === meta!.category; }) : null;
      var complete = pd && pd.weight > 0 && pd.length > 0 && pd.width > 0 && pd.height > 0;
      var partial = pd && (pd.weight > 0 || pd.length > 0 || pd.width > 0 || pd.height > 0);
      rows.push([
        p.sku,
        '"' + (p.titulo || "").replace(/"/g, '""') + '"',
        catInfo?.path || meta?.category || "",
        meta?.brand || "",
        pd?.weight ? String(pd.weight) : "",
        pd?.length ? String(pd.length) : "",
        pd?.width ? String(pd.width) : "",
        pd?.height ? String(pd.height) : "",
        complete ? "Completo" : partial ? "Parcial" : "Sem dados",
      ]);
    }
    var csv = rows.map(function (r) { return r.join(";"); }).join("\n");
    var bom = "\uFEFF";
    var blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "dimensoes_produtos_" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
    URL.revokeObjectURL(url);
    setSavedMsg("CSV exportado com " + (rows.length - 1) + " produto(s)!");
    setTimeout(function () { setSavedMsg(""); }, 3000);
  }

  // ─── CSV Import ───
  async function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
    var file = e.target.files?.[0];
    if (!file) return;
    setImporting(true); setErrorMsg(""); setSavedMsg("");
    try {
      var text = await file.text();
      var lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) { setErrorMsg("CSV vazio ou sem dados."); return; }

      // Parse header to find column indices
      var header = lines[0].split(";").map(function (h) { return removeAccents(h.trim().replace(/"/g, "")); });
      var skuIdx = header.findIndex(function (h) { return h === "sku"; });
      var weightIdx = header.findIndex(function (h) { return h.includes("peso"); });
      var lengthIdx = header.findIndex(function (h) { return h.includes("comprimento") || h.includes("profundidade"); });
      var widthIdx = header.findIndex(function (h) { return h.includes("largura"); });
      var heightIdx = header.findIndex(function (h) { return h.includes("altura"); });

      if (skuIdx < 0) { setErrorMsg("Coluna 'SKU' nao encontrada no CSV. Colunas: " + header.join(", ")); return; }

      var items: Array<{ sku: string; weight: number; length: number; width: number; height: number }> = [];
      var skipped = 0;
      for (var i = 1; i < lines.length; i++) {
        var cols = lines[i].split(";").map(function (c) { return c.trim().replace(/^"|"$/g, ""); });
        var sku = cols[skuIdx]?.trim();
        if (!sku) { skipped++; continue; }
        var w = weightIdx >= 0 ? parseFloat(cols[weightIdx]?.replace(",", ".") || "") || 0 : 0;
        var l = lengthIdx >= 0 ? parseFloat(cols[lengthIdx]?.replace(",", ".") || "") || 0 : 0;
        var wi = widthIdx >= 0 ? parseFloat(cols[widthIdx]?.replace(",", ".") || "") || 0 : 0;
        var h = heightIdx >= 0 ? parseFloat(cols[heightIdx]?.replace(",", ".") || "") || 0 : 0;
        if (w > 0 || l > 0 || wi > 0 || h > 0) {
          // Merge with existing data (don't overwrite with 0 if CSV column is empty)
          var existing = physicalMap[sku] || { weight: 0, length: 0, width: 0, height: 0 };
          items.push({
            sku,
            weight: w > 0 ? w : existing.weight,
            length: l > 0 ? l : existing.length,
            width: wi > 0 ? wi : existing.width,
            height: h > 0 ? h : existing.height,
          });
        } else {
          skipped++;
        }
      }

      if (items.length === 0) { setErrorMsg("Nenhum dado valido encontrado no CSV. " + skipped + " linha(s) ignoradas."); return; }

      var token = await getToken();
      var totalSaved = 0;
      for (var batch = 0; batch < items.length; batch += 500) {
        var res = await api.savePhysicalBulk(token, items.slice(batch, batch + 500));
        totalSaved += res?.saved || 0;
      }
      setPhysicalMap(function (prev) {
        var next = { ...prev };
        for (var j = 0; j < items.length; j++) next[items[j].sku] = { weight: items[j].weight, length: items[j].length, width: items[j].width, height: items[j].height, updatedAt: Date.now() };
        return next;
      });
      setSavedMsg("CSV importado: " + totalSaved + " produto(s) salvos" + (skipped > 0 ? ", " + skipped + " ignorados" : "") + "!");
      setTimeout(function () { setSavedMsg(""); }, 5000);
    } catch (err: any) {
      setErrorMsg("Erro na importacao: " + err.message);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // ─── Render helpers ───
  function isComplete(sku: string): boolean {
    var pd = physicalMap[sku];
    return !!pd && pd.weight > 0 && pd.length > 0 && pd.width > 0 && pd.height > 0;
  }
  function hasPhysicalData(sku: string): boolean {
    var pd = physicalMap[sku];
    return !!pd && (pd.weight > 0 || pd.length > 0 || pd.width > 0 || pd.height > 0);
  }

  var allPageSelected = pageProducts.length > 0 && pageProducts.every(function (p) { return selected.has(p.sku); });
  var somePageSelected = pageProducts.some(function (p) { return selected.has(p.sku); });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
        <p className="text-gray-400 text-sm">{loadingStep || "Carregando..."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-white text-lg font-bold flex items-center gap-2">
            <Ruler className="w-5 h-5 text-blue-400" />
            Dimensoes & Peso dos Produtos
          </h2>
          <p className="text-gray-400 text-xs mt-0.5">Gerencie altura, largura, profundidade e peso para calculo de frete</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {dirtySkus.size > 0 && (
            <button onClick={saveInlineEdits} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar {dirtySkus.size} alteracao(oes)
            </button>
          )}
        </div>
      </div>

      {/* ── Sub-tabs ── */}
      <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1 w-fit">
        {([
          { id: "editor" as SubTab, label: "Editor", icon: Ruler },
          { id: "report" as SubTab, label: "Relatorio de Cobertura", icon: BarChart3 },
        ]).map(function (t) {
          return (
            <button
              key={t.id}
              onClick={function () { setSubTab(t.id); }}
              className={"flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors " + (subTab === t.id ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-700")}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Stats cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <StatCard label="Total" value={stats.total} color="gray" />
        <StatCard label="Com dados" value={stats.withData} color="green" />
        <StatCard label="Sem dados" value={stats.withoutData} color="red" />
        <StatCard label="Com peso" value={stats.withWeight} color="blue" />
        <StatCard label="Completos" value={stats.withDims} color="purple" subtitle="(L x A x P + peso)" />
      </div>

      {/* ── Messages ── */}
      {savedMsg && (
        <div className="flex items-center gap-2 px-3 py-2 bg-green-900/30 border border-green-700/50 rounded-lg text-green-400 text-sm">
          <Check className="w-4 h-4 shrink-0" /> {savedMsg}
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-900/30 border border-red-700/50 rounded-lg text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {errorMsg}
          <button onClick={function () { setErrorMsg(""); }} className="ml-auto text-red-400 hover:text-red-300"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* ═══════════════════════ COVERAGE REPORT TAB ═══════════════════════ */}
      {subTab === "report" && (
        <div className="space-y-5">
          {/* Global coverage bar */}
          <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-4">
            <h3 className="text-white text-sm font-bold mb-3">Cobertura Global</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <CoverageBar label="Com peso" current={stats.withWeight} total={stats.total} color="blue" />
              <CoverageBar label="Com dimensoes (L x A x P)" current={stats.withDims} total={stats.total} color="purple" />
              <CoverageBar label="Completos (peso + dimensoes)" current={stats.withData} total={stats.total} color="green" />
            </div>
          </div>

          {/* Per-category coverage */}
          <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-4">
            <h3 className="text-white text-sm font-bold mb-3 flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-yellow-400" />
              Cobertura por Categoria
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-700">
                    <th className="text-left py-2 pr-3 font-semibold">Categoria</th>
                    <th className="text-center py-2 px-2 font-semibold">Total</th>
                    <th className="text-center py-2 px-2 font-semibold">Com Peso</th>
                    <th className="text-center py-2 px-2 font-semibold">Com Dim.</th>
                    <th className="text-center py-2 px-2 font-semibold">Completos</th>
                    <th className="text-left py-2 px-2 font-semibold min-w-[140px]">Cobertura</th>
                    <th className="text-center py-2 px-1 font-semibold">Acao</th>
                  </tr>
                </thead>
                <tbody>
                  {coverageData.categories.map(function (cat) {
                    var pct = cat.total > 0 ? Math.round((cat.complete / cat.total) * 100) : 0;
                    var barColor = pct >= 80 ? "bg-green-500" : pct >= 40 ? "bg-yellow-500" : pct > 0 ? "bg-orange-500" : "bg-red-500/50";
                    return (
                      <tr key={cat.slug} className="border-b border-gray-700/40 hover:bg-gray-700/20">
                        <td className="py-2 pr-3 text-white font-medium max-w-[250px] truncate" title={cat.path}>{cat.path}</td>
                        <td className="text-center py-2 px-2 text-gray-300 tabular-nums">{cat.total}</td>
                        <td className="text-center py-2 px-2 text-blue-400 tabular-nums">{cat.withWeight}</td>
                        <td className="text-center py-2 px-2 text-purple-400 tabular-nums">{cat.withDims}</td>
                        <td className="text-center py-2 px-2 text-green-400 tabular-nums">{cat.complete}</td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                              <div className={"h-full rounded-full transition-all " + barColor} style={{ width: pct + "%" }} />
                            </div>
                            <span className={"tabular-nums font-semibold shrink-0 " + (pct >= 80 ? "text-green-400" : pct >= 40 ? "text-yellow-400" : "text-red-400")}>{pct}%</span>
                          </div>
                        </td>
                        <td className="text-center py-2 px-1">
                          <button
                            onClick={function () { setCategoryFilter(cat.slug); setStatusFilter("without-data"); setSubTab("editor"); setPage(1); }}
                            className="text-blue-400 hover:text-blue-300 text-[10px] underline"
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {/* Uncategorized row */}
                  {coverageData.uncategorized.total > 0 && (
                    <tr className="border-b border-gray-700/40 hover:bg-gray-700/20">
                      <td className="py-2 pr-3 text-gray-500 italic">Sem categoria</td>
                      <td className="text-center py-2 px-2 text-gray-400 tabular-nums">{coverageData.uncategorized.total}</td>
                      <td className="text-center py-2 px-2 text-blue-400/60 tabular-nums">{coverageData.uncategorized.withWeight}</td>
                      <td className="text-center py-2 px-2 text-purple-400/60 tabular-nums">{coverageData.uncategorized.withDims}</td>
                      <td className="text-center py-2 px-2 text-green-400/60 tabular-nums">{coverageData.uncategorized.complete}</td>
                      <td className="py-2 px-2">
                        {(function () {
                          var pct = coverageData.uncategorized.total > 0 ? Math.round((coverageData.uncategorized.complete / coverageData.uncategorized.total) * 100) : 0;
                          return (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                                <div className={"h-full rounded-full bg-gray-500"} style={{ width: pct + "%" }} />
                              </div>
                              <span className="tabular-nums font-semibold text-gray-500 shrink-0">{pct}%</span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="text-center py-2 px-1">
                        <button
                          onClick={function () { setCategoryFilter("__uncategorized__"); setStatusFilter("without-data"); setSubTab("editor"); setPage(1); }}
                          className="text-blue-400 hover:text-blue-300 text-[10px] underline"
                        >Editar</button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Per-brand coverage */}
          <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-4">
            <h3 className="text-white text-sm font-bold mb-3 flex items-center gap-2">
              <Tag className="w-4 h-4 text-orange-400" />
              Cobertura por Marca
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-700">
                    <th className="text-left py-2 pr-3 font-semibold">Marca</th>
                    <th className="text-center py-2 px-2 font-semibold">Total</th>
                    <th className="text-center py-2 px-2 font-semibold">Com Peso</th>
                    <th className="text-center py-2 px-2 font-semibold">Completos</th>
                    <th className="text-left py-2 px-2 font-semibold min-w-[140px]">Cobertura</th>
                    <th className="text-center py-2 px-1 font-semibold">Acao</th>
                  </tr>
                </thead>
                <tbody>
                  {coverageData.brands.map(function (b) {
                    var pct = b.total > 0 ? Math.round((b.complete / b.total) * 100) : 0;
                    var barColor = pct >= 80 ? "bg-green-500" : pct >= 40 ? "bg-yellow-500" : pct > 0 ? "bg-orange-500" : "bg-red-500/50";
                    return (
                      <tr key={b.brand} className="border-b border-gray-700/40 hover:bg-gray-700/20">
                        <td className="py-2 pr-3 text-white font-medium capitalize">{b.brand}</td>
                        <td className="text-center py-2 px-2 text-gray-300 tabular-nums">{b.total}</td>
                        <td className="text-center py-2 px-2 text-blue-400 tabular-nums">{b.withWeight}</td>
                        <td className="text-center py-2 px-2 text-green-400 tabular-nums">{b.complete}</td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                              <div className={"h-full rounded-full transition-all " + barColor} style={{ width: pct + "%" }} />
                            </div>
                            <span className={"tabular-nums font-semibold shrink-0 " + (pct >= 80 ? "text-green-400" : pct >= 40 ? "text-yellow-400" : "text-red-400")}>{pct}%</span>
                          </div>
                        </td>
                        <td className="text-center py-2 px-1">
                          <button
                            onClick={function () {
                              setBrandFilter(b.brand === "(Sem marca)" ? "__all__" : b.brand);
                              setStatusFilter("without-data");
                              setSubTab("editor");
                              setPage(1);
                            }}
                            className="text-blue-400 hover:text-blue-300 text-[10px] underline"
                          >Editar</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════ EDITOR TAB ═══════════════════════ */}
      {subTab === "editor" && (
        <>
          {/* ── Search & Filters ── */}
          <div className="flex flex-col gap-2">
            <div className="flex flex-col md:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  ref={searchRef}
                  type="text"
                  value={searchTerm}
                  onChange={function (e) { setSearchTerm(e.target.value); }}
                  placeholder="Buscar por nome ou SKU... (ex: roda, amortecedor, filtro)"
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                />
                {searchTerm && (
                  <button onClick={function () { setSearchTerm(""); searchRef.current?.focus(); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* CSV buttons */}
                <button onClick={exportCSV} className="flex items-center gap-1 px-3 py-2 bg-gray-800 border border-gray-700 text-gray-300 text-xs font-medium rounded-lg hover:bg-gray-700 transition-colors">
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Exportar CSV
                </button>
                <button
                  onClick={function () { fileInputRef.current?.click(); }}
                  disabled={importing}
                  className="flex items-center gap-1 px-3 py-2 bg-gray-800 border border-gray-700 text-gray-300 text-xs font-medium rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Importar CSV
                </button>
                <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleCSVImport} />
              </div>
            </div>

            {/* Filters row */}
            <div className="flex flex-col md:flex-row gap-2">
              {/* Status filter */}
              <div className="flex items-center bg-gray-800 border border-gray-700 rounded-lg overflow-hidden shrink-0">
                {(["all", "without-data", "with-data", "complete", "partial"] as StatusFilter[]).map(function (f) {
                  var labels: Record<StatusFilter, string> = { all: "Todos", "without-data": "Sem dados", "with-data": "Com dados", complete: "Completos", partial: "Parciais" };
                  return (
                    <button key={f} onClick={function () { setStatusFilter(f); setPage(1); }}
                      className={"px-2.5 py-2 text-[11px] font-medium transition-colors whitespace-nowrap " + (statusFilter === f ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-700")}
                    >{labels[f]}</button>
                  );
                })}
              </div>

              {/* Category filter */}
              <div className="relative flex-1 min-w-[180px]">
                <FolderOpen className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
                <select
                  value={categoryFilter}
                  onChange={function (e) { setCategoryFilter(e.target.value); setPage(1); }}
                  className="w-full pl-8 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs appearance-none focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="__all__">Todas as categorias</option>
                  <option value="__uncategorized__">Sem categoria</option>
                  {flatCats.map(function (c, idx) {
                    return <option key={c.slug + "--" + idx} value={c.slug}>{c.path}</option>;
                  })}
                </select>
              </div>

              {/* Brand filter */}
              <div className="relative flex-1 min-w-[150px]">
                <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
                <select
                  value={brandFilter}
                  onChange={function (e) { setBrandFilter(e.target.value); setPage(1); }}
                  className="w-full pl-8 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs appearance-none focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="__all__">Todas as marcas</option>
                  {brands.map(function (b) { return <option key={b} value={b}>{b.charAt(0).toUpperCase() + b.slice(1)}</option>; })}
                </select>
              </div>

              {/* Clear filters */}
              {(categoryFilter !== "__all__" || brandFilter !== "__all__" || statusFilter !== "all") && (
                <button
                  onClick={function () { setCategoryFilter("__all__"); setBrandFilter("__all__"); setStatusFilter("all"); setPage(1); }}
                  className="flex items-center gap-1 px-3 py-2 bg-gray-700 text-gray-400 text-xs rounded-lg hover:bg-gray-600 hover:text-white transition-colors shrink-0"
                >
                  <X className="w-3 h-3" /> Limpar filtros
                </button>
              )}
            </div>
          </div>

          {/* ── Selection bar ── */}
          {selected.size > 0 && (
            <div className="flex flex-col md:flex-row items-start md:items-center gap-2 px-3 py-2.5 bg-blue-900/20 border border-blue-700/40 rounded-lg">
              <div className="flex items-center gap-2 text-blue-300 text-sm font-medium">
                <CheckSquare className="w-4 h-4" />
                {selected.size} selecionado(s)
              </div>
              <div className="flex items-center gap-2 flex-wrap md:ml-auto">
                <button onClick={function () { setBulkPanelOpen(!bulkPanelOpen); }}
                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md transition-colors">
                  <Ruler className="w-3.5 h-3.5" /> Aplicar Medidas
                  {bulkPanelOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
                <button onClick={syncSigeForSelected} disabled={syncing}
                  className="flex items-center gap-1 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-md transition-colors disabled:opacity-50">
                  {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  Sincronizar Peso SIGE
                </button>
                <button onClick={deselectAll}
                  className="flex items-center gap-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-medium rounded-md transition-colors">
                  <X className="w-3.5 h-3.5" /> Limpar
                </button>
              </div>
            </div>
          )}

          {/* ── Bulk panel ── */}
          {bulkPanelOpen && selected.size > 0 && (
            <div className="px-4 py-3 bg-gray-800/80 border border-blue-700/30 rounded-lg space-y-3">
              <p className="text-blue-300 text-xs font-semibold flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" /> Aplicar em massa para {selected.size} produto(s)
              </p>
              <p className="text-gray-500 text-[10px]">Campos vazios manterao o valor atual de cada produto.</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-gray-400 text-xs mb-1 block">Peso (kg)</label>
                  <input type="number" step="0.001" min="0" value={bulkWeight} onChange={function (e) { setBulkWeight(e.target.value); }}
                    placeholder="0.000" className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="text-gray-400 text-xs mb-1 block">Comprimento (cm)</label>
                  <input type="number" step="0.1" min="0" value={bulkLength} onChange={function (e) { setBulkLength(e.target.value); }}
                    placeholder="0.0" className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="text-gray-400 text-xs mb-1 block">Largura (cm)</label>
                  <input type="number" step="0.1" min="0" value={bulkWidth} onChange={function (e) { setBulkWidth(e.target.value); }}
                    placeholder="0.0" className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="text-gray-400 text-xs mb-1 block">Altura (cm)</label>
                  <input type="number" step="0.1" min="0" value={bulkHeight} onChange={function (e) { setBulkHeight(e.target.value); }}
                    placeholder="0.0" className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={function () { setBulkPanelOpen(false); }} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-md transition-colors">Cancelar</button>
                <button onClick={bulkApplyToSelected} disabled={saving}
                  className="flex items-center gap-1 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md transition-colors disabled:opacity-50">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                  Aplicar para {selected.size}
                </button>
              </div>
            </div>
          )}

          {/* ── Results info ── */}
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{filteredProducts.length} produto(s) encontrado(s)</span>
            <span>Pagina {currentPage} de {totalPages}</span>
          </div>

          {/* ── Product table ── */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[36px_minmax(0,2fr)_80px_80px_80px_80px_50px] md:grid-cols-[40px_minmax(0,2fr)_1fr_1fr_1fr_1fr_60px] gap-1 md:gap-2 px-2 md:px-3 py-2 bg-gray-800 border-b border-gray-700 text-[10px] md:text-xs text-gray-400 font-semibold items-center">
              <div className="flex items-center justify-center">
                <button onClick={function () {
                  if (allPageSelected) {
                    setSelected(function (prev) { var next = new Set(prev); pageProducts.forEach(function (p) { next.delete(p.sku); }); return next; });
                  } else { selectPageVisible(); }
                }} className="text-gray-400 hover:text-white">
                  {allPageSelected ? <CheckSquare className="w-4 h-4 text-blue-400" /> : somePageSelected ? <MinusSquare className="w-4 h-4 text-blue-400/50" /> : <Square className="w-4 h-4" />}
                </button>
              </div>
              <div>Produto</div>
              <div className="text-center">Peso (kg)</div>
              <div className="text-center">Comp. (cm)</div>
              <div className="text-center">Larg. (cm)</div>
              <div className="text-center">Alt. (cm)</div>
              <div className="text-center">Status</div>
            </div>

            {/* Table body */}
            {pageProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Package className="w-8 h-8 text-gray-600" />
                <p className="text-gray-500 text-sm">
                  {debouncedSearch ? 'Nenhum produto encontrado para "' + debouncedSearch + '"' : "Nenhum produto com os filtros selecionados"}
                </p>
              </div>
            ) : (
              pageProducts.map(function (product) {
                var isSel = selected.has(product.sku);
                var vals = getEditValues(product.sku);
                var isDirty = dirtySkus.has(product.sku);
                var complete = isComplete(product.sku);
                var partial = hasPhysicalData(product.sku) && !complete;
                var meta = metaMap[product.sku];

                return (
                  <div
                    key={product.sku}
                    className={"grid grid-cols-[36px_minmax(0,2fr)_80px_80px_80px_80px_50px] md:grid-cols-[40px_minmax(0,2fr)_1fr_1fr_1fr_1fr_60px] gap-1 md:gap-2 px-2 md:px-3 py-1.5 border-b border-gray-700/50 items-center hover:bg-gray-700/30 transition-colors " + (isSel ? "bg-blue-900/10 " : "") + (isDirty ? "ring-1 ring-yellow-500/30 " : "")}
                  >
                    <div className="flex items-center justify-center">
                      <button onClick={function () { toggleSelect(product.sku); }} className="text-gray-400 hover:text-white">
                        {isSel ? <CheckSquare className="w-4 h-4 text-blue-400" /> : <Square className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded bg-gray-700 overflow-hidden shrink-0">
                        <ProductImage sku={product.sku} className="w-full h-full object-cover" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-white text-xs font-medium truncate">{product.titulo || product.sku}</p>
                        <div className="flex items-center gap-1.5">
                          <p className="text-gray-500 text-[10px] font-mono truncate">{product.sku}</p>
                          {meta?.category && (
                            <span className="text-[9px] px-1 py-0 bg-gray-700 text-gray-400 rounded truncate max-w-[100px]" title={meta.category}>
                              {flatCats.find(function (c) { return c.slug === meta!.category; })?.name || meta.category}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="px-0.5">
                      <input type="number" step="0.001" min="0" value={vals.weight}
                        onChange={function (e) { setEditField(product.sku, "weight", e.target.value); }}
                        placeholder="0"
                        className="w-full px-1.5 py-1 bg-gray-900 border border-gray-600 rounded text-white text-xs text-center focus:border-blue-500 focus:outline-none tabular-nums" />
                    </div>
                    <div className="px-0.5">
                      <input type="number" step="0.1" min="0" value={vals.length}
                        onChange={function (e) { setEditField(product.sku, "length", e.target.value); }}
                        placeholder="0"
                        className="w-full px-1.5 py-1 bg-gray-900 border border-gray-600 rounded text-white text-xs text-center focus:border-blue-500 focus:outline-none tabular-nums" />
                    </div>
                    <div className="px-0.5">
                      <input type="number" step="0.1" min="0" value={vals.width}
                        onChange={function (e) { setEditField(product.sku, "width", e.target.value); }}
                        placeholder="0"
                        className="w-full px-1.5 py-1 bg-gray-900 border border-gray-600 rounded text-white text-xs text-center focus:border-blue-500 focus:outline-none tabular-nums" />
                    </div>
                    <div className="px-0.5">
                      <input type="number" step="0.1" min="0" value={vals.height}
                        onChange={function (e) { setEditField(product.sku, "height", e.target.value); }}
                        placeholder="0"
                        className="w-full px-1.5 py-1 bg-gray-900 border border-gray-600 rounded text-white text-xs text-center focus:border-blue-500 focus:outline-none tabular-nums" />
                    </div>
                    <div className="flex items-center justify-center">
                      {isDirty ? (
                        <span className="w-5 h-5 rounded-full bg-yellow-500/20 flex items-center justify-center" title="Nao salvo"><span className="w-2 h-2 rounded-full bg-yellow-400" /></span>
                      ) : complete ? (
                        <span className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center" title="Completo"><Check className="w-3 h-3 text-green-400" /></span>
                      ) : partial ? (
                        <span className="w-5 h-5 rounded-full bg-orange-500/20 flex items-center justify-center" title="Parcial"><span className="w-2 h-2 rounded-full bg-orange-400" /></span>
                      ) : (
                        <span className="w-5 h-5 rounded-full bg-gray-600/30 flex items-center justify-center" title="Sem dados"><span className="w-2 h-2 rounded-full bg-gray-500" /></span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <button onClick={function () { setPage(Math.max(1, currentPage - 1)); }} disabled={currentPage <= 1}
                className="px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-md hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Anterior</button>
              {generatePageNumbers(currentPage, totalPages).map(function (p, idx) {
                if (p === -1) return <span key={"dots-" + idx} className="text-gray-600 text-xs">...</span>;
                return (
                  <button key={p} onClick={function () { setPage(p); }}
                    className={"px-2.5 py-1.5 text-xs rounded-md border transition-colors " + (p === currentPage ? "bg-blue-600 border-blue-600 text-white" : "bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700")}
                  >{p}</button>
                );
              })}
              <button onClick={function () { setPage(Math.min(totalPages, currentPage + 1)); }} disabled={currentPage >= totalPages}
                className="px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-md hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Proximo</button>
              {filteredProducts.length > PAGE_SIZE && (
                <button onClick={selectAllVisible}
                  className="ml-4 flex items-center gap-1 px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-400 text-xs rounded-md hover:bg-gray-700 hover:text-white transition-colors">
                  <CheckSquare className="w-3 h-3" /> Selecionar todos {filteredProducts.length}
                </button>
              )}
            </div>
          )}

          {/* ── Help ── */}
          <div className="px-3 py-2 bg-gray-800/30 border border-gray-700/50 rounded-lg text-gray-500 text-xs space-y-1">
            <p className="font-semibold text-gray-400 flex items-center gap-1"><Info className="w-3 h-3" /> Dicas</p>
            <ul className="list-disc list-inside space-y-0.5 ml-1">
              <li>Use a busca para encontrar produtos (ex: "roda", "amortecedor", "filtro oleo")</li>
              <li>Filtre por categoria ou marca para segmentar produtos semelhantes</li>
              <li><strong>Exportar CSV</strong>: baixa planilha com todos os dados dos filtros atuais</li>
              <li><strong>Importar CSV</strong>: preencha peso/dimensoes na planilha e reimporte (colunas: SKU, Peso, Comprimento, Largura, Altura)</li>
              <li>"Sincronizar Peso SIGE" busca peso e dimensoes do ERP para os selecionados</li>
              <li>Veja o <strong>Relatorio de Cobertura</strong> para identificar categorias com dados faltantes</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Coverage bar component ───
function CoverageBar({ label, current, total, color }: { label: string; current: number; total: number; color: string }) {
  var pct = total > 0 ? Math.round((current / total) * 100) : 0;
  var colors: Record<string, string> = { blue: "bg-blue-500", purple: "bg-purple-500", green: "bg-green-500" };
  var textColors: Record<string, string> = { blue: "text-blue-400", purple: "text-purple-400", green: "text-green-400" };
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-gray-400 text-xs">{label}</span>
        <span className={(textColors[color] || "text-white") + " text-xs font-bold tabular-nums"}>{current.toLocaleString("pt-BR")} / {total.toLocaleString("pt-BR")} ({pct}%)</span>
      </div>
      <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
        <div className={"h-full rounded-full transition-all duration-500 " + (colors[color] || "bg-white")} style={{ width: pct + "%" }} />
      </div>
    </div>
  );
}

// ─── Stat card component ───
function StatCard({ label, value, color, subtitle }: { label: string; value: number; color: string; subtitle?: string }) {
  var colorMap: Record<string, string> = {
    gray: "bg-gray-800 border-gray-700 text-gray-300",
    green: "bg-green-900/20 border-green-700/40 text-green-400",
    red: "bg-red-900/20 border-red-700/40 text-red-400",
    blue: "bg-blue-900/20 border-blue-700/40 text-blue-400",
    purple: "bg-purple-900/20 border-purple-700/40 text-purple-400",
  };
  return (
    <div className={"px-3 py-2 rounded-lg border " + (colorMap[color] || colorMap.gray)}>
      <p className="text-2xl font-bold tabular-nums">{value.toLocaleString("pt-BR")}</p>
      <p className="text-xs opacity-70">{label}</p>
      {subtitle && <p className="text-[10px] opacity-50">{subtitle}</p>}
    </div>
  );
}

// ─── Page number generator ───
function generatePageNumbers(current: number, total: number): number[] {
  if (total <= 7) { var arr: number[] = []; for (var i = 1; i <= total; i++) arr.push(i); return arr; }
  var pages: number[] = [1];
  if (current > 3) pages.push(-1);
  var start = Math.max(2, current - 1);
  var end = Math.min(total - 1, current + 1);
  for (var j = start; j <= end; j++) pages.push(j);
  if (current < total - 2) pages.push(-1);
  pages.push(total);
  return pages;
}
