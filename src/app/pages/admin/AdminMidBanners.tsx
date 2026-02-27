import React, { useState, useEffect, useRef } from "react";
import { Upload, Trash2, Loader2, ImageIcon, Link2, Save, Eye, EyeOff } from "lucide-react";
import * as api from "../../services/api";
import type { MidBanner } from "../../services/api";
import { supabase } from "../../services/supabaseClient";
import { getValidAdminToken } from "./adminAuth";
import { invalidateHomepageCache } from "../../contexts/HomepageInitContext";

var TOTAL_SLOTS = 4;

interface SlotState {
  banner: MidBanner | null;
  file: File | null;
  preview: string | null;
  link: string;
  active: boolean;
  saving: boolean;
  deleting: boolean;
}

function makeEmptySlot(): SlotState {
  return { banner: null, file: null, preview: null, link: "", active: true, saving: false, deleting: false };
}

export function AdminMidBanners() {
  const [loading, setLoading] = useState(true);
  const [slots, setSlots] = useState<SlotState[]>(function () {
    var arr: SlotState[] = [];
    for (var i = 0; i < TOTAL_SLOTS; i++) arr.push(makeEmptySlot());
    return arr;
  });
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const fileRef0 = useRef<HTMLInputElement>(null);
  const fileRef1 = useRef<HTMLInputElement>(null);
  const fileRef2 = useRef<HTMLInputElement>(null);
  const fileRef3 = useRef<HTMLInputElement>(null);
  var fileRefs = [fileRef0, fileRef1, fileRef2, fileRef3];

  function showToast(type: "success" | "error", msg: string) {
    setToast({ type, msg });
    setTimeout(function () { setToast(null); }, 3500);
  }

  async function loadBanners() {
    try {
      setLoading(true);
      var token = await getValidAdminToken();
      var result = await api.getMidBanners(token);
      var banners = result.banners || [];
      setSlots(function (prev) {
        return prev.map(function (s, i) {
          var found = banners.find(function (b) { return b.slot === i + 1; });
          if (found) {
            return {
              ...s,
              banner: found,
              link: found.link || "",
              active: found.active !== false,
              preview: found.imageUrl || null,
              file: null,
            };
          }
          return { ...s, banner: null, file: null, preview: null, link: "", active: true };
        });
      });
    } catch (e: any) {
      console.error("[AdminMidBanners] Load error:", e);
      showToast("error", "Erro ao carregar: " + (e.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(function () { loadBanners(); }, []);

  function handleFileChange(slotIdx: number, e: React.ChangeEvent<HTMLInputElement>) {
    var files = e.target.files;
    if (!files || files.length === 0) return;
    var file = files[0];
    var previewUrl = URL.createObjectURL(file);
    setSlots(function (prev) {
      var next = [...prev];
      next[slotIdx] = { ...next[slotIdx], file: file, preview: previewUrl };
      return next;
    });
  }

  function updateSlot(slotIdx: number, field: string, value: any) {
    setSlots(function (prev) {
      var next = [...prev];
      var s = { ...next[slotIdx] } as any;
      s[field] = value;
      next[slotIdx] = s;
      return next;
    });
  }

  async function handleSave(slotIdx: number) {
    var s = slots[slotIdx];
    if (!s.file && !s.banner?.imageUrl) {
      showToast("error", "Selecione uma imagem para o banner " + (slotIdx + 1));
      return;
    }
    updateSlot(slotIdx, "saving", true);
    try {
      var token = await getValidAdminToken();
      var formData = new FormData();
      if (s.file) formData.append("image", s.file);
      formData.append("link", s.link);
      formData.append("active", String(s.active));
      await api.saveMidBanner(slotIdx + 1, formData, token);
      invalidateHomepageCache();
      showToast("success", "Banner " + (slotIdx + 1) + " salvo com sucesso!");
      await loadBanners();
    } catch (e: any) {
      console.error("[AdminMidBanners] Save error:", e);
      showToast("error", "Erro ao salvar: " + (e.message || e));
    } finally {
      updateSlot(slotIdx, "saving", false);
    }
  }

  async function handleDelete(slotIdx: number) {
    if (!confirm("Remover banner " + (slotIdx + 1) + "?")) return;
    updateSlot(slotIdx, "deleting", true);
    try {
      var token = await getValidAdminToken();
      await api.deleteMidBanner(slotIdx + 1, token);
      invalidateHomepageCache();
      showToast("success", "Banner " + (slotIdx + 1) + " removido!");
      setSlots(function (prev) {
        var next = [...prev];
        next[slotIdx] = makeEmptySlot();
        return next;
      });
    } catch (e: any) {
      console.error("[AdminMidBanners] Delete error:", e);
      showToast("error", "Erro ao remover: " + (e.message || e));
    } finally {
      updateSlot(slotIdx, "deleting", false);
    }
  }

  function renderSlotCard(slot: SlotState, idx: number) {
    return (
      <div key={idx} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-700 text-sm">
            Banner {idx + 1}
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={function () { updateSlot(idx, "active", !slot.active); }}
              className={"flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors " +
                (slot.active
                  ? "bg-green-50 border-green-200 text-green-700"
                  : "bg-gray-50 border-gray-200 text-gray-500")}
              title={slot.active ? "Ativo" : "Inativo"}
            >
              {slot.active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              {slot.active ? "Ativo" : "Inativo"}
            </button>
          </div>
        </div>

        {/* Image preview / upload area */}
        <div
          className="relative w-full overflow-hidden rounded-lg bg-gray-50 border-2 border-dashed border-gray-300 hover:border-red-300 cursor-pointer transition-colors group"
          style={{ aspectRatio: "2048 / 595" }}
          onClick={function () { fileRefs[idx].current?.click(); }}
        >
          {slot.preview ? (
            <img
              src={slot.preview}
              alt={"Banner " + (idx + 1)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-400">
              <ImageIcon className="w-8 h-8" />
              <span className="text-xs font-medium">2.048 x 595 px</span>
              <span className="text-xs">Clique para selecionar</span>
            </div>
          )}
          {slot.preview && (
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
              <Upload className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          )}
          <input
            ref={fileRefs[idx]}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={function (e) { handleFileChange(idx, e); }}
          />
        </div>

        {/* Link field */}
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            type="text"
            placeholder="Link (ex: /catalogo?marca=bosch ou https://...)"
            value={slot.link}
            onChange={function (e) { updateSlot(idx, "link", e.target.value); }}
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400"
          />
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={function () { handleSave(idx); }}
            disabled={slot.saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {slot.saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </button>
          {(slot.banner?.imageUrl || slot.preview) && (
            <button
              onClick={function () { handleDelete(idx); }}
              disabled={slot.deleting}
              className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-red-50 border border-gray-200 hover:border-red-300 text-red-600 text-sm font-medium rounded-lg transition-colors"
            >
              {slot.deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Remover
            </button>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Toast */}
      {toast && (
        <div
          className={"fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium " +
            (toast.type === "success" ? "bg-green-600" : "bg-red-600")}
        >
          {toast.msg}
        </div>
      )}

      <div>
        <h2 className="text-lg font-bold text-gray-800 mb-1">Banners Mid-Page</h2>
        <p className="text-sm text-gray-500">
          Quatro banners em dois pares, exibidos em posições diferentes da homepage. Tamanho recomendado: 2.048 x 595 px.
        </p>
      </div>

      {/* Group 1: Slots 3 & 4 — after Super Promo */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">
            Posição 1
          </span>
          <span className="text-sm text-gray-600 font-medium">
            Após Super Promoção (antes dos Produtos em Destaque)
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {renderSlotCard(slots[2], 2)}
          {renderSlotCard(slots[3], 3)}
        </div>
      </div>

      {/* Group 2: Slots 1 & 2 — after Products */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold">
            Posição 2
          </span>
          <span className="text-sm text-gray-600 font-medium">
            Após Produtos em Destaque (antes do CTA)
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {renderSlotCard(slots[0], 0)}
          {renderSlotCard(slots[1], 1)}
        </div>
      </div>
    </div>
  );
}