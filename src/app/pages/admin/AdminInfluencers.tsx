import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, Edit2, Save, X, Upload, GripVertical, Eye, EyeOff, Video, Film, Loader2, CheckCircle2 } from "lucide-react";
import * as api from "../../services/api";
import type { InfluencerItem, ReelItem } from "../../services/api";
import { getValidAdminToken } from "./adminAuth";

// ═══════════════════════════════════════════════════════════════════
// AdminInfluencers — Manage influencers for the Stories-style carousel.
// Each influencer has a name, profile photo, and associated reels.
// ═══════════════════════════════════════════════════════════════════

export function AdminInfluencers() {
  var [influencers, setInfluencers] = useState<InfluencerItem[]>([]);
  var [allReels, setAllReels] = useState<ReelItem[]>([]);
  var [loading, setLoading] = useState(true);
  var [editing, setEditing] = useState<InfluencerItem | null>(null);
  var [creating, setCreating] = useState(false);
  var [saving, setSaving] = useState(false);
  var [error, setError] = useState("");
  var [success, setSuccess] = useState("");

  // Form state
  var [formName, setFormName] = useState("");
  var [formPhoto, setFormPhoto] = useState<File | null>(null);
  var [formPhotoPreview, setFormPhotoPreview] = useState("");
  var [formReelIds, setFormReelIds] = useState<string[]>([]);
  var [formActive, setFormActive] = useState(true);

  var photoInputRef = useRef<HTMLInputElement>(null);

  // Inline reel upload state
  var [showReelUpload, setShowReelUpload] = useState(false);
  var [reelVideoFile, setReelVideoFile] = useState<File | null>(null);
  var [reelVideoPreview, setReelVideoPreview] = useState("");
  var [reelTitle, setReelTitle] = useState("");
  var [reelUploading, setReelUploading] = useState(false);
  var [reelUploadProgress, setReelUploadProgress] = useState("");
  var [reelUploadedList, setReelUploadedList] = useState<{ id: string; title: string }[]>([]);
  var reelVideoInputRef = useRef<HTMLInputElement>(null);

  useEffect(function () { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    var token = await getValidAdminToken() || "";
    Promise.all([
      api.getAdminInfluencers(token),
      api.getAdminReels(token),
    ]).then(function (results) {
      setInfluencers(results[0].influencers || []);
      setAllReels((results[1].reels || []).filter(function (r) { return r.active !== false; }));
    }).catch(function (e) {
      setError("Erro ao carregar dados: " + String(e));
    }).finally(function () {
      setLoading(false);
    });
  }

  function resetForm() {
    setFormName("");
    setFormPhoto(null);
    setFormPhotoPreview("");
    setFormReelIds([]);
    setFormActive(true);
    setEditing(null);
    setCreating(false);
    setShowReelUpload(false);
    setReelVideoFile(null);
    setReelVideoPreview("");
    setReelTitle("");
    setReelUploading(false);
    setReelUploadProgress("");
    setReelUploadedList([]);
  }

  function startCreate() {
    resetForm();
    setCreating(true);
  }

  function startEdit(inf: InfluencerItem) {
    setFormName(inf.name);
    setFormPhoto(null);
    setFormPhotoPreview(inf.photoUrl || "");
    setFormReelIds(inf.reelIds || []);
    setFormActive(inf.active !== false);
    setEditing(inf);
    setCreating(false);
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    var file = e.target.files?.[0];
    if (!file) return;
    setFormPhoto(file);
    var url = URL.createObjectURL(file);
    setFormPhotoPreview(url);
  }

  function toggleReelId(id: string) {
    setFormReelIds(function (prev) {
      if (prev.includes(id)) return prev.filter(function (r) { return r !== id; });
      return [...prev, id];
    });
  }

  // Inline reel upload: video selection
  function handleReelVideoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    var file = e.target.files?.[0];
    if (!file) return;
    var validExts = ["mp4", "webm", "mov", "quicktime"];
    var ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!validExts.includes(ext)) {
      setError("Formato de video invalido. Use MP4, WebM ou MOV.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError("Video muito grande. Maximo 50MB.");
      return;
    }
    setReelVideoFile(file);
    setReelVideoPreview(URL.createObjectURL(file));
    if (!reelTitle) {
      // Auto-fill title from filename
      var name = file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
      setReelTitle(name.charAt(0).toUpperCase() + name.slice(1));
    }
  }

  function resetReelUploadForm() {
    setReelVideoFile(null);
    setReelVideoPreview("");
    setReelTitle("");
    setReelUploadProgress("");
    if (reelVideoInputRef.current) reelVideoInputRef.current.value = "";
  }

  // Inline reel upload: upload + create + auto-associate
  async function handleReelUpload() {
    if (!reelVideoFile) { setError("Selecione um video para o reel."); return; }
    if (!reelTitle.trim()) { setError("Informe um titulo para o reel."); return; }

    setReelUploading(true);
    setReelUploadProgress("Preparando upload...");
    setError("");

    try {
      var token = await getValidAdminToken() || "";
      var ext = (reelVideoFile.name.split(".").pop() || "mp4").toLowerCase();

      setReelUploadProgress("Obtendo URL de upload...");
      var uploadUrls = await api.getReelUploadUrl(token, ext, "");

      setReelUploadProgress("Enviando video (" + (reelVideoFile.size / 1024 / 1024).toFixed(1) + "MB)...");
      await api.uploadToSignedUrl(uploadUrls.videoUploadUrl, uploadUrls.videoToken, reelVideoFile);

      setReelUploadProgress("Salvando metadados...");
      // Pass the influencer ID so the reel is marked as belonging to this influencer
      // and will NOT appear in the product reels section (HomeReels).
      // Use "__influencer__" as fallback when creating a new influencer (ID not yet known).
      var currentInfluencerId = editing ? editing.id : "__influencer__";
      var result = await api.createReel(token, {
        reelId: uploadUrls.reelId,
        title: reelTitle.trim(),
        videoFilename: uploadUrls.videoPath,
        thumbnailFilename: "",
        productSku: "",
        productTitle: "",
        productImageUrl: "",
        productSlug: "",
        products: [],
        active: true,
        influencerId: currentInfluencerId,
      });

      // Auto-associate the new reel with this influencer
      var newReelId = result.reel?.id || uploadUrls.reelId;
      setFormReelIds(function (prev) {
        if (prev.includes(newReelId)) return prev;
        return [...prev, newReelId];
      });

      // Add to uploaded list for visual feedback
      setReelUploadedList(function (prev) {
        return [...prev, { id: newReelId, title: reelTitle.trim() }];
      });

      // Add to allReels so it appears in the selection grid
      if (result.reel) {
        setAllReels(function (prev) { return [...prev, result.reel]; });
      }

      setReelUploadProgress("");
      resetReelUploadForm();
      setSuccess("Reel \"" + reelTitle.trim() + "\" enviado e associado automaticamente!");
    } catch (e: any) {
      setError("Erro ao fazer upload do reel: " + String(e));
      setReelUploadProgress("");
    } finally {
      setReelUploading(false);
    }
  }

  async function handleSave() {
    if (!formName.trim()) { setError("Nome e obrigatorio."); return; }
    setSaving(true);
    setError("");
    setSuccess("");
    var token = await getValidAdminToken() || "";

    try {
      if (creating) {
        // Upload photo
        var photoFilename = "";
        if (formPhoto) {
          var ext = formPhoto.name.split(".").pop() || "jpg";
          var uploadRes = await api.getInfluencerPhotoUploadUrl(token, ext);
          await api.uploadToSignedUrl(uploadRes.uploadUrl, uploadRes.token, formPhoto);
          photoFilename = uploadRes.photoPath;
          var influencerId = uploadRes.influencerId;
        } else {
          setError("Foto de perfil e obrigatoria.");
          setSaving(false);
          return;
        }
        await api.createInfluencer(token, {
          influencerId: influencerId!,
          name: formName.trim(),
          photoFilename,
          reelIds: formReelIds,
          active: formActive,
        });
        setSuccess("Influencer criado com sucesso!");
      } else if (editing) {
        var updateData: Record<string, any> = {
          name: formName.trim(),
          reelIds: formReelIds,
          active: formActive,
        };
        if (formPhoto) {
          var ext2 = formPhoto.name.split(".").pop() || "jpg";
          var uploadRes2 = await api.getInfluencerPhotoUploadUrl(token, ext2);
          await api.uploadToSignedUrl(uploadRes2.uploadUrl, uploadRes2.token, formPhoto);
          updateData.photoFilename = uploadRes2.photoPath;
        }
        await api.updateInfluencer(token, editing.id, updateData);
        setSuccess("Influencer atualizado com sucesso!");
      }
      resetForm();
      loadData();
    } catch (e: any) {
      setError("Erro ao salvar: " + String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja excluir este influencer?")) return;
    try {
      await api.deleteInfluencer(id, await getValidAdminToken() || "");
      setSuccess("Influencer excluido.");
      loadData();
    } catch (e: any) {
      setError("Erro ao excluir: " + String(e));
    }
  }

  async function handleToggleActive(inf: InfluencerItem) {
    try {
      await api.updateInfluencer(await getValidAdminToken() || "", inf.id, { active: !inf.active });
      loadData();
    } catch (e: any) {
      setError("Erro ao alterar status: " + String(e));
    }
  }

  // Drag reorder
  var [dragIdx, setDragIdx] = useState<number | null>(null);
  function handleDragStart(idx: number) { setDragIdx(idx); }
  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    var newList = [...influencers];
    var item = newList.splice(dragIdx, 1)[0];
    newList.splice(idx, 0, item);
    setInfluencers(newList);
    setDragIdx(idx);
  }
  async function handleDragEnd() {
    setDragIdx(null);
    try {
      var ids = influencers.map(function (inf) { return inf.id; });
      await api.reorderInfluencers(await getValidAdminToken() || "", ids);
    } catch (e: any) {
      setError("Erro ao reordenar: " + String(e));
    }
  }

  var isFormOpen = creating || editing !== null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Influencers</h2>
          <p className="text-gray-500 text-sm mt-1">Gerencie os influencers que aparecem no carrossel da home page.</p>
        </div>
        {!isFormOpen && (
          <button
            onClick={startCreate}
            className="flex items-center gap-2 bg-red-600 text-white px-4 py-2.5 rounded-lg hover:bg-red-700 transition-colors text-sm font-semibold"
          >
            <Plus className="w-4 h-4" />
            Novo Influencer
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
          <button onClick={function () { setError(""); }} className="ml-2 text-red-400 hover:text-red-600"><X className="w-4 h-4 inline" /></button>
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
          {success}
          <button onClick={function () { setSuccess(""); }} className="ml-2 text-green-400 hover:text-green-600"><X className="w-4 h-4 inline" /></button>
        </div>
      )}

      {/* Form */}
      {isFormOpen && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5 shadow-sm">
          <h3 className="text-lg font-bold text-gray-800">
            {creating ? "Novo Influencer" : "Editar Influencer"}
          </h3>

          {/* Name */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nome *</label>
            <input
              type="text"
              value={formName}
              onChange={function (e) { setFormName(e.target.value); }}
              placeholder="Nome do influencer"
              className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none"
            />
          </div>

          {/* Photo */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Foto de Perfil *</label>
            <div className="flex items-center gap-4">
              {formPhotoPreview ? (
                <img src={formPhotoPreview} alt="" className="w-16 h-16 rounded-full object-cover border-2 border-gray-200" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-gray-400">
                  <Upload className="w-6 h-6" />
                </div>
              )}
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoSelect}
                className="hidden"
              />
              <button
                onClick={function () { photoInputRef.current?.click(); }}
                className="text-sm text-red-600 hover:text-red-700 font-semibold border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
              >
                {formPhotoPreview ? "Trocar Foto" : "Selecionar Foto"}
              </button>
            </div>
          </div>

          {/* Active toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={function () { setFormActive(!formActive); }}
              className={"relative w-11 h-6 rounded-full transition-colors " + (formActive ? "bg-green-500" : "bg-gray-300")}
            >
              <div className={"absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform " + (formActive ? "translate-x-5.5" : "translate-x-0.5")} />
            </button>
            <span className="text-sm text-gray-700 font-medium">{formActive ? "Ativo" : "Inativo"}</span>
          </div>

          {/* Reels selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Reels Associados</label>
            <p className="text-xs text-gray-400 mb-3">Selecione os reels que pertencem a este influencer.</p>
            {allReels.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Nenhum reel ativo encontrado. Crie reels primeiro na aba "Reels".</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                {allReels.map(function (reel) {
                  var selected = formReelIds.includes(reel.id);
                  var prods = api.getReelProducts(reel);
                  return (
                    <button
                      key={reel.id}
                      type="button"
                      onClick={function () { toggleReelId(reel.id); }}
                      className={"flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all " +
                        (selected ? "border-red-400 bg-red-50 ring-1 ring-red-200" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50")}
                    >
                      {reel.thumbnailUrl ? (
                        <img src={reel.thumbnailUrl} alt="" className="w-10 h-14 rounded-md object-cover bg-gray-200 shrink-0" />
                      ) : (
                        <div className="w-10 h-14 rounded-md bg-gray-200 flex items-center justify-center shrink-0">
                          <Video className="w-4 h-4 text-gray-400" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className={"text-sm font-semibold truncate " + (selected ? "text-red-700" : "text-gray-700")}>
                          {reel.title || reel.id}
                        </p>
                        {prods.length > 0 && (
                          <p className="text-xs text-gray-400 truncate">
                            {prods.map(function (p) { return p.title || p.sku; }).join(", ")}
                          </p>
                        )}
                      </div>
                      <div className={"w-5 h-5 rounded border flex items-center justify-center shrink-0 " +
                        (selected ? "bg-red-600 border-red-600 text-white" : "border-gray-300")}>
                        {selected && <span style={{ fontSize: "0.7rem", fontWeight: 700 }}>✓</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {formReelIds.length > 0 && (
              <p className="text-xs text-gray-500 mt-2">{formReelIds.length} reel(s) selecionado(s)</p>
            )}
          </div>

          {/* Inline reel upload */}
          {showReelUpload && (
            <div className="bg-gradient-to-br from-gray-50 to-orange-50/30 border border-orange-200/60 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-orange-100 rounded-lg flex items-center justify-center">
                    <Film className="w-4 h-4 text-orange-600" />
                  </div>
                  <h4 className="text-sm font-bold text-gray-800">Subir Novo Reel</h4>
                </div>
                <button
                  onClick={function () { setShowReelUpload(false); resetReelUploadForm(); }}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-white/60 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-gray-400 -mt-2">O reel sera criado e associado automaticamente a este influencer.</p>

              <div className="flex flex-col sm:flex-row gap-4">
                {/* Video preview / pick */}
                <div className="shrink-0">
                  <input
                    ref={reelVideoInputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime"
                    onChange={handleReelVideoSelect}
                    className="hidden"
                  />
                  {reelVideoPreview ? (
                    <div className="relative group">
                      <video
                        src={reelVideoPreview}
                        className="w-28 h-40 rounded-lg object-cover bg-black border border-gray-200"
                        muted
                        playsInline
                        onMouseEnter={function (e) { (e.target as HTMLVideoElement).play().catch(function () {}); }}
                        onMouseLeave={function (e) { (e.target as HTMLVideoElement).pause(); }}
                      />
                      <button
                        onClick={function () { reelVideoInputRef.current?.click(); }}
                        className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg"
                      >
                        <span className="text-white text-xs font-semibold bg-black/50 px-2 py-1 rounded">Trocar</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={function () { reelVideoInputRef.current?.click(); }}
                      className="w-28 h-40 rounded-lg border-2 border-dashed border-orange-300 bg-white hover:bg-orange-50 flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Upload className="w-5 h-5 text-orange-400" />
                      <span className="text-xs text-orange-500 font-semibold text-center px-1">Selecionar Video</span>
                      <span className="text-[0.6rem] text-gray-400">MP4, WebM, MOV</span>
                      <span className="text-[0.6rem] text-gray-400">Max 50MB</span>
                    </button>
                  )}
                </div>

                {/* Title + actions */}
                <div className="flex-1 space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Titulo do Reel *</label>
                    <input
                      type="text"
                      value={reelTitle}
                      onChange={function (e) { setReelTitle(e.target.value); }}
                      placeholder="Ex: Troca de pastilha de freio"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400 focus:border-transparent outline-none"
                    />
                  </div>

                  {reelVideoFile && (
                    <p className="text-xs text-gray-400">
                      {reelVideoFile.name} — {(reelVideoFile.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                  )}

                  {reelUploadProgress && (
                    <div className="flex items-center gap-2 bg-white/70 border border-orange-200 rounded-lg px-3 py-2">
                      <Loader2 className="w-4 h-4 text-orange-500 animate-spin shrink-0" />
                      <span className="text-xs text-orange-700 font-medium">{reelUploadProgress}</span>
                    </div>
                  )}

                  <button
                    onClick={handleReelUpload}
                    disabled={reelUploading || !reelVideoFile}
                    className="flex items-center gap-2 bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {reelUploading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                    {reelUploading ? "Enviando..." : "Enviar e Associar Reel"}
                  </button>
                </div>
              </div>

              {/* Successfully uploaded reels in this session */}
              {reelUploadedList.length > 0 && (
                <div className="border-t border-orange-200/60 pt-3 mt-2">
                  <p className="text-xs font-semibold text-gray-600 mb-1.5">Reels enviados nesta sessao:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {reelUploadedList.map(function (item) {
                      return (
                        <span key={item.id} className="inline-flex items-center gap-1 bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full" style={{ fontSize: "0.7rem", fontWeight: 600 }}>
                          <CheckCircle2 className="w-3 h-3" />
                          {item.title}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          {!showReelUpload && (
            <button
              onClick={function () { setShowReelUpload(true); }}
              className="flex items-center gap-2 text-sm text-orange-600 hover:text-orange-700 font-semibold border border-orange-200 px-3.5 py-2 rounded-lg hover:bg-orange-50 transition-colors"
            >
              <Film className="w-4 h-4" />
              Subir Novo Reel para este Influencer
            </button>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 bg-red-600 text-white px-5 py-2.5 rounded-lg hover:bg-red-700 transition-colors text-sm font-semibold disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? "Salvando..." : "Salvar"}
            </button>
            <button
              onClick={resetForm}
              className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2.5"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-red-200 border-t-red-600 rounded-full animate-spin" />
        </div>
      ) : influencers.length === 0 && !isFormOpen ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
          <p className="text-gray-400 text-sm">Nenhum influencer cadastrado.</p>
          <p className="text-gray-400 text-xs mt-1">Clique em "Novo Influencer" para comecar.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {influencers.map(function (inf, idx) {
            var reelCount = (inf.reelIds || []).length;
            return (
              <div
                key={inf.id}
                draggable
                onDragStart={function () { handleDragStart(idx); }}
                onDragOver={function (e) { handleDragOver(e, idx); }}
                onDragEnd={handleDragEnd}
                className={"flex items-center gap-3 bg-white border rounded-lg p-3 transition-all hover:shadow-sm " +
                  (inf.active !== false ? "border-gray-200" : "border-gray-100 opacity-60") +
                  (dragIdx === idx ? " shadow-md ring-2 ring-red-200" : "")}
              >
                <div className="cursor-grab text-gray-300 hover:text-gray-400">
                  <GripVertical className="w-4 h-4" />
                </div>

                {/* Photo */}
                <div
                  className="w-12 h-12 rounded-full overflow-hidden shrink-0 border-2"
                  style={{
                    borderImage: "linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888) 1",
                    borderImageSlice: 1,
                    borderColor: "#e6683c",
                  }}
                >
                  {inf.photoUrl ? (
                    <img src={inf.photoUrl} alt={inf.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gray-200 flex items-center justify-center text-gray-400 text-lg font-bold">
                      {(inf.name || "?").charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-800 truncate">{inf.name}</p>
                  <p className="text-xs text-gray-400">
                    {reelCount} reel(s) associado(s)
                    {inf.active === false && <span className="ml-2 text-red-400 font-semibold">INATIVO</span>}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={function () { handleToggleActive(inf); }}
                    className={"p-2 rounded-lg transition-colors " + (inf.active !== false ? "text-green-600 hover:bg-green-50" : "text-gray-400 hover:bg-gray-100")}
                    title={inf.active !== false ? "Desativar" : "Ativar"}
                  >
                    {inf.active !== false ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={function () { startEdit(inf); }}
                    className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                    title="Editar"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={function () { handleDelete(inf.id); }}
                    className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
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
    </div>
  );
}