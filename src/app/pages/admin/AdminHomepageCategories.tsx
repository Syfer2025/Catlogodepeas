import { useState, useEffect, useCallback, useRef } from "react";
import {
  LayoutGrid,
  Plus,
  Trash2,
  Edit3,
  Upload,
  X,
  Loader2,
  GripVertical,
  Eye,
  EyeOff,
  Image,
  ChevronDown,
  Search,
  CheckCircle2,
  AlertCircle,
  Save,
} from "lucide-react";
import * as api from "../../services/api";
import type { HomepageCategoryCard, CategoryNode } from "../../services/api";
import { defaultCategoryTree } from "../../data/categoryTree";
import { supabase } from "../../services/supabaseClient";
import { getValidAdminToken } from "./adminAuth";
import { invalidateHomepageCache } from "../../contexts/HomepageInitContext";

// ─── helpers ───

/** Flatten the category tree into a flat list of {name, slug, depth} for the selector */
function flattenTree(nodes: CategoryNode[], depth: number = 0, parentPath: string = ""): Array<{ name: string; slug: string; fullPath: string; depth: number }> {
  const result: Array<{ name: string; slug: string; fullPath: string; depth: number }> = [];
  for (const n of nodes) {
    const fp = parentPath ? parentPath + " > " + n.name : n.name;
    result.push({ name: n.name, slug: n.slug, fullPath: fp, depth });
    if (n.children && n.children.length > 0) {
      result.push(...flattenTree(n.children, depth + 1, fp));
    }
  }
  return result;
}

export function AdminHomepageCategories() {
  const [cards, setCards] = useState<HomepageCategoryCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);
  const [flatCategories, setFlatCategories] = useState<Array<{ name: string; slug: string; fullPath: string; depth: number }>>([]);

  // Modal
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editCard, setEditCard] = useState<HomepageCategoryCard | null>(null);
  const [formName, setFormName] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formCatName, setFormCatName] = useState("");
  const [formOrder, setFormOrder] = useState(0);
  const [formActive, setFormActive] = useState(true);
  const [formFile, setFormFile] = useState<File | null>(null);
  const [formPreview, setFormPreview] = useState<string | null>(null);
  const [catSearch, setCatSearch] = useState("");
  const [catDropdownOpen, setCatDropdownOpen] = useState(false);
  const catDropdownRef = useRef<HTMLDivElement>(null);

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<HomepageCategoryCard | null>(null);

  const showToast = useCallback((type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Load cards and categories
  const loadCards = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getValidAdminToken();
      if (!token) return;

      const [catRes, cardsRes] = await Promise.all([
        api.getCategoryTree(),
        api.getHomepageCategories(),
      ]);

      const tree = catRes && Array.isArray(catRes) && catRes.length > 0 ? catRes : defaultCategoryTree;
      setCategoryTree(tree);
      setFlatCategories(flattenTree(tree));

      const allCards = cardsRes?.categories || [];
      // Sort by order
      allCards.sort((a, b) => (a.order || 0) - (b.order || 0));
      setCards(allCards);
    } catch (e: any) {
      console.error("[AdminHomepageCategories] Load error:", e);
      showToast("error", "Erro ao carregar: " + (e.message || e));
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (catDropdownRef.current && !catDropdownRef.current.contains(e.target as Node)) {
        setCatDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const openAddModal = () => {
    setModal("add");
    setEditCard(null);
    setFormName("");
    setFormSlug("");
    setFormCatName("");
    setFormOrder(cards.length);
    setFormActive(true);
    setFormFile(null);
    setFormPreview(null);
    setCatSearch("");
  };

  const openEditModal = (card: HomepageCategoryCard) => {
    setModal("edit");
    setEditCard(card);
    setFormName(card.name || "");
    setFormSlug(card.categorySlug || "");
    setFormCatName(card.categoryName || "");
    setFormOrder(card.order || 0);
    setFormActive(card.active !== false);
    setFormFile(null);
    setFormPreview(card.imageUrl || null);
    setCatSearch("");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFormFile(file);
    const url = URL.createObjectURL(file);
    setFormPreview(url);
  };

  const selectCategory = (cat: { name: string; slug: string; fullPath: string }) => {
    setFormSlug(cat.slug);
    setFormCatName(cat.name);
    setFormName(cat.name);
    setCatDropdownOpen(false);
    setCatSearch("");
  };

  const handleSave = async () => {
    if (!formSlug) {
      showToast("error", "Selecione uma categoria.");
      return;
    }

    setSaving(true);
    try {
      const token = await getValidAdminToken();
      if (!token) throw new Error("Sessão expirada.");

      if (modal === "add") {
        if (!formFile) {
          showToast("error", "Selecione uma imagem.");
          setSaving(false);
          return;
        }
        await api.createHomepageCategory(formFile, {
          name: formName || formCatName,
          categorySlug: formSlug,
          categoryName: formCatName,
          order: formOrder,
          active: formActive,
        }, token);
        showToast("success", "Categoria adicionada com sucesso!");
      } else if (modal === "edit" && editCard) {
        await api.updateHomepageCategory(editCard.id, {
          name: formName || formCatName,
          categorySlug: formSlug,
          categoryName: formCatName,
          order: formOrder,
          active: formActive,
        }, token, formFile);
        showToast("success", "Categoria atualizada!");
      }

      setModal(null);
      await loadCards();
      invalidateHomepageCache();
    } catch (e: any) {
      console.error("[AdminHomepageCategories] Save error:", e);
      showToast("error", "Erro ao salvar: " + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (card: HomepageCategoryCard) => {
    setSaving(true);
    try {
      const token = await getValidAdminToken();
      if (!token) throw new Error("Sessão expirada.");
      await api.deleteHomepageCategory(card.id, token);
      showToast("success", "Categoria removida!");
      setDeleteConfirm(null);
      await loadCards();
      invalidateHomepageCache();
    } catch (e: any) {
      showToast("error", "Erro ao deletar: " + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (card: HomepageCategoryCard) => {
    try {
      const token = await getValidAdminToken();
      if (!token) return;
      await api.updateHomepageCategory(card.id, { active: !card.active }, token);
      await loadCards();
      invalidateHomepageCache();
    } catch (e: any) {
      showToast("error", "Erro: " + (e.message || e));
    }
  };

  const filteredCategories = catSearch
    ? flatCategories.filter((c) => {
        const norm = catSearch.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const nameNorm = c.fullPath.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return nameNorm.includes(norm);
      })
    : flatCategories;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div
          className={"fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-white " + (toast.type === "success" ? "bg-green-600" : "bg-red-600")}
          style={{ fontSize: "0.85rem", fontWeight: 500 }}
        >
          {toast.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-red-50 p-2.5 rounded-xl">
            <LayoutGrid className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h2 className="text-gray-800" style={{ fontSize: "1.2rem", fontWeight: 700 }}>
              Categorias da Homepage
            </h2>
            <p className="text-gray-500" style={{ fontSize: "0.8rem" }}>
              Quadradinhos de categorias exibidos na página inicial
            </p>
          </div>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
          style={{ fontSize: "0.85rem", fontWeight: 600 }}
        >
          <Plus className="w-4 h-4" />
          Nova Categoria
        </button>
      </div>

      {/* Empty state */}
      {cards.length === 0 && (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Image className="w-14 h-14 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 mb-1" style={{ fontSize: "0.95rem", fontWeight: 600 }}>
            Nenhuma categoria adicionada
          </p>
          <p className="text-gray-400 mb-4" style={{ fontSize: "0.82rem" }}>
            Adicione categorias com imagens para exibir na página inicial.
          </p>
          <button
            onClick={openAddModal}
            className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-lg transition-colors"
            style={{ fontSize: "0.85rem", fontWeight: 600 }}
          >
            <Plus className="w-4 h-4" />
            Adicionar Categoria
          </button>
        </div>
      )}

      {/* Cards Grid */}
      {cards.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {cards.map((card) => (
            <div
              key={card.id}
              className={"relative group rounded-xl overflow-hidden border-2 transition-all " + (card.active ? "border-gray-200 hover:border-red-300" : "border-gray-200 opacity-60")}
            >
              {/* Image */}
              <div className="aspect-square bg-gray-100 relative">
                {card.imageUrl ? (
                  <img
                    src={card.imageUrl}
                    alt={card.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Image className="w-10 h-10 text-gray-300" />
                  </div>
                )}

                {/* Overlay gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                {/* Category name overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <p className="text-white truncate" style={{ fontSize: "0.85rem", fontWeight: 700 }}>
                    {card.name || card.categoryName}
                  </p>
                  <p className="text-gray-300 truncate" style={{ fontSize: "0.7rem" }}>
                    /{card.categorySlug}
                  </p>
                </div>

                {/* Active/inactive badge */}
                <div className="absolute top-2 left-2">
                  <span
                    className={"inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-white " + (card.active ? "bg-green-600/80" : "bg-gray-600/80")}
                    style={{ fontSize: "0.65rem", fontWeight: 600 }}
                  >
                    {card.active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    {card.active ? "Ativo" : "Oculto"}
                  </span>
                </div>

                {/* Order badge */}
                <div className="absolute top-2 right-2">
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/50 text-white"
                    style={{ fontSize: "0.65rem", fontWeight: 600 }}
                  >
                    <GripVertical className="w-3 h-3" />
                    #{card.order}
                  </span>
                </div>

                {/* Hover actions */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button
                    onClick={() => openEditModal(card)}
                    className="bg-white text-gray-800 p-2 rounded-lg hover:bg-gray-100 transition-colors"
                    title="Editar"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleToggleActive(card)}
                    className="bg-white text-gray-800 p-2 rounded-lg hover:bg-gray-100 transition-colors"
                    title={card.active ? "Ocultar" : "Ativar"}
                  >
                    {card.active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(card)}
                    className="bg-red-600 text-white p-2 rounded-lg hover:bg-red-700 transition-colors"
                    title="Excluir"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-gray-800 mb-2" style={{ fontSize: "1rem", fontWeight: 700 }}>
              Confirmar exclusão
            </h3>
            <p className="text-gray-500 mb-4" style={{ fontSize: "0.85rem" }}>
              Deseja excluir a categoria "<strong>{deleteConfirm.name || deleteConfirm.categoryName}</strong>"? A imagem também será removida.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                style={{ fontSize: "0.85rem", fontWeight: 500 }}
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
                style={{ fontSize: "0.85rem", fontWeight: 600 }}
                disabled={saving}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="text-gray-800" style={{ fontSize: "1.05rem", fontWeight: 700 }}>
                {modal === "add" ? "Nova Categoria" : "Editar Categoria"}
              </h3>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Image Upload */}
              <div>
                <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                  Imagem *
                </label>
                <div className="relative">
                  {formPreview ? (
                    <div className="relative aspect-square rounded-xl overflow-hidden border-2 border-dashed border-gray-200 bg-gray-50">
                      <img
                        src={formPreview}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                        <label className="cursor-pointer bg-white text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors flex items-center gap-2">
                          <Upload className="w-4 h-4" />
                          <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>Trocar Imagem</span>
                          <input
                            type="file"
                            accept="image/webp,image/png,image/jpeg,image/avif,image/gif"
                            onChange={handleFileChange}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center aspect-square rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors">
                      <Upload className="w-8 h-8 text-gray-400 mb-2" />
                      <span className="text-gray-500" style={{ fontSize: "0.82rem", fontWeight: 500 }}>
                        Clique para enviar
                      </span>
                      <span className="text-gray-400" style={{ fontSize: "0.72rem" }}>
                        WebP, PNG, JPG, AVIF (max 5MB)
                      </span>
                      <input
                        type="file"
                        accept="image/webp,image/png,image/jpeg,image/avif,image/gif"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* Category Selector */}
              <div ref={catDropdownRef}>
                <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                  Categoria *
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setCatDropdownOpen(!catDropdownOpen)}
                    className="w-full flex items-center justify-between px-3 py-2.5 border border-gray-300 rounded-lg bg-white hover:border-gray-400 transition-colors text-left"
                    style={{ fontSize: "0.85rem" }}
                  >
                    <span className={formSlug ? "text-gray-800" : "text-gray-400"}>
                      {formCatName || "Selecione uma categoria..."}
                    </span>
                    <ChevronDown className={"w-4 h-4 text-gray-400 transition-transform " + (catDropdownOpen ? "rotate-180" : "")} />
                  </button>

                  {catDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-20 max-h-64 overflow-hidden flex flex-col">
                      {/* Search */}
                      <div className="p-2 border-b border-gray-100 sticky top-0 bg-white">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                          <input
                            type="text"
                            value={catSearch}
                            onChange={(e) => setCatSearch(e.target.value)}
                            placeholder="Buscar categoria..."
                            className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-md text-gray-700 focus:outline-none focus:border-red-400"
                            style={{ fontSize: "0.8rem" }}
                            autoFocus
                          />
                        </div>
                      </div>
                      {/* Options */}
                      <div className="overflow-y-auto max-h-52">
                        {filteredCategories.length === 0 ? (
                          <p className="px-3 py-4 text-center text-gray-400" style={{ fontSize: "0.8rem" }}>
                            Nenhuma categoria encontrada.
                          </p>
                        ) : (
                          filteredCategories.map((cat, idx) => (
                            <button
                              key={cat.slug + "-" + idx}
                              onClick={() => selectCategory(cat)}
                              className={"w-full text-left px-3 py-2 hover:bg-red-50 transition-colors flex items-center gap-2 " + (cat.slug === formSlug ? "bg-red-50 text-red-700" : "text-gray-700")}
                              style={{ fontSize: "0.8rem", paddingLeft: 12 + cat.depth * 16 + "px" }}
                            >
                              <span className={cat.slug === formSlug ? "font-semibold" : ""}>
                                {cat.name}
                              </span>
                              {cat.depth > 0 && (
                                <span className="text-gray-400 ml-auto truncate max-w-[50%]" style={{ fontSize: "0.7rem" }}>
                                  {cat.fullPath}
                                </span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Display Name */}
              <div>
                <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                  Nome de exibição
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Nome exibido no card"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-700 focus:outline-none focus:border-red-400 transition-colors"
                  style={{ fontSize: "0.85rem" }}
                />
                <p className="text-gray-400 mt-1" style={{ fontSize: "0.72rem" }}>
                  Se vazio, usa o nome da categoria selecionada.
                </p>
              </div>

              {/* Order + Active row */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                    Ordem
                  </label>
                  <input
                    type="number"
                    value={formOrder}
                    onChange={(e) => setFormOrder(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-700 focus:outline-none focus:border-red-400 transition-colors"
                    style={{ fontSize: "0.85rem" }}
                    min={0}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                    Status
                  </label>
                  <button
                    type="button"
                    onClick={() => setFormActive(!formActive)}
                    className={"w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border transition-colors " + (formActive ? "bg-green-50 border-green-300 text-green-700" : "bg-gray-50 border-gray-300 text-gray-500")}
                    style={{ fontSize: "0.85rem", fontWeight: 500 }}
                  >
                    {formActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    {formActive ? "Ativo" : "Oculto"}
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 p-5 border-t border-gray-100">
              <button
                onClick={() => setModal(null)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                style={{ fontSize: "0.85rem", fontWeight: 500 }}
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-lg transition-colors disabled:opacity-50"
                style={{ fontSize: "0.85rem", fontWeight: 600 }}
                disabled={saving}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {modal === "add" ? "Adicionar" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}