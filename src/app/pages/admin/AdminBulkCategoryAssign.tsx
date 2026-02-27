import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import React from "react";
import {
  Search,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  FolderTree,
  FolderOpen,
  Folder,
  Package,
  Check,
  X,
  Filter,
  ArrowRight,
  CheckSquare,
  Square,
  MinusSquare,
  RotateCcw,
  ChevronLeft,
  ListChecks,
  Layers,
  RefreshCw,
  Zap,
  Info,
  Tag,
  Plus,
  Trash2,
  AlertTriangle,
  Play,
  ClipboardList,
  Image,
  FolderPlus,
} from "lucide-react";
import * as api from "../../services/api";
import type { CategoryNode, AutoCategData } from "../../services/api";
import { supabase } from "../../services/supabaseClient";
import { getValidAdminToken } from "./adminAuth";
import { ProductImage } from "../../components/ProductImage";

// ─── Types ───

interface ProductRow {
  sku: string;
  titulo: string;
  currentCategory: string;
  currentCategoryName: string;
  visible: boolean;
}

interface QueueItem {
  id: string;
  skus: string[];
  categorySlug: string;
  categoryName: string;
  categoryPath: string;
}

interface ConfirmModalData {
  type: "direct" | "queue";
  totalProducts: number;
  overwriteCount: number;
  entries: Array<{ categoryName: string; count: number }>;
}

type CategoryFilter = "__all__" | "__uncategorized__" | string;

const CONFIRM_THRESHOLD = 50;
const PAGE_SIZE = 30;

// ─── Helper: remove accents for search matching ───
function removeAccents(str: string): string {
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// ─── Helper: find category name by slug in tree ───
function findCategoryName(nodes: CategoryNode[], slug: string): string {
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    if (n.slug === slug) return n.name;
    if (n.children) {
      var found = findCategoryName(n.children, slug);
      if (found) return found;
    }
  }
  return "";
}

// ─── Helper: find full category path by slug (e.g. "Motor > Filtros > Oleo") ───
function findCategoryFullPath(nodes: CategoryNode[], slug: string, path?: string[]): string {
  if (!path) path = [];
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    var currentPath = path.concat([n.name]);
    if (n.slug === slug) return currentPath.join(" > ");
    if (n.children) {
      var found = findCategoryFullPath(n.children, slug, currentPath);
      if (found) return found;
    }
  }
  return "";
}

// ─── Helper: generate slug from name ───
function generateSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ─── Helper: check if slug exists in tree ───
function slugExistsInTree(nodes: CategoryNode[], slug: string): boolean {
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i].slug === slug) return true;
    if (nodes[i].children && slugExistsInTree(nodes[i].children!, slug)) return true;
  }
  return false;
}

// ─── Helper: insert child into tree at parent slug ───
function insertChildInTree(nodes: CategoryNode[], parentSlug: string, child: CategoryNode): CategoryNode[] {
  var result: CategoryNode[] = [];
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    if (n.slug === parentSlug) {
      var children = n.children ? n.children.slice() : [];
      children.push(child);
      result.push({ ...n, children: children });
    } else if (n.children) {
      result.push({ ...n, children: insertChildInTree(n.children, parentSlug, child) });
    } else {
      result.push(n);
    }
  }
  return result;
}

// ─── Helper: flatten tree for parent selection dropdown ───
function flattenTreeForSelect(nodes: CategoryNode[], depth?: number, parentPath?: string, seen?: Set<string>): Array<{ slug: string; name: string; depth: number; uniqueKey: string }> {
  if (!depth) depth = 0;
  if (!parentPath) parentPath = "";
  if (!seen) seen = new Set<string>();
  var result: Array<{ slug: string; name: string; depth: number; uniqueKey: string }> = [];
  for (var i = 0; i < nodes.length; i++) {
    var nodeSlug = nodes[i].slug;
    // Skip duplicates — same slug already seen at another branch
    if (seen.has(nodeSlug)) continue;
    seen.add(nodeSlug);
    var uKey = parentPath ? parentPath + "/" + nodeSlug : nodeSlug;
    result.push({ slug: nodeSlug, name: nodes[i].name, depth: depth, uniqueKey: uKey });
    if (nodes[i].children) {
      var childEntries = flattenTreeForSelect(nodes[i].children!, depth + 1, uKey, seen);
      for (var j = 0; j < childEntries.length; j++) {
        result.push(childEntries[j]);
      }
    }
  }
  return result;
}

// ═══════════════════════════════
// ─── MAIN COMPONENT ──────────
// ═══════════════════════════════

export function AdminBulkCategoryAssign() {
  // ─── State: data ───
  const [loading, setLoading] = useState(true);
  const [allProducts, setAllProducts] = useState<ProductRow[]>([]);
  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);
  const [error, setError] = useState<string | null>(null);

  // ─── State: product filtering & pagination ───
  const [searchQ, setSearchQ] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("__all__");
  const [page, setPage] = useState(1);

  // ─── State: selection ───
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // ─── State: target category ───
  const [targetCategorySlug, setTargetCategorySlug] = useState<string | null>(null);
  const [treeExpanded, setTreeExpanded] = useState<Set<string>>(new Set());
  const [treeSearchQ, setTreeSearchQ] = useState("");

  // ─── State: apply ───
  const [applying, setApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState(0);
  const [applyTotal, setApplyTotal] = useState(0);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // ─── State: filter dropdown ───
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  // ─── State: queue (multi-category sequential allocation) ───
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueExpanded, setQueueExpanded] = useState(true);

  // ─── State: confirmation modal ───
  const [confirmModal, setConfirmModal] = useState<ConfirmModalData | null>(null);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);

  // ─── State: inline category creation ───
  const [showCreateCat, setShowCreateCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatParent, setNewCatParent] = useState<string>("__root__");
  const [creatingSavingCat, setCreatingSavingCat] = useState(false);
  const [createCatError, setCreateCatError] = useState("");

  // ─── Debounce search ───
  useEffect(() => {
    var timer = setTimeout(function () {
      setDebouncedSearch(searchQ);
      setPage(1);
    }, 300);
    return function () { clearTimeout(timer); };
  }, [searchQ]);

  // ─── Close dropdown on outside click ───
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setFilterDropdownOpen(false);
      }
    }
    if (filterDropdownOpen) {
      document.addEventListener("mousedown", handleClick);
      return function () { document.removeEventListener("mousedown", handleClick); };
    }
  }, [filterDropdownOpen]);

  // ─── Toast auto-dismiss ───
  useEffect(() => {
    if (!toast) return;
    var t = setTimeout(function () { setToast(null); }, 5000);
    return function () { clearTimeout(t); };
  }, [toast]);

  // ─── Load data ───
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      var token = await getValidAdminToken();
      if (!token) {
        setError("Sessao expirada. Faca login novamente.");
        setLoading(false);
        return;
      }
      var data: AutoCategData = await api.getAutoCategData(token);

      var tree = data.categoryTree || [];
      setCategoryTree(tree);

      var rows: ProductRow[] = [];
      for (var i = 0; i < data.products.length; i++) {
        var p = data.products[i];
        var meta = data.metas[p.sku];
        var catSlug = (meta && meta.category) ? meta.category : "";
        var catName = catSlug ? findCategoryName(tree, catSlug) : "";
        rows.push({
          sku: p.sku,
          titulo: p.titulo || p.sku,
          currentCategory: catSlug,
          currentCategoryName: catName || catSlug,
          visible: meta ? meta.visible !== false : true,
        });
      }
      setAllProducts(rows);
      setSelected(new Set());
    } catch (e: any) {
      console.error("Erro ao carregar dados:", e);
      setError("Erro ao carregar dados: " + (e.message || String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Filtered products ───
  const filtered = useMemo(() => {
    var result = allProducts;

    // Category filter
    if (categoryFilter === "__uncategorized__") {
      result = result.filter(function (p) { return !p.currentCategory; });
    } else if (categoryFilter !== "__all__") {
      result = result.filter(function (p) { return p.currentCategory === categoryFilter; });
    }

    // Search filter — multi-word AND: all terms must match in SKU, title, or category name
    if (debouncedSearch.trim()) {
      var terms = debouncedSearch.trim().split(/\s+/).map(function (t) { return removeAccents(t); }).filter(function (t) { return t.length > 0; });
      if (terms.length > 0) {
        result = result.filter(function (p) {
          var skuNorm = removeAccents(p.sku);
          var tituloNorm = removeAccents(p.titulo);
          var catNorm = removeAccents(p.currentCategoryName);
          for (var ti = 0; ti < terms.length; ti++) {
            var term = terms[ti];
            if (skuNorm.indexOf(term) < 0 && tituloNorm.indexOf(term) < 0 && catNorm.indexOf(term) < 0) {
              return false;
            }
          }
          return true;
        });
      }
    }

    return result;
  }, [allProducts, categoryFilter, debouncedSearch]);

  // ─── Pagination ───
  var totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  var currentPage = Math.min(page, totalPages);
  var pageProducts = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // ─── Selection helpers ───
  var allOnPageSelected = pageProducts.length > 0 && pageProducts.every(function (p) { return selected.has(p.sku); });
  var someOnPageSelected = pageProducts.some(function (p) { return selected.has(p.sku); });

  function toggleSelect(sku: string) {
    setSelected(function (prev) {
      var next = new Set(prev);
      if (next.has(sku)) {
        next.delete(sku);
      } else {
        next.add(sku);
      }
      return next;
    });
  }

  function toggleSelectPage() {
    if (allOnPageSelected) {
      // Deselect page
      setSelected(function (prev) {
        var next = new Set(prev);
        for (var i = 0; i < pageProducts.length; i++) {
          next.delete(pageProducts[i].sku);
        }
        return next;
      });
    } else {
      // Select page
      setSelected(function (prev) {
        var next = new Set(prev);
        for (var i = 0; i < pageProducts.length; i++) {
          next.add(pageProducts[i].sku);
        }
        return next;
      });
    }
  }

  function selectAllFiltered() {
    setSelected(function (prev) {
      var next = new Set(prev);
      for (var i = 0; i < filtered.length; i++) {
        next.add(filtered[i].sku);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  // ─── Category tree helpers ───
  function toggleTreeNode(id: string) {
    setTreeExpanded(function (prev) {
      var next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function expandAllTree() {
    var ids = new Set<string>();
    function walk(nodes: CategoryNode[]) {
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].children && nodes[i].children!.length > 0) {
          ids.add(nodes[i].id);
          walk(nodes[i].children!);
        }
      }
    }
    walk(categoryTree);
    setTreeExpanded(ids);
  }

  function collapseAllTree() {
    setTreeExpanded(new Set());
  }

  var targetCategoryName = targetCategorySlug ? findCategoryName(categoryTree, targetCategorySlug) : "";
  var targetCategoryPath = targetCategorySlug ? findCategoryFullPath(categoryTree, targetCategorySlug) : "";

  // ─── Check if tree node matches search ───
  function nodeMatchesSearch(node: CategoryNode, q: string): boolean {
    var norm = removeAccents(q.trim());
    if (!norm) return true;
    var nameNorm = removeAccents(node.name);
    if (nameNorm.indexOf(norm) >= 0) return true;
    if (node.children) {
      for (var i = 0; i < node.children.length; i++) {
        if (nodeMatchesSearch(node.children[i], q)) return true;
      }
    }
    return false;
  }

  // ─── Apply bulk assignment ───

  // ─── Count products with existing categories (for overwrite warning) ───
  function countOverwrites(skuList: string[]): number {
    var count = 0;
    for (var i = 0; i < skuList.length; i++) {
      var p = allProducts.find(function (pr) { return pr.sku === skuList[i]; });
      if (p && p.currentCategory) count++;
    }
    return count;
  }

  // ─── Core batch apply logic (shared by direct + queue) ───
  async function executeBatchAssign(
    assignments: Array<{ sku: string; category: string }>
  ): Promise<{ applied: number; errors: string[] }> {
    var token = await getValidAdminToken();
    if (!token) {
      throw new Error("Sessao expirada.");
    }

    var batchSize = 100;
    var totalApplied = 0;
    var totalErrors: string[] = [];

    for (var bStart = 0; bStart < assignments.length; bStart += batchSize) {
      var batch = assignments.slice(bStart, bStart + batchSize);
      var result = await api.applyAutoCateg(token, batch);
      totalApplied += result.applied || 0;
      if (result.errors && result.errors.length > 0) {
        for (var ei = 0; ei < result.errors.length; ei++) {
          totalErrors.push(result.errors[ei]);
        }
      }
      setApplyProgress(function (prev) { return prev + batch.length; });
    }
    return { applied: totalApplied, errors: totalErrors };
  }

  // ─── Direct apply (with confirmation for large operations) ───
  function handleApplyClick() {
    if (selected.size === 0 || !targetCategorySlug) return;

    var skuArr: string[] = [];
    selected.forEach(function (s) { skuArr.push(s); });
    var overwriteCount = countOverwrites(skuArr);

    if (selected.size >= CONFIRM_THRESHOLD) {
      var doApply = async function () {
        await executeDirectApply();
      };
      setPendingAction(function () { return doApply; });
      setConfirmModal({
        type: "direct",
        totalProducts: selected.size,
        overwriteCount: overwriteCount,
        entries: [{ categoryName: targetCategoryName, count: selected.size }],
      });
    } else {
      executeDirectApply();
    }
  }

  async function executeDirectApply() {
    if (selected.size === 0 || !targetCategorySlug) return;

    var assignments: Array<{ sku: string; category: string }> = [];
    var catSlug = targetCategorySlug;
    var catName = targetCategoryName;
    selected.forEach(function (sku) {
      assignments.push({ sku: sku, category: catSlug! });
    });
    var selectedCopy = new Set(selected);

    setApplying(true);
    setApplyProgress(0);
    setApplyTotal(assignments.length);

    try {
      var res = await executeBatchAssign(assignments);

      if (res.errors.length > 0) {
        setToast({
          type: "error",
          msg: "Alocados " + res.applied + "/" + assignments.length + " produtos. " + res.errors.length + " erros.",
        });
      } else {
        setToast({
          type: "success",
          msg: res.applied + " produto" + (res.applied !== 1 ? "s" : "") + " alocado" + (res.applied !== 1 ? "s" : "") + " em \"" + catName + "\" com sucesso!",
        });
      }

      setAllProducts(function (prev) {
        return prev.map(function (p) {
          if (selectedCopy.has(p.sku)) {
            return { ...p, currentCategory: catSlug!, currentCategoryName: catName };
          }
          return p;
        });
      });
      setSelected(new Set());
      setTargetCategorySlug(null);
    } catch (e: any) {
      console.error("Erro ao aplicar alocacao em massa:", e);
      setToast({ type: "error", msg: "Erro ao aplicar: " + (e.message || String(e)) });
    } finally {
      setApplying(false);
      setApplyProgress(0);
      setApplyTotal(0);
    }
  }

  // ─── Queue: add current selection + target to queue ───
  function addToQueue() {
    if (selected.size === 0 || !targetCategorySlug) return;

    var skuArr: string[] = [];
    selected.forEach(function (s) { skuArr.push(s); });

    var item: QueueItem = {
      id: "q_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      skus: skuArr,
      categorySlug: targetCategorySlug,
      categoryName: targetCategoryName,
      categoryPath: targetCategoryPath,
    };

    setQueue(function (prev) { return prev.concat([item]); });
    setSelected(new Set());
    setTargetCategorySlug(null);
    setQueueExpanded(true);
    setToast({
      type: "success",
      msg: skuArr.length + " produto" + (skuArr.length !== 1 ? "s" : "") + " adicionado" + (skuArr.length !== 1 ? "s" : "") + " a fila para \"" + item.categoryName + "\"",
    });
  }

  function removeFromQueue(queueId: string) {
    setQueue(function (prev) { return prev.filter(function (q) { return q.id !== queueId; }); });
  }

  function clearQueue() {
    setQueue([]);
  }

  // ─── Queue totals ───
  var queueTotalProducts = useMemo(function () {
    var total = 0;
    for (var i = 0; i < queue.length; i++) { total += queue[i].skus.length; }
    return total;
  }, [queue]);

  // ─── Execute queue (with confirmation) ───
  function handleExecuteQueueClick() {
    if (queue.length === 0) return;

    var totalProds = queueTotalProducts;
    var allSkus: string[] = [];
    var entries: Array<{ categoryName: string; count: number }> = [];
    for (var i = 0; i < queue.length; i++) {
      entries.push({ categoryName: queue[i].categoryName, count: queue[i].skus.length });
      for (var j = 0; j < queue[i].skus.length; j++) {
        allSkus.push(queue[i].skus[j]);
      }
    }
    var overwriteCount = countOverwrites(allSkus);

    if (totalProds >= CONFIRM_THRESHOLD) {
      var doQueue = async function () {
        await executeQueue();
      };
      setPendingAction(function () { return doQueue; });
      setConfirmModal({
        type: "queue",
        totalProducts: totalProds,
        overwriteCount: overwriteCount,
        entries: entries,
      });
    } else {
      executeQueue();
    }
  }

  async function executeQueue() {
    if (queue.length === 0) return;

    var totalAssignments = 0;
    for (var i = 0; i < queue.length; i++) { totalAssignments += queue[i].skus.length; }

    setApplying(true);
    setApplyProgress(0);
    setApplyTotal(totalAssignments);

    var grandApplied = 0;
    var grandErrors: string[] = [];
    var queueSnapshot = queue.slice();

    try {
      for (var qi = 0; qi < queueSnapshot.length; qi++) {
        var qItem = queueSnapshot[qi];
        var assignments: Array<{ sku: string; category: string }> = [];
        for (var si = 0; si < qItem.skus.length; si++) {
          assignments.push({ sku: qItem.skus[si], category: qItem.categorySlug });
        }
        var res = await executeBatchAssign(assignments);
        grandApplied += res.applied;
        for (var ei = 0; ei < res.errors.length; ei++) {
          grandErrors.push(qItem.categoryName + ": " + res.errors[ei]);
        }

        // Update local data for this queue item (IIFE to avoid var closure issue)
        (function (cSlug, cName, skus) {
          var skuSet = new Set(skus);
          setAllProducts(function (prev) {
            return prev.map(function (p) {
              if (skuSet.has(p.sku)) {
                return { ...p, currentCategory: cSlug, currentCategoryName: cName };
              }
              return p;
            });
          });
        })(qItem.categorySlug, qItem.categoryName, qItem.skus);
      }

      if (grandErrors.length > 0) {
        setToast({
          type: "error",
          msg: "Fila executada: " + grandApplied + "/" + totalAssignments + " alocados. " + grandErrors.length + " erros.",
        });
      } else {
        setToast({
          type: "success",
          msg: "Fila executada com sucesso! " + grandApplied + " produto" + (grandApplied !== 1 ? "s" : "") + " alocado" + (grandApplied !== 1 ? "s" : "") + " em " + queueSnapshot.length + " categoria" + (queueSnapshot.length !== 1 ? "s" : "") + ".",
        });
      }

      setQueue([]);
      setSelected(new Set());
    } catch (e: any) {
      console.error("Erro ao executar fila:", e);
      setToast({ type: "error", msg: "Erro ao executar fila: " + (e.message || String(e)) });
    } finally {
      setApplying(false);
      setApplyProgress(0);
      setApplyTotal(0);
    }
  }

  // ─── Confirm modal handlers ───
  function handleConfirm() {
    setConfirmModal(null);
    if (pendingAction) {
      var action = pendingAction;
      setPendingAction(null);
      action();
    }
  }

  function handleCancelConfirm() {
    setConfirmModal(null);
    setPendingAction(null);
  }

  // ─── Category stats ───
  var categoryStats = useMemo(() => {
    var uncategorized = 0;
    var categorized = 0;
    var byCat: Record<string, number> = {};
    for (var i = 0; i < allProducts.length; i++) {
      var cat = allProducts[i].currentCategory;
      if (!cat) {
        uncategorized++;
      } else {
        categorized++;
        byCat[cat] = (byCat[cat] || 0) + 1;
      }
    }
    return { uncategorized: uncategorized, categorized: categorized, byCat: byCat, total: allProducts.length };
  }, [allProducts]);

  // ─── Distinct categories used by products ───
  var usedCategories = useMemo(() => {
    var entries: Array<{ slug: string; name: string; count: number }> = [];
    var keys = Object.keys(categoryStats.byCat);
    for (var i = 0; i < keys.length; i++) {
      var slug = keys[i];
      var name = findCategoryName(categoryTree, slug) || slug;
      entries.push({ slug: slug, name: name, count: categoryStats.byCat[slug] });
    }
    entries.sort(function (a, b) { return a.name.localeCompare(b.name); });
    return entries;
  }, [categoryStats, categoryTree]);

  // ─── Flattened tree for parent selector ───
  var flatParents = useMemo(function () {
    return flattenTreeForSelect(categoryTree);
  }, [categoryTree]);

  // ─── Create category handler ───
  async function handleCreateCategory() {
    var name = newCatName.trim();
    if (!name) return;

    var slug = generateSlug(name);
    if (!slug) {
      setCreateCatError("Nome invalido. Use letras e numeros.");
      return;
    }

    // Ensure unique slug
    var finalSlug = slug;
    var counter = 2;
    while (slugExistsInTree(categoryTree, finalSlug)) {
      finalSlug = slug + "-" + counter;
      counter++;
    }

    var newNode: CategoryNode = {
      id: "cat_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      name: name,
      slug: finalSlug,
    };

    setCreatingSavingCat(true);
    setCreateCatError("");

    try {
      var updatedTree: CategoryNode[];
      if (newCatParent === "__root__") {
        updatedTree = categoryTree.slice();
        updatedTree.push(newNode);
      } else {
        updatedTree = insertChildInTree(categoryTree, newCatParent, newNode);
      }

      await api.saveCategoryTree(updatedTree);
      setCategoryTree(updatedTree);

      // Auto-select the newly created category
      setTargetCategorySlug(finalSlug);

      // Auto-expand parent if it's a child so the new node is visible
      if (newCatParent !== "__root__") {
        setTreeExpanded(function (prev) {
          var next = new Set(prev);
          var pId = findNodeIdBySlug(categoryTree, newCatParent);
          if (pId) next.add(pId);
          return next;
        });
      }

      setNewCatName("");
      setNewCatParent("__root__");
      setShowCreateCat(false);
      setToast({
        type: "success",
        msg: "Categoria \"" + name + "\" criada com sucesso!",
      });
    } catch (e: any) {
      console.error("Erro ao criar categoria:", e);
      setCreateCatError("Erro ao salvar: " + (e.message || String(e)));
    } finally {
      setCreatingSavingCat(false);
    }
  }

  // ─── Quick create child (from tree node "+" button) ───
  function openCreateChildFor(parentSlug: string) {
    setNewCatParent(parentSlug);
    setNewCatName("");
    setCreateCatError("");
    setShowCreateCat(true);
  }

  // ─── Find node id by slug ───
  function findNodeIdBySlug(nodes: CategoryNode[], slug: string): string | null {
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].slug === slug) return nodes[i].id;
      if (nodes[i].children) {
        var found = findNodeIdBySlug(nodes[i].children!, slug);
        if (found) return found;
      }
    }
    return null;
  }

  // ─── Loading ───
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
        <p className="text-gray-500" style={{ fontSize: "0.85rem" }}>
          Carregando produtos e categorias...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <AlertCircle className="w-8 h-8 text-red-500" />
        <p className="text-red-600" style={{ fontSize: "0.85rem" }}>{error}</p>
        <button
          onClick={loadData}
          className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          style={{ fontSize: "0.8rem" }}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div
          key="toast-notification"
          className={"fixed top-4 right-4 z-[200] flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-white " + (toast.type === "success" ? "bg-green-600" : "bg-red-600")}
          style={{ fontSize: "0.85rem", maxWidth: "480px" }}
        >
          {toast.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span className="flex-1">{toast.msg}</span>
          <button onClick={function () { setToast(null); }} className="p-0.5 hover:bg-white/20 rounded">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ═══ Confirmation Modal ═══ */}
      {confirmModal && (
        <div key="confirm-modal" className="fixed inset-0 z-[300] flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 bg-amber-50 border-b border-amber-200">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-gray-800" style={{ fontSize: "1rem", fontWeight: 700 }}>
                  Confirmar operacao
                </h3>
                <p className="text-amber-700" style={{ fontSize: "0.78rem" }}>
                  {confirmModal.type === "queue" ? "Executar fila de alocacao" : "Alocacao em massa"}
                </p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
                <span className="text-gray-600" style={{ fontSize: "0.82rem" }}>Total de produtos</span>
                <span className="text-gray-800" style={{ fontSize: "1rem", fontWeight: 700 }}>{confirmModal.totalProducts}</span>
              </div>
              {confirmModal.overwriteCount > 0 && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span className="text-amber-700" style={{ fontSize: "0.78rem" }}>
                    <strong>{confirmModal.overwriteCount}</strong>{" "}
                    {confirmModal.overwriteCount !== 1 ? "produtos ja possuem categoria e terao ela substituida." : "produto ja possui categoria e tera ela substituida."}
                  </span>
                </div>
              )}
              {confirmModal.entries.length > 0 && (
                <div className="space-y-1">
                  <span className="text-gray-500 block" style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Destinos
                  </span>
                  <div className="max-h-[120px] overflow-y-auto space-y-1">
                    {confirmModal.entries.map(function (entry, idx) {
                      return (
                        <div key={idx} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-1.5">
                          <span className="text-gray-700 truncate" style={{ fontSize: "0.8rem" }}>{entry.categoryName}</span>
                          <span className="text-gray-500 shrink-0 ml-2" style={{ fontSize: "0.75rem" }}>
                            {entry.count} produto{entry.count !== 1 ? "s" : ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <p className="text-gray-500" style={{ fontSize: "0.78rem" }}>
                Esta operacao nao pode ser desfeita automaticamente. Deseja continuar?
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 bg-gray-50 border-t border-gray-200">
              <button
                onClick={handleCancelConfirm}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
                style={{ fontSize: "0.85rem" }}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirm}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-1.5"
                style={{ fontSize: "0.85rem", fontWeight: 600 }}
              >
                <Zap className="w-3.5 h-3.5" />
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div key="stats-grid" className={"grid grid-cols-2 gap-3 " + (queue.length > 0 ? "sm:grid-cols-5" : "sm:grid-cols-4")}>
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Package className="w-4 h-4 text-gray-400" />
            <span className="text-gray-500" style={{ fontSize: "0.72rem", fontWeight: 500 }}>Total</span>
          </div>
          <span className="text-gray-800" style={{ fontSize: "1.25rem", fontWeight: 700 }}>{categoryStats.total}</span>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Tag className="w-4 h-4 text-green-500" />
            <span className="text-gray-500" style={{ fontSize: "0.72rem", fontWeight: 500 }}>Categorizados</span>
          </div>
          <span className="text-green-700" style={{ fontSize: "1.25rem", fontWeight: 700 }}>{categoryStats.categorized}</span>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            <span className="text-gray-500" style={{ fontSize: "0.72rem", fontWeight: 500 }}>Sem categoria</span>
          </div>
          <span className="text-amber-700" style={{ fontSize: "1.25rem", fontWeight: 700 }}>{categoryStats.uncategorized}</span>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-1">
            <CheckSquare className="w-4 h-4 text-blue-500" />
            <span className="text-gray-500" style={{ fontSize: "0.72rem", fontWeight: 500 }}>Selecionados</span>
          </div>
          <span className="text-blue-700" style={{ fontSize: "1.25rem", fontWeight: 700 }}>{selected.size}</span>
        </div>
        {queue.length > 0 && (
          <div key="queue-stat" className="bg-white rounded-xl border-2 border-blue-200 p-3">
            <div className="flex items-center gap-2 mb-1">
              <ClipboardList className="w-4 h-4 text-blue-500" />
              <span className="text-gray-500" style={{ fontSize: "0.72rem", fontWeight: 500 }}>Na fila</span>
            </div>
            <span className="text-blue-700" style={{ fontSize: "1.25rem", fontWeight: 700 }}>{queueTotalProducts}</span>
          </div>
        )}
      </div>

      {/* Main 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ─── LEFT: Products ─── */}
        <div className="lg:col-span-2 space-y-3">
          {/* Search + Filter bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQ}
                onChange={function (e) { setSearchQ(e.target.value); }}
                placeholder="Buscar por SKU, nome ou categoria... (varias palavras = AND)"
                className="w-full pl-9 pr-20 py-2 border border-gray-200 rounded-lg bg-gray-50 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 transition-all"
                style={{ fontSize: "0.85rem" }}
              />
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                {debouncedSearch.trim() && (
                  <span className="text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded" style={{ fontSize: "0.68rem" }}>
                    {filtered.length}
                  </span>
                )}
                {searchQ && (
                  <button
                    onClick={function () { setSearchQ(""); }}
                    className="p-0.5 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Category filter dropdown */}
            <div className="relative" ref={filterDropdownRef}>
              <button
                onClick={function () { setFilterDropdownOpen(!filterDropdownOpen); }}
                className={"flex items-center gap-1.5 px-3 py-2 border rounded-lg transition-colors whitespace-nowrap " + (categoryFilter !== "__all__" ? "border-red-300 bg-red-50 text-red-700" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300")}
                style={{ fontSize: "0.8rem" }}
              >
                <Filter className="w-3.5 h-3.5" />
                {categoryFilter === "__all__"
                  ? "Todas categorias"
                  : categoryFilter === "__uncategorized__"
                    ? "Sem categoria"
                    : (findCategoryName(categoryTree, categoryFilter) || categoryFilter)}
                <ChevronDown className="w-3 h-3 ml-0.5" />
              </button>
              {filterDropdownOpen && (
                <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-80 overflow-auto">
                  <div className="p-1">
                    <button
                      onClick={function () { setCategoryFilter("__all__"); setFilterDropdownOpen(false); setPage(1); }}
                      className={"w-full text-left px-3 py-2 rounded-lg transition-colors " + (categoryFilter === "__all__" ? "bg-red-50 text-red-700" : "hover:bg-gray-50 text-gray-700")}
                      style={{ fontSize: "0.8rem" }}
                    >
                      Todas as categorias ({categoryStats.total})
                    </button>
                    <button
                      onClick={function () { setCategoryFilter("__uncategorized__"); setFilterDropdownOpen(false); setPage(1); }}
                      className={"w-full text-left px-3 py-2 rounded-lg transition-colors " + (categoryFilter === "__uncategorized__" ? "bg-red-50 text-red-700" : "hover:bg-gray-50 text-gray-700")}
                      style={{ fontSize: "0.8rem" }}
                    >
                      <span className="flex items-center gap-2">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                        Sem categoria ({categoryStats.uncategorized})
                      </span>
                    </button>
                    {usedCategories.length > 0 && (
                      <div className="border-t border-gray-100 mt-1 pt-1">
                        <div className="px-3 py-1.5 text-gray-400" style={{ fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Categorias em uso
                        </div>
                        {usedCategories.map(function (cat) {
                          return (
                            <button
                              key={cat.slug}
                              onClick={function () { setCategoryFilter(cat.slug); setFilterDropdownOpen(false); setPage(1); }}
                              className={"w-full text-left px-3 py-1.5 rounded-lg transition-colors " + (categoryFilter === cat.slug ? "bg-red-50 text-red-700" : "hover:bg-gray-50 text-gray-600")}
                              style={{ fontSize: "0.78rem" }}
                            >
                              <span className="flex items-center justify-between">
                                <span className="truncate">{cat.name}</span>
                                <span className="text-gray-400 ml-2 shrink-0" style={{ fontSize: "0.7rem" }}>{cat.count}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Selection controls */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                onClick={toggleSelectPage}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                style={{ fontSize: "0.78rem" }}
              >
                {allOnPageSelected ? <MinusSquare className="w-3.5 h-3.5" /> : <CheckSquare className="w-3.5 h-3.5" />}
                {allOnPageSelected ? "Desmarcar pagina" : "Selecionar pagina"}
              </button>
              <button
                onClick={selectAllFiltered}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                style={{ fontSize: "0.78rem" }}
              >
                <ListChecks className="w-3.5 h-3.5" />
                Selecionar todos ({filtered.length})
              </button>
              {selected.size > 0 && (
                <button
                  onClick={clearSelection}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                  style={{ fontSize: "0.78rem" }}
                >
                  <RotateCcw className="w-3 h-3" />
                  Limpar ({selected.size})
                </button>
              )}
            </div>
            <span className="text-gray-400" style={{ fontSize: "0.75rem" }}>
              {filtered.length} produto{filtered.length !== 1 ? "s" : ""} encontrado{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Product Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-[36px_44px_1fr_1fr] sm:grid-cols-[36px_44px_110px_1fr_1fr] items-center px-3 py-2 bg-gray-50 border-b border-gray-200 gap-2">
              <div className="flex justify-center">
                <button onClick={toggleSelectPage} className="p-0.5 rounded hover:bg-gray-200 transition-colors">
                  {allOnPageSelected ? (
                    <CheckSquare className="w-4 h-4 text-red-600" />
                  ) : someOnPageSelected ? (
                    <MinusSquare className="w-4 h-4 text-red-400" />
                  ) : (
                    <Square className="w-4 h-4 text-gray-400" />
                  )}
                </button>
              </div>
              <span className="text-gray-500 flex items-center justify-center" style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <Image className="w-3.5 h-3.5" />
              </span>
              <span className="hidden sm:block text-gray-500" style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>SKU</span>
              <span className="text-gray-500" style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Produto</span>
              <span className="text-gray-500" style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Categoria atual</span>
            </div>

            {/* Product Rows */}
            {pageProducts.length === 0 ? (
              <div className="py-12 text-center">
                <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500" style={{ fontSize: "0.85rem" }}>Nenhum produto encontrado</p>
              </div>
            ) : (
              pageProducts.map(function (p) {
                var isSelected = selected.has(p.sku);
                return (
                  <div
                    key={p.sku}
                    onClick={function () { toggleSelect(p.sku); }}
                    className={"grid grid-cols-[36px_44px_1fr_1fr] sm:grid-cols-[36px_44px_110px_1fr_1fr] items-center px-3 py-1.5 border-b border-gray-50 gap-2 cursor-pointer transition-colors " + (isSelected ? "bg-red-50/60 hover:bg-red-50" : "hover:bg-gray-50")}
                  >
                    <div className="flex justify-center">
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-red-600" />
                      ) : (
                        <Square className="w-4 h-4 text-gray-300" />
                      )}
                    </div>
                    <div className="flex justify-center">
                      <ProductImage
                        sku={p.sku}
                        alt={p.titulo}
                        className="w-9 h-9 rounded-md bg-white border border-gray-200 object-contain p-0.5"
                        fallback={
                          <div className="w-9 h-9 rounded-md bg-gray-100 border border-gray-200 flex items-center justify-center">
                            <Package className="w-4 h-4 text-gray-300" />
                          </div>
                        }
                      />
                    </div>
                    <span className="hidden sm:block text-gray-500 font-mono truncate" style={{ fontSize: "0.75rem" }}>
                      {p.sku}
                    </span>
                    <div className="min-w-0">
                      <span className="sm:hidden text-gray-400 font-mono block" style={{ fontSize: "0.68rem" }}>{p.sku}</span>
                      <span className="text-gray-800 truncate block" style={{ fontSize: "0.82rem" }}>
                        {p.titulo}
                      </span>
                    </div>
                    <div className="min-w-0">
                      {p.currentCategory ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 truncate max-w-full" style={{ fontSize: "0.72rem" }}>
                          <Tag className="w-3 h-3 shrink-0" />
                          <span className="truncate">{p.currentCategoryName}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-600" style={{ fontSize: "0.72rem" }}>
                          <AlertCircle className="w-3 h-3 shrink-0" />
                          Sem categoria
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <button
                  onClick={function () { setPage(Math.max(1, currentPage - 1)); }}
                  disabled={currentPage <= 1}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                  style={{ fontSize: "0.78rem" }}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Anterior
                </button>
                <span className="text-gray-500" style={{ fontSize: "0.78rem" }}>
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={function () { setPage(Math.min(totalPages, currentPage + 1)); }}
                  disabled={currentPage >= totalPages}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                  style={{ fontSize: "0.78rem" }}
                >
                  Proximo
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ─── RIGHT: Category selector ─── */}
        <div className="space-y-3">
          {/* Sticky container for the category panel */}
          <div className="lg:sticky lg:top-4 space-y-3">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                <h3 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                  <FolderTree className="w-4 h-4 text-red-600" />
                  Categoria destino
                </h3>
                <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.72rem" }}>
                  Selecione a categoria para alocar os produtos
                </p>
              </div>

              {/* Tree search */}
              <div className="p-3 border-b border-gray-100">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    type="text"
                    value={treeSearchQ}
                    onChange={function (e) { setTreeSearchQ(e.target.value); }}
                    placeholder="Filtrar categorias..."
                    className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg bg-gray-50 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 transition-all"
                    style={{ fontSize: "0.78rem" }}
                  />
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={expandAllTree}
                    className="text-gray-500 hover:text-red-600 px-2 py-1 border border-gray-200 rounded-md transition-colors"
                    style={{ fontSize: "0.7rem" }}
                  >
                    Expandir
                  </button>
                  <button
                    onClick={collapseAllTree}
                    className="text-gray-500 hover:text-red-600 px-2 py-1 border border-gray-200 rounded-md transition-colors"
                    style={{ fontSize: "0.7rem" }}
                  >
                    Recolher
                  </button>
                  <button
                    onClick={function () { setShowCreateCat(!showCreateCat); setCreateCatError(""); }}
                    className={"flex items-center gap-1 px-2 py-1 border rounded-md transition-colors " + (showCreateCat ? "border-green-400 bg-green-50 text-green-700" : "border-gray-200 text-gray-500 hover:text-green-600 hover:border-green-300")}
                    style={{ fontSize: "0.7rem" }}
                    title="Criar nova categoria"
                  >
                    <FolderPlus className="w-3 h-3" />
                    Nova
                  </button>
                  {targetCategorySlug && (
                    <button
                      onClick={function () { setTargetCategorySlug(null); }}
                      className="ml-auto text-red-500 hover:text-red-700 px-2 py-1 border border-red-200 rounded-md transition-colors"
                      style={{ fontSize: "0.7rem" }}
                    >
                      Limpar
                    </button>
                  )}
                </div>

                {/* ── Inline create category form ── */}
                {showCreateCat && (
                  <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                      <FolderPlus className="w-4 h-4 text-green-600" />
                      <span className="text-green-800" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Nova categoria</span>
                    </div>
                    <div>
                      <label className="block text-gray-600 mb-0.5" style={{ fontSize: "0.7rem", fontWeight: 500 }}>
                        Pai (onde criar)
                      </label>
                      <select
                        value={newCatParent}
                        onChange={function (e) { setNewCatParent(e.target.value); }}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
                        style={{ fontSize: "0.78rem" }}
                      >
                        <option value="__root__">📁 Raiz (categoria mae)</option>
                        {flatParents.map(function (fp) {
                          var indent = "";
                          for (var d = 0; d < fp.depth; d++) { indent += "\u00A0\u00A0\u00A0\u00A0"; }
                          return (
                            <option key={fp.uniqueKey} value={fp.slug}>
                              {indent + (fp.depth > 0 ? "└ " : "📂 ") + fp.name}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <div>
                      <label className="block text-gray-600 mb-0.5" style={{ fontSize: "0.7rem", fontWeight: 500 }}>
                        Nome da categoria *
                      </label>
                      <input
                        type="text"
                        value={newCatName}
                        onChange={function (e) { setNewCatName(e.target.value); setCreateCatError(""); }}
                        placeholder="Ex: Filtros de Oleo"
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
                        style={{ fontSize: "0.78rem" }}
                        onKeyDown={function (e) { if (e.key === "Enter" && newCatName.trim()) { e.preventDefault(); handleCreateCategory(); } }}
                        autoFocus
                      />
                      {newCatName.trim() && (
                        <span className="text-gray-400 mt-0.5 block" style={{ fontSize: "0.65rem" }}>
                          Slug: {generateSlug(newCatName.trim()) || "—"}
                        </span>
                      )}
                    </div>
                    {createCatError && (
                      <div className="flex items-center gap-1.5 text-red-600" style={{ fontSize: "0.72rem" }}>
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        {createCatError}
                      </div>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={handleCreateCategory}
                        disabled={!newCatName.trim() || creatingSavingCat}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-40"
                        style={{ fontSize: "0.78rem", fontWeight: 600 }}
                      >
                        {creatingSavingCat ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        {creatingSavingCat ? "Criando..." : "Criar"}
                      </button>
                      <button
                        onClick={function () { setShowCreateCat(false); setNewCatName(""); setNewCatParent("__root__"); setCreateCatError(""); }}
                        className="px-3 py-1.5 border border-gray-300 text-gray-500 rounded-lg hover:bg-gray-50 transition-colors"
                        style={{ fontSize: "0.78rem" }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Category Tree */}
              <div className="max-h-[420px] overflow-y-auto">
                {categoryTree.length === 0 ? (
                  <div className="py-8 text-center">
                    <FolderTree className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500" style={{ fontSize: "0.82rem" }}>Nenhuma categoria</p>
                  </div>
                ) : (
                  categoryTree
                    .filter(function (node) { return nodeMatchesSearch(node, treeSearchQ); })
                    .map(function (node) {
                      return (
                        <TreeNode
                          key={node.id}
                          node={node}
                          depth={0}
                          expanded={treeExpanded}
                          toggleExpand={toggleTreeNode}
                          selected={targetCategorySlug}
                          onSelect={setTargetCategorySlug}
                          searchQ={treeSearchQ}
                          productCounts={categoryStats.byCat}
                          onCreateChild={openCreateChildFor}
                        />
                      );
                    })
                )}
              </div>
            </div>

            {/* Selected target info */}
            {targetCategorySlug && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <ArrowRight className="w-4 h-4 text-blue-600" />
                  <span className="text-blue-800" style={{ fontSize: "0.82rem", fontWeight: 600 }}>Destino selecionado</span>
                </div>
                <p className="text-blue-700" style={{ fontSize: "0.78rem" }}>{targetCategoryPath}</p>
              </div>
            )}

            {/* ─── Action Buttons ─── */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              {/* Progress bar (shared between direct apply and queue execution) */}
              {applying && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-gray-600" style={{ fontSize: "0.78rem", fontWeight: 500 }}>Aplicando...</span>
                    <span className="text-gray-500" style={{ fontSize: "0.72rem" }}>
                      {applyProgress}/{applyTotal}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-600 rounded-full transition-all duration-300"
                      style={{ width: (applyTotal > 0 ? (applyProgress / applyTotal) * 100 : 0) + "%" }}
                    />
                  </div>
                </div>
              )}

              {/* Alocar agora (direct apply) */}
              <button
                onClick={handleApplyClick}
                disabled={selected.size === 0 || !targetCategorySlug || applying}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ fontSize: "0.88rem", fontWeight: 600 }}
              >
                {applying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                {applying
                  ? "Aplicando..."
                  : selected.size === 0
                    ? "Selecione produtos"
                    : !targetCategorySlug
                      ? "Selecione a categoria destino"
                      : "Alocar " + selected.size + " produto" + (selected.size !== 1 ? "s" : "") + " agora"}
              </button>

              {/* Adicionar a fila (secondary) */}
              <button
                onClick={addToQueue}
                disabled={selected.size === 0 || !targetCategorySlug || applying}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 border border-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ fontSize: "0.82rem", fontWeight: 500 }}
              >
                <Plus className="w-4 h-4" />
                {selected.size === 0
                  ? "Selecione produtos para enfileirar"
                  : !targetCategorySlug
                    ? "Selecione categoria para enfileirar"
                    : "Adicionar " + selected.size + " a fila"}
              </button>

              {/* Warning info */}
              {selected.size > 0 && targetCategorySlug && !applying && (
                <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                  <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-amber-700" style={{ fontSize: "0.72rem" }}>
                    {selected.size} produto{selected.size !== 1 ? "s serao alocados" : " sera alocado"} na categoria <strong>{targetCategoryName}</strong>.
                    Produtos que ja possuem categoria terao ela substituida.
                  </p>
                </div>
              )}
            </div>

            {/* ─── Queue Panel ─── */}
            {queue.length > 0 && (
              <div className="bg-white rounded-xl border-2 border-blue-200 overflow-hidden">
                {/* Queue header */}
                <button
                  onClick={function () { setQueueExpanded(!queueExpanded); }}
                  className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 hover:bg-blue-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-blue-600" />
                    <span className="text-blue-800" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                      Fila de alocacao
                    </span>
                    <span className="bg-blue-200 text-blue-700 px-2 py-0.5 rounded-full" style={{ fontSize: "0.68rem", fontWeight: 600 }}>
                      {queue.length} {queue.length !== 1 ? "itens" : "item"} &bull; {queueTotalProducts} produto{queueTotalProducts !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {queueExpanded ? (
                    <ChevronDown className="w-4 h-4 text-blue-500" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-blue-400" />
                  )}
                </button>

                {queueExpanded && (
                  <div className="p-3 space-y-2">
                    {/* Queue items */}
                    <div className="max-h-[200px] overflow-y-auto space-y-1">
                      {queue.map(function (q) {
                        return (
                          <div
                            key={q.id}
                            className="flex items-center justify-between px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg group"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <ArrowRight className="w-3 h-3 text-blue-400 shrink-0" />
                              <span className="text-gray-700 truncate" style={{ fontSize: "0.78rem" }}>{q.categoryPath || q.categoryName}</span>
                              <span className="bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full shrink-0" style={{ fontSize: "0.65rem", fontWeight: 600 }}>
                                {q.skus.length}
                              </span>
                            </div>
                            <button
                              onClick={function () { removeFromQueue(q.id); }}
                              className="p-1 rounded hover:bg-red-100 transition-colors opacity-50 group-hover:opacity-100"
                              title="Remover da fila"
                            >
                              <Trash2 className="w-3 h-3 text-red-500" />
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {/* Queue actions */}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={handleExecuteQueueClick}
                        disabled={applying}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40"
                        style={{ fontSize: "0.82rem", fontWeight: 600 }}
                      >
                        {applying ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                        {applying
                          ? "Executando..."
                          : "Executar fila"}
                      </button>
                      <button
                        onClick={clearQueue}
                        disabled={applying}
                        className="px-3 py-2.5 border border-red-200 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                        style={{ fontSize: "0.78rem" }}
                        title="Limpar toda a fila"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tree Node Component ───

function TreeNode({
  node,
  depth,
  expanded,
  toggleExpand,
  selected,
  onSelect,
  searchQ,
  productCounts,
  onCreateChild,
}: {
  node: CategoryNode;
  depth: number;
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
  selected: string | null;
  onSelect: (slug: string) => void;
  searchQ: string;
  productCounts: Record<string, number>;
  onCreateChild?: (parentSlug: string) => void;
}) {
  var hasChildren = !!(node.children && node.children.length > 0);
  var isOpen = expanded.has(node.id) || !!searchQ.trim();
  var isSelected = selected === node.slug;
  var count = productCounts[node.slug] || 0;

  // Padding based on depth
  var paddingLeft = 12 + depth * 20;

  function handleNodeClick(e: React.MouseEvent) {
    e.stopPropagation();
    onSelect(node.slug);
  }

  function handleExpandClick(e: React.MouseEvent) {
    e.stopPropagation();
    toggleExpand(node.id);
  }

  // Filter children by search
  function nodeMatchesSearchLocal(n: CategoryNode, q: string): boolean {
    var norm = q.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (!norm) return true;
    var nameNorm = n.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (nameNorm.indexOf(norm) >= 0) return true;
    if (n.children) {
      for (var i = 0; i < n.children.length; i++) {
        if (nodeMatchesSearchLocal(n.children[i], q)) return true;
      }
    }
    return false;
  }

  var filteredChildren = hasChildren
    ? node.children!.filter(function (c) { return nodeMatchesSearchLocal(c, searchQ); })
    : [];

  return (
    <div>
      <div
        onClick={handleNodeClick}
        className={"flex items-center gap-1.5 py-2 pr-3 cursor-pointer transition-colors group " + (isSelected ? "bg-red-50 border-l-3 border-red-600" : "hover:bg-gray-50 border-l-3 border-transparent")}
        style={{ paddingLeft: paddingLeft }}
      >
        {/* Expand/collapse */}
        {hasChildren ? (
          <button
            key="expand-btn"
            onClick={handleExpandClick}
            className="p-0.5 rounded hover:bg-gray-200 transition-colors shrink-0"
          >
            {isOpen ? (
              <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
            )}
          </button>
        ) : (
          <div key="leaf-dot" className="w-4.5 h-4.5 flex items-center justify-center shrink-0">
            <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
          </div>
        )}

        {/* Icon */}
        {isOpen && hasChildren ? (
          <FolderOpen key="icon-open" className="w-4 h-4 text-red-500 shrink-0" />
        ) : hasChildren ? (
          <Folder key="icon-closed" className="w-4 h-4 text-gray-400 shrink-0" />
        ) : (
          <Layers key="icon-leaf" className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        )}

        {/* Name */}
        <span
          className={"flex-1 truncate " + (isSelected ? "text-red-700 font-semibold" : depth === 0 ? "text-gray-800 font-medium" : "text-gray-600")}
          style={{ fontSize: depth === 0 ? "0.82rem" : "0.78rem" }}
        >
          {node.name}
        </span>

        {/* Product count */}
        {count > 0 ? (
          <span key="count-badge" className="text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full shrink-0" style={{ fontSize: "0.65rem" }}>
            {count}
          </span>
        ) : null}

        {/* Add child button */}
        {onCreateChild ? (
          <button
            key="add-child-btn"
            onClick={function (e) { e.stopPropagation(); onCreateChild(node.slug); }}
            className="p-0.5 rounded text-gray-300 hover:text-green-600 hover:bg-green-50 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
            title={"Criar subcategoria em " + node.name}
          >
            <Plus className="w-3 h-3" />
          </button>
        ) : null}

        {/* Selected indicator */}
        {isSelected ? (
          <Check key="selected-check" className="w-4 h-4 text-red-600 shrink-0" />
        ) : null}
      </div>

      {/* Children */}
      {isOpen && filteredChildren.length > 0 && (
        <div>
          {filteredChildren.map(function (child) {
            return (
              <TreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                expanded={expanded}
                toggleExpand={toggleExpand}
                selected={selected}
                onSelect={onSelect}
                searchQ={searchQ}
                productCounts={productCounts}
                onCreateChild={onCreateChild}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}