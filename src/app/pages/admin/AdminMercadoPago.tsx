import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../services/supabaseClient";
import { getValidAdminToken } from "./adminAuth";
import * as api from "../../services/api";
import type { MercadoPagoConfig, MPPayment } from "../../services/api";
import { copyToClipboard } from "../../utils/clipboard";
import {
  Wallet,
  Save,
  Check,
  Loader2,
  Trash2,
  Eye,
  EyeOff,
  RefreshCw,
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
  Zap,
  Shield,
  Globe,
  Settings,
  CreditCard,
  ArrowRight,
  Info,
  TestTube2,
} from "lucide-react";

/* ===================================================
   Helpers
   =================================================== */

async function getToken(): Promise<string> {
  const token = await getValidAdminToken();
  if (!token) throw new Error("Sessão expirada. Faça login novamente.");
  return token;
}

function formatDate(ts: number | string | null | undefined): string {
  if (!ts) return "\u2014";
  const d = typeof ts === "number" ? new Date(ts) : new Date(ts);
  return d.toLocaleString("pt-BR");
}

function formatBRL(value: number | null | undefined): string {
  if (value == null) return "\u2014";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function mpStatusBadge(status: string) {
  const map: Record<string, { bg: string; text: string; icon: typeof CheckCircle2; label: string }> = {
    approved: { bg: "bg-green-100", text: "text-green-700", icon: CheckCircle2, label: "Aprovado" },
    pending: { bg: "bg-yellow-100", text: "text-yellow-700", icon: Clock, label: "Pendente" },
    authorized: { bg: "bg-blue-100", text: "text-blue-700", icon: Shield, label: "Autorizado" },
    in_process: { bg: "bg-blue-100", text: "text-blue-700", icon: RefreshCw, label: "Processando" },
    in_mediation: { bg: "bg-orange-100", text: "text-orange-700", icon: AlertCircle, label: "Em mediação" },
    rejected: { bg: "bg-red-100", text: "text-red-700", icon: XCircle, label: "Rejeitado" },
    cancelled: { bg: "bg-gray-100", text: "text-gray-700", icon: Ban, label: "Cancelado" },
    refunded: { bg: "bg-gray-100", text: "text-gray-600", icon: XCircle, label: "Reembolsado" },
    charged_back: { bg: "bg-red-100", text: "text-red-700", icon: Ban, label: "Chargeback" },
  };
  const s = map[status] || { bg: "bg-gray-100", text: "text-gray-600", icon: AlertCircle, label: status };
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${s.bg} ${s.text}`} style={{ fontSize: "0.75rem", fontWeight: 500 }}>
      <Icon className="w-3 h-3" />
      {s.label}
    </span>
  );
}

function paymentMethodLabel(method: string): string {
  const map: Record<string, string> = {
    credit_card: "Cartão de Crédito",
    debit_card: "Cartão de Débito",
    pix: "PIX",
    bolbradesco: "Boleto Bradesco",
    pec: "Pagamento em loteria",
    account_money: "Saldo MP",
  };
  return map[method] || method;
}

/* ===================================================
   Main Component
   =================================================== */

export function AdminMercadoPago() {
  const [activeSection, setActiveSection] = useState<"config" | "payments" | "webhooks">("config");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "1.25rem", fontWeight: 700 }}>
            <Wallet className="w-5 h-5 text-[#009ee3]" />
            Mercado Pago
          </h2>
          <p className="text-gray-400" style={{ fontSize: "0.85rem" }}>
            Integração com Mercado Pago para pagamentos via PIX, Cartão e Boleto
          </p>
        </div>
      </div>

      {/* Nav */}
      <div className="bg-white rounded-xl border border-gray-200 p-1.5 flex gap-1 overflow-x-auto">
        {([
          { id: "config" as const, label: "Configuração", icon: Settings },
          { id: "payments" as const, label: "Pagamentos", icon: CreditCard },
          { id: "webhooks" as const, label: "Webhooks & Info", icon: Globe },
        ]).map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveSection(item.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors whitespace-nowrap ${
              activeSection === item.id ? "bg-[#009ee3]/10 text-[#009ee3]" : "text-gray-600 hover:bg-gray-50"
            }`}
            style={{ fontSize: "0.85rem", fontWeight: activeSection === item.id ? 500 : 400 }}
          >
            <item.icon className="w-4 h-4 shrink-0" />
            {item.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeSection === "config" && <ConfigSection />}
      {activeSection === "payments" && <PaymentsSection />}
      {activeSection === "webhooks" && <WebhooksSection />}
    </div>
  );
}

