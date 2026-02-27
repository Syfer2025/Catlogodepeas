import { useState, useEffect } from "react";
import {
  Shield,
  Loader2,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronUp,
  Clock,
  User,
  Mail,
  Phone,
  CreditCard,
  FileText,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  MessageSquare,
  Save,
  Filter,
  Eye,
  X,
} from "lucide-react";
import * as api from "../../services/api";
import type { LgpdRequest } from "../../services/api";
import { supabase } from "../../services/supabaseClient";
import { getValidAdminToken } from "./adminAuth";
import { toast } from "sonner";

var REQUEST_TYPE_LABELS: Record<string, string> = {
  confirmacao: "Confirmação de tratamento",
  acesso: "Acesso aos dados",
  correcao: "Correcao de dados",
  anonimizacao: "Anonimizacao/Bloqueio",
  portabilidade: "Portabilidade",
  eliminacao: "Eliminacao de dados",
  revogacao: "Revogacao de consentimento",
  oposicao: "Oposicao ao tratamento",
  informacao_compartilhamento: "Info. compartilhamento",
};

var STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof Clock }> = {
  pending: { label: "Pendente", color: "text-amber-700", bg: "bg-amber-50 border-amber-200", icon: Clock },
  in_progress: { label: "Em Analise", color: "text-blue-700", bg: "bg-blue-50 border-blue-200", icon: RefreshCw },
  completed: { label: "Concluido", color: "text-green-700", bg: "bg-green-50 border-green-200", icon: CheckCircle2 },
  rejected: { label: "Indeferido", color: "text-red-700", bg: "bg-red-50 border-red-200", icon: XCircle },
};

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCPFDisplay(cpf: string): string {
  if (!cpf || cpf.length !== 11) return cpf || "—";
  return cpf.substring(0, 3) + "." + cpf.substring(3, 6) + "." + cpf.substring(6, 9) + "-" + cpf.substring(9);
}

