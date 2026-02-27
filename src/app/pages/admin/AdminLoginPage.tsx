import { saveAdminSession, clearSupabaseLocalSession } from "./adminAuth";
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
  onLoginSuccess: (accessToken: string, userEmail: string, userName: string, isMaster: boolean, permissions: string[]) => void;
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

  // Bootstrap state (first admin setup)
  const [showBootstrap, setShowBootstrap] = useState(false);
  const [bootstrapLoading, setBootstrapLoading] = useState(false);

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
      // Step 0: Pre-login check (rate limit + brute-force lockout + honeypot)
      // Read honeypot field value (bots will fill it, humans won't)
      var honeypotVal = "";
      try {
        var hpEl = document.getElementById("fax_number_admin") as HTMLInputElement | null;
        if (hpEl && hpEl.value) honeypotVal = hpEl.value;
      } catch (_hp) {}
      try {
        const preCheck = await api.preLoginCheck(email.trim(), honeypotVal);
        if (preCheck.locked || preCheck.error) {
          setError(preCheck.error || "Conta temporariamente bloqueada.");
          setLoading(false);
          return;
        }
      } catch (preErr: any) {
        if (preErr.message && (preErr.message.includes("Muitas tentativas") || preErr.message.includes("bloqueada") || preErr.message.includes("Aguarde"))) {
          setError(preErr.message);
          setLoading(false);
          return;
        }
        console.warn("[AdminLogin] Pre-check error (continuing):", preErr);
      }

      console.log("[AdminLogin] Step 1: Attempting signInWithPassword for:", email.trim());
      const { data, error: authError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (authError) {
        // Report failure for brute-force tracking
        api.reportLoginResult(email.trim(), false).catch(() => {});
        console.error(
          "[AdminLogin] Step 1 FAILED - Auth error:",
          authError.message,
          "| Code:", (authError as any).code,
          "| Status:", (authError as any).status
        );
        console.log("[AuditLog] Login failed for:", email.trim(), authError.message);
        if (authError.message.includes("Invalid login credentials")) {
          setError("Email ou senha incorretos.");
        } else if (authError.message.includes("Email not confirmed")) {
          setError("E-mail ainda não confirmado.");
        } else {
          setError(authError.message);
        }
        return;
      }

      // Report success (clears failed attempt counter) — pass token so backend can verify
      api.reportLoginResult(email.trim(), true, data.session?.access_token).catch(() => {});

      console.log("[AdminLogin] Step 1 OK - Signed in. User ID:", data.user?.id, "| Email:", data.user?.email);
      console.log("[AdminLogin] Step 2: Session exists?", !!data.session, "| Token length:", data.session?.access_token?.length);

      if (data.session?.access_token) {
        // CRITICAL: Verify the user is actually an admin before granting access
        var adminIsMaster = false;
        var adminPermissions: string[] = [];
        try {
          console.log("[AdminLogin] Step 3: Calling check-admin with token...");
          const adminCheck = await api.checkAdmin(data.session.access_token);
          console.log("[AdminLogin] Step 3 RESULT:", JSON.stringify(adminCheck));
          if (!adminCheck.isAdmin) {
            // Check if NO admins exist — show bootstrap option
            if (adminCheck.noAdminsExist) {
              console.log("[AdminLogin] No admins configured yet. Offering bootstrap for:", email);
              clearSupabaseLocalSession();
              setShowBootstrap(true);
              setError(null);
              return;
            }
            // User authenticated successfully but is NOT an admin — sign them out
            console.warn("[AdminLogin] User " + email + " is not an admin. Access denied.");
            clearSupabaseLocalSession();
            setError("Acesso restrito. Esta conta não possui permissão de administrador.");
            return;
          }
          adminIsMaster = adminCheck.isMaster || false;
          adminPermissions = adminCheck.permissions || [];
        } catch (adminErr) {
          console.error("[AdminLogin] Step 3 EXCEPTION:", adminErr);
          clearSupabaseLocalSession();
          setError("Erro ao verificar permissões. Tente novamente. Detalhe: " + String(adminErr));
          return;
        }
        const userName = data.user?.user_metadata?.name || "Admin";
        const userEmail = data.user?.email || email;

        // CRITICAL: Save admin tokens to admin-specific localStorage,
        // then clear the Supabase client session so it doesn't leak
        // to the customer side. We use manual localStorage cleanup
        // instead of signOut() to avoid server-side JWT revocation.
        saveAdminSession(
          data.session.access_token,
          data.session.refresh_token || "",
          data.session.expires_at || 0,
          userEmail,
          userName
        );
        // Clear the Supabase client session from localStorage WITHOUT
        // calling signOut (which may revoke the JWT server-side in some versions)
        clearSupabaseLocalSession();
        console.log("[AdminLogin] Supabase session cleared (local). Admin token saved to localStorage.");

        onLoginSuccess(data.session.access_token, userEmail, userName, adminIsMaster, adminPermissions);
      } else {
        setError("Sessão não retornada. Tente novamente.");
      }
    } catch (err: any) {
      console.error("Exceção no login admin:", err);
      api.reportLoginResult(email.trim(), false).catch(() => {});
      setError(
        "Erro de conexão. Verifique sua internet e tente novamente."
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

      const result = await api.forgotPassword(forgotEmail.trim());
      console.log("[ForgotPassword] Server response:", result);

      if (result.recoveryId) {
        localStorage.setItem("recovery_id", result.recoveryId);
        localStorage.setItem("recovery_email", forgotEmail.trim());
      }

      setForgotSuccess(true);
    } catch (err: any) {
      console.error("Exceção ao solicitar recuperação:", err);
      if (err.message?.includes("rate limit") || err.message?.includes("429")) {
        setForgotError("Muitas tentativas. Aguarde alguns minutos e tente novamente.");
      } else {
        setForgotError("Erro de conexão. Tente novamente.");
      }
    } finally {
      setForgotLoading(false);
    }
  };

  const switchToForgot = () => {
    setMode("forgot");
    setForgotEmail(email);
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

  const handleBootstrap = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Preencha email e senha antes de ativar.");
      setShowBootstrap(false);
      return;
    }
    setBootstrapLoading(true);
    setError(null);
    try {
      const result = await api.bootstrapAdmin(email.trim(), password);
      if (result.ok) {
        console.log("[Bootstrap] Admin configured:", result.email);
        // Now sign in normally — the user is now an admin
        const { data, error: signInErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInErr || !data.session?.access_token) {
          setError("Admin configurado, mas erro ao fazer login. Tente novamente.");
          setShowBootstrap(false);
          return;
        }
        const userName = data.user?.user_metadata?.name || "Admin";
        const userEmail = data.user?.email || email;
        // Save admin tokens and clear Supabase local session
        saveAdminSession(
          data.session.access_token,
          data.session.refresh_token || "",
          data.session.expires_at || 0,
          userEmail,
          userName
        );
        clearSupabaseLocalSession();
        onLoginSuccess(data.session.access_token, userEmail, userName, true, ["*"]);
      } else {
        setError(result.error || "Erro ao configurar admin.");
        setShowBootstrap(false);
      }
    } catch (err: any) {
      console.error("[Bootstrap] Error:", err);
      setError(err.message || "Erro ao configurar admin.");
      setShowBootstrap(false);
    } finally {
      setBootstrapLoading(false);
    }
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
                  alt="Carretão Auto Peças"
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
                  Faça login para acessar o painel
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
            {showBootstrap ? (
              /* Bootstrap first admin */
              <div className="text-center py-2">
                <div className="bg-amber-900/30 border border-amber-700/50 rounded-xl p-5 mb-5">
                  <ShieldCheck className="w-10 h-10 text-amber-400 mx-auto mb-3" />
                  <p
                    className="text-amber-300 mb-2"
                    style={{ fontSize: "0.95rem", fontWeight: 600 }}
                  >
                    Configurar Primeiro Administrador
                  </p>
                  <p
                    className="text-amber-400/70 leading-relaxed"
                    style={{ fontSize: "0.8rem" }}
                  >
                    Nenhum administrador foi configurado ainda. Deseja ativar{" "}
                    <span className="text-amber-300 font-medium">{email}</span>{" "}
                    como administrador do painel?
                  </p>
                </div>

                {error && (
                  <div className="bg-red-900/30 border border-red-800/50 rounded-xl p-4 mb-4 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-red-300" style={{ fontSize: "0.85rem" }}>
                      {error}
                    </p>
                  </div>
                )}

                <button
                  onClick={handleBootstrap}
                  disabled={bootstrapLoading}
                  className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-amber-800 disabled:cursor-not-allowed text-white py-3 rounded-xl flex items-center justify-center gap-2 transition-colors mb-3"
                  style={{ fontSize: "0.95rem", fontWeight: 600 }}
                >
                  {bootstrapLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Configurando...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-5 h-5" />
                      Sim, ativar como admin
                    </>
                  )}
                </button>

                <button
                  onClick={() => {
                    setShowBootstrap(false);
                    setError(null);
                  }}
                  className="inline-flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors"
                  style={{ fontSize: "0.85rem" }}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Voltar ao login
                </button>
              </div>
            ) : mode === "login" ? (
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
                  {/* Honeypot — hidden from humans */}
                  <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", top: "-9999px", opacity: 0, height: 0, overflow: "hidden" }}>
                    <label htmlFor="fax_number_admin">Fax</label>
                    <input type="text" id="fax_number_admin" name="fax_number" tabIndex={-1} autoComplete="off" />
                  </div>
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
                    Enviamos um <span className="text-green-300 font-medium">link de verificação</span> para{" "}
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
                  onClick={() => {}}
                >
                  <KeyRound className="w-4 h-4" />
                  Aguardar verificação
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
                      Você receberá um e-mail com um link para verificar sua
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
                        Enviar link de recuperação
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
            <p
              className="text-gray-600 mt-1.5 leading-relaxed"
              style={{ fontSize: "0.65rem" }}
            >
              Este site é protegido pelo reCAPTCHA e a{" "}
              <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-400">
                Política de Privacidade
              </a>{" "}
              e{" "}
              <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-400">
                Termos de Serviço
              </a>{" "}
              do Google se aplicam.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}