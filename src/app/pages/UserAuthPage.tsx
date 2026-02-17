import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Phone,
  ArrowRight,
  ShieldCheck,
  CreditCard,
} from "lucide-react";
import { supabase } from "../services/supabaseClient";
import * as api from "../services/api";

type Tab = "login" | "register";
type ForgotStep = "idle" | "form" | "sent";
type RegisterStep = "form" | "email-sent";

export function UserAuthPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("login");
  const [registerStep, setRegisterStep] = useState<RegisterStep>("form");
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Login fields
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPass, setShowLoginPass] = useState(false);

  // Register fields
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regEmailConfirm, setRegEmailConfirm] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regCpf, setRegCpf] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPasswordConfirm, setRegPasswordConfirm] = useState("");
  const [showRegPass, setShowRegPass] = useState(false);
  const [showRegConfirm, setShowRegConfirm] = useState(false);

  // Field touch tracking (show validation only after user interacted)
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});
  const markTouched = (field: string) => setTouchedFields((prev) => ({ ...prev, [field]: true }));

  // Forgot password
  const [forgotStep, setForgotStep] = useState<ForgotStep>("idle");
  const [forgotEmail, setForgotEmail] = useState("");

  // Check if already logged in
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.access_token) {
        navigate("/minha-conta", { replace: true });
      }
    });
  }, [navigate]);

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

  // ─── Validators ───

  const validateCpf = (cpf: string): { valid: boolean; message: string } => {
    const digits = cpf.replace(/\D/g, "");
    if (!digits) return { valid: false, message: "" };
    if (digits.length < 11) return { valid: false, message: "CPF incompleto" };
    if (digits.length > 11) return { valid: false, message: "CPF inválido" };
    // All same digits check
    if (/^(\d)\1{10}$/.test(digits)) return { valid: false, message: "CPF inválido" };
    // First check digit
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
    let remainder = (sum * 10) % 11;
    if (remainder === 10) remainder = 0;
    if (remainder !== parseInt(digits[9])) return { valid: false, message: "CPF inválido" };
    // Second check digit
    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
    remainder = (sum * 10) % 11;
    if (remainder === 10) remainder = 0;
    if (remainder !== parseInt(digits[10])) return { valid: false, message: "CPF inválido" };
    return { valid: true, message: "CPF válido" };
  };

  const validatePhone = (phone: string): { valid: boolean; message: string } => {
    const digits = phone.replace(/\D/g, "");
    if (!digits) return { valid: false, message: "" };
    if (digits.length < 10) return { valid: false, message: "Telefone incompleto" };
    if (digits.length > 11) return { valid: false, message: "Telefone inválido" };
    const ddd = parseInt(digits.slice(0, 2));
    if (ddd < 11 || ddd > 99) return { valid: false, message: "DDD inválido" };
    // List of valid DDDs in Brazil
    const validDDDs = [
      11, 12, 13, 14, 15, 16, 17, 18, 19, // SP
      21, 22, 24, // RJ
      27, 28, // ES
      31, 32, 33, 34, 35, 37, 38, // MG
      41, 42, 43, 44, 45, 46, // PR
      47, 48, 49, // SC
      51, 53, 54, 55, // RS
      61, // DF
      62, 64, // GO
      63, // TO
      65, 66, // MT
      67, // MS
      68, // AC
      69, // RO
      71, 73, 74, 75, 77, // BA
      79, // SE
      81, 87, // PE
      82, // AL
      83, // PB
      84, // RN
      85, 88, // CE
      86, 89, // PI
      91, 93, 94, // PA
      92, 97, // AM
      95, // RR
      96, // AP
      98, 99, // MA
    ];
    if (!validDDDs.includes(ddd)) return { valid: false, message: "DDD inválido" };
    if (digits.length === 11 && digits[2] !== "9") return { valid: false, message: "Celular deve começar com 9" };
    if (digits.length === 10) {
      const firstDigit = parseInt(digits[2]);
      if (firstDigit < 2 || firstDigit > 5) return { valid: false, message: "Número fixo inválido" };
    }
    return { valid: true, message: "Telefone válido" };
  };

  const validateEmail = (email: string): { valid: boolean; message: string } => {
    if (!email.trim()) return { valid: false, message: "" };
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email.trim())) return { valid: false, message: "Email inválido" };
    // Additional checks
    if (email.includes("..")) return { valid: false, message: "Email inválido" };
    const domain = email.split("@")[1];
    if (!domain || domain.startsWith(".") || domain.endsWith(".")) return { valid: false, message: "Email inválido" };
    return { valid: true, message: "Email válido" };
  };

  // Pre-compute validations for real-time feedback
  const cpfValidation = validateCpf(regCpf);
  const phoneValidation = validatePhone(regPhone);
  const emailValidation = validateEmail(regEmail);

  // ─── Login ───
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!loginEmail || !loginPassword) {
      setError("Preencha email e senha.");
      return;
    }

    setLoading(true);
    try {
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword,
      });

      if (authErr) {
        if (authErr.message.includes("Invalid login")) {
          setError("Email ou senha incorretos.");
        } else if (authErr.message.toLowerCase().includes("email not confirmed") || authErr.message.toLowerCase().includes("not confirmed")) {
          setError("Seu email ainda não foi confirmado. Verifique sua caixa de entrada e clique no link de confirmação que enviamos.");
        } else {
          setError(authErr.message);
        }
        return;
      }

      if (data.session?.access_token) {
        navigate("/minha-conta", { replace: true });
      }
    } catch (err: any) {
      console.error("Login error:", err);
      setError(err.message || "Erro ao fazer login.");
    } finally {
      setLoading(false);
    }
  };

  // ─── Register ───
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!regName.trim()) {
      setError("Informe seu nome completo.");
      return;
    }
    if (!regEmail.trim()) {
      setError("Informe seu email.");
      return;
    }
    if (!emailValidation.valid) {
      setError("Informe um email válido.");
      return;
    }
    if (regEmail.trim().toLowerCase() !== regEmailConfirm.trim().toLowerCase()) {
      setError("Os emails não coincidem.");
      return;
    }
    const phoneDigits = regPhone.replace(/\D/g, "");
    if (phoneDigits.length > 0 && !phoneValidation.valid) {
      setError(phoneValidation.message || "Telefone inválido.");
      return;
    }
    const cpfDigits = regCpf.replace(/\D/g, "");
    if (!cpfDigits) {
      setError("Informe seu CPF.");
      return;
    }
    if (!cpfValidation.valid) {
      setError(cpfValidation.message || "CPF inválido.");
      return;
    }
    if (regPassword.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (regPassword !== regPasswordConfirm) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    try {
      await api.userSignup({
        email: regEmail.trim(),
        password: regPassword,
        name: regName.trim(),
        phone: regPhone.replace(/\D/g, ""),
        cpf: regCpf.replace(/\D/g, ""),
      });

      // Show email confirmation screen
      setRegisteredEmail(regEmail.trim());
      setRegisterStep("email-sent");
    } catch (err: any) {
      console.error("Register error:", err);
      setError(err.message || "Erro ao criar conta.");
    } finally {
      setLoading(false);
    }
  };

  // ─── Forgot Password ───
  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!forgotEmail.trim()) {
      setError("Informe seu email.");
      return;
    }

    setLoading(true);
    try {
      const result = await api.userForgotPassword(forgotEmail.trim());

      if (result.recoveryId) {
        localStorage.setItem("recovery_id", result.recoveryId);
        localStorage.setItem("recovery_email", forgotEmail.trim());
      }

      setForgotStep("sent");
    } catch (err: any) {
      console.error("Forgot password error:", err);
      setError(err.message || "Erro ao enviar email.");
    } finally {
      setLoading(false);
    }
  };

  // Password strength indicator
  const getStrength = (pwd: string) => {
    if (!pwd) return { level: 0, label: "", color: "" };
    let s = 0;
    if (pwd.length >= 6) s++;
    if (pwd.length >= 8) s++;
    if (/[A-Z]/.test(pwd)) s++;
    if (/[0-9]/.test(pwd)) s++;
    if (/[^A-Za-z0-9]/.test(pwd)) s++;
    if (s <= 1) return { level: 1, label: "Fraca", color: "bg-red-500" };
    if (s <= 2) return { level: 2, label: "Razoavel", color: "bg-orange-500" };
    if (s <= 3) return { level: 3, label: "Boa", color: "bg-yellow-500" };
    if (s <= 4) return { level: 4, label: "Forte", color: "bg-green-500" };
    return { level: 5, label: "Excelente", color: "bg-emerald-500" };
  };

  const strength = getStrength(regPassword);

  // ─── Forgot password modal ───
  if (forgotStep !== "idle") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-red-600 to-red-700 px-8 py-6 text-center">
              <ShieldCheck className="w-8 h-8 text-white mx-auto mb-2" />
              <h2 className="text-white" style={{ fontSize: "1.2rem", fontWeight: 700 }}>
                Recuperar Senha
              </h2>
            </div>

            <div className="p-8">
              {forgotStep === "form" && (
                <>
                  {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5 flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                      <p className="text-red-700" style={{ fontSize: "0.85rem" }}>{error}</p>
                    </div>
                  )}

                  <p className="text-gray-600 mb-5" style={{ fontSize: "0.85rem" }}>
                    Informe seu email cadastrado. Enviaremos um link para redefinir sua senha.
                  </p>

                  <form onSubmit={handleForgot} className="space-y-4">
                    <div>
                      <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                        Email
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
                        <input
                          type="email"
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          placeholder="seu@email.com"
                          className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-xl text-gray-800 placeholder-gray-400 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all"
                          style={{ fontSize: "0.9rem" }}
                          autoFocus
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white py-3 rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
                      style={{ fontSize: "0.95rem", fontWeight: 600 }}
                    >
                      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Enviar Link"}
                    </button>
                  </form>

                  <button
                    onClick={() => { setForgotStep("idle"); setError(null); }}
                    className="w-full text-center mt-4 text-gray-500 hover:text-red-600 transition-colors cursor-pointer"
                    style={{ fontSize: "0.85rem" }}
                  >
                    Voltar ao login
                  </button>
                </>
              )}

              {forgotStep === "sent" && (
                <div className="text-center py-4">
                  <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-5">
                    <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
                    <p className="text-green-800 mb-1" style={{ fontSize: "0.95rem", fontWeight: 600 }}>
                      Email enviado!
                    </p>
                    <p className="text-green-600" style={{ fontSize: "0.8rem" }}>
                      Verifique sua caixa de entrada e clique no link de recuperação.
                    </p>
                  </div>

                  <Link
                    to="/conta/redefinir-senha"
                    className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl transition-colors"
                    style={{ fontSize: "0.9rem", fontWeight: 600 }}
                  >
                    Aguardar verificação
                    <ArrowRight className="w-4 h-4" />
                  </Link>

                  <button
                    onClick={() => { setForgotStep("idle"); setError(null); }}
                    className="block w-full text-center mt-4 text-gray-500 hover:text-red-600 transition-colors cursor-pointer"
                    style={{ fontSize: "0.85rem" }}
                  >
                    Voltar ao login
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Email confirmation screen after registration ───
  if (registerStep === "email-sent") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-red-600 to-red-700 px-8 py-6 text-center">
              <Mail className="w-8 h-8 text-white mx-auto mb-2" />
              <h2 className="text-white" style={{ fontSize: "1.2rem", fontWeight: 700 }}>
                Confirme seu Email
              </h2>
            </div>

            <div className="p-8">
              <div className="text-center py-4">
                <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-5">
                  <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
                  <p className="text-green-800 mb-2" style={{ fontSize: "1rem", fontWeight: 600 }}>
                    Conta criada com sucesso!
                  </p>
                  <p className="text-green-700 mb-3" style={{ fontSize: "0.85rem" }}>
                    Enviamos um email de confirmação para:
                  </p>
                  <p className="text-green-900 bg-green-100 inline-block px-4 py-1.5 rounded-lg" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                    {registeredEmail}
                  </p>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-5 text-left">
                  <p className="text-gray-700 mb-3" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                    Para ativar sua conta:
                  </p>
                  <ol className="text-gray-600 space-y-2" style={{ fontSize: "0.8rem" }}>
                    <li className="flex items-start gap-2">
                      <span className="bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center shrink-0 mt-0.5" style={{ fontSize: "0.7rem", fontWeight: 700 }}>1</span>
                      Abra sua caixa de entrada de email
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center shrink-0 mt-0.5" style={{ fontSize: "0.7rem", fontWeight: 700 }}>2</span>
                      Procure o email de "Carretão Auto Peças"
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center shrink-0 mt-0.5" style={{ fontSize: "0.7rem", fontWeight: 700 }}>3</span>
                      Clique no link de confirmação
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center shrink-0 mt-0.5" style={{ fontSize: "0.7rem", fontWeight: 700 }}>4</span>
                      Volte aqui e faça login
                    </li>
                  </ol>
                </div>

                <p className="text-gray-400 mb-5" style={{ fontSize: "0.75rem" }}>
                  Não recebeu? Verifique sua pasta de spam ou lixo eletrônico.
                </p>

                <button
                  onClick={() => {
                    setRegisterStep("form");
                    setTab("login");
                    setLoginEmail(registeredEmail);
                    setError(null);
                    setSuccess("Conta criada! Confirme seu email e faça login.");
                  }}
                  className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  style={{ fontSize: "0.95rem", fontWeight: 600 }}
                >
                  Ir para Login
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Tab switcher */}
        <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
          <button
            onClick={() => { setTab("login"); setError(null); setSuccess(null); }}
            className={`flex-1 py-2.5 rounded-lg transition-all cursor-pointer ${
              tab === "login"
                ? "bg-white text-red-600 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
            style={{ fontSize: "0.9rem", fontWeight: 600 }}
          >
            Entrar
          </button>
          <button
            onClick={() => { setTab("register"); setError(null); setSuccess(null); }}
            className={`flex-1 py-2.5 rounded-lg transition-all cursor-pointer ${
              tab === "register"
                ? "bg-white text-red-600 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
            style={{ fontSize: "0.9rem", fontWeight: 600 }}
          >
            Criar Conta
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-red-600 to-red-700 px-8 py-6 text-center">
            <div className="bg-white/20 rounded-full w-14 h-14 flex items-center justify-center mx-auto mb-3">
              <User className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-white" style={{ fontSize: "1.25rem", fontWeight: 700 }}>
              {tab === "login" ? "Acesse sua Conta" : "Crie sua Conta"}
            </h1>
            <p className="text-red-100 mt-1" style={{ fontSize: "0.8rem" }}>
              {tab === "login"
                ? "Entre com seu email e senha"
                : "Preencha os dados para se cadastrar"}
            </p>
          </div>

          {/* Content */}
          <div className="p-8">
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

            {/* ─── LOGIN FORM ─── */}
            {tab === "login" && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
                    <input
                      type="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="seu@email.com"
                      className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-xl text-gray-800 placeholder-gray-400 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all"
                      style={{ fontSize: "0.9rem" }}
                      autoComplete="email"
                      autoFocus
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                    Senha
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
                    <input
                      type={showLoginPass ? "text" : "password"}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Sua senha"
                      className="w-full pl-11 pr-12 py-3 border border-gray-300 rounded-xl text-gray-800 placeholder-gray-400 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all"
                      style={{ fontSize: "0.9rem" }}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPass(!showLoginPass)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                    >
                      {showLoginPass ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => { setForgotStep("form"); setForgotEmail(loginEmail); setError(null); }}
                    className="text-red-600 hover:text-red-700 transition-colors cursor-pointer"
                    style={{ fontSize: "0.8rem", fontWeight: 500 }}
                  >
                    Esqueci minha senha
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white py-3 rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  style={{ fontSize: "0.95rem", fontWeight: 600 }}
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Entrar
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* ─── REGISTER FORM ─── */}
            {tab === "register" && (
              <form onSubmit={handleRegister} className="space-y-4">
                {/* Nome */}
                <div>
                  <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                    Nome Completo *
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
                    <input
                      type="text"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="Seu nome completo"
                      className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-xl text-gray-800 placeholder-gray-400 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all"
                      style={{ fontSize: "0.9rem" }}
                      autoComplete="name"
                      autoFocus
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                    Email *
                  </label>
                  <div className="relative">
                    <Mail className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 ${touchedFields.email && emailValidation.valid ? "text-green-500" : "text-gray-400"}`} />
                    <input
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="seu@email.com"
                      className={`w-full pl-11 pr-10 py-3 border rounded-xl text-gray-800 placeholder-gray-400 outline-none focus:ring-2 transition-all ${
                        touchedFields.email && regEmail && !emailValidation.valid
                          ? "border-red-400 focus:border-red-500 focus:ring-red-500/20"
                          : touchedFields.email && emailValidation.valid
                          ? "border-green-400 focus:border-green-500 focus:ring-green-500/20"
                          : "border-gray-300 focus:border-red-500 focus:ring-red-500/20"
                      }`}
                      style={{ fontSize: "0.9rem" }}
                      autoComplete="email"
                      onBlur={() => markTouched("email")}
                    />
                    {touchedFields.email && emailValidation.valid && (
                      <CheckCircle2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-green-500" />
                    )}
                  </div>
                  {touchedFields.email && regEmail && !emailValidation.valid && emailValidation.message && (
                    <p className="text-red-500 mt-1" style={{ fontSize: "0.75rem" }}>
                      {emailValidation.message}
                    </p>
                  )}
                  {touchedFields.email && emailValidation.valid && (
                    <p className="text-green-600 mt-1" style={{ fontSize: "0.75rem" }}>
                      ✓ Email válido
                    </p>
                  )}
                </div>

                {/* Confirmar Email */}
                <div>
                  <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                    Confirmar Email *
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
                    <input
                      type="email"
                      value={regEmailConfirm}
                      onChange={(e) => setRegEmailConfirm(e.target.value)}
                      placeholder="Repita seu email"
                      className={`w-full pl-11 pr-4 py-3 border rounded-xl text-gray-800 placeholder-gray-400 outline-none focus:ring-2 transition-all ${
                        regEmailConfirm && regEmailConfirm.toLowerCase() !== regEmail.toLowerCase()
                          ? "border-red-400 focus:border-red-500 focus:ring-red-500/20"
                          : regEmailConfirm && regEmailConfirm.toLowerCase() === regEmail.toLowerCase()
                          ? "border-green-400 focus:border-green-500 focus:ring-green-500/20"
                          : "border-gray-300 focus:border-red-500 focus:ring-red-500/20"
                      }`}
                      style={{ fontSize: "0.9rem" }}
                    />
                  </div>
                  {regEmailConfirm && regEmailConfirm.toLowerCase() !== regEmail.toLowerCase() && (
                    <p className="text-red-500 mt-1" style={{ fontSize: "0.75rem" }}>
                      Os emails não coincidem
                    </p>
                  )}
                </div>

                {/* Telefone */}
                <div>
                  <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                    Telefone / WhatsApp
                  </label>
                  <div className="relative">
                    <Phone className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 ${touchedFields.phone && phoneValidation.valid ? "text-green-500" : "text-gray-400"}`} />
                    <input
                      type="tel"
                      value={regPhone}
                      onChange={(e) => setRegPhone(formatPhone(e.target.value))}
                      placeholder="(00) 00000-0000"
                      className={`w-full pl-11 pr-10 py-3 border rounded-xl text-gray-800 placeholder-gray-400 outline-none focus:ring-2 transition-all ${
                        touchedFields.phone && regPhone && !phoneValidation.valid
                          ? "border-red-400 focus:border-red-500 focus:ring-red-500/20"
                          : touchedFields.phone && phoneValidation.valid
                          ? "border-green-400 focus:border-green-500 focus:ring-green-500/20"
                          : "border-gray-300 focus:border-red-500 focus:ring-red-500/20"
                      }`}
                      style={{ fontSize: "0.9rem" }}
                      autoComplete="tel"
                      onBlur={() => markTouched("phone")}
                    />
                    {touchedFields.phone && phoneValidation.valid && (
                      <CheckCircle2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-green-500" />
                    )}
                  </div>
                  {touchedFields.phone && regPhone && !phoneValidation.valid && phoneValidation.message && (
                    <p className="text-red-500 mt-1" style={{ fontSize: "0.75rem" }}>
                      {phoneValidation.message}
                    </p>
                  )}
                  {touchedFields.phone && phoneValidation.valid && (
                    <p className="text-green-600 mt-1" style={{ fontSize: "0.75rem" }}>
                      ✓ Telefone válido
                    </p>
                  )}
                </div>

                {/* CPF */}
                <div>
                  <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                    CPF *
                  </label>
                  <div className="relative">
                    <CreditCard className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 ${touchedFields.cpf && cpfValidation.valid ? "text-green-500" : "text-gray-400"}`} />
                    <input
                      type="text"
                      value={regCpf}
                      onChange={(e) => setRegCpf(formatCpf(e.target.value))}
                      placeholder="000.000.000-00"
                      className={`w-full pl-11 pr-10 py-3 border rounded-xl text-gray-800 placeholder-gray-400 outline-none focus:ring-2 transition-all ${
                        touchedFields.cpf && regCpf && !cpfValidation.valid
                          ? "border-red-400 focus:border-red-500 focus:ring-red-500/20"
                          : touchedFields.cpf && cpfValidation.valid
                          ? "border-green-400 focus:border-green-500 focus:ring-green-500/20"
                          : "border-gray-300 focus:border-red-500 focus:ring-red-500/20"
                      }`}
                      style={{ fontSize: "0.9rem" }}
                      autoComplete="off"
                      onBlur={() => markTouched("cpf")}
                    />
                    {touchedFields.cpf && cpfValidation.valid && (
                      <CheckCircle2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-green-500" />
                    )}
                  </div>
                  {touchedFields.cpf && regCpf && !cpfValidation.valid && cpfValidation.message && (
                    <p className="text-red-500 mt-1" style={{ fontSize: "0.75rem" }}>
                      {cpfValidation.message}
                    </p>
                  )}
                  {touchedFields.cpf && cpfValidation.valid && (
                    <p className="text-green-600 mt-1" style={{ fontSize: "0.75rem" }}>
                      ✓ CPF válido
                    </p>
                  )}
                </div>

                {/* Senha */}
                <div>
                  <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                    Senha *
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
                    <input
                      type={showRegPass ? "text" : "password"}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full pl-11 pr-12 py-3 border border-gray-300 rounded-xl text-gray-800 placeholder-gray-400 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all"
                      style={{ fontSize: "0.9rem" }}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPass(!showRegPass)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                    >
                      {showRegPass ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                    </button>
                  </div>
                  {regPassword && (
                    <div className="mt-2">
                      <div className="flex gap-1 mb-1">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <div
                            key={i}
                            className={`h-1 flex-1 rounded-full transition-colors ${
                              i <= strength.level ? strength.color : "bg-gray-200"
                            }`}
                          />
                        ))}
                      </div>
                      <p className="text-gray-500" style={{ fontSize: "0.7rem" }}>
                        Força: <span className="text-gray-600">{strength.label}</span>
                      </p>
                    </div>
                  )}
                </div>

                {/* Confirmar Senha */}
                <div>
                  <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                    Confirmar Senha *
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
                    <input
                      type={showRegConfirm ? "text" : "password"}
                      value={regPasswordConfirm}
                      onChange={(e) => setRegPasswordConfirm(e.target.value)}
                      placeholder="Repita sua senha"
                      className={`w-full pl-11 pr-12 py-3 border rounded-xl text-gray-800 placeholder-gray-400 outline-none focus:ring-2 transition-all ${
                        regPasswordConfirm && regPasswordConfirm !== regPassword
                          ? "border-red-400 focus:border-red-500 focus:ring-red-500/20"
                          : regPasswordConfirm && regPasswordConfirm === regPassword
                          ? "border-green-400 focus:border-green-500 focus:ring-green-500/20"
                          : "border-gray-300 focus:border-red-500 focus:ring-red-500/20"
                      }`}
                      style={{ fontSize: "0.9rem" }}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegConfirm(!showRegConfirm)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                    >
                      {showRegConfirm ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                    </button>
                  </div>
                  {regPasswordConfirm && regPasswordConfirm !== regPassword && (
                    <p className="text-red-500 mt-1" style={{ fontSize: "0.75rem" }}>
                      As senhas não coincidem
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white py-3 rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer mt-2"
                  style={{ fontSize: "0.95rem", fontWeight: 600 }}
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Criar Conta
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <p className="text-center text-gray-400 mt-3" style={{ fontSize: "0.75rem" }}>
                  Ao criar sua conta, você concorda com nossos termos de uso.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}