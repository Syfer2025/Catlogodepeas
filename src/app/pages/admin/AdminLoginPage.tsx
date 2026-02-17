import { useState, useEffect } from "react";
import { Link } from "react-router";
import {
  Mail,
  Lock,
  Loader2,
  AlertTriangle,
  Eye,
  EyeOff,
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "../../services/supabaseClient";
import * as api from "../../services/api";

const LOGIN_LOGO_CACHE_KEY = "carretao_admin_logo_url";

interface AdminLoginPageProps {
  onLoginSuccess: (accessToken: string, userEmail: string, userName: string) => void;
}

export function AdminLoginPage({ onLoginSuccess }: AdminLoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LOGIN_LOGO_CACHE_KEY);
    } catch {
      return null;
    }
  });
  const [logoLoading, setLogoLoading] = useState(true);

  // Forgot password state
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password.trim()) {
      setError("Preencha todos os campos.");
      return;
    }

    setLoading(true);
    try {
      const { data, error: authError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (authError) {
        console.error(
          "Erro de autenticacao no login admin:",
          authError.message
        );
        if (authError.message.includes("Invalid login credentials")) {
          setError("Email ou senha incorretos.");
        } else if (authError.message.includes("Email not confirmed")) {
          setError("Email ainda nao confirmado.");
        } else {
          setError(authError.message);
        }
        return;
      }

      if (data.session?.access_token) {
        const userName = data.user?.user_metadata?.name || "Admin";
        const userEmail = data.user?.email || email;
        onLoginSuccess(data.session.access_token, userEmail, userName);
      } else {
        setError("Sessao nao retornada. Tente novamente.");
      }
    } catch (err: any) {
      console.error("Excecao no login admin:", err);
      setError(
        "Erro de conexao. Verifique sua internet e tente novamente."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);

    if (!forgotEmail.trim()) {
      setForgotError("Informe seu email.");
      return;
    }

    setForgotLoading(true);
    try {
      console.log("[ForgotPassword] Requesting recovery via server for:", forgotEmail.trim());

      // Call the server which sends the recovery email via Supabase SDK.
      // The email template shows {{ .Token }} (6-digit OTP).
      const result = await api.forgotPassword(forgotEmail.trim());
      console.log("[ForgotPassword] Server response:", result);

      // Store recoveryId in localStorage (not sessionStorage) so it's
      // accessible across tabs — the email link may open in a new tab
      if (result.recoveryId) {
        localStorage.setItem("recovery_id", result.recoveryId);
        localStorage.setItem("recovery_email", forgotEmail.trim());
      }

      setForgotSuccess(true);
    } catch (err: any) {
      console.error("Excecao ao solicitar recuperacao:", err);
      if (err.message?.includes("rate limit") || err.message?.includes("429")) {
        setForgotError("Muitas tentativas. Aguarde alguns minutos e tente novamente.");
      } else {
        setForgotError("Erro de conexao. Tente novamente.");
      }
    } finally {
      setForgotLoading(false);
    }
  };

  const switchToForgot = () => {
    setMode("forgot");
    setForgotEmail(email); // Pre-fill with login email if available
    setForgotError(null);
    setForgotSuccess(false);
    setError(null);
  };

  const switchToLogin = () => {
    setMode("login");
    setError(null);
    setForgotError(null);
    setForgotSuccess(false);
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      {/* Background pattern */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-red-600/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-red-600/3 rounded-full blur-2xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Back to site */}
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-300 transition-colors mb-8"
          style={{ fontSize: "0.85rem" }}
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar ao site
        </Link>

        {/* Card */}
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

            {mode === "login" ? (
              <>
                <h1
                  className="text-white mb-1"
                  style={{ fontSize: "1.25rem", fontWeight: 600 }}
                >
                  Painel Administrativo
                </h1>
                <p
                  className="text-gray-400"
                  style={{ fontSize: "0.85rem" }}
                >
                  Faca login para acessar o painel
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center justify-center gap-2 mb-1">
                  <KeyRound className="w-5 h-5 text-red-500" />
                  <h1
                    className="text-white"
                    style={{ fontSize: "1.25rem", fontWeight: 600 }}
                  >
                    Recuperar Senha
                  </h1>
                </div>
                <p
                  className="text-gray-400"
                  style={{ fontSize: "0.85rem" }}
                >
                  {forgotSuccess
                    ? "Verifique sua caixa de entrada"
                    : "Enviaremos um link para seu email"}
                </p>
              </>
            )}
          </div>

          {/* Content */}
          <div className="p-8">
            {mode === "login" ? (
              <>
                {/* Login Error */}
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
                  {/* Email */}
                  <div>
                    <label
                      htmlFor="email"
                      className="block text-gray-300 mb-2"
                      style={{ fontSize: "0.85rem", fontWeight: 500 }}
                    >
                      Email
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500" />
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="admin@carretao.com.br"
                        className="w-full pl-11 pr-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white placeholder-gray-500 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all"
                        style={{ fontSize: "0.9rem" }}
                        autoComplete="email"
                        disabled={loading}
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label
                        htmlFor="password"
                        className="block text-gray-300"
                        style={{ fontSize: "0.85rem", fontWeight: 500 }}
                      >
                        Senha
                      </label>
                      <button
                        type="button"
                        onClick={switchToForgot}
                        className="text-red-500 hover:text-red-400 transition-colors"
                        style={{ fontSize: "0.8rem", fontWeight: 500 }}
                      >
                        Esqueci minha senha
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500" />
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Sua senha"
                        className="w-full pl-11 pr-12 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white placeholder-gray-500 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all"
                        style={{ fontSize: "0.9rem" }}
                        autoComplete="current-password"
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
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-red-600 hover:bg-red-700 disabled:bg-red-800 disabled:cursor-not-allowed text-white py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
                    style={{ fontSize: "0.95rem", fontWeight: 600 }}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Entrando...
                      </>
                    ) : (
                      "Entrar"
                    )}
                  </button>
                </form>
              </>
            ) : forgotSuccess ? (
              /* Forgot password — success */
              <div className="text-center py-2">
                <div className="bg-green-900/30 border border-green-800/50 rounded-xl p-5 mb-5">
                  <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
                  <p
                    className="text-green-300 mb-2"
                    style={{ fontSize: "0.95rem", fontWeight: 600 }}
                  >
                    Email enviado com sucesso!
                  </p>
                  <p
                    className="text-green-400/70 leading-relaxed"
                    style={{ fontSize: "0.8rem" }}
                  >
                    Enviamos um <span className="text-green-300 font-medium">link de verificacao</span> para{" "}
                    <span className="text-green-300 font-medium">
                      {forgotEmail}
                    </span>
                    . Clique no link do email e depois volte aqui.
                  </p>
                </div>
                <Link
                  to="/admin/reset-password"
                  className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl transition-colors"
                  style={{ fontSize: "0.9rem", fontWeight: 600 }}
                  onClick={() => {
                    // recoveryId already in localStorage
                  }}
                >
                  <KeyRound className="w-4 h-4" />
                  Aguardar verificacao
                </Link>
                <button
                  onClick={switchToLogin}
                  className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mt-3"
                  style={{ fontSize: "0.85rem" }}
                >
                  <ArrowLeft className="w-4 h-4" />
                  Voltar ao login
                </button>
              </div>
            ) : (
              /* Forgot password — form */
              <>
                {forgotError && (
                  <div className="bg-red-900/30 border border-red-800/50 rounded-xl p-4 mb-6 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <p
                      className="text-red-300"
                      style={{ fontSize: "0.85rem" }}
                    >
                      {forgotError}
                    </p>
                  </div>
                )}

                <form
                  onSubmit={handleForgotPassword}
                  className="space-y-5"
                >
                  <div>
                    <label
                      htmlFor="forgot-email"
                      className="block text-gray-300 mb-2"
                      style={{ fontSize: "0.85rem", fontWeight: 500 }}
                    >
                      Email cadastrado
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500" />
                      <input
                        id="forgot-email"
                        type="email"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="admin@carretao.com.br"
                        className="w-full pl-11 pr-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white placeholder-gray-500 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all"
                        style={{ fontSize: "0.9rem" }}
                        autoComplete="email"
                        disabled={forgotLoading}
                        autoFocus
                      />
                    </div>
                    <p
                      className="text-gray-500 mt-2"
                      style={{ fontSize: "0.75rem" }}
                    >
                      Voce recebera um email com um link para verificar sua
                      identidade e redefinir a senha.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={forgotLoading || !forgotEmail.trim()}
                    className="w-full bg-red-600 hover:bg-red-700 disabled:bg-red-800 disabled:cursor-not-allowed text-white py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
                    style={{ fontSize: "0.95rem", fontWeight: 600 }}
                  >
                    {forgotLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Mail className="w-4.5 h-4.5" />
                        Enviar link de recuperacao
                      </>
                    )}
                  </button>

                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={switchToLogin}
                      className="inline-flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors"
                      style={{ fontSize: "0.85rem" }}
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      Voltar ao login
                    </button>
                  </div>
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