import { useState, useEffect, useRef } from "react";
import {
  Loader2, Save, Check, Trash2, Plus, X, Search, Clock,
  ToggleLeft, ToggleRight, Flame, Tag, Palette, AlertTriangle,
  Package, ChevronDown, ChevronUp, GripVertical, Calendar,
  Eye,
} from "lucide-react";
import { supabase } from "../../services/supabaseClient";
import { getValidAdminToken } from "./adminAuth";
import * as api from "../../services/api";
import type { SuperPromoProduct } from "../../services/api";
import { computePromoPrice } from "../../services/api";
import { ProductImage as ProductImg } from "../../components/ProductImage";

/* ── helpers ── */

function formatDateForInput(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return y + "-" + m + "-" + day + "T" + h + ":" + min;
}

function formatDateBR(ts: number): string {
  const d = new Date(ts);
  const day = String(d.getDate()).padStart(2, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const y = d.getFullYear();
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return day + "/" + m + "/" + y + " as " + h + ":" + min;
}

function formatPrice(val: number): string {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
}

function pad2(n: number): string { return String(n).padStart(2, "0"); }

/* ── Live Preview Timer ── */
function PreviewTimer({ endDate, bgColor }: { endDate: number; bgColor: string }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const diff = Math.max(0, endDate - now);
  const days = Math.floor(diff / 86400000);
  const hrs = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);

  const blocks = [
    { v: days, l: "dias" },
    { v: hrs, l: "hrs" },
    { v: mins, l: "min" },
    { v: secs, l: "seg" },
  ];

  return (
    <div className="flex items-center justify-center gap-1.5 mt-3">
      {blocks.map((b, i) => (
        <div key={b.l} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-white/40 font-bold" style={{ fontSize: "0.9rem" }}>:</span>}
          <div className="bg-white/20 rounded-md px-2 py-1 text-center min-w-[40px]" style={{ backdropFilter: "blur(4px)" }}>
            <span className="block text-white font-extrabold" style={{ fontSize: "0.95rem", lineHeight: 1.15 }}>{pad2(b.v)}</span>
            <span className="block text-white/50 uppercase" style={{ fontSize: "0.5rem", fontWeight: 600, letterSpacing: "0.04em" }}>{b.l}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

const COLOR_OPTIONS = [
  { value: "#dc2626", label: "Vermelho", tw: "bg-red-600" },
  { value: "#ea580c", label: "Laranja", tw: "bg-orange-600" },
  { value: "#d97706", label: "Amber", tw: "bg-amber-600" },
  { value: "#7c3aed", label: "Violeta", tw: "bg-violet-600" },
  { value: "#2563eb", label: "Azul", tw: "bg-blue-600" },
  { value: "#059669", label: "Esmeralda", tw: "bg-emerald-600" },
  { value: "#e11d48", label: "Rose", tw: "bg-rose-600" },
  { value: "#0f172a", label: "Escuro", tw: "bg-slate-900" },
];

/* ══════════════════════════════════════════════ */
export function AdminSuperPromo() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [title, setTitle] = useState("Super Promoção");
  const [subtitle, setSubtitle] = useState("Ofertas imperdíveis por tempo limitado!");
  const [enabled, setEnabled] = useState(false);
  const [startDate, setStartDate] = useState(Date.now());
  const [endDate, setEndDate] = useState(Date.now() + 7 * 24 * 3600000);
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [discountValue, setDiscountValue] = useState(10);
  const [bgColor, setBgColor] = useState("#dc2626");
  const [products, setProducts] = useState<SuperPromoProduct[]>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ sku: string; titulo: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchError, setSearchError] = useState("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const productsRef = useRef(products);
  productsRef.current = products;

  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);

  const getToken = async (): Promise<string> => {
    const token = await getValidAdminToken();
    if (!token) throw new Error("Sessão expirada.");
    return token;
  };

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        const result = await api.getAdminPromo(token);
        if (result.promo) {
          const p = result.promo;
          setTitle(p.title || "Super Promoção");
          setSubtitle(p.subtitle || "");
          setEnabled(p.enabled);
          setStartDate(p.startDate);
          setEndDate(p.endDate);
          setDiscountType(p.discountType || "percentage");
          setDiscountValue(p.discountValue ?? 10);
          setBgColor(p.bgColor || "#dc2626");
          setProducts(p.products || []);
        }
      } catch (e: any) {
        console.error("[SuperPromo] Error loading:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const token = await getToken();
      await api.saveAdminPromo(token, { title, subtitle, enabled, startDate, endDate, discountType, discountValue, bgColor, products });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const token = await getToken();
      await api.deleteAdminPromo(token);
      setTitle("Super Promoção");
      setSubtitle("Ofertas imperdíveis por tempo limitado!");
      setEnabled(false);
      setStartDate(Date.now());
      setEndDate(Date.now() + 7 * 24 * 3600000);
      setDiscountType("percentage");
      setDiscountValue(10);
      setBgColor("#dc2626");
      setProducts([]);
      setConfirmDelete(false);
    } catch (e: any) {
      setError(e.message || "Erro ao deletar.");
    } finally {
      setDeleting(false);
    }
  };

  /* ── search ── */
  const doSearch = async (query: string) => {
    if (!query.trim()) { setSearchResults([]); return; }
    setSearching(true);
    setSearchError("");
    try {
      console.log("[SuperPromo] Search:", query.trim());
      const result = await api.getProdutosDB(1, 30, query.trim());
      console.log("[SuperPromo] Results:", result?.data?.length ?? 0);
      if (!result || !result.data) { setSearchError("Resposta inesperada da API."); setSearchResults([]); return; }
      const cur = productsRef.current;
      const filtered = result.data.filter((p: any) => !cur.some((pp) => pp.sku === p.sku));
      setSearchResults(filtered.map((p: any) => ({ sku: p.sku, titulo: p.titulo || p.sku })));
      if (filtered.length === 0 && result.data.length > 0) setSearchError("Todos os resultados já estão na promoção.");
    } catch (e: any) {
      console.error("[SuperPromo] Search error:", e);
      setSearchError("Erro: " + (e.message || "Falha na busca"));
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    if (!showSearch) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!searchQuery.trim() || searchQuery.trim().length < 2) { setSearchResults([]); setSearchError(""); return; }
    searchTimerRef.current = setTimeout(() => { doSearch(searchQuery); }, 400);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery, showSearch]);

  const handleSearchSubmit = () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); doSearch(searchQuery); };

  const addProduct = (p: { sku: string; titulo: string }) => {
    setProducts((prev) => [...prev, { sku: p.sku, titulo: p.titulo, promoPrice: null, originalPrice: null, customDiscountType: null, customDiscountValue: null }]);
    setSearchResults((prev) => prev.filter((r) => r.sku !== p.sku));
  };
  const removeProduct = (sku: string) => setProducts((prev) => prev.filter((p) => p.sku !== sku));

  const updateProductField = (sku: string, updates: Partial<SuperPromoProduct>) => {
    setProducts((prev) => prev.map((p) => p.sku === sku ? { ...p, ...updates } : p));
  };

  /** Determine the discount "mode" for a product */
  const getDiscountMode = (p: SuperPromoProduct): "global" | "custom" | "fixed" => {
    if (p.promoPrice != null && p.promoPrice > 0) return "fixed";
    if (p.customDiscountType) return "custom";
    return "global";
  };

  /** Get a human-friendly discount label for the product list badge */
  const getProductDiscountBadge = (p: SuperPromoProduct): { label: string; color: string } => {
    const mode = getDiscountMode(p);
    if (mode === "fixed") return { label: formatPrice(p.promoPrice!), color: "bg-emerald-100 text-emerald-700" };
    if (mode === "custom") {
      const t = p.customDiscountType!;
      const v = p.customDiscountValue ?? 0;
      const lbl = t === "percentage" ? v + "% OFF" : "-R$ " + v.toFixed(2).replace(".", ",");
      return { label: lbl, color: "bg-purple-100 text-purple-700" };
    }
    // global
    const lbl = discountType === "percentage" ? discountValue + "% OFF" : "-R$ " + discountValue.toFixed(2).replace(".", ",");
    return { label: lbl, color: "bg-gray-100 text-gray-600" };
  };

  /* status */
  const now = Date.now();
  const isActive = enabled && now >= startDate && now <= endDate && products.length > 0;
  const isScheduled = enabled && now < startDate;
  const isExpired = enabled && now > endDate;
  const timeLeft = endDate - now;
  const fmtCountdown = (ms: number) => {
    if (ms <= 0) return "Encerrada";
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return d > 0 ? d + "d " + h + "h " + m + "m" : h + "h " + m + "m";
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-red-600 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "1.25rem", fontWeight: 700 }}>
            <Flame className="w-6 h-6 text-orange-500" />
            Super Promoção
          </h2>
          <p className="text-gray-400 mt-1" style={{ fontSize: "0.82rem" }}>Crie promoções relâmpago com cronômetro na home</p>
        </div>
        <div className="flex items-center gap-2">
          {confirmDelete ? (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <span className="text-red-600" style={{ fontSize: "0.8rem", fontWeight: 500 }}>Confirmar exclusão?</span>
              <button onClick={handleDelete} disabled={deleting} className="px-3 py-1 bg-red-600 text-white rounded text-xs font-semibold hover:bg-red-700 disabled:opacity-50">{deleting ? "..." : "Sim"}</button>
              <button onClick={() => setConfirmDelete(false)} className="px-3 py-1 bg-gray-200 text-gray-600 rounded text-xs font-semibold hover:bg-gray-300">Não</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 px-3 py-2 text-gray-500 border border-gray-200 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors" style={{ fontSize: "0.8rem", fontWeight: 500 }}>
              <Trash2 className="w-3.5 h-3.5" />Resetar
            </button>
          )}
          <button onClick={handleSave} disabled={saving} className={"flex items-center gap-2 px-5 py-2.5 rounded-lg transition-all disabled:opacity-50 " + (saved ? "bg-green-600 text-white" : "bg-red-600 hover:bg-red-700 text-white")} style={{ fontSize: "0.85rem", fontWeight: 600 }}>
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : saved ? <><Check className="w-4 h-4" /> Salvo!</> : <><Save className="w-4 h-4" /> Salvar</>}
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 flex items-center gap-2" style={{ fontSize: "0.82rem" }}><AlertTriangle className="w-4 h-4 shrink-0" />{error}</div>}

      {/* ── Status ── */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className={"rounded-xl border-2 p-4 " + (isActive ? "border-green-300 bg-green-50" : isScheduled ? "border-blue-300 bg-blue-50" : isExpired ? "border-red-300 bg-red-50" : "border-gray-200 bg-gray-50")}>
          <p className={"mb-1 " + (isActive ? "text-green-700" : isScheduled ? "text-blue-700" : isExpired ? "text-red-700" : "text-gray-500")} style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</p>
          <p className={"flex items-center gap-2 " + (isActive ? "text-green-800" : isScheduled ? "text-blue-800" : isExpired ? "text-red-800" : "text-gray-700")} style={{ fontSize: "1rem", fontWeight: 800 }}>
            {isActive ? "Ativa" : isScheduled ? "Agendada" : isExpired ? "Expirada" : "Inativa"}
            <span className={"inline-block w-2.5 h-2.5 rounded-full " + (isActive ? "bg-green-500 animate-pulse" : isScheduled ? "bg-blue-500" : isExpired ? "bg-red-500" : "bg-gray-400")} />
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-gray-500 mb-1" style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Produtos</p>
          <p className="text-gray-800" style={{ fontSize: "1rem", fontWeight: 800 }}>{products.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-gray-500 mb-1" style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Início</p>
          <p className="text-gray-800 flex items-center gap-1.5" style={{ fontSize: "0.82rem", fontWeight: 700 }}>
            <Calendar className="w-3.5 h-3.5 text-gray-400" />
            {formatDateBR(startDate)}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-gray-500 mb-1" style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Término</p>
          <p className="text-gray-800 flex items-center gap-1.5" style={{ fontSize: "0.82rem", fontWeight: 700 }}>
            <Clock className="w-3.5 h-3.5 text-gray-400" />
            {enabled ? fmtCountdown(timeLeft) : formatDateBR(endDate)}
          </p>
        </div>
      </div>

      {/* ── Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Left: Config ── */}
        <div className="space-y-5">
          {/* Toggle */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-gray-800" style={{ fontSize: "0.92rem", fontWeight: 600 }}>Ativar Promoção</p>
                <p className="text-gray-400" style={{ fontSize: "0.75rem" }}>Quando ativada e dentro do período, aparece na home</p>
              </div>
              <button onClick={() => setEnabled(!enabled)} className="transition-colors">
                {enabled ? <ToggleRight className="w-10 h-10 text-green-600" /> : <ToggleLeft className="w-10 h-10 text-gray-400" />}
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-gray-600 mb-1" style={{ fontSize: "0.78rem", fontWeight: 500 }}>Título</label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Queima de Estoque" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 transition-all" style={{ fontSize: "0.85rem" }} />
              </div>
              <div>
                <label className="block text-gray-600 mb-1" style={{ fontSize: "0.78rem", fontWeight: 500 }}>Subtítulo</label>
                <input type="text" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Ex: Até 50% de desconto..." className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 transition-all" style={{ fontSize: "0.85rem" }} />
              </div>
            </div>
          </div>

          {/* Dates — BR format */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h4 className="text-gray-800 mb-3 flex items-center gap-2" style={{ fontSize: "0.92rem", fontWeight: 600 }}>
              <Calendar className="w-4 h-4 text-gray-400" />
              Período da Promoção
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-gray-600 mb-1" style={{ fontSize: "0.78rem", fontWeight: 500 }}>Início</label>
                <input type="datetime-local" value={formatDateForInput(startDate)} onChange={(e) => { if (e.target.value) setStartDate(new Date(e.target.value).getTime()); }} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 transition-all" style={{ fontSize: "0.82rem" }} />
                <p className="text-gray-400 mt-1 flex items-center gap-1" style={{ fontSize: "0.7rem" }}>
                  <Calendar className="w-3 h-3" />
                  {formatDateBR(startDate)}
                </p>
              </div>
              <div>
                <label className="block text-gray-600 mb-1" style={{ fontSize: "0.78rem", fontWeight: 500 }}>Fim</label>
                <input type="datetime-local" value={formatDateForInput(endDate)} onChange={(e) => { if (e.target.value) setEndDate(new Date(e.target.value).getTime()); }} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 transition-all" style={{ fontSize: "0.82rem" }} />
                <p className="text-gray-400 mt-1 flex items-center gap-1" style={{ fontSize: "0.7rem" }}>
                  <Calendar className="w-3 h-3" />
                  {formatDateBR(endDate)}
                </p>
              </div>
            </div>
          </div>

          {/* Discount */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h4 className="text-gray-800 mb-3 flex items-center gap-2" style={{ fontSize: "0.92rem", fontWeight: 600 }}>
              <Tag className="w-4 h-4 text-gray-400" />
              Desconto Padrão
            </h4>
            <p className="text-gray-400 mb-3" style={{ fontSize: "0.75rem" }}>Aplicado a produtos sem preço individual.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-gray-600 mb-1" style={{ fontSize: "0.78rem", fontWeight: 500 }}>Tipo</label>
                <select value={discountType} onChange={(e) => setDiscountType(e.target.value as any)} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50 outline-none focus:border-red-400 transition-all" style={{ fontSize: "0.85rem" }}>
                  <option value="percentage">Percentual (%)</option>
                  <option value="fixed">Valor fixo (R$)</option>
                </select>
              </div>
              <div>
                <label className="block text-gray-600 mb-1" style={{ fontSize: "0.78rem", fontWeight: 500 }}>{"Valor " + (discountType === "percentage" ? "(%)" : "(R$)")}</label>
                <input type="number" min="0" max={discountType === "percentage" ? 90 : 99999} step={discountType === "percentage" ? 1 : 0.01} value={discountValue} onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 transition-all" style={{ fontSize: "0.85rem" }} />
              </div>
            </div>
          </div>

          {/* Color */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h4 className="text-gray-800 mb-3 flex items-center gap-2" style={{ fontSize: "0.92rem", fontWeight: 600 }}>
              <Palette className="w-4 h-4 text-gray-400" />
              Cor do Banner
            </h4>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((c) => (
                <button key={c.value} onClick={() => setBgColor(c.value)} className={"w-10 h-10 rounded-lg transition-all " + c.tw + (bgColor === c.value ? " ring-2 ring-offset-2 ring-gray-800 scale-110" : " hover:scale-105")} title={c.label} />
              ))}
              <div className="flex items-center gap-2 ml-2">
                <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border border-gray-200" />
                <span className="text-gray-400 font-mono" style={{ fontSize: "0.72rem" }}>{bgColor}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: Products + Preview ── */}
        <div className="space-y-5">
          {/* Products */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "0.92rem", fontWeight: 600 }}>
                <Package className="w-4 h-4 text-gray-400" />
                Produtos na Promoção
                <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full" style={{ fontSize: "0.7rem", fontWeight: 700 }}>{products.length}</span>
              </h4>
              <button onClick={() => { setShowSearch(!showSearch); setSearchError(""); setSearchResults([]); setSearchQuery(""); }} className="flex items-center gap-1.5 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                <Plus className="w-3.5 h-3.5" />Adicionar
              </button>
            </div>

            {/* Search */}
            {showSearch && (
              <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="flex gap-2">
                  <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSearchSubmit(); } }} placeholder="Buscar por nome ou SKU..." className="flex-1 px-3 py-2 border border-gray-200 rounded-lg bg-white outline-none focus:border-red-400 transition-all" style={{ fontSize: "0.82rem" }} autoFocus />
                  <button onClick={handleSearchSubmit} disabled={searching || !searchQuery.trim()} className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50" style={{ fontSize: "0.82rem", fontWeight: 500 }}>
                    {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </button>
                  <button onClick={() => { setShowSearch(false); setSearchQuery(""); setSearchResults([]); setSearchError(""); }} className="p-2 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                </div>
                {searchError && (
                  <div className="mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2" style={{ fontSize: "0.78rem" }}>
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" /><span className="text-amber-700">{searchError}</span>
                  </div>
                )}
                {searching && <div className="mt-2 flex items-center gap-2 justify-center py-3 text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /><span style={{ fontSize: "0.78rem" }}>Buscando...</span></div>}
                {searchResults.length > 0 && (
                  <div className="mt-2 max-h-60 overflow-y-auto space-y-1">
                    <p className="text-gray-400 px-1 mb-1" style={{ fontSize: "0.7rem" }}>{searchResults.length + " encontrado" + (searchResults.length !== 1 ? "s" : "") + " \u2014 clique para adicionar"}</p>
                    {searchResults.map((r) => (
                      <button key={r.sku} onClick={() => addProduct(r)} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white border border-transparent hover:border-gray-200 transition-all text-left">
                        <ProductImg sku={r.sku} alt="" className="w-10 h-10 object-contain rounded bg-white border border-gray-100" fallback={<div className="w-10 h-10 rounded bg-gray-100" />} />
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-700 truncate" style={{ fontSize: "0.8rem", fontWeight: 500 }}>{r.titulo}</p>
                          <p className="text-gray-400 font-mono" style={{ fontSize: "0.68rem" }}>{r.sku}</p>
                        </div>
                        <Plus className="w-4 h-4 text-green-600 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
                {!searching && searchResults.length === 0 && searchQuery.trim().length >= 2 && !searchError && (
                  <p className="text-gray-400 text-center py-3" style={{ fontSize: "0.78rem" }}>Nenhum produto encontrado.</p>
                )}
              </div>
            )}

            {/* Product list */}
            {products.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Package className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <p style={{ fontSize: "0.85rem" }}>Nenhum produto adicionado</p>
                <p style={{ fontSize: "0.75rem" }}>Clique em "Adicionar" para buscar</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {products.map((p) => {
                  const isExp = expandedProduct === p.sku;
                  const badge = getProductDiscountBadge(p);
                  const mode = getDiscountMode(p);
                  return (
                    <div key={p.sku} className={"border rounded-lg transition-all " + (isExp ? "border-red-200 bg-red-50/30" : "border-gray-100 bg-white hover:border-gray-200")}>
                      <div className="flex items-center gap-3 p-3">
                        <GripVertical className="w-4 h-4 text-gray-300 shrink-0" />
                        <ProductImg sku={p.sku} alt="" className="w-12 h-12 object-contain rounded border border-gray-100 bg-white shrink-0" fallback={<div className="w-12 h-12 rounded bg-gray-100 shrink-0" />} />
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-700 truncate" style={{ fontSize: "0.8rem", fontWeight: 600 }}>{p.titulo}</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-gray-400 font-mono" style={{ fontSize: "0.68rem" }}>{p.sku}</span>
                            <span className={badge.color + " px-1.5 py-0.5 rounded flex items-center gap-1"} style={{ fontSize: "0.6rem", fontWeight: 700 }}>
                              {mode === "custom" && <Tag className="w-2.5 h-2.5" />}
                              {badge.label}
                            </span>
                            {mode !== "global" && (
                              <span className="text-gray-300" style={{ fontSize: "0.55rem" }}>individual</span>
                            )}
                          </div>
                        </div>
                        <button onClick={() => setExpandedProduct(isExp ? null : p.sku)} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors">{isExp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</button>
                        <button onClick={() => removeProduct(p.sku)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><X className="w-4 h-4" /></button>
                      </div>
                      {isExp && (() => {
                        const curMode = mode;
                        return (
                          <div className="px-3 pb-4 pt-2 border-t border-gray-100 space-y-4">
                            {/* Discount mode selector */}
                            <div>
                              <p className="text-gray-600 mb-2 flex items-center gap-1.5" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                                <Tag className="w-3.5 h-3.5 text-gray-400" />
                                Tipo de desconto
                              </p>
                              <div className="flex flex-col gap-1.5">
                                {/* Option: Global */}
                                <label className={"flex items-center gap-2.5 px-3 py-2.5 rounded-lg border cursor-pointer transition-all " + (curMode === "global" ? "border-red-300 bg-red-50" : "border-gray-200 bg-white hover:border-gray-300")}>
                                  <input
                                    type="radio"
                                    name={"discount-mode-" + p.sku}
                                    checked={curMode === "global"}
                                    onChange={() => updateProductField(p.sku, { customDiscountType: null, customDiscountValue: null, promoPrice: null })}
                                    className="accent-red-600"
                                  />
                                  <div className="flex-1">
                                    <span className="text-gray-700" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Desconto padrão da promoção</span>
                                    <span className="ml-2 bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded" style={{ fontSize: "0.65rem", fontWeight: 600 }}>
                                      {discountType === "percentage" ? discountValue + "%" : "R$ " + discountValue.toFixed(2).replace(".", ",")}
                                    </span>
                                  </div>
                                </label>

                                {/* Option: Custom discount */}
                                <label className={"flex items-start gap-2.5 px-3 py-2.5 rounded-lg border cursor-pointer transition-all " + (curMode === "custom" ? "border-purple-300 bg-purple-50" : "border-gray-200 bg-white hover:border-gray-300")}>
                                  <input
                                    type="radio"
                                    name={"discount-mode-" + p.sku}
                                    checked={curMode === "custom"}
                                    onChange={() => updateProductField(p.sku, { customDiscountType: "percentage", customDiscountValue: 10, promoPrice: null })}
                                    className="accent-purple-600 mt-0.5"
                                  />
                                  <div className="flex-1 space-y-2">
                                    <span className="text-gray-700" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Desconto individual</span>
                                    {curMode === "custom" && (
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <label className="block text-gray-500 mb-1" style={{ fontSize: "0.68rem", fontWeight: 500 }}>Tipo</label>
                                          <select
                                            value={p.customDiscountType || "percentage"}
                                            onChange={(e) => updateProductField(p.sku, { customDiscountType: e.target.value as "percentage" | "fixed" })}
                                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg bg-white outline-none focus:border-purple-400 transition-all"
                                            style={{ fontSize: "0.8rem" }}
                                          >
                                            <option value="percentage">Percentual (%)</option>
                                            <option value="fixed">Valor fixo (R$)</option>
                                          </select>
                                        </div>
                                        <div>
                                          <label className="block text-gray-500 mb-1" style={{ fontSize: "0.68rem", fontWeight: 500 }}>
                                            {(p.customDiscountType || "percentage") === "percentage" ? "Percentual (%)" : "Valor (R$)"}
                                          </label>
                                          <input
                                            type="number"
                                            min="0"
                                            max={(p.customDiscountType || "percentage") === "percentage" ? 90 : 99999}
                                            step={(p.customDiscountType || "percentage") === "percentage" ? 1 : 0.01}
                                            value={p.customDiscountValue ?? ""}
                                            onChange={(e) => updateProductField(p.sku, { customDiscountValue: parseFloat(e.target.value) || 0 })}
                                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg bg-white outline-none focus:border-purple-400 transition-all"
                                            style={{ fontSize: "0.8rem" }}
                                            placeholder="0"
                                          />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </label>

                                {/* Option: Fixed price */}
                                <label className={"flex items-start gap-2.5 px-3 py-2.5 rounded-lg border cursor-pointer transition-all " + (curMode === "fixed" ? "border-emerald-300 bg-emerald-50" : "border-gray-200 bg-white hover:border-gray-300")}>
                                  <input
                                    type="radio"
                                    name={"discount-mode-" + p.sku}
                                    checked={curMode === "fixed"}
                                    onChange={() => updateProductField(p.sku, { promoPrice: 0, customDiscountType: null, customDiscountValue: null })}
                                    className="accent-emerald-600 mt-0.5"
                                  />
                                  <div className="flex-1 space-y-2">
                                    <span className="text-gray-700" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Preço fixo promocional</span>
                                    {curMode === "fixed" && (
                                      <div>
                                        <label className="block text-gray-500 mb-1" style={{ fontSize: "0.68rem", fontWeight: 500 }}>Preço promo (R$)</label>
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          value={p.promoPrice ?? ""}
                                          onChange={(e) => {
                                            const v = parseFloat(e.target.value);
                                            updateProductField(p.sku, { promoPrice: isNaN(v) ? null : v });
                                          }}
                                          className="w-full px-2 py-1.5 border border-gray-200 rounded-lg bg-white outline-none focus:border-emerald-400 transition-all"
                                          style={{ fontSize: "0.8rem" }}
                                          placeholder="Ex: 149.90"
                                        />
                                      </div>
                                    )}
                                  </div>
                                </label>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Live Preview ── */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Eye className="w-4 h-4 text-gray-400" />
              <h4 className="text-gray-800" style={{ fontSize: "0.92rem", fontWeight: 600 }}>Preview ao Vivo</h4>
            </div>
            <div className="rounded-xl overflow-hidden" style={{ background: bgColor }}>
              <div className="p-5 text-white text-center">
                <div className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur-sm rounded-full px-3 py-1 mb-2">
                  <Flame className="w-3.5 h-3.5 text-yellow-300" />
                  <span className="text-white/90" style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>Promoção Relâmpago</span>
                  <Flame className="w-3.5 h-3.5 text-yellow-300" />
                </div>
                <p className="text-white" style={{ fontSize: "1.15rem", fontWeight: 800, lineHeight: 1.2 }}>{title || "Super Promoção"}</p>
                {subtitle && <p className="text-white/70 mt-1" style={{ fontSize: "0.75rem" }}>{subtitle}</p>}
                <div className="flex items-center justify-center gap-1.5 my-2">
                  <Clock className="w-3 h-3 text-white/50" />
                  <span className="text-white/50" style={{ fontSize: "0.6rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Acaba em</span>
                </div>
                <PreviewTimer endDate={endDate} bgColor={bgColor} />
                <div className="flex items-center justify-center gap-3 mt-3 opacity-70">
                  {products.slice(0, 3).map((p) => (
                    <div key={p.sku} className="w-10 h-10 rounded bg-white/20 flex items-center justify-center overflow-hidden">
                      <ProductImg sku={p.sku} alt="" className="w-full h-full object-contain" fallback={<div className="w-full h-full bg-white/10 rounded" />} />
                    </div>
                  ))}
                  {products.length > 3 && <span className="text-white/60" style={{ fontSize: "0.7rem", fontWeight: 600 }}>+{products.length - 3}</span>}
                  {products.length === 0 && <span className="text-white/40" style={{ fontSize: "0.7rem" }}>Sem produtos</span>}
                </div>
              </div>
              <div className="bg-black/10 px-4 py-2 text-center">
                <span className="text-white/60" style={{ fontSize: "0.65rem" }}>
                  {formatDateBR(startDate) + " até " + formatDateBR(endDate) + " \u2022 " + products.length + " produto" + (products.length !== 1 ? "s" : "")}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}