export function AdminLgpdRequests() {
  var [requests, setRequests] = useState<LgpdRequest[]>([]);
  var [loading, setLoading] = useState(true);
  var [error, setError] = useState("");
  var [search, setSearch] = useState("");
  var [statusFilter, setStatusFilter] = useState<string>("all");
  var [expandedId, setExpandedId] = useState<string | null>(null);
  var [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
  var [savingStatus, setSavingStatus] = useState<Record<string, boolean>>({});
  var [deletingId, setDeletingId] = useState<string | null>(null);

  async function getAccessToken(): Promise<string> {
    return await getValidAdminToken() || "";
  }

  async function loadRequests() {
    setLoading(true);
    setError("");
    try {
      var token = await getAccessToken();
      if (!token) { setError("Sessão expirada."); return; }
      var result = await api.getAdminLgpdRequests(token);
      setRequests(result.requests || []);
    } catch (e: any) {
      console.error("[AdminLGPD] Load error:", e);
      setError(e.message || "Erro ao carregar solicitacoes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(function () { loadRequests(); }, []);

  async function handleStatusChange(id: string, newStatus: string) {
    setSavingStatus(function (prev) { var n: Record<string, boolean> = {}; for (var k in prev) n[k] = prev[k]; n[id] = true; return n; });
    try {
      var token = await getAccessToken();
      var notes = editingNotes[id];
      var payload: any = { status: newStatus };
      if (notes !== undefined) payload.adminNotes = notes;
      var result = await api.updateLgpdRequest(token, id, payload);
      if (result.ok) {
        setRequests(function (prev) {
          return prev.map(function (r) { return r.id === id ? result.request : r; });
        });
        toast.success("Status atualizado para: " + (STATUS_CONFIG[newStatus] || {}).label);
      }
    } catch (e: any) {
      console.error("[AdminLGPD] Update error:", e);
      toast.error("Erro ao atualizar: " + (e.message || ""));
    } finally {
      setSavingStatus(function (prev) { var n: Record<string, boolean> = {}; for (var k in prev) n[k] = prev[k]; n[id] = false; return n; });
    }
  }

  async function handleSaveNotes(id: string) {
    var notes = editingNotes[id] || "";
    setSavingStatus(function (prev) { var n: Record<string, boolean> = {}; for (var k in prev) n[k] = prev[k]; n[id] = true; return n; });
    try {
      var token = await getAccessToken();
      var result = await api.updateLgpdRequest(token, id, { adminNotes: notes });
      if (result.ok) {
        setRequests(function (prev) {
          return prev.map(function (r) { return r.id === id ? result.request : r; });
        });
        toast.success("Observacoes salvas.");
      }
    } catch (e: any) {
      toast.error("Erro ao salvar: " + (e.message || ""));
    } finally {
      setSavingStatus(function (prev) { var n: Record<string, boolean> = {}; for (var k in prev) n[k] = prev[k]; n[id] = false; return n; });
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta solicitacao LGPD permanentemente?")) return;
    setDeletingId(id);
    try {
      var token = await getAccessToken();
      await api.deleteLgpdRequest(token, id);
      setRequests(function (prev) { return prev.filter(function (r) { return r.id !== id; }); });
      if (expandedId === id) setExpandedId(null);
      toast.success("Solicitacao excluida.");
    } catch (e: any) {
      toast.error("Erro ao excluir: " + (e.message || ""));
    } finally {
      setDeletingId(null);
    }
  }

  // Filtered requests
  var filtered = requests.filter(function (r) {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (search) {
      var q = search.toLowerCase();
      return (
        r.fullName.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        (r.cpf && r.cpf.includes(q)) ||
        (REQUEST_TYPE_LABELS[r.requestType] || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  var statusCounts = {
    all: requests.length,
    pending: requests.filter(function (r) { return r.status === "pending"; }).length,
    in_progress: requests.filter(function (r) { return r.status === "in_progress"; }).length,
    completed: requests.filter(function (r) { return r.status === "completed"; }).length,
    rejected: requests.filter(function (r) { return r.status === "rejected"; }).length,
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-red-600" />
          <h2 className="text-gray-900" style={{ fontSize: "1.15rem", fontWeight: 700 }}>
            Solicitacoes LGPD
          </h2>
          <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full" style={{ fontSize: "0.72rem", fontWeight: 600 }}>
            {requests.length}
          </span>
        </div>
        <button
          onClick={loadRequests}
          disabled={loading}
          className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
          style={{ fontSize: "0.8rem", fontWeight: 500 }}
        >
          <RefreshCw className={"w-3.5 h-3.5 " + (loading ? "animate-spin" : "")} />
          Atualizar
        </button>
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: "all", label: "Todos" },
          { key: "pending", label: "Pendentes" },
          { key: "in_progress", label: "Em Analise" },
          { key: "completed", label: "Concluidos" },
          { key: "rejected", label: "Indeferidos" },
        ].map(function (f) {
          var count = (statusCounts as any)[f.key] || 0;
          var isActive = statusFilter === f.key;
          return (
            <button
              key={f.key}
              onClick={function () { setStatusFilter(f.key); }}
              className={"flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all " + (isActive ? "bg-red-50 border-red-300 text-red-700" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300")}
              style={{ fontSize: "0.78rem", fontWeight: isActive ? 600 : 400 }}
            >
              {f.label}
              <span className={"px-1.5 py-0 rounded-full " + (isActive ? "bg-red-200 text-red-800" : "bg-gray-100 text-gray-500")} style={{ fontSize: "0.68rem", fontWeight: 600 }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={function (e) { setSearch(e.target.value); }}
          placeholder="Buscar por nome, email, protocolo ou tipo..."
          className="w-full border border-gray-200 rounded-lg pl-10 pr-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
          style={{ fontSize: "0.85rem" }}
        />
        {search && (
          <button onClick={function () { setSearch(""); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <p className="text-red-700" style={{ fontSize: "0.82rem" }}>{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-red-600 animate-spin" />
          <span className="ml-2 text-gray-500" style={{ fontSize: "0.85rem" }}>Carregando solicitacoes...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Shield className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600" style={{ fontSize: "0.95rem", fontWeight: 600 }}>
            {search || statusFilter !== "all" ? "Nenhuma solicitacao encontrada com os filtros aplicados." : "Nenhuma solicitacao LGPD recebida ainda."}
          </p>
          <p className="text-gray-400 mt-1" style={{ fontSize: "0.82rem" }}>
            As solicitacoes de exercicio de direitos dos titulares aparecerao aqui.
          </p>
        </div>
      ) : (
        /* Request List */
        <div className="space-y-3">
          {filtered.map(function (req) {
            var isExpanded = expandedId === req.id;
            var statusConf = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
            var StatusIcon = statusConf.icon;
            var isSaving = savingStatus[req.id] || false;
            var isDeleting = deletingId === req.id;

            return (
              <div key={req.id} className={"bg-white border rounded-xl overflow-hidden transition-all " + (isExpanded ? "border-red-300 shadow-md" : "border-gray-200 hover:border-gray-300")}>
                {/* Header row */}
                <button
                  onClick={function () { setExpandedId(isExpanded ? null : req.id); if (!isExpanded && editingNotes[req.id] === undefined) { var nn: Record<string, string> = {}; for (var k in editingNotes) nn[k] = editingNotes[k]; nn[req.id] = req.adminNotes || ""; setEditingNotes(nn); } }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50/50 transition-colors"
                >
                  <div className={"shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border " + statusConf.bg}>
                    <StatusIcon className={"w-4 h-4 " + statusConf.color} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-gray-900 truncate" style={{ fontSize: "0.88rem", fontWeight: 600 }}>
                        {req.fullName}
                      </span>
                      <span className={"shrink-0 px-2 py-0.5 rounded-full border " + statusConf.bg + " " + statusConf.color} style={{ fontSize: "0.68rem", fontWeight: 600 }}>
                        {statusConf.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="text-gray-400 flex items-center gap-1" style={{ fontSize: "0.75rem" }}>
                        <FileText className="w-3 h-3" />
                        {REQUEST_TYPE_LABELS[req.requestType] || req.requestType}
                      </span>
                      <span className="text-gray-400 flex items-center gap-1" style={{ fontSize: "0.75rem" }}>
                        <Mail className="w-3 h-3" />
                        {req.email}
                      </span>
                      <span className="text-gray-400 flex items-center gap-1" style={{ fontSize: "0.75rem" }}>
                        <Clock className="w-3 h-3" />
                        {formatDate(req.createdAt)}
                      </span>
                    </div>
                  </div>

                  {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 py-4 space-y-4">
                    {/* Details grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-gray-50 rounded-lg p-3">
                        <span className="text-gray-400 flex items-center gap-1 mb-1" style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase" }}>
                          <User className="w-3 h-3" /> Nome
                        </span>
                        <p className="text-gray-900" style={{ fontSize: "0.85rem" }}>{req.fullName}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <span className="text-gray-400 flex items-center gap-1 mb-1" style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase" }}>
                          <Mail className="w-3 h-3" /> Email
                        </span>
                        <p className="text-gray-900" style={{ fontSize: "0.85rem" }}>{req.email}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <span className="text-gray-400 flex items-center gap-1 mb-1" style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase" }}>
                          <CreditCard className="w-3 h-3" /> CPF
                        </span>
                        <p className="text-gray-900" style={{ fontSize: "0.85rem" }}>{req.cpf ? formatCPFDisplay(req.cpf) : "Não informado"}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <span className="text-gray-400 flex items-center gap-1 mb-1" style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase" }}>
                          <Phone className="w-3 h-3" /> Telefone
                        </span>
                        <p className="text-gray-900" style={{ fontSize: "0.85rem" }}>{req.phone || "Não informado"}</p>
                      </div>
                    </div>

                    {/* Protocol + Type */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-gray-50 rounded-lg p-3">
                        <span className="text-gray-400 mb-1 block" style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase" }}>
                          Protocolo
                        </span>
                        <code className="text-red-700 font-mono" style={{ fontSize: "0.78rem" }}>{req.id}</code>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <span className="text-gray-400 mb-1 block" style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase" }}>
                          Tipo de Solicitacao
                        </span>
                        <p className="text-gray-900" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                          {REQUEST_TYPE_LABELS[req.requestType] || req.requestType}
                        </p>
                      </div>
                    </div>

                    {/* Description */}
                    <div>
                      <span className="text-gray-400 flex items-center gap-1 mb-1.5" style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase" }}>
                        <FileText className="w-3 h-3" /> Descrição do Titular
                      </span>
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                        <p className="text-gray-800 whitespace-pre-wrap" style={{ fontSize: "0.85rem", lineHeight: 1.6 }}>
                          {req.description}
                        </p>
                      </div>
                    </div>

                    {/* Dates */}
                    <div className="flex flex-wrap gap-4">
                      <div>
                        <span className="text-gray-400 block" style={{ fontSize: "0.72rem", fontWeight: 600 }}>Recebido em</span>
                        <span className="text-gray-700" style={{ fontSize: "0.82rem" }}>{formatDate(req.createdAt)}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block" style={{ fontSize: "0.72rem", fontWeight: 600 }}>Atualizado em</span>
                        <span className="text-gray-700" style={{ fontSize: "0.82rem" }}>{formatDate(req.updatedAt)}</span>
                      </div>
                      {req.resolvedAt && (
                        <div>
                          <span className="text-gray-400 block" style={{ fontSize: "0.72rem", fontWeight: 600 }}>Resolvido em</span>
                          <span className="text-green-700" style={{ fontSize: "0.82rem" }}>{formatDate(req.resolvedAt)}</span>
                        </div>
                      )}
                    </div>

                    {/* Admin notes */}
                    <div>
                      <span className="text-gray-400 flex items-center gap-1 mb-1.5" style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase" }}>
                        <MessageSquare className="w-3 h-3" /> Observacoes internas (admin)
                      </span>
                      <textarea
                        value={editingNotes[req.id] !== undefined ? editingNotes[req.id] : (req.adminNotes || "")}
                        onChange={function (e) { var nn: Record<string, string> = {}; for (var k in editingNotes) nn[k] = editingNotes[k]; nn[req.id] = e.target.value; setEditingNotes(nn); }}
                        rows={3}
                        placeholder="Adicionar observacoes internas sobre esta solicitacao..."
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none resize-none"
                        style={{ fontSize: "0.82rem" }}
                        maxLength={5000}
                      />
                      <button
                        onClick={function () { handleSaveNotes(req.id); }}
                        disabled={isSaving}
                        className="mt-1.5 flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                        style={{ fontSize: "0.78rem", fontWeight: 500 }}
                      >
                        {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Salvar Observacoes
                      </button>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between flex-wrap gap-3 pt-3 border-t border-gray-100">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-gray-500 shrink-0" style={{ fontSize: "0.78rem", fontWeight: 500 }}>
                          Alterar status:
                        </span>
                        {["pending", "in_progress", "completed", "rejected"].map(function (st) {
                          var conf = STATUS_CONFIG[st];
                          var isCurrentStatus = req.status === st;
                          return (
                            <button
                              key={st}
                              onClick={function () { if (!isCurrentStatus) handleStatusChange(req.id, st); }}
                              disabled={isCurrentStatus || isSaving}
                              className={"px-2.5 py-1 rounded-lg border transition-all " + (isCurrentStatus ? conf.bg + " " + conf.color + " font-semibold" : "bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700") + " disabled:cursor-not-allowed"}
                              style={{ fontSize: "0.75rem", fontWeight: isCurrentStatus ? 600 : 400 }}
                            >
                              {conf.label}
                            </button>
                          );
                        })}
                      </div>

                      <button
                        onClick={function () { handleDelete(req.id); }}
                        disabled={isDeleting}
                        className="flex items-center gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                        style={{ fontSize: "0.78rem", fontWeight: 500 }}
                      >
                        {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        Excluir
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
