import React, { useState, useEffect, useRef } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  Save,
  MapPin,
  Phone,
  Clock,
  MessageCircle,
  ImageIcon,
  Upload,
  GripVertical,
  Eye,
  EyeOff,
  Star,
  ChevronDown,
  ChevronUp,
  X,
  ExternalLink,
} from "lucide-react";
import * as api from "../../services/api";
import type { Branch } from "../../services/api";
import { supabase } from "../../services/supabaseClient";
import { getValidAdminToken } from "./adminAuth";

async function getToken(): Promise<string> {
  return await getValidAdminToken() || "";
}

function generateId(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

var ESTADOS_BR = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA",
  "PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"
];

interface BranchForm {
  id: string;
  nome: string;
  estado: string;
  endereco: string;
  telefone: string;
  whatsapp: string;
  horario: string;
  isMatriz: boolean;
  active: boolean;
  order: number;
  mapQuery: string;
  imageUrl: string;
  file: File | null;
  preview: string | null;
  saving: boolean;
  expanded: boolean;
  isNew: boolean;
}

function branchToForm(b: Branch, expanded?: boolean): BranchForm {
  return {
    id: b.id,
    nome: b.nome || "",
    estado: b.estado || "",
    endereco: b.endereco || "",
    telefone: b.telefone || "",
    whatsapp: b.whatsapp || "",
    horario: b.horario || "Seg a Sex: 8h - 18h | Sab: 8h - 12h",
    isMatriz: b.isMatriz || false,
    active: b.active !== false,
    order: b.order || 0,
    mapQuery: b.mapQuery || "",
    imageUrl: b.imageUrl || "",
    file: null,
    preview: null,
    saving: false,
    expanded: expanded || false,
    isNew: false,
  };
}

function newBranchForm(order: number): BranchForm {
  return {
    id: generateId(),
    nome: "",
    estado: "PR",
    endereco: "",
    telefone: "",
    whatsapp: "",
    horario: "Seg a Sex: 8h - 18h | Sab: 8h - 12h",
    isMatriz: false,
    active: true,
    order: order,
    mapQuery: "",
    imageUrl: "",
    file: null,
    preview: null,
    saving: false,
    expanded: true,
    isNew: true,
  };
}

export function AdminBranches() {
  var [loading, setLoading] = useState(true);
  var [branches, setBranches] = useState<BranchForm[]>([]);
  var [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  var [deleting, setDeleting] = useState<string | null>(null);
  var fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function showToast(type: "success" | "error", msg: string) {
    setToast({ type: type, msg: msg });
    setTimeout(function () { setToast(null); }, 3500);
  }

  async function loadBranches() {
    try {
      setLoading(true);
      var token = await getToken();
      var result = await api.getAdminBranches(token);
      var list = (result.branches || []).map(function (b) { return branchToForm(b); });
      setBranches(list);
    } catch (e: any) {
      console.error("[AdminBranches] Load error:", e);
      showToast("error", "Erro ao carregar filiais: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(function () { loadBranches(); }, []);

  function updateField(id: string, field: string, value: any) {
    setBranches(function (prev) {
      return prev.map(function (b) {
        if (b.id !== id) return b;
        var updated = { ...b } as any;
        updated[field] = value;
        return updated;
      });
    });
  }

  function handleFileChange(id: string, e: React.ChangeEvent<HTMLInputElement>) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      setBranches(function (prev) {
        return prev.map(function (b) {
          if (b.id !== id) return b;
          return { ...b, file: file, preview: ev.target?.result as string };
        });
      });
    };
    reader.readAsDataURL(file);
  }

  function addBranch() {
    var maxOrder = branches.reduce(function (max, b) { return Math.max(max, b.order); }, 0);
    setBranches(function (prev) { return [...prev, newBranchForm(maxOrder + 1)]; });
  }

  async function saveBranch(id: string) {
    var branch = branches.find(function (b) { return b.id === id; });
    if (!branch) return;
    if (!branch.nome.trim()) {
      showToast("error", "Nome da filial e obrigatorio");
      return;
    }

    updateField(id, "saving", true);
    try {
      var token = await getToken();
      var fd = new FormData();
      fd.append("nome", branch.nome.trim());
      fd.append("estado", branch.estado);
      fd.append("endereco", branch.endereco.trim());
      fd.append("telefone", branch.telefone.trim());
      fd.append("whatsapp", branch.whatsapp.trim());
      fd.append("horario", branch.horario.trim());
      fd.append("isMatriz", branch.isMatriz ? "true" : "false");
      fd.append("active", branch.active ? "true" : "false");
      fd.append("order", String(branch.order));
      fd.append("mapQuery", branch.mapQuery.trim());
      if (branch.file) {
        fd.append("image", branch.file);
      }

      var result = await api.saveBranch(id, fd, token);
      setBranches(function (prev) {
        return prev.map(function (b) {
          if (b.id !== id) return b;
          return {
            ...branchToForm(result.branch, b.expanded),
            saving: false,
          };
        });
      });
      showToast("success", "Filial \"" + branch.nome + "\" salva com sucesso!");
    } catch (e: any) {
      console.error("[AdminBranches] Save error:", e);
      showToast("error", "Erro ao salvar: " + e.message);
      updateField(id, "saving", false);
    }
  }

  async function removeBranch(id: string) {
    var branch = branches.find(function (b) { return b.id === id; });
    if (!branch) return;
    if (branch.isNew) {
      setBranches(function (prev) { return prev.filter(function (b) { return b.id !== id; }); });
      return;
    }
    if (!confirm("Excluir filial \"" + branch.nome + "\"? Esta acao nao pode ser desfeita.")) return;

    setDeleting(id);
    try {
      var token = await getToken();
      await api.deleteBranch(id, token);
      setBranches(function (prev) { return prev.filter(function (b) { return b.id !== id; }); });
      showToast("success", "Filial excluida.");
    } catch (e: any) {
      console.error("[AdminBranches] Delete error:", e);
      showToast("error", "Erro ao excluir: " + e.message);
    } finally {
      setDeleting(null);
    }
  }

  function moveUp(id: string) {
    setBranches(function (prev) {
      var idx = prev.findIndex(function (b) { return b.id === id; });
      if (idx <= 0) return prev;
      var next = [...prev];
      var temp = next[idx];
      next[idx] = next[idx - 1];
      next[idx - 1] = temp;
      return next.map(function (b, i) { return { ...b, order: i }; });
    });
  }

  function moveDown(id: string) {
    setBranches(function (prev) {
      var idx = prev.findIndex(function (b) { return b.id === id; });
      if (idx < 0 || idx >= prev.length - 1) return prev;
      var next = [...prev];
      var temp = next[idx];
      next[idx] = next[idx + 1];
      next[idx + 1] = temp;
      return next.map(function (b, i) { return { ...b, order: i }; });
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Toast */}
      {toast && (
        <div
          className={"fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg border " +
            (toast.type === "success" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800")
          }
          style={{ fontSize: "0.85rem", fontWeight: 500, maxWidth: "400px" }}
        >
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-gray-900" style={{ fontSize: "1.3rem", fontWeight: 700 }}>
            Filiais
          </h2>
          <p className="text-gray-500 mt-1" style={{ fontSize: "0.85rem" }}>
            Gerencie as unidades exibidas na pagina "Sobre Nos"
          </p>
        </div>
        <button
          onClick={addBranch}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-xl transition-colors cursor-pointer"
          style={{ fontSize: "0.85rem", fontWeight: 600 }}
        >
          <Plus className="w-4 h-4" />
          Nova Filial
        </button>
      </div>

      {branches.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600" style={{ fontSize: "1rem", fontWeight: 600 }}>Nenhuma filial cadastrada</p>
          <p className="text-gray-400 mt-1" style={{ fontSize: "0.85rem" }}>
            Clique em "Nova Filial" para adicionar a primeira unidade.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {branches.map(function (branch, idx) {
            var imgSrc = branch.preview || branch.imageUrl || "";
            return (
              <div
                key={branch.id}
                className={"bg-white rounded-xl border transition-all " +
                  (branch.expanded ? "border-red-200 shadow-sm" : "border-gray-200 hover:border-gray-300")
                }
              >
                {/* Collapsed header */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                  onClick={function () { updateField(branch.id, "expanded", !branch.expanded); }}
                >
                  <GripVertical className="w-4 h-4 text-gray-300 shrink-0" />

                  {/* Thumbnail */}
                  <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
                    {imgSrc ? (
                      <img src={imgSrc} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="w-4 h-4 text-gray-300" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-900 truncate" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                        {branch.nome || "Nova Filial"}
                      </span>
                      {branch.estado && (
                        <span className="text-gray-400 shrink-0" style={{ fontSize: "0.75rem" }}>
                          {branch.estado}
                        </span>
                      )}
                      {branch.isMatriz && (
                        <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded shrink-0" style={{ fontSize: "0.6rem", fontWeight: 700 }}>
                          MATRIZ
                        </span>
                      )}
                      {!branch.active && (
                        <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded shrink-0" style={{ fontSize: "0.6rem", fontWeight: 700 }}>
                          INATIVA
                        </span>
                      )}
                      {branch.isNew && (
                        <span className="bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded shrink-0" style={{ fontSize: "0.6rem", fontWeight: 700 }}>
                          NOVO
                        </span>
                      )}
                    </div>
                    {branch.endereco && (
                      <p className="text-gray-400 truncate mt-0.5" style={{ fontSize: "0.75rem" }}>
                        {branch.endereco}
                      </p>
                    )}
                  </div>

                  {/* Reorder buttons */}
                  <div className="flex flex-col gap-0.5 shrink-0" onClick={function (e) { e.stopPropagation(); }}>
                    <button
                      onClick={function () { moveUp(branch.id); }}
                      disabled={idx === 0}
                      className="p-1 text-gray-300 hover:text-gray-600 disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={function () { moveDown(branch.id); }}
                      disabled={idx === branches.length - 1}
                      className="p-1 text-gray-300 hover:text-gray-600 disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {branch.expanded ? (
                    <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                  )}
                </div>

                {/* Expanded form */}
                {branch.expanded && (
                  <div className="border-t border-gray-100 px-4 py-5 space-y-4">
                    {/* Row 1: Nome + Estado + Matriz + Ativa */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                      <div className="sm:col-span-5">
                        <label className="block text-gray-600 mb-1" style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                          Nome da Filial *
                        </label>
                        <input
                          type="text"
                          value={branch.nome}
                          onChange={function (e) { updateField(branch.id, "nome", e.target.value); }}
                          placeholder="Ex: Maringa"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-red-300"
                          style={{ fontSize: "0.85rem" }}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-gray-600 mb-1" style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                          Estado
                        </label>
                        <select
                          value={branch.estado}
                          onChange={function (e) { updateField(branch.id, "estado", e.target.value); }}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-red-300"
                          style={{ fontSize: "0.85rem" }}
                        >
                          {ESTADOS_BR.map(function (uf) {
                            return <option key={uf} value={uf}>{uf}</option>;
                          })}
                        </select>
                      </div>
                      <div className="sm:col-span-3 flex items-end gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={branch.isMatriz}
                            onChange={function (e) { updateField(branch.id, "isMatriz", e.target.checked); }}
                            className="accent-amber-500"
                          />
                          <span className="text-gray-600" style={{ fontSize: "0.8rem", fontWeight: 500 }}>
                            <Star className="w-3.5 h-3.5 inline text-amber-500 mr-1" />
                            Matriz
                          </span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={branch.active}
                            onChange={function (e) { updateField(branch.id, "active", e.target.checked); }}
                            className="accent-green-500"
                          />
                          <span className="text-gray-600" style={{ fontSize: "0.8rem", fontWeight: 500 }}>
                            {branch.active ? <Eye className="w-3.5 h-3.5 inline text-green-500 mr-1" /> : <EyeOff className="w-3.5 h-3.5 inline text-gray-400 mr-1" />}
                            Ativa
                          </span>
                        </label>
                      </div>
                    </div>

                    {/* Row 2: Endereco */}
                    <div>
                      <label className="block text-gray-600 mb-1" style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                        <MapPin className="w-3.5 h-3.5 inline mr-1" />
                        Endereco Completo
                      </label>
                      <input
                        type="text"
                        value={branch.endereco}
                        onChange={function (e) { updateField(branch.id, "endereco", e.target.value); }}
                        placeholder="Ex: Av. Brasil, 1234 - Centro, Maringa - PR, 87013-000"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-red-300"
                        style={{ fontSize: "0.85rem" }}
                      />
                    </div>

                    {/* Row 3: Telefone + WhatsApp + Horario */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-gray-600 mb-1" style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                          <Phone className="w-3.5 h-3.5 inline mr-1" />
                          Telefone
                        </label>
                        <input
                          type="text"
                          value={branch.telefone}
                          onChange={function (e) { updateField(branch.id, "telefone", e.target.value); }}
                          placeholder="(44) 3123-3000"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-red-300"
                          style={{ fontSize: "0.85rem" }}
                        />
                      </div>
                      <div>
                        <label className="block text-gray-600 mb-1" style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                          <MessageCircle className="w-3.5 h-3.5 inline mr-1" />
                          WhatsApp
                        </label>
                        <input
                          type="text"
                          value={branch.whatsapp}
                          onChange={function (e) { updateField(branch.id, "whatsapp", e.target.value); }}
                          placeholder="(44) 99733-0202"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-red-300"
                          style={{ fontSize: "0.85rem" }}
                        />
                      </div>
                      <div>
                        <label className="block text-gray-600 mb-1" style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                          <Clock className="w-3.5 h-3.5 inline mr-1" />
                          Horario de Funcionamento
                        </label>
                        <input
                          type="text"
                          value={branch.horario}
                          onChange={function (e) { updateField(branch.id, "horario", e.target.value); }}
                          placeholder="Seg a Sex: 8h - 18h | Sab: 8h - 12h"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-red-300"
                          style={{ fontSize: "0.85rem" }}
                        />
                      </div>
                    </div>

                    {/* Row 4: Google Maps Query */}
                    <div>
                      <label className="block text-gray-600 mb-1" style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                        <MapPin className="w-3.5 h-3.5 inline mr-1" />
                        Busca no Google Maps
                      </label>
                      <p className="text-gray-400 mb-1.5" style={{ fontSize: "0.72rem" }}>
                        Texto usado para localizar no mapa. Use o endereco completo ou o nome do local no Google Maps.
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={branch.mapQuery}
                          onChange={function (e) { updateField(branch.id, "mapQuery", e.target.value); }}
                          placeholder="Ex: Carretao Auto Pecas Maringa PR"
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-red-300"
                          style={{ fontSize: "0.85rem" }}
                        />
                        {branch.mapQuery && (
                          <a
                            href={"https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(branch.mapQuery)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-gray-500 hover:text-red-600 hover:border-red-200 transition-colors shrink-0"
                            style={{ fontSize: "0.78rem" }}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Testar
                          </a>
                        )}
                      </div>

                      {/* Map preview */}
                      {branch.mapQuery && (
                        <div className="mt-3 rounded-lg overflow-hidden border border-gray-200" style={{ height: "200px" }}>
                          <iframe
                            src={"https://maps.google.com/maps?q=" + encodeURIComponent(branch.mapQuery) + "&output=embed&hl=pt-BR"}
                            width="100%"
                            height="200"
                            style={{ border: 0 }}
                            loading="lazy"
                            referrerPolicy="no-referrer-when-downgrade"
                            title={"Mapa " + branch.nome}
                          />
                        </div>
                      )}
                    </div>

                    {/* Row 5: Photo */}
                    <div>
                      <label className="block text-gray-600 mb-1" style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                        <ImageIcon className="w-3.5 h-3.5 inline mr-1" />
                        Foto da Unidade
                      </label>
                      <div className="flex items-start gap-4">
                        {/* Preview */}
                        <div className="w-32 h-24 rounded-lg bg-gray-50 border border-gray-200 overflow-hidden flex items-center justify-center shrink-0">
                          {imgSrc ? (
                            <img src={imgSrc} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <ImageIcon className="w-8 h-8 text-gray-200" />
                          )}
                        </div>
                        <div>
                          <input
                            type="file"
                            accept="image/*"
                            ref={function (el) { fileRefs.current[branch.id] = el; }}
                            onChange={function (e) { handleFileChange(branch.id, e); }}
                            className="hidden"
                          />
                          <button
                            onClick={function () {
                              var ref = fileRefs.current[branch.id];
                              if (ref) ref.click();
                            }}
                            className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
                            style={{ fontSize: "0.8rem", fontWeight: 500 }}
                          >
                            <Upload className="w-3.5 h-3.5" />
                            {imgSrc ? "Trocar foto" : "Enviar foto"}
                          </button>
                          <p className="text-gray-400 mt-1.5" style={{ fontSize: "0.7rem" }}>
                            JPG, PNG ou WebP.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                      <button
                        onClick={function () { removeBranch(branch.id); }}
                        disabled={deleting === branch.id}
                        className="flex items-center gap-1.5 text-gray-400 hover:text-red-600 transition-colors cursor-pointer disabled:opacity-50"
                        style={{ fontSize: "0.8rem" }}
                      >
                        {deleting === branch.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                        Excluir filial
                      </button>
                      <button
                        onClick={function () { saveBranch(branch.id); }}
                        disabled={branch.saving}
                        className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                        style={{ fontSize: "0.85rem", fontWeight: 600 }}
                      >
                        {branch.saving ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        Salvar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add button at bottom */}
      {branches.length > 0 && (
        <button
          onClick={addBranch}
          className="mt-4 w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 hover:text-red-600 hover:border-red-300 transition-colors cursor-pointer"
          style={{ fontSize: "0.85rem", fontWeight: 500 }}
        >
          <Plus className="w-4 h-4" />
          Adicionar outra filial
        </button>
      )}
    </div>
  );
}