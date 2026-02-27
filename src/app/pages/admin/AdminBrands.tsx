import { useState, useEffect, useCallback, useRef } from "react";
import {
  Award,
  Plus,
  Trash2,
  Edit3,
  Upload,
  X,
  Loader2,
  Eye,
  EyeOff,
  Search,
  CheckCircle2,
  AlertCircle,
  Save,
  Package,
  Palette,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import * as api from "../../services/api";
import type { BrandItem, ProdutoDB } from "../../services/api";
import { supabase } from "../../services/supabaseClient";
import { getValidAdminToken } from "./adminAuth";
import { invalidateHomepageCache } from "../../contexts/HomepageInitContext";

export function AdminBrands() {
  const [brands, setBrands] = useState<BrandItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Modal
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editBrand, setEditBrand] = useState<BrandItem | null>(null);
  const [formName, setFormName] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formBgColor, setFormBgColor] = useState("#ffffff");
  const [formOrder, setFormOrder] = useState(0);
  const [formActive, setFormActive] = useState(true);
  const [formFile, setFormFile] = useState<File | null>(null);
  const [formPreview, setFormPreview] = useState<string | null>(null);
  const [formProducts, setFormProducts] = useState<Array<{ sku: string; titulo: string }>>([]);
  const [formZoom, setFormZoom] = useState(1);

  // Product search
  const [prodSearch, setProdSearch] = useState("");
  const [prodResults, setProdResults] = useState<ProdutoDB[]>([]);
  const [prodSearching, setProdSearching] = useState(false);
  const prodSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<BrandItem | null>(null);

  const showToast = useCallback((type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Load brands
  const loadBrands = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getBrands();
      var items = res.brands || [];
      items.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      setBrands(items);
    } catch (e: any) {
      console.error("[AdminBrands] Load error:", e);
      showToast("error", "Erro ao carregar marcas: " + e.message);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadBrands(); }, [loadBrands]);

  // Generate slug from name
  const generateSlug = (name: string): string => {
    return name.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  // Open add modal
  const openAdd = () => {
    setEditBrand(null);
    setFormName("");
    setFormSlug("");
    setFormBgColor("#ffffff");
    setFormOrder(brands.length);
    setFormActive(true);
    setFormFile(null);
    setFormPreview(null);
    setFormProducts([]);
    setProdSearch("");
    setProdResults([]);
    setFormZoom(1);
    setModal("add");
  };

  // Open edit modal
  const openEdit = (brand: BrandItem) => {
    setEditBrand(brand);
    setFormName(brand.name);
    setFormSlug(brand.slug);
    setFormBgColor(brand.bgColor || "#ffffff");
    setFormOrder(brand.order);
    setFormActive(brand.active);
    setFormFile(null);
    setFormPreview(brand.logoUrl || null);
    setFormProducts(brand.products || []);
    setProdSearch("");
    setProdResults([]);
    setFormZoom(brand.logoZoom || 1);
    setModal("edit");
  };

  const closeModal = () => {
    setModal(null);
    setEditBrand(null);
  };

  // File handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFormFile(file);
    const reader = new FileReader();
    reader.onload = () => setFormPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  // Product search with debounce
  const searchProducts = useCallback((query: string) => {
    if (prodSearchTimer.current) clearTimeout(prodSearchTimer.current);
    if (!query.trim()) {
      setProdResults([]);
      return;
    }
    setProdSearching(true);
    prodSearchTimer.current = setTimeout(async () => {
      try {
        const res = await api.getCatalog(1, 20, query.trim());
        setProdResults(res.data || []);
      } catch (e) {
        console.error("[AdminBrands] Product search error:", e);
      } finally {
        setProdSearching(false);
      }
    }, 400);
  }, []);

  const handleProdSearchChange = (val: string) => {
    setProdSearch(val);
    searchProducts(val);
  };

  const addProduct = (p: ProdutoDB) => {
    if (formProducts.some(function (fp) { return fp.sku === p.sku; })) return;
    setFormProducts([...formProducts, { sku: p.sku, titulo: p.titulo }]);
  };

  const removeProduct = (sku: string) => {
    setFormProducts(formProducts.filter(function (p) { return p.sku !== sku; }));
  };

  // Save (create or update)
  const handleSave = async () => {
    if (!formName.trim()) {
      showToast("error", "Nome da marca é obrigatório.");
      return;
    }
    if (modal === "add" && !formFile) {
      showToast("error", "Selecione uma imagem de logo.");
      return;
    }

    setSaving(true);
    try {
      const token = await getValidAdminToken();
      if (!token) {
        showToast("error", "Sessão expirada. Faça login novamente.");
        setSaving(false);
        return;
      }

      var slug = formSlug.trim() || generateSlug(formName);

      if (modal === "add") {
        await api.createBrand(formFile!, {
          name: formName.trim(),
          slug: slug,
          bgColor: formBgColor,
          order: formOrder,
          active: formActive,
          products: formProducts,
          logoZoom: formZoom,
        }, token);
        showToast("success", "Marca criada com sucesso!");
      } else if (modal === "edit" && editBrand) {
        await api.updateBrand(editBrand.id, {
          name: formName.trim(),
          slug: slug,
          bgColor: formBgColor,
          order: formOrder,
          active: formActive,
          products: formProducts,
          logoZoom: formZoom,
        }, token, formFile);
        showToast("success", "Marca atualizada com sucesso!");
      }

      closeModal();
      invalidateHomepageCache();
      await loadBrands();
    } catch (e: any) {
      console.error("[AdminBrands] Save error:", e);
      showToast("error", "Erro ao salvar: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  // Delete
  const handleDelete = async (brand: BrandItem) => {
    try {
      const token = await getValidAdminToken();
      if (!token) return;
      await api.deleteBrand(brand.id, token);
      showToast("success", "Marca excluída!");
      setDeleteConfirm(null);
      invalidateHomepageCache();
      await loadBrands();
    } catch (e: any) {
      console.error("[AdminBrands] Delete error:", e);
      showToast("error", "Erro ao excluir: " + e.message);
    }
  };

  // Toggle active
  const toggleActive = async (brand: BrandItem) => {
    try {
      const token = await getValidAdminToken();
      if (!token) return;
      await api.updateBrand(brand.id, { active: !brand.active }, token);
      invalidateHomepageCache();
      await loadBrands();
    } catch (e: any) {
      showToast("error", "Erro ao alterar status: " + e.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={"fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-white " + (toast.type === "success" ? "bg-emerald-600" : "bg-red-600")} style={{ fontSize: "0.82rem", fontWeight: 600 }}>
          {toast.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Award className="w-6 h-6 text-red-500" />
          <h2 className="text-gray-800" style={{ fontSize: "1.15rem", fontWeight: 700 }}>
            Marcas
          </h2>
          <span className="text-gray-400" style={{ fontSize: "0.75rem" }}>
            {brands.length} {brands.length === 1 ? "marca" : "marcas"}
          </span>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
          style={{ fontSize: "0.82rem", fontWeight: 600 }}
        >
          <Plus className="w-4 h-4" />
          Nova Marca
        </button>
      </div>

      {/* Brands List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-red-500 animate-spin" />
        </div>
      ) : brands.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
          <Award className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500" style={{ fontSize: "0.9rem", fontWeight: 600 }}>Nenhuma marca cadastrada</p>
          <p className="text-gray-400 mt-1" style={{ fontSize: "0.8rem" }}>
            Clique em "Nova Marca" para adicionar a primeira.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {brands.map(function (brand) {
            return (
              <div
                key={brand.id}
                className={"bg-white rounded-xl border p-4 flex items-center gap-4 transition-all " + (brand.active ? "border-gray-200" : "border-gray-100 opacity-60")}
              >
                {/* Logo preview */}
                <div
                  className="w-16 h-16 rounded-lg flex items-center justify-center shrink-0 overflow-hidden border border-gray-100"
                  style={{ backgroundColor: brand.bgColor || "#ffffff" }}
                >
                  {brand.logoUrl ? (
                    <img
                      src={brand.logoUrl}
                      alt={brand.name}
                      className="max-w-[48px] max-h-[48px] object-contain"
                      style={brand.logoZoom && brand.logoZoom !== 1 ? { transform: "scale(" + brand.logoZoom + ")" } : undefined}
                    />
                  ) : (
                    <Award className="w-6 h-6 text-gray-300" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-gray-800 font-semibold truncate" style={{ fontSize: "0.88rem" }}>
                      {brand.name}
                    </h4>
                    {!brand.active && (
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Inativa</span>
                    )}
                  </div>
                  <p className="text-gray-400 truncate" style={{ fontSize: "0.72rem" }}>
                    /{brand.slug} &middot; {(brand.products || []).length} produtos &middot; Ordem: {brand.order}
                  </p>
                </div>

                {/* Color swatch */}
                <div
                  className="w-7 h-7 rounded-full border border-gray-200 shrink-0"
                  style={{ backgroundColor: brand.bgColor || "#ffffff" }}
                  title={"Cor de fundo: " + (brand.bgColor || "#ffffff")}
                />

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => toggleActive(brand)}
                    className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                    title={brand.active ? "Desativar" : "Ativar"}
                  >
                    {brand.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => openEdit(brand)}
                    className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors"
                    title="Editar"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(brand)}
                    className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                    title="Excluir"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirm dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-gray-800 mb-3" style={{ fontSize: "1rem", fontWeight: 700 }}>
              Excluir marca?
            </h3>
            <p className="text-gray-500 mb-5" style={{ fontSize: "0.82rem" }}>
              A marca <strong>{deleteConfirm.name}</strong> será excluída permanentemente. Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                style={{ fontSize: "0.82rem", fontWeight: 500 }}
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
                style={{ fontSize: "0.82rem", fontWeight: 600 }}
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <h3 className="text-gray-800" style={{ fontSize: "1.05rem", fontWeight: 700 }}>
                {modal === "add" ? "Nova Marca" : "Editar Marca"}
              </h3>
              <button
                onClick={closeModal}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Logo upload */}
              <div>
                <label className="block text-gray-600 mb-2" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                  Logo da Marca *
                </label>
                <div className="flex items-start gap-4">
                  {/* Live preview box — simulates how it looks in the carousel */}
                  <div className="shrink-0">
                    <div
                      className="w-[130px] h-[80px] rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden"
                      style={{ backgroundColor: formBgColor }}
                    >
                      {formPreview ? (
                        <img
                          src={formPreview}
                          alt="Preview"
                          className="object-contain transition-transform duration-150"
                          style={{
                            maxWidth: "90px",
                            maxHeight: "55px",
                            transform: "scale(" + formZoom + ")",
                          }}
                        />
                      ) : (
                        <Upload className="w-6 h-6 text-gray-300" />
                      )}
                    </div>
                    <p className="text-gray-400 text-center mt-1" style={{ fontSize: "0.6rem" }}>
                      Preview carrossel (130×80)
                    </p>
                  </div>

                  <div className="flex-1 space-y-3">
                    <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors" style={{ fontSize: "0.8rem", fontWeight: 500 }}>
                      <Upload className="w-4 h-4" />
                      {formFile ? "Trocar imagem" : "Selecionar imagem"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/avif,image/gif,image/svg+xml"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                    </label>
                    <p className="text-gray-400" style={{ fontSize: "0.68rem" }}>
                      PNG, JPG, WebP, SVG. Máximo 5MB.
                    </p>

                    {/* Zoom slider */}
                    {formPreview && (
                      <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-gray-600 flex items-center gap-1" style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                            <ZoomIn className="w-3.5 h-3.5" />
                            Zoom do Logo
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setFormZoom(1)}
                              className="text-gray-400 hover:text-red-600 transition-colors"
                              style={{ fontSize: "0.65rem", fontWeight: 500 }}
                              title="Resetar zoom"
                            >
                              Reset
                            </button>
                            <span className="text-red-600 font-mono font-bold" style={{ fontSize: "0.78rem" }}>
                              {Math.round(formZoom * 100)}%
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <ZoomOut className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <input
                            type="range"
                            min={30}
                            max={300}
                            step={5}
                            value={Math.round(formZoom * 100)}
                            onChange={(e) => setFormZoom(parseInt(e.target.value, 10) / 100)}
                            className="flex-1 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-red-500"
                          />
                          <ZoomIn className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        </div>
                        <div className="flex justify-between text-gray-400 mt-0.5 px-5" style={{ fontSize: "0.58rem" }}>
                          <span>30%</span>
                          <span>100%</span>
                          <span>200%</span>
                          <span>300%</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Name + Slug */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-600 mb-1.5" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                    Nome da Marca *
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => {
                      setFormName(e.target.value);
                      if (!editBrand) setFormSlug(generateSlug(e.target.value));
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-gray-700 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                    style={{ fontSize: "0.85rem" }}
                    placeholder="Ex: Bosch"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1.5" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                    Slug (URL)
                  </label>
                  <input
                    type="text"
                    value={formSlug}
                    onChange={(e) => setFormSlug(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-gray-700 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                    style={{ fontSize: "0.85rem" }}
                    placeholder="bosch"
                  />
                  <p className="text-gray-400 mt-1" style={{ fontSize: "0.68rem" }}>
                    URL: /marca/{formSlug || "..."}
                  </p>
                </div>
              </div>

              {/* Background Color + Order + Active */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-gray-600 mb-1.5" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                    <Palette className="w-3.5 h-3.5 inline mr-1" />
                    Cor de Fundo
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formBgColor}
                      onChange={(e) => setFormBgColor(e.target.value)}
                      className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"
                    />
                    <input
                      type="text"
                      value={formBgColor}
                      onChange={(e) => setFormBgColor(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-gray-700 focus:ring-2 focus:ring-red-500 outline-none font-mono"
                      style={{ fontSize: "0.8rem" }}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-gray-600 mb-1.5" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                    Ordem
                  </label>
                  <input
                    type="number"
                    value={formOrder}
                    onChange={(e) => setFormOrder(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-gray-700 focus:ring-2 focus:ring-red-500 outline-none"
                    style={{ fontSize: "0.85rem" }}
                    min={0}
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1.5" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                    Status
                  </label>
                  <button
                    onClick={() => setFormActive(!formActive)}
                    className={"w-full px-3 py-2 rounded-lg border transition-colors flex items-center justify-center gap-2 " + (formActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-gray-50 text-gray-500")}
                    style={{ fontSize: "0.82rem", fontWeight: 600 }}
                  >
                    {formActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    {formActive ? "Ativa" : "Inativa"}
                  </button>
                </div>
              </div>

              {/* Products Section */}
              <div>
                <label className="block text-gray-600 mb-2" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                  <Package className="w-3.5 h-3.5 inline mr-1" />
                  Produtos ({formProducts.length})
                </label>

                {/* Search products */}
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={prodSearch}
                    onChange={(e) => handleProdSearchChange(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 text-gray-700 focus:ring-2 focus:ring-red-500 outline-none"
                    style={{ fontSize: "0.82rem" }}
                    placeholder="Buscar produto por nome ou SKU..."
                  />
                  {prodSearching && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
                  )}
                </div>

                {/* Search results */}
                {prodResults.length > 0 && (
                  <div className="bg-gray-50 rounded-lg border border-gray-200 max-h-48 overflow-y-auto mb-3">
                    {prodResults.map(function (p) {
                      var alreadyAdded = formProducts.some(function (fp) { return fp.sku === p.sku; });
                      return (
                        <button
                          key={p.sku}
                          onClick={() => { if (!alreadyAdded) addProduct(p); }}
                          disabled={alreadyAdded}
                          className={"w-full text-left px-3 py-2 flex items-center justify-between transition-colors border-b border-gray-100 last:border-0 " + (alreadyAdded ? "bg-emerald-50 opacity-60 cursor-not-allowed" : "hover:bg-white cursor-pointer")}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-gray-700 truncate" style={{ fontSize: "0.8rem", fontWeight: 500 }}>{p.titulo}</p>
                            <p className="text-gray-400" style={{ fontSize: "0.68rem" }}>SKU: {p.sku}</p>
                          </div>
                          {alreadyAdded ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 ml-2" />
                          ) : (
                            <Plus className="w-4 h-4 text-gray-400 shrink-0 ml-2" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Selected products */}
                {formProducts.length > 0 ? (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {formProducts.map(function (p, idx) {
                      return (
                        <div
                          key={p.sku}
                          className="flex items-center gap-2 bg-white border border-gray-100 rounded-lg px-3 py-2"
                        >
                          <span className="text-gray-300 shrink-0" style={{ fontSize: "0.68rem", fontWeight: 600 }}>{idx + 1}.</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-gray-700 truncate" style={{ fontSize: "0.78rem", fontWeight: 500 }}>{p.titulo}</p>
                            <p className="text-gray-400" style={{ fontSize: "0.65rem" }}>SKU: {p.sku}</p>
                          </div>
                          <button
                            onClick={() => removeProduct(p.sku)}
                            className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-gray-400 text-center py-4" style={{ fontSize: "0.78rem" }}>
                    Nenhum produto adicionado. Use a busca acima para adicionar.
                  </p>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex justify-end gap-3 rounded-b-2xl">
              <button
                onClick={closeModal}
                className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                style={{ fontSize: "0.82rem", fontWeight: 500 }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-60"
                style={{ fontSize: "0.82rem", fontWeight: 600 }}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}