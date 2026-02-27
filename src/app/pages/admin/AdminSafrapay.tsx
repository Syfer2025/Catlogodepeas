import { useState, useEffect } from "react";
import { supabase } from "../../services/supabaseClient";
import { getValidAdminToken } from "./adminAuth";
import {
  CreditCard,
  Save,
  Loader2,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Shield,
  Settings,
  Zap,
  Info,
  KeyRound,
  ExternalLink,
  PlugZap,
} from "lucide-react";

async function getToken(): Promise<string> {
  const token = await getValidAdminToken();
  if (!token) throw new Error("Sessao expirada. Faca login novamente.");
  return token;
}

interface SafrapayConfig {
  configured: boolean;
  sandbox: boolean;
  merchantId: string | null;
  hasToken: boolean;
  maxInstallments: number;
  minInstallmentValue: number;
  softDescriptor: string;
  enabled: boolean;
}

import { projectId, publicAnonKey } from "/utils/supabase/info";
const BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-b7b07654`;

export function AdminSafrapay() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [hasToken, setHasToken] = useState(false);

  const [merchantToken, setMerchantToken] = useState("");
  const [merchantId, setMerchantId] = useState("");
  const [sandbox, setSandbox] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [maxInstallments, setMaxInstallments] = useState(12);
  const [minInstallmentValue, setMinInstallmentValue] = useState(500);
  const [softDescriptor, setSoftDescriptor] = useState("CARRETAO");

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    setLoading(true);
    try {
      const token = await getToken();
      const url = BASE_URL + "/safrapay/config?_ut=" + encodeURIComponent(token);
      const res = await fetch(url, {
        headers: { Authorization: "Bearer " + publicAnonKey },
      });
      const data: SafrapayConfig = await res.json();
      if (data.merchantId) setMerchantId(data.merchantId);
      setSandbox(data.sandbox);
      setEnabled(data.enabled);
      setMaxInstallments(data.maxInstallments || 12);
      setMinInstallmentValue(data.minInstallmentValue || 500);
      setSoftDescriptor(data.softDescriptor || "CARRETAO");
      setHasToken(data.hasToken);
    } catch (e) {
      console.error("Load SafraPay config error:", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    try {
      const token = await getToken();
      const url = BASE_URL + "/safrapay/config?_ut=" + encodeURIComponent(token);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + publicAnonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          merchantToken,
          merchantId,
          sandbox,
          enabled,
          maxInstallments,
          minInstallmentValue,
          softDescriptor,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMsg({ type: "ok", text: "Configuracao salva com sucesso!" });
        setMerchantToken("");
        setHasToken(true);
        loadConfig();
      } else {
        setMsg({ type: "err", text: data.error || "Erro ao salvar." });
      }
    } catch (e: any) {
      setMsg({ type: "err", text: e.message || "Erro ao salvar." });
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestMsg(null);
    try {
      const token = await getToken();
      const url = BASE_URL + "/safrapay/test-auth?_ut=" + encodeURIComponent(token);
      const res = await fetch(url, {
        headers: { Authorization: "Bearer " + publicAnonKey },
      });
      const data = await res.json();
      if (data.success) {
        setTestMsg({ type: "ok", text: "Conexao OK! Autenticacao no gateway SafraPay bem-sucedida." });
      } else {
        setTestMsg({ type: "err", text: data.error || "Falha ao testar conexao." });
        console.error("[SafraPay Test] Error:", data);
      }
    } catch (e: any) {
      setTestMsg({ type: "err", text: e.message || "Erro ao testar conexao." });
      console.error("[SafraPay Test] Exception:", e);
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const portalUrl = sandbox ? "https://portal-hml.safrapay.com.br" : "https://portal.safrapay.com.br";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="bg-orange-100 rounded-xl p-2.5">
          <CreditCard className="w-6 h-6 text-orange-600" />
        </div>
        <div>
          <h2 className="text-gray-800" style={{ fontSize: "1.3rem", fontWeight: 700 }}>
            SafraPay
          </h2>
          <p className="text-gray-400" style={{ fontSize: "0.82rem" }}>
            Gateway de pagamento com cartao de credito
          </p>
        </div>
      </div>

      {/* Status */}
      <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border ${hasToken && enabled ? "bg-green-50 border-green-200" : !hasToken ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-200"}`}>
        {hasToken && enabled ? (
          <CheckCircle2 className="w-5 h-5 text-green-600" />
        ) : !hasToken ? (
          <AlertCircle className="w-5 h-5 text-amber-500" />
        ) : (
          <AlertCircle className="w-5 h-5 text-gray-400" />
        )}
        <span className={hasToken && enabled ? "text-green-700" : !hasToken ? "text-amber-700" : "text-gray-500"} style={{ fontSize: "0.88rem", fontWeight: 600 }}>
          {!hasToken ? "MerchantToken nao configurado" : enabled ? "Cartao de credito ativado" : "Cartao de credito desativado"}
        </span>
        {sandbox && hasToken && (
          <span className="ml-auto bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full" style={{ fontSize: "0.72rem", fontWeight: 600 }}>
            SANDBOX
          </span>
        )}
      </div>

      {/* Setup Guide — shown when no token */}
      {!hasToken && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="bg-amber-100 rounded-lg p-2">
              <KeyRound className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="text-amber-800" style={{ fontSize: "1rem", fontWeight: 700 }}>
                Como configurar
              </h3>
              <p className="text-amber-600" style={{ fontSize: "0.78rem" }}>
                Voce precisa do MerchantToken (Chave de Acesso) do portal SafraPay.
              </p>
            </div>
          </div>
          <div className="bg-white rounded-lg p-4 border border-amber-200 space-y-3">
            <p className="text-gray-700" style={{ fontSize: "0.85rem", fontWeight: 600 }}>Passo a passo:</p>
            <ol className="list-decimal list-inside space-y-2 text-gray-600" style={{ fontSize: "0.82rem" }}>
              <li>Acesse o <a href={portalUrl} target="_blank" rel="noopener noreferrer" className="text-amber-700 underline font-semibold inline-flex items-center gap-1">Portal SafraPay <ExternalLink className="w-3 h-3 inline" /></a></li>
              <li>Faca login com suas credenciais ou ative sua conta com o Codigo de Ativacao</li>
              <li>Va em <strong>Configuracoes &rarr; Chaves de Acesso</strong></li>
              <li>Copie o <strong>MerchantToken</strong> (ex: <code className="bg-amber-100 px-1.5 py-0.5 rounded text-xs">mk_g5DrKCDsDkuF1iLPnDWomA</code>)</li>
              <li>Cole no campo <strong>"Merchant Token"</strong> abaixo e clique <strong>Salvar</strong></li>
            </ol>
          </div>
          <a
            href={portalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-5 py-2.5 rounded-lg transition-colors font-semibold"
            style={{ fontSize: "0.9rem" }}
          >
            <ExternalLink className="w-4 h-4" />
            Abrir Portal SafraPay
          </a>
        </div>
      )}

      {/* Config Form */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {/* Enabled toggle */}
        <div className="px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-orange-500" />
            <span className="text-gray-700" style={{ fontSize: "0.88rem", fontWeight: 600 }}>
              Ativar pagamento com cartao
            </span>
          </div>
          <button
            onClick={() => setEnabled(!enabled)}
            className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${enabled ? "bg-orange-500" : "bg-gray-300"}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? "translate-x-5" : ""}`} />
          </button>
        </div>

        {/* Sandbox toggle */}
        <div className="px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-yellow-500" />
            <span className="text-gray-700" style={{ fontSize: "0.88rem", fontWeight: 600 }}>
              Modo Sandbox (homologacao)
            </span>
          </div>
          <button
            onClick={() => setSandbox(!sandbox)}
            className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${sandbox ? "bg-yellow-500" : "bg-gray-300"}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${sandbox ? "translate-x-5" : ""}`} />
          </button>
        </div>

        {/* Merchant Token — highlighted when empty */}
        <div className={`px-5 py-4 ${!hasToken ? "bg-amber-50" : ""}`}>
          <label className="text-gray-600 block mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 500 }}>
            Merchant Token (Chave de Acesso) {!hasToken && <span className="text-amber-600 font-bold">*</span>}
          </label>
          <div className="relative">
            <input
              type={showToken ? "text" : "password"}
              value={merchantToken}
              onChange={(e) => setMerchantToken(e.target.value)}
              placeholder={hasToken ? "Ja configurado. Cole um novo para substituir." : "Cole o MerchantToken aqui (ex: mk_xxxxx)"}
              className={`w-full px-4 py-2.5 bg-white border rounded-lg text-gray-700 focus:outline-none focus:ring-2 transition-all pr-10 ${!hasToken ? "border-amber-300 focus:ring-amber-200 focus:border-amber-400" : "border-gray-200 focus:ring-orange-200 focus:border-orange-300"}`}
              style={{ fontSize: "0.88rem" }}
            />
            <button
              onClick={() => setShowToken(!showToken)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-gray-400 mt-1" style={{ fontSize: "0.72rem" }}>
            {hasToken
              ? "Token ja salvo. Deixe em branco para manter o atual."
              : "Obtenha no Portal SafraPay > Configuracoes > Chaves de Acesso."}
          </p>
        </div>

        {/* Merchant ID */}
        <div className="px-5 py-4">
          <label className="text-gray-600 block mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 500 }}>
            Merchant ID
          </label>
          <input
            type="text"
            value={merchantId}
            onChange={(e) => setMerchantId(e.target.value)}
            placeholder="ID do estabelecimento (GUID)"
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300 transition-all"
            style={{ fontSize: "0.88rem" }}
          />
        </div>

        {/* Soft Descriptor */}
        <div className="px-5 py-4">
          <label className="text-gray-600 block mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 500 }}>
            Soft Descriptor (nome na fatura do cartao)
          </label>
          <input
            type="text"
            value={softDescriptor}
            onChange={(e) => setSoftDescriptor(e.target.value.toUpperCase().slice(0, 13))}
            placeholder="CARRETAO"
            maxLength={13}
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300 transition-all uppercase"
            style={{ fontSize: "0.88rem" }}
          />
          <p className="text-gray-400 mt-1" style={{ fontSize: "0.72rem" }}>
            Maximo 13 caracteres. Aparece na fatura do cliente.
          </p>
        </div>

        {/* Installment settings */}
        <div className="px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <Settings className="w-4 h-4 text-gray-500" />
            <span className="text-gray-700" style={{ fontSize: "0.88rem", fontWeight: 600 }}>
              Configuracoes de Parcelamento
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-gray-600 block mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 500 }}>
                Maximo de parcelas
              </label>
              <select
                value={maxInstallments}
                onChange={(e) => setMaxInstallments(Number(e.target.value))}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300 transition-all"
                style={{ fontSize: "0.88rem" }}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                  <option key={n} value={n}>{n}x</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-gray-600 block mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 500 }}>
                Valor minimo por parcela
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" style={{ fontSize: "0.85rem" }}>R$</span>
                <input
                  type="number"
                  value={(minInstallmentValue / 100).toFixed(2)}
                  onChange={(e) => setMinInstallmentValue(Math.round(Number(e.target.value) * 100))}
                  min={1}
                  step={0.01}
                  className="w-full pl-10 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300 transition-all"
                  style={{ fontSize: "0.88rem" }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Test connection button */}
      {hasToken && (
        <div className="space-y-3">
          <button
            onClick={handleTestConnection}
            disabled={testing}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50 cursor-pointer font-semibold"
            style={{ fontSize: "0.9rem" }}
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}
            {testing ? "Testando..." : "Testar Conexao com SafraPay"}
          </button>
          {testMsg && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border ${testMsg.type === "ok" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`} style={{ fontSize: "0.88rem" }}>
              {testMsg.type === "ok" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>{testMsg.text}</span>
            </div>
          )}
        </div>
      )}

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
        <div className="text-blue-700" style={{ fontSize: "0.82rem" }}>
          <p className="font-semibold mb-1">Informacoes importantes:</p>
          <ul className="list-disc list-inside space-y-1 text-blue-600">
            <li>O MerchantToken (Chave de Acesso) e usado para autenticar no gateway via <code className="bg-blue-100 px-1 rounded text-xs">POST /v2/merchant/auth</code>.</li>
            <li>O gateway retorna um JWT (accessToken) valido por 30 minutos, renovado automaticamente.</li>
            <li>Bandeiras aceitas: Visa, Mastercard, Amex, Elo, Hipercard.</li>
            <li>No sandbox, use centavos <code className="bg-blue-100 px-1 rounded text-xs">,00</code> para aprovar e <code className="bg-blue-100 px-1 rounded text-xs">,01</code> para negar.</li>
            <li>URL do webhook: <code className="bg-blue-100 px-1 rounded text-xs">{BASE_URL}/safrapay/webhook</code></li>
          </ul>
        </div>
      </div>

      {/* Messages */}
      {msg && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border ${msg.type === "ok" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`} style={{ fontSize: "0.88rem" }}>
          {msg.type === "ok" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {msg.text}
        </div>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-xl transition-colors disabled:opacity-50 cursor-pointer shadow-lg shadow-orange-200"
        style={{ fontSize: "0.95rem", fontWeight: 700 }}
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? "Salvando..." : "Salvar Configuracao"}
      </button>
    </div>
  );
}