/* ===================================================
   Config Section
   =================================================== */

function ConfigSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [config, setConfig] = useState<MercadoPagoConfig | null>(null);
  const [accessTokenInput, setAccessTokenInput] = useState("");
  const [publicKeyInput, setPublicKeyInput] = useState("");
  const [sandbox, setSandbox] = useState(false);
  const [showAccessToken, setShowAccessToken] = useState(false);
  const [showPublicKey, setShowPublicKey] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [testResult, setTestResult] = useState<any>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const tk = await getToken();
      const data = await api.getMercadoPagoConfig(tk);
      setConfig(data);
      if (data.sandbox) setSandbox(true);
    } catch (e: any) {
      console.error("[MercadoPago] Load config error:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!accessTokenInput.trim()) {
      setError("Access Token é obrigatório.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const tk = await getToken();
      await api.saveMercadoPagoConfig(tk, {
        accessToken: accessTokenInput.trim(),
        publicKey: publicKeyInput.trim(),
        sandbox,
      });
      setSuccess("Credenciais salvas com sucesso!");
      setAccessTokenInput("");
      setPublicKeyInput("");
      setTimeout(() => setSuccess(""), 3000);
      await loadConfig();
    } catch (e: any) {
      setError(e.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Tem certeza que deseja remover as credenciais do Mercado Pago?")) return;
    setDeleting(true);
    setError("");
    try {
      const tk = await getToken();
      await api.deleteMercadoPagoConfig(tk);
      setConfig({ configured: false });
      setTestResult(null);
      setSuccess("Credenciais removidas.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e: any) {
      setError(e.message || "Erro ao remover.");
    } finally {
      setDeleting(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setError("");
    setTestResult(null);
    try {
      const tk = await getToken();
      const result = await api.testMercadoPagoConnection(tk);
      setTestResult(result);
      if (!result.success) {
        setError(result.error || "Falha na conexão.");
      }
    } catch (e: any) {
      setError(e.message || "Erro ao testar.");
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 text-[#009ee3] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Status Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <h3 className="text-gray-800 pb-3 border-b border-gray-100" style={{ fontSize: "1rem", fontWeight: 600 }}>
          Credenciais Mercado Pago
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
                <p className="text-green-700" style={{ fontSize: "0.9rem", fontWeight: 500 }}>Mercado Pago Configurado</p>
                <p className="text-green-600" style={{ fontSize: "0.78rem" }}>
                  Access Token: {config.accessTokenPreview}
                  {config.hasPublicKey && " | Public Key: " + config.publicKeyPreview}
                  {config.sandbox && " | SANDBOX"}
                  {config.updatedAt && " | Atualizado: " + formatDate(config.updatedAt)}
                </p>
              </div>
            </>
          ) : (
            <>
              <AlertCircle className="w-5 h-5 text-yellow-600 shrink-0" />
              <div>
                <p className="text-yellow-700" style={{ fontSize: "0.9rem", fontWeight: 500 }}>Mercado Pago Não Configurado</p>
                <p className="text-yellow-600" style={{ fontSize: "0.78rem" }}>
                  Insira suas credenciais para habilitar pagamentos.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Help */}
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <p className="text-blue-700 mb-1" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
            Como obter suas credenciais
          </p>
          <ol className="text-blue-600 space-y-1 list-decimal list-inside" style={{ fontSize: "0.8rem" }}>
            <li>
              Acesse{" "}
              <a
                href="https://www.mercadopago.com.br/developers/panel/app"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-blue-800"
              >
                mercadopago.com.br/developers/panel
              </a>
            </li>
            <li>Crie uma aplicação ou selecione uma existente</li>
            <li>Copie o <strong>Access Token</strong> (produção ou teste) e a <strong>Public Key</strong></li>
            <li>Para testes, marque a opção <strong>Sandbox</strong> e use credenciais de teste</li>
          </ol>
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div>
            <label className="block text-gray-600 mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>
              Access Token <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showAccessToken ? "text" : "password"}
                value={accessTokenInput}
                onChange={(e) => setAccessTokenInput(e.target.value)}
                placeholder={config?.configured ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (já configurado)" : "APP_USR-xxxx..."}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-[#009ee3] focus:ring-2 focus:ring-[#009ee3]/20 transition-all pr-10"
                style={{ fontSize: "0.85rem" }}
              />
              <button
                type="button"
                onClick={() => setShowAccessToken(!showAccessToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showAccessToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-gray-600 mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>
              Public Key <span className="text-gray-400">(opcional, para Checkout Pro JS)</span>
            </label>
            <div className="relative">
              <input
                type={showPublicKey ? "text" : "password"}
                value={publicKeyInput}
                onChange={(e) => setPublicKeyInput(e.target.value)}
                placeholder={config?.configured && config?.hasPublicKey ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (já configurado)" : "APP_USR-xxxx..."}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-[#009ee3] focus:ring-2 focus:ring-[#009ee3]/20 transition-all pr-10"
                style={{ fontSize: "0.85rem" }}
              />
              <button
                type="button"
                onClick={() => setShowPublicKey(!showPublicKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPublicKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Sandbox toggle */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <button
              onClick={() => setSandbox(!sandbox)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                sandbox ? "bg-orange-500" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  sandbox ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            <div>
              <p className={sandbox ? "text-orange-700" : "text-gray-600"} style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                Modo Sandbox (Teste)
              </p>
              <p className="text-gray-400" style={{ fontSize: "0.72rem" }}>
                {sandbox
                  ? "Usando ambiente de TESTES. Pagamentos não serão reais."
                  : "Usando ambiente de PRODUÇÃO. Pagamentos serão reais."}
              </p>
            </div>
            {sandbox && (
              <span className="ml-auto bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full" style={{ fontSize: "0.7rem", fontWeight: 600 }}>
                SANDBOX
              </span>
            )}
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

        {/* Test result */}
        {testResult && (
          <div className={`rounded-lg border p-4 ${
            testResult.success ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
          }`}>
            <p className={testResult.success ? "text-green-700" : "text-red-700"} style={{ fontSize: "0.85rem", fontWeight: 600 }}>
              {testResult.success ? "Conexão bem-sucedida!" : "Falha na conexão"}
            </p>
            {testResult.success && testResult.user && (
              <div className="mt-2 space-y-1">
                <p className="text-green-600" style={{ fontSize: "0.8rem" }}>
                  <strong>ID:</strong> {testResult.user.id}
                </p>
                <p className="text-green-600" style={{ fontSize: "0.8rem" }}>
                  <strong>Nickname:</strong> {testResult.user.nickname}
                </p>
                <p className="text-green-600" style={{ fontSize: "0.8rem" }}>
                  <strong>Email:</strong> {testResult.user.email}
                </p>
                <p className="text-green-600" style={{ fontSize: "0.8rem" }}>
                  <strong>País:</strong> {testResult.user.siteId} ({testResult.user.countryId})
                </p>
              </div>
            )}
            {!testResult.success && testResult.detail && (
              <p className="text-red-600 mt-1" style={{ fontSize: "0.78rem" }}>{testResult.detail}</p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving || !accessTokenInput.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#009ee3] text-white rounded-lg hover:bg-[#007eb5] transition-colors disabled:opacity-50"
            style={{ fontSize: "0.85rem", fontWeight: 500 }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar Credenciais
          </button>

          {config?.configured && (
            <>
              <button
                onClick={handleTest}
                disabled={testing}
                className="flex items-center gap-2 px-4 py-2.5 border border-[#009ee3] text-[#009ee3] rounded-lg hover:bg-[#009ee3]/5 transition-colors disabled:opacity-50"
                style={{ fontSize: "0.85rem", fontWeight: 500 }}
              >
                {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube2 className="w-4 h-4" />}
                Testar Conexão
              </button>

              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 px-4 py-2.5 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                style={{ fontSize: "0.85rem", fontWeight: 500 }}
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Remover
              </button>
            </>
          )}
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            icon: CreditCard,
            title: "Cartão de Crédito",
            desc: "Até 12x sem juros (configurável). Aprovação instantânea.",
            color: "text-blue-600",
            bg: "bg-blue-50",
          },
          {
            icon: Zap,
            title: "PIX",
            desc: "Pagamento instantâneo 24h. Aprovação em segundos.",
            color: "text-green-600",
            bg: "bg-green-50",
          },
          {
            icon: FileText,
            title: "Boleto",
            desc: "Pagamento via boleto bancário. Até 3 dias úteis.",
            color: "text-orange-600",
            bg: "bg-orange-50",
          },
        ].map((item) => (
          <div key={item.title} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className={`w-10 h-10 ${item.bg} rounded-lg flex items-center justify-center mb-3`}>
              <item.icon className={`w-5 h-5 ${item.color}`} />
            </div>
            <p className="text-gray-800" style={{ fontSize: "0.9rem", fontWeight: 600 }}>{item.title}</p>
            <p className="text-gray-400 mt-1" style={{ fontSize: "0.78rem" }}>{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===================================================
   Payments Section
   =================================================== */

function PaymentsSection() {
  const [loading, setLoading] = useState(true);
  const [notConfigured, setNotConfigured] = useState(false);
  const [payments, setPayments] = useState<MPPayment[]>([]);
  const [filter, setFilter] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [refreshingId, setRefreshingId] = useState<number | null>(null);
  const [total, setTotal] = useState(0);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setNotConfigured(false);
    try {
      const tk = await getToken();

      // First check if MP is configured before searching
      const cfg = await api.getMercadoPagoConfig(tk);
      if (!cfg.configured) {
        setNotConfigured(true);
        setPayments([]);
        setTotal(0);
        return;
      }

      const filters: any = { limit: 50 };
      if (filterStatus !== "all") filters.status = filterStatus;
      const data = await api.searchMPPayments(tk, filters);
      setPayments(data.payments || []);
      setTotal(data.total || 0);
    } catch (e: any) {
      const msg = e.message || "";
      if (msg.includes("não configurado")) {
        setNotConfigured(true);
        setPayments([]);
        setTotal(0);
      } else {
        console.error("[MercadoPago] Load payments error:", e);
      }
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const refreshPayment = async (paymentId: number) => {
    setRefreshingId(paymentId);
    try {
      await api.getMPPaymentStatus(paymentId);
      await loadPayments();
    } catch (e: any) {
      console.error("Refresh error:", e);
    } finally {
      setRefreshingId(null);
    }
  };

  const filtered = payments.filter((p) => {
    if (!p) return false;
    if (filter) {
      const q = filter.toLowerCase();
      return (
        String(p.id).includes(q) ||
        p.external_reference?.toLowerCase().includes(q) ||
        p.payer_email?.toLowerCase().includes(q) ||
        p.payer_name?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 text-[#009ee3] animate-spin" />
      </div>
    );
  }

  if (notConfigured) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <AlertCircle className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
        <p className="text-gray-700 mb-1" style={{ fontSize: "1rem", fontWeight: 600 }}>
          Mercado Pago não configurado
        </p>
        <p className="text-gray-400" style={{ fontSize: "0.85rem" }}>
          Configure suas credenciais na aba <strong>Configuração</strong> para visualizar pagamentos.
        </p>
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
              placeholder="Buscar por ID, referência, email..."
              className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50 outline-none focus:border-[#009ee3] transition-all"
              style={{ fontSize: "0.85rem" }}
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-[#009ee3] transition-all"
            style={{ fontSize: "0.85rem" }}
          >
            <option value="all">Status: Todos</option>
            <option value="approved">Aprovado</option>
            <option value="pending">Pendente</option>
            <option value="in_process">Processando</option>
            <option value="rejected">Rejeitado</option>
            <option value="cancelled">Cancelado</option>
            <option value="refunded">Reembolsado</option>
          </select>
          <button
            onClick={loadPayments}
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
          { label: "Total", value: total, color: "text-gray-700", bg: "bg-gray-50" },
          { label: "Aprovados", value: payments.filter(p => p.status === "approved").length, color: "text-green-700", bg: "bg-green-50" },
          { label: "Pendentes", value: payments.filter(p => p.status === "pending" || p.status === "in_process").length, color: "text-yellow-700", bg: "bg-yellow-50" },
          { label: "Rejeitados", value: payments.filter(p => p.status === "rejected" || p.status === "cancelled").length, color: "text-red-700", bg: "bg-red-50" },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} rounded-xl border border-gray-200 p-4`}>
            <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>{s.label}</p>
            <p className={s.color} style={{ fontSize: "1.5rem", fontWeight: 700 }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Payments list */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <CreditCard className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500" style={{ fontSize: "0.9rem" }}>
            {payments.length === 0
              ? "Nenhum pagamento encontrado. Os pagamentos aparecerão aqui quando o Mercado Pago estiver integrado ao checkout."
              : "Nenhum pagamento encontrado com os filtros aplicados."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Row */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
              >
                <div className="shrink-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    p.status === "approved" ? "bg-green-100" : p.status === "pending" ? "bg-yellow-100" : "bg-gray-100"
                  }`}>
                    <CreditCard className={`w-4 h-4 ${
                      p.status === "approved" ? "text-green-700" : p.status === "pending" ? "text-yellow-700" : "text-gray-500"
                    }`} />
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-800 truncate" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                      #{p.id}
                    </span>
                    <span className="text-gray-400 uppercase" style={{ fontSize: "0.7rem", fontWeight: 500 }}>
                      {paymentMethodLabel(p.payment_method)}
                    </span>
                    {mpStatusBadge(p.status)}
                  </div>
                  <p className="text-gray-400 truncate" style={{ fontSize: "0.75rem" }}>
                    {p.payer_name?.trim() || p.payer_email || "\u2014"} &bull; {formatDate(p.date_created)}
                    {p.external_reference && (" | Ref: " + p.external_reference)}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <p className="text-gray-800" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                    {formatBRL(p.transaction_amount)}
                  </p>
                </div>

                <div className="shrink-0 text-gray-400">
                  {expandedId === p.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </div>

              {/* Expanded */}
              {expandedId === p.id && (
                <div className="border-t border-gray-100 px-4 py-4 bg-gray-50 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <p className="text-gray-500" style={{ fontSize: "0.72rem" }}>Payment ID</p>
                      <p className="text-gray-800 font-mono" style={{ fontSize: "0.82rem" }}>{p.id}</p>
                    </div>
                    <div>
                      <p className="text-gray-500" style={{ fontSize: "0.72rem" }}>Referência Externa</p>
                      <p className="text-gray-800" style={{ fontSize: "0.82rem" }}>{p.external_reference || "\u2014"}</p>
                    </div>
                    <div>
                      <p className="text-gray-500" style={{ fontSize: "0.72rem" }}>Pagador</p>
                      <p className="text-gray-800" style={{ fontSize: "0.82rem" }}>{p.payer_name?.trim() || "\u2014"}</p>
                      <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>{p.payer_email}</p>
                    </div>
                    <div>
                      <p className="text-gray-500" style={{ fontSize: "0.72rem" }}>Método</p>
                      <p className="text-gray-800" style={{ fontSize: "0.82rem" }}>{paymentMethodLabel(p.payment_method)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500" style={{ fontSize: "0.72rem" }}>Data Criação</p>
                      <p className="text-gray-800" style={{ fontSize: "0.82rem" }}>{formatDate(p.date_created)}</p>
                    </div>
                    {p.date_approved && (
                      <div>
                        <p className="text-gray-500" style={{ fontSize: "0.72rem" }}>Data Aprovação</p>
                        <p className="text-green-700" style={{ fontSize: "0.82rem" }}>{formatDate(p.date_approved)}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-gray-500" style={{ fontSize: "0.72rem" }}>Status Detalhe</p>
                      <p className="text-gray-800" style={{ fontSize: "0.82rem" }}>{p.status_detail || "\u2014"}</p>
                    </div>
                    <div>
                      <p className="text-gray-500" style={{ fontSize: "0.72rem" }}>Descrição</p>
                      <p className="text-gray-800" style={{ fontSize: "0.82rem" }}>{p.description || "\u2014"}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => refreshPayment(p.id)}
                      disabled={refreshingId === p.id}
                      className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg hover:bg-white transition-colors text-gray-600"
                      style={{ fontSize: "0.8rem" }}
                    >
                      {refreshingId === p.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      Atualizar Status
                    </button>
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

/* ===================================================
   Webhooks & Info Section
   =================================================== */

function WebhooksSection() {
  const webhookUrl = "https://aztdgagxvrlylszieujs.supabase.co/functions/v1/make-server-b7b07654/mercadopago/webhook";

  return (
    <div className="space-y-5">
      {/* Webhook URL */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h3 className="text-gray-800 pb-3 border-b border-gray-100" style={{ fontSize: "1rem", fontWeight: 600 }}>
          Webhook (IPN - Notificações Instantâneas)
        </h3>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-700 mb-1" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
            URL de Notificação (Webhook)
          </p>
          <p className="text-blue-600 mb-3" style={{ fontSize: "0.78rem" }}>
            Configure esta URL nas notificações da sua aplicação no painel do Mercado Pago para receber
            atualizações automáticas de pagamento:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-white border border-blue-200 rounded px-3 py-2 text-blue-800 break-all" style={{ fontSize: "0.78rem" }}>
              {webhookUrl}
            </code>
            <button
              onClick={() => copyToClipboard(webhookUrl)}
              className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors shrink-0"
              title="Copiar URL"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex gap-2">
            <AlertCircle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-yellow-700" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                Como configurar
              </p>
              <ol className="text-yellow-600 space-y-1 list-decimal list-inside mt-1" style={{ fontSize: "0.8rem" }}>
                <li>
                  Acesse{" "}
                  <a
                    href="https://www.mercadopago.com.br/developers/panel/app"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-yellow-800"
                  >
                    Painel do Desenvolvedor
                  </a>
                </li>
                <li>Selecione sua aplicação</li>
                <li>Vá em <strong>Webhooks</strong> {">"} <strong>Configurar notificações</strong></li>
                <li>Cole a URL acima no campo de URL de produção</li>
                <li>Selecione o evento <strong>Payments</strong></li>
                <li>Salve as configurações</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h3 className="text-gray-800 pb-3 border-b border-gray-100" style={{ fontSize: "1rem", fontWeight: 600 }}>
          Como funciona a integração
        </h3>

        <div className="space-y-3">
          {[
            {
              step: "1",
              title: "Checkout Pro (Redirect)",
              desc: "O cliente é redirecionado para a página do Mercado Pago onde pode pagar com cartão, PIX, boleto, etc. Após o pagamento, volta para a loja.",
              color: "bg-[#009ee3]",
            },
            {
              step: "2",
              title: "Preferência de Pagamento",
              desc: "O backend cria uma 'preferência' via API com os itens, valor e dados do comprador. O Mercado Pago retorna um link de pagamento.",
              color: "bg-[#009ee3]",
            },
            {
              step: "3",
              title: "Webhook IPN",
              desc: "Quando o pagamento é confirmado/rejeitado, o Mercado Pago envia uma notificação ao webhook. O sistema atualiza automaticamente o status do pedido.",
              color: "bg-[#009ee3]",
            },
            {
              step: "4",
              title: "Reconciliação",
              desc: "Pagamentos aprovados são vinculados ao pedido via external_reference. O status do pedido muda para 'Pago' automaticamente.",
              color: "bg-green-500",
            },
          ].map((item) => (
            <div key={item.step} className="flex items-start gap-3">
              <div className={`w-7 h-7 ${item.color} rounded-full flex items-center justify-center text-white shrink-0`} style={{ fontSize: "0.75rem", fontWeight: 700 }}>
                {item.step}
              </div>
              <div>
                <p className="text-gray-800" style={{ fontSize: "0.85rem", fontWeight: 600 }}>{item.title}</p>
                <p className="text-gray-500" style={{ fontSize: "0.78rem" }}>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Supported methods */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-gray-800 pb-3 border-b border-gray-100 mb-4" style={{ fontSize: "1rem", fontWeight: 600 }}>
          Meios de Pagamento Suportados
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {[
            { name: "PIX", icon: Zap, color: "text-green-600", bg: "bg-green-50" },
            { name: "Visa", icon: CreditCard, color: "text-blue-600", bg: "bg-blue-50" },
            { name: "Mastercard", icon: CreditCard, color: "text-orange-600", bg: "bg-orange-50" },
            { name: "Elo", icon: CreditCard, color: "text-gray-600", bg: "bg-gray-50" },
            { name: "American Express", icon: CreditCard, color: "text-blue-700", bg: "bg-blue-50" },
            { name: "Hipercard", icon: CreditCard, color: "text-red-600", bg: "bg-red-50" },
            { name: "Boleto", icon: FileText, color: "text-gray-700", bg: "bg-gray-50" },
            { name: "Saldo MP", icon: Wallet, color: "text-[#009ee3]", bg: "bg-[#009ee3]/10" },
          ].map((m) => (
            <div key={m.name} className={`${m.bg} rounded-lg p-3 flex items-center gap-2`}>
              <m.icon className={`w-4 h-4 ${m.color}`} />
              <span className="text-gray-700" style={{ fontSize: "0.8rem", fontWeight: 500 }}>{m.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Links */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-gray-800 pb-3 border-b border-gray-100 mb-4" style={{ fontSize: "1rem", fontWeight: 600 }}>
          Links Úteis
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { label: "Documentação API", url: "https://www.mercadopago.com.br/developers/pt/docs" },
            { label: "Painel do Desenvolvedor", url: "https://www.mercadopago.com.br/developers/panel/app" },
            { label: "Credenciais", url: "https://www.mercadopago.com.br/developers/panel/app" },
            { label: "Referência API", url: "https://www.mercadopago.com.br/developers/pt/reference" },
          ].map((link) => (
            <a
              key={link.label}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200 hover:border-[#009ee3] hover:bg-[#009ee3]/5 transition-all group"
            >
              <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-[#009ee3]" />
              <span className="text-gray-700 group-hover:text-[#009ee3]" style={{ fontSize: "0.85rem" }}>{link.label}</span>
              <ArrowRight className="w-3 h-3 text-gray-300 group-hover:text-[#009ee3] ml-auto" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}