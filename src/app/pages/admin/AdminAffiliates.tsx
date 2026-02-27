import React, { useState, useEffect, useCallback } from "react";
import {
  Users,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  X,
  Search,
  ChevronDown,
  ChevronUp,
  DollarSign,
  MousePointerClick,
  ShoppingCart,
  Copy,
  Ban,
  Hourglass,
  BadgeCheck,
  Clock,
  Wallet,
  TrendingUp,
  Settings,
  Save,
  Hash,
  Mail,
  Phone,
  AtSign,
  KeyRound,
  Calendar,
  MessageCircle,
  Award,
  Eye,
  ShieldCheck,
  Percent,
  RefreshCw,
} from "lucide-react";
import { supabase } from "../../services/supabaseClient";
import { getValidAdminToken } from "./adminAuth";
import * as api from "../../services/api";
import type { Affiliate, AffiliateCommission, AffiliateConfig } from "../../services/api";

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

var statusOptions = [
  { value: "pending", label: "Pendente", color: "text-amber-600 bg-amber-50 border-amber-200", icon: Hourglass },
  { value: "approved", label: "Aprovado", color: "text-emerald-600 bg-emerald-50 border-emerald-200", icon: CheckCircle2 },
  { value: "rejected", label: "Rejeitado", color: "text-red-600 bg-red-50 border-red-200", icon: Ban },
  { value: "suspended", label: "Suspenso", color: "text-gray-600 bg-gray-100 border-gray-300", icon: Ban },
];

var commStatusOptions = [
  { value: "pending", label: "Pendente", color: "text-amber-600 bg-amber-50" },
  { value: "approved", label: "Aprovada", color: "text-blue-600 bg-blue-50" },
  { value: "paid", label: "Paga", color: "text-emerald-600 bg-emerald-50" },
  { value: "rejected", label: "Rejeitada", color: "text-red-600 bg-red-50" },
];

export function AdminAffiliates() {
  var [loading, setLoading] = useState(true);
  var [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  var [config, setConfig] = useState<AffiliateConfig>({ commissionPercent: 5, minPayout: 50, cookieDays: 30, enabled: true });
  var [error, setError] = useState("");
  var [searchTerm, setSearchTerm] = useState("");
  var [statusFilter, setStatusFilter] = useState("all");
  var [expandedId, setExpandedId] = useState<string | null>(null);
  var [commissions, setCommissions] = useState<Record<string, AffiliateCommission[]>>({});
  var [loadingComm, setLoadingComm] = useState<string | null>(null);

  // Config editing
  var [showConfig, setShowConfig] = useState(false);
  var [editCommPercent, setEditCommPercent] = useState("5");
  var [editMinPayout, setEditMinPayout] = useState("50");
  var [editCookieDays, setEditCookieDays] = useState("30");
  var [editEnabled, setEditEnabled] = useState(true);
  var [savingConfig, setSavingConfig] = useState(false);

  // Status change
  var [changingStatus, setChangingStatus] = useState<string | null>(null);
  var [rejectionReason, setRejectionReason] = useState("");
  var [showRejectModal, setShowRejectModal] = useState<string | null>(null);

  // Commission status change
  var [updatingComm, setUpdatingComm] = useState<string | null>(null);

  var getAccessToken = async function (): Promise<string | null> {
    return await getValidAdminToken();
  };

  var loadData = useCallback(async function () {
    setLoading(true);
    setError("");
    try {
      var token = await getAccessToken();
      if (!token) { setError("Nao autorizado."); setLoading(false); return; }

      var res = await api.adminGetAffiliates(token);
      setAffiliates(res.affiliates || []);
      setConfig(res.config || { commissionPercent: 5, minPayout: 50, cookieDays: 30, enabled: true });
      setEditCommPercent(String(res.config?.commissionPercent || 5));
      setEditMinPayout(String(res.config?.minPayout || 50));
      setEditCookieDays(String(res.config?.cookieDays || 30));
      setEditEnabled(res.config?.enabled !== false);
    } catch (e: any) {
      setError(e.message || "Erro ao carregar afiliados.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(function () { loadData(); }, [loadData]);

  // Load commissions for an affiliate
  var loadCommissions = async function (affId: string) {
    setLoadingComm(affId);
    try {
      var token = await getAccessToken();
      if (!token) return;
      var res = await api.adminGetAffiliateCommissions(token, affId);
      var updated = Object.assign({}, commissions);
      updated[affId] = res.commissions || [];
      setCommissions(updated);
    } catch (e) {
      console.error("[AdminAff] Load commissions error:", e);
    } finally {
      setLoadingComm(null);
    }
  };

  // Toggle expand
  var toggleExpand = function (affId: string) {
    if (expandedId === affId) {
      setExpandedId(null);
    } else {
      setExpandedId(affId);
      if (!commissions[affId]) {
        loadCommissions(affId);
      }
    }
  };

  // Change status
  var changeStatus = async function (affId: string, newStatus: string, reason?: string) {
    setChangingStatus(affId);
    try {
      var token = await getAccessToken();
      if (!token) return;
      var data: any = { status: newStatus };
      if (reason) data.rejectionReason = reason;
      await api.adminUpdateAffiliateStatus(token, affId, data);
      await loadData();
      setShowRejectModal(null);
      setRejectionReason("");
    } catch (e: any) {
      console.error("[AdminAff] Status change error:", e);
      setError(e.message || "Erro ao alterar status.");
    } finally {
      setChangingStatus(null);
    }
  };

  // Save config
  var saveConfig = async function () {
    setSavingConfig(true);
    try {
      var token = await getAccessToken();
      if (!token) return;
      await api.adminUpdateAffiliateConfig(token, {
        commissionPercent: Number(editCommPercent) || 5,
        minPayout: Number(editMinPayout) || 50,
        cookieDays: Number(editCookieDays) || 30,
        enabled: editEnabled,
      });
      await loadData();
      setShowConfig(false);
    } catch (e: any) {
      console.error("[AdminAff] Save config error:", e);
    } finally {
      setSavingConfig(false);
    }
  };

  // Update commission status
  var updateCommissionStatus = async function (affId: string, orderId: string, newStatus: string) {
    setUpdatingComm(affId + ":" + orderId);
    try {
      var token = await getAccessToken();
      if (!token) return;
      await api.adminUpdateAffiliateCommission(token, affId, orderId, { status: newStatus });
      await loadCommissions(affId);
      await loadData(); // refresh totals
    } catch (e: any) {
      console.error("[AdminAff] Commission update error:", e);
    } finally {
      setUpdatingComm(null);
    }
  };

  // Filtered affiliates
  var filtered = affiliates.filter(function (a) {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (searchTerm.trim()) {
      var q = searchTerm.toLowerCase();
      return (a.name.toLowerCase().indexOf(q) >= 0 || a.email.toLowerCase().indexOf(q) >= 0 || a.code.toLowerCase().indexOf(q) >= 0);
    }
    return true;
  });

  var pendingCount = affiliates.filter(function (a) { return a.status === "pending"; }).length;
  var approvedCount = affiliates.filter(function (a) { return a.status === "approved"; }).length;
  var totalCommission = affiliates.reduce(function (sum, a) { return sum + (a.totalCommission || 0); }, 0);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-gray-900" style={{ fontSize: "1.3rem", fontWeight: 700 }}>
            Programa de Afiliados
          </h1>
          <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.8rem" }}>
            {affiliates.length} afiliados · {pendingCount} pendentes · {approvedCount} ativos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={function () { setShowConfig(!showConfig); }}
            className={"px-3 py-2 rounded-lg flex items-center gap-1.5 transition-colors " +
              (showConfig ? "bg-red-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}
            style={{ fontSize: "0.8rem", fontWeight: 500 }}
          >
            <Settings className="w-3.5 h-3.5" /> Configurações
          </button>
          <button
            onClick={loadData}
            disabled={loading}
            className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
            style={{ fontSize: "0.8rem" }}
          >
            <RefreshCw className={"w-3.5 h-3.5 " + (loading ? "animate-spin" : "")} />
          </button>
        </div>
      </div>

      {/* Config Panel */}
      {showConfig && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="w-4 h-4 text-red-600" />
            <h2 className="text-gray-800" style={{ fontSize: "0.9rem", fontWeight: 600 }}>Configurações Globais</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="text-gray-600 mb-1 block" style={{ fontSize: "0.72rem", fontWeight: 600 }}>Comissão (%)</label>
              <input
                type="number"
                value={editCommPercent}
                onChange={function (e) { setEditCommPercent(e.target.value); }}
                min="0" max="50" step="0.5"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-red-500 outline-none"
                style={{ fontSize: "0.85rem" }}
              />
            </div>
            <div>
              <label className="text-gray-600 mb-1 block" style={{ fontSize: "0.72rem", fontWeight: 600 }}>Pagamento Mín. (R$)</label>
              <input
                type="number"
                value={editMinPayout}
                onChange={function (e) { setEditMinPayout(e.target.value); }}
                min="0" step="10"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-red-500 outline-none"
                style={{ fontSize: "0.85rem" }}
              />
            </div>
            <div>
              <label className="text-gray-600 mb-1 block" style={{ fontSize: "0.72rem", fontWeight: 600 }}>Cookie (dias)</label>
              <input
                type="number"
                value={editCookieDays}
                onChange={function (e) { setEditCookieDays(e.target.value); }}
                min="1" max="365"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-red-500 outline-none"
                style={{ fontSize: "0.85rem" }}
              />
            </div>
            <div>
              <label className="text-gray-600 mb-1 block" style={{ fontSize: "0.72rem", fontWeight: 600 }}>Programa</label>
              <button
                onClick={function () { setEditEnabled(!editEnabled); }}
                className={"w-full px-3 py-2 border rounded-lg transition-colors " +
                  (editEnabled ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-600")}
                style={{ fontSize: "0.85rem", fontWeight: 600 }}
              >
                {editEnabled ? "Ativo" : "Desativado"}
              </button>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={saveConfig}
              disabled={savingConfig}
              className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-red-400 transition-colors flex items-center gap-2"
              style={{ fontSize: "0.8rem", fontWeight: 600 }}
            >
              {savingConfig ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Salvar
            </button>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { icon: Users, label: "Total Afiliados", value: String(affiliates.length), color: "text-blue-600 bg-blue-50" },
          { icon: Hourglass, label: "Pendentes", value: String(pendingCount), color: "text-amber-600 bg-amber-50" },
          { icon: CheckCircle2, label: "Ativos", value: String(approvedCount), color: "text-emerald-600 bg-emerald-50" },
          { icon: DollarSign, label: "Comissões Total", value: formatBRL(totalCommission), color: "text-red-600 bg-red-50" },
        ].map(function (s) {
          return (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className={"w-8 h-8 rounded-lg flex items-center justify-center mb-2 " + s.color}>
                <s.icon className="w-4 h-4" />
              </div>
              <p className="text-gray-900" style={{ fontSize: "1.1rem", fontWeight: 700 }}>{s.value}</p>
              <p className="text-gray-400" style={{ fontSize: "0.7rem" }}>{s.label}</p>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={function (e) { setSearchTerm(e.target.value); }}
            placeholder="Buscar por nome, email ou código..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl bg-white text-gray-900 focus:ring-2 focus:ring-red-500 outline-none"
            style={{ fontSize: "0.82rem" }}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            { value: "all", label: "Todos" },
            { value: "pending", label: "Pendentes" },
            { value: "approved", label: "Ativos" },
            { value: "rejected", label: "Rejeitados" },
            { value: "suspended", label: "Suspensos" },
          ].map(function (f) {
            return (
              <button
                key={f.value}
                onClick={function () { setStatusFilter(f.value); }}
                className={"px-3 py-2 rounded-lg transition-colors " +
                  (statusFilter === f.value ? "bg-red-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}
                style={{ fontSize: "0.78rem", fontWeight: 500 }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl mb-4 flex items-center gap-2" style={{ fontSize: "0.82rem" }}>
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-7 h-7 text-red-600 animate-spin" />
        </div>
      )}

      {/* Affiliate List */}
      {!loading && filtered.length === 0 && (
        <div className="text-center py-16">
          <Users className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400" style={{ fontSize: "0.88rem" }}>
            {searchTerm || statusFilter !== "all" ? "Nenhum afiliado encontrado com os filtros atuais." : "Nenhum afiliado cadastrado ainda."}
          </p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map(function (aff) {
            var isExpanded = expandedId === aff.userId;
            var st = statusOptions.find(function (s) { return s.value === aff.status; }) || statusOptions[0];
            var StIcon = st.icon;
            var affComms = commissions[aff.userId] || [];

            return (
              <div key={aff.userId} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Header Row */}
                <div
                  className="px-4 py-3.5 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={function () { toggleExpand(aff.userId); }}
                >
                  {/* Status badge */}
                  <div className={"w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border " + st.color}>
                    <StIcon className="w-4 h-4" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-gray-800 truncate" style={{ fontSize: "0.88rem", fontWeight: 600 }}>
                        {aff.name}
                      </span>
                      <span className="text-gray-400 font-mono" style={{ fontSize: "0.68rem" }}>
                        {aff.code}
                      </span>
                      <span className={"px-2 py-0.5 rounded-full border " + st.color} style={{ fontSize: "0.6rem", fontWeight: 600 }}>
                        {st.label}
                      </span>
                    </div>
                    <p className="text-gray-400 truncate" style={{ fontSize: "0.72rem" }}>
                      {aff.email} · {formatDate(aff.createdAt)}
                    </p>
                  </div>

                  {/* Quick stats */}
                  <div className="hidden sm:flex items-center gap-4 shrink-0">
                    <div className="text-center">
                      <p className="text-gray-700" style={{ fontSize: "0.82rem", fontWeight: 600 }}>{aff.totalClicks}</p>
                      <p className="text-gray-400" style={{ fontSize: "0.6rem" }}>Cliques</p>
                    </div>
                    <div className="text-center">
                      <p className="text-gray-700" style={{ fontSize: "0.82rem", fontWeight: 600 }}>{aff.totalConversions}</p>
                      <p className="text-gray-400" style={{ fontSize: "0.6rem" }}>Vendas</p>
                    </div>
                    <div className="text-center">
                      <p className="text-emerald-600" style={{ fontSize: "0.82rem", fontWeight: 700 }}>{formatBRL(aff.totalCommission)}</p>
                      <p className="text-gray-400" style={{ fontSize: "0.6rem" }}>Comissão</p>
                    </div>
                  </div>

                  {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
                </div>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50 px-4 py-5 space-y-5">
                    {/* Profile info grid */}
                    <div>
                      <p className="text-gray-600 mb-3" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Informações do Afiliado</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <InfoField icon={Mail} label="Email" value={aff.email} />
                        <InfoField icon={Phone} label="Telefone" value={aff.phone || "—"} />
                        <InfoField icon={AtSign} label="Redes Sociais" value={aff.socialMedia || "—"} />
                        <InfoField icon={KeyRound} label="Chave PIX" value={aff.pixKey || "—"} />
                        <InfoField icon={Calendar} label="Cadastro" value={formatDateTime(aff.createdAt)} />
                        <InfoField icon={Hash} label="Código" value={aff.code} mono />
                      </div>
                      {aff.motivation && (
                        <div className="mt-3 bg-white rounded-lg border border-gray-200 p-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            <MessageCircle className="w-3 h-3 text-gray-400" />
                            <span className="text-gray-500" style={{ fontSize: "0.68rem", fontWeight: 600 }}>Motivação</span>
                          </div>
                          <p className="text-gray-700" style={{ fontSize: "0.78rem" }}>{aff.motivation}</p>
                        </div>
                      )}
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <MiniStat icon={MousePointerClick} label="Cliques" value={String(aff.totalClicks)} color="text-blue-600 bg-blue-50" />
                      <MiniStat icon={ShoppingCart} label="Conversões" value={String(aff.totalConversions)} color="text-emerald-600 bg-emerald-50" />
                      <MiniStat icon={DollarSign} label="Comissão Total" value={formatBRL(aff.totalCommission)} color="text-red-600 bg-red-50" />
                      <MiniStat icon={Wallet} label="Total Pago" value={formatBRL(aff.totalPaid)} color="text-purple-600 bg-purple-50" />
                    </div>

                    {/* Actions */}
                    <div>
                      <p className="text-gray-600 mb-3" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Ações</p>
                      <div className="flex flex-wrap gap-2">
                        {aff.status === "pending" && (
                          <>
                            <button
                              onClick={function () { changeStatus(aff.userId, "approved"); }}
                              disabled={changingStatus === aff.userId}
                              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                              style={{ fontSize: "0.78rem", fontWeight: 600 }}
                            >
                              {changingStatus === aff.userId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                              Aprovar
                            </button>
                            <button
                              onClick={function () { setShowRejectModal(aff.userId); setRejectionReason(""); }}
                              disabled={changingStatus === aff.userId}
                              className="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                              style={{ fontSize: "0.78rem", fontWeight: 600 }}
                            >
                              <Ban className="w-3.5 h-3.5" /> Rejeitar
                            </button>
                          </>
                        )}
                        {aff.status === "approved" && (
                          <button
                            onClick={function () { changeStatus(aff.userId, "suspended"); }}
                            disabled={changingStatus === aff.userId}
                            className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                            style={{ fontSize: "0.78rem", fontWeight: 600 }}
                          >
                            {changingStatus === aff.userId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                            Suspender
                          </button>
                        )}
                        {(aff.status === "suspended" || aff.status === "rejected") && (
                          <button
                            onClick={function () { changeStatus(aff.userId, "approved"); }}
                            disabled={changingStatus === aff.userId}
                            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                            style={{ fontSize: "0.78rem", fontWeight: 600 }}
                          >
                            {changingStatus === aff.userId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                            Reativar
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Commissions */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-gray-600" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                          Comissões ({affComms.length})
                        </p>
                        <button
                          onClick={function () { loadCommissions(aff.userId); }}
                          disabled={loadingComm === aff.userId}
                          className="text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <RefreshCw className={"w-3.5 h-3.5 " + (loadingComm === aff.userId ? "animate-spin" : "")} />
                        </button>
                      </div>

                      {loadingComm === aff.userId && affComms.length === 0 && (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                        </div>
                      )}

                      {affComms.length === 0 && loadingComm !== aff.userId && (
                        <p className="text-gray-400 text-center py-4" style={{ fontSize: "0.78rem" }}>
                          Nenhuma comissão registrada.
                        </p>
                      )}

                      {affComms.length > 0 && (
                        <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                          {affComms.map(function (comm) {
                            var cs = commStatusOptions.find(function (s) { return s.value === comm.status; }) || commStatusOptions[0];
                            var commKey = aff.userId + ":" + comm.orderId;
                            return (
                              <div key={comm.orderId} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-gray-700 font-mono" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                                      #{comm.orderId}
                                    </span>
                                    <span className={"px-2 py-0.5 rounded-full " + cs.color} style={{ fontSize: "0.6rem", fontWeight: 600 }}>
                                      {cs.label}
                                    </span>
                                  </div>
                                  <p className="text-gray-400" style={{ fontSize: "0.68rem" }}>
                                    {formatDateTime(comm.createdAt)} · Venda: {formatBRL(comm.orderTotal)} · {comm.commissionPercent}%
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-gray-800" style={{ fontSize: "0.88rem", fontWeight: 700 }}>
                                    {formatBRL(comm.commissionValue)}
                                  </span>
                                  {/* Status change buttons */}
                                  <div className="flex gap-1">
                                    {comm.status === "pending" && (
                                      <button
                                        onClick={function () { updateCommissionStatus(aff.userId, comm.orderId, "approved"); }}
                                        disabled={updatingComm === commKey}
                                        className="px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
                                        style={{ fontSize: "0.6rem", fontWeight: 600 }}
                                        title="Aprovar comissão"
                                      >
                                        {updatingComm === commKey ? <Loader2 className="w-3 h-3 animate-spin" /> : "Aprovar"}
                                      </button>
                                    )}
                                    {comm.status === "approved" && (
                                      <button
                                        onClick={function () { updateCommissionStatus(aff.userId, comm.orderId, "paid"); }}
                                        disabled={updatingComm === commKey}
                                        className="px-2 py-1 bg-emerald-50 text-emerald-600 rounded hover:bg-emerald-100 transition-colors"
                                        style={{ fontSize: "0.6rem", fontWeight: 600 }}
                                        title="Marcar como paga"
                                      >
                                        {updatingComm === commKey ? <Loader2 className="w-3 h-3 animate-spin" /> : "Pagar"}
                                      </button>
                                    )}
                                    {(comm.status === "pending" || comm.status === "approved") && (
                                      <button
                                        onClick={function () { updateCommissionStatus(aff.userId, comm.orderId, "rejected"); }}
                                        disabled={updatingComm === commKey}
                                        className="px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                                        style={{ fontSize: "0.6rem", fontWeight: 600 }}
                                        title="Rejeitar comissão"
                                      >
                                        {updatingComm === commKey ? <Loader2 className="w-3 h-3 animate-spin" /> : "Rejeitar"}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Rejection Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={function () { setShowRejectModal(null); }}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={function (e) { e.stopPropagation(); }}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="text-gray-900" style={{ fontSize: "1rem", fontWeight: 700 }}>Rejeitar Afiliado</h3>
              <button onClick={function () { setShowRejectModal(null); }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              <label className="text-gray-600 mb-2 block" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                Motivo da rejeição (opcional)
              </label>
              <textarea
                value={rejectionReason}
                onChange={function (e) { setRejectionReason(e.target.value); }}
                placeholder="Explique o motivo da rejeição..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-red-500 outline-none resize-none"
                style={{ fontSize: "0.85rem" }}
              />
            </div>
            <div className="flex justify-end gap-3 px-5 pb-5">
              <button
                onClick={function () { setShowRejectModal(null); }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                style={{ fontSize: "0.8rem" }}
              >
                Cancelar
              </button>
              <button
                onClick={function () { changeStatus(showRejectModal!, "rejected", rejectionReason); }}
                disabled={changingStatus === showRejectModal}
                className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-red-400 transition-colors flex items-center gap-2"
                style={{ fontSize: "0.8rem", fontWeight: 600 }}
              >
                {changingStatus === showRejectModal ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                Rejeitar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper components
function InfoField({ icon: Icon, label, value, mono }: { icon: typeof Mail; label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      <div className="flex items-center gap-1.5 mb-0.5">
        <Icon className="w-3 h-3 text-gray-400" />
        <span className="text-gray-400" style={{ fontSize: "0.65rem", fontWeight: 600 }}>{label}</span>
      </div>
      <p className={"text-gray-700 truncate " + (mono ? "font-mono" : "")} style={{ fontSize: "0.8rem", fontWeight: 500 }}>
        {value}
      </p>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value, color }: { icon: typeof DollarSign; label: string; value: string; color: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 text-center">
      <div className={"w-7 h-7 rounded-lg flex items-center justify-center mx-auto mb-1.5 " + color}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <p className="text-gray-800" style={{ fontSize: "0.85rem", fontWeight: 700 }}>{value}</p>
      <p className="text-gray-400" style={{ fontSize: "0.6rem" }}>{label}</p>
    </div>
  );
}
