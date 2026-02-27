import { useState, useEffect, useCallback, useRef } from "react";
import {
  Image as ImageIcon,
  Plus,
  Trash2,
  Edit3,
  Eye,
  EyeOff,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Save,
  X,
  Upload,
  Loader2,
  ExternalLink,
  AlertTriangle,
  Check,
  Monitor,
  Smartphone,
  Link2,
  Type,
  FileText,
  Maximize2,
} from "lucide-react";
import { supabase } from "../../services/supabaseClient";
import { getValidAdminToken } from "./adminAuth";
import * as api from "../../services/api";
import type { BannerItem } from "../../services/api";

export function AdminBanners() {
  const [banners, setBanners] = useState<BannerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Create/edit form
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formSubtitle, setFormSubtitle] = useState("");
  const [formButtonText, setFormButtonText] = useState("");
  const [formButtonLink, setFormButtonLink] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [formFile, setFormFile] = useState<File | null>(null);
  const [formPreview, setFormPreview] = useState<string | null>(null);
  const [formDimensions, setFormDimensions] = useState<{ w: number; h: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Image dimensions cache for banner list
  const [dimCache, setDimCache] = useState<Record<string, { w: number; h: number }>>({});

  // Preview
  const [previewBanner, setPreviewBanner] = useState<BannerItem | null>(null);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const getToken = useCallback(async () => {
    return await getValidAdminToken() || "";
  }, []);

  const loadBanners = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const result = await api.getAdminBanners(token);
      setBanners(result.banners || []);
    } catch (e: any) {
      setError(e.message || "Erro ao carregar banners");
      console.error("Erro ao carregar banners:", e);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    loadBanners();
  }, [loadBanners]);

  // Load image dimensions for each banner
  useEffect(() => {
    banners.forEach((b) => {
      if (dimCache[b.id] || !b.imageUrl) return;
      const img = new window.Image();
      img.onload = () => {
        setDimCache((prev) => ({
          ...prev,
          [b.id]: { w: img.naturalWidth, h: img.naturalHeight },
        }));
      };
      img.src = b.imageUrl;
    });
  }, [banners, dimCache]);

  // Detect dimensions of form preview image
  useEffect(() => {
    if (!formPreview) { setFormDimensions(null); return; }
    const img = new window.Image();
    img.onload = () => setFormDimensions({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => setFormDimensions(null);
    img.src = formPreview;
  }, [formPreview]);

  const resetForm = () => {
    setFormTitle("");
    setFormSubtitle("");
    setFormButtonText("");
    setFormButtonLink("");
    setFormActive(true);
    setFormFile(null);
    setFormPreview(null);
    setEditingId(null);
    setShowForm(false);
  };

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (banner: BannerItem) => {
    setEditingId(banner.id);
    setFormTitle(banner.title);
    setFormSubtitle(banner.subtitle);
    setFormButtonText(banner.buttonText);
    setFormButtonLink(banner.buttonLink);
    setFormActive(banner.active);
    setFormFile(null);
    setFormPreview(banner.imageUrl);
    setShowForm(true);
  };

  const handleFileSelect = (file: File) => {
    const validTypes = ["image/avif", "image/png", "image/jpeg", "image/webp", "image/gif"];
    if (!validTypes.includes(file.type)) {
      setError("Tipo não permitido. Use AVIF, PNG, JPEG, WebP ou GIF.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Arquivo muito grande. Maximo: 5MB.");
      return;
    }
    setFormFile(file);
    setFormPreview(URL.createObjectURL(file));
    setError("");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleSave = async () => {
    if (!editingId && !formFile) {
      setError("Selecione uma imagem para o banner.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const token = await getToken();
      const meta = {
        title: formTitle,
        subtitle: formSubtitle,
        buttonText: formButtonText,
        buttonLink: formButtonLink,
        order: banners.length,
        active: formActive,
      };

      if (editingId) {
        if (formFile) {
          await api.updateBannerWithImage(editingId, formFile, meta, token);
        } else {
          await api.updateBanner(editingId, {
            title: formTitle,
            subtitle: formSubtitle,
            buttonText: formButtonText,
            buttonLink: formButtonLink,
            active: formActive,
          }, token);
        }
      } else {
        await api.createBanner(formFile!, meta, token);
      }

      resetForm();
      await loadBanners();
    } catch (e: any) {
      setError(e.message || "Erro ao salvar banner");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    try {
      const token = await getToken();
      await api.deleteBanner(id, token);
      setDeleteConfirm(null);
      await loadBanners();
    } catch (e: any) {
      setError(e.message || "Erro ao excluir banner");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (banner: BannerItem) => {
    try {
      const token = await getToken();
      await api.updateBanner(banner.id, { active: !banner.active }, token);
      await loadBanners();
    } catch (e: any) {
      setError(e.message || "Erro ao atualizar status");
    }
  };

  const moveBanner = async (index: number, direction: "up" | "down") => {
    const newBanners = [...banners];
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= newBanners.length) return;

    [newBanners[index], newBanners[targetIdx]] = [newBanners[targetIdx], newBanners[index]];
    setBanners(newBanners);

    try {
      const token = await getToken();
      await api.reorderBanners(newBanners.map((b) => b.id), token);
    } catch (e: any) {
      setError(e.message || "Erro ao reordenar");
      await loadBanners();
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const activeCount = banners.filter((b) => b.active).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-gray-800" style={{ fontSize: "1.4rem", fontWeight: 700 }}>
            Banners da Home
          </h2>
          <p className="text-gray-500 mt-1" style={{ fontSize: "0.85rem" }}>
            Gerencie os banners do carrossel da página inicial
          </p>
        </div>
        <button
          onClick={openCreateForm}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-lg transition-colors"
          style={{ fontSize: "0.85rem", fontWeight: 600 }}
        >
          <Plus className="w-4 h-4" />
          Novo Banner
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-gray-400" style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Total</p>
          <p className="text-gray-800 mt-1" style={{ fontSize: "1.5rem", fontWeight: 700 }}>{banners.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-green-600" style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Ativos</p>
          <p className="text-green-600 mt-1" style={{ fontSize: "1.5rem", fontWeight: 700 }}>{activeCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-gray-400" style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Inativos</p>
          <p className="text-gray-500 mt-1" style={{ fontSize: "1.5rem", fontWeight: 700 }}>{banners.length - activeCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-blue-600" style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Com Link</p>
          <p className="text-blue-600 mt-1" style={{ fontSize: "1.5rem", fontWeight: 700 }}>{banners.filter((b) => b.buttonLink).length}</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-red-700" style={{ fontSize: "0.85rem" }}>{error}</p>
          <button onClick={() => setError("")} className="ml-auto text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Create/Edit Form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center justify-between">
            <h3 className="text-gray-800" style={{ fontSize: "0.95rem", fontWeight: 600 }}>
              {editingId ? "Editar Banner" : "Novo Banner"}
            </h3>
            <button onClick={resetForm} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 space-y-5">
            {/* Image Upload */}
            <div>
              <label className="text-gray-700 block mb-2" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                Imagem do Banner *
              </label>
              <p className="text-gray-400 mb-2" style={{ fontSize: "0.75rem" }}>
                Recomendado: 1920x600px ou proporcional. Formatos: AVIF, PNG, JPEG, WebP, GIF. Max: 5MB.
              </p>

              <div
                className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
                  dragOver ? "border-red-400 bg-red-50" : "border-gray-200 hover:border-gray-300 bg-gray-50"
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                {formPreview ? (
                  <div className="relative">
                    <img
                      src={formPreview}
                      alt="Preview"
                      className="w-full max-h-48 object-cover rounded-lg"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                      <p className="text-white" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                        Clique para trocar a imagem
                      </p>
                    </div>
                    {formFile && (
                      <div className="absolute bottom-2 right-2 bg-green-600 text-white px-2 py-1 rounded-md flex items-center gap-1" style={{ fontSize: "0.7rem" }}>
                        <Check className="w-3 h-3" />
                        Nova imagem selecionada
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <Upload className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500" style={{ fontSize: "0.85rem" }}>
                      Arraste uma imagem ou clique para selecionar
                    </p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/avif,image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                  e.target.value = "";
                }}
              />
              {/* Image dimensions & file info */}
              {(formDimensions || formFile) && (
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  {formDimensions && (
                    <span className="flex items-center gap-1.5 text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-1 rounded-lg font-mono" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                      <Maximize2 className="w-3.5 h-3.5" />
                      {formDimensions.w} x {formDimensions.h}px
                      <span className="text-purple-400 font-normal ml-1">
                        ({(formDimensions.w / formDimensions.h).toFixed(2)}:1)
                      </span>
                    </span>
                  )}
                  {formFile && (
                    <span className="text-gray-500 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-lg" style={{ fontSize: "0.78rem" }}>
                      {formatSize(formFile.size)} &middot; {formFile.type.split("/")[1]?.toUpperCase()}
                    </span>
                  )}
                  {formDimensions && formDimensions.w < 1920 && (
                    <span className="flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg" style={{ fontSize: "0.75rem" }}>
                      <AlertTriangle className="w-3 h-3" />
                      Largura abaixo do recomendado (1920px)
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Text Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-gray-700 flex items-center gap-1.5 mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                  <Type className="w-3.5 h-3.5" /> Título (overlay)
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Ex: Promoção de Inverno"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 placeholder-gray-400 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 focus:bg-white transition-all"
                  style={{ fontSize: "0.85rem" }}
                />
              </div>
              <div>
                <label className="text-gray-700 flex items-center gap-1.5 mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                  <FileText className="w-3.5 h-3.5" /> Subtitulo
                </label>
                <input
                  type="text"
                  value={formSubtitle}
                  onChange={(e) => setFormSubtitle(e.target.value)}
                  placeholder="Ex: Até 50% de desconto em peças selecionadas"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 placeholder-gray-400 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 focus:bg-white transition-all"
                  style={{ fontSize: "0.85rem" }}
                />
              </div>
              <div>
                <label className="text-gray-700 flex items-center gap-1.5 mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                  <ExternalLink className="w-3.5 h-3.5" /> Texto do Botao
                </label>
                <input
                  type="text"
                  value={formButtonText}
                  onChange={(e) => setFormButtonText(e.target.value)}
                  placeholder="Ex: Ver Ofertas"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 placeholder-gray-400 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 focus:bg-white transition-all"
                  style={{ fontSize: "0.85rem" }}
                />
              </div>
              <div>
                <label className="text-gray-700 flex items-center gap-1.5 mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                  <Link2 className="w-3.5 h-3.5" /> Link do Botao
                </label>
                <input
                  type="text"
                  value={formButtonLink}
                  onChange={(e) => setFormButtonLink(e.target.value)}
                  placeholder="Ex: /catalogo ou https://..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 placeholder-gray-400 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 focus:bg-white transition-all"
                  style={{ fontSize: "0.85rem" }}
                />
              </div>
            </div>

            {/* Active toggle */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setFormActive(!formActive)}
                className={`relative w-11 h-6 rounded-full transition-colors ${formActive ? "bg-green-500" : "bg-gray-300"}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    formActive ? "translate-x-5" : ""
                  }`}
                />
              </button>
              <span className="text-gray-700" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                {formActive ? "Ativo (visivel na Home)" : "Inativo (oculto na Home)"}
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg transition-colors"
                style={{ fontSize: "0.85rem", fontWeight: 600 }}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editingId ? "Salvar Alteracoes" : "Criar Banner"}
              </button>
              <button
                onClick={resetForm}
                className="text-gray-500 hover:text-gray-700 px-4 py-2.5 rounded-lg transition-colors"
                style={{ fontSize: "0.85rem" }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Banner List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
        </div>
      ) : banners.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <ImageIcon className="w-14 h-14 text-gray-200 mx-auto mb-3" />
          <h3 className="text-gray-600 mb-1" style={{ fontSize: "1rem", fontWeight: 600 }}>
            Nenhum banner cadastrado
          </h3>
          <p className="text-gray-400 mb-4" style={{ fontSize: "0.85rem" }}>
            Crie banners para exibir no carrossel da página inicial.
          </p>
          <button
            onClick={openCreateForm}
            className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-lg transition-colors"
            style={{ fontSize: "0.85rem", fontWeight: 600 }}
          >
            <Plus className="w-4 h-4" />
            Criar Primeiro Banner
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {banners.map((banner, idx) => (
            <div
              key={banner.id}
              className={`bg-white border rounded-xl overflow-hidden transition-all ${
                banner.active ? "border-gray-200" : "border-gray-200 opacity-60"
              }`}
            >
              <div className="flex flex-col sm:flex-row">
                {/* Thumbnail */}
                <div className="sm:w-64 h-36 sm:h-auto relative shrink-0 bg-gray-100">
                  <img
                    src={banner.imageUrl}
                    alt={banner.title || "Banner"}
                    className="w-full h-full object-cover"
                  />
                  {!banner.active && (
                    <div className="absolute inset-0 bg-gray-900/50 flex items-center justify-center">
                      <span className="bg-gray-800 text-gray-300 px-3 py-1 rounded-full" style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                        INATIVO
                      </span>
                    </div>
                  )}
                  <div className="absolute top-2 left-2 bg-black/60 text-white px-2 py-0.5 rounded-md" style={{ fontSize: "0.7rem", fontWeight: 700 }}>
                    #{idx + 1}
                  </div>
                  {dimCache[banner.id] && (
                    <div className="absolute bottom-2 right-2 bg-black/60 text-white px-1.5 py-0.5 rounded font-mono" style={{ fontSize: "0.62rem", fontWeight: 600 }}>
                      {dimCache[banner.id].w}x{dimCache[banner.id].h}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 p-4 flex flex-col justify-between min-w-0">
                  <div>
                    <div className="flex items-start gap-2 mb-1">
                      <h4 className="text-gray-800 truncate" style={{ fontSize: "0.95rem", fontWeight: 600 }}>
                        {banner.title || "(Sem titulo)"}
                      </h4>
                      {banner.active ? (
                        <span className="shrink-0 bg-green-100 text-green-700 px-2 py-0.5 rounded-full" style={{ fontSize: "0.65rem", fontWeight: 600 }}>
                          ATIVO
                        </span>
                      ) : (
                        <span className="shrink-0 bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full" style={{ fontSize: "0.65rem", fontWeight: 600 }}>
                          INATIVO
                        </span>
                      )}
                    </div>
                    {banner.subtitle && (
                      <p className="text-gray-500 truncate" style={{ fontSize: "0.8rem" }}>{banner.subtitle}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-3 mt-2">
                      {banner.buttonText && (
                        <span className="flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-0.5 rounded" style={{ fontSize: "0.72rem" }}>
                          <ExternalLink className="w-3 h-3" />
                          {banner.buttonText}
                        </span>
                      )}
                      {banner.buttonLink && (
                        <span className="text-gray-400 truncate max-w-[200px]" style={{ fontSize: "0.72rem" }}>
                          {banner.buttonLink}
                        </span>
                      )}
                      {banner.fileSize && (
                        <span className="text-gray-400" style={{ fontSize: "0.72rem" }}>
                          {formatSize(banner.fileSize)}
                        </span>
                      )}
                      {dimCache[banner.id] && (
                        <span className="flex items-center gap-1 text-purple-600 bg-purple-50 px-2 py-0.5 rounded font-mono" style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                          <Maximize2 className="w-3 h-3" />
                          {dimCache[banner.id].w} x {dimCache[banner.id].h}px
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                    <button
                      onClick={() => moveBanner(idx, "up")}
                      disabled={idx === 0}
                      className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md disabled:opacity-30 transition-colors"
                      title="Mover para cima"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => moveBanner(idx, "down")}
                      disabled={idx === banners.length - 1}
                      className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md disabled:opacity-30 transition-colors"
                      title="Mover para baixo"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <div className="w-px h-5 bg-gray-200 mx-1" />
                    <button
                      onClick={() => toggleActive(banner)}
                      className={`flex items-center gap-1 px-2 py-1.5 rounded-md transition-colors ${
                        banner.active
                          ? "text-amber-600 hover:bg-amber-50"
                          : "text-green-600 hover:bg-green-50"
                      }`}
                      style={{ fontSize: "0.75rem", fontWeight: 500 }}
                    >
                      {banner.active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      {banner.active ? "Desativar" : "Ativar"}
                    </button>
                    <button
                      onClick={() => setPreviewBanner(banner)}
                      className="flex items-center gap-1 px-2 py-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                      style={{ fontSize: "0.75rem", fontWeight: 500 }}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Preview
                    </button>
                    <button
                      onClick={() => openEditForm(banner)}
                      className="flex items-center gap-1 px-2 py-1.5 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                      style={{ fontSize: "0.75rem", fontWeight: 500 }}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Editar
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(banner.id)}
                      className="flex items-center gap-1 px-2 py-1.5 text-red-500 hover:bg-red-50 rounded-md transition-colors"
                      style={{ fontSize: "0.75rem", fontWeight: 500 }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Excluir
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-red-100 p-2 rounded-full">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-gray-800" style={{ fontSize: "1rem", fontWeight: 600 }}>
                Excluir Banner
              </h3>
            </div>
            <p className="text-gray-600 mb-6" style={{ fontSize: "0.9rem" }}>
              Tem certeza que deseja excluir este banner? A imagem será removida permanentemente.
            </p>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                style={{ fontSize: "0.85rem" }}
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={saving}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors"
                style={{ fontSize: "0.85rem", fontWeight: 600 }}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewBanner && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50">
              <h3 className="text-gray-800" style={{ fontSize: "0.95rem", fontWeight: 600 }}>
                Preview do Banner
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPreviewDevice("desktop")}
                  className={`p-1.5 rounded-md transition-colors ${previewDevice === "desktop" ? "bg-red-100 text-red-600" : "text-gray-400 hover:text-gray-600"}`}
                  title="Desktop"
                >
                  <Monitor className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPreviewDevice("mobile")}
                  className={`p-1.5 rounded-md transition-colors ${previewDevice === "mobile" ? "bg-red-100 text-red-600" : "text-gray-400 hover:text-gray-600"}`}
                  title="Mobile"
                >
                  <Smartphone className="w-4 h-4" />
                </button>
                <div className="w-px h-5 bg-gray-200 mx-1" />
                <button onClick={() => setPreviewBanner(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-5 bg-gray-100 flex items-center justify-center">
              <div
                className={`bg-gray-900 overflow-hidden rounded-lg shadow-lg transition-all ${
                  previewDevice === "mobile" ? "w-[375px]" : "w-full"
                }`}
              >
                <div className="relative">
                  <img
                    src={previewBanner.imageUrl}
                    alt={previewBanner.title || "Banner"}
                    className="w-full object-cover"
                    style={{ maxHeight: previewDevice === "mobile" ? "200px" : "400px" }}
                  />
                  {(previewBanner.title || previewBanner.subtitle || previewBanner.buttonText) && (
                    <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-transparent flex items-center">
                      <div className={`${previewDevice === "mobile" ? "p-4" : "p-8 lg:p-12"} max-w-xl`}>
                        {previewBanner.title && (
                          <h2
                            className="text-white mb-2"
                            style={{
                              fontSize: previewDevice === "mobile" ? "1.2rem" : "2rem",
                              fontWeight: 700,
                              lineHeight: 1.2,
                            }}
                          >
                            {previewBanner.title}
                          </h2>
                        )}
                        {previewBanner.subtitle && (
                          <p
                            className="text-gray-200 mb-4"
                            style={{ fontSize: previewDevice === "mobile" ? "0.8rem" : "0.95rem" }}
                          >
                            {previewBanner.subtitle}
                          </p>
                        )}
                        {previewBanner.buttonText && (
                          <span
                            className="inline-flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg"
                            style={{ fontSize: previewDevice === "mobile" ? "0.8rem" : "0.9rem", fontWeight: 600 }}
                          >
                            {previewBanner.buttonText}
                            <ExternalLink className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tips */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h4 className="text-blue-800 mb-2" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
          Dicas para banners eficazes
        </h4>
        <ul className="space-y-1">
          <li className="text-blue-700 flex items-start gap-2" style={{ fontSize: "0.8rem" }}>
            <span className="text-blue-400 mt-0.5">-</span>
            Use imagens com resolução mínima de 1920x600px para boa qualidade em desktop
          </li>
          <li className="text-blue-700 flex items-start gap-2" style={{ fontSize: "0.8rem" }}>
            <span className="text-blue-400 mt-0.5">-</span>
            Mantenha textos importantes na area esquerda da imagem (o overlay de texto fica a esquerda)
          </li>
          <li className="text-blue-700 flex items-start gap-2" style={{ fontSize: "0.8rem" }}>
            <span className="text-blue-400 mt-0.5">-</span>
            Título e subtítulo são opcionais — se vazio, o banner exibe apenas a imagem
          </li>
          <li className="text-blue-700 flex items-start gap-2" style={{ fontSize: "0.8rem" }}>
            <span className="text-blue-400 mt-0.5">-</span>
            Use a ordem (setas) para definir a sequência de exibição no carrossel
          </li>
        </ul>
      </div>
    </div>
  );
}