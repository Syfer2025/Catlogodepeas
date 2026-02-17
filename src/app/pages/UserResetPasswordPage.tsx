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
import { supabase } from "../services/supabaseClient";
import * as api from "../services/api";

const POLL_INTERVAL = 3000;

type PageMode = "waiting" | "password" | "no-session" | "success";

export function UserResetPasswordPage() {
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
  const ridRef = useRef<string | null>(null);

  // Start polling
  useEffect(() => {
    const rid = localStorage.getItem("recovery_id");

    if (!rid) {
      console.log("[UserResetPassword] No recovery_id in localStorage");
      setMode("no-session");
      return;
    }

    ridRef.current = rid;
    console.log("[UserResetPassword] Starting polling for rid:", rid);

    const poll = async () => {
      try {
        const result = await api.recoveryStatus(rid);
        setPollCount((c) => c + 1);

        if (result.status === "verified") {
          console.log("[UserResetPassword] Recovery verified!");
          if (pollRef.current) clearInterval(pollRef.current);
          setMode("password");
        } else if (result.status === "expired" || result.status === "not_found") {
          console.log("[UserResetPassword] Recovery expired or not found");
          if (pollRef.current) clearInterval(pollRef.current);
          localStorage.removeItem("recovery_id");
          localStorage.removeItem("recovery_email");
          ridRef.current = null;
          setMode("no-session");
        }
      } catch (err) {
        console.error("[UserResetPassword] Poll error:", err);
      }
    };

    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL);

    const timeout = setTimeout(() => {
      if (pollRef.current) clearInterval(pollRef.current);
      setMode("no-session");
    }, 600000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      clearTimeout(timeout);
    };
  }, []);

  // Password validation
  const validatePassword = (): string | null => {
    if (newPassword.length < 6) return "A senha deve ter pelo menos 6 caracteres.";
    if (newPassword !== confirmPassword) return "As senhas nao coincidem.";
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
      setError("Sessao de recuperacao perdida. Tente novamente.");
      setMode("no-session");
      return;
    }

    setLoading(true);
    try {
      const result = await api.resetPassword(rid, newPassword);
      if (result.error) {
        setError(result.error);
        return;
      }

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
        } catch {}
      }

      setMode("success");
      setTimeout(() => navigate("/minha-conta"), 3000);
    } catch (err: any) {
      console.error("Reset password error:", err);
      setError(err.message || "Erro de conexao. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  // Password strength
  const getStrength = () => {
    if (!newPassword) return { level: 0, label: "", color: "" };
    let s = 0;
    if (newPassword.length >= 6) s++;
    if (newPassword.length >= 8) s++;
    if (/[A-Z]/.test(newPassword)) s++;
    if (/[0-9]/.test(newPassword)) s++;
    if (/[^A-Za-z0-9]/.test(newPassword)) s++;
    if (s <= 1) return { level: 1, label: "Fraca", color: "bg-red-500" };
    if (s <= 2) return { level: 2, label: "Razoavel", color: "bg-orange-500" };
    if (s <= 3) return { level: 3, label: "Boa", color: "bg-yellow-500" };
    if (s <= 4) return { level: 4, label: "Forte", color: "bg-green-500" };
    return { level: 5, label: "Excelente", color: "bg-emerald-500" };
  };

  const strength = getStrength();

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link
          to="/conta"
          className="inline-flex items-center gap-1.5 text-gray-500 hover:text-red-600 transition-colors mb-6"
          style={{ fontSize: "0.85rem" }}
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar ao login
        </Link>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-red-600 to-red-700 px-8 py-6 text-center">
            <ShieldCheck className="w-8 h-8 text-white mx-auto mb-2" />
            <h1 className="text-white" style={{ fontSize: "1.2rem", fontWeight: 700 }}>
              Redefinir Senha
            </h1>
            <p className="text-red-100 mt-1" style={{ fontSize: "0.8rem" }}>
              {mode === "waiting"
                ? "Aguardando verificacao por email"
                : mode === "no-session"
                ? "Sessao nao encontrada"
                : mode === "success"
                ? "Senha alterada com sucesso!"
                : "Defina sua nova senha"}
            </p>
          </div>

          {/* Content */}
          <div className="p-8">
            {/* Waiting */}
            {mode === "waiting" && (
              <div className="text-center py-4">
                <div className="relative mx-auto w-16 h-16 mb-5">
                  <Mail className="w-10 h-10 text-red-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                  <div className="absolute inset-0 border-3 border-gray-200 border-t-red-500 rounded-full animate-spin" />
                </div>
                <p className="text-gray-700 mb-2" style={{ fontSize: "0.95rem", fontWeight: 500 }}>
                  Aguardando verificacao...
                </p>
                <p className="text-gray-500 leading-relaxed" style={{ fontSize: "0.8rem" }}>
                  Abra seu email e clique no link de recuperacao. Esta pagina detectara automaticamente.
                </p>
                <div className="mt-4 flex items-center justify-center gap-2 text-gray-400" style={{ fontSize: "0.75rem" }}>
                  <div className="w-2 h-2 bg-red-500/60 rounded-full animate-pulse" />
                  Verificando a cada {POLL_INTERVAL / 1000}s...
                  {pollCount > 0 && <span className="text-gray-300">({pollCount})</span>}
                </div>
              </div>
            )}

            {/* No session */}
            {mode === "no-session" && (
              <div className="text-center py-4">
                <div className="bg-red-50 border border-red-200 rounded-xl p-5 mb-5">
                  <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-3" />
                  <p className="text-red-700 mb-1" style={{ fontSize: "0.95rem", fontWeight: 600 }}>
                    Sessao de recuperacao nao encontrada
                  </p>
                  <p className="text-red-500" style={{ fontSize: "0.8rem" }}>
                    Use "Esqueci minha senha" na tela de login para iniciar o processo.
                  </p>
                </div>
                <Link
                  to="/conta"
                  className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl transition-colors"
                  style={{ fontSize: "0.9rem", fontWeight: 600 }}
                >
                  <ArrowLeft className="w-4 h-4" />
                  Ir para o login
                </Link>
              </div>
            )}

            {/* Password Form */}
            {mode === "password" && (
              <>
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-5 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                  <p className="text-green-700" style={{ fontSize: "0.8rem" }}>
                    Identidade verificada! Defina sua nova senha abaixo.
                  </p>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-red-700" style={{ fontSize: "0.85rem" }}>{error}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                      Nova Senha
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
                      <input
                        type={showPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimo 6 caracteres"
                        className="w-full pl-11 pr-12 py-3 border border-gray-300 rounded-xl text-gray-800 placeholder-gray-400 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all"
                        style={{ fontSize: "0.9rem" }}
                        autoComplete="new-password"
                        autoFocus
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer">
                        {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                      </button>
                    </div>
                    {newPassword && (
                      <div className="mt-2">
                        <div className="flex gap-1 mb-1">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= strength.level ? strength.color : "bg-gray-200"}`} />
                          ))}
                        </div>
                        <p className="text-gray-500" style={{ fontSize: "0.7rem" }}>
                          Forca: <span className="text-gray-600">{strength.label}</span>
                        </p>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                      Confirmar Nova Senha
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
                      <input
                        type={showConfirm ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repita a nova senha"
                        className={`w-full pl-11 pr-12 py-3 border rounded-xl text-gray-800 placeholder-gray-400 outline-none focus:ring-2 transition-all ${
                          confirmPassword && confirmPassword !== newPassword
                            ? "border-red-400 focus:border-red-500 focus:ring-red-500/20"
                            : confirmPassword && confirmPassword === newPassword
                            ? "border-green-400 focus:border-green-500 focus:ring-green-500/20"
                            : "border-gray-300 focus:border-red-500 focus:ring-red-500/20"
                        }`}
                        style={{ fontSize: "0.9rem" }}
                        autoComplete="new-password"
                      />
                      <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer">
                        {showConfirm ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                      </button>
                    </div>
                    {confirmPassword && confirmPassword !== newPassword && (
                      <p className="text-red-500 mt-1" style={{ fontSize: "0.75rem" }}>As senhas nao coincidem</p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !newPassword || !confirmPassword}
                    className="w-full bg-red-600 hover:bg-red-700 disabled:bg-red-400 disabled:cursor-not-allowed text-white py-3 rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
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

            {/* Success */}
            {mode === "success" && (
              <div className="text-center py-4">
                <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-5">
                  <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
                  <p className="text-green-800 mb-1" style={{ fontSize: "0.95rem", fontWeight: 600 }}>
                    Senha redefinida com sucesso!
                  </p>
                  <p className="text-green-600" style={{ fontSize: "0.8rem" }}>
                    Voce sera redirecionado a sua conta...
                  </p>
                </div>
                <Loader2 className="w-5 h-5 text-green-500 animate-spin mx-auto" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
