import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router";
import {
  Lock,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  ArrowLeft,
  ShieldCheck,
  Mail,
} from "lucide-react";
import { supabase } from "../../services/supabaseClient";
import * as api from "../../services/api";

const LOGIN_LOGO_CACHE_KEY = "carretao_admin_logo_url";
const POLL_INTERVAL = 3000; // 3 seconds

type PageMode = "waiting" | "password" | "no-session" | "success";

export function AdminResetPasswordPage() {
  const navigate = useNavigate();

  const [mode, setMode] = useState<PageMode>("waiting");

  // Password form
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Polling
  const [pollCount, setPollCount] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Keep the recoveryId available for the password submit step
  const ridRef = useRef<string | null>(null);

  // Logo
  const [logoUrl, setLogoUrl] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LOGIN_LOGO_CACHE_KEY);
    } catch {
      return null;
    }
  });
  const [logoLoading, setLogoLoading] = useState(true);

  // Fetch logo
  useEffect(() => {
    api
      .getLogo()
      .then((data) => {
        if (data?.hasLogo && data.url) {
          setLogoUrl(data.url);
          try {
            localStorage.setItem(LOGIN_LOGO_CACHE_KEY, data.url);
          } catch {}
        } else {
          setLogoUrl(null);
          try {
            localStorage.removeItem(LOGIN_LOGO_CACHE_KEY);
          } catch {}
        }
      })
      .catch(() => {})
      .finally(() => setLogoLoading(false));
  }, []);

  // ─── Start polling for recovery status ───
  useEffect(() => {
    const rid = localStorage.getItem("recovery_id");

    if (!rid) {
      console.log("[ResetPassword] No recovery_id in localStorage");
      setMode("no-session");
      return;
    }

    ridRef.current = rid;
    console.log("[ResetPassword] Starting polling for rid:", rid);

    const poll = async () => {
      try {
        const result = await api.recoveryStatus(rid);
        setPollCount((c) => c + 1);

        if (result.status === "verified") {
          console.log("[ResetPassword] Recovery verified via last_sign_in_at change!");

          // Stop polling
          if (pollRef.current) clearInterval(pollRef.current);

          // Show password form (ridRef still holds the rid for the submit step)
          setMode("password");
        } else if (result.status === "expired" || result.status === "not_found") {
          console.log("[ResetPassword] Recovery expired or not found");
          if (pollRef.current) clearInterval(pollRef.current);
          localStorage.removeItem("recovery_id");
          localStorage.removeItem("recovery_email");
          ridRef.current = null;
          setMode("no-session");
        }
        // else status === "pending" → keep polling
      } catch (err) {
        console.error("[ResetPassword] Poll error:", err);
        // Don't stop polling on transient errors
      }
    };

    // Poll immediately and then every POLL_INTERVAL
    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL);

    // Stop polling after 10 minutes (safety)
    const timeout = setTimeout(() => {
      if (pollRef.current) clearInterval(pollRef.current);
      setMode("no-session");
    }, 600000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      clearTimeout(timeout);
    };
  }, []);

  // ─── Password validation ───
  const validatePassword = (): string | null => {
    if (newPassword.length < 8) return "A senha deve ter pelo menos 8 caracteres.";
    if (!/[A-Z]/.test(newPassword)) return "A senha deve conter pelo menos uma letra maiúscula.";
    if (!/[a-z]/.test(newPassword)) return "A senha deve conter pelo menos uma letra minúscula.";
    if (!/[0-9]/.test(newPassword)) return "A senha deve conter pelo menos um número.";
    if (newPassword !== confirmPassword) return "As senhas não coincidem.";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validationError = validatePassword();
    if (validationError) {
      setError(validationError);
      return;
    }

    const rid = ridRef.current;
    if (!rid) {
      setError("Sessão de recuperação perdida. Tente novamente.");
      setMode("no-session");
      return;
    }

    setLoading(true);
    try {
      // Use the server admin API to change the password
      const result = await api.resetPassword(rid, newPassword);

      if (result.error) {
        setError(result.error);
        return;
      }

      // Try to sign in with the new password before cleaning up
      const recoveryEmail = localStorage.getItem("recovery_email");

      // Clean up
      localStorage.removeItem("recovery_id");
      localStorage.removeItem("recovery_email");
      ridRef.current = null;

      if (recoveryEmail) {
        try {
          await supabase.auth.signInWithPassword({
            email: recoveryEmail,
            password: newPassword,
          });
        } catch {
          // Not critical — user can sign in manually
        }
      }

      setMode("success");
      setTimeout(() => navigate("/admin"), 3000);
    } catch (err: any) {
      console.error("Exceção ao redefinir senha:", err);
      setError(err.message || "Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  // Password strength
  const getStrength = () => {
    if (!newPassword) return { level: 0, label: "", color: "" };
    let s = 0;
    if (newPassword.length >= 8) s++;
    if (newPassword.length >= 12) s++;
    if (/[A-Z]/.test(newPassword)) s++;
    if (/[0-9]/.test(newPassword)) s++;
    if (/[^A-Za-z0-9]/.test(newPassword)) s++;
    if (s <= 1) return { level: 1, label: "Fraca", color: "bg-red-500" };
    if (s <= 2) return { level: 2, label: "Razoável", color: "bg-orange-500" };
    if (s <= 3) return { level: 3, label: "Boa", color: "bg-yellow-500" };
    if (s <= 4) return { level: 4, label: "Forte", color: "bg-green-500" };
    return { level: 5, label: "Excelente", color: "bg-emerald-500" };
  };

  const strength = getStrength();

  const subtitle =
    mode === "waiting"
      ? "Aguardando verificação por e-mail"
      : mode === "no-session"
      ? "Sessão não encontrada"
      : mode === "success"
      ? "Senha alterada com sucesso!"
      : "Defina sua nova senha de acesso";

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-red-600/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-red-600/3 rounded-full blur-2xl" />
      </div>

      <div className="relative w-full max-w-md">
        <Link
          to="/admin"
          className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-300 transition-colors mb-8"
          style={{ fontSize: "0.85rem" }}
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar ao login
        </Link>

        <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gray-800 border-b border-gray-700 px-8 pt-8 pb-6 text-center">
            <div className="flex items-center justify-center mb-4">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Carretão Auto Peças"
                  className="h-14 w-auto max-w-[220px] object-contain"
                  onError={() => {
                    setLogoUrl(null);
                    try { localStorage.removeItem(LOGIN_LOGO_CACHE_KEY); } catch {}
                  }}
                  decoding="async"
                />
              ) : logoLoading ? (
                <div className="h-14 w-[180px] bg-gray-700 rounded-lg animate-pulse" />
              ) : null}
            </div>
            <div className="flex items-center justify-center gap-2 mb-1">
              <ShieldCheck className="w-5 h-5 text-red-500" />
              <h1 className="text-white" style={{ fontSize: "1.25rem", fontWeight: 600 }}>
                Redefinir Senha
              </h1>
            </div>
            <p className="text-gray-400" style={{ fontSize: "0.85rem" }}>
              {subtitle}
            </p>
          </div>

          {/* Content */}
          <div className="p-8">
            {/* ─── Waiting for email link click ─── */}
            {mode === "waiting" && (
              <div className="text-center py-4">
                <div className="relative mx-auto w-16 h-16 mb-5">
                  <Mail className="w-10 h-10 text-red-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                  <div className="absolute inset-0 border-3 border-gray-700 border-t-red-500 rounded-full animate-spin" />
                </div>
                <p className="text-gray-300 mb-2" style={{ fontSize: "0.95rem", fontWeight: 500 }}>
                  Aguardando verificação...
                </p>
                <p className="text-gray-500 leading-relaxed" style={{ fontSize: "0.8rem" }}>
                  Abra seu e-mail e clique no link de recuperação que enviamos.
                  Esta página detectará automaticamente quando você clicar.
                </p>
                <div className="mt-4 flex items-center justify-center gap-2 text-gray-600" style={{ fontSize: "0.75rem" }}>
                  <div className="w-2 h-2 bg-red-500/60 rounded-full animate-pulse" />
                  Verificando a cada {POLL_INTERVAL / 1000}s...
                  {pollCount > 0 && <span className="text-gray-700">({pollCount})</span>}
                </div>
              </div>
            )}

            {/* ─── No session ─── */}
            {mode === "no-session" && (
              <div className="text-center py-4">
                <div className="bg-red-900/30 border border-red-800/50 rounded-xl p-5 mb-5">
                  <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-3" />
                  <p className="text-red-300 mb-1" style={{ fontSize: "0.95rem", fontWeight: 600 }}>
                    Sessão de recuperação não encontrada
                  </p>
                  <p className="text-red-400/70" style={{ fontSize: "0.8rem" }}>
                    Use o botão "Esqueci minha senha" na tela de login para iniciar o processo.
                  </p>
                </div>
                <Link
                  to="/admin"
                  className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl transition-colors"
                  style={{ fontSize: "0.9rem", fontWeight: 600 }}
                >
                  <ArrowLeft className="w-4 h-4" />
                  Ir para o login
                </Link>
              </div>
            )}

            {/* ─── Password Form ─── */}
            {mode === "password" && (
              <>
                <div className="bg-green-900/20 border border-green-800/40 rounded-xl p-3 mb-5 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                  <p className="text-green-400" style={{ fontSize: "0.8rem" }}>
                    Identidade verificada! Defina sua nova senha abaixo.
                  </p>
                </div>

                {error && (
                  <div className="bg-red-900/30 border border-red-800/50 rounded-xl p-4 mb-6 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-red-300" style={{ fontSize: "0.85rem" }}>{error}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label htmlFor="new-password" className="block text-gray-300 mb-2" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                      Nova Senha
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500" />
                      <input
                        id="new-password"
                        type={showPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Mínimo 8 caracteres"
                        className="w-full pl-11 pr-12 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white placeholder-gray-500 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all"
                        style={{ fontSize: "0.9rem" }}
                        autoComplete="new-password"
                        disabled={loading}
                        autoFocus
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors">
                        {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                      </button>
                    </div>
                    {newPassword && (
                      <div className="mt-2.5">
                        <div className="flex gap-1 mb-1">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= strength.level ? strength.color : "bg-gray-700"}`} />
                          ))}
                        </div>
                        <p className="text-gray-500" style={{ fontSize: "0.7rem" }}>
                          Força: <span className="text-gray-400">{strength.label}</span>
                        </p>
                      </div>
                    )}
                  </div>

                  <div>
                    <label htmlFor="confirm-password" className="block text-gray-300 mb-2" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                      Confirmar Nova Senha
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500" />
                      <input
                        id="confirm-password"
                        type={showConfirm ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repita a nova senha"
                        className={`w-full pl-11 pr-12 py-3 bg-gray-700 border rounded-xl text-white placeholder-gray-500 outline-none focus:ring-2 transition-all ${
                          confirmPassword && confirmPassword !== newPassword
                            ? "border-red-500/60 focus:border-red-500 focus:ring-red-500/20"
                            : confirmPassword && confirmPassword === newPassword
                            ? "border-green-500/60 focus:border-green-500 focus:ring-green-500/20"
                            : "border-gray-600 focus:border-red-500 focus:ring-red-500/20"
                        }`}
                        style={{ fontSize: "0.9rem" }}
                        autoComplete="new-password"
                        disabled={loading}
                      />
                      <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors">
                        {showConfirm ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                      </button>
                    </div>
                    {confirmPassword && confirmPassword !== newPassword && (
                      <p className="text-red-400 mt-1.5" style={{ fontSize: "0.75rem" }}>As senhas não coincidem</p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !newPassword || !confirmPassword}
                    className="w-full bg-red-600 hover:bg-red-700 disabled:bg-red-800 disabled:cursor-not-allowed text-white py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
                    style={{ fontSize: "0.95rem", fontWeight: 600 }}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Redefinindo...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-5 h-5" />
                        Redefinir Senha
                      </>
                    )}
                  </button>
                </form>
              </>
            )}

            {/* ─── Success ─── */}
            {mode === "success" && (
              <div className="text-center py-4">
                <div className="bg-green-900/30 border border-green-800/50 rounded-xl p-5 mb-5">
                  <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
                  <p className="text-green-300 mb-1" style={{ fontSize: "0.95rem", fontWeight: 600 }}>
                    Senha redefinida com sucesso!
                  </p>
                  <p className="text-green-400/70" style={{ fontSize: "0.8rem" }}>
                    Você será redirecionado ao painel em instantes...
                  </p>
                </div>
                <Loader2 className="w-5 h-5 text-green-500 animate-spin mx-auto" />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-700 px-8 py-4 text-center">
            <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>
              Acesso restrito a administradores autorizados
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}