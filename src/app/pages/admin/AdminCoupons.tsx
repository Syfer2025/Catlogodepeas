import { useState, useEffect } from "react";
import React from "react";
import {
  Ticket,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  AlertTriangle,
  X,
  Check,
  Copy,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  Search,
} from "lucide-react";
import * as api from "../../services/api";
import { supabase } from "../../services/supabaseClient";
import { getValidAdminToken } from "./adminAuth";

function formatDate(timestamp: number): string {
  if (!timestamp) return "-";
  var d = new Date(timestamp);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) +
    " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatExpiryDate(dateStr: string | null): string {
  if (!dateStr) return "Sem validade";
  try {
    var d = new Date(dateStr);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return dateStr;
  }
}

const EMPTY_FORM = {
  code: "",
  description: "",
  discountType: "percentage" as "percentage" | "fixed",
  discountValue: 0,
  minOrderValue: 0,
  maxUses: 0,
  active: true,
  expiresAt: "",
};

export function AdminCoupons() {
  const [coupons, setCoupons] = useState<api.Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Delete
  const [deleting, setDeleting] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const getToken = async (): Promise<string> => {
    const token = await getValidAdminToken();
    if (!token) throw new Error("Sessão expirada");
    return token;
  };

  const fetchCoupons = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const data = await api.getAdminCoupons(token);
      setCoupons(data.coupons || []);
    } catch (e: any) {
      console.error("[AdminCoupons] Fetch error:", e);
      setError(e.message || "Erro ao carregar cupons");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCoupons();
  }, []);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM });
    setEditingCode(null);
    setSaveError(null);
    setShowModal(true);
  };

  const openEdit = (coupon: api.Coupon) => {
    setForm({
      code: coupon.code,
      description: coupon.description || "",
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      minOrderValue: coupon.minOrderValue,
      maxUses: coupon.maxUses,
      active: coupon.active,
      expiresAt: coupon.expiresAt ? coupon.expiresAt.substring(0, 10) : "",
    });
    setEditingCode(coupon.code);
    setSaveError(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const token = await getToken();
      if (editingCode) {
        await api.updateCoupon(token, editingCode, {
          description: form.description,
          discountType: form.discountType,
          discountValue: form.discountValue,
          minOrderValue: form.minOrderValue,
          maxUses: form.maxUses,
          active: form.active,
          expiresAt: form.expiresAt || null,
        } as any);
      } else {
        if (!form.code.trim()) {
          setSaveError("Código do cupom é obrigatório");
          setSaving(false);
          return;
        }
        if (form.discountValue <= 0) {
          setSaveError("Valor do desconto deve ser maior que zero");
          setSaving(false);
          return;
        }
        await api.createCoupon(token, {
          code: form.code,
          description: form.description,
          discountType: form.discountType,
          discountValue: form.discountValue,
          minOrderValue: form.minOrderValue,
          maxUses: form.maxUses,
          active: form.active,
          expiresAt: form.expiresAt || null,
        } as any);
      }
      setShowModal(false);
      fetchCoupons();
    } catch (e: any) {
      console.error("[AdminCoupons] Save error:", e);
      setSaveError(e.message || "Erro ao salvar cupom");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (code: string) => {
    if (!confirm("Excluir o cupom " + code + "? Esta ação não pode ser desfeita.")) return;
    setDeleting(code);
    try {
      const token = await getToken();
      await api.deleteCoupon(token, code);
      fetchCoupons();
    } catch (e: any) {
      console.error("[AdminCoupons] Delete error:", e);
      alert("Erro ao excluir: " + (e.message || e));
    } finally {
      setDeleting(null);
    }
  };

  const handleToggleActive = async (coupon: api.Coupon) => {
    try {
      const token = await getToken();
      await api.updateCoupon(token, coupon.code, { active: !coupon.active } as any);
      fetchCoupons();
    } catch (e: any) {
      console.error("[AdminCoupons] Toggle error:", e);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const filteredCoupons = search.trim()
    ? coupons.filter((c) =>
        c.code.toLowerCase().indexOf(search.toLowerCase()) >= 0 ||
        (c.description || "").toLowerCase().indexOf(search.toLowerCase()) >= 0
      )
    : coupons;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
        <span className="ml-3 text-gray-500" style={{ fontSize: "0.9rem" }}>Carregando cupons...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertTriangle className="w-10 h-10 text-red-400 mb-3" />
        <p className="text-gray-600 mb-4" style={{ fontSize: "0.9rem" }}>{error}</p>
        <button onClick={fetchCoupons} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2" style={{ fontSize: "0.85rem" }}>
          <RefreshCw className="w-4 h-4" /> Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-gray-900" style={{ fontSize: "1.3rem", fontWeight: 700 }}>Cupons de Desconto</h2>
          <p className="text-gray-500 mt-0.5" style={{ fontSize: "0.8rem" }}>{coupons.length} {coupons.length === 1 ? "cupom" : "cupons"} cadastrados</p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
          style={{ fontSize: "0.85rem", fontWeight: 600 }}
        >
          <Plus className="w-4 h-4" />
          Novo Cupom
        </button>
      </div>

      {/* Search */}
      {coupons.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar cupons..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
            style={{ fontSize: "0.85rem" }}
          />
        </div>
      )}

      {/* Coupon cards */}
      {filteredCoupons.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
          <Ticket className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600" style={{ fontSize: "0.95rem", fontWeight: 600 }}>
            {search ? "Nenhum cupom encontrado" : "Nenhum cupom cadastrado"}
          </p>
          <p className="text-gray-400 mt-1" style={{ fontSize: "0.8rem" }}>
            {search ? "Tente outro termo de busca" : "Crie seu primeiro cupom de desconto"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredCoupons.map((coupon) => {
            const isExpired = coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now();
            const isExhausted = coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses;
            return (
              <div
                key={coupon.code}
                className={"bg-white rounded-xl border p-5 transition-shadow hover:shadow-md " +
                  (coupon.active && !isExpired && !isExhausted
                    ? "border-gray-100"
                    : "border-gray-200 opacity-70")}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={"w-10 h-10 rounded-lg flex items-center justify-center " +
                      (coupon.active ? "bg-red-50" : "bg-gray-100")}>
                      <Ticket className={"w-5 h-5 " + (coupon.active ? "text-red-500" : "text-gray-400")} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-900 font-mono" style={{ fontSize: "1rem", fontWeight: 700 }}>
                          {coupon.code}
                        </span>
                        <button
                          onClick={() => handleCopyCode(coupon.code)}
                          className="text-gray-400 hover:text-gray-600 transition-colors"
                          title="Copiar codigo"
                        >
                          {copied === coupon.code ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      {coupon.description && (
                        <p className="text-gray-500 mt-0.5" style={{ fontSize: "0.7rem" }}>{coupon.description}</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggleActive(coupon)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                    title={coupon.active ? "Desativar" : "Ativar"}
                  >
                    {coupon.active
                      ? <ToggleRight className="w-6 h-6 text-green-500" />
                      : <ToggleLeft className="w-6 h-6 text-gray-400" />}
                  </button>
                </div>

                {/* Discount */}
                <div className="bg-gray-50 rounded-lg p-3 mb-3">
                  <span className="text-gray-900" style={{ fontSize: "1.3rem", fontWeight: 800 }}>
                    {coupon.discountType === "percentage"
                      ? coupon.discountValue + "%"
                      : "R$ " + coupon.discountValue.toFixed(2).replace(".", ",")}
                  </span>
                  <span className="text-gray-500 ml-2" style={{ fontSize: "0.75rem" }}>
                    {coupon.discountType === "percentage" ? "de desconto" : "de desconto fixo"}
                  </span>
                </div>

                {/* Details */}
                <div className="space-y-1.5 mb-4">
                  <div className="flex justify-between">
                    <span className="text-gray-500" style={{ fontSize: "0.72rem" }}>Pedido minimo</span>
                    <span className="text-gray-700" style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                      {coupon.minOrderValue > 0 ? "R$ " + coupon.minOrderValue.toFixed(2).replace(".", ",") : "Sem minimo"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500" style={{ fontSize: "0.72rem" }}>Usos</span>
                    <span className="text-gray-700" style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                      {coupon.usedCount}{coupon.maxUses > 0 ? " / " + coupon.maxUses : " (ilimitado)"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500" style={{ fontSize: "0.72rem" }}>Validade</span>
                    <span className={"" + (isExpired ? "text-red-500" : "text-gray-700")} style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                      {formatExpiryDate(coupon.expiresAt)}{isExpired ? " (expirado)" : ""}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500" style={{ fontSize: "0.72rem" }}>Criado em</span>
                    <span className="text-gray-700" style={{ fontSize: "0.72rem" }}>{formatDate(coupon.createdAt)}</span>
                  </div>
                </div>

                {/* Status badges */}
                <div className="flex items-center gap-2 mb-3">
                  {coupon.active && !isExpired && !isExhausted && (
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full" style={{ fontSize: "0.65rem", fontWeight: 600 }}>Ativo</span>
                  )}
                  {!coupon.active && (
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full" style={{ fontSize: "0.65rem", fontWeight: 600 }}>Inativo</span>
                  )}
                  {isExpired && (
                    <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded-full" style={{ fontSize: "0.65rem", fontWeight: 600 }}>Expirado</span>
                  )}
                  {isExhausted && (
                    <span className="px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full" style={{ fontSize: "0.65rem", fontWeight: 600 }}>Esgotado</span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => openEdit(coupon)}
                    className="flex-1 py-2 px-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-1.5"
                    style={{ fontSize: "0.8rem" }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(coupon.code)}
                    disabled={deleting === coupon.code}
                    className="py-2 px-3 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                    style={{ fontSize: "0.8rem" }}
                  >
                    {deleting === coupon.code ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="text-gray-900" style={{ fontSize: "1.1rem", fontWeight: 700 }}>
                {editingCode ? "Editar Cupom" : "Novo Cupom"}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {saveError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-red-600" style={{ fontSize: "0.8rem" }}>{saveError}</p>
                </div>
              )}

              {/* Code */}
              <div>
                <label className="block text-gray-700 mb-1" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Codigo do Cupom</label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })}
                  disabled={!!editingCode}
                  placeholder="ex: DESCONTO10"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-white text-gray-900 font-mono disabled:bg-gray-100 disabled:text-gray-500 focus:ring-2 focus:ring-red-500 outline-none"
                  style={{ fontSize: "0.9rem", fontWeight: 600 }}
                  maxLength={30}
                />
                <p className="text-gray-400 mt-1" style={{ fontSize: "0.65rem" }}>Letras, numeros, hifen e underline</p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-gray-700 mb-1" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Descricao (opcional)</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="ex: Desconto de lancamento"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-red-500 outline-none"
                  style={{ fontSize: "0.85rem" }}
                />
              </div>

              {/* Discount type + value */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 mb-1" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Tipo</label>
                  <select
                    value={form.discountType}
                    onChange={(e) => setForm({ ...form, discountType: e.target.value as "percentage" | "fixed" })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-red-500 outline-none"
                    style={{ fontSize: "0.85rem" }}
                  >
                    <option value="percentage">Percentual (%)</option>
                    <option value="fixed">Valor fixo (R$)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-700 mb-1" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                    Valor {form.discountType === "percentage" ? "(%)" : "(R$)"}
                  </label>
                  <input
                    type="number"
                    value={form.discountValue || ""}
                    onChange={(e) => setForm({ ...form, discountValue: parseFloat(e.target.value) || 0 })}
                    min={0}
                    max={form.discountType === "percentage" ? 100 : 99999}
                    step={form.discountType === "percentage" ? 1 : 0.01}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-red-500 outline-none"
                    style={{ fontSize: "0.85rem" }}
                  />
                </div>
              </div>

              {/* Min order + max uses */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 mb-1" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Pedido mínimo (R$)</label>
                  <input
                    type="number"
                    value={form.minOrderValue || ""}
                    onChange={(e) => setForm({ ...form, minOrderValue: parseFloat(e.target.value) || 0 })}
                    min={0}
                    step={0.01}
                    placeholder="0 = sem minimo"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-red-500 outline-none"
                    style={{ fontSize: "0.85rem" }}
                  />
                </div>
                <div>
                  <label className="block text-gray-700 mb-1" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Max usos</label>
                  <input
                    type="number"
                    value={form.maxUses || ""}
                    onChange={(e) => setForm({ ...form, maxUses: parseInt(e.target.value) || 0 })}
                    min={0}
                    step={1}
                    placeholder="0 = ilimitado"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-red-500 outline-none"
                    style={{ fontSize: "0.85rem" }}
                  />
                </div>
              </div>

              {/* Expiry + active */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 mb-1" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Validade (opcional)</label>
                  <input
                    type="date"
                    value={form.expiresAt}
                    onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-red-500 outline-none"
                    style={{ fontSize: "0.85rem" }}
                  />
                </div>
                <div>
                  <label className="block text-gray-700 mb-1" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Status</label>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, active: !form.active })}
                    className={"w-full px-3 py-2.5 border rounded-lg flex items-center justify-center gap-2 transition-colors " +
                      (form.active
                        ? "border-green-300 bg-green-50 text-green-700"
                        : "border-gray-200 bg-gray-50 text-gray-500")}
                    style={{ fontSize: "0.85rem", fontWeight: 600 }}
                  >
                    {form.active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                    {form.active ? "Ativo" : "Inativo"}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
                style={{ fontSize: "0.85rem" }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-red-400 transition-colors flex items-center gap-2"
                style={{ fontSize: "0.85rem", fontWeight: 600 }}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {editingCode ? "Salvar" : "Criar Cupom"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
