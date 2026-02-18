import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../services/supabaseClient";
import * as api from "../../services/api";
import type { PagHiperConfig, PagHiperTransaction } from "../../services/api";
import { copyToClipboard } from "../../utils/clipboard";
import {
  CreditCard,
  Save,
  Check,
  Loader2,
  Trash2,
  Eye,
  EyeOff,
  RefreshCw,
  QrCode,
  FileText,
  XCircle,
  ExternalLink,
  Copy,
  AlertCircle,
  CheckCircle2,
  Clock,
  Ban,
  ChevronDown,
  ChevronUp,
  Search,
  Plus,
} from "lucide-react";

/* ═══════════════════════════════════════════════
   Helper
   ═══════════════════════════════════════════════ */

async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Sessao expirada. Faca login novamente.");
  return token;
}

function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

function formatDate(ts: number | string | null | undefined): string {
  if (!ts) return "—";
  const d = typeof ts === "number" ? new Date(ts) : new Date(ts);
  return d.toLocaleString("pt-BR");
}

function statusBadge(status: string) {
  const map: Record<string, { bg: string; text: string; icon: typeof CheckCircle2 }> = {
    completed: { bg: "bg-green-100", text: "text-green-700", icon: CheckCircle2 },
    paid: { bg: "bg-green-100", text: "text-green-700", icon: CheckCircle2 },
    pending: { bg: "bg-yellow-100", text: "text-yellow-700", icon: Clock },
    reserved: { bg: "bg-blue-100", text: "text-blue-700", icon: Clock },
    canceled: { bg: "bg-red-100", text: "text-red-700", icon: Ban },
    processing: { bg: "bg-blue-100", text: "text-blue-700", icon: RefreshCw },
    refunded: { bg: "bg-gray-100", text: "text-gray-700", icon: XCircle },
  };
  const s = map[status] || { bg: "bg-gray-100", text: "text-gray-600", icon: AlertCircle };
  const Icon = s.icon;
  const label: Record<string, string> = {
    completed: "Pago",
    paid: "Pago",
    pending: "Pendente",
    reserved: "Reservado",
    canceled: "Cancelado",
    processing: "Processando",
    refunded: "Reembolsado",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${s.bg} ${s.text}`} style={{ fontSize: "0.75rem", fontWeight: 500 }}>
      <Icon className="w-3 h-3" />
      {label[status] || status}
    </span>
  );
}

/* ═══════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════ */

export function AdminPagHiper() {
  const [activeSection, setActiveSection] = useState<"config" | "transactions" | "new-charge">("config");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "1.25rem", fontWeight: 700 }}>
            <CreditCard className="w-5 h-5 text-red-600" />
            PagHiper
          </h2>
          <p className="text-gray-400" style={{ fontSize: "0.85rem" }}>
            Integração com PagHiper para pagamentos via PIX e Boleto
          </p>
        </div>
      </div>

      {/* Nav */}
      <div className="bg-white rounded-xl border border-gray-200 p-1.5 flex gap-1 overflow-x-auto">
        {([
          { id: "config" as const, label: "Configuracao", icon: CreditCard },
          { id: "transactions" as const, label: "Transacoes", icon: FileText },
          { id: "new-charge" as const, label: "Nova Cobranca", icon: Plus },
        ]).map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveSection(item.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors whitespace-nowrap ${
              activeSection === item.id ? "bg-red-50 text-red-600" : "text-gray-600 hover:bg-gray-50"
            }`}
            style={{ fontSize: "0.85rem", fontWeight: activeSection === item.id ? 500 : 400 }}
          >
            <item.icon className="w-4 h-4 shrink-0" />
            {item.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeSection === "config" && <PagHiperConfigSection />}
      {activeSection === "transactions" && <TransactionsSection />}
      {activeSection === "new-charge" && <NewChargeSection />}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Config Section
   ═══════════════════════════════════════════════ */

function PagHiperConfigSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [config, setConfig] = useState<PagHiperConfig | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [token, setToken] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const tk = await getToken();
      const data = await api.getPagHiperConfig(tk);
      setConfig(data);
    } catch (e: any) {
      console.error("[PagHiper] Load config error:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!apiKey.trim() || !token.trim()) {
      setError("API Key e Token sao obrigatorios.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const tk = await getToken();
      await api.savePagHiperConfig(tk, { apiKey: apiKey.trim(), token: token.trim() });
      setSuccess("Credenciais salvas com sucesso!");
      setApiKey("");
      setToken("");
      setTimeout(() => setSuccess(""), 3000);
      await loadConfig();
    } catch (e: any) {
      setError(e.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Tem certeza que deseja remover as credenciais do PagHiper?")) return;
    setDeleting(true);
    setError("");
    try {
      const tk = await getToken();
      await api.deletePagHiperConfig(tk);
      setConfig({ configured: false });
      setSuccess("Credenciais removidas.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e: any) {
      setError(e.message || "Erro ao remover.");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
      <h3 className="text-gray-800 pb-3 border-b border-gray-100" style={{ fontSize: "1rem", fontWeight: 600 }}>
        Credenciais PagHiper
      </h3>

      {/* Status */}
      <div className={`flex items-center gap-3 p-4 rounded-lg border ${
        config?.configured
          ? "bg-green-50 border-green-200"
          : "bg-yellow-50 border-yellow-200"
      }`}>
        {config?.configured ? (
          <>
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
            <div>
              <p className="text-green-700" style={{ fontSize: "0.9rem", fontWeight: 500 }}>PagHiper Configurado</p>
              <p className="text-green-600" style={{ fontSize: "0.78rem" }}>
                API Key: {config.apiKeyPreview}
                {config.updatedAt && ` | Atualizado: ${formatDate(config.updatedAt)}`}
              </p>
            </div>
          </>
        ) : (
          <>
            <AlertCircle className="w-5 h-5 text-yellow-600 shrink-0" />
            <div>
              <p className="text-yellow-700" style={{ fontSize: "0.9rem", fontWeight: 500 }}>PagHiper Nao Configurado</p>
              <p className="text-yellow-600" style={{ fontSize: "0.78rem" }}>
                Insira sua API Key e Token para habilitar pagamentos.
              </p>
            </div>
          </>
        )}
      </div>

      {/* Help */}
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <p className="text-gray-600" style={{ fontSize: "0.82rem" }}>
          Para obter suas credenciais, acesse{" "}
          <a href="https://www.paghiper.com/painel/credenciais/" target="_blank" rel="noopener noreferrer" className="text-red-600 underline hover:text-red-700">
            paghiper.com/painel/credenciais
          </a>
          {" "}e copie a <strong>API Key</strong> e o <strong>Token</strong>.
        </p>
      </div>

      {/* Form */}
      <div className="space-y-4">
        <div>
          <label className="block text-gray-600 mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>API Key</label>
          <div className="relative">
            <input
              type={showApiKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={config?.configured ? "••••••••• (ja configurado)" : "Insira sua API Key"}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all pr-10"
              style={{ fontSize: "0.85rem" }}
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-gray-600 mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>Token</label>
          <div className="relative">
            <input
              type={showToken ? "text" : "password"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={config?.configured ? "••••••••• (ja configurado)" : "Insira seu Token"}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all pr-10"
              style={{ fontSize: "0.85rem" }}
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Error/Success */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-red-600" style={{ fontSize: "0.82rem" }}>{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
          <Check className="w-4 h-4 text-green-600 shrink-0" />
          <p className="text-green-700" style={{ fontSize: "0.82rem" }}>{success}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saving || (!apiKey.trim() && !token.trim())}
          className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
          style={{ fontSize: "0.85rem", fontWeight: 500 }}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar Credenciais
        </button>

        {config?.configured && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-2 px-4 py-2.5 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
            style={{ fontSize: "0.85rem", fontWeight: 500 }}
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Remover
          </button>
        )}
      </div>

      {/* Notification URL info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
        <p className="text-blue-700 mb-1" style={{ fontSize: "0.85rem", fontWeight: 500 }}>URL de Notificacao (Webhook)</p>
        <p className="text-blue-600 mb-2" style={{ fontSize: "0.78rem" }}>
          Configure esta URL no painel do PagHiper para receber notificacoes automaticas de pagamento:
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-white border border-blue-200 rounded px-3 py-2 text-blue-800 break-all" style={{ fontSize: "0.78rem" }}>
            {`https://aztdgagxvrlylszieujs.supabase.co/functions/v1/make-server-b7b07654/paghiper/notification`}
          </code>
          <button
            onClick={() => copyToClipboard(`https://aztdgagxvrlylszieujs.supabase.co/functions/v1/make-server-b7b07654/paghiper/notification`)}
            className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors shrink-0"
            title="Copiar URL"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Transactions Section
   ═══════════════════════════════════════════════ */

function TransactionsSection() {
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<PagHiperTransaction[]>([]);
  const [filter, setFilter] = useState("");
  const [filterType, setFilterType] = useState<"all" | "pix" | "boleto">("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const tk = await getToken();
      const data = await api.getPagHiperTransactions(tk);
      setTransactions((data.transactions || []).filter((t: any) => t != null));
    } catch (e: any) {
      console.error("[PagHiper] Load transactions error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const refreshStatus = async (tx: PagHiperTransaction) => {
    setRefreshingId(tx.transaction_id);
    try {
      const statusFn = tx.type === "boleto" ? api.getBoletoStatus : api.getPixStatus;
      const result = await statusFn(tx.transaction_id);
      // Reload all
      await loadTransactions();
    } catch (e: any) {
      console.error("Status refresh error:", e);
    } finally {
      setRefreshingId(null);
    }
  };

  const cancelTx = async (tx: PagHiperTransaction) => {
    if (!confirm(`Cancelar transacao ${tx.transaction_id}?`)) return;
    setCancelingId(tx.transaction_id);
    try {
      const tk = await getToken();
      const cancelFn = tx.type === "boleto" ? api.cancelBoletoCharge : api.cancelPixCharge;
      await cancelFn(tk, tx.transaction_id);
      await loadTransactions();
    } catch (e: any) {
      console.error("Cancel error:", e);
      alert("Erro ao cancelar: " + e.message);
    } finally {
      setCancelingId(null);
    }
  };

  const filtered = transactions.filter((tx) => {
    if (!tx) return false;
    if (filterType !== "all" && tx.type !== filterType) return false;
    if (filterStatus !== "all" && tx.status !== filterStatus) return false;
    if (filter) {
      const q = filter.toLowerCase();
      return (
        tx.transaction_id?.toLowerCase().includes(q) ||
        tx.order_id?.toLowerCase().includes(q) ||
        tx.payer_name?.toLowerCase().includes(q) ||
        tx.payer_email?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Buscar por ID, pedido, nome ou email..."
              className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50 outline-none focus:border-red-500 transition-all"
              style={{ fontSize: "0.85rem" }}
            />
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 transition-all"
            style={{ fontSize: "0.85rem" }}
          >
            <option value="all">Todos</option>
            <option value="pix">PIX</option>
            <option value="boleto">Boleto</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 transition-all"
            style={{ fontSize: "0.85rem" }}
          >
            <option value="all">Status: Todos</option>
            <option value="pending">Pendente</option>
            <option value="completed">Pago</option>
            <option value="paid">Pago</option>
            <option value="canceled">Cancelado</option>
          </select>
          <button
            onClick={loadTransactions}
            className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-600"
            style={{ fontSize: "0.85rem" }}
          >
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", value: transactions.filter(t => t != null).length, color: "text-gray-700", bg: "bg-gray-50" },
          { label: "Pendentes", value: transactions.filter(t => t != null && (t.status === "pending" || t.status === "reserved")).length, color: "text-yellow-700", bg: "bg-yellow-50" },
          { label: "Pagos", value: transactions.filter(t => t != null && (t.status === "completed" || t.status === "paid")).length, color: "text-green-700", bg: "bg-green-50" },
          { label: "Cancelados", value: transactions.filter(t => t != null && t.status === "canceled").length, color: "text-red-700", bg: "bg-red-50" },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} rounded-xl border border-gray-200 p-4`}>
            <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>{s.label}</p>
            <p className={s.color} style={{ fontSize: "1.5rem", fontWeight: 700 }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Transactions list */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500" style={{ fontSize: "0.9rem" }}>
            {transactions.length === 0 ? "Nenhuma transacao registrada." : "Nenhuma transacao encontrada com os filtros aplicados."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((tx) => (
            <div key={tx.transaction_id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Header row */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setExpandedId(expandedId === tx.transaction_id ? null : tx.transaction_id)}
              >
                <div className="shrink-0">
                  {tx.type === "pix" ? (
                    <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                      <QrCode className="w-4 h-4 text-green-700" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                      <FileText className="w-4 h-4 text-blue-700" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-800 truncate" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                      {tx.order_id}
                    </span>
                    <span className="text-gray-400 uppercase" style={{ fontSize: "0.7rem", fontWeight: 500 }}>
                      {tx.type}
                    </span>
                    {statusBadge(tx.status)}
                  </div>
                  <p className="text-gray-400 truncate" style={{ fontSize: "0.75rem" }}>
                    {tx.payer_name} &bull; {formatDate(tx.created_at)}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <p className="text-gray-800" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                    {formatCents(tx.value_cents)}
                  </p>
                </div>

                <div className="shrink-0 text-gray-400">
                  {expandedId === tx.transaction_id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </div>

              {/* Expanded details */}
              {expandedId === tx.transaction_id && (
                <div className="border-t border-gray-100 px-4 py-4 bg-gray-50 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <p className="text-gray-500" style={{ fontSize: "0.72rem" }}>Transaction ID</p>
                      <p className="text-gray-800 font-mono break-all" style={{ fontSize: "0.82rem" }}>{tx.transaction_id}</p>
                    </div>
                    <div>
                      <p className="text-gray-500" style={{ fontSize: "0.72rem" }}>Pagador</p>
                      <p className="text-gray-800" style={{ fontSize: "0.82rem" }}>{tx.payer_name}</p>
                      <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>{tx.payer_email}</p>
                    </div>
                    <div>
                      <p className="text-gray-500" style={{ fontSize: "0.72rem" }}>CPF/CNPJ</p>
                      <p className="text-gray-800" style={{ fontSize: "0.82rem" }}>{tx.payer_cpf_cnpj}</p>
                    </div>
                    <div>
                      <p className="text-gray-500" style={{ fontSize: "0.72rem" }}>Data Criacao</p>
                      <p className="text-gray-800" style={{ fontSize: "0.82rem" }}>{formatDate(tx.created_at)}</p>
                    </div>
                    {tx.paid_date && (
                      <div>
                        <p className="text-gray-500" style={{ fontSize: "0.72rem" }}>Data Pagamento</p>
                        <p className="text-green-700" style={{ fontSize: "0.82rem" }}>{tx.paid_date}</p>
                      </div>
                    )}
                  </div>

                  {/* PIX specific */}
                  {tx.type === "pix" && tx.emv && (
                    <div>
                      <p className="text-gray-500 mb-1" style={{ fontSize: "0.72rem" }}>Codigo PIX (Copia e Cola)</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 bg-white border border-gray-200 rounded px-3 py-2 text-gray-700 break-all" style={{ fontSize: "0.75rem" }}>
                          {tx.emv}
                        </code>
                        <button
                          onClick={() => copyToClipboard(tx.emv!)}
                          className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Boleto specific */}
                  {tx.type === "boleto" && tx.bank_slip && (
                    <div className="space-y-2">
                      {tx.bank_slip.digitable_line && (
                        <div>
                          <p className="text-gray-500 mb-1" style={{ fontSize: "0.72rem" }}>Linha Digitavel</p>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 bg-white border border-gray-200 rounded px-3 py-2 text-gray-700 break-all" style={{ fontSize: "0.75rem" }}>
                              {tx.bank_slip.digitable_line}
                            </code>
                            <button
                              onClick={() => copyToClipboard(tx.bank_slip!.digitable_line!)}
                              className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}
                      {tx.bank_slip.url_slip_pdf && (
                        <a
                          href={tx.bank_slip.url_slip_pdf}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                          style={{ fontSize: "0.82rem" }}
                        >
                          <ExternalLink className="w-4 h-4" />
                          Abrir Boleto PDF
                        </a>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => refreshStatus(tx)}
                      disabled={refreshingId === tx.transaction_id}
                      className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg hover:bg-white transition-colors text-gray-600 disabled:opacity-50"
                      style={{ fontSize: "0.8rem" }}
                    >
                      {refreshingId === tx.transaction_id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      Atualizar Status
                    </button>
                    {(tx.status === "pending" || tx.status === "reserved") && (
                      <button
                        onClick={() => cancelTx(tx)}
                        disabled={cancelingId === tx.transaction_id}
                        className="flex items-center gap-1.5 px-3 py-2 border border-red-200 rounded-lg hover:bg-red-50 transition-colors text-red-600 disabled:opacity-50"
                        style={{ fontSize: "0.8rem" }}
                      >
                        {cancelingId === tx.transaction_id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5" />
                        )}
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   New Charge Section
   ═══════════════════════════════════════════════ */

function NewChargeSection() {
  const [chargeType, setChargeType] = useState<"pix" | "boleto">("pix");
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  // Form
  const [orderId, setOrderId] = useState("");
  const [payerName, setPayerName] = useState("");
  const [payerEmail, setPayerEmail] = useState("");
  const [payerCpf, setPayerCpf] = useState("");
  const [payerPhone, setPayerPhone] = useState("");
  const [itemDesc, setItemDesc] = useState("");
  const [itemQty, setItemQty] = useState("1");
  const [itemPrice, setItemPrice] = useState("");
  const [daysDue, setDaysDue] = useState("1");

  // Boleto extras
  const [payerStreet, setPayerStreet] = useState("");
  const [payerNumber, setPayerNumber] = useState("");
  const [payerDistrict, setPayerDistrict] = useState("");
  const [payerCity, setPayerCity] = useState("");
  const [payerState, setPayerState] = useState("");
  const [payerZip, setPayerZip] = useState("");

  const handleCreate = async () => {
    setError("");
    setResult(null);

    if (!orderId.trim() || !payerName.trim() || !payerEmail.trim() || !payerCpf.trim() || !itemPrice.trim()) {
      setError("Preencha todos os campos obrigatorios.");
      return;
    }

    const priceCents = Math.round(parseFloat(itemPrice.replace(",", ".")) * 100);
    if (isNaN(priceCents) || priceCents <= 0) {
      setError("Valor invalido.");
      return;
    }

    setCreating(true);
    try {
      const items = [{
        description: itemDesc.trim() || `Pedido ${orderId}`,
        quantity: parseInt(itemQty) || 1,
        item_id: "1",
        price_cents: priceCents,
      }];

      if (chargeType === "pix") {
        const res = await api.createPixCharge({
          order_id: orderId.trim(),
          payer_email: payerEmail.trim(),
          payer_name: payerName.trim(),
          payer_cpf_cnpj: payerCpf.trim(),
          payer_phone: payerPhone.trim() || undefined,
          days_due_date: daysDue,
          items,
        });
        setResult({ type: "pix", ...res });
      } else {
        const res = await api.createBoletoCharge({
          order_id: orderId.trim(),
          payer_email: payerEmail.trim(),
          payer_name: payerName.trim(),
          payer_cpf_cnpj: payerCpf.trim(),
          payer_phone: payerPhone.trim() || undefined,
          payer_street: payerStreet.trim() || undefined,
          payer_number: payerNumber.trim() || undefined,
          payer_district: payerDistrict.trim() || undefined,
          payer_city: payerCity.trim() || undefined,
          payer_state: payerState.trim() || undefined,
          payer_zip_code: payerZip.trim() || undefined,
          days_due_date: daysDue,
          items,
        });
        setResult({ type: "boleto", ...res });
      }
    } catch (e: any) {
      setError(e.message || "Erro ao criar cobranca.");
      console.error("[PagHiper] Create charge error:", e);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Type selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-gray-700 mb-3" style={{ fontSize: "0.9rem", fontWeight: 500 }}>Tipo de Cobranca</p>
        <div className="flex gap-3">
          <button
            onClick={() => setChargeType("pix")}
            className={`flex-1 flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
              chargeType === "pix" ? "border-green-500 bg-green-50" : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <QrCode className={`w-6 h-6 ${chargeType === "pix" ? "text-green-600" : "text-gray-400"}`} />
            <div className="text-left">
              <p className={chargeType === "pix" ? "text-green-700" : "text-gray-700"} style={{ fontSize: "0.9rem", fontWeight: 600 }}>PIX</p>
              <p className="text-gray-400" style={{ fontSize: "0.75rem" }}>Pagamento instantaneo</p>
            </div>
          </button>
          <button
            onClick={() => setChargeType("boleto")}
            className={`flex-1 flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
              chargeType === "boleto" ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <FileText className={`w-6 h-6 ${chargeType === "boleto" ? "text-blue-600" : "text-gray-400"}`} />
            <div className="text-left">
              <p className={chargeType === "boleto" ? "text-blue-700" : "text-gray-700"} style={{ fontSize: "0.9rem", fontWeight: 600 }}>Boleto</p>
              <p className="text-gray-400" style={{ fontSize: "0.75rem" }}>Boleto bancario</p>
            </div>
          </button>
        </div>
      </div>

      {/* Form */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <h3 className="text-gray-800 pb-3 border-b border-gray-100" style={{ fontSize: "1rem", fontWeight: 600 }}>
          Dados da Cobranca
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-gray-600 mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>
              ID do Pedido <span className="text-red-500">*</span>
            </label>
            <input type="text" value={orderId} onChange={(e) => setOrderId(e.target.value)}
              placeholder="Ex: PED-001"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all"
              style={{ fontSize: "0.85rem" }} />
          </div>
          <div>
            <label className="block text-gray-600 mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>
              Vencimento (dias)
            </label>
            <input type="number" value={daysDue} onChange={(e) => setDaysDue(e.target.value)} min="1"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all"
              style={{ fontSize: "0.85rem" }} />
          </div>
        </div>

        <h4 className="text-gray-700 pt-2" style={{ fontSize: "0.9rem", fontWeight: 500 }}>Pagador</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-gray-600 mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>
              Nome <span className="text-red-500">*</span>
            </label>
            <input type="text" value={payerName} onChange={(e) => setPayerName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all"
              style={{ fontSize: "0.85rem" }} />
          </div>
          <div>
            <label className="block text-gray-600 mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>
              Email <span className="text-red-500">*</span>
            </label>
            <input type="email" value={payerEmail} onChange={(e) => setPayerEmail(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all"
              style={{ fontSize: "0.85rem" }} />
          </div>
          <div>
            <label className="block text-gray-600 mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>
              CPF/CNPJ <span className="text-red-500">*</span>
            </label>
            <input type="text" value={payerCpf} onChange={(e) => setPayerCpf(e.target.value)}
              placeholder="000.000.000-00"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all"
              style={{ fontSize: "0.85rem" }} />
          </div>
          <div>
            <label className="block text-gray-600 mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>Telefone</label>
            <input type="text" value={payerPhone} onChange={(e) => setPayerPhone(e.target.value)}
              placeholder="(11) 99999-9999"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all"
              style={{ fontSize: "0.85rem" }} />
          </div>
        </div>

        {/* Boleto address */}
        {chargeType === "boleto" && (
          <>
            <h4 className="text-gray-700 pt-2" style={{ fontSize: "0.9rem", fontWeight: 500 }}>Endereco (Boleto)</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-gray-600 mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>Rua</label>
                <input type="text" value={payerStreet} onChange={(e) => setPayerStreet(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all"
                  style={{ fontSize: "0.85rem" }} />
              </div>
              <div>
                <label className="block text-gray-600 mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>Numero</label>
                <input type="text" value={payerNumber} onChange={(e) => setPayerNumber(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all"
                  style={{ fontSize: "0.85rem" }} />
              </div>
              <div>
                <label className="block text-gray-600 mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>Bairro</label>
                <input type="text" value={payerDistrict} onChange={(e) => setPayerDistrict(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all"
                  style={{ fontSize: "0.85rem" }} />
              </div>
              <div>
                <label className="block text-gray-600 mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>Cidade</label>
                <input type="text" value={payerCity} onChange={(e) => setPayerCity(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all"
                  style={{ fontSize: "0.85rem" }} />
              </div>
              <div>
                <label className="block text-gray-600 mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>Estado</label>
                <input type="text" value={payerState} onChange={(e) => setPayerState(e.target.value)} maxLength={2}
                  placeholder="SP"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all"
                  style={{ fontSize: "0.85rem" }} />
              </div>
              <div>
                <label className="block text-gray-600 mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>CEP</label>
                <input type="text" value={payerZip} onChange={(e) => setPayerZip(e.target.value)}
                  placeholder="00000-000"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all"
                  style={{ fontSize: "0.85rem" }} />
              </div>
            </div>
          </>
        )}

        <h4 className="text-gray-700 pt-2" style={{ fontSize: "0.9rem", fontWeight: 500 }}>Item</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-1">
            <label className="block text-gray-600 mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>
              Descricao
            </label>
            <input type="text" value={itemDesc} onChange={(e) => setItemDesc(e.target.value)}
              placeholder="Descricao do item"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all"
              style={{ fontSize: "0.85rem" }} />
          </div>
          <div>
            <label className="block text-gray-600 mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>Quantidade</label>
            <input type="number" value={itemQty} onChange={(e) => setItemQty(e.target.value)} min="1"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all"
              style={{ fontSize: "0.85rem" }} />
          </div>
          <div>
            <label className="block text-gray-600 mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>
              Valor unitario (R$) <span className="text-red-500">*</span>
            </label>
            <input type="text" value={itemPrice} onChange={(e) => setItemPrice(e.target.value)}
              placeholder="99,90"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all"
              style={{ fontSize: "0.85rem" }} />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-red-600" style={{ fontSize: "0.82rem" }}>{error}</p>
          </div>
        )}

        {/* Create button */}
        <button
          onClick={handleCreate}
          disabled={creating}
          className={`flex items-center gap-2 px-6 py-3 rounded-lg text-white transition-colors disabled:opacity-50 ${
            chargeType === "pix" ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"
          }`}
          style={{ fontSize: "0.9rem", fontWeight: 500 }}
        >
          {creating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : chargeType === "pix" ? (
            <QrCode className="w-4 h-4" />
          ) : (
            <FileText className="w-4 h-4" />
          )}
          {creating ? "Criando..." : `Criar Cobranca ${chargeType === "pix" ? "PIX" : "Boleto"}`}
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className={`rounded-xl border-2 p-6 space-y-4 ${
          result.type === "pix" ? "bg-green-50 border-green-300" : "bg-blue-50 border-blue-300"
        }`}>
          <div className="flex items-center gap-2">
            <CheckCircle2 className={`w-5 h-5 ${result.type === "pix" ? "text-green-600" : "text-blue-600"}`} />
            <h3 className={result.type === "pix" ? "text-green-800" : "text-blue-800"} style={{ fontSize: "1rem", fontWeight: 600 }}>
              Cobranca criada com sucesso!
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-gray-500" style={{ fontSize: "0.72rem" }}>Transaction ID</p>
              <p className="text-gray-800 font-mono" style={{ fontSize: "0.82rem" }}>{result.transaction_id}</p>
            </div>
            <div>
              <p className="text-gray-500" style={{ fontSize: "0.72rem" }}>Valor</p>
              <p className="text-gray-800" style={{ fontSize: "0.82rem" }}>{formatCents(result.value_cents)}</p>
            </div>
            {result.due_date && (
              <div>
                <p className="text-gray-500" style={{ fontSize: "0.72rem" }}>Vencimento</p>
                <p className="text-gray-800" style={{ fontSize: "0.82rem" }}>{result.due_date}</p>
              </div>
            )}
          </div>

          {/* PIX QR Code */}
          {result.type === "pix" && result.qr_code_base64 && (
            <div className="flex flex-col items-center gap-3 bg-white rounded-xl p-6 border border-green-200">
              <p className="text-green-700" style={{ fontSize: "0.9rem", fontWeight: 500 }}>QR Code PIX</p>
              <img
                src={`data:image/png;base64,${result.qr_code_base64}`}
                alt="QR Code PIX"
                className="w-48 h-48 border border-gray-200 rounded-lg"
              />
              {result.emv && (
                <div className="w-full">
                  <p className="text-gray-500 text-center mb-2" style={{ fontSize: "0.75rem" }}>Codigo Copia e Cola:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-gray-50 border border-gray-200 rounded px-3 py-2 text-gray-700 break-all" style={{ fontSize: "0.72rem" }}>
                      {result.emv}
                    </code>
                    <button
                      onClick={() => copyToClipboard(result.emv)}
                      className="p-2 text-green-600 hover:bg-green-100 rounded-lg transition-colors shrink-0"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Boleto */}
          {result.type === "boleto" && result.bank_slip && (
            <div className="space-y-3 bg-white rounded-xl p-6 border border-blue-200">
              {result.bank_slip.digitable_line && (
                <div>
                  <p className="text-gray-500 mb-1" style={{ fontSize: "0.75rem" }}>Linha Digitavel:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-gray-50 border border-gray-200 rounded px-3 py-2 text-gray-700 break-all" style={{ fontSize: "0.75rem" }}>
                      {result.bank_slip.digitable_line}
                    </code>
                    <button
                      onClick={() => copyToClipboard(result.bank_slip.digitable_line)}
                      className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors shrink-0"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                {result.bank_slip.url_slip && (
                  <a
                    href={result.bank_slip.url_slip}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    style={{ fontSize: "0.82rem" }}
                  >
                    <ExternalLink className="w-4 h-4" />
                    Ver Boleto
                  </a>
                )}
                {result.bank_slip.url_slip_pdf && (
                  <a
                    href={result.bank_slip.url_slip_pdf}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                    style={{ fontSize: "0.82rem" }}
                  >
                    <FileText className="w-4 h-4" />
                    Baixar PDF
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}