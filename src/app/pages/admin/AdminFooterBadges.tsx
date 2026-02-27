import React, { useState, useEffect, useRef } from "react";
import { Upload, Trash2, Loader2, ImageIcon, Link2, Save, Eye, EyeOff, CreditCard, Truck, ShieldCheck } from "lucide-react";
import * as api from "../../services/api";
import type { FooterBadge } from "../../services/api";
import { supabase } from "../../services/supabaseClient";
import { getValidAdminToken } from "./adminAuth";
import { invalidateHomepageCache } from "../../contexts/HomepageInitContext";

var PAYMENT_KEYS = ["pay1", "pay2", "pay3", "pay4", "pay5", "pay6"];
var SHIPPING_KEYS = ["ship1", "ship2", "ship3"];
var RA_KEY = "ra";

var ALL_KEYS = PAYMENT_KEYS.concat(SHIPPING_KEYS).concat([RA_KEY]);

interface SlotState {
  badge: FooterBadge | null;
  file: File | null;
  preview: string | null;
  link: string;
  alt: string;
  active: boolean;
  saving: boolean;
  deleting: boolean;
}

function makeEmpty(): SlotState {
  return { badge: null, file: null, preview: null, link: "", alt: "", active: true, saving: false, deleting: false };
}

export function AdminFooterBadges() {
  var [loading, setLoading] = useState(true);
  var [slotsMap, setSlotsMap] = useState<Record<string, SlotState>>(function () {
    var m: Record<string, SlotState> = {};
    for (var i = 0; i < ALL_KEYS.length; i++) m[ALL_KEYS[i]] = makeEmpty();
    return m;
  });
  var [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // File refs — one per slot
  var fileRefs: Record<string, React.RefObject<HTMLInputElement | null>> = {};
  for (var ki = 0; ki < ALL_KEYS.length; ki++) {
    fileRefs[ALL_KEYS[ki]] = useRef<HTMLInputElement>(null);
  }

  function showToast(type: "success" | "error", msg: string) {
    setToast({ type, msg });
    setTimeout(function () { setToast(null); }, 3500);
  }

  function updateSlot(key: string, field: string, value: any) {
    setSlotsMap(function (prev) {
      var s = prev[key] ? { ...prev[key] } as any : makeEmpty() as any;
      s[field] = value;
      return { ...prev, [key]: s };
    });
  }

  async function loadBadges() {
    try {
      setLoading(true);
      var token = await getValidAdminToken();
      var result = await api.getFooterBadges(token);
      var badges = result.badges || [];
      setSlotsMap(function (prev) {
        var next = { ...prev };
        for (var i = 0; i < ALL_KEYS.length; i++) {
          var k = ALL_KEYS[i];
          var found = badges.find(function (b) { return b.key === k; });
          if (found) {
            next[k] = {
              badge: found,
              link: found.link || "",
              alt: found.alt || "",
              active: found.active !== false,
              preview: found.imageUrl || null,
              file: null,
              saving: false,
              deleting: false,
            };
          } else {
            next[k] = makeEmpty();
          }
        }
        return next;
      });
    } catch (e: any) {
      console.error("[AdminFooterBadges] Load error:", e);
      showToast("error", "Erro ao carregar: " + (e.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(function () { loadBadges(); }, []);

  function handleFileChange(key: string, e: React.ChangeEvent<HTMLInputElement>) {
    var files = e.target.files;
    if (!files || files.length === 0) return;
    var file = files[0];
    var previewUrl = URL.createObjectURL(file);
    updateSlot(key, "file", file);
    updateSlot(key, "preview", previewUrl);
  }

  async function handleSave(key: string) {
    var s = slotsMap[key];
    if (!s) return;
    if (!s.file && !s.badge?.imageUrl) {
      showToast("error", "Selecione uma imagem para " + key);
      return;
    }
    updateSlot(key, "saving", true);
    try {
      var token = await getValidAdminToken();
      var formData = new FormData();
      if (s.file) formData.append("image", s.file);
      formData.append("link", s.link);
      formData.append("alt", s.alt);
      formData.append("active", String(s.active));
      await api.saveFooterBadge(key, formData, token);
      invalidateHomepageCache();
      showToast("success", key + " salvo com sucesso!");
      await loadBadges();
    } catch (e: any) {
      console.error("[AdminFooterBadges] Save error:", e);
      showToast("error", "Erro ao salvar: " + (e.message || e));
    } finally {
      updateSlot(key, "saving", false);
    }
  }

  async function handleDelete(key: string) {
    if (!confirm("Remover badge " + key + "?")) return;
    updateSlot(key, "deleting", true);
    try {
      var token = await getValidAdminToken();
      await api.deleteFooterBadge(key, token);
      invalidateHomepageCache();
      showToast("success", key + " removido!");
      setSlotsMap(function (prev) {
        return { ...prev, [key]: makeEmpty() };
      });
    } catch (e: any) {
      console.error("[AdminFooterBadges] Delete error:", e);
      showToast("error", "Erro ao remover: " + (e.message || e));
    } finally {
      updateSlot(key, "deleting", false);
    }
  }

  function renderBadgeCard(key: string, label: string, isWide?: boolean) {
    var s = slotsMap[key] || makeEmpty();
    return (
      <div key={key} className={"bg-white border border-gray-200 rounded-xl p-4 space-y-3" + (isWide ? " lg:col-span-2" : "")}>
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-gray-700 text-xs uppercase tracking-wide">{label}</h4>
          <button
            onClick={function () { updateSlot(key, "active", !s.active); }}
            className={"flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-colors " +
              (s.active
                ? "bg-green-50 border-green-200 text-green-700"
                : "bg-gray-50 border-gray-200 text-gray-500")}
          >
            {s.active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            {s.active ? "Ativo" : "Inativo"}
          </button>
        </div>

        {/* Image upload */}
        <div
          className="relative w-full overflow-hidden rounded-lg bg-gray-50 border-2 border-dashed border-gray-300 hover:border-red-300 cursor-pointer transition-colors group flex items-center justify-center"
          style={{ height: isWide ? 80 : 64 }}
          onClick={function () { fileRefs[key]?.current?.click(); }}
        >
          {s.preview ? (
            <img
              src={s.preview}
              alt={s.alt || label}
              className="h-full w-auto object-contain p-1"
            />
          ) : (
            <div className="flex flex-col items-center gap-1 text-gray-400">
              <ImageIcon className="w-5 h-5" />
              <span className="text-[10px]">Clique para upload</span>
            </div>
          )}
          {s.preview && (
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
              <Upload className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          )}
          <input
            ref={fileRefs[key]}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={function (e) { handleFileChange(key, e); }}
          />
        </div>

        {/* Alt text */}
        <input
          type="text"
          placeholder="Texto alternativo (ex: Visa, Correios...)"
          value={s.alt}
          onChange={function (e) { updateSlot(key, "alt", e.target.value); }}
          className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400"
        />

        {/* Link field */}
        <div className="flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <input
            type="text"
            placeholder="Link (opcional)"
            value={s.link}
            onChange={function (e) { updateSlot(key, "link", e.target.value); }}
            className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={function () { handleSave(key); }}
            disabled={s.saving}
            className="flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-xs font-medium rounded-lg transition-colors"
          >
            {s.saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Salvar
          </button>
          {(s.badge?.imageUrl || s.preview) && (
            <button
              onClick={function () { handleDelete(key); }}
              disabled={s.deleting}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-red-50 border border-gray-200 hover:border-red-300 text-red-600 text-xs font-medium rounded-lg transition-colors"
            >
              {s.deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
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
        <h2 className="text-lg font-bold text-gray-800 mb-1">Selos e Badges do Rodape</h2>
        <p className="text-sm text-gray-500">
          Logos de meios de pagamento, sistemas de frete e selo do Reclame Aqui exibidos no rodape do site. Use imagens PNG com fundo transparente para melhor resultado.
        </p>
      </div>

      {/* Payment Logos */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <CreditCard className="w-4 h-4 text-blue-600" />
          <span className="text-sm text-gray-700 font-semibold">Meios de Pagamento</span>
          <span className="text-xs text-gray-400">(ate 6 logos)</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PAYMENT_KEYS.map(function (k, i) {
            return renderBadgeCard(k, "Pagamento " + (i + 1));
          })}
        </div>
      </div>

      {/* Shipping Logos */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Truck className="w-4 h-4 text-emerald-600" />
          <span className="text-sm text-gray-700 font-semibold">Sistemas de Frete</span>
          <span className="text-xs text-gray-400">(ate 3 logos)</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SHIPPING_KEYS.map(function (k, i) {
            return renderBadgeCard(k, "Frete " + (i + 1));
          })}
        </div>
      </div>

      {/* Reclame Aqui */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-4 h-4 text-green-600" />
          <span className="text-sm text-gray-700 font-semibold">Reclame Aqui</span>
          <span className="text-xs text-gray-400">(com link de redirect)</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {renderBadgeCard(RA_KEY, "Selo Reclame Aqui", true)}
        </div>
      </div>
    </div>
  );
}