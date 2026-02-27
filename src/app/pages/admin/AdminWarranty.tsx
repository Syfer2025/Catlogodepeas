import { useState, useEffect, useCallback } from "react";
import React from "react";
import {
  ShieldCheck,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  AlertTriangle,
  X,
  Check,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  Search,
  Package,
  Clock,
  Percent,
  DollarSign,
  Tag,
  ChevronDown,
  ChevronUp,
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

const EMPTY_FORM = {
  name: "",
  description: "",
  durationMonths: 12,
  priceType: "percentage" as "percentage" | "fixed",
  priceValue: 0,
  active: true,
};

export function AdminWarranty() {
  const [plans, setPlans] = useState<api.WarrantyPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Delete
  const [deleting, setDeleting] = useState<string | null>(null);

  // SKU assignment
  const [skuPanelOpen, setSkuPanelOpen] = useState<string | null>(null);
  const [skuInput, setSkuInput] = useState("");
  const [savingSkus, setSavingSkus] = useState(false);
  const [localSkus, setLocalSkus] = useState<string[]>([]);

  // Product name search
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<Array<{ sku: string; titulo: string }>>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [searchTimer, setSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const getToken = async (): Promise<string> => {
    const token = await getValidAdminToken();
    if (!token) throw new Error("Sessao expirada");
    return token;
  };

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const data = await api.getAdminWarrantyPlans(token);
      setPlans(data.plans || []);
    } catch (e: any) {
      console.error("[AdminWarranty] Fetch error:", e);
      setError(e.message || "Erro ao carregar planos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
    setSaveError(null);
    setShowModal(true);
  };

  const openEdit = (plan: api.WarrantyPlan) => {
    setForm({
      name: plan.name,
      description: plan.description || "",
      durationMonths: plan.durationMonths,
      priceType: plan.priceType,
      priceValue: plan.priceValue,
      active: plan.active,
    });
    setEditingId(plan.id);
    setSaveError(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const token = await getToken();
      if (editingId) {
        await api.updateWarrantyPlan(token, editingId, {
          name: form.name,
          description: form.description,
          durationMonths: form.durationMonths,
          priceType: form.priceType,
          priceValue: form.priceValue,
          active: form.active,
        } as any);
      } else {
        if (!form.name.trim()) {
          setSaveError("Nome do plano e obrigatorio");
          setSaving(false);
          return;
        }
        if (form.priceValue <= 0) {
          setSaveError("Valor deve ser maior que zero");
          setSaving(false);
          return;
        }
        await api.createWarrantyPlan(token, {
          name: form.name,
          description: form.description,
          durationMonths: form.durationMonths,
          priceType: form.priceType,
          priceValue: form.priceValue,
          active: form.active,
        } as any);
      }
      setShowModal(false);
      fetchPlans();
    } catch (e: any) {
      console.error("[AdminWarranty] Save error:", e);
      setSaveError(e.message || "Erro ao salvar plano");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const plan = plans.find((p) => p.id === id);
    if (!confirm("Excluir o plano \"" + (plan?.name || id) + "\"? Os SKUs vinculados serao desassociados.")) return;
    setDeleting(id);
    try {
      const token = await getToken();
      await api.deleteWarrantyPlan(token, id);
      fetchPlans();
    } catch (e: any) {
      console.error("[AdminWarranty] Delete error:", e);
      alert("Erro ao excluir: " + (e.message || e));
    } finally {
      setDeleting(null);
    }
  };

  const handleToggleActive = async (plan: api.WarrantyPlan) => {
    try {
      const token = await getToken();
      await api.updateWarrantyPlan(token, plan.id, { active: !plan.active } as any);
      fetchPlans();
    } catch (e: any) {
      console.error("[AdminWarranty] Toggle error:", e);
    }
  };

  const openSkuPanel = (plan: api.WarrantyPlan) => {
    if (skuPanelOpen === plan.id) {
      setSkuPanelOpen(null);
      return;
    }
    setSkuPanelOpen(plan.id);
    setLocalSkus(plan.skus || []);
    setSkuInput("");
    setProductSearch("");
    setProductResults([]);
  };

  const addSkuToLocal = () => {
    const parts = skuInput.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return;
    const newSkus = [...localSkus];
    for (var i = 0; i < parts.length; i++) {
      if (newSkus.indexOf(parts[i]) < 0) {
        newSkus.push(parts[i]);
      }
    }
    setLocalSkus(newSkus);
    setSkuInput("");
  };

  const removeSkuFromLocal = (sku: string) => {
    setLocalSkus(localSkus.filter((s) => s !== sku));
  };

  const saveSkus = async (planId: string) => {
    setSavingSkus(true);
    try {
      const token = await getToken();
      await api.updateWarrantyPlanSkus(token, planId, localSkus);
      fetchPlans();
    } catch (e: any) {
      console.error("[AdminWarranty] Save SKUs error:", e);
      alert("Erro ao salvar SKUs: " + (e.message || e));
    } finally {
      setSavingSkus(false);
    }
  };

  const searchProductsByName = (query: string) => {
    setProductSearch(query);
    if (searchTimer) clearTimeout(searchTimer);
    if (query.trim().length < 2) {
      setProductResults([]);
      setSearchingProducts(false);
      return;
    }
    setSearchingProducts(true);
    var timer = setTimeout(async () => {
      try {
        var result = await api.getProdutosDB(1, 20, query.trim());
        setProductResults(result.data || []);
      } catch (e) {
        console.error("[AdminWarranty] Product search error:", e);
        setProductResults([]);
      } finally {
        setSearchingProducts(false);
      }
    }, 400);
    setSearchTimer(timer);
  };

  const addProductFromSearch = (sku: string) => {
    if (localSkus.indexOf(sku) < 0) {
      setLocalSkus([...localSkus, sku]);
    }
  };

  const filteredPlans = search.trim()
    ? plans.filter((p) =>
        p.name.toLowerCase().indexOf(search.toLowerCase()) >= 0 ||
        (p.description || "").toLowerCase().indexOf(search.toLowerCase()) >= 0
      )
    : plans;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
        <span className="ml-3 text-gray-500" style={{ fontSize: "0.9rem" }}>Carregando planos de garantia...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertTriangle className="w-10 h-10 text-red-400 mb-3" />
        <p className="text-gray-600 mb-4" style={{ fontSize: "0.9rem" }}>{error}</p>
        <button onClick={fetchPlans} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2" style={{ fontSize: "0.85rem" }}>
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
          <h2 className="text-gray-900" style={{ fontSize: "1.3rem", fontWeight: 700 }}>Garantia Estendida</h2>
          <p className="text-gray-500 mt-0.5" style={{ fontSize: "0.8rem" }}>
            {plans.length} {plans.length === 1 ? "plano" : "planos"} cadastrados — vincule SKUs para ativar em produtos especificos
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
          style={{ fontSize: "0.85rem", fontWeight: 600 }}
        >
          <Plus className="w-4 h-4" />
          Novo Plano
        </button>
      </div>

      {/* Search */}
      {plans.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar planos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
            style={{ fontSize: "0.85rem" }}
          />
        </div>
      )}

      {/* Plan cards */}
      {filteredPlans.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
          <ShieldCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600" style={{ fontSize: "0.95rem", fontWeight: 600 }}>
            {search ? "Nenhum plano encontrado" : "Nenhum plano cadastrado"}
          </p>
          <p className="text-gray-400 mt-1" style={{ fontSize: "0.8rem" }}>
            {search ? "Tente outro termo de busca" : "Crie seu primeiro plano de garantia estendida"}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPlans.map((plan) => (
            <div
              key={plan.id}
              className={"bg-white rounded-xl border transition-shadow hover:shadow-md " +
                (plan.active ? "border-gray-100" : "border-gray-200 opacity-70")}
            >
              <div className="p-5">
                {/* Card header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={"w-11 h-11 rounded-lg flex items-center justify-center " +
                      (plan.active ? "bg-blue-50" : "bg-gray-100")}>
                      <ShieldCheck className={"w-5 h-5 " + (plan.active ? "text-blue-600" : "text-gray-400")} />
                    </div>
                    <div>
                      <h3 className="text-gray-900" style={{ fontSize: "1rem", fontWeight: 700 }}>{plan.name}</h3>
                      {plan.description && (
                        <p className="text-gray-500 mt-0.5" style={{ fontSize: "0.75rem" }}>{plan.description}</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggleActive(plan)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                    title={plan.active ? "Desativar" : "Ativar"}
                  >
                    {plan.active
                      ? <ToggleRight className="w-6 h-6 text-green-500" />
                      : <ToggleLeft className="w-6 h-6 text-gray-400" />}
                  </button>
                </div>

                {/* Info grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <Clock className="w-4 h-4 text-blue-500 mx-auto mb-1" />
                    <span className="text-gray-900 block" style={{ fontSize: "1.1rem", fontWeight: 800 }}>
                      {plan.durationMonths}
                    </span>
                    <span className="text-gray-500" style={{ fontSize: "0.65rem" }}>
                      {plan.durationMonths === 1 ? "mes" : "meses"}
                    </span>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    {plan.priceType === "percentage"
                      ? <Percent className="w-4 h-4 text-orange-500 mx-auto mb-1" />
                      : <DollarSign className="w-4 h-4 text-green-500 mx-auto mb-1" />}
                    <span className="text-gray-900 block" style={{ fontSize: "1.1rem", fontWeight: 800 }}>
                      {plan.priceType === "percentage"
                        ? plan.priceValue + "%"
                        : "R$ " + plan.priceValue.toFixed(2).replace(".", ",")}
                    </span>
                    <span className="text-gray-500" style={{ fontSize: "0.65rem" }}>
                      {plan.priceType === "percentage" ? "do preco" : "valor fixo"}
                    </span>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <Package className="w-4 h-4 text-purple-500 mx-auto mb-1" />
                    <span className="text-gray-900 block" style={{ fontSize: "1.1rem", fontWeight: 800 }}>
                      {(plan.skus || []).length}
                    </span>
                    <span className="text-gray-500" style={{ fontSize: "0.65rem" }}>
                      {(plan.skus || []).length === 1 ? "produto" : "produtos"}
                    </span>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <Tag className="w-4 h-4 text-gray-400 mx-auto mb-1" />
                    <span className={"block " + (plan.active ? "text-green-600" : "text-gray-500")} style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                      {plan.active ? "Ativo" : "Inativo"}
                    </span>
                    <span className="text-gray-400" style={{ fontSize: "0.6rem" }}>
                      {formatDate(plan.createdAt)}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => openSkuPanel(plan)}
                    className={"flex-1 py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5 " +
                      (skuPanelOpen === plan.id
                        ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                        : "bg-blue-50 text-blue-600 hover:bg-blue-100")}
                    style={{ fontSize: "0.8rem" }}
                  >
                    <Package className="w-3.5 h-3.5" />
                    Produtos ({(plan.skus || []).length})
                    {skuPanelOpen === plan.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => openEdit(plan)}
                    className="flex-1 py-2 px-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-1.5"
                    style={{ fontSize: "0.8rem" }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(plan.id)}
                    disabled={deleting === plan.id}
                    className="py-2 px-3 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                    style={{ fontSize: "0.8rem" }}
                  >
                    {deleting === plan.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* SKU Assignment Panel */}
              {skuPanelOpen === plan.id && (
                <div className="border-t border-gray-100 bg-gray-50 rounded-b-xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Package className="w-4 h-4 text-blue-600" />
                    <span className="text-gray-700" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                      Produtos vinculados a este plano
                    </span>
                  </div>

                  {/* Add SKU input */}
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      value={skuInput}
                      onChange={(e) => setSkuInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkuToLocal(); } }}
                      placeholder="Digite SKUs separados por virgula, espaco ou ponto e virgula"
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                      style={{ fontSize: "0.8rem" }}
                    />
                    <button
                      onClick={addSkuToLocal}
                      className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      style={{ fontSize: "0.8rem" }}
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Product search */}
                  <div className="mb-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input
                        type="text"
                        value={productSearch}
                        onChange={(e) => searchProductsByName(e.target.value)}
                        placeholder="Buscar produtos por nome..."
                        className="w-full pl-9 pr-10 py-2 border border-gray-200 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                        style={{ fontSize: "0.8rem" }}
                      />
                      {searchingProducts && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-500 animate-spin" />
                      )}
                    </div>
                    {/* Product search results */}
                    {productResults.length > 0 && (
                      <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
                        {productResults.map((product) => {
                          var isAdded = localSkus.indexOf(product.sku) >= 0;
                          return (
                            <button
                              key={product.sku}
                              onClick={() => { if (!isAdded) addProductFromSearch(product.sku); }}
                              disabled={isAdded}
                              className={"w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors " +
                                (isAdded ? "bg-blue-50 cursor-default" : "hover:bg-gray-50 cursor-pointer")}
                            >
                              <div className={"w-5 h-5 rounded flex items-center justify-center shrink-0 " +
                                (isAdded ? "bg-blue-600" : "border border-gray-300")}>
                                {isAdded && <Check className="w-3 h-3 text-white" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={"truncate " + (isAdded ? "text-blue-700" : "text-gray-700")} style={{ fontSize: "0.78rem", fontWeight: 500 }}>
                                  {product.titulo}
                                </p>
                                <p className="text-gray-400 font-mono" style={{ fontSize: "0.65rem" }}>SKU: {product.sku}</p>
                              </div>
                              {!isAdded && <Plus className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {productSearch.trim().length >= 2 && !searchingProducts && productResults.length === 0 && (
                      <p className="text-gray-400 mt-2" style={{ fontSize: "0.72rem" }}>Nenhum produto encontrado para "{productSearch}"</p>
                    )}
                  </div>

                  {/* SKU list */}
                  {localSkus.length > 0 ? (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {localSkus.map((sku) => (
                        <span
                          key={sku}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-gray-700"
                          style={{ fontSize: "0.75rem" }}
                        >
                          <span className="font-mono" style={{ fontWeight: 600 }}>{sku}</span>
                          <button
                            onClick={() => removeSkuFromLocal(sku)}
                            className="text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-400 mb-3" style={{ fontSize: "0.75rem" }}>
                      Nenhum produto vinculado. Adicione SKUs acima.
                    </p>
                  )}

                  {/* Save button */}
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400" style={{ fontSize: "0.7rem" }}>
                      {localSkus.length} {localSkus.length === 1 ? "SKU vinculado" : "SKUs vinculados"}
                    </span>
                    <button
                      onClick={() => saveSkus(plan.id)}
                      disabled={savingSkus}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 transition-colors flex items-center gap-2"
                      style={{ fontSize: "0.8rem", fontWeight: 600 }}
                    >
                      {savingSkus ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      Salvar Produtos
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="text-gray-900" style={{ fontSize: "1.1rem", fontWeight: 700 }}>
                {editingId ? "Editar Plano" : "Novo Plano de Garantia"}
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

              {/* Name */}
              <div>
                <label className="block text-gray-700 mb-1" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Nome do Plano</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="ex: Garantia Estendida 12 Meses"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-red-500 outline-none"
                  style={{ fontSize: "0.85rem" }}
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-gray-700 mb-1" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Descricao (opcional)</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Descricao do plano de garantia para o cliente..."
                  rows={2}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-red-500 outline-none resize-none"
                  style={{ fontSize: "0.85rem" }}
                />
              </div>

              {/* Duration */}
              <div>
                <label className="block text-gray-700 mb-1" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Duracao (meses)</label>
                <input
                  type="number"
                  value={form.durationMonths || ""}
                  onChange={(e) => setForm({ ...form, durationMonths: parseInt(e.target.value) || 0 })}
                  min={1}
                  max={120}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-red-500 outline-none"
                  style={{ fontSize: "0.85rem" }}
                />
              </div>

              {/* Price type + value */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 mb-1" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Tipo do preco</label>
                  <select
                    value={form.priceType}
                    onChange={(e) => setForm({ ...form, priceType: e.target.value as "percentage" | "fixed" })}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-red-500 outline-none"
                    style={{ fontSize: "0.85rem" }}
                  >
                    <option value="percentage">% do preco do produto</option>
                    <option value="fixed">Valor fixo (R$)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-700 mb-1" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                    Valor {form.priceType === "percentage" ? "(%)" : "(R$)"}
                  </label>
                  <input
                    type="number"
                    value={form.priceValue || ""}
                    onChange={(e) => setForm({ ...form, priceValue: parseFloat(e.target.value) || 0 })}
                    min={0}
                    max={form.priceType === "percentage" ? 100 : 99999}
                    step={form.priceType === "percentage" ? 0.5 : 0.01}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-red-500 outline-none"
                    style={{ fontSize: "0.85rem" }}
                  />
                </div>
              </div>

              {/* Active toggle */}
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
                {editingId ? "Salvar" : "Criar Plano"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}