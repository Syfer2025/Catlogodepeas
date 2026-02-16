import { useState } from "react";
import { Link } from "react-router";
import { Wrench, Mail, Lock, Loader2, AlertTriangle, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { supabase } from "../../services/supabaseClient";

interface AdminLoginPageProps {
  onLoginSuccess: (accessToken: string, userEmail: string, userName: string) => void;
}

export function AdminLoginPage({ onLoginSuccess }: AdminLoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password.trim()) {
      setError("Preencha todos os campos.");
      return;
    }

    setLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        console.error("Erro de autenticação no login admin:", authError.message);
        if (authError.message.includes("Invalid login credentials")) {
          setError("Email ou senha incorretos.");
        } else if (authError.message.includes("Email not confirmed")) {
          setError("Email ainda não confirmado.");
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
        setError("Sessão não retornada. Tente novamente.");
      }
    } catch (err: any) {
      console.error("Exceção no login admin:", err);
      setError("Erro de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setLoading(false);
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

        {/* Login Card */}
        <div className="bg-gray-800 rounded-2xl border border-gray-700 shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gray-800 border-b border-gray-700 px-8 pt-8 pb-6 text-center">
            <div className="flex items-center justify-center gap-2.5 mb-4">
              <div className="bg-red-600 rounded-xl p-2.5">
                <Wrench className="w-6 h-6 text-white" />
              </div>
              <div className="text-left">
                <div>
                  <span className="text-red-500" style={{ fontSize: "1.3rem", fontWeight: 700 }}>Auto</span>
                  <span className="text-white" style={{ fontSize: "1.3rem", fontWeight: 700 }}>Parts</span>
                </div>
              </div>
            </div>
            <h1 className="text-white mb-1" style={{ fontSize: "1.25rem", fontWeight: 600 }}>
              Painel Administrativo
            </h1>
            <p className="text-gray-400" style={{ fontSize: "0.85rem" }}>
              Faça login para acessar o painel
            </p>
          </div>

          {/* Form */}
          <div className="p-8">
            {/* Error */}
            {error && (
              <div className="bg-red-900/30 border border-red-800/50 rounded-xl p-4 mb-6 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <p className="text-red-300" style={{ fontSize: "0.85rem" }}>{error}</p>
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
                    placeholder="admin@autoparts.com.br"
                    className="w-full pl-11 pr-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white placeholder-gray-500 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all"
                    style={{ fontSize: "0.9rem" }}
                    autoComplete="email"
                    disabled={loading}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label
                  htmlFor="password"
                  className="block text-gray-300 mb-2"
                  style={{ fontSize: "0.85rem", fontWeight: 500 }}
                >
                  Senha
                </label>
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
                    {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
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
