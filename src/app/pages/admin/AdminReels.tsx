import { useState, useEffect, useRef } from "react";
import Play from "lucide-react/dist/esm/icons/play.js";
import Plus from "lucide-react/dist/esm/icons/plus.js";
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js";
import Edit3 from "lucide-react/dist/esm/icons/edit-3.js";
import Loader2 from "lucide-react/dist/esm/icons/loader-2.js";
import Upload from "lucide-react/dist/esm/icons/upload.js";
import X from "lucide-react/dist/esm/icons/x.js";
import Eye from "lucide-react/dist/esm/icons/eye.js";
import EyeOff from "lucide-react/dist/esm/icons/eye-off.js";
import GripVertical from "lucide-react/dist/esm/icons/grip-vertical.js";
import AlertTriangle from "lucide-react/dist/esm/icons/alert-triangle.js";
import Film from "lucide-react/dist/esm/icons/film.js";
import ChevronUp from "lucide-react/dist/esm/icons/chevron-up.js";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down.js";
import Search from "lucide-react/dist/esm/icons/search.js";
import Check from "lucide-react/dist/esm/icons/check.js";
import Package from "lucide-react/dist/esm/icons/package.js";
import ArrowUp from "lucide-react/dist/esm/icons/arrow-up.js";
import ArrowDown from "lucide-react/dist/esm/icons/arrow-down.js";
import Camera from "lucide-react/dist/esm/icons/camera.js";
import SkipBack from "lucide-react/dist/esm/icons/skip-back.js";
import SkipForward from "lucide-react/dist/esm/icons/skip-forward.js";
import Pause from "lucide-react/dist/esm/icons/pause.js";
import * as api from "../../services/api";
import type { ReelItem, ReelProduct } from "../../services/api";
import { getValidAdminToken } from "./adminAuth";

interface LinkedProduct {
  sku: string;
  title: string;
  imageUrl: string;
  pricePreview: string;
}

export function AdminReels() {
  var [reels, setReels] = useState<ReelItem[]>([]);
  var [loading, setLoading] = useState(true);
  var [error, setError] = useState("");
  var [showForm, setShowForm] = useState(false);
  var [editingId, setEditingId] = useState<string | null>(null);
  var [saving, setSaving] = useState(false);
  var [saveProgress, setSaveProgress] = useState("");
  var [deleting, setDeleting] = useState<string | null>(null);

  // Form state
  var [title, setTitle] = useState("");
  var [linkedProducts, setLinkedProducts] = useState<LinkedProduct[]>([]);
  var [active, setActive] = useState(true);
  var [showOnProduct, setShowOnProduct] = useState(false);
  var [videoFile, setVideoFile] = useState<File | null>(null);
  var [thumbFile, setThumbFile] = useState<File | null>(null);
  var videoInputRef = useRef<HTMLInputElement>(null);
  var thumbInputRef = useRef<HTMLInputElement>(null);

  // Product search
  var [skuSearch, setSkuSearch] = useState("");
  var [searchResults, setSearchResults] = useState<Array<{ sku: string; titulo: string }>>([]);
  var [searching, setSearching] = useState(false);
  var searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drag & drop state for product reordering
  var [dragIdx, setDragIdx] = useState<number | null>(null);
  var [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  async function loadReels() {
    setLoading(true);
    setError("");
    try {
      var token = await getValidAdminToken();
      if (!token) { setError("Sessao expirada."); return; }
      var res = await api.getAdminReels(token);
      setReels(res.reels || []);
    } catch (e: any) {
      setError(e.message || "Erro ao carregar reels.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(function () { loadReels(); }, []);

  function resetForm() {
    setTitle(""); setLinkedProducts([]); setActive(true);
    setShowOnProduct(false);
    setVideoFile(null); setThumbFile(null); setEditingId(null);
    setSkuSearch(""); setSearchResults([]); setSaveProgress("");
    if (videoInputRef.current) videoInputRef.current.value = "";
    if (thumbInputRef.current) thumbInputRef.current.value = "";
  }

  function openNew() {
    resetForm();
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(reel: ReelItem) {
    setTitle(reel.title || "");
    // Load products from new array or legacy single field
    var prods = api.getReelProducts(reel);
    setLinkedProducts(prods.map(function (p) {
      return { sku: p.sku, title: p.title, imageUrl: p.imageUrl || api.getProductMainImageUrl(p.sku), pricePreview: "" };
    }));
    setActive(reel.active !== false);
    setShowOnProduct(reel.showOnProduct === true);
    setVideoFile(null); setThumbFile(null);
    setEditingId(reel.id);
    setSkuSearch(""); setSearchResults([]);
    setSaveProgress("");
    setShowForm(true);
    // Load price previews for all linked products
    if (prods.length > 0) {
      _loadPricePreviews(prods.map(function (p) { return p.sku; }));
    }
  }

  // Debounced product search
  function handleSkuSearchChange(val: string) {
    setSkuSearch(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!val.trim() || val.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    searchTimerRef.current = setTimeout(function () {
      _searchProducts(val.trim());
    }, 400);
  }

  async function _searchProducts(query: string) {
    setSearching(true);
    try {
      var res = await api.getCatalog(1, 8, query, "", "");
      setSearchResults((res.data || []).map(function (p) {
        return { sku: p.sku, titulo: p.titulo };
      }));
    } catch (e) {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  function addProduct(sku: string, titulo: string) {
    // Don't add duplicates
    if (linkedProducts.some(function (p) { return p.sku === sku; })) {
      setSkuSearch("");
      setSearchResults([]);
      return;
    }
    var newProd: LinkedProduct = {
      sku,
      title: titulo,
      imageUrl: api.getProductMainImageUrl(sku),
      pricePreview: "",
    };
    setLinkedProducts(function (prev) { return [...prev, newProd]; });
    setSkuSearch("");
    setSearchResults([]);
    _loadPricePreviews([sku]);
  }

  function removeProduct(sku: string) {
    setLinkedProducts(function (prev) { return prev.filter(function (p) { return p.sku !== sku; }); });
  }

  function moveProduct(fromIdx: number, toIdx: number) {
    if (toIdx < 0) return;
    setLinkedProducts(function (prev) {
      if (toIdx >= prev.length) return prev;
      var arr = [...prev];
      var item = arr.splice(fromIdx, 1)[0];
      arr.splice(toIdx, 0, item);
      return arr;
    });
  }

  function handleProductDragStart(idx: number) {
    setDragIdx(idx);
  }

  function handleProductDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    setDragOverIdx(idx);
  }

  function handleProductDrop(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== idx) {
      moveProduct(dragIdx, idx);
    }
    setDragIdx(null);
    setDragOverIdx(null);
  }

  function handleProductDragEnd() {
    setDragIdx(null);
    setDragOverIdx(null);
  }

  async function _loadPricePreviews(skus: string[]) {
    try {
      var [priceRes, promoRes] = await Promise.all([
        api.getProductPricesBulkSafe(skus),
        api.getActivePromo().catch(function () { return { promo: null }; }),
      ]);
      var prices = priceRes.results || [];
      var promo = promoRes.promo;
      var now = Date.now();
      var promoActive = promo && promo.enabled && promo.startDate <= now && promo.endDate >= now;

      setLinkedProducts(function (prev) {
        return prev.map(function (lp) {
          var p = prices.find(function (x) { return x.sku === lp.sku; });
          if (!p || !p.found || !p.price) {
            return { ...lp, pricePreview: lp.pricePreview || "Preco nao encontrado" };
          }
          var sigePrice = p.price;
          var preview = "R$ " + sigePrice.toFixed(2).replace(".", ",");
          if (promoActive && promo) {
            var pp = (promo.products || []).find(function (x) { return x.sku === lp.sku; });
            if (pp) {
              var computed = api.computePromoPrice(sigePrice, promo, pp);
              preview += " → PROMO R$ " + computed.promoPrice.toFixed(2).replace(".", ",") + " (" + computed.discountLabel + ")";
            }
          }
          return { ...lp, pricePreview: preview };
        });
      });
    } catch (e) {
      // silent
    }
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setSaveProgress("");
    try {
      var token = await getValidAdminToken();
      if (!token) throw new Error("Sessao expirada.");

      // Build products array and legacy fields from first product
      var productsArr: ReelProduct[] = linkedProducts.map(function (lp) {
        return { sku: lp.sku, title: lp.title, imageUrl: lp.imageUrl };
      });
      var firstProd = productsArr[0] || null;
      var legacySku = firstProd ? firstProd.sku : "";
      var legacyTitle = firstProd ? firstProd.title : "";
      var legacyImg = firstProd ? firstProd.imageUrl : "";
      var legacySlug = firstProd ? firstProd.title.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
        .substring(0, 100) : "";

      if (editingId) {
        // ─── UPDATE existing reel ───
        var updateData: Record<string, any> = {
          title, productSku: legacySku, productTitle: legacyTitle, productImageUrl: legacyImg, productSlug: legacySlug, products: productsArr, active, showOnProduct,
        };

        // Upload new video if provided
        if (videoFile) {
          setSaveProgress("Enviando video...");
          var vExt = (videoFile.name.split(".").pop() || "mp4").toLowerCase();
          var tExt = thumbFile ? (thumbFile.name.split(".").pop() || "jpg").toLowerCase() : "";
          var urls = await api.getReelUploadUrl(token, vExt, tExt);
          await api.uploadToSignedUrl(urls.videoUploadUrl, urls.videoToken, videoFile);
          updateData.videoFilename = urls.videoPath;
          if (thumbFile && urls.thumbUploadUrl) {
            setSaveProgress("Enviando thumbnail...");
            await api.uploadToSignedUrl(urls.thumbUploadUrl, urls.thumbToken, thumbFile);
            updateData.thumbnailFilename = urls.thumbPath;
          }
        } else if (thumbFile) {
          setSaveProgress("Enviando thumbnail...");
          var tExt2 = (thumbFile.name.split(".").pop() || "jpg").toLowerCase();
          // Only request a thumbnail upload URL — reuse existing reel ID to avoid orphaned paths
          var urls2 = await api.getReelUploadUrl(token, "mp4", tExt2);
          if (urls2.thumbUploadUrl) {
            await api.uploadToSignedUrl(urls2.thumbUploadUrl, urls2.thumbToken, thumbFile);
            updateData.thumbnailFilename = urls2.thumbPath;
          }
        }

        setSaveProgress("Salvando...");
        await api.updateReel(token, editingId, updateData);
      } else {
        // ─── CREATE new reel ───
        if (!videoFile) { setError("Selecione um arquivo de video."); setSaving(false); return; }

        var validVT = ["mp4", "webm", "mov", "quicktime"];
        var ext = (videoFile.name.split(".").pop() || "mp4").toLowerCase();
        if (!validVT.includes(ext)) { setError("Formato invalido. Use MP4, WebM ou MOV."); setSaving(false); return; }
        if (videoFile.size > 50 * 1024 * 1024) { setError("Video muito grande. Maximo 50MB."); setSaving(false); return; }

        setSaveProgress("Preparando upload...");
        var tExtNew = thumbFile ? (thumbFile.name.split(".").pop() || "jpg").toLowerCase() : "";
        var uploadUrls = await api.getReelUploadUrl(token, ext, tExtNew);

        setSaveProgress("Enviando video (" + (videoFile.size / 1024 / 1024).toFixed(1) + "MB)...");
        await api.uploadToSignedUrl(uploadUrls.videoUploadUrl, uploadUrls.videoToken, videoFile);

        var thumbFilename = "";
        if (thumbFile && uploadUrls.thumbUploadUrl) {
          setSaveProgress("Enviando thumbnail...");
          await api.uploadToSignedUrl(uploadUrls.thumbUploadUrl, uploadUrls.thumbToken, thumbFile);
          thumbFilename = uploadUrls.thumbPath;
        }

        setSaveProgress("Salvando metadados...");
        await api.createReel(token, {
          reelId: uploadUrls.reelId,
          title,
          videoFilename: uploadUrls.videoPath,
          thumbnailFilename: thumbFilename,
          productSku: legacySku,
          productTitle: legacyTitle,
          productImageUrl: legacyImg,
          productSlug: legacySlug,
          products: productsArr,
          active,
          showOnProduct,
        });
      }

      setShowForm(false);
      resetForm();
      await loadReels();
    } catch (e: any) {
      setError(e.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
      setSaveProgress("");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja excluir este reel?")) return;
    setDeleting(id);
    try {
      var token = await getValidAdminToken();
      if (!token) throw new Error("Sessao expirada.");
      await api.deleteReel(id, token);
      await loadReels();
    } catch (e: any) {
      setError(e.message || "Erro ao excluir.");
    } finally {
      setDeleting(null);
    }
  }

  async function handleToggleActive(reel: ReelItem) {
    try {
      var token = await getValidAdminToken();
      if (!token) return;
      await api.updateReel(token, reel.id, { active: !reel.active });
      await loadReels();
    } catch (e: any) {
      setError(e.message || "Erro ao alterar status.");
    }
  }

  async function handleMove(index: number, direction: "up" | "down") {
    var newReels = [...reels];
    var targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= newReels.length) return;
    [newReels[index], newReels[targetIdx]] = [newReels[targetIdx], newReels[index]];
    setReels(newReels);
    try {
      var token = await getValidAdminToken();
      if (!token) return;
      await api.reorderReels(token, newReels.map(function (r) { return r.id; }));
    } catch (e: any) {
      setError(e.message || "Erro ao reordenar.");
      loadReels();
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "1.3rem", fontWeight: 700 }}>
            <Film className="w-6 h-6 text-red-600" />
            Reels / Videos Curtos
          </h2>
          <p className="text-gray-500 mt-1" style={{ fontSize: "0.82rem" }}>
            Videos estilo TikTok na homepage. Os precos sao puxados automaticamente do SIGE e mostram promocao se ativa.
          </p>
        </div>
        <button
          onClick={openNew}
          className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-xl transition-colors shrink-0"
          style={{ fontSize: "0.85rem", fontWeight: 600 }}
        >
          <Plus className="w-4 h-4" />
          Novo Reel
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-red-700" style={{ fontSize: "0.85rem" }}>{error}</p>
          <button onClick={function () { setError(""); }} className="ml-auto text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Tips */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
        <p className="text-blue-800" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Como funciona:</p>
        <ul className="text-blue-700 mt-1 space-y-0.5" style={{ fontSize: "0.75rem" }}>
          <li>- Upload de video vertical (9:16), 15-60s, MP4 H.264 (max 50MB)</li>
          <li>- Vincule <strong>um ou mais produtos</strong> buscando pelo SKU ou nome — o preco sera puxado do SIGE em tempo real</li>
          <li>- Se o produto estiver em Super Promo, o preco promocional aparecera automaticamente</li>
          <li>- Adicione um thumbnail (800x1422px) para carregamento mais rapido</li>
        </ul>
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm">
          <h3 className="text-gray-800 mb-4" style={{ fontSize: "1rem", fontWeight: 600 }}>
            {editingId ? "Editar Reel" : "Novo Reel"}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Title */}
            <div className="md:col-span-2">
              <label className="block text-gray-600 mb-1" style={{ fontSize: "0.78rem", fontWeight: 500 }}>Titulo do Video</label>
              <input
                type="text" value={title} onChange={function (e) { setTitle(e.target.value); }}
                placeholder="Ex: Motor Cummins ISB em acao"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                style={{ fontSize: "0.85rem" }}
              />
            </div>

            {/* Multi-Product Search */}
            <div className="md:col-span-2">
              <label className="block text-gray-600 mb-1" style={{ fontSize: "0.78rem", fontWeight: 500 }}>
                <Package className="w-3.5 h-3.5 inline mr-1" />
                Vincular Produtos (busca por SKU ou nome)
              </label>
              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={skuSearch}
                    onChange={function (e) { handleSkuSearchChange(e.target.value); }}
                    placeholder="Digite SKU ou nome para adicionar produto..."
                    className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                    style={{ fontSize: "0.85rem" }}
                  />
                  {searching && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
                  )}
                </div>

                {/* Search results dropdown */}
                {searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-10 max-h-60 overflow-y-auto">
                    {searchResults.map(function (prod) {
                      var alreadyLinked = linkedProducts.some(function (lp) { return lp.sku === prod.sku; });
                      return (
                        <button
                          key={prod.sku}
                          onClick={function () { addProduct(prod.sku, prod.titulo); }}
                          disabled={alreadyLinked}
                          className={"w-full flex items-center gap-3 px-3 py-2.5 text-left border-b border-gray-100 last:border-0 transition-colors " + (alreadyLinked ? "bg-green-50 opacity-60 cursor-default" : "hover:bg-gray-50")}
                        >
                          <img
                            src={api.getProductMainImageUrl(prod.sku)}
                            alt=""
                            className="w-10 h-10 rounded-lg object-cover bg-gray-100 shrink-0"
                            onError={function (e: any) { e.target.style.display = "none"; }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-gray-800 truncate" style={{ fontSize: "0.82rem", fontWeight: 500 }}>
                              {prod.titulo}
                            </p>
                            <p className="text-gray-400" style={{ fontSize: "0.7rem" }}>
                              SKU: {prod.sku}
                            </p>
                          </div>
                          {alreadyLinked ? (
                            <Check className="w-4 h-4 text-green-500 shrink-0" />
                          ) : (
                            <Plus className="w-4 h-4 text-gray-400 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Linked products list */}
              {linkedProducts.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-gray-500" style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                    {linkedProducts.length} produto{linkedProducts.length !== 1 ? "s" : ""} vinculado{linkedProducts.length !== 1 ? "s" : ""}:
                    {linkedProducts.length > 1 && (
                      <span className="text-gray-400 font-normal ml-1">— arraste ou use as setas para reordenar</span>
                    )}
                  </p>
                  {linkedProducts.map(function (lp, idx) {
                    var isDragging = dragIdx === idx;
                    var isDragOver = dragOverIdx === idx && dragIdx !== idx;
                    return (
                      <div
                        key={lp.sku}
                        draggable={linkedProducts.length > 1}
                        onDragStart={function () { handleProductDragStart(idx); }}
                        onDragOver={function (e) { handleProductDragOver(e, idx); }}
                        onDrop={function (e) { handleProductDrop(e, idx); }}
                        onDragEnd={handleProductDragEnd}
                        className={"flex items-center gap-2 bg-green-50 border rounded-lg p-2.5 transition-all " + (isDragging ? "opacity-40 border-green-400 scale-[0.98]" : isDragOver ? "border-blue-400 bg-blue-50/50 shadow-md" : "border-green-200") + (linkedProducts.length > 1 ? " cursor-grab active:cursor-grabbing" : "")}
                      >
                        {/* Drag handle + order arrows */}
                        {linkedProducts.length > 1 && (
                          <div className="flex flex-col items-center gap-0 shrink-0">
                            <button
                              type="button"
                              onClick={function (e) { e.stopPropagation(); moveProduct(idx, idx - 1); }}
                              disabled={idx === 0}
                              className="p-0.5 text-green-400 hover:text-green-700 disabled:text-green-200 transition-colors"
                              title="Mover para cima"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <GripVertical className="w-3.5 h-3.5 text-green-300" />
                            <button
                              type="button"
                              onClick={function (e) { e.stopPropagation(); moveProduct(idx, idx + 1); }}
                              disabled={idx === linkedProducts.length - 1}
                              className="p-0.5 text-green-400 hover:text-green-700 disabled:text-green-200 transition-colors"
                              title="Mover para baixo"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        <span className="text-green-400 shrink-0" style={{ fontSize: "0.65rem", fontWeight: 700, width: "16px", textAlign: "center" }}>
                          {idx + 1}
                        </span>
                        <img
                          src={lp.imageUrl || api.getProductMainImageUrl(lp.sku)}
                          alt=""
                          className="w-10 h-10 rounded-lg object-cover bg-gray-100 shrink-0"
                          onError={function (e: any) { e.target.style.display = "none"; }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <Check className="w-3 h-3 text-green-600 shrink-0" />
                            <p className="text-green-800 truncate" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                              {lp.title}
                            </p>
                          </div>
                          <p className="text-green-600" style={{ fontSize: "0.65rem" }}>
                            SKU: {lp.sku}
                          </p>
                          {lp.pricePreview && (
                            <p className="text-green-700" style={{ fontSize: "0.68rem", fontWeight: 500 }}>
                              {lp.pricePreview}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={function () { removeProduct(lp.sku); }}
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                          title="Remover produto"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {linkedProducts.length === 0 && (
                <p className="text-gray-400 mt-2" style={{ fontSize: "0.72rem" }}>
                  Nenhum produto vinculado. Busque acima para vincular um ou mais.
                </p>
              )}
            </div>

            {/* Video File */}
            <div>
              <label className="block text-gray-600 mb-1" style={{ fontSize: "0.78rem", fontWeight: 500 }}>
                Video {editingId ? "(opcional — substitui o atual)" : "(obrigatorio)"}
              </label>
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-red-400 hover:bg-red-50/50 transition-colors"
                onClick={function () { videoInputRef.current?.click(); }}
              >
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  className="hidden"
                  onChange={function (e) { setVideoFile(e.target.files?.[0] || null); }}
                />
                <Upload className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>
                  {videoFile ? videoFile.name + " (" + (videoFile.size / 1024 / 1024).toFixed(1) + "MB)" : "Clique para selecionar"}
                </p>
                <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.65rem" }}>MP4, WebM ou MOV (max 50MB)</p>
              </div>
            </div>

            {/* Thumbnail File */}
            <div>
              <label className="block text-gray-600 mb-1" style={{ fontSize: "0.78rem", fontWeight: 500 }}>
                Thumbnail (opcional)
              </label>
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-red-400 hover:bg-red-50/50 transition-colors"
                onClick={function () { thumbInputRef.current?.click(); }}
              >
                <input
                  ref={thumbInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={function (e) { setThumbFile(e.target.files?.[0] || null); }}
                />
                <Upload className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>
                  {thumbFile ? thumbFile.name : "Clique para selecionar"}
                </p>
                <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.65rem" }}>PNG, JPG ou WebP (800x1422px ideal)</p>
              </div>
            </div>
          </div>

          {/* ═══ Video Frame Capture — select a take as thumbnail ═══ */}
          <VideoFrameCapture
            videoFile={videoFile}
            existingVideoUrl={editingId ? (reels.find(function (r) { return r.id === editingId; })?.videoUrl || null) : null}
            onCapture={function (file) { setThumbFile(file); }}
            capturedThumbFile={thumbFile}
          />

          {/* Toggles */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 mt-4">
            <div className="flex items-center gap-2">
              <button
                onClick={function () { setActive(!active); }}
                className={"relative w-10 h-5 rounded-full transition-colors " + (active ? "bg-green-500" : "bg-gray-300")}
              >
                <div className={"absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform " + (active ? "translate-x-5.5" : "translate-x-0.5")} />
              </button>
              <span className="text-gray-600" style={{ fontSize: "0.82rem" }}>Ativo na homepage</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={function () { setShowOnProduct(!showOnProduct); }}
                className={"relative w-10 h-5 rounded-full transition-colors " + (showOnProduct ? "bg-blue-500" : "bg-gray-300")}
              >
                <div className={"absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform " + (showOnProduct ? "translate-x-5.5" : "translate-x-0.5")} />
              </button>
              <span className="text-gray-600" style={{ fontSize: "0.82rem" }}>
                Exibir na pagina do produto
              </span>
              {showOnProduct && linkedProducts.length > 0 && (
                <span className="text-blue-500" style={{ fontSize: "0.68rem" }}>
                  — aparecera na pagina de {linkedProducts.length} produto{linkedProducts.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 mt-5">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white px-5 py-2.5 rounded-xl transition-colors"
              style={{ fontSize: "0.85rem", fontWeight: 600 }}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {editingId ? "Salvar Alteracoes" : "Criar Reel"}
            </button>
            <button
              onClick={function () { setShowForm(false); resetForm(); }}
              className="text-gray-500 hover:text-gray-700 px-4 py-2.5 transition-colors"
              style={{ fontSize: "0.85rem" }}
            >
              Cancelar
            </button>
            {saving && saveProgress && (
              <span className="text-gray-500" style={{ fontSize: "0.78rem" }}>{saveProgress}</span>
            )}
          </div>
        </div>
      )}

      {/* Reels List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
        </div>
      ) : reels.length === 0 ? (
        <div className="text-center py-16 bg-white border border-gray-200 rounded-xl">
          <Film className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500" style={{ fontSize: "0.95rem", fontWeight: 600 }}>Nenhum reel cadastrado</p>
          <p className="text-gray-400 mt-1" style={{ fontSize: "0.82rem" }}>Adicione videos curtos para engajar seus visitantes.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reels.map(function (reel, idx) {
            return (
              <ReelListItem
                key={reel.id}
                reel={reel}
                index={idx}
                total={reels.length}
                deleting={deleting === reel.id}
                onMove={handleMove}
                onToggleActive={handleToggleActive}
                onEdit={openEdit}
                onDelete={handleDelete}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Individual reel in the admin list — with live price preview */
function ReelListItem({ reel, index, total, deleting, onMove, onToggleActive, onEdit, onDelete }: {
  reel: ReelItem;
  index: number;
  total: number;
  deleting: boolean;
  onMove: (idx: number, dir: "up" | "down") => void;
  onToggleActive: (reel: ReelItem) => void;
  onEdit: (reel: ReelItem) => void;
  onDelete: (id: string) => void;
}) {
  var products = api.getReelProducts(reel);
  var [pricePreview, setPricePreview] = useState<string>("");

  useEffect(function () {
    if (products.length === 0) return;
    var skus = products.map(function (p) { return p.sku; });
    Promise.all([
      api.getProductPricesBulkSafe(skus),
      api.getActivePromo().catch(function () { return { promo: null }; }),
    ]).then(function (results) {
      var prices = results[0].results || [];
      var promo = results[1].promo;
      var now = Date.now();
      var lines: string[] = [];
      for (var i = 0; i < products.length; i++) {
        var p = prices.find(function (x) { return x.sku === products[i].sku; });
        if (!p || !p.found || !p.price) {
          lines.push(products[i].sku + ": sem preco");
          continue;
        }
        var txt = products[i].sku + ": R$ " + p.price.toFixed(2).replace(".", ",");
        if (promo && promo.enabled && promo.startDate <= now && promo.endDate >= now) {
          var pp = (promo.products || []).find(function (x) { return x.sku === products[i].sku; });
          if (pp) {
            var c = api.computePromoPrice(p.price, promo, pp);
            txt += " → R$ " + c.promoPrice.toFixed(2).replace(".", ",") + " (" + c.discountLabel + ")";
          }
        }
        lines.push(txt);
      }
      setPricePreview(lines.join(" | "));
    }).catch(function () { setPricePreview("Erro"); });
  }, [reel.id, reel.productSku, reel.products?.length]);

  return (
    <div className={"bg-white border rounded-xl p-4 flex items-center gap-4 transition-colors " + (reel.active !== false ? "border-gray-200" : "border-orange-200 bg-orange-50/30")}>
      {/* Order arrows */}
      <div className="flex flex-col gap-0.5 shrink-0">
        <button onClick={function () { onMove(index, "up"); }} disabled={index === 0} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:text-gray-200">
          <ChevronUp className="w-4 h-4" />
        </button>
        <GripVertical className="w-4 h-4 text-gray-300 mx-auto" />
        <button onClick={function () { onMove(index, "down"); }} disabled={index === total - 1} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:text-gray-200">
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      {/* Thumbnail */}
      <div className="w-16 h-28 bg-gray-100 rounded-lg overflow-hidden shrink-0">
        {reel.thumbnailUrl ? (
          <img src={reel.thumbnailUrl} alt="" className="w-full h-full object-cover" />
        ) : reel.videoUrl ? (
          <video src={reel.videoUrl} className="w-full h-full object-cover" preload="metadata" muted />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Play className="w-6 h-6 text-gray-300" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-gray-800 truncate" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
            {reel.title || "Sem titulo"}
          </p>
          {(reel as any).influencerId && (
            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded" style={{ fontSize: "0.6rem", fontWeight: 700 }}>
              INFLUENCER
            </span>
          )}
          {reel.active === false && (
            <span className="px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded" style={{ fontSize: "0.6rem", fontWeight: 700 }}>
              INATIVO
            </span>
          )}
          {reel.showOnProduct && (
            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded" style={{ fontSize: "0.6rem", fontWeight: 700 }}>
              PAG. PRODUTO
            </span>
          )}
        </div>
        {products.length > 0 && (
          <p className="text-gray-500 truncate mt-0.5" style={{ fontSize: "0.78rem" }}>
            {products.length === 1
              ? "Produto: " + products[0].title + " (" + products[0].sku + ")"
              : products.length + " produtos: " + products.map(function (p) { return p.sku; }).join(", ")}
          </p>
        )}
        {products.length === 0 && (
          <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.75rem" }}>Nenhum produto vinculado</p>
        )}
        {pricePreview && (
          <p className="text-gray-500 mt-0.5 truncate" style={{ fontSize: "0.72rem", fontWeight: 500 }}>
            {pricePreview}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={function () { onToggleActive(reel); }}
          className={"p-2 rounded-lg transition-colors " + (reel.active !== false ? "text-green-600 hover:bg-green-50" : "text-orange-500 hover:bg-orange-50")}
          title={reel.active !== false ? "Desativar" : "Ativar"}
        >
          {reel.active !== false ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
        <button
          onClick={function () { onEdit(reel); }}
          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          title="Editar"
        >
          <Edit3 className="w-4 h-4" />
        </button>
        <button
          onClick={function () { onDelete(reel.id); }}
          disabled={deleting}
          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          title="Excluir"
        >
          {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// VideoFrameCapture — lets admin scrub through a video and capture a frame
// as the reel thumbnail. Works with both new uploads (File) and existing URLs.
// ═══════════════════════════════════════════════════════════════════════════════
function VideoFrameCapture({ videoFile, existingVideoUrl, onCapture, capturedThumbFile }: {
  videoFile: File | null;
  existingVideoUrl: string | null;
  onCapture: (file: File) => void;
  capturedThumbFile: File | null;
}) {
  var videoRef = useRef<HTMLVideoElement>(null);
  var canvasRef = useRef<HTMLCanvasElement>(null);
  var progressRef = useRef<HTMLDivElement>(null);
  var [videoSrc, setVideoSrc] = useState<string | null>(null);
  var [ready, setReady] = useState(false);
  var [playing, setPlaying] = useState(false);
  var [currentTime, setCurrentTime] = useState(0);
  var [duration, setDuration] = useState(0);
  var [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  var [capturing, setCapturing] = useState(false);
  var [expanded, setExpanded] = useState(false);

  // Create object URL for local file
  useEffect(function () {
    if (videoFile) {
      var url = URL.createObjectURL(videoFile);
      setVideoSrc(url);
      setReady(false);
      setCapturedPreview(null);
      return function () { URL.revokeObjectURL(url); };
    } else if (existingVideoUrl) {
      setVideoSrc(existingVideoUrl);
      setReady(false);
      setCapturedPreview(null);
    } else {
      setVideoSrc(null);
      setReady(false);
      setCapturedPreview(null);
    }
  }, [videoFile, existingVideoUrl]);

  function handleLoadedMetadata() {
    var vid = videoRef.current;
    if (!vid) return;
    setDuration(vid.duration);
    setReady(true);
    setPlaying(false);
    vid.pause();
  }

  function handleTimeUpdate() {
    var vid = videoRef.current;
    if (vid) setCurrentTime(vid.currentTime);
  }

  function togglePlay() {
    var vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      vid.play().catch(function () {});
      setPlaying(true);
    } else {
      vid.pause();
      setPlaying(false);
    }
  }

  function stepFrame(delta: number) {
    var vid = videoRef.current;
    if (!vid) return;
    vid.pause();
    setPlaying(false);
    var newTime = Math.max(0, Math.min(vid.duration || 0, vid.currentTime + delta));
    vid.currentTime = newTime;
  }

  function seekTo(clientX: number) {
    var bar = progressRef.current;
    var vid = videoRef.current;
    if (!bar || !vid || !vid.duration) return;
    var rect = bar.getBoundingClientRect();
    var ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    vid.currentTime = ratio * vid.duration;
    vid.pause();
    setPlaying(false);
  }

  function handleBarMouseDown(e: React.MouseEvent) {
    seekTo(e.clientX);
    function onMove(ev: MouseEvent) { seekTo(ev.clientX); }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function handleBarTouchStart(e: React.TouchEvent) {
    seekTo(e.touches[0].clientX);
    function onMove(ev: TouchEvent) { ev.preventDefault(); seekTo(ev.touches[0].clientX); }
    function onEnd() {
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    }
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
  }

  function captureFrame() {
    var vid = videoRef.current;
    var canvas = canvasRef.current;
    if (!vid || !canvas) return;
    setCapturing(true);

    // Use video's natural dimensions for high quality
    var w = vid.videoWidth || 800;
    var h = vid.videoHeight || 1422;
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext("2d");
    if (!ctx) { setCapturing(false); return; }
    ctx.drawImage(vid, 0, 0, w, h);

    canvas.toBlob(function (blob) {
      if (!blob) { setCapturing(false); return; }
      var file = new File([blob], "thumb-frame-" + Math.round(vid.currentTime * 100) + ".jpg", { type: "image/jpeg" });
      onCapture(file);
      // Show preview
      var previewUrl = URL.createObjectURL(blob);
      setCapturedPreview(function (prev) {
        if (prev) URL.revokeObjectURL(prev);
        return previewUrl;
      });
      setCapturing(false);
    }, "image/jpeg", 0.92);
  }

  function fmtTime(s: number): string {
    if (!s || !isFinite(s)) return "0:00.0";
    var m = Math.floor(s / 60);
    var sec = Math.floor(s % 60);
    var ms = Math.floor((s % 1) * 10);
    return m + ":" + (sec < 10 ? "0" : "") + sec + "." + ms;
  }

  // No video source — don't render
  if (!videoSrc) return null;

  var progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={function () { setExpanded(!expanded); }}
        className="flex items-center gap-2 text-purple-700 hover:text-purple-900 transition-colors mb-2"
        style={{ fontSize: "0.82rem", fontWeight: 600 }}
      >
        <Camera className="w-4 h-4" />
        Capturar frame do video como thumbnail
        <ChevronDown className={"w-4 h-4 transition-transform " + (expanded ? "rotate-180" : "")} />
      </button>

      {expanded && (
        <div className="border border-purple-200 bg-purple-50/50 rounded-xl p-4">
          <p className="text-purple-600 mb-3" style={{ fontSize: "0.72rem" }}>
            Navegue pelo video e clique em "Capturar Frame" para usar como thumbnail. Use as setas para avancar/recuar frames precisos.
          </p>

          <div className="flex flex-col md:flex-row gap-4">
            {/* Video player */}
            <div className="flex-1">
              <div
                className="relative bg-black rounded-lg overflow-hidden"
                style={{ aspectRatio: "9 / 16", maxHeight: "400px" }}
              >
                <video
                  ref={videoRef}
                  src={videoSrc}
                  className="w-full h-full object-contain"
                  muted
                  playsInline
                  preload="auto"
                  crossOrigin="anonymous"
                  onLoadedMetadata={handleLoadedMetadata}
                  onTimeUpdate={handleTimeUpdate}
                  onPlay={function () { setPlaying(true); }}
                  onPause={function () { setPlaying(false); }}
                  onClick={togglePlay}
                />
                {!ready && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <Loader2 className="w-8 h-8 text-white animate-spin" />
                  </div>
                )}
              </div>

              {ready && (
                <>
                  {/* Progress bar */}
                  <div
                    ref={progressRef}
                    className="mt-2 relative cursor-pointer group"
                    style={{ height: "24px", display: "flex", alignItems: "center" }}
                    onMouseDown={handleBarMouseDown}
                    onTouchStart={handleBarTouchStart}
                  >
                    <div className="w-full h-1.5 bg-purple-200 rounded-full overflow-hidden group-hover:h-2 transition-all">
                      <div
                        className="h-full bg-purple-500 rounded-full"
                        style={{ width: (progress * 100) + "%" }}
                      />
                    </div>
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-purple-600 rounded-full shadow-lg border-2 border-white"
                      style={{ left: "calc(" + (progress * 100) + "% - 8px)" }}
                    />
                  </div>

                  {/* Controls */}
                  <div className="flex items-center justify-between mt-1.5">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={function () { stepFrame(-1 / 30); }}
                        className="p-1.5 text-purple-600 hover:bg-purple-100 rounded-lg transition-colors"
                        title="Recuar 1 frame (~33ms)"
                      >
                        <SkipBack className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={function () { stepFrame(-0.5); }}
                        className="px-2 py-1 text-purple-600 hover:bg-purple-100 rounded-lg transition-colors"
                        style={{ fontSize: "0.65rem", fontWeight: 600 }}
                        title="Recuar 0.5s"
                      >
                        -0.5s
                      </button>
                      <button
                        type="button"
                        onClick={togglePlay}
                        className="p-2 bg-purple-600 hover:bg-purple-700 text-white rounded-full transition-colors shadow"
                      >
                        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={function () { stepFrame(0.5); }}
                        className="px-2 py-1 text-purple-600 hover:bg-purple-100 rounded-lg transition-colors"
                        style={{ fontSize: "0.65rem", fontWeight: 600 }}
                        title="Avancar 0.5s"
                      >
                        +0.5s
                      </button>
                      <button
                        type="button"
                        onClick={function () { stepFrame(1 / 30); }}
                        className="p-1.5 text-purple-600 hover:bg-purple-100 rounded-lg transition-colors"
                        title="Avancar 1 frame (~33ms)"
                      >
                        <SkipForward className="w-4 h-4" />
                      </button>
                    </div>
                    <span className="text-purple-500 tabular-nums" style={{ fontSize: "0.7rem" }}>
                      {fmtTime(currentTime)} / {fmtTime(duration)}
                    </span>
                  </div>

                  {/* Capture button */}
                  <button
                    type="button"
                    onClick={captureFrame}
                    disabled={capturing}
                    className="mt-3 w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white py-2.5 rounded-xl transition-colors shadow"
                    style={{ fontSize: "0.85rem", fontWeight: 600 }}
                  >
                    {capturing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Camera className="w-4 h-4" />
                    )}
                    Capturar Frame em {fmtTime(currentTime)}
                  </button>
                </>
              )}
            </div>

            {/* Captured preview */}
            <div className="w-full md:w-44 shrink-0">
              <p className="text-purple-700 mb-2" style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                Preview do Thumbnail
              </p>
              <div
                className="bg-gray-100 border-2 border-dashed border-purple-200 rounded-xl overflow-hidden flex items-center justify-center"
                style={{ aspectRatio: "9 / 16" }}
              >
                {capturedPreview ? (
                  <img src={capturedPreview} alt="Frame capturado" className="w-full h-full object-cover" />
                ) : capturedThumbFile ? (
                  <div className="text-center p-3">
                    <Check className="w-6 h-6 text-green-500 mx-auto mb-1" />
                    <p className="text-green-600" style={{ fontSize: "0.7rem", fontWeight: 600 }}>
                      {capturedThumbFile.name}
                    </p>
                    <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.6rem" }}>
                      Arquivo selecionado
                    </p>
                  </div>
                ) : (
                  <div className="text-center p-3">
                    <Camera className="w-8 h-8 text-purple-200 mx-auto mb-1" />
                    <p className="text-purple-300" style={{ fontSize: "0.7rem", fontWeight: 500 }}>
                      Nenhum frame capturado
                    </p>
                    <p className="text-purple-200 mt-0.5" style={{ fontSize: "0.6rem" }}>
                      Navegue pelo video e clique capturar
                    </p>
                  </div>
                )}
              </div>
              {capturedPreview && (
                <p className="text-green-600 text-center mt-2 flex items-center justify-center gap-1" style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                  <Check className="w-3.5 h-3.5" />
                  Frame capturado! Sera usado como thumbnail.
                </p>
              )}
            </div>
          </div>

          {/* Hidden canvas for frame capture */}
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}
    </div>
  );
}