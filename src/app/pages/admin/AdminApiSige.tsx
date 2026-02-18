import { useState, useEffect, useCallback } from "react";
import {
  Plug,
  CheckCircle2,
  XCircle,
  Loader2,
  Globe,
  Shield,
  Key,
  Clock,
  Zap,
  RefreshCw,
  Eye,
  EyeOff,
  Save,
  Wifi,
  WifiOff,
  AlertTriangle,
  LogIn,
  LogOut,
  ChevronDown,
  ChevronRight,
  Lock,
  Mail,
  Link2,
  Users,
  UserPlus,
  Play,
  User,
  KeyRound,
  Hash,
} from "lucide-react";
import { supabase } from "../../services/supabaseClient";
import * as api from "../../services/api";
import { SigeDepModule } from "./SigeDepModule";
import { SigeCategoryModule } from "./SigeCategoryModule";
import { SigeCustomerModule } from "./SigeCustomerModule";
import { SigeCustomerAddressModule } from "./SigeCustomerAddressModule";
import { SigeCustomerComplementModule } from "./SigeCustomerComplementModule";
import { SigeCustomerContactModule } from "./SigeCustomerContactModule";
import { SigeProductModule } from "./SigeProductModule";
import { SigeProductBalanceModule } from "./SigeProductBalanceModule";
import { SigeProductPcpModule } from "./SigeProductPcpModule";
import { SigeProductPromotionModule } from "./SigeProductPromotionModule";
import { SigeProductReferenceModule } from "./SigeProductReferenceModule";
import { SigeProductTechnicalSheetModule } from "./SigeProductTechnicalSheetModule";
import { SigeProductPriceModule } from "./SigeProductPriceModule";
import { SigeOrderModule } from "./SigeOrderModule";
import { SigeOrderObservationModule } from "./SigeOrderObservationModule";
import { SigeOrderInstallmentModule } from "./SigeOrderInstallmentModule";
import { SigeOrderItemsModule } from "./SigeOrderItemsModule";
import { SigeOrderItemsTextModule } from "./SigeOrderItemsTextModule";
import { SigeTestRunner } from "./SigeTestRunner";
import { SigeStockExplorer } from "./SigeStockExplorer";

interface SigeStatus {
  configured: boolean;
  baseUrl?: string;
  email?: string;
  hasPassword?: boolean;
  hasToken: boolean;
  hasRefreshToken?: boolean;
  expired: boolean;
  createdAt?: string;
  expiresAt?: string;
  expiresInMs?: number;
}

export function AdminApiSige() {
  // Config form
  const [baseUrl, setBaseUrl] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Status
  const [status, setStatus] = useState<SigeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // UI
  const [showDocs, setShowDocs] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({ login: false, usuarios: false });

  // ─── Test: POST /user/create ───
  const [testCreateName, setTestCreateName] = useState("");
  const [testCreateEmail, setTestCreateEmail] = useState("");
  const [testCreatePassword, setTestCreatePassword] = useState("");
  const [testCreateShowPw, setTestCreateShowPw] = useState(false);
  const [testingCreate, setTestingCreate] = useState(false);
  const [createResult, setCreateResult] = useState<any>(null);
  const [createError, setCreateError] = useState("");

  // ─── Register: POST /user/register (sem JWT) ───
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regShowPw, setRegShowPw] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [regResult, setRegResult] = useState<any>(null);
  const [regError, setRegError] = useState("");

  // ─── Test: GET /user/me ───
  const [testingUserMe, setTestingUserMe] = useState(false);
  const [userMeResult, setUserMeResult] = useState<any>(null);
  const [userMeError, setUserMeError] = useState("");

  // ─── Test: PATCH /user/reset/{id} ───
  const [testResetId, setTestResetId] = useState("");
  const [testResetOldPw, setTestResetOldPw] = useState("");
  const [testResetNewPw, setTestResetNewPw] = useState("");
  const [testResetShowPw, setTestResetShowPw] = useState(false);
  const [testingReset, setTestingReset] = useState(false);
  const [resetResult, setResetResult] = useState<any>(null);
  const [resetError, setResetError] = useState("");

  const getAccessToken = useCallback(async (): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Sessao expirada");
    return session.access_token;
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const st = await api.sigeGetStatus(token);
      setStatus(st);
      if (st.baseUrl) setBaseUrl(st.baseUrl);
      if (st.email) setEmail(st.email);
    } catch (e: any) {
      console.log("[SIGE] Status error:", e.message);
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  useEffect(() => {
    if (!status?.hasToken || status.expired) return;
    const interval = setInterval(loadStatus, 60000);
    return () => clearInterval(interval);
  }, [status?.hasToken, status?.expired, loadStatus]);

  const handleSaveConfig = async () => {
    if (!baseUrl.trim() || !email.trim() || !password.trim()) {
      setError("Preencha todos os campos obrigatorios.");
      return;
    }
    setSaving(true); setError(""); setSuccess("");
    try {
      const token = await getAccessToken();
      await api.sigeSaveConfig(token, { baseUrl: baseUrl.trim(), email: email.trim(), password });
      setSuccess("Configuracao salva com sucesso!");
      setPassword("");
      await loadStatus();
    } catch (e: any) { setError(e.message || "Erro ao salvar."); }
    finally { setSaving(false); }
  };

  const handleConnect = async () => {
    setConnecting(true); setError(""); setSuccess("");
    try {
      const token = await getAccessToken();
      // Auto-save config before connecting if fields are filled
      if (baseUrl.trim() && email.trim() && password.trim()) {
        await api.sigeSaveConfig(token, { baseUrl: baseUrl.trim(), email: email.trim(), password });
        console.log("[SIGE] Config auto-saved before connect");
      }
      const result = await api.sigeConnect(token);
      if (result.connected) {
        setSuccess(`Conectado! Token ${result.hasToken ? "recebido" : "nao recebido"}. Chaves: ${result.responseKeys.join(", ")}`);
        setPassword(""); // Clear password after successful connect
      }
      await loadStatus();
    } catch (e: any) { setError(e.message || "Erro ao conectar."); }
    finally { setConnecting(false); }
  };

  const handleRefreshToken = async () => {
    setRefreshing(true); setError(""); setSuccess("");
    try {
      const token = await getAccessToken();
      const result = await api.sigeRefreshToken(token);
      if (result.refreshed) setSuccess("Token renovado com sucesso!");
      await loadStatus();
    } catch (e: any) { setError(e.message || "Erro ao renovar token."); }
    finally { setRefreshing(false); }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true); setError(""); setSuccess("");
    try {
      const token = await getAccessToken();
      await api.sigeDisconnect(token);
      setSuccess("Desconectado do SIGE.");
      await loadStatus();
    } catch (e: any) { setError(e.message || "Erro ao desconectar."); }
    finally { setDisconnecting(false); }
  };

  // ─── Test handlers ───

  const handleTestUserCreate = async () => {
    if (!testCreateName.trim() || !testCreateEmail.trim() || !testCreatePassword.trim()) {
      setCreateError("Preencha todos os campos.");
      return;
    }
    setTestingCreate(true); setCreateResult(null); setCreateError("");
    try {
      const token = await getAccessToken();
      const result = await api.sigeUserCreate(token, {
        name: testCreateName.trim(),
        email: testCreateEmail.trim(),
        password: testCreatePassword,
      });
      setCreateResult(result);
      console.log("[SIGE] POST /user/create result:", result);
    } catch (e: any) {
      setCreateError(e.message || "Erro ao criar usuario.");
      console.log("[SIGE] POST /user/create error:", e.message);
    } finally { setTestingCreate(false); }
  };

  const handleTestUserMe = async () => {
    setTestingUserMe(true); setUserMeResult(null); setUserMeError("");
    try {
      const token = await getAccessToken();
      const result = await api.sigeUserMe(token);
      setUserMeResult(result);
      console.log("[SIGE] GET /user/me result:", result);
    } catch (e: any) {
      setUserMeError(e.message || "Erro ao buscar usuario.");
      console.log("[SIGE] GET /user/me error:", e.message);
    } finally { setTestingUserMe(false); }
  };

  const handleTestResetPassword = async () => {
    if (!testResetId.trim() || !testResetOldPw.trim() || !testResetNewPw.trim()) {
      setResetError("Preencha todos os campos.");
      return;
    }
    setTestingReset(true); setResetResult(null); setResetError("");
    try {
      const token = await getAccessToken();
      const result = await api.sigeUserResetPassword(token, testResetId.trim(), {
        password: testResetOldPw,
        newPassword: testResetNewPw,
      });
      setResetResult(result);
      console.log("[SIGE] PATCH /user/reset result:", result);
    } catch (e: any) {
      setResetError(e.message || "Erro ao resetar senha.");
      console.log("[SIGE] PATCH /user/reset error:", e.message);
    } finally { setTestingReset(false); }
  };

  const handleRegisterUser = async () => {
    if (!baseUrl.trim()) { setRegError("Informe a URL base da API SIGE."); return; }
    if (!regName.trim() || !regEmail.trim() || !regPassword.trim()) {
      setRegError("Preencha todos os campos.");
      return;
    }
    setRegistering(true); setRegResult(null); setRegError("");
    try {
      const token = await getAccessToken();
      // Use raw fetch to get full error details (attemptedUrl, sigeData)
      const res = await fetch(`https://aztdgagxvrlylszieujs.supabase.co/functions/v1/make-server-b7b07654/sige/user/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${(await import("/utils/supabase/info")).publicAnonKey}`,
          "X-User-Token": token,
        },
        body: JSON.stringify({ name: regName.trim(), email: regEmail.trim(), password: regPassword, baseUrl: baseUrl.trim() }),
      });
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!res.ok) {
        let errorMsg = body?.error || `HTTP ${res.status}`;
        if (body?.attemptedUrl) errorMsg += `\nURL tentada: ${body.attemptedUrl}`;
        if (body?.sigeData) errorMsg += `\nResposta SIGE: ${JSON.stringify(body.sigeData, null, 2)}`;
        console.log("[SIGE] POST /user/register error details:", body);
        setRegError(errorMsg);
        return;
      }
      setRegResult(body);
      console.log("[SIGE] POST /user/register result:", body);
    } catch (e: any) {
      setRegError(e.message || "Erro ao registrar usuario.");
      console.log("[SIGE] POST /user/register error:", e.message);
    } finally { setRegistering(false); }
  };

  const toggleModule = (key: string) => {
    setExpandedModules(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const formatTimeRemaining = (ms: number): string => {
    if (ms <= 0) return "Expirado";
    const hours = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    if (hours > 0) return `${hours}h ${mins}min`;
    return `${mins}min`;
  };

  const isConnected = status?.hasToken && !status.expired;

  // Reusable input style
  const inputClass = "w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 placeholder-gray-400 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 focus:bg-white transition-all";
  const inputStyle = { fontSize: "0.82rem" } as const;

  // Reusable endpoint doc card
  const EndpointCard = ({ method, path, description, body, proxyRoute, proxyLabel, children }: {
    method: string; path: string; description: string; body?: string;
    proxyRoute?: string; proxyLabel?: string; children?: React.ReactNode;
  }) => {
    const methodColors: Record<string, string> = {
      GET: "bg-emerald-100 text-emerald-700 border-emerald-200",
      POST: "bg-blue-100 text-blue-700 border-blue-200",
      PUT: "bg-amber-100 text-amber-700 border-amber-200",
      PATCH: "bg-orange-100 text-orange-700 border-orange-200",
      DELETE: "bg-red-100 text-red-700 border-red-200",
    };
    return (
      <div className="border border-gray-100 rounded-lg overflow-hidden">
        <div className="flex items-center gap-3 p-3 bg-gray-50/50">
          <span className={`px-2.5 py-1 rounded border ${methodColors[method] || "bg-gray-100 text-gray-700 border-gray-200"}`}
            style={{ fontSize: "0.68rem", fontWeight: 700, fontFamily: "monospace" }}>
            {method}
          </span>
          <code className="text-gray-800" style={{ fontSize: "0.85rem" }}>{path}</code>
        </div>
        <div className="px-3 pb-3 pt-2 space-y-2">
          <p className="text-gray-600" style={{ fontSize: "0.78rem", lineHeight: 1.5 }}
            dangerouslySetInnerHTML={{ __html: description }} />
          {body && (
            <div className="bg-gray-900 rounded-lg p-3 overflow-x-auto">
              <pre className="text-gray-300" style={{ fontSize: "0.75rem", lineHeight: 1.5 }}>
                <code>{body}</code>
              </pre>
            </div>
          )}
          {proxyRoute && (
            <div className="flex items-center gap-2 pt-1">
              <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-100 rounded"
                style={{ fontSize: "0.65rem", fontWeight: 600 }}>
                Proxy: {proxyRoute}
              </span>
              {proxyLabel && <span className="text-gray-400" style={{ fontSize: "0.68rem" }}>{proxyLabel}</span>}
            </div>
          )}
          {children}
        </div>
      </div>
    );
  };

  // Reusable test result display
  const TestResult = ({ result, error: err, label }: { result: any; error: string; label: string }) => (
    <>
      {err && (
        <div className="mt-2 flex items-start gap-2 p-2.5 bg-red-50 border border-red-100 rounded-lg">
          <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
          <p className="text-red-700" style={{ fontSize: "0.75rem" }}>{err}</p>
        </div>
      )}
      {result && (
        <div className="mt-2 bg-gray-900 rounded-lg p-3 overflow-x-auto">
          <p className="text-green-400 mb-1" style={{ fontSize: "0.68rem", fontWeight: 600 }}>
            {label}
          </p>
          <pre className="text-gray-300" style={{ fontSize: "0.75rem", lineHeight: 1.5 }}>
            <code>{JSON.stringify(result, null, 2)}</code>
          </pre>
        </div>
      )}
    </>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-gray-900 flex items-center gap-2" style={{ fontSize: "1.3rem", fontWeight: 700 }}>
            <Plug className="w-6 h-6 text-red-600" />
            API SIGE
          </h2>
          <p className="text-gray-500 mt-1" style={{ fontSize: "0.85rem" }}>
            Integracao com o sistema ERP SIGE
          </p>
        </div>
        <div className="shrink-0">
          {isConnected ? (
            <div className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
              <Wifi className="w-4 h-4" />
              Conectado
              {status.expiresInMs !== undefined && (
                <span className="text-green-500 font-normal ml-1">
                  — expira em {formatTimeRemaining(status.expiresInMs)}
                </span>
              )}
            </div>
          ) : status?.configured ? (
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
              <WifiOff className="w-4 h-4" />
              {status.hasToken && status.expired ? "Token expirado" : "Desconectado"}
            </div>
          ) : (
            <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-500 rounded-lg" style={{ fontSize: "0.82rem", fontWeight: 500 }}>
              <AlertTriangle className="w-4 h-4" />
              Nao configurado
            </div>
          )}
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-100 rounded-xl">
          <XCircle className="w-4.5 h-4.5 text-red-500 mt-0.5 shrink-0" />
          <p className="text-red-700" style={{ fontSize: "0.85rem" }}>{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 p-4 bg-green-50 border border-green-100 rounded-xl">
          <CheckCircle2 className="w-4.5 h-4.5 text-green-500 mt-0.5 shrink-0" />
          <p className="text-green-700" style={{ fontSize: "0.85rem" }}>{success}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Configuration */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
            <h3 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "1rem", fontWeight: 600 }}>
              <Key className="w-4.5 h-4.5 text-gray-500" />
              Configuracao da Conexao
            </h3>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-gray-600 mb-1.5" style={{ fontSize: "0.8rem", fontWeight: 500 }}>URL Base da API *</label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://carretao-api-7dbda52e1cca.herokuapp.com/api"
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 placeholder-gray-400 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 focus:bg-white transition-all"
                  style={{ fontSize: "0.88rem" }} />
              </div>
            </div>
            <div>
              <label className="block text-gray-600 mb-1.5" style={{ fontSize: "0.8rem", fontWeight: 500 }}>Email *</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu-email@empresa.com"
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 placeholder-gray-400 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 focus:bg-white transition-all"
                  style={{ fontSize: "0.88rem" }} />
              </div>
            </div>
            <div>
              <label className="block text-gray-600 mb-1.5" style={{ fontSize: "0.8rem", fontWeight: 500 }}>
                Senha * {status?.hasPassword && !password && <span className="text-green-600 font-normal">(salva no servidor)</span>}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder={status?.hasPassword ? "Senha ja salva — digite para alterar" : "Sua senha do SIGE"}
                  className="w-full pl-10 pr-12 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 placeholder-gray-400 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 focus:bg-white transition-all"
                  style={{ fontSize: "0.88rem" }} />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button onClick={handleSaveConfig}
                disabled={saving || (!baseUrl.trim() || !email.trim() || !password.trim())}
                className="flex items-center gap-2 px-5 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? "Salvando..." : "Salvar Config"}
              </button>
              <button onClick={handleConnect} disabled={connecting || (!status?.configured && (!baseUrl.trim() || !email.trim() || !password.trim()))}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                {connecting ? "Conectando..." : "Conectar"}
              </button>
            </div>
            <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
              <Shield className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
              <p className="text-blue-700" style={{ fontSize: "0.75rem" }}>
                A senha e armazenada apenas no servidor e nunca e enviada ao frontend. As chamadas a API SIGE sao feitas via proxy pelo backend.
              </p>
            </div>
          </div>
        </div>

        {/* Right: Token Status */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "1rem", fontWeight: 600 }}>
                <Shield className="w-4.5 h-4.5 text-gray-500" />
                Token JWT
              </h3>
            </div>
            <div className="p-5">
              {isConnected ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-100">
                    <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                    <div className="flex-1">
                      <p className="text-green-800" style={{ fontSize: "0.88rem", fontWeight: 600 }}>Token ativo</p>
                      <p className="text-green-600" style={{ fontSize: "0.75rem" }}>
                        Expira em {formatTimeRemaining(status.expiresInMs || 0)}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-gray-400" style={{ fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase" }}>Criado em</p>
                      <p className="text-gray-700 mt-1" style={{ fontSize: "0.82rem" }}>
                        {status.createdAt ? new Date(status.createdAt).toLocaleString("pt-BR") : "—"}
                      </p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-gray-400" style={{ fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase" }}>Expira em</p>
                      <p className="text-gray-700 mt-1" style={{ fontSize: "0.82rem" }}>
                        {status.expiresAt ? new Date(status.expiresAt).toLocaleString("pt-BR") : "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded-full border text-xs font-semibold ${status.hasRefreshToken ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-500 border-gray-200"}`}>
                      Refresh Token: {status.hasRefreshToken ? "Sim" : "Nao"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 pt-2">
                    <button onClick={handleRefreshToken} disabled={refreshing || !status.hasRefreshToken}
                      className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                      style={{ fontSize: "0.82rem", fontWeight: 500 }}>
                      {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      Renovar Token
                    </button>
                    <button onClick={handleDisconnect} disabled={disconnecting}
                      className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                      style={{ fontSize: "0.82rem", fontWeight: 500 }}>
                      {disconnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                      Desconectar
                    </button>
                  </div>
                </div>
              ) : status?.hasToken && status.expired ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                    <div>
                      <p className="text-amber-800" style={{ fontSize: "0.88rem", fontWeight: 600 }}>Token expirado</p>
                      <p className="text-amber-600" style={{ fontSize: "0.75rem" }}>O token JWT expirou. Renove ou reconecte.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={handleRefreshToken} disabled={refreshing || !status.hasRefreshToken}
                      className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                      style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                      {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      Renovar Token
                    </button>
                    <button onClick={handleConnect} disabled={connecting}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                      style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                      {connecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" />}
                      Reconectar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <WifiOff className="w-5 h-5 text-gray-400 shrink-0" />
                  <div>
                    <p className="text-gray-700" style={{ fontSize: "0.88rem", fontWeight: 600 }}>Nenhum token</p>
                    <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>Configure a URL, email e senha, depois clique em "Conectar".</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {status?.configured && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                <h3 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "1rem", fontWeight: 600 }}>
                  <Link2 className="w-4.5 h-4.5 text-gray-500" />
                  Dados da Conexao
                </h3>
              </div>
              <div className="p-5 space-y-2">
                <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg">
                  <span className="text-gray-500" style={{ fontSize: "0.78rem" }}>URL Base</span>
                  <code className="text-gray-700 truncate max-w-[200px]" style={{ fontSize: "0.78rem" }}>{status.baseUrl || "—"}</code>
                </div>
                <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg">
                  <span className="text-gray-500" style={{ fontSize: "0.78rem" }}>Email</span>
                  <span className="text-gray-700" style={{ fontSize: "0.78rem" }}>{status.email || "—"}</span>
                </div>
                <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg">
                  <span className="text-gray-500" style={{ fontSize: "0.78rem" }}>Senha</span>
                  <span className={status.hasPassword ? "text-green-600" : "text-red-500"} style={{ fontSize: "0.78rem" }}>
                    {status.hasPassword ? "Configurada" : "Nao configurada"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Criar Usuario SIGE (do zero, sem JWT) ═══ */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50/80 to-purple-50/50">
          <h3 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "1rem", fontWeight: 600 }}>
            <UserPlus className="w-5 h-5 text-blue-600" />
            Criar Usuario no SIGE
          </h3>
          <p className="text-gray-500 mt-0.5" style={{ fontSize: "0.78rem" }}>
            Primeiro passo: crie sua conta na API SIGE para depois conectar
          </p>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-2.5 p-3.5 bg-blue-50 border border-blue-100 rounded-lg">
            <Shield className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
            <p className="text-blue-700" style={{ fontSize: "0.78rem" }}>
              Este formulario chama <code className="bg-blue-100 px-1 rounded">POST /user/create</code> <strong>sem autenticacao JWT</strong>.
              Ideal para criar seu primeiro usuario do zero. Apos criado, use as credenciais para conectar ao SIGE acima.
            </p>
          </div>

          {/* Base URL field */}
          <div>
            <label className="block text-gray-600 mb-1.5" style={{ fontSize: "0.8rem", fontWeight: 500 }}>
              URL Base da API SIGE *
              {status?.baseUrl && <span className="text-green-600 font-normal ml-1">(preenchida da configuracao)</span>}
            </label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="url" value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://carretao-api-7dbda52e1cca.herokuapp.com/api"
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:bg-white transition-all"
                style={{ fontSize: "0.88rem" }} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-gray-600 mb-1.5" style={{ fontSize: "0.8rem", fontWeight: 500 }}>Nome *</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" value={regName} onChange={(e) => setRegName(e.target.value)}
                  placeholder="Nome completo"
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:bg-white transition-all"
                  style={{ fontSize: "0.88rem" }} />
              </div>
            </div>
            <div>
              <label className="block text-gray-600 mb-1.5" style={{ fontSize: "0.8rem", fontWeight: 500 }}>Email *</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="email@exemplo.com"
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:bg-white transition-all"
                  style={{ fontSize: "0.88rem" }} />
              </div>
            </div>
            <div>
              <label className="block text-gray-600 mb-1.5" style={{ fontSize: "0.8rem", fontWeight: 500 }}>Senha *</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type={regShowPw ? "text" : "password"} value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Senha segura"
                  className="w-full pl-10 pr-12 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:bg-white transition-all"
                  style={{ fontSize: "0.88rem" }} />
                <button type="button" onClick={() => setRegShowPw(!regShowPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer">
                  {regShowPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button onClick={handleRegisterUser}
              disabled={registering || !baseUrl.trim() || !regName.trim() || !regEmail.trim() || !regPassword.trim()}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
              style={{ fontSize: "0.88rem", fontWeight: 600 }}>
              {registering ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              {registering ? "Criando usuario..." : "Criar Usuario"}
            </button>
          </div>

          {regError && (
            <div className="flex items-start gap-2 p-3.5 bg-red-50 border border-red-100 rounded-lg">
              <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <pre className="text-red-700 whitespace-pre-wrap break-all font-sans" style={{ fontSize: "0.82rem" }}>{regError}</pre>
            </div>
          )}

          {regResult && (
            <div className="space-y-3">
              <div className="flex items-start gap-2.5 p-3.5 bg-green-50 border border-green-100 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-green-800" style={{ fontSize: "0.88rem", fontWeight: 600 }}>
                    Usuario criado com sucesso!
                  </p>
                  <p className="text-green-600 mt-0.5" style={{ fontSize: "0.78rem" }}>
                    Agora use as credenciais para se conectar ao SIGE.
                  </p>
                </div>
              </div>

              <button onClick={() => {
                if (regEmail.trim()) setEmail(regEmail.trim());
                setPassword(regPassword);
                setSuccess("Credenciais preenchidas! Agora clique em \"Salvar Config\" e depois \"Conectar\".");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
                className="flex items-center gap-2 px-4 py-2 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors cursor-pointer"
                style={{ fontSize: "0.82rem", fontWeight: 500 }}>
                <Key className="w-3.5 h-3.5" />
                Usar credenciais na conexao acima
              </button>

              <div className="bg-gray-900 rounded-lg p-3.5 overflow-x-auto">
                <p className="text-green-400 mb-1.5" style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                  Resposta POST /user/create:
                </p>
                <pre className="text-gray-300" style={{ fontSize: "0.78rem", lineHeight: 1.5 }}>
                  <code>{JSON.stringify(regResult, null, 2)}</code>
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Test Runner ═══ */}
      <SigeTestRunner isConnected={!!isConnected} />

      {/* ═══ Stock Explorer (Diagnostico) ═══ */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <SigeStockExplorer isConnected={!!isConnected} />
      </div>

      {/* ═══ API Modules ═══ */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button onClick={() => setShowDocs(!showDocs)}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors cursor-pointer">
          <h3 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "1rem", fontWeight: 600 }}>
            <Zap className="w-4.5 h-4.5 text-red-500" />
            Modulos da API SIGE
            <span className="px-2 py-0.5 bg-red-50 text-red-600 rounded-full" style={{ fontSize: "0.68rem", fontWeight: 600 }}>
              21 modulos
            </span>
          </h3>
          {showDocs ? <ChevronDown className="w-4.5 h-4.5 text-gray-400" /> : <ChevronRight className="w-4.5 h-4.5 text-gray-400" />}
        </button>

        {showDocs && (
          <div className="border-t border-gray-100 divide-y divide-gray-100">

            {/* ─── Module 1: Login ─── */}
            <div>
              <button onClick={() => toggleModule("login")}
                className="w-full p-5 flex items-center gap-3 hover:bg-gray-50/30 transition-colors cursor-pointer">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
                  <LogIn className="w-5 h-5 text-green-600" />
                </div>
                <div className="text-left flex-1">
                  <h4 className="text-gray-900" style={{ fontSize: "0.95rem", fontWeight: 700 }}>Login / Autenticacao</h4>
                  <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>Gerenciamento de tokens JWT — 2 endpoints</p>
                </div>
                <span className="px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 rounded-full shrink-0"
                  style={{ fontSize: "0.68rem", fontWeight: 600 }}>Implementado</span>
                {expandedModules.login
                  ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                  : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
              </button>
              {expandedModules.login && (
                <div className="px-5 pb-5 space-y-3">
                  <EndpointCard method="POST" path="/auth"
                    description='Cria um token JWT e refresh token. O token expira em <strong>12 horas</strong>. Requer <code class="bg-gray-100 px-1 rounded text-red-600">Content-Type: application/json</code>.'
                    body={`// Request Body\n{\n  "email": "exemplo@dev.com",\n  "password": "sua senha"\n}\n\n// Responses: 200, 400, 401, 404, 500`}
                    proxyRoute="/sige/connect" proxyLabel='Botao "Conectar" acima' />

                  <EndpointCard method="POST" path="/auth/refresh"
                    description='Cria um novo token a partir do refresh token. O refresh token expira em <strong>30 dias</strong> sem uso.'
                    body={`// Request Body\n{\n  "refreshToken": "string"\n}\n\n// Responses: 200, 400, 401, 404, 500`}
                    proxyRoute="/sige/refresh-token" proxyLabel='Botao "Renovar Token" acima' />
                </div>
              )}
            </div>

            {/* ─── Module 2: Usuarios ─── */}
            <div>
              <button onClick={() => toggleModule("usuarios")}
                className="w-full p-5 flex items-center gap-3 hover:bg-gray-50/30 transition-colors cursor-pointer">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5 text-purple-600" />
                </div>
                <div className="text-left flex-1">
                  <h4 className="text-gray-900" style={{ fontSize: "0.95rem", fontWeight: 700 }}>Usuarios</h4>
                  <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>Criar, consultar e alterar senha — 3 endpoints</p>
                </div>
                <span className="px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 rounded-full shrink-0"
                  style={{ fontSize: "0.68rem", fontWeight: 600 }}>Implementado</span>
                {expandedModules.usuarios
                  ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                  : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
              </button>
              {expandedModules.usuarios && (
                <div className="px-5 pb-5 space-y-3">

                  {/* ── POST /user/create ── */}
                  <EndpointCard method="POST" path="/user/create"
                    description="Cria um usuario na aplicacao SIGE. Requer autenticacao JWT."
                    body={`// Request Body\n{\n  "name": "Desenvolvimento",\n  "email": "exemplo@dev.com",\n  "password": "sua senha"\n}\n\n// Responses: 200, 400, 401, 404, 500`}
                    proxyRoute="/sige/user/create">
                    <div className="mt-2 pt-3 border-t border-gray-100 space-y-3">
                      <p className="text-gray-500 flex items-center gap-1.5" style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        <Play className="w-3 h-3" /> Testar endpoint
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="relative">
                          <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                          <input type="text" value={testCreateName} onChange={(e) => setTestCreateName(e.target.value)}
                            placeholder="Nome" className={inputClass} style={inputStyle} />
                        </div>
                        <div className="relative">
                          <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                          <input type="email" value={testCreateEmail} onChange={(e) => setTestCreateEmail(e.target.value)}
                            placeholder="Email" className={inputClass} style={inputStyle} />
                        </div>
                        <div className="relative">
                          <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                          <input type={testCreateShowPw ? "text" : "password"} value={testCreatePassword}
                            onChange={(e) => setTestCreatePassword(e.target.value)}
                            placeholder="Senha" className={`${inputClass} pr-10`} style={inputStyle} />
                          <button type="button" onClick={() => setTestCreateShowPw(!testCreateShowPw)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer">
                            {testCreateShowPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                      <button onClick={handleTestUserCreate}
                        disabled={testingCreate || !isConnected || !testCreateName.trim() || !testCreateEmail.trim() || !testCreatePassword.trim()}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                        style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                        {testingCreate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                        {testingCreate ? "Criando..." : "Criar Usuario"}
                      </button>
                      {!isConnected && (
                        <p className="text-amber-600" style={{ fontSize: "0.72rem" }}>
                          Conecte-se primeiro para testar este endpoint.
                        </p>
                      )}
                      <TestResult result={createResult} error={createError} label="Resposta POST /user/create:" />
                    </div>
                  </EndpointCard>

                  {/* ── GET /user/me ── */}
                  <EndpointCard method="GET" path="/user/me"
                    description="Retorna os dados do usuario autenticado no SIGE. Util para verificar se o token esta funcionando corretamente."
                    body={`// Sem body — apenas Authorization: Bearer {token}\n\n// Responses: 200, 400, 401, 404, 500`}
                    proxyRoute="/sige/user/me">
                    <div className="mt-2 pt-3 border-t border-gray-100 space-y-3">
                      <p className="text-gray-500 flex items-center gap-1.5" style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        <Play className="w-3 h-3" /> Testar endpoint
                      </p>
                      <button onClick={handleTestUserMe} disabled={testingUserMe || !isConnected}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                        style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                        {testingUserMe ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <User className="w-3.5 h-3.5" />}
                        {testingUserMe ? "Buscando..." : "Buscar Meu Usuario"}
                      </button>
                      {!isConnected && (
                        <p className="text-amber-600" style={{ fontSize: "0.72rem" }}>
                          Conecte-se primeiro para testar este endpoint.
                        </p>
                      )}
                      <TestResult result={userMeResult} error={userMeError} label="Resposta GET /user/me:" />
                    </div>
                  </EndpointCard>

                  {/* ── PATCH /user/reset/{id} ── */}
                  <EndpointCard method="PATCH" path="/user/reset/{id}"
                    description='Altera a senha de um usuario pelo ID. Requer a senha atual e a nova senha.'
                    body={`// Path: /user/reset/{id}\n\n// Request Body\n{\n  "password": "senha-atual",\n  "newPassword": "nova-senha"\n}\n\n// Responses: 200, 400, 401, 404, 500`}
                    proxyRoute="/sige/user/reset/:id">
                    <div className="mt-2 pt-3 border-t border-gray-100 space-y-3">
                      <p className="text-gray-500 flex items-center gap-1.5" style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        <Play className="w-3 h-3" /> Testar endpoint
                      </p>
                      <div className="space-y-2">
                        <div className="relative">
                          <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                          <input type="text" value={testResetId} onChange={(e) => setTestResetId(e.target.value)}
                            placeholder="ID do usuario (ex: obtido via GET /user/me)" className={inputClass} style={inputStyle} />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="relative">
                            <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                            <input type={testResetShowPw ? "text" : "password"} value={testResetOldPw}
                              onChange={(e) => setTestResetOldPw(e.target.value)}
                              placeholder="Senha atual" className={inputClass} style={inputStyle} />
                          </div>
                          <div className="relative">
                            <KeyRound className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                            <input type={testResetShowPw ? "text" : "password"} value={testResetNewPw}
                              onChange={(e) => setTestResetNewPw(e.target.value)}
                              placeholder="Nova senha" className={`${inputClass} pr-10`} style={inputStyle} />
                            <button type="button" onClick={() => setTestResetShowPw(!testResetShowPw)}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer">
                              {testResetShowPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                      </div>
                      <button onClick={handleTestResetPassword}
                        disabled={testingReset || !isConnected || !testResetId.trim() || !testResetOldPw.trim() || !testResetNewPw.trim()}
                        className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                        style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                        {testingReset ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                        {testingReset ? "Resetando..." : "Resetar Senha"}
                      </button>
                      {!isConnected && (
                        <p className="text-amber-600" style={{ fontSize: "0.72rem" }}>
                          Conecte-se primeiro para testar este endpoint.
                        </p>
                      )}
                      <TestResult result={resetResult} error={resetError} label="Resposta PATCH /user/reset:" />
                    </div>
                  </EndpointCard>

                  {/* Tip */}
                  <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
                    <p className="text-purple-700" style={{ fontSize: "0.75rem" }}>
                      <strong>Dica:</strong> Use "Buscar Meu Usuario" para obter o ID do usuario conectado. Depois, use esse ID no "Resetar Senha" para testar a alteracao de senha.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* ─── Module 3: Dependencias ─── */}
            <SigeDepModule isConnected={!!isConnected} />

            {/* ─── Module 4: Categorias ─── */}
            <SigeCategoryModule isConnected={!!isConnected} />

            {/* ─── Module 5: Clientes ─── */}
            <SigeCustomerModule isConnected={!!isConnected} />
            <SigeCustomerAddressModule isConnected={!!isConnected} />
            <SigeCustomerComplementModule isConnected={!!isConnected} />
            <SigeCustomerContactModule isConnected={!!isConnected} />

            {/* ─── Module 6: Produtos ─── */}
            <SigeProductModule isConnected={!!isConnected} />
            <SigeProductBalanceModule isConnected={!!isConnected} />
            <SigeProductPcpModule isConnected={!!isConnected} />
            <SigeProductPromotionModule isConnected={!!isConnected} />
            <SigeProductReferenceModule isConnected={!!isConnected} />
            <SigeProductTechnicalSheetModule isConnected={!!isConnected} />

            {/* ─── Module: Produto Preco ─── */}
            <SigeProductPriceModule isConnected={!!isConnected} />

            {/* ─── Module 7: Pedidos ─── */}
            <SigeOrderModule isConnected={!!isConnected} />
            <SigeOrderObservationModule isConnected={!!isConnected} />
            <SigeOrderInstallmentModule isConnected={!!isConnected} />
            <SigeOrderItemsModule isConnected={!!isConnected} />
            <SigeOrderItemsTextModule isConnected={!!isConnected} />

            {/* Next modules placeholder */}
            <div className="p-5">
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                <p className="text-gray-500 flex items-center gap-2" style={{ fontSize: "0.75rem" }}>
                  <Clock className="w-3.5 h-3.5" />
                  Proximos modulos: Financeiro, Estoque... (envie a documentacao)
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}