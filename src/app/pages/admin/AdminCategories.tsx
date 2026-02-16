import { useState, useEffect, useCallback } from "react";
import {
  Layers,
  Plus,
  Edit3,
  Trash2,
  X,
  Check,
  ChevronRight,
  ChevronDown,
  Search,
  Loader2,
  RefreshCw,
  FolderTree,
  FolderOpen,
  Folder,
  Upload,
  Save,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import * as api from "../../services/api";
import type { CategoryNode } from "../../services/api";
import { defaultCategoryTree, countNodes } from "../../data/categoryTree";

// ─── helpers ───
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function newId(): string {
  return `cat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function flatCount(nodes: CategoryNode[]): number {
  let c = 0;
  for (const n of nodes) {
    c++;
    if (n.children) c += flatCount(n.children);
  }
  return c;
}

function matchesSearch(node: CategoryNode, q: string): boolean {
  const norm = q
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const nameNorm = node.name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (nameNorm.includes(norm)) return true;
  if (node.children) return node.children.some((c) => matchesSearch(c, q));
  return false;
}

export function AdminCategories() {
  const [tree, setTree] = useState<CategoryNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // modal state
  const [modal, setModal] = useState<{
    mode: "add-parent" | "add-child" | "edit";
    parentId?: string;
    node?: CategoryNode;
  } | null>(null);
  const [formName, setFormName] = useState("");
  const [formSlug, setFormSlug] = useState("");

  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string; parentId?: string } | null>(null);

  // ─── load ───
  const loadTree = useCallback(async () => {
    setLoading(true);
    try {
      let data = await api.getCategoryTree();
      if (!data || (Array.isArray(data) && data.length === 0)) {
        // seed from defaults
        data = defaultCategoryTree;
        await api.saveCategoryTree(data);
      }
      setTree(data);
      setDirty(false);
    } catch (e) {
      console.error("Error loading category tree:", e);
      showToast("error", "Erro ao carregar categorias.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  // ─── toast ───
  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  // ─── save tree ───
  const handleSave = async () => {
    setSaving(true);
    try {
      await api.saveCategoryTree(tree);
      setDirty(false);
      showToast("success", "Categorias salvas com sucesso!");
    } catch (e) {
      console.error("Error saving tree:", e);
      showToast("error", "Erro ao salvar categorias.");
    } finally {
      setSaving(false);
    }
  };

  // ─── expand/collapse ───
  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    const ids = new Set<string>();
    function walk(nodes: CategoryNode[]) {
      for (const n of nodes) {
        if (n.children && n.children.length > 0) {
          ids.add(n.id);
          walk(n.children);
        }
      }
    }
    walk(tree);
    setExpanded(ids);
  };

  const collapseAll = () => setExpanded(new Set());

  // ─── modal ───
  const openAddParent = () => {
    setFormName("");
    setFormSlug("");
    setModal({ mode: "add-parent" });
  };

  const openAddChild = (parentId: string) => {
    setFormName("");
    setFormSlug("");
    setModal({ mode: "add-child", parentId });
  };

  const openEdit = (node: CategoryNode, parentId?: string) => {
    setFormName(node.name);
    setFormSlug(node.slug);
    setModal({ mode: "edit", node, parentId });
  };

  const submitModal = () => {
    if (!formName.trim()) return;
    const slug = formSlug.trim() || slugify(formName);
    const id = modal?.mode === "edit" && modal.node ? modal.node.id : newId();

    if (modal?.mode === "add-parent") {
      setTree((prev) => [
        ...prev,
        { id, name: formName.trim(), slug, children: [] },
      ]);
    } else if (modal?.mode === "add-child" && modal.parentId) {
      setTree((prev) =>
        prev.map((p) => {
          if (p.id === modal.parentId) {
            return {
              ...p,
              children: [...(p.children || []), { id, name: formName.trim(), slug }],
            };
          }
          // Check deeper (grandchildren)
          if (p.children) {
            return {
              ...p,
              children: p.children.map((c) => {
                if (c.id === modal.parentId) {
                  return {
                    ...c,
                    children: [...(c.children || []), { id, name: formName.trim(), slug }],
                  };
                }
                return c;
              }),
            };
          }
          return p;
        })
      );
    } else if (modal?.mode === "edit" && modal.node) {
      function updateNode(nodes: CategoryNode[]): CategoryNode[] {
        return nodes.map((n) => {
          if (n.id === modal!.node!.id) {
            return { ...n, name: formName.trim(), slug };
          }
          if (n.children) {
            return { ...n, children: updateNode(n.children) };
          }
          return n;
        });
      }
      setTree((prev) => updateNode(prev));
    }

    setDirty(true);
    setModal(null);
  };

  // ─── delete ───
  const handleDelete = () => {
    if (!deleteConfirm) return;
    function removeNode(nodes: CategoryNode[]): CategoryNode[] {
      return nodes
        .filter((n) => n.id !== deleteConfirm!.id)
        .map((n) => ({
          ...n,
          ...(n.children ? { children: removeNode(n.children) } : {}),
        }));
    }
    setTree((prev) => removeNode(prev));
    setDirty(true);
    setDeleteConfirm(null);
  };

  // ─── reset to defaults ───
  const resetToDefaults = async () => {
    if (!confirm("Tem certeza? Isso substituira todas as categorias pelas pre-cadastradas.")) return;
    setSaving(true);
    try {
      await api.saveCategoryTree(defaultCategoryTree);
      setTree(defaultCategoryTree);
      setDirty(false);
      showToast("success", "Categorias resetadas para o padrao!");
    } catch (e) {
      console.error("Error resetting:", e);
      showToast("error", "Erro ao resetar categorias.");
    } finally {
      setSaving(false);
    }
  };

  // ─── filtered tree ───
  const filteredTree = searchQ.trim()
    ? tree.filter((p) => matchesSearch(p, searchQ))
    : tree;

  const stats = countNodes(tree);

  // ─── render loading ───
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-[200] flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-white ${
            toast.type === "success" ? "bg-green-600" : "bg-red-600"
          }`}
          style={{ fontSize: "0.85rem" }}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "1.25rem", fontWeight: 700 }}>
            <FolderTree className="w-5 h-5 text-red-600" />
            Arvore de Categorias
          </h2>
          <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.85rem" }}>
            {stats.parents} categorias mae &bull; {stats.total} total
            {dirty && (
              <span className="ml-2 text-amber-500 font-medium">(alteracoes nao salvas)</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={loadTree}
            className="flex items-center gap-1.5 text-gray-500 hover:text-red-600 border border-gray-200 px-3 py-2 rounded-lg transition-colors"
            style={{ fontSize: "0.8rem" }}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={resetToDefaults}
            className="flex items-center gap-1.5 text-gray-500 hover:text-red-600 border border-gray-200 px-3 py-2 rounded-lg transition-colors"
            style={{ fontSize: "0.8rem" }}
            title="Resetar para categorias padrao"
          >
            <Upload className="w-3.5 h-3.5" />
            Resetar
          </button>
          <button
            onClick={openAddParent}
            className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg transition-colors"
            style={{ fontSize: "0.8rem", fontWeight: 500 }}
          >
            <Plus className="w-3.5 h-3.5" />
            Nova Mae
          </button>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-40"
            style={{ fontSize: "0.8rem", fontWeight: 600 }}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Salvar
          </button>
        </div>
      </div>

      {/* Search & expand controls */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Filtrar categorias..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg bg-gray-50 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 transition-all"
            style={{ fontSize: "0.85rem" }}
          />
        </div>
        <button
          onClick={expandAll}
          className="text-gray-500 hover:text-red-600 px-2 py-1.5 border border-gray-200 rounded-lg transition-colors"
          style={{ fontSize: "0.75rem" }}
        >
          Expandir Todos
        </button>
        <button
          onClick={collapseAll}
          className="text-gray-500 hover:text-red-600 px-2 py-1.5 border border-gray-200 rounded-lg transition-colors"
          style={{ fontSize: "0.75rem" }}
        >
          Recolher
        </button>
      </div>

      {/* Tree */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {filteredTree.length === 0 ? (
          <div className="py-12 text-center">
            <FolderTree className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500" style={{ fontSize: "0.9rem", fontWeight: 500 }}>
              {searchQ ? "Nenhuma categoria encontrada" : "Nenhuma categoria cadastrada"}
            </p>
          </div>
        ) : (
          filteredTree.map((parent) => (
            <ParentRow
              key={parent.id}
              node={parent}
              expanded={expanded}
              toggle={toggle}
              onAddChild={openAddChild}
              onEdit={openEdit}
              onDelete={(id, name, parentId) => setDeleteConfirm({ id, name, parentId })}
              searchQ={searchQ}
            />
          ))
        )}
      </div>

      {/* Add/Edit Modal */}
      {modal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setModal(null)}
        >
          <div
            className="bg-white rounded-xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h3
                className="text-gray-800 flex items-center gap-2"
                style={{ fontSize: "1.05rem", fontWeight: 600 }}
              >
                <Layers className="w-5 h-5 text-red-600" />
                {modal.mode === "edit"
                  ? "Editar Categoria"
                  : modal.mode === "add-child"
                  ? "Nova Subcategoria"
                  : "Nova Categoria Mae"}
              </h3>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-gray-600 mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>
                  Nome *
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => {
                    setFormName(e.target.value);
                    if (!modal.node) setFormSlug(slugify(e.target.value));
                  }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                  style={{ fontSize: "0.85rem" }}
                  placeholder="Ex: Filtros e Filtragem"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && submitModal()}
                />
              </div>
              <div>
                <label className="block text-gray-600 mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>
                  Slug
                </label>
                <input
                  type="text"
                  value={formSlug}
                  onChange={(e) => setFormSlug(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 font-mono"
                  style={{ fontSize: "0.8rem" }}
                  placeholder="filtros-e-filtragem"
                />
              </div>
              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  onClick={() => setModal(null)}
                  className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                  style={{ fontSize: "0.85rem" }}
                >
                  Cancelar
                </button>
                <button
                  onClick={submitModal}
                  disabled={!formName.trim()}
                  className="px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-40 flex items-center gap-2"
                  style={{ fontSize: "0.85rem", fontWeight: 500 }}
                >
                  <Check className="w-4 h-4" />
                  {modal.mode === "edit" ? "Salvar" : "Criar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setDeleteConfirm(null)}
        >
          <div className="bg-white rounded-xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="bg-red-50 w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-center text-gray-800 mb-2" style={{ fontSize: "1.1rem", fontWeight: 600 }}>
              Excluir "{deleteConfirm.name}"?
            </h3>
            <p className="text-center text-gray-500 mb-5" style={{ fontSize: "0.85rem" }}>
              Esta acao remove a categoria e todas as subcategorias filhas.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                style={{ fontSize: "0.85rem" }}
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                style={{ fontSize: "0.85rem" }}
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Parent Row Component ───
function ParentRow({
  node,
  expanded,
  toggle,
  onAddChild,
  onEdit,
  onDelete,
  searchQ,
}: {
  node: CategoryNode;
  expanded: Set<string>;
  toggle: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onEdit: (node: CategoryNode, parentId?: string) => void;
  onDelete: (id: string, name: string, parentId?: string) => void;
  searchQ: string;
}) {
  const isOpen = expanded.has(node.id) || !!searchQ.trim();
  const childCount = node.children?.length || 0;
  const totalDescendants = node.children ? flatCount(node.children) : 0;

  return (
    <div>
      {/* Parent header */}
      <div className="flex items-center gap-2 px-4 py-3 hover:bg-gray-50 transition-colors group">
        <button
          onClick={() => toggle(node.id)}
          className="p-1 rounded hover:bg-gray-200 transition-colors shrink-0"
          disabled={childCount === 0}
        >
          {childCount > 0 ? (
            isOpen ? (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )
          ) : (
            <div className="w-4 h-4" />
          )}
        </button>

        {isOpen && childCount > 0 ? (
          <FolderOpen className="w-4.5 h-4.5 text-red-500 shrink-0" />
        ) : (
          <Folder className="w-4.5 h-4.5 text-gray-400 shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <span className="text-gray-800 truncate block" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
            {node.name}
          </span>
        </div>

        {childCount > 0 && (
          <span
            className="text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full shrink-0"
            style={{ fontSize: "0.7rem", fontWeight: 500 }}
          >
            {totalDescendants} sub
          </span>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={() => onAddChild(node.id)}
            className="p-1.5 rounded-md hover:bg-green-50 text-gray-400 hover:text-green-600 transition-colors"
            title="Adicionar subcategoria"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onEdit(node)}
            className="p-1.5 rounded-md hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
            title="Editar"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(node.id, node.name)}
            className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
            title="Excluir"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Children */}
      {isOpen && node.children && node.children.length > 0 && (
        <div className="border-t border-gray-50">
          {node.children.map((child) => (
            <ChildRow
              key={child.id}
              node={child}
              parentId={node.id}
              expanded={expanded}
              toggle={toggle}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
              depth={1}
              searchQ={searchQ}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Child / Grandchild Row (recursive) ───
function ChildRow({
  node,
  parentId,
  expanded,
  toggle,
  onAddChild,
  onEdit,
  onDelete,
  depth,
  searchQ,
}: {
  node: CategoryNode;
  parentId: string;
  expanded: Set<string>;
  toggle: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onEdit: (node: CategoryNode, parentId?: string) => void;
  onDelete: (id: string, name: string, parentId?: string) => void;
  depth: number;
  searchQ: string;
}) {
  const isOpen = expanded.has(node.id) || !!searchQ.trim();
  const childCount = node.children?.length || 0;
  const pl = depth === 1 ? "pl-10" : depth === 2 ? "pl-16" : "pl-20";

  return (
    <div>
      <div className={`flex items-center gap-2 ${pl} pr-4 py-2 hover:bg-gray-50 transition-colors group`}>
        {childCount > 0 ? (
          <button
            onClick={() => toggle(node.id)}
            className="p-0.5 rounded hover:bg-gray-200 transition-colors shrink-0"
          >
            {isOpen ? (
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
            )}
          </button>
        ) : (
          <div className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
            <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
          </div>
        )}

        <span className="text-gray-600 flex-1 truncate" style={{ fontSize: "0.82rem" }}>
          {node.name}
        </span>

        {childCount > 0 && (
          <span className="text-gray-400" style={{ fontSize: "0.65rem" }}>
            {childCount}
          </span>
        )}

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {depth < 2 && (
            <button
              onClick={() => onAddChild(node.id)}
              className="p-1 rounded hover:bg-green-50 text-gray-400 hover:text-green-600 transition-colors"
              title="Adicionar sub"
            >
              <Plus className="w-3 h-3" />
            </button>
          )}
          <button
            onClick={() => onEdit(node, parentId)}
            className="p-1 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
            title="Editar"
          >
            <Edit3 className="w-3 h-3" />
          </button>
          <button
            onClick={() => onDelete(node.id, node.name, parentId)}
            className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
            title="Excluir"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Grandchildren */}
      {isOpen && node.children && node.children.length > 0 && (
        <div>
          {node.children.map((gc) => (
            <ChildRow
              key={gc.id}
              node={gc}
              parentId={node.id}
              expanded={expanded}
              toggle={toggle}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
              depth={depth + 1}
              searchQ={searchQ}
            />
          ))}
        </div>
      )}
    </div>
  );
}