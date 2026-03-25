/**
 * USER AUTH PAGE — Login e cadastro de clientes (/conta).
 * Abas: Login (email+senha) | Cadastro (CPF/CNPJ, endereco).
 * Supabase Auth. CNPJ auto-preenche via Receita Federal.
 * Pos-login: redireciona para /minha-conta ou /checkout.
 */
import { useState, useEffect, startTransition } from "react";
import { Link, useNavigate } from "react-router";
import User from "lucide-react/dist/esm/icons/user";
import Mail from "lucide-react/dist/esm/icons/mail";
import Lock from "lucide-react/dist/esm/icons/lock";
import Eye from "lucide-react/dist/esm/icons/eye";
import EyeOff from "lucide-react/dist/esm/icons/eye-off";
import Loader2 from "lucide-react/dist/esm/icons/loader-circle";
import AlertTriangle from "lucide-react/dist/esm/icons/alert-triangle";
import CheckCircle2 from "lucide-react/dist/esm/icons/circle-check";
import Phone from "lucide-react/dist/esm/icons/phone";
import ArrowRight from "lucide-react/dist/esm/icons/arrow-right";
import ShieldCheck from "lucide-react/dist/esm/icons/shield-check";
import CreditCard from "lucide-react/dist/esm/icons/credit-card";
import Building2 from "lucide-react/dist/esm/icons/building-2";
import FileText from "lucide-react/dist/esm/icons/file-text";
import { supabase } from "../services/supabaseClient";
import * as api from "../services/api";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { useGA4 } from "../components/GA4Provider";
import { useMarketing } from "../components/MarketingPixels";

// ─── Google Logo SVG (inline for zero external dependency) ───
// Force re-build
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

type Tab = "login" | "register";
type ForgotStep = "idle" | "form" | "sent";
type RegisterStep = "form" | "email-sent";

export function UserAuthPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("login");
  const { trackEvent } = useGA4();
  const { trackMetaEvent } = useMarketing();

  useDocumentMeta({
    title: tab === "login" ? "Entrar - Carretão Auto Peças" : "Criar Conta - Carretão Auto Peças",
    description: "Acesse sua conta na Carretão Auto Peças ou crie uma nova para acompanhar seus pedidos.",
  });

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
  const [personType, setPersonType] = useState<"pf" | "pj">("pf");
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regEmailConfirm, setRegEmailConfirm] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regCpf, setRegCpf] = useState("");
  const [regCnpj, setRegCnpj] = useState("");
  const [regRazaoSocial, setRegRazaoSocial] = useState("");
  const [regInscricaoEstadual, setRegInscricaoEstadual] = useState("");

  // CNPJ Receita Federal lookup
  const [cnpjLookupLoading, setCnpjLookupLoading] = useState(false);
  const [cnpjLookupResult, setCnpjLookupResult] = useState<api.CnpjLookupResult | null>(null);
  const [cnpjLookupError, setCnpjLookupError] = useState<string | null>(null);
  const [cnpjAutoFilled, setCnpjAutoFilled] = useState(false);
  const [cnpjTaken, setCnpjTaken] = useState(false);
  const [regPassword, setRegPassword] = useState("");
  const [regPasswordConfirm, setRegPasswordConfirm] = useState("");
  const [showRegPass, setShowRegPass] = useState(false);
  const [showRegConfirm, setShowRegConfirm] = useState(false);

  // Duplicate checks state
  const [emailTaken, setEmailTaken] = useState(false);
  const [cpfTaken, setCpfTaken] = useState(false);
  const [cpfTakenEmail, setCpfTakenEmail] = useState("");
  const [checkingAvailability, setCheckingAvailability] = useState(false);

  // Field touch tracking (show validation only after user interacted)
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});
  const markTouched = (field: string) => setTouchedFields((prev) => ({ ...prev, [field]: true }));

  // Forgot password
  const [forgotStep, setForgotStep] = useState<ForgotStep>("idle");
  const [forgotEmail, setForgotEmail] = useState("");

  // Check if already logged in + handle OAuth callback
  useEffect(() => {
    let redirected = false;

    const goToAccount = () => {
      if (redirected) return;
      redirected = true;
      startTransition(() => { navigate("/", { replace: true }); });
    };

    // 0) Check if Supabase returned an OAuth error in the URL (?error=...&error_description=...)
    const urlParams = new URLSearchParams(window.location.search);
    const oauthError = urlParams.get("error");
    const oauthErrorDesc = urlParams.get("error_description");
    const oauthErrorCode = urlParams.get("error_code");
    if (oauthError) {
      const desc = oauthErrorDesc || oauthError;
      console.error("[UserAuthPage] OAuth error from Supabase:", oauthError, oauthErrorCode, desc);
      setError("Erro no login com Google: " + desc.replace(/\+/g, " ") + ". Tente novamente ou use email/senha.");
      // Clean the URL
      try {
        window.history.replaceState({}, "", window.location.pathname);
      } catch (_e) { /* ignore */ }
      return; // Don't try to exchange code or check session — it failed
    }

    // 1) If URL has ?code=... from PKCE OAuth callback, try manual exchange
    const code = urlParams.get("code");
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ data, error: exchErr }) => {
        if (exchErr) {
          console.error("[UserAuthPage] Code exchange failed:", exchErr.message);
          setError("Falha ao completar login com Google: " + exchErr.message);
          // Still try getSession as fallback
          supabase.auth.getSession().then(({ data: d2 }) => {
            if (d2.session?.access_token) goToAccount();
          });
        } else if (data.session?.access_token) {
          goToAccount();
        }
      });
      // Clean the URL (remove ?code=...) without causing a navigation
      try {
        window.history.replaceState({}, "", window.location.pathname);
      } catch (_e) { /* ignore */ }
    }

    // 2) Check if user already has an active session
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.access_token) goToAccount();
    });

    // 3) Listen for auth state changes (catches INITIAL_SESSION, SIGNED_IN, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.access_token) {
        goToAccount();
      }
    });

    // 4) Also check hash fragment for implicit flow tokens (#access_token=...)
    if (window.location.hash && window.location.hash.includes("access_token")) {
      setTimeout(() => {
        supabase.auth.getSession().then(({ data }) => {
          if (data.session?.access_token) goToAccount();
        });
      }, 1000);
    }

    return () => { subscription.unsubscribe(); };
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

  // CNPJ mask
  const formatCnpj = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 14);
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return digits.slice(0, 2) + "." + digits.slice(2);
    if (digits.length <= 8) return digits.slice(0, 2) + "." + digits.slice(2, 5) + "." + digits.slice(5);
    if (digits.length <= 12) return digits.slice(0, 2) + "." + digits.slice(2, 5) + "." + digits.slice(5, 8) + "/" + digits.slice(8);
    return digits.slice(0, 2) + "." + digits.slice(2, 5) + "." + digits.slice(5, 8) + "/" + digits.slice(8, 12) + "-" + digits.slice(12);
  };

  // ─── Validators ───

  const validateCnpj = (cnpj: string): { valid: boolean; message: string } => {
    const digits = cnpj.replace(/\D/g, "");
    if (!digits) return { valid: false, message: "" };
    if (digits.length < 14) return { valid: false, message: "CNPJ incompleto" };
    if (digits.length > 14) return { valid: false, message: "CNPJ inválido" };
    if (/^(\d)\1{13}$/.test(digits)) return { valid: false, message: "CNPJ inválido" };
    // First check digit
    const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += parseInt(digits[i]) * weights1[i];
    let remainder = sum % 11;
    const d1 = remainder < 2 ? 0 : 11 - remainder;
    if (d1 !== parseInt(digits[12])) return { valid: false, message: "CNPJ inválido" };
    // Second check digit
    const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    sum = 0;
    for (let i = 0; i < 13; i++) sum += parseInt(digits[i]) * weights2[i];
    remainder = sum % 11;
    const d2 = remainder < 2 ? 0 : 11 - remainder;
    if (d2 !== parseInt(digits[13])) return { valid: false, message: "CNPJ inválido" };
    return { valid: true, message: "CNPJ válido" };
  };

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
  const cnpjValidation = validateCnpj(regCnpj);
  const phoneValidation = validatePhone(regPhone);
  const emailValidation = validateEmail(regEmail);

  // ─── CNPJ auto-lookup from Receita Federal ───
  useEffect(() => {
    if (personType !== "pj") return;
    if (!cnpjValidation.valid) {
      setCnpjLookupResult(null);
      setCnpjLookupError(null);
      setCnpjAutoFilled(false);
      return;
    }
    const cnpjDigits = regCnpj.replace(/\D/g, "");
    if (cnpjDigits.length !== 14) return;

    // Don't re-lookup the same CNPJ
    if (cnpjLookupResult && cnpjLookupResult.cnpj === cnpjDigits) return;

    let cancelled = false;
    setCnpjLookupLoading(true);
    setCnpjLookupError(null);
    setCnpjLookupResult(null);
    setCnpjAutoFilled(false);

    // Receita Federal lookup only (uniqueness check is handled by separate debounced effect)
    api.cnpjLookup(cnpjDigits)
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setCnpjLookupError(data.error);
          setCnpjLookupResult(null);
        } else {
          setCnpjLookupResult(data);
          // Auto-fill razão social from Receita
          if (data.razaoSocial) {
            setRegRazaoSocial(data.razaoSocial);
            setCnpjAutoFilled(true);
          }
        }
      })
      .catch((err: any) => {
        if (cancelled) return;
        const msg = err.message || "Erro ao consultar CNPJ.";
        if (msg.includes("não encontrado")) {
          setCnpjLookupError("CNPJ não encontrado na Receita Federal.");
        } else {
          setCnpjLookupError(msg);
        }
      })
      .finally(() => {
        if (!cancelled) setCnpjLookupLoading(false);
      });

    return () => { cancelled = true; };
  }, [regCnpj, personType, cnpjValidation.valid]);

  // ─── Debounced email uniqueness check ───
  useEffect(() => {
    if (!emailValidation.valid) { setEmailTaken(false); return; }
    var cancelled = false;
    var timer = setTimeout(() => {
      if (cancelled) return;
      setCheckingAvailability(true);
      api.checkSignupAvailability({ email: regEmail.trim() })
        .then((res) => {
          if (cancelled) return;
          setEmailTaken(res.emailTaken || false);
        })
        .catch(() => {})
        .finally(() => { if (!cancelled) setCheckingAvailability(false); });
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [regEmail, emailValidation.valid]);

  // ─── Debounced CPF uniqueness check ───
  useEffect(() => {
    if (!cpfValidation.valid) { setCpfTaken(false); setCpfTakenEmail(""); return; }
    var cancelled = false;
    var timer = setTimeout(() => {
      if (cancelled) return;
      api.checkSignupAvailability({ cpf: regCpf.replace(/\D/g, "") })
        .then((res) => {
          if (cancelled) return;
          setCpfTaken(res.cpfTaken || false);
          setCpfTakenEmail(res.cpfEmail || "");
        })
        .catch(() => {});
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [regCpf, cpfValidation.valid]);

  // ─── Debounced CNPJ uniqueness check (independent from Receita Federal lookup) ───
  useEffect(() => {
    if (personType !== "pj") { setCnpjTaken(false); return; }
    if (!cnpjValidation.valid) { setCnpjTaken(false); return; }
    var cnpjDigits = regCnpj.replace(/\D/g, "");
    if (cnpjDigits.length !== 14) { setCnpjTaken(false); return; }
    var cancelled = false;
    var timer = setTimeout(() => {
      if (cancelled) return;
      api.checkSignupAvailability({ cnpj: cnpjDigits })
        .then((res) => {
          if (cancelled) return;
          setCnpjTaken(res.cnpjTaken || false);
        })
        .catch(() => {});
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [regCnpj, personType, cnpjValidation.valid]);

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
      // Step 1: Pre-login check (rate limit + brute-force lockout + honeypot)
      // Read honeypot field value (bots will fill it, humans won't)
      var honeypotVal = "";
      try {
        var hpEl = document.getElementById("website_url_login") as HTMLInputElement | null;
        if (hpEl && hpEl.value) honeypotVal = hpEl.value;
      } catch (_hp) {}
      try {
        const preCheck = await api.preLoginCheck(loginEmail.trim(), honeypotVal);
        if (preCheck.locked || preCheck.error) {
          setError(preCheck.error || "Conta temporariamente bloqueada.");
          setLoading(false);
          return;
        }
      } catch (preErr: any) {
        // If pre-check fails with rate limit or lockout error, show it
        if (preErr.message && (preErr.message.includes("Muitas tentativas") || preErr.message.includes("bloqueada") || preErr.message.includes("Aguarde"))) {
          setError(preErr.message);
          setLoading(false);
          return;
        }
        // Otherwise continue (don't block login if pre-check itself fails)
        console.warn("[Login] Pre-check error (continuing):", preErr);
      }

      // Step 2: Actual login
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword,
      });

      if (authErr) {
        // Report failure for brute-force tracking (fire-and-forget)
        api.reportLoginResult(loginEmail.trim(), false).catch(() => {});
        if (authErr.message.includes("Invalid login")) {
          setError("Email ou senha incorretos.");
        } else if (authErr.message.toLowerCase().includes("email not confirmed") || authErr.message.toLowerCase().includes("not confirmed")) {
          setError("Seu email ainda não foi confirmado. Verifique sua caixa de entrada e clique no link de confirmação que enviamos.");
        } else {
          setError(authErr.message);
        }
        return;
      }

      // Report success (clears failed attempt counter) — pass token so backend can verify
      api.reportLoginResult(loginEmail.trim(), true, data.session?.access_token).catch(() => {});

      // GA4 + Meta: login event
      trackEvent("login", { method: "email" });

      if (data.session?.access_token) {
        startTransition(() => { navigate("/", { replace: true }); });
      }
    } catch (err: any) {
      console.error("Login error:", err);
      api.reportLoginResult(loginEmail.trim(), false).catch(() => {});
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
    if (emailTaken) {
      setError("Este email já está cadastrado. Use a opção 'Esqueci minha senha' para recuperar sua conta.");
      return;
    }
    const phoneDigits = regPhone.replace(/\D/g, "");
    if (phoneDigits.length > 0 && !phoneValidation.valid) {
      setError(phoneValidation.message || "Telefone inválido.");
      return;
    }
    if (personType === "pj") {
      if (!regRazaoSocial.trim()) {
        setError("Informe a Razão Social.");
        return;
      }
      const cnpjDigits = regCnpj.replace(/\D/g, "");
      if (!cnpjDigits) {
        setError("Informe o CNPJ.");
        return;
      }
      if (!cnpjValidation.valid) {
        setError(cnpjValidation.message || "CNPJ inválido.");
        return;
      }
      // Block if CNPJ is not active in Receita Federal
      if (cnpjLookupResult && !cnpjLookupResult.ativa) {
        setError("Este CNPJ consta como " + cnpjLookupResult.situacao + " na Receita Federal. Não é possível cadastrar empresa com CNPJ inativo.");
        return;
      }
      if (cnpjLookupError && cnpjLookupError.includes("não encontrado")) {
        setError("CNPJ não encontrado na Receita Federal. Verifique o número informado.");
        return;
      }
      if (cnpjTaken) {
        setError("Este CNPJ já está vinculado a outra conta. Cada CNPJ pode ser usado em apenas uma conta.");
        return;
      }
    }
    const cpfDigits = regCpf.replace(/\D/g, "");
    if (!cpfDigits) {
      setError(personType === "pj" ? "Informe o CPF do responsável." : "Informe seu CPF.");
      return;
    }
    if (!cpfValidation.valid) {
      setError(cpfValidation.message || "CPF inválido.");
      return;
    }
    if (cpfTaken) {
      var cpfErrMsg = "Este CPF já está vinculado a outra conta";
      if (cpfTakenEmail) cpfErrMsg = cpfErrMsg + " (" + cpfTakenEmail + ")";
      cpfErrMsg = cpfErrMsg + ". Se é sua conta, use 'Esqueci minha senha' para recuperá-la.";
      setError(cpfErrMsg);
      return;
    }
    if (regPassword.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (!/[A-Z]/.test(regPassword)) {
      setError("A senha deve conter pelo menos uma letra maiúscula.");
      return;
    }
    if (!/[a-z]/.test(regPassword)) {
      setError("A senha deve conter pelo menos uma letra minúscula.");
      return;
    }
    if (!/[0-9]/.test(regPassword)) {
      setError("A senha deve conter pelo menos um número.");
      return;
    }
    if (regPassword !== regPasswordConfirm) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    try {
      // ── Final availability check (blocks race conditions & incomplete debounce) ──
      try {
        var checkPayload: { email?: string; cpf?: string; cnpj?: string } = {
          email: regEmail.trim(),
          cpf: regCpf.replace(/\D/g, ""),
        };
        if (personType === "pj") {
          checkPayload.cnpj = regCnpj.replace(/\D/g, "");
        }
        var avail = await api.checkSignupAvailability(checkPayload);
        var blockReasons: string[] = [];
        if (avail.emailTaken) {
          setEmailTaken(true);
          blockReasons.push("O email informado já está cadastrado.");
        }
        if (avail.cpfTaken) {
          setCpfTaken(true);
          setCpfTakenEmail(avail.cpfEmail || "");
          var cpfBlock = "O CPF informado já está vinculado a outra conta";
          if (avail.cpfEmail) cpfBlock = cpfBlock + " (" + avail.cpfEmail + ")";
          cpfBlock = cpfBlock + ".";
          blockReasons.push(cpfBlock);
        }
        if (avail.cnpjTaken) {
          setCnpjTaken(true);
          blockReasons.push("O CNPJ informado já está vinculado a outra conta.");
        }
        if (blockReasons.length > 0) {
          setError(blockReasons.join(" ") + " Use 'Esqueci minha senha' para recuperar sua conta ou faça login.");
          setLoading(false);
          return;
        }
      } catch (checkErr) {
        // If the availability check itself fails, proceed with signup
        // (the server-side signup route has its own duplicate checks)
        console.error("Pre-signup availability check failed:", checkErr);
      }

      await api.userSignup({
        email: regEmail.trim(),
        password: regPassword,
        name: regName.trim(),
        phone: regPhone.replace(/\D/g, ""),
        cpf: regCpf.replace(/\D/g, ""),
        personType,
        ...(personType === "pj" ? {
          cnpj: regCnpj.replace(/\D/g, ""),
          razaoSocial: regRazaoSocial.trim(),
          inscricaoEstadual: regInscricaoEstadual.trim(),
        } : {}),
      });

      // GA4 + Meta: sign_up / CompleteRegistration event
      trackEvent("sign_up", { method: "email" });
      trackMetaEvent("CompleteRegistration", { content_name: "user_signup", status: true });

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

      if (!result.sent) {
        throw new Error("Não foi possível enviar o email de recuperação. Verifique o endereço informado.");
      }

      if (result.recoveryId) {
        sessionStorage.setItem("recovery_id", result.recoveryId);
        sessionStorage.setItem("recovery_email", forgotEmail.trim());
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
    if (/[a-z]/.test(pwd)) s++;
    if (/[0-9]/.test(pwd)) s++;
    if (/[^A-Za-z0-9]/.test(pwd)) s++;
    if (s <= 1) return { level: 1, label: "Fraca", color: "bg-red-500" };
    if (s <= 2) return { level: 2, label: "Razoável", color: "bg-orange-500" };
    if (s <= 3) return { level: 3, label: "Boa", color: "bg-yellow-500" };
    if (s <= 4) return { level: 4, label: "Forte", color: "bg-green-500" };
    return { level: 5, label: "Excelente", color: "bg-emerald-500" };
  };

  const strength = getStrength(regPassword);

  // ─── Google OAuth ───
  const [googleLoading, setGoogleLoading] = useState(false);
  const handleGoogleLogin = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      // Do not forget to complete setup at https://supabase.com/docs/guides/auth/social-login/auth-google
      const { error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin + "/minha-conta",
        },
      });
      if (oauthErr) {
        console.error("Google OAuth error:", oauthErr);
        if (oauthErr.message.includes("provider is not enabled") || oauthErr.message.includes("not enabled")) {
          setError("Login com Google ainda não está habilitado. Entre em contato com o administrador.");
        } else {
          setError(oauthErr.message || "Erro ao iniciar login com Google.");
        }
        setGoogleLoading(false);
      }
      // If no error, user is being redirected to Google — do NOT set googleLoading=false
      // GA4: login with Google (fires before redirect)
      trackEvent("login", { method: "google" });
    } catch (err: any) {
      console.error("Google OAuth exception:", err);
      setError(err.message || "Erro ao conectar com Google.");
      setGoogleLoading(false);
    }
  };

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
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-red-700" style={{ fontSize: "0.85rem" }}>{error}</p>
                </div>
                {(error.includes("Esqueci minha senha") || error.includes("recuperá-la") || error.includes("recuperar")) && (
                  <div className="flex gap-2 mt-3 ml-8">
                    <button
                      type="button"
                      onClick={() => { setTab("login"); setLoginEmail(regEmail || ""); setError(null); }}
                      className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors cursor-pointer flex items-center gap-1"
                      style={{ fontSize: "0.75rem", fontWeight: 600 }}
                    >
                      <Lock className="w-3 h-3" />
                      Fazer Login
                    </button>
                    <button
                      type="button"
                      onClick={() => { setForgotStep("form"); setForgotEmail(regEmail || ""); setError(null); }}
                      className="px-3 py-1.5 bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 transition-colors cursor-pointer flex items-center gap-1"
                      style={{ fontSize: "0.75rem", fontWeight: 600 }}
                    >
                      <Mail className="w-3 h-3" />
                      Recuperar senha
                    </button>
                  </div>
                )}
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
                {/* Honeypot — hidden from humans, bots fill it */}
                <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", top: "-9999px", opacity: 0, height: 0, overflow: "hidden" }}>
                  <label htmlFor="website_url_login">Website</label>
                  <input type="text" id="website_url_login" name="website" tabIndex={-1} autoComplete="off" />
                </div>
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

                {/* Divider */}
                <div className="flex items-center gap-3 my-1">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-gray-400" style={{ fontSize: "0.78rem" }}>ou</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>

                {/* Google OAuth */}
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={googleLoading}
                  className="w-full bg-white hover:bg-gray-50 disabled:opacity-60 border border-gray-300 text-gray-700 py-3 rounded-xl flex items-center justify-center gap-2.5 transition-colors cursor-pointer shadow-sm"
                  style={{ fontSize: "0.9rem", fontWeight: 500 }}
                >
                  {googleLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                  ) : (
                    <>
                      <GoogleLogo />
                      Continuar com Google
                    </>
                  )}
                </button>
              </form>
            )}

            {/* ─── REGISTER FORM ─── */}
            {tab === "register" && (
              <form onSubmit={handleRegister} className="space-y-4">
                {/* Honeypot — hidden from humans */}
                <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", top: "-9999px", opacity: 0, height: 0, overflow: "hidden" }}>
                  <label htmlFor="company_url_reg">Company URL</label>
                  <input type="text" id="company_url_reg" name="company_url" tabIndex={-1} autoComplete="off" />
                </div>

                {/* PF / PJ Toggle */}
                <div>
                  <label className="block text-gray-700 mb-2" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                    Tipo de Cadastro
                  </label>
                  <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
                    <button
                      type="button"
                      onClick={() => { setPersonType("pf"); setError(null); }}
                      className={"flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer " + (personType === "pf" ? "bg-white text-red-600 shadow-sm" : "text-gray-500 hover:text-gray-700")}
                      style={{ fontSize: "0.85rem", fontWeight: 600 }}
                    >
                      <User className="w-4 h-4" />
                      Pessoa Física
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPersonType("pj"); setError(null); }}
                      className={"flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer " + (personType === "pj" ? "bg-white text-red-600 shadow-sm" : "text-gray-500 hover:text-gray-700")}
                      style={{ fontSize: "0.85rem", fontWeight: 600 }}
                    >
                      <Building2 className="w-4 h-4" />
                      Pessoa Jurídica
                    </button>
                  </div>
                </div>

                {/* PJ Fields — CNPJ first (triggers auto-fill), then Razão Social, IE */}
                {personType === "pj" && (
                  <>
                    {/* CNPJ */}
                    <div>
                      <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                        CNPJ *
                      </label>
                      <div className="relative">
                        <CreditCard className={"absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 " + (cnpjTaken ? "text-amber-500" : cnpjLookupResult && cnpjLookupResult.ativa ? "text-green-500" : touchedFields.cnpj && cnpjValidation.valid ? "text-blue-500" : "text-gray-400")} />
                        <input
                          type="text"
                          value={regCnpj}
                          onChange={(e) => {
                            setRegCnpj(formatCnpj(e.target.value));
                            if (cnpjAutoFilled) {
                              setCnpjAutoFilled(false);
                              setRegRazaoSocial("");
                            }
                          }}
                          placeholder="00.000.000/0000-00"
                          className={"w-full pl-11 pr-10 py-3 border rounded-xl text-gray-800 placeholder-gray-400 outline-none focus:ring-2 transition-all " + (cnpjTaken ? "border-amber-400 focus:border-amber-500 focus:ring-amber-500/20" : cnpjLookupResult && !cnpjLookupResult.ativa ? "border-red-400 focus:border-red-500 focus:ring-red-500/20" : cnpjLookupResult && cnpjLookupResult.ativa ? "border-green-400 focus:border-green-500 focus:ring-green-500/20" : touchedFields.cnpj && regCnpj && !cnpjValidation.valid ? "border-red-400 focus:border-red-500 focus:ring-red-500/20" : touchedFields.cnpj && cnpjValidation.valid ? "border-blue-400 focus:border-blue-500 focus:ring-blue-500/20" : "border-gray-300 focus:border-red-500 focus:ring-red-500/20")}
                          style={{ fontSize: "0.9rem" }}
                          autoComplete="off"
                          onBlur={() => markTouched("cnpj")}
                        />
                        {cnpjLookupLoading && (
                          <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-blue-500 animate-spin" />
                        )}
                        {!cnpjLookupLoading && cnpjTaken && (
                          <AlertTriangle className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-amber-500" />
                        )}
                        {!cnpjLookupLoading && !cnpjTaken && cnpjLookupResult && cnpjLookupResult.ativa && (
                          <CheckCircle2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-green-500" />
                        )}
                        {!cnpjLookupLoading && !cnpjTaken && cnpjLookupResult && !cnpjLookupResult.ativa && (
                          <AlertTriangle className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-red-500" />
                        )}
                        {!cnpjLookupLoading && !cnpjLookupResult && touchedFields.cnpj && cnpjValidation.valid && !cnpjLookupError && (
                          <CheckCircle2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-blue-500" />
                        )}
                      </div>
                      {touchedFields.cnpj && regCnpj && !cnpjValidation.valid && cnpjValidation.message && (
                        <p className="text-red-500 mt-1" style={{ fontSize: "0.75rem" }}>
                          {cnpjValidation.message}
                        </p>
                      )}
                      {cnpjLookupLoading && (
                        <p className="text-blue-500 mt-1 flex items-center gap-1" style={{ fontSize: "0.75rem" }}>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Consultando Receita Federal...
                        </p>
                      )}
                      {cnpjLookupError && (
                        <p className="text-red-500 mt-1 flex items-center gap-1" style={{ fontSize: "0.75rem" }}>
                          <AlertTriangle className="w-3 h-3" />
                          {cnpjLookupError}
                        </p>
                      )}
                      {cnpjLookupResult && !cnpjLookupResult.ativa && (
                        <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                          <p className="text-red-700 flex items-center gap-1.5" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                            CNPJ {cnpjLookupResult.situacao}
                          </p>
                          <p className="text-red-600 mt-1" style={{ fontSize: "0.75rem" }}>
                            Este CNPJ consta como <strong>{cnpjLookupResult.situacao}</strong> na Receita Federal{cnpjLookupResult.dataSituacao ? " desde " + cnpjLookupResult.dataSituacao : ""}. Não é possível cadastrar empresa com CNPJ inativo.
                          </p>
                        </div>
                      )}
                      {cnpjLookupResult && cnpjLookupResult.ativa && (
                        <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg space-y-1">
                          <p className="text-green-700 flex items-center gap-1.5" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                            CNPJ Ativo — Verificado na Receita Federal
                          </p>
                          {cnpjLookupResult.nomeFantasia && (
                            <p className="text-gray-600" style={{ fontSize: "0.75rem" }}>
                              <span className="text-gray-500">Nome Fantasia:</span> {cnpjLookupResult.nomeFantasia}
                            </p>
                          )}
                          {cnpjLookupResult.atividadePrincipal && (
                            <p className="text-gray-600" style={{ fontSize: "0.75rem" }}>
                              <span className="text-gray-500">Atividade:</span> {cnpjLookupResult.atividadePrincipal}
                            </p>
                          )}
                          {(cnpjLookupResult.cidade || cnpjLookupResult.uf) && (
                            <p className="text-gray-600" style={{ fontSize: "0.75rem" }}>
                              <span className="text-gray-500">Localização:</span> {[cnpjLookupResult.cidade, cnpjLookupResult.uf].filter(Boolean).join("/")}
                            </p>
                          )}
                          {cnpjLookupResult.dataAbertura && (
                            <p className="text-gray-600" style={{ fontSize: "0.75rem" }}>
                              <span className="text-gray-500">Abertura:</span> {cnpjLookupResult.dataAbertura}
                            </p>
                          )}
                        </div>
                      )}
                      {cnpjTaken && (
                        <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                          <p className="text-amber-700 flex items-center gap-1.5" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                            CNPJ já cadastrado
                          </p>
                          <p className="text-amber-600 mt-1" style={{ fontSize: "0.75rem" }}>
                            Este CNPJ já está vinculado a outra conta. Cada CNPJ pode ser usado em apenas uma conta.
                          </p>
                          <div className="flex gap-2 mt-2">
                            <button
                              type="button"
                              onClick={function () { setTab("login"); setError(null); }}
                              className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors cursor-pointer flex items-center gap-1"
                              style={{ fontSize: "0.75rem", fontWeight: 600 }}
                            >
                              <Lock className="w-3 h-3" />
                              Fazer Login
                            </button>
                            <button
                              type="button"
                              onClick={function () { setForgotStep("form"); setForgotEmail(""); setError(null); }}
                              className="px-3 py-1.5 bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 transition-colors cursor-pointer flex items-center gap-1"
                              style={{ fontSize: "0.75rem", fontWeight: 600 }}
                            >
                              <Mail className="w-3 h-3" />
                              Recuperar conta
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Razão Social — auto-filled from Receita Federal */}
                    <div>
                      <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                        Razão Social *
                        {cnpjAutoFilled && (
                          <span className="text-green-600 ml-2" style={{ fontSize: "0.7rem", fontWeight: 400 }}>
                            (preenchido automaticamente pela Receita Federal)
                          </span>
                        )}
                      </label>
                      <div className="relative">
                        <Building2 className={"absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 " + (cnpjAutoFilled ? "text-green-500" : "text-gray-400")} />
                        <input
                          type="text"
                          value={regRazaoSocial}
                          onChange={(e) => {
                            if (!cnpjAutoFilled) {
                              setRegRazaoSocial(e.target.value);
                            }
                          }}
                          readOnly={cnpjAutoFilled}
                          placeholder={cnpjLookupLoading ? "Aguardando consulta do CNPJ..." : "Digite o CNPJ acima para preencher automaticamente"}
                          className={"w-full pl-11 pr-4 py-3 border rounded-xl placeholder-gray-400 outline-none transition-all " + (cnpjAutoFilled ? "border-green-300 bg-green-50/50 text-gray-800 cursor-not-allowed" : "border-gray-300 text-gray-800 focus:border-red-500 focus:ring-2 focus:ring-red-500/20")}
                          style={{ fontSize: "0.9rem" }}
                          autoComplete="organization"
                        />
                        {cnpjAutoFilled && (
                          <ShieldCheck className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-green-500" />
                        )}
                      </div>
                      {cnpjAutoFilled && (
                        <p className="text-green-600 mt-1 flex items-center gap-1" style={{ fontSize: "0.7rem" }}>
                          <ShieldCheck className="w-3 h-3" />
                          Dado verificado — Receita Federal
                        </p>
                      )}
                    </div>

                    {/* Inscrição Estadual */}
                    <div>
                      <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                        Inscrição Estadual
                        <span className="text-gray-400 ml-1" style={{ fontSize: "0.75rem", fontWeight: 400 }}>(opcional)</span>
                      </label>
                      <div className="relative">
                        <FileText className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
                        <input
                          type="text"
                          value={regInscricaoEstadual}
                          onChange={(e) => setRegInscricaoEstadual(e.target.value.slice(0, 20))}
                          placeholder="Inscrição estadual ou ISENTO"
                          className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-xl text-gray-800 placeholder-gray-400 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all"
                          style={{ fontSize: "0.9rem" }}
                          autoComplete="off"
                        />
                      </div>
                    </div>

                    {/* Divider */}
                    <div className="flex items-center gap-3 pt-1">
                      <div className="flex-1 h-px bg-gray-200" />
                      <span className="text-gray-400" style={{ fontSize: "0.75rem" }}>Dados do Responsável</span>
                      <div className="flex-1 h-px bg-gray-200" />
                    </div>
                  </>
                )}

                {/* Nome */}
                <div>
                  <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                    {personType === "pj" ? "Nome do Responsável *" : "Nome Completo *"}
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
                    <input
                      type="text"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder={personType === "pj" ? "Nome do responsável legal" : "Seu nome completo"}
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
                    <Mail className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 ${emailTaken ? "text-amber-500" : touchedFields.email && emailValidation.valid ? "text-green-500" : "text-gray-400"}`} />
                    <input
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="seu@email.com"
                      className={`w-full pl-11 pr-10 py-3 border rounded-xl text-gray-800 placeholder-gray-400 outline-none focus:ring-2 transition-all ${
                        emailTaken
                          ? "border-amber-400 focus:border-amber-500 focus:ring-amber-500/20"
                          : touchedFields.email && regEmail && !emailValidation.valid
                          ? "border-red-400 focus:border-red-500 focus:ring-red-500/20"
                          : touchedFields.email && emailValidation.valid
                          ? "border-green-400 focus:border-green-500 focus:ring-green-500/20"
                          : "border-gray-300 focus:border-red-500 focus:ring-red-500/20"
                      }`}
                      style={{ fontSize: "0.9rem" }}
                      autoComplete="email"
                      onBlur={() => markTouched("email")}
                    />
                    {emailTaken && (
                      <AlertTriangle className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-amber-500" />
                    )}
                    {!emailTaken && touchedFields.email && emailValidation.valid && (
                      <CheckCircle2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-green-500" />
                    )}
                    {checkingAvailability && emailValidation.valid && (
                      <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-blue-400 animate-spin" />
                    )}
                  </div>
                  {touchedFields.email && regEmail && !emailValidation.valid && emailValidation.message && (
                    <p className="text-red-500 mt-1" style={{ fontSize: "0.75rem" }}>
                      {emailValidation.message}
                    </p>
                  )}
                  {emailTaken && (
                    <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-amber-700 flex items-center gap-1.5" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                        Email já cadastrado
                      </p>
                      <p className="text-amber-600 mt-1" style={{ fontSize: "0.75rem" }}>
                        Este email já está vinculado a uma conta existente.
                      </p>
                      <div className="flex gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => { setTab("login"); setLoginEmail(regEmail); setError(null); }}
                          className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors cursor-pointer flex items-center gap-1"
                          style={{ fontSize: "0.75rem", fontWeight: 600 }}
                        >
                          <Lock className="w-3 h-3" />
                          Fazer Login
                        </button>
                        <button
                          type="button"
                          onClick={() => { setForgotStep("form"); setForgotEmail(regEmail); setError(null); }}
                          className="px-3 py-1.5 bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 transition-colors cursor-pointer flex items-center gap-1"
                          style={{ fontSize: "0.75rem", fontWeight: 600 }}
                        >
                          <Mail className="w-3 h-3" />
                          Esqueci minha senha
                        </button>
                      </div>
                    </div>
                  )}
                  {!emailTaken && touchedFields.email && emailValidation.valid && (
                    <p className="text-green-600 mt-1" style={{ fontSize: "0.75rem" }}>
                      ✓ Email disponível
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
                    {personType === "pj" ? "CPF do Responsável *" : "CPF *"}
                  </label>
                  <div className="relative">
                    <CreditCard className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 ${cpfTaken ? "text-amber-500" : touchedFields.cpf && cpfValidation.valid ? "text-green-500" : "text-gray-400"}`} />
                    <input
                      type="text"
                      value={regCpf}
                      onChange={(e) => setRegCpf(formatCpf(e.target.value))}
                      placeholder="000.000.000-00"
                      className={`w-full pl-11 pr-10 py-3 border rounded-xl text-gray-800 placeholder-gray-400 outline-none focus:ring-2 transition-all ${
                        cpfTaken
                          ? "border-amber-400 focus:border-amber-500 focus:ring-amber-500/20"
                          : touchedFields.cpf && regCpf && !cpfValidation.valid
                          ? "border-red-400 focus:border-red-500 focus:ring-red-500/20"
                          : touchedFields.cpf && cpfValidation.valid
                          ? "border-green-400 focus:border-green-500 focus:ring-green-500/20"
                          : "border-gray-300 focus:border-red-500 focus:ring-red-500/20"
                      }`}
                      style={{ fontSize: "0.9rem" }}
                      autoComplete="off"
                      onBlur={() => markTouched("cpf")}
                    />
                    {cpfTaken && (
                      <AlertTriangle className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-amber-500" />
                    )}
                    {!cpfTaken && touchedFields.cpf && cpfValidation.valid && (
                      <CheckCircle2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-green-500" />
                    )}
                  </div>
                  {touchedFields.cpf && regCpf && !cpfValidation.valid && cpfValidation.message && (
                    <p className="text-red-500 mt-1" style={{ fontSize: "0.75rem" }}>
                      {cpfValidation.message}
                    </p>
                  )}
                  {cpfTaken && (
                    <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-amber-700 flex items-center gap-1.5" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                        CPF já cadastrado
                      </p>
                      <p className="text-amber-600 mt-1" style={{ fontSize: "0.75rem" }}>
                        Este CPF já está vinculado a uma conta existente{cpfTakenEmail ? " (" + cpfTakenEmail + ")" : ""}.
                      </p>
                      <div className="flex gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => { setTab("login"); setError(null); }}
                          className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors cursor-pointer flex items-center gap-1"
                          style={{ fontSize: "0.75rem", fontWeight: 600 }}
                        >
                          <Lock className="w-3 h-3" />
                          Fazer Login
                        </button>
                        <button
                          type="button"
                          onClick={() => { setForgotStep("form"); setForgotEmail(""); setError(null); }}
                          className="px-3 py-1.5 bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 transition-colors cursor-pointer flex items-center gap-1"
                          style={{ fontSize: "0.75rem", fontWeight: 600 }}
                        >
                          <Mail className="w-3 h-3" />
                          Recuperar conta
                        </button>
                      </div>
                    </div>
                  )}
                  {!cpfTaken && touchedFields.cpf && cpfValidation.valid && (
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
                  disabled={loading || emailTaken || cpfTaken || cnpjTaken}
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
                  Ao criar sua conta, você concorda com nossos{" "}
                  <Link to="/termos" className="underline hover:text-gray-600">termos de uso</Link>
                  {" "}e{" "}
                  <Link to="/politica-de-privacidade" className="underline hover:text-gray-600">política de privacidade</Link>.
                </p>

                {/* Google OAuth — only for PF; PJ must register with full form */}
                {personType === "pf" ? (
                  <>
                    <div className="flex items-center gap-3 mt-4">
                      <div className="flex-1 h-px bg-gray-200" />
                      <span className="text-gray-400" style={{ fontSize: "0.78rem" }}>ou cadastre-se com</span>
                      <div className="flex-1 h-px bg-gray-200" />
                    </div>
                    <button
                      type="button"
                      onClick={handleGoogleLogin}
                      disabled={googleLoading}
                      className="w-full bg-white hover:bg-gray-50 disabled:opacity-60 border border-gray-300 text-gray-700 py-3 rounded-xl flex items-center justify-center gap-2.5 transition-colors cursor-pointer shadow-sm"
                      style={{ fontSize: "0.9rem", fontWeight: 500 }}
                    >
                      {googleLoading ? (
                        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                      ) : (
                        <>
                          <GoogleLogo />
                          Continuar com Google
                        </>
                      )}
                    </button>
                  </>
                ) : null}
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}