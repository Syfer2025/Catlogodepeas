import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router";
import {
  User,
  Mail,
  Phone,
  MapPin,
  Lock,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  LogOut,
  Save,
  ShieldCheck,
  Package,
  ChevronRight,
  FileText,
  CreditCard,
  ExternalLink,
} from "lucide-react";
import { supabase } from "../services/supabaseClient";
import * as api from "../services/api";

type ActiveTab = "perfil" | "senha" | "pedidos";

interface UserProfile {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: string;
  cpf: string;
  address: string;
  city: string;
  state: string;
  cep: string;
  created_at: string;
}

const ESTADOS_BR = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA",
  "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN",
  "RO", "RR", "RS", "SC", "SE", "SP", "TO",
];

export function UserAccountPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<ActiveTab>("perfil");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // Profile data
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [cep, setCep] = useState("");

  // Password change (via email link)
  const [sendingReset, setSendingReset] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  // Phone mask
  const formatPhone = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  // CPF mask
  const formatCpf = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  };

  // CEP mask
  const formatCep = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 8);
    if (digits.length <= 5) return digits;
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  };

  // Load profile
  const loadProfile = useCallback(async (token: string) => {
    try {
      const data = await api.userMe(token);
      setProfile(data);
      setName(data.name || "");
      setPhone(data.phone ? formatPhone(data.phone) : "");
      setCpf(data.cpf ? formatCpf(data.cpf) : "");
      setAddress(data.address || "");
      setCity(data.city || "");
      setState(data.state || "");
      setCep(data.cep ? formatCep(data.cep) : "");
    } catch (err: any) {
      console.error("Load profile error:", err);
      // If token is invalid/expired, try refreshing the session once
      try {
        const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
        if (refreshErr || !refreshData.session?.access_token) {
          console.error("Session refresh failed, redirecting to login");
          await supabase.auth.signOut();
          return "redirect";
        }
        const freshToken = refreshData.session.access_token;
        setAccessToken(freshToken);
        const data = await api.userMe(freshToken);
        setProfile(data);
        setName(data.name || "");
        setPhone(data.phone ? formatPhone(data.phone) : "");
        setCpf(data.cpf ? formatCpf(data.cpf) : "");
        setAddress(data.address || "");
        setCity(data.city || "");
        setState(data.state || "");
        setCep(data.cep ? formatCep(data.cep) : "");
      } catch (retryErr: any) {
        console.error("Retry after refresh also failed:", retryErr);
        await supabase.auth.signOut();
        return "redirect";
      }
    }
    return "ok";
  }, []);

  // Check auth on mount
  useEffect(() => {
    let cancelled = false;

    async function init() {
      // First try refreshing the session to ensure we have a valid token
      const { data: refreshData } = await supabase.auth.refreshSession();
      let session = refreshData?.session;

      // If refresh didn't work, fall back to getSession
      if (!session?.access_token) {
        const { data: sessionData } = await supabase.auth.getSession();
        session = sessionData?.session;
      }

      if (!session?.access_token) {
        if (!cancelled) navigate("/conta", { replace: true });
        return;
      }

      if (!cancelled) {
        setAccessToken(session.access_token);
        const result = await loadProfile(session.access_token);
        if (result === "redirect" && !cancelled) {
          navigate("/conta", { replace: true });
        }
        if (!cancelled) setLoading(false);
      }
    }

    init();

    // Also listen for token refreshes to keep accessToken up to date
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED" && session?.access_token) {
        setAccessToken(session.access_token);
      }
      if (event === "SIGNED_OUT") {
        navigate("/conta", { replace: true });
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [navigate, loadProfile]);

  // Save profile
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!accessToken) return;
    if (!name.trim()) {
      setError("O nome e obrigatorio.");
      return;
    }

    setSaving(true);
    try {
      await api.userUpdateProfile(accessToken, {
        name: name.trim(),
        phone: phone.replace(/\D/g, ""),
        cpf: cpf.replace(/\D/g, ""),
        address: address.trim(),
        city: city.trim(),
        state,
        cep: cep.replace(/\D/g, ""),
      });
      setSuccess("Perfil atualizado com sucesso!");
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      console.error("Save profile error:", err);
      setError(err.message || "Erro ao salvar perfil.");
    } finally {
      setSaving(false);
    }
  };

  // Send password reset email
  const handleSendPasswordReset = async () => {
    if (!profile?.email) return;
    setError(null);
    setSuccess(null);
    setSendingReset(true);

    try {
      const result = await api.userForgotPassword(profile.email);
      if (result.recoveryId) {
        localStorage.setItem("recovery_id", result.recoveryId);
        localStorage.setItem("recovery_email", profile.email);
      }
      setResetEmailSent(true);
    } catch (err: any) {
      console.error("Send password reset error:", err);
      setError(err.message || "Erro ao enviar email de redefinicao.");
    } finally {
      setSendingReset(false);
    }
  };

  // Logout
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/conta", { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
      </div>
    );
  }

  const menuItems = [
    { key: "perfil" as ActiveTab, label: "Meus Dados", icon: User, desc: "Informacoes pessoais" },
    { key: "senha" as ActiveTab, label: "Alterar Senha", icon: Lock, desc: "Seguranca da conta" },
    { key: "pedidos" as ActiveTab, label: "Meus Pedidos", icon: Package, desc: "Historico de compras" },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6 text-gray-500" style={{ fontSize: "0.8rem" }}>
        <Link to="/" className="hover:text-red-600 transition-colors">Inicio</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-gray-800 font-medium">Minha Conta</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="bg-red-100 rounded-full w-14 h-14 flex items-center justify-center">
            <User className="w-7 h-7 text-red-600" />
          </div>
          <div>
            <h1 className="text-gray-900" style={{ fontSize: "1.5rem", fontWeight: 700 }}>
              Ola, {profile?.name?.split(" ")[0] || "Usuario"}!
            </h1>
            <p className="text-gray-500" style={{ fontSize: "0.85rem" }}>
              {profile?.email}
            </p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="hidden sm:flex items-center gap-2 px-4 py-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
          style={{ fontSize: "0.85rem", fontWeight: 500 }}
        >
          <LogOut className="w-4 h-4" />
          Sair
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <nav className="divide-y divide-gray-100">
              {menuItems.map((item) => (
                <button
                  key={item.key}
                  onClick={() => { setActiveTab(item.key); setError(null); setSuccess(null); }}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 transition-all cursor-pointer ${
                    activeTab === item.key
                      ? "bg-red-50 border-l-3 border-red-600"
                      : "hover:bg-gray-50 border-l-3 border-transparent"
                  }`}
                >
                  <item.icon
                    className={`w-5 h-5 shrink-0 ${
                      activeTab === item.key ? "text-red-600" : "text-gray-400"
                    }`}
                  />
                  <div className="text-left">
                    <p
                      className={activeTab === item.key ? "text-red-700" : "text-gray-700"}
                      style={{ fontSize: "0.9rem", fontWeight: 600 }}
                    >
                      {item.label}
                    </p>
                    <p className="text-gray-400" style={{ fontSize: "0.72rem" }}>
                      {item.desc}
                    </p>
                  </div>
                </button>
              ))}
            </nav>

            {/* Logout mobile */}
            <div className="border-t border-gray-100 p-3 sm:hidden">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                style={{ fontSize: "0.85rem", fontWeight: 500 }}
              >
                <LogOut className="w-4 h-4" />
                Sair da Conta
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="lg:col-span-3">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-red-700" style={{ fontSize: "0.85rem" }}>{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-5 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
              <p className="text-green-700" style={{ fontSize: "0.85rem" }}>{success}</p>
            </div>
          )}

          {/* ─── PERFIL TAB ─── */}
          {activeTab === "perfil" && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
                <User className="w-5 h-5 text-red-600" />
                <h2 className="text-gray-900" style={{ fontSize: "1.1rem", fontWeight: 600 }}>
                  Dados Pessoais
                </h2>
              </div>

              <form onSubmit={handleSaveProfile} className="p-6 space-y-5">
                {/* Nome + Email */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                      Nome Completo *
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-800 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all"
                      style={{ fontSize: "0.9rem" }}
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                      Email
                    </label>
                    <input
                      type="email"
                      value={profile?.email || ""}
                      disabled
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-gray-400 bg-gray-50"
                      style={{ fontSize: "0.9rem" }}
                    />
                    <p className="text-gray-400 mt-1" style={{ fontSize: "0.7rem" }}>
                      O email nao pode ser alterado.
                    </p>
                  </div>
                </div>

                {/* Telefone + CPF */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                      Telefone / WhatsApp
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(formatPhone(e.target.value))}
                        placeholder="(00) 00000-0000"
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-gray-800 placeholder-gray-400 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all"
                        style={{ fontSize: "0.9rem" }}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                      CPF
                    </label>
                    <div className="relative">
                      <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={cpf}
                        onChange={(e) => setCpf(formatCpf(e.target.value))}
                        placeholder="000.000.000-00"
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-gray-800 placeholder-gray-400 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all"
                        style={{ fontSize: "0.9rem" }}
                      />
                    </div>
                  </div>
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3 pt-2">
                  <MapPin className="w-4 h-4 text-red-600" />
                  <h3 className="text-gray-800" style={{ fontSize: "0.95rem", fontWeight: 600 }}>
                    Endereco
                  </h3>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>

                {/* Endereco */}
                <div>
                  <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                    Endereco Completo
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Rua, numero, complemento"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-800 placeholder-gray-400 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all"
                    style={{ fontSize: "0.9rem" }}
                  />
                </div>

                {/* Cidade + Estado + CEP */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                      Cidade
                    </label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Sua cidade"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-800 placeholder-gray-400 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all"
                      style={{ fontSize: "0.9rem" }}
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                      Estado
                    </label>
                    <select
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-800 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all bg-white"
                      style={{ fontSize: "0.9rem" }}
                    >
                      <option value="">Selecione</option>
                      {ESTADOS_BR.map((uf) => (
                        <option key={uf} value={uf}>{uf}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                      CEP
                    </label>
                    <input
                      type="text"
                      value={cep}
                      onChange={(e) => setCep(formatCep(e.target.value))}
                      placeholder="00000-000"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-800 placeholder-gray-400 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all"
                      style={{ fontSize: "0.9rem" }}
                    />
                  </div>
                </div>

                {/* Save */}
                <div className="flex justify-end pt-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white px-6 py-2.5 rounded-lg transition-colors cursor-pointer"
                    style={{ fontSize: "0.9rem", fontWeight: 600 }}
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    Salvar Dados
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ─── SENHA TAB ─── */}
          {activeTab === "senha" && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-red-600" />
                <h2 className="text-gray-900" style={{ fontSize: "1.1rem", fontWeight: 600 }}>
                  Alterar Senha
                </h2>
              </div>

              <div className="p-6">
                {!resetEmailSent ? (
                  <div className="max-w-lg">
                    {/* Security explanation */}
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
                      <div className="flex items-start gap-3">
                        <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-amber-800 mb-1" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                            Protecao extra para sua conta
                          </p>
                          <p className="text-amber-700 leading-relaxed" style={{ fontSize: "0.8rem" }}>
                            Por seguranca, a alteracao de senha e feita por email. Enviaremos um link
                            de redefinicao para <strong>{profile?.email}</strong>. Assim, mesmo que
                            alguem acesse sua conta, nao podera alterar a senha sem acesso ao seu email.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Steps */}
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-6">
                      <p className="text-gray-700 mb-3" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                        Como funciona:
                      </p>
                      <ol className="text-gray-600 space-y-2.5" style={{ fontSize: "0.8rem" }}>
                        <li className="flex items-start gap-2.5">
                          <span className="bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center shrink-0 mt-0.5" style={{ fontSize: "0.7rem", fontWeight: 700 }}>1</span>
                          Clique no botao abaixo para solicitar a redefinicao
                        </li>
                        <li className="flex items-start gap-2.5">
                          <span className="bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center shrink-0 mt-0.5" style={{ fontSize: "0.7rem", fontWeight: 700 }}>2</span>
                          Abra o email e clique no link de redefinicao
                        </li>
                        <li className="flex items-start gap-2.5">
                          <span className="bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center shrink-0 mt-0.5" style={{ fontSize: "0.7rem", fontWeight: 700 }}>3</span>
                          Defina sua nova senha na pagina que abrira
                        </li>
                      </ol>
                    </div>

                    <button
                      onClick={handleSendPasswordReset}
                      disabled={sendingReset}
                      className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl transition-colors cursor-pointer"
                      style={{ fontSize: "0.95rem", fontWeight: 600 }}
                    >
                      {sendingReset ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Enviando...
                        </>
                      ) : (
                        <>
                          <Mail className="w-5 h-5" />
                          Enviar Link de Redefinicao
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="max-w-lg">
                    <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-6 text-center">
                      <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
                      <p className="text-green-800 mb-2" style={{ fontSize: "1rem", fontWeight: 600 }}>
                        Email enviado com sucesso!
                      </p>
                      <p className="text-green-700 mb-3" style={{ fontSize: "0.85rem" }}>
                        Enviamos um link de redefinicao para:
                      </p>
                      <p className="text-green-900 bg-green-100 inline-block px-4 py-1.5 rounded-lg" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                        {profile?.email}
                      </p>
                    </div>

                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-6">
                      <p className="text-gray-600 leading-relaxed" style={{ fontSize: "0.8rem" }}>
                        Abra seu email, clique no link de redefinicao e depois acesse a pagina abaixo
                        para definir sua nova senha. O link expira em 10 minutos.
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                      <Link
                        to="/conta/redefinir-senha"
                        className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl transition-colors"
                        style={{ fontSize: "0.95rem", fontWeight: 600 }}
                      >
                        <ExternalLink className="w-4 h-4" />
                        Ir para Redefinicao de Senha
                      </Link>

                      <button
                        onClick={() => setResetEmailSent(false)}
                        className="flex items-center justify-center gap-2 border border-gray-300 text-gray-600 hover:bg-gray-50 px-5 py-3 rounded-xl transition-colors cursor-pointer"
                        style={{ fontSize: "0.85rem", fontWeight: 500 }}
                      >
                        Enviar novamente
                      </button>
                    </div>

                    <p className="text-gray-400 mt-4" style={{ fontSize: "0.75rem" }}>
                      Nao recebeu? Verifique sua pasta de spam ou lixo eletronico.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── PEDIDOS TAB ─── */}
          {activeTab === "pedidos" && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
                <Package className="w-5 h-5 text-red-600" />
                <h2 className="text-gray-900" style={{ fontSize: "1.1rem", fontWeight: 600 }}>
                  Meus Pedidos
                </h2>
              </div>

              <div className="p-12 text-center">
                <div className="bg-gray-50 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-10 h-10 text-gray-300" />
                </div>
                <p className="text-gray-800 mb-2" style={{ fontSize: "1rem", fontWeight: 600 }}>
                  Nenhum pedido encontrado
                </p>
                <p className="text-gray-500 mb-6" style={{ fontSize: "0.85rem" }}>
                  Seus pedidos apareceram aqui quando voce fizer uma compra.
                </p>
                <Link
                  to="/catalogo"
                  className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-lg transition-colors"
                  style={{ fontSize: "0.9rem", fontWeight: 600 }}
                >
                  Ver Catalogo
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}