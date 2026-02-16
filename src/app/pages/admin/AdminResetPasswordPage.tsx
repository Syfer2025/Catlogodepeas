import { useState, useEffect } from "react";
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
} from "lucide-react";
import { supabase } from "../../services/supabaseClient";
import * as api from "../../services/api";

const LOGIN_LOGO_CACHE_KEY = "carretao_admin_logo_url";

export function AdminResetPasswordPage() {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
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

  // Listen for PASSWORD_RECOVERY event from Supabase Auth
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[ResetPassword] Auth event:", event);
      if (event === "PASSWORD_RECOVERY" && session) {
        setSessionReady(true);
        setCheckingSession(false);
      }
    });

    // Handle PKCE flow: if ?code= is in URL, exchange it for a session
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) {
      console.log("[ResetPassword] PKCE code detected, exchanging...");
      supabase.auth
        .exchangeCodeForSession(code)
        .then(({ error }) => {
          if (error) {
            console.error("[ResetPassword] PKCE exchange error:", error.message);
            setCheckingSession(false);
          }
          // onAuthStateChange will fire PASSWORD_RECOVERY after exchange
        })
        .catch((err) => {
          console.error("[ResetPassword] PKCE exchange exception:", err);
          setCheckingSession(false);
        });
    }

    // Also check if we already have a session (user may have refreshed,
    // or tokens arrived via hash and were already processed)
    const checkExistingSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) {
          setSessionReady(true);
        }
      } catch (err) {
        console.error("Erro ao verificar sessao para reset:", err);
      } finally {
        setCheckingSession(false);
      }
    };

    // Small delay to allow onAuthStateChange / PKCE exchange to fire first
    const timer = setTimeout(checkExistingSession, 2000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const validatePassword = (): string | null => {
    if (newPassword.length < 6) {
      return "A senha deve ter pelo menos 6 caracteres.";
    }
    if (newPassword !== confirmPassword) {
      return "As senhas nao coincidem.";
    }
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

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        console.error("Erro ao redefinir senha:", updateError.message);
        if (updateError.message.includes("same_password")) {
          setError("A nova senha deve ser diferente da senha atual.");
        } else {
          setError(updateError.message);
        }
        return;
      }

      setSuccess(true);

      // Redirect to admin after 3 seconds
      setTimeout(() => {
        navigate("/admin");
      }, 3000);
    } catch (err: any) {
      console.error("Excecao ao redefinir senha:", err);
      setError("Erro de conexao. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  // Password strength indicator
  const getPasswordStrength = () => {
    if (!newPassword) return { level: 0, label: "", color: "" };
    let score = 0;
    if (newPassword.length >= 6) score++;
    if (newPassword.length >= 8) score++;
    if (/[A-Z]/.test(newPassword)) score++;
    if (/[0-9]/.test(newPassword)) score++;
    if (/[^A-Za-z0-9]/.test(newPassword)) score++;

    if (score <= 1) return { level: 1, label: "Fraca", color: "bg-red-500" };
    if (score <= 2) return { level: 2, label: "Razoavel", color: "bg-orange-500" };
    if (score <= 3) return { level: 3, label: "Boa", color: "bg-yellow-500" };
    if (score <= 4) return { level: 4, label: "Forte", color: "bg-green-500" };
    return { level: 5, label: "Excelente", color: "bg-emerald-500" };
  };

  const strength = getPasswordStrength();

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      {/* Background pattern */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-red-600/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-red-600/3 rounded-full blur-2xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Back to login */}
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
                  alt="Carretao Auto Pecas"
                  className="h-14 w-auto max-w-[220px] object-contain"
                  onError={() => {
                    setLogoUrl(null);
                    try {
                      localStorage.removeItem(LOGIN_LOGO_CACHE_KEY);
                    } catch {}
                  }}
                  decoding="async"
                />
              ) : logoLoading ? (
                <div className="h-14 w-[180px] bg-gray-700 rounded-lg animate-pulse" />
              ) : null}
            </div>
            <div className="flex items-center justify-center gap-2 mb-1">
              <ShieldCheck className="w-5 h-5 text-red-500" />
              <h1
                className="text-white"
                style={{ fontSize: "1.25rem", fontWeight: 600 }}
              >
                Redefinir Senha
              </h1>
            </div>
            <p
              className="text-gray-400"
              style={{ fontSize: "0.85rem" }}
            >
              {success
                ? "Senha alterada com sucesso!"
                : "Defina sua nova senha de acesso"}
            </p>
          </div>

          {/* Content */}
          <div className="p-8">
            {/* Checking session */}
            {checkingSession ? (
              <div className="text-center py-6">
                <Loader2 className="w-8 h-8 text-red-500 animate-spin mx-auto mb-3" />
                <p
                  className="text-gray-400"
                  style={{ fontSize: "0.9rem" }}
                >
                  Verificando link de recuperacao...
                </p>
              </div>
            ) : !sessionReady && !success ? (
              /* Invalid/expired link */
              <div className="text-center py-4">
                <div className="bg-red-900/30 border border-red-800/50 rounded-xl p-5 mb-5">
                  <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-3" />
                  <p
                    className="text-red-300 mb-1"
                    style={{ fontSize: "0.95rem", fontWeight: 600 }}
                  >
                    Link expirado ou invalido
                  </p>
                  <p
                    className="text-red-400/70"
                    style={{ fontSize: "0.8rem" }}
                  >
                    Solicite um novo link de recuperacao na tela de login.
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
            ) : success ? (
              /* Success */
              <div className="text-center py-4">
                <div className="bg-green-900/30 border border-green-800/50 rounded-xl p-5 mb-5">
                  <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
                  <p
                    className="text-green-300 mb-1"
                    style={{ fontSize: "0.95rem", fontWeight: 600 }}
                  >
                    Senha redefinida com sucesso!
                  </p>
                  <p
                    className="text-green-400/70"
                    style={{ fontSize: "0.8rem" }}
                  >
                    Voce sera redirecionado ao painel em instantes...
                  </p>
                </div>
                <Loader2 className="w-5 h-5 text-green-500 animate-spin mx-auto" />
              </div>
            ) : (
              /* Reset Form */
              <>
                {error && (
                  <div className="bg-red-900/30 border border-red-800/50 rounded-xl p-4 mb-6 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <p
                      className="text-red-300"
                      style={{ fontSize: "0.85rem" }}
                    >
                      {error}
                    </p>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* New Password */}
                  <div>
                    <label
                      htmlFor="new-password"
                      className="block text-gray-300 mb-2"
                      style={{ fontSize: "0.85rem", fontWeight: 500 }}
                    >
                      Nova Senha
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500" />
                      <input
                        id="new-password"
                        type={showPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimo 6 caracteres"
                        className="w-full pl-11 pr-12 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white placeholder-gray-500 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all"
                        style={{ fontSize: "0.9rem" }}
                        autoComplete="new-password"
                        disabled={loading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4.5 h-4.5" />
                        ) : (
                          <Eye className="w-4.5 h-4.5" />
                        )}
                      </button>
                    </div>
                    {/* Strength bar */}
                    {newPassword && (
                      <div className="mt-2.5">
                        <div className="flex gap-1 mb-1">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <div
                              key={i}
                              className={`h-1 flex-1 rounded-full transition-colors ${
                                i <= strength.level
                                  ? strength.color
                                  : "bg-gray-700"
                              }`}
                            />
                          ))}
                        </div>
                        <p
                          className="text-gray-500"
                          style={{ fontSize: "0.7rem" }}
                        >
                          Forca:{" "}
                          <span className="text-gray-400">
                            {strength.label}
                          </span>
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label
                      htmlFor="confirm-password"
                      className="block text-gray-300 mb-2"
                      style={{ fontSize: "0.85rem", fontWeight: 500 }}
                    >
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
                      <button
                        type="button"
                        onClick={() => setShowConfirm(!showConfirm)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        {showConfirm ? (
                          <EyeOff className="w-4.5 h-4.5" />
                        ) : (
                          <Eye className="w-4.5 h-4.5" />
                        )}
                      </button>
                    </div>
                    {confirmPassword && confirmPassword !== newPassword && (
                      <p
                        className="text-red-400 mt-1.5"
                        style={{ fontSize: "0.75rem" }}
                      >
                        As senhas nao coincidem
                      </p>
                    )}
                  </div>

                  {/* Submit */}
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
          </div>

          {/* Footer */}
          <div className="border-t border-gray-700 px-8 py-4 text-center">
            <p
              className="text-gray-500"
              style={{ fontSize: "0.75rem" }}
            >
              Acesso restrito a administradores autorizados
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
