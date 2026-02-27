import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, Link, useSearchParams } from "react-router";
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
  CreditCard,
  ExternalLink,
  Clock,
  ShoppingBag,
  Eye,
  ChevronDown,
  Hash,
  Truck,
  Heart,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Home,
  Building2,
  Star,
  Filter,
  ArrowUpDown,
  Sparkles,
  Search,
  FileText,
  ThumbsUp,
  ChevronUp,
} from "lucide-react";
import { supabase } from "../services/supabaseClient";
import * as api from "../services/api";
import { ProductImage } from "../components/ProductImage";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { useWishlist } from "../contexts/WishlistContext";
import { WishlistButton } from "../components/WishlistButton";
import "../utils/emptyStateAnimations";
import { UserAvatar, AvatarPicker } from "../components/AvatarPicker";
import { InlineTracking } from "../components/TrackingTimeline";

type ActiveTab = "perfil" | "senha" | "pedidos" | "enderecos" | "favoritos" | "avaliacoes";

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
  avatarId: string | null;
  customAvatarUrl: string | null;
  created_at: string;
}

// Phone mask
function formatPhone(val: string): string {
  var digits = val.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return "(" + digits.slice(0, 2) + ") " + digits.slice(2);
  return "(" + digits.slice(0, 2) + ") " + digits.slice(2, 7) + "-" + digits.slice(7);
}

// CPF mask
function formatCpf(val: string): string {
  var digits = val.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return digits.slice(0, 3) + "." + digits.slice(3);
  if (digits.length <= 9) return digits.slice(0, 3) + "." + digits.slice(3, 6) + "." + digits.slice(6);
  return digits.slice(0, 3) + "." + digits.slice(3, 6) + "." + digits.slice(6, 9) + "-" + digits.slice(9);
}

// CEP mask
function formatCepInput(val: string): string {
  var digits = val.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return digits.slice(0, 5) + "-" + digits.slice(5);
}

export function UserAccountPage() {
  var navigate = useNavigate();
  var [searchParams] = useSearchParams();
  var [activeTab, setActiveTab] = useState<ActiveTab>(function () {
    var tabParam = searchParams.get("tab");
    if (tabParam === "perfil" || tabParam === "senha" || tabParam === "pedidos" || tabParam === "enderecos" || tabParam === "favoritos" || tabParam === "avaliacoes") {
      return tabParam;
    }
    return "perfil";
  });
  var [loading, setLoading] = useState(true);
  var [saving, setSaving] = useState(false);
  var [error, setError] = useState<string | null>(null);
  var [success, setSuccess] = useState<string | null>(null);
  var [accessToken, setAccessToken] = useState<string | null>(null);

  useDocumentMeta({
    title: "Minha Conta - Carretão Auto Peças",
    description: "Gerencie seus dados, endereços, pedidos, favoritos e avaliações na Carretão Auto Peças.",
  });

  // Sync tab from URL search params
  useEffect(function () {
    var tabParam = searchParams.get("tab");
    if (tabParam === "perfil" || tabParam === "senha" || tabParam === "pedidos" || tabParam === "enderecos" || tabParam === "favoritos" || tabParam === "avaliacoes") {
      setActiveTab(tabParam);
      setError(null);
      setSuccess(null);
    }
  }, [searchParams]);

  // Profile data
  var [profile, setProfile] = useState<UserProfile | null>(null);
  var [name, setName] = useState("");
  var [phone, setPhone] = useState("");
  var [cpf, setCpf] = useState("");
  var [avatarUploading, setAvatarUploading] = useState(false);

  // Password change (via email link)
  var [sendingReset, setSendingReset] = useState(false);
  var [resetEmailSent, setResetEmailSent] = useState(false);

  // Load profile
  var loadProfile = useCallback(async function (token: string) {
    try {
      var data = await api.userMe(token);
      setProfile(data);
      setName(data.name || "");
      setPhone(data.phone ? formatPhone(data.phone) : "");
      setCpf(data.cpf ? formatCpf(data.cpf) : "");
    } catch (err: any) {
      console.error("Load profile error:", err);
      try {
        var refreshResult = await supabase.auth.refreshSession();
        var refreshData = refreshResult.data;
        var refreshErr = refreshResult.error;
        if (refreshErr || !refreshData.session?.access_token) {
          console.error("Session refresh failed, redirecting to login");
          await supabase.auth.signOut();
          return "redirect";
        }
        var freshToken = refreshData.session.access_token;
        setAccessToken(freshToken);
        var data2 = await api.userMe(freshToken);
        setProfile(data2);
        setName(data2.name || "");
        setPhone(data2.phone ? formatPhone(data2.phone) : "");
        setCpf(data2.cpf ? formatCpf(data2.cpf) : "");
      } catch (retryErr: any) {
        console.error("Retry after refresh also failed:", retryErr);
        await supabase.auth.signOut();
        return "redirect";
      }
    }
    return "ok";
  }, []);

  // Check auth on mount
  useEffect(function () {
    var cancelled = false;

    async function init() {
      var refreshResult = await supabase.auth.refreshSession();
      var session = refreshResult.data?.session;

      if (!session?.access_token) {
        var sessionResult = await supabase.auth.getSession();
        session = sessionResult.data?.session;
      }

      if (!session?.access_token) {
        if (!cancelled) navigate("/conta", { replace: true });
        return;
      }

      if (!cancelled) {
        setAccessToken(session.access_token);
        var result = await loadProfile(session.access_token);
        if (result === "redirect" && !cancelled) {
          navigate("/conta", { replace: true });
        }
        if (!cancelled) setLoading(false);
      }
    }

    init();

    var sub = supabase.auth.onAuthStateChange(function (event, session) {
      if (event === "TOKEN_REFRESHED" && session?.access_token) {
        setAccessToken(session.access_token);
      }
      if (event === "SIGNED_OUT") {
        navigate("/conta", { replace: true });
      }
    });

    return function () {
      cancelled = true;
      sub.data.subscription.unsubscribe();
    };
  }, [navigate, loadProfile]);

  // Auto-switch to profile tab when profile is incomplete (e.g. Google OAuth first login)
  var [incompleteChecked, setIncompleteChecked] = useState(false);
  useEffect(function () {
    if (loading || !profile || incompleteChecked) return;
    setIncompleteChecked(true);
    var isIncomplete = !profile.cpf || !profile.phone || !profile.name;
    // Only auto-switch if no explicit tab param in URL
    var tabParam = searchParams.get("tab");
    if (isIncomplete && !tabParam) {
      setActiveTab("perfil");
    }
  }, [loading, profile, incompleteChecked, searchParams]);

  // ─── Helper: sync avatar to Header's localStorage cache ───
  var AVATAR_CACHE_KEY = "carretao_user_session_cache";
  function syncAvatarCache(newAvatarId: string | null, newCustomUrl: string | null) {
    try {
      var cached = localStorage.getItem(AVATAR_CACHE_KEY);
      if (cached) {
        var parsed = JSON.parse(cached);
        parsed.avatarId = newAvatarId;
        parsed.customAvatarUrl = newCustomUrl;
        localStorage.setItem(AVATAR_CACHE_KEY, JSON.stringify(parsed));
      }
    } catch {}
  }

  // ─── Avatar handlers ───
  var handleSelectAvatar = async function (avatarId: string) {
    if (!accessToken) return;
    try {
      await api.userSetAvatar(accessToken, avatarId);
      api.invalidateUserMeCache();
      setProfile(function (prev) {
        if (!prev) return prev;
        return Object.assign({}, prev, { avatarId: avatarId, customAvatarUrl: null });
      });
      syncAvatarCache(avatarId, null);
      setSuccess("Avatar atualizado!");
      setTimeout(function () { setSuccess(null); }, 3000);
    } catch (err: any) {
      console.error("Select avatar error:", err);
      setError(err.message || "Erro ao atualizar avatar.");
    }
  };

  var handleUploadAvatar = async function (file: File) {
    if (!accessToken) return;
    setAvatarUploading(true);
    try {
      var result = await api.userUploadAvatar(file, accessToken);
      api.invalidateUserMeCache();
      setProfile(function (prev) {
        if (!prev) return prev;
        return Object.assign({}, prev, { customAvatarUrl: result.customAvatarUrl });
      });
      syncAvatarCache(profile?.avatarId || null, result.customAvatarUrl || null);
      setSuccess("Foto de perfil atualizada!");
      setTimeout(function () { setSuccess(null); }, 3000);
    } catch (err: any) {
      console.error("Upload avatar error:", err);
      setError(err.message || "Erro ao enviar foto.");
    } finally {
      setAvatarUploading(false);
    }
  };

  var handleRemoveCustomAvatar = async function () {
    if (!accessToken) return;
    try {
      var result = await api.userDeleteCustomAvatar(accessToken);
      api.invalidateUserMeCache();
      setProfile(function (prev) {
        if (!prev) return prev;
        return Object.assign({}, prev, { customAvatarUrl: null, avatarId: result.avatarId || prev.avatarId });
      });
      syncAvatarCache(result.avatarId || profile?.avatarId || null, null);
      setSuccess("Foto removida. Avatar restaurado!");
      setTimeout(function () { setSuccess(null); }, 3000);
    } catch (err: any) {
      console.error("Remove custom avatar error:", err);
      setError(err.message || "Erro ao remover foto.");
    }
  };

  // Save profile (only personal data, no address)
  var handleSaveProfile = async function (e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!accessToken) return;
    if (!name.trim()) {
      setError("O nome é obrigatório.");
      return;
    }

    setSaving(true);
    try {
      await api.userUpdateProfile(accessToken, {
        name: name.trim(),
        phone: phone.replace(/\D/g, ""),
        cpf: cpf.replace(/\D/g, ""),
        address: profile?.address || "",
        city: profile?.city || "",
        state: profile?.state || "",
        cep: profile?.cep || "",
      });
      api.invalidateUserMeCache();
      setSuccess("Perfil atualizado com sucesso!");
      setTimeout(function () { setSuccess(null); }, 4000);
    } catch (err: any) {
      console.error("Save profile error:", err);
      setError(err.message || "Erro ao salvar perfil.");
    } finally {
      setSaving(false);
    }
  };

  // Send password reset email
  var handleSendPasswordReset = async function () {
    if (!profile?.email) return;
    setError(null);
    setSuccess(null);
    setSendingReset(true);

    try {
      var result = await api.userForgotPassword(profile.email);
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
  var handleLogout = async function () {
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

  var menuItems = [
    { key: "perfil" as ActiveTab, label: "Meus Dados", icon: User, desc: "Informações pessoais" },
    { key: "enderecos" as ActiveTab, label: "Endereços", icon: MapPin, desc: "Endereços de entrega" },
    { key: "pedidos" as ActiveTab, label: "Meus Pedidos", icon: Package, desc: "Histórico de compras" },
    { key: "favoritos" as ActiveTab, label: "Favoritos", icon: Heart, desc: "Produtos salvos" },
    { key: "avaliacoes" as ActiveTab, label: "Avaliações", icon: Star, desc: "Minhas avaliações" },
    { key: "senha" as ActiveTab, label: "Segurança", icon: Lock, desc: "Alterar senha" },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6 text-gray-500" style={{ fontSize: "0.8rem" }}>
        <Link to="/" className="hover:text-red-600 transition-colors">Início</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-gray-800 font-medium">Minha Conta</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <UserAvatar avatarId={profile?.avatarId} customAvatarUrl={profile?.customAvatarUrl} size="lg" />
          <div>
            <h1 className="text-gray-900" style={{ fontSize: "1.5rem", fontWeight: 700 }}>
              {"Olá, " + (profile?.name?.split(" ")[0] || "Usuário") + "!"}
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

      {/* ═══════ Profile incomplete banner (Google OAuth / new users) ═══════ */}
      {profile && (!profile.cpf || !profile.phone || !profile.name) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-amber-800" style={{ fontSize: "0.9rem", fontWeight: 700 }}>
              Complete seu cadastro
            </p>
            <p className="text-amber-700 mt-0.5" style={{ fontSize: "0.8rem" }}>
              Para realizar compras, e necessario preencher seus dados pessoais: nome completo, CPF e telefone.
              {!profile.cpf && !profile.phone ? " Faltam: CPF e telefone." :
                !profile.cpf ? " Falta: CPF." :
                !profile.phone ? " Falta: telefone." :
                !profile.name ? " Falta: nome completo." : ""}
            </p>
            {activeTab !== "perfil" && (
              <button
                onClick={function () { setActiveTab("perfil"); setError(null); setSuccess(null); }}
                className="mt-2 inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                style={{ fontSize: "0.78rem", fontWeight: 600 }}
              >
                <User className="w-3.5 h-3.5" />
                Completar dados
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <nav className="divide-y divide-gray-100">
              {menuItems.map(function (item) {
                return (
                  <button
                    key={item.key}
                    onClick={function () { setActiveTab(item.key); setError(null); setSuccess(null); }}
                    className={
                      "w-full flex items-center gap-3 px-4 py-3.5 transition-all cursor-pointer " +
                      (activeTab === item.key
                        ? "bg-red-50 border-l-3 border-red-600"
                        : "hover:bg-gray-50 border-l-3 border-transparent")
                    }
                  >
                    <item.icon
                      className={
                        "w-5 h-5 shrink-0 " +
                        (activeTab === item.key ? "text-red-600" : "text-gray-400")
                      }
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
                );
              })}
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

              {/* ─── Avatar Picker Section ─── */}
              <div className="px-6 py-5 border-b border-gray-100">
                <p className="text-gray-700 mb-3" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                  Foto de Perfil
                </p>
                <AvatarPicker
                  currentAvatarId={profile?.avatarId}
                  currentCustomUrl={profile?.customAvatarUrl}
                  onSelectAvatar={handleSelectAvatar}
                  onUploadCustom={handleUploadAvatar}
                  onRemoveCustom={handleRemoveCustomAvatar}
                  uploading={avatarUploading}
                />
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
                      onChange={function (e) { setName(e.target.value); }}
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
                      O e-mail não pode ser alterado.
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
                        onChange={function (e) { setPhone(formatPhone(e.target.value)); }}
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
                        onChange={function (e) { setCpf(formatCpf(e.target.value)); }}
                        placeholder="000.000.000-00"
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-gray-800 placeholder-gray-400 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all"
                        style={{ fontSize: "0.9rem" }}
                      />
                    </div>
                  </div>
                </div>

                {/* Info about addresses */}
                <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                  <MapPin className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-blue-700" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                      Endereços de entrega
                    </p>
                    <p className="text-blue-600 mt-0.5" style={{ fontSize: "0.75rem" }}>
                      Gerencie seus endereços na aba{" "}
                      <button
                        type="button"
                        onClick={function () { setActiveTab("enderecos"); }}
                        className="underline font-semibold cursor-pointer hover:text-blue-800"
                      >
                        Endereços
                      </button>.
                    </p>
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

                {/* Member since */}
                {profile?.created_at && (
                  <div className="pt-3 border-t border-gray-100">
                    <p className="text-gray-400 flex items-center gap-1.5" style={{ fontSize: "0.75rem" }}>
                      <Clock className="w-3.5 h-3.5" />
                      {"Membro desde " + new Date(profile.created_at).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                    </p>
                  </div>
                )}
              </form>
            </div>
          )}

          {/* ─── ENDERECOS TAB ─── */}
          {activeTab === "enderecos" && accessToken && (
            <AddressesTab accessToken={accessToken} />
          )}

          {/* ─── PEDIDOS TAB ─── */}
          {activeTab === "pedidos" && (
            <OrdersTab accessToken={accessToken} />
          )}

          {/* ─── FAVORITOS TAB ─── */}
          {activeTab === "favoritos" && (
            <FavoritosTab />
          )}

          {/* ─── AVALIACOES TAB ─── */}
          {activeTab === "avaliacoes" && accessToken && (
            <MinhasAvaliacoesTab accessToken={accessToken} />
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
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
                      <div className="flex items-start gap-3">
                        <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-amber-800 mb-1" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                            Proteção extra para sua conta
                          </p>
                          <p className="text-amber-700 leading-relaxed" style={{ fontSize: "0.8rem" }}>
                            Por segurança, a alteração de senha é feita por email. Enviaremos um link
                            de redefinicao para <strong>{profile?.email}</strong>.
                          </p>
                        </div>
                      </div>
                    </div>

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
                          Defina sua nova senha na página que abrirá
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
                        Abra seu e-mail, clique no link de redefinição e depois acesse a página abaixo
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
                        onClick={function () { setResetEmailSent(false); }}
                        className="flex items-center justify-center gap-2 border border-gray-300 text-gray-600 hover:bg-gray-50 px-5 py-3 rounded-xl transition-colors cursor-pointer"
                        style={{ fontSize: "0.85rem", fontWeight: 500 }}
                      >
                        Enviar novamente
                      </button>
                    </div>

                    <p className="text-gray-400 mt-4" style={{ fontSize: "0.75rem" }}>
                      Não recebeu? Verifique sua pasta de spam ou lixo eletrônico.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// ─── Addresses Tab (standalone, reusing multi-address CRUD system) ───
// ════════════════════════════════════════════════════════════════════════

var BR_STATES = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
];

var LABEL_OPTIONS = [
  { value: "Casa", icon: Home },
  { value: "Trabalho", icon: Building2 },
  { value: "Outro", icon: MapPin },
];

interface AddrFormData {
  label: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  isDefault: boolean;
}

var EMPTY_ADDR: AddrFormData = {
  label: "Casa", cep: "", street: "", number: "", complement: "",
  neighborhood: "", city: "", state: "", isDefault: false,
};

function AddressesTab({ accessToken }: { accessToken: string }) {
  var [addresses, setAddresses] = useState<api.UserAddress[]>([]);
  var [loading, setLoading] = useState(true);
  var [showForm, setShowForm] = useState(false);
  var [editingId, setEditingId] = useState<string | null>(null);
  var [form, setForm] = useState<AddrFormData>({ ...EMPTY_ADDR });
  var [saving, setSaving] = useState(false);
  var [deleting, setDeleting] = useState<string | null>(null);
  var [cepLoading, setCepLoading] = useState(false);
  var [cepError, setCepError] = useState<string | null>(null);
  var [formError, setFormError] = useState<string | null>(null);
  var [successMsg, setSuccessMsg] = useState<string | null>(null);

  var loadAddresses = useCallback(async function () {
    try {
      var result = await api.getUserAddresses(accessToken);
      setAddresses(result.addresses || []);
    } catch (e) {
      console.error("Load addresses error:", e);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(function () { loadAddresses(); }, [loadAddresses]);

  var handleCepLookup = useCallback(async function (cep: string) {
    var digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setCepLoading(true);
    setCepError(null);
    try {
      var resp = await fetch("https://viacep.com.br/ws/" + digits + "/json/");
      var data = await resp.json();
      if (data.erro) { setCepError("CEP não encontrado"); return; }
      setForm(function (prev) {
        return {
          ...prev,
          street: data.logradouro || prev.street,
          neighborhood: data.bairro || prev.neighborhood,
          city: data.localidade || prev.city,
          state: data.uf || prev.state,
          complement: data.complemento || prev.complement,
        };
      });
    } catch { setCepError("Erro ao buscar CEP"); }
    finally { setCepLoading(false); }
  }, []);

  var handleCepChange = function (val: string) {
    var formatted = formatCepInput(val);
    setForm(function (p) { return { ...p, cep: formatted }; });
    setCepError(null);
    if (formatted.replace(/\D/g, "").length === 8) handleCepLookup(formatted);
  };

  var openNewForm = function () {
    setEditingId(null);
    setForm({ ...EMPTY_ADDR });
    setShowForm(true);
    setFormError(null);
    setCepError(null);
  };

  var openEditForm = function (addr: api.UserAddress) {
    setEditingId(addr.id);
    setForm({
      label: addr.label, cep: formatCepInput(addr.cep), street: addr.street,
      number: addr.number, complement: addr.complement, neighborhood: addr.neighborhood,
      city: addr.city, state: addr.state, isDefault: addr.isDefault,
    });
    setShowForm(true);
    setFormError(null);
    setCepError(null);
  };

  var cancelForm = function () {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...EMPTY_ADDR });
    setFormError(null);
    setCepError(null);
  };

  var handleSave = async function () {
    if (!form.street.trim()) { setFormError("Informe a rua/logradouro"); return; }
    if (!form.number.trim()) { setFormError("Informe o número"); return; }
    if (!form.neighborhood.trim()) { setFormError("Informe o bairro"); return; }
    if (!form.city.trim()) { setFormError("Informe a cidade"); return; }
    if (!form.state) { setFormError("Selecione o estado"); return; }
    if (form.cep.replace(/\D/g, "").length < 8) { setFormError("Informe um CEP válido"); return; }

    setSaving(true);
    setFormError(null);
    try {
      var payload = {
        label: form.label || "Casa",
        street: form.street.trim(),
        number: form.number.trim(),
        complement: form.complement.trim(),
        neighborhood: form.neighborhood.trim(),
        city: form.city.trim(),
        state: form.state,
        cep: form.cep.replace(/\D/g, ""),
        isDefault: form.isDefault || addresses.length === 0,
      };

      var result: any;
      if (editingId) {
        result = await api.updateUserAddress(accessToken, editingId, payload);
      } else {
        result = await api.addUserAddress(accessToken, payload);
      }

      if (result.addresses) setAddresses(result.addresses);
      setShowForm(false);
      setEditingId(null);
      setForm({ ...EMPTY_ADDR });
      setSuccessMsg(editingId ? "Endereço atualizado!" : "Endereço adicionado!");
      setTimeout(function () { setSuccessMsg(null); }, 3000);
    } catch (e: any) {
      console.error("Save address error:", e);
      setFormError(e.data?.error || e.message || "Erro ao salvar endereço");
    } finally {
      setSaving(false);
    }
  };

  var handleDelete = async function (id: string) {
    if (!confirm("Remover este endereço?")) return;
    setDeleting(id);
    try {
      var result = await api.deleteUserAddress(accessToken, id);
      setAddresses(result.addresses || []);
      setSuccessMsg("Endereço removido.");
      setTimeout(function () { setSuccessMsg(null); }, 3000);
    } catch (e: any) {
      console.error("Delete address error:", e);
      alert(e.data?.error || e.message || "Erro ao remover endereço");
    } finally {
      setDeleting(null);
    }
  };

  var handleSetDefault = async function (addr: api.UserAddress) {
    try {
      var result = await api.updateUserAddress(accessToken, addr.id, { isDefault: true });
      if (result.addresses) setAddresses(result.addresses);
      setSuccessMsg("Endereço padrão atualizado!");
      setTimeout(function () { setSuccessMsg(null); }, 3000);
    } catch (e: any) {
      console.error("Set default error:", e);
    }
  };

  var formatDisplayAddr = function (addr: api.UserAddress): string {
    var parts = [addr.street];
    if (addr.number) parts[0] = parts[0] + ", " + addr.number;
    if (addr.complement) parts.push(addr.complement);
    if (addr.neighborhood) parts.push(addr.neighborhood);
    return parts.join(" - ");
  };

  var formatCityState = function (addr: api.UserAddress): string {
    var cepF = addr.cep;
    if (cepF.length === 8) cepF = cepF.slice(0, 5) + "-" + cepF.slice(5);
    return [addr.city, addr.state, cepF].filter(Boolean).join(" - ");
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <Loader2 className="w-8 h-8 text-red-600 animate-spin mx-auto mb-3" />
        <p className="text-gray-500" style={{ fontSize: "0.85rem" }}>Carregando endereços...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MapPin className="w-5 h-5 text-red-600" />
            <h2 className="text-gray-900" style={{ fontSize: "1.1rem", fontWeight: 600 }}>
              Endereços de Entrega
            </h2>
            {addresses.length > 0 && (
              <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full" style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                {addresses.length}/10
              </span>
            )}
          </div>
          {!showForm && addresses.length < 10 && (
            <button
              onClick={openNewForm}
              className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors cursor-pointer"
              style={{ fontSize: "0.82rem", fontWeight: 600 }}
            >
              <Plus className="w-4 h-4" />
              Novo Endereço
            </button>
          )}
        </div>

        {successMsg && (
          <div className="mx-6 mt-4 bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
            <p className="text-green-700" style={{ fontSize: "0.82rem" }}>{successMsg}</p>
          </div>
        )}

        {/* Address list */}
        {addresses.length > 0 && !showForm && (
          <div className="p-6 space-y-3">
            {addresses.map(function (addr) {
              var LabelIcon = LABEL_OPTIONS.find(function (o) { return o.value === addr.label; })?.icon || MapPin;
              return (
                <div
                  key={addr.id}
                  className={
                    "rounded-xl border-2 p-4 transition-all " +
                    (addr.isDefault ? "border-red-200 bg-red-50/30" : "border-gray-200 bg-white")
                  }
                >
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className={
                      "rounded-lg w-10 h-10 flex items-center justify-center shrink-0 " +
                      (addr.isDefault ? "bg-red-100" : "bg-gray-100")
                    }>
                      <LabelIcon className={"w-5 h-5 " + (addr.isDefault ? "text-red-600" : "text-gray-400")} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-gray-800" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                          {addr.label || "Endereço"}
                        </span>
                        {addr.isDefault && (
                          <span className="inline-flex items-center gap-0.5 bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded" style={{ fontSize: "0.62rem", fontWeight: 600 }}>
                            <Star className="w-2.5 h-2.5" />
                            Padrão
                          </span>
                        )}
                      </div>
                      <p className="text-gray-600" style={{ fontSize: "0.85rem", lineHeight: 1.5 }}>
                        {formatDisplayAddr(addr)}
                      </p>
                      <p className="text-gray-400" style={{ fontSize: "0.78rem" }}>
                        {formatCityState(addr)}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {!addr.isDefault && (
                        <button
                          onClick={function () { handleSetDefault(addr); }}
                          className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                          title="Definir como padrão"
                        >
                          <Star className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={function () { openEditForm(addr); }}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                        title="Editar"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={function () { handleDelete(addr.id); }}
                        disabled={deleting === addr.id}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                        title="Remover"
                      >
                        {deleting === addr.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {addresses.length === 0 && !showForm && (
          <div className="p-12 text-center flex flex-col items-center">
            {/* Animated illustration */}
            <div className="relative mb-6">
              <div
                className="w-28 h-28 rounded-full border-2 border-dashed border-gray-200 flex items-center justify-center"
                style={{ animation: "es-spin 20s linear infinite" }}
              >
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
                  <MapPin
                    className="w-9 h-9 text-blue-400"
                    style={{ animation: "es-pin-drop 1.2s cubic-bezier(.22,.61,.36,1) both" }}
                  />
                </div>
              </div>
              <Sparkles
                className="w-4 h-4 text-blue-300 absolute -top-1 right-0"
                style={{ animation: "es-twinkle 2s ease-in-out infinite" }}
              />
              <Sparkles
                className="w-3 h-3 text-indigo-300 absolute bottom-2 -left-2"
                style={{ animation: "es-twinkle 2s ease-in-out 0.7s infinite" }}
              />
              {/* Pulse ring */}
              <div
                className="absolute inset-0 rounded-full border-2 border-blue-200"
                style={{ animation: "es-ring 2.5s ease-out infinite" }}
              />
            </div>
            <p className="text-gray-800 mb-1" style={{ fontSize: "1.1rem", fontWeight: 700 }}>
              Nenhum endereço cadastrado
            </p>
            <p className="text-gray-400 mb-7 max-w-[260px]" style={{ fontSize: "0.85rem", lineHeight: 1.5 }}>
              Adicione um endereço de entrega para agilizar suas compras futuras.
            </p>
            <button
              onClick={openNewForm}
              className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl transition-all cursor-pointer shadow-lg shadow-red-200/50 hover:shadow-red-300/50 hover:-translate-y-0.5"
              style={{ fontSize: "0.9rem", fontWeight: 700, animation: "es-fade-up 0.5s ease both 0.3s" }}
            >
              <Plus className="w-4 h-4" />
              Adicionar Endereço
            </button>
          </div>
        )}

        {/* Address form */}
        {showForm && (
          <div className="p-6">
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-gray-700" style={{ fontSize: "0.95rem", fontWeight: 600 }}>
                  {editingId ? "Editar Endereço" : "Novo Endereço"}
                </h4>
                <button
                  onClick={cancelForm}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Label */}
              <div>
                <label className="block text-gray-500 mb-1.5" style={{ fontSize: "0.78rem", fontWeight: 500 }}>
                  Tipo de endereço
                </label>
                <div className="flex gap-2">
                  {LABEL_OPTIONS.map(function (opt) {
                    var isActive = form.label === opt.value;
                    var Icon = opt.icon;
                    return (
                      <button
                        key={opt.value}
                        onClick={function () { setForm(function (p) { return { ...p, label: opt.value }; }); }}
                        className={
                          "flex items-center gap-1.5 px-3 py-2 rounded-lg border transition-all cursor-pointer " +
                          (isActive ? "border-red-500 bg-red-50 text-red-700" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300")
                        }
                        style={{ fontSize: "0.82rem", fontWeight: isActive ? 600 : 400 }}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {opt.value}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* CEP */}
              <div>
                <label className="block text-gray-500 mb-1.5" style={{ fontSize: "0.78rem", fontWeight: 500 }}>
                  CEP <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={form.cep}
                    onChange={function (e) { handleCepChange(e.target.value); }}
                    placeholder="00000-000"
                    className={
                      "w-full px-4 py-2.5 border rounded-lg text-gray-800 focus:outline-none focus:ring-2 transition-colors pr-10 " +
                      (cepError ? "border-red-300 bg-red-50 focus:ring-red-200" : "border-gray-200 bg-white focus:ring-red-200 focus:border-red-300")
                    }
                    style={{ fontSize: "0.9rem" }}
                    maxLength={9}
                  />
                  {cepLoading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Loader2 className="w-4 h-4 text-red-500 animate-spin" />
                    </div>
                  )}
                  {!cepLoading && form.cep.replace(/\D/g, "").length === 8 && !cepError && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    </div>
                  )}
                </div>
                {cepError && (
                  <p className="text-red-500 mt-1" style={{ fontSize: "0.72rem" }}>{cepError}</p>
                )}
              </div>

              {/* Street */}
              <div>
                <label className="block text-gray-500 mb-1.5" style={{ fontSize: "0.78rem", fontWeight: 500 }}>
                  Rua / Logradouro <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.street}
                  onChange={function (e) { setForm(function (p) { return { ...p, street: e.target.value }; }); }}
                  placeholder="Ex: Rua das Flores"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300 transition-colors"
                  style={{ fontSize: "0.9rem" }}
                />
              </div>

              {/* Number + Complement */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-500 mb-1.5" style={{ fontSize: "0.78rem", fontWeight: 500 }}>
                    Número <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.number}
                    onChange={function (e) { setForm(function (p) { return { ...p, number: e.target.value }; }); }}
                    placeholder="123"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300 transition-colors"
                    style={{ fontSize: "0.9rem" }}
                  />
                </div>
                <div>
                  <label className="block text-gray-500 mb-1.5" style={{ fontSize: "0.78rem", fontWeight: 500 }}>
                    Complemento
                  </label>
                  <input
                    type="text"
                    value={form.complement}
                    onChange={function (e) { setForm(function (p) { return { ...p, complement: e.target.value }; }); }}
                    placeholder="Apto 101"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300 transition-colors"
                    style={{ fontSize: "0.9rem" }}
                  />
                </div>
              </div>

              {/* Neighborhood */}
              <div>
                <label className="block text-gray-500 mb-1.5" style={{ fontSize: "0.78rem", fontWeight: 500 }}>
                  Bairro <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.neighborhood}
                  onChange={function (e) { setForm(function (p) { return { ...p, neighborhood: e.target.value }; }); }}
                  placeholder="Centro"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300 transition-colors"
                  style={{ fontSize: "0.9rem" }}
                />
              </div>

              {/* City + State */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-gray-500 mb-1.5" style={{ fontSize: "0.78rem", fontWeight: 500 }}>
                    Cidade <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={function (e) { setForm(function (p) { return { ...p, city: e.target.value }; }); }}
                    placeholder="Maringá"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300 transition-colors"
                    style={{ fontSize: "0.9rem" }}
                  />
                </div>
                <div>
                  <label className="block text-gray-500 mb-1.5" style={{ fontSize: "0.78rem", fontWeight: 500 }}>
                    Estado <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.state}
                    onChange={function (e) { setForm(function (p) { return { ...p, state: e.target.value }; }); }}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300 transition-colors appearance-none cursor-pointer"
                    style={{ fontSize: "0.9rem" }}
                  >
                    <option value="">UF</option>
                    {BR_STATES.map(function (st) {
                      return <option key={st} value={st}>{st}</option>;
                    })}
                  </select>
                </div>
              </div>

              {/* Default checkbox */}
              {addresses.length > 0 && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isDefault}
                    onChange={function (e) { setForm(function (p) { return { ...p, isDefault: e.target.checked }; }); }}
                    className="w-4 h-4 accent-red-600 cursor-pointer"
                  />
                  <span className="text-gray-600" style={{ fontSize: "0.82rem" }}>
                    Definir como endereço padrão
                  </span>
                </label>
              )}

              {/* Error */}
              {formError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <p className="text-red-600" style={{ fontSize: "0.78rem" }}>{formError}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 bg-red-600 text-white py-2.5 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  style={{ fontSize: "0.88rem", fontWeight: 600 }}
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      {editingId ? "Atualizar Endereço" : "Salvar Endereço"}
                    </>
                  )}
                </button>
                <button
                  onClick={cancelForm}
                  disabled={saving}
                  className="px-5 py-2.5 bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300 transition-colors cursor-pointer"
                  style={{ fontSize: "0.88rem", fontWeight: 500 }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// ─── Orders Tab (enhanced with filters + better details) ────────────
// ════════════════════════════════════════════════════════════════════════

function OrdersTab({ accessToken }: { accessToken: string | null }) {
  var [orders, setOrders] = useState<api.UserOrder[]>([]);
  var [loadingOrders, setLoadingOrders] = useState(true);
  var [ordersError, setOrdersError] = useState<string | null>(null);
  var [expandedOrder, setExpandedOrder] = useState<number | null>(null);
  var [statusFilter, setStatusFilter] = useState<string>("all");
  var [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  var [trackingOrderId, setTrackingOrderId] = useState<string | null>(null);

  useEffect(function () {
    if (!accessToken) return;
    var cancelled = false;

    async function fetchOrders() {
      setLoadingOrders(true);
      setOrdersError(null);
      try {
        var result = await api.userMyOrders(accessToken!);
        if (!cancelled) setOrders(result.orders || []);
      } catch (err: any) {
        console.error("Fetch orders error:", err);
        if (!cancelled) setOrdersError(err.message || "Erro ao carregar pedidos.");
      } finally {
        if (!cancelled) setLoadingOrders(false);
      }
    }

    fetchOrders();
    return function () { cancelled = true; };
  }, [accessToken]);

  var formatPrice = function (val: number) {
    return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
  };

  var formatDate = function (dateStr: string) {
    try {
      var d = new Date(dateStr);
      return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch { return dateStr; }
  };

  var formatDateShort = function (dateStr: string) {
    try {
      var d = new Date(dateStr);
      return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
    } catch { return dateStr; }
  };

  var statusLabels: Record<string, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
    paid: { label: "Pago", color: "text-green-700", bg: "bg-green-50 border-green-200", icon: CheckCircle2 },
    shipped: { label: "Enviado", color: "text-blue-700", bg: "bg-blue-50 border-blue-200", icon: Truck },
    delivered: { label: "Entregue", color: "text-green-700", bg: "bg-green-50 border-green-200", icon: CheckCircle2 },
    sige_registered: { label: "Registrado", color: "text-blue-700", bg: "bg-blue-50 border-blue-200", icon: Package },
    confirmed: { label: "Registrado", color: "text-blue-700", bg: "bg-blue-50 border-blue-200", icon: Package },
    awaiting_payment: { label: "Aguardando Pagamento", color: "text-amber-700", bg: "bg-amber-50 border-amber-200", icon: Clock },
    pending: { label: "Pendente", color: "text-amber-700", bg: "bg-amber-50 border-amber-200", icon: Clock },
    cancelled: { label: "Cancelado", color: "text-red-700", bg: "bg-red-50 border-red-200", icon: X },
  };

  var paymentLabels: Record<string, string> = {
    pix: "PIX",
    boleto: "Boleto",
    mercadopago: "Mercado Pago",
    cartao_credito: "Cartao de Credito",
  };

  // Unique statuses for filter
  var uniqueStatuses = Array.from(new Set(orders.map(function (o) { return o.status; })));

  // Filtered + sorted orders
  var filteredOrders = orders.filter(function (o) {
    if (statusFilter === "all") return true;
    return o.status === statusFilter;
  });

  if (sortOrder === "newest") {
    filteredOrders.sort(function (a, b) { return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); });
  } else {
    filteredOrders.sort(function (a, b) { return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(); });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Package className="w-5 h-5 text-red-600" />
          <h2 className="text-gray-900" style={{ fontSize: "1.1rem", fontWeight: 600 }}>
            Meus Pedidos
          </h2>
          {orders.length > 0 && (
            <span className="text-gray-400" style={{ fontSize: "0.78rem" }}>
              {filteredOrders.length === orders.length
                ? orders.length + " pedido" + (orders.length !== 1 ? "s" : "")
                : filteredOrders.length + " de " + orders.length
              }
            </span>
          )}
        </div>

        {/* Filters */}
        {orders.length > 0 && (
          <div className="flex items-center gap-2">
            {/* Status filter */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={function (e) { setStatusFilter(e.target.value); setExpandedOrder(null); }}
                className="appearance-none bg-gray-50 border border-gray-200 rounded-lg pl-8 pr-8 py-1.5 text-gray-600 cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-200"
                style={{ fontSize: "0.78rem" }}
              >
                <option value="all">Todos os status</option>
                {uniqueStatuses.map(function (s) {
                  var info = statusLabels[s] || statusLabels.pending;
                  return <option key={s} value={s}>{info.label}</option>;
                })}
              </select>
              <Filter className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Sort */}
            <button
              onClick={function () { setSortOrder(sortOrder === "newest" ? "oldest" : "newest"); }}
              className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
              style={{ fontSize: "0.78rem" }}
              title={sortOrder === "newest" ? "Mais recentes primeiro" : "Mais antigos primeiro"}
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              {sortOrder === "newest" ? "Recentes" : "Antigos"}
            </button>
          </div>
        )}
      </div>

      {loadingOrders ? (
        <div className="p-12 text-center">
          <Loader2 className="w-8 h-8 text-red-600 animate-spin mx-auto mb-3" />
          <p className="text-gray-500" style={{ fontSize: "0.85rem" }}>Carregando pedidos...</p>
        </div>
      ) : ordersError ? (
        <div className="p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-red-700" style={{ fontSize: "0.85rem" }}>{ordersError}</p>
          </div>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="p-12 text-center flex flex-col items-center">
          {/* Animated illustration */}
          <div className="relative mb-6">
            <div
              className="w-28 h-28 rounded-full border-2 border-dashed border-gray-200 flex items-center justify-center"
              style={{ animation: "es-spin 20s linear infinite" }}
            >
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center relative overflow-hidden">
                <ShoppingBag
                  className="w-8 h-8 text-amber-400"
                  style={{ animation: "es-float 3s ease-in-out infinite" }}
                />
                {/* Mini receipt sliding out */}
                <FileText
                  className="w-3.5 h-3.5 text-amber-300 absolute -top-0.5 right-3"
                  style={{ animation: "es-receipt 2.5s ease-in-out 0.5s infinite" }}
                />
              </div>
            </div>
            <Sparkles
              className="w-4 h-4 text-amber-300 absolute -top-1 right-0"
              style={{ animation: "es-twinkle 2s ease-in-out infinite" }}
            />
            <Sparkles
              className="w-3 h-3 text-orange-300 absolute bottom-2 -left-2"
              style={{ animation: "es-twinkle 2s ease-in-out 0.7s infinite" }}
            />
          </div>
          <p className="text-gray-800 mb-1" style={{ fontSize: "1.1rem", fontWeight: 700 }}>
            {statusFilter !== "all" ? "Nenhum pedido com esse status" : "Nenhum pedido encontrado"}
          </p>
          <p className="text-gray-400 mb-7 max-w-[280px]" style={{ fontSize: "0.85rem", lineHeight: 1.5 }}>
            {statusFilter !== "all"
              ? "Tente limpar os filtros para ver todos os seus pedidos."
              : "Seus pedidos aparecerão aqui quando você fizer uma compra."
            }
          </p>
          <div style={{ animation: "es-fade-up 0.5s ease both 0.3s" }}>
            {statusFilter !== "all" ? (
              <button
                onClick={function () { setStatusFilter("all"); }}
                className="inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-3 rounded-xl transition-all cursor-pointer hover:-translate-y-0.5"
                style={{ fontSize: "0.9rem", fontWeight: 600 }}
              >
                <Filter className="w-4 h-4" />
                Limpar Filtro
              </button>
            ) : (
              <Link
                to="/catalogo"
                className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl transition-all shadow-lg shadow-red-200/50 hover:shadow-red-300/50 hover:-translate-y-0.5"
                style={{ fontSize: "0.9rem", fontWeight: 700 }}
              >
                <Search className="w-4 h-4" />
                Explorar Catálogo
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {filteredOrders.map(function (order, orderIdx) {
            var isExpanded = expandedOrder === orderIdx;
            var statusInfo = statusLabels[order.status] || statusLabels.pending;
            var StatusIcon = statusInfo.icon;

            return (
              <div key={"order-" + orderIdx} className="group">
                {/* Order header row */}
                <button
                  onClick={function () { setExpandedOrder(isExpanded ? null : orderIdx); }}
                  className="w-full px-6 py-4 flex items-center gap-4 hover:bg-gray-50/50 transition-colors cursor-pointer"
                >
                  {/* Order icon */}
                  <div className={
                    "rounded-lg w-10 h-10 flex items-center justify-center shrink-0 " +
                    (order.status === "paid" ? "bg-green-50" :
                     order.status === "cancelled" ? "bg-red-50" : "bg-amber-50")
                  }>
                    <StatusIcon className={
                      "w-5 h-5 " +
                      (order.status === "paid" ? "text-green-600" :
                       order.status === "cancelled" ? "text-red-400" : "text-amber-500")
                    } />
                  </div>

                  {/* Order info */}
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-gray-900" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                        {"Pedido #" + (order.localOrderId || order.orderId || "N/A")}
                      </span>
                      <span className={"px-2 py-0.5 rounded-full border text-xs font-medium " + statusInfo.bg + " " + statusInfo.color}>
                        {statusInfo.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-gray-500" style={{ fontSize: "0.78rem" }}>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDateShort(order.createdAt)}
                      </span>
                      <span>{order.itemCount + " " + (order.itemCount === 1 ? "item" : "itens")}</span>
                      {order.paymentMethod && (
                        <span className="flex items-center gap-1">
                          <CreditCard className="w-3 h-3" />
                          {paymentLabels[order.paymentMethod] || order.paymentMethod}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Total + Expand */}
                  <div className="text-right shrink-0">
                    {order.total > 0 && (
                      <p className="text-gray-900" style={{ fontSize: "0.95rem", fontWeight: 700 }}>
                        {formatPrice(order.total)}
                      </p>
                    )}
                  </div>

                  <ChevronDown
                    className={"w-4 h-4 text-gray-400 shrink-0 transition-transform " + (isExpanded ? "rotate-180" : "")}
                  />
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-6 pb-5 pt-0">
                    {/* Order identification details */}
                    <div className="mb-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {order.orderId && (
                        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                          <Hash className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <div>
                            <p className="text-gray-400" style={{ fontSize: "0.68rem" }}>Pedido SIGE</p>
                            <p className="text-gray-800 font-mono" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                              {"#" + order.orderId}
                            </p>
                          </div>
                        </div>
                      )}
                      {order.transactionId && (
                        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                          <CreditCard className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <div>
                            <p className="text-gray-400" style={{ fontSize: "0.68rem" }}>
                              {"Transacao " + (paymentLabels[order.paymentMethod || ""] || "PagHiper")}
                            </p>
                            <p className="text-gray-800 font-mono" style={{ fontSize: "0.78rem", fontWeight: 500 }}>
                              {order.transactionId}
                            </p>
                          </div>
                        </div>
                      )}
                      {order.status === "paid" && (
                        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 sm:col-span-2">
                          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                          <p className="text-green-700" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                            Pagamento confirmado
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Shipping address */}
                    {order.shippingAddress && (order.shippingAddress.address || order.shippingAddress.city) && (
                      <div className="mb-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                        <div className="flex items-center gap-2 mb-2">
                          <MapPin className="w-3.5 h-3.5 text-gray-400" />
                          <p className="text-gray-500" style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            Endereço de Entrega
                          </p>
                        </div>
                        <div className="space-y-0.5">
                          {order.shippingAddress.name && (
                            <p className="text-gray-800" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                              {order.shippingAddress.name}
                            </p>
                          )}
                          {order.shippingAddress.address && (
                            <p className="text-gray-600" style={{ fontSize: "0.8rem" }}>
                              {order.shippingAddress.address}
                            </p>
                          )}
                          <p className="text-gray-600" style={{ fontSize: "0.8rem" }}>
                            {[
                              order.shippingAddress.city,
                              order.shippingAddress.state,
                              order.shippingAddress.cep ? "CEP " + order.shippingAddress.cep.replace(/(\d{5})(\d{3})/, "$1-$2") : null,
                            ].filter(Boolean).join(" - ")}
                          </p>
                          {order.shippingAddress.phone && (
                            <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>
                              {"Tel: " + order.shippingAddress.phone.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3")}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Shipping option info */}
                    {order.shippingOption && (
                      <div className="mb-3 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5">
                        <Truck className="w-4 h-4 text-blue-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-blue-800" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                            {order.shippingOption.carrierName}
                          </span>
                          {order.shippingOption.deliveryDays > 0 && (
                            <span className="text-blue-600 ml-2" style={{ fontSize: "0.75rem" }}>
                              {"ate " + order.shippingOption.deliveryDays + " dias uteis"}
                            </span>
                          )}
                        </div>
                        <span
                          className={order.shippingOption.free ? "text-green-600" : "text-blue-800"}
                          style={{ fontSize: "0.85rem", fontWeight: 700 }}
                        >
                          {order.shippingOption.free ? "Grátis" : "R$ " + order.shippingOption.price.toFixed(2).replace(".", ",")}
                        </span>
                      </div>
                    )}

                    {/* Tracking button — show for paid/shipped/registered orders */}
                    {(order.status === "paid" || order.status === "shipped" || order.status === "sige_registered" || order.status === "confirmed" || order.status === "delivered") && (
                      <div className="mb-3">
                        {trackingOrderId === order.localOrderId ? (
                          <InlineTracking
                            accessToken={accessToken!}
                            localOrderId={order.localOrderId}
                            onClose={function () { setTrackingOrderId(null); }}
                          />
                        ) : (
                          <button
                            onClick={function () { setTrackingOrderId(order.localOrderId); }}
                            className="w-full flex items-center justify-center gap-2 bg-green-50 hover:bg-green-100 border border-green-200 text-green-700 rounded-xl px-4 py-2.5 transition-colors cursor-pointer"
                            style={{ fontSize: "0.85rem", fontWeight: 600 }}
                          >
                            <Truck className="w-4 h-4" />
                            Rastrear Envio
                          </button>
                        )}
                      </div>
                    )}

                    <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                      {/* Items list */}
                      <div className="divide-y divide-gray-100">
                        {order.items.map(function (item, idx) {
                          return (
                            <div key={"item-" + orderIdx + "-" + idx} className="flex items-center gap-4 px-4 py-3">
                              {/* Product image */}
                              <Link
                                to={"/produto/" + encodeURIComponent(item.sku)}
                                className="w-14 h-14 bg-white rounded-lg border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center hover:border-red-300 transition-colors"
                              >
                                <ProductImage
                                  sku={item.sku}
                                  alt={item.titulo}
                                  className="w-full h-full object-contain"
                                  fallback={<Package className="w-6 h-6 text-gray-300" />}
                                />
                              </Link>

                              {/* Item info */}
                              <div className="flex-1 min-w-0">
                                <Link
                                  to={"/produto/" + encodeURIComponent(item.sku)}
                                  className="text-gray-800 hover:text-red-600 transition-colors truncate block"
                                  style={{ fontSize: "0.85rem", fontWeight: 500 }}
                                >
                                  {item.titulo}
                                </Link>
                                <p className="text-gray-400" style={{ fontSize: "0.75rem" }}>
                                  {"SKU: " + item.sku}
                                </p>
                                {item.warranty && (
                                  <div className="flex items-center gap-1 mt-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md w-fit">
                                    <ShieldCheck className="w-3 h-3" />
                                    <span style={{ fontSize: "0.62rem", fontWeight: 600 }}>
                                      {item.warranty.name} ({item.warranty.durationMonths + " meses"})
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Qty + Price */}
                              <div className="text-right shrink-0">
                                <p className="text-gray-700" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                                  {item.valorUnitario > 0 ? formatPrice(item.valorUnitario + (item.warranty ? item.warranty.price : 0)) : "Sob consulta"}
                                </p>
                                <p className="text-gray-400" style={{ fontSize: "0.72rem" }}>
                                  {"Qtd: " + item.quantidade}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Order total footer */}
                      {order.total > 0 && (
                        <div className="border-t border-gray-200 px-4 py-3 flex items-center justify-between bg-white">
                          <span className="text-gray-600" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                            Total do Pedido
                          </span>
                          <span className="text-gray-900" style={{ fontSize: "1rem", fontWeight: 700 }}>
                            {formatPrice(order.total)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* View product + Avaliar + Rastreio links */}
                    <div className="mt-3 flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        {order.items.map(function (item, idx) {
                          var isPaidOrder = order.status === "paid" || order.status === "shipped" || order.status === "sige_registered" || order.status === "confirmed" || order.status === "delivered";
                          return (
                            <div key={"actions-" + idx} className="flex items-center gap-2">
                              <Link
                                to={"/produto/" + encodeURIComponent(item.sku)}
                                className="flex items-center gap-1.5 text-red-600 hover:text-red-700 transition-colors"
                                style={{ fontSize: "0.8rem", fontWeight: 500 }}
                              >
                                <Eye className="w-3.5 h-3.5" />
                                {order.items.length > 1 ? item.sku : "Ver produto"}
                              </Link>
                              {isPaidOrder && (
                                <Link
                                  to={"/produto/" + encodeURIComponent(item.sku) + "#avaliacoes"}
                                  className="flex items-center gap-1 text-amber-600 hover:text-amber-700 transition-colors"
                                  style={{ fontSize: "0.78rem", fontWeight: 500 }}
                                >
                                  <Star className="w-3 h-3" />
                                  Avaliar
                                </Link>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {(order.status === "paid" || order.status === "shipped" || order.status === "sige_registered" || order.status === "confirmed" || order.status === "delivered") && (
                        <Link
                          to={"/rastreio/" + encodeURIComponent(order.localOrderId)}
                          className="flex items-center gap-1.5 text-green-600 hover:text-green-700 transition-colors"
                          style={{ fontSize: "0.78rem", fontWeight: 600 }}
                        >
                          <ExternalLink className="w-3 h-3" />
                          Pagina de rastreio
                        </Link>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// ─── My Reviews Tab ─────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════

function MinhasAvaliacoesTab({ accessToken }: { accessToken: string }) {
  var [reviews, setReviews] = useState<api.Review[]>([]);
  var [loading, setLoading] = useState(true);
  var [expandedId, setExpandedId] = useState<string | null>(null);
  var [lightboxImg, setLightboxImg] = useState<string | null>(null);
  var [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");

  var loadReviews = useCallback(async function () {
    setLoading(true);
    try {
      var result = await api.getUserReviews(accessToken);
      setReviews(result.reviews || []);
    } catch (err) {
      console.error("[MinhasAvaliacoesTab] Load error:", err);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(function () {
    loadReviews();
  }, [loadReviews]);

  // Counts
  var pendingCount = reviews.filter(function (r) { return r.status === "pending"; }).length;
  var approvedCount = reviews.filter(function (r) { return r.status === "approved"; }).length;
  var rejectedCount = reviews.filter(function (r) { return r.status === "rejected"; }).length;

  // Filtered reviews
  var filteredReviews = statusFilter === "all"
    ? reviews
    : reviews.filter(function (r) { return r.status === statusFilter; });

  function statusConfig(status: string) {
    if (status === "approved") return {
      text: "Publicada",
      desc: "Visível para outros clientes",
      cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
      iconCls: "text-emerald-500",
      borderCls: "border-l-emerald-500",
      dotCls: "bg-emerald-500",
    };
    if (status === "rejected") return {
      text: "Rejeitada",
      desc: "Não atendeu às diretrizes",
      cls: "bg-red-50 text-red-700 border-red-200",
      iconCls: "text-red-500",
      borderCls: "border-l-red-500",
      dotCls: "bg-red-500",
    };
    return {
      text: "Aguardando aprovação",
      desc: "Em análise pela equipe",
      cls: "bg-amber-50 text-amber-700 border-amber-200",
      iconCls: "text-amber-500",
      borderCls: "border-l-amber-500",
      dotCls: "bg-amber-500",
    };
  }

  function statusIcon(status: string) {
    if (status === "approved") return React.createElement(CheckCircle2, { className: "w-4 h-4" });
    if (status === "rejected") return React.createElement(X, { className: "w-4 h-4" });
    return React.createElement(Clock, { className: "w-4 h-4" });
  }

  function imgStatusConfig(status: string) {
    if (status === "approved") return { cls: "bg-emerald-50 text-emerald-600 border-emerald-200" };
    if (status === "rejected") return { cls: "bg-red-50 text-red-600 border-red-200" };
    return { cls: "bg-amber-50 text-amber-600 border-amber-200" };
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <Loader2 className="w-8 h-8 text-red-600 animate-spin mx-auto mb-3" />
        <p className="text-gray-500" style={{ fontSize: "0.85rem" }}>Carregando avaliações...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Star className="w-5 h-5 text-red-600" />
            <h2 className="text-gray-900" style={{ fontSize: "1.1rem", fontWeight: 600 }}>
              Minhas Avaliações
            </h2>
            {reviews.length > 0 && (
              <span className="text-gray-400" style={{ fontSize: "0.78rem" }}>
                {reviews.length + (reviews.length !== 1 ? " avaliações" : " avaliação")}
              </span>
            )}
          </div>
        </div>

        {/* Status Summary Cards */}
        {reviews.length > 0 && (
          <div className="px-6 py-4 grid grid-cols-3 gap-3">
            {/* Pending */}
            <button
              onClick={function () { setStatusFilter(statusFilter === "pending" ? "all" : "pending"); }}
              className={
                "relative rounded-xl p-3 border text-left transition-all cursor-pointer " +
                (statusFilter === "pending"
                  ? "border-amber-400 bg-amber-50 ring-2 ring-amber-200/60 shadow-sm"
                  : "border-gray-200 bg-gray-50/60 hover:bg-amber-50/50 hover:border-amber-200")
              }
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <span className="text-gray-900" style={{ fontSize: "1.25rem", fontWeight: 700 }}>
                  {pendingCount}
                </span>
              </div>
              <p className="text-gray-600" style={{ fontSize: "0.7rem", fontWeight: 600, lineHeight: 1.3 }}>
                Em análise
              </p>
            </button>

            {/* Approved */}
            <button
              onClick={function () { setStatusFilter(statusFilter === "approved" ? "all" : "approved"); }}
              className={
                "relative rounded-xl p-3 border text-left transition-all cursor-pointer " +
                (statusFilter === "approved"
                  ? "border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200/60 shadow-sm"
                  : "border-gray-200 bg-gray-50/60 hover:bg-emerald-50/50 hover:border-emerald-200")
              }
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <span className="text-gray-900" style={{ fontSize: "1.25rem", fontWeight: 700 }}>
                  {approvedCount}
                </span>
              </div>
              <p className="text-gray-600" style={{ fontSize: "0.7rem", fontWeight: 600, lineHeight: 1.3 }}>
                Publicadas
              </p>
            </button>

            {/* Rejected */}
            <button
              onClick={function () { setStatusFilter(statusFilter === "rejected" ? "all" : "rejected"); }}
              className={
                "relative rounded-xl p-3 border text-left transition-all cursor-pointer " +
                (statusFilter === "rejected"
                  ? "border-red-400 bg-red-50 ring-2 ring-red-200/60 shadow-sm"
                  : "border-gray-200 bg-gray-50/60 hover:bg-red-50/50 hover:border-red-200")
              }
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center">
                  <X className="w-3.5 h-3.5 text-red-600" />
                </div>
                <span className="text-gray-900" style={{ fontSize: "1.25rem", fontWeight: 700 }}>
                  {rejectedCount}
                </span>
              </div>
              <p className="text-gray-600" style={{ fontSize: "0.7rem", fontWeight: 600, lineHeight: 1.3 }}>
                Rejeitadas
              </p>
            </button>
          </div>
        )}

        {/* Active filter indicator */}
        {statusFilter !== "all" && reviews.length > 0 && (
          <div className="px-6 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-gray-500" style={{ fontSize: "0.75rem" }}>
                {"Mostrando: " + filteredReviews.length + " " + (statusFilter === "pending" ? "em análise" : statusFilter === "approved" ? ("publicada" + (filteredReviews.length !== 1 ? "s" : "")) : ("rejeitada" + (filteredReviews.length !== 1 ? "s" : "")))}
              </span>
              <button
                onClick={function () { setStatusFilter("all"); }}
                className="text-red-600 hover:text-red-700 flex items-center gap-1 cursor-pointer"
                style={{ fontSize: "0.75rem", fontWeight: 600 }}
              >
                <X className="w-3 h-3" />
                Limpar filtro
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Empty state */}
      {reviews.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center flex flex-col items-center">
          {/* Animated star illustration */}
          <div className="relative mb-6">
            <div
              className="w-28 h-28 rounded-full border-2 border-dashed border-amber-100 flex items-center justify-center"
              style={{ animation: "es-spin 20s linear infinite" }}
            >
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-50 to-yellow-50 flex items-center justify-center">
                <Star
                  className="w-9 h-9 text-amber-300"
                  fill="currentColor"
                  style={{ animation: "es-heartbeat 2s ease-in-out infinite" }}
                />
              </div>
            </div>
            <Sparkles
              className="w-4 h-4 text-amber-300 absolute -top-1 right-0"
              style={{ animation: "es-twinkle 2s ease-in-out infinite" }}
            />
            <Sparkles
              className="w-3 h-3 text-yellow-300 absolute bottom-2 -left-2"
              style={{ animation: "es-twinkle 2s ease-in-out 0.7s infinite" }}
            />
            <div
              className="absolute inset-0 rounded-full border-2 border-amber-100"
              style={{ animation: "es-ring 2.5s ease-out infinite" }}
            />
          </div>
          <p className="text-gray-800 mb-1" style={{ fontSize: "1.1rem", fontWeight: 700 }}>
            Nenhuma avaliação ainda
          </p>
          <p className="text-gray-400 mb-7 max-w-[280px]" style={{ fontSize: "0.85rem", lineHeight: 1.5 }}>
            Compre um produto e compartilhe sua experiência para ajudar outros clientes.
          </p>
          <Link
            to="/catalogo"
            className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl transition-all shadow-lg shadow-red-200/50 hover:shadow-red-300/50 hover:-translate-y-0.5"
            style={{ fontSize: "0.9rem", fontWeight: 700, animation: "es-fade-up 0.5s ease both 0.3s" }}
          >
            <Search className="w-4 h-4" />
            Explorar Catálogo
          </Link>
        </div>
      ) : filteredReviews.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <Filter className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
            Nenhuma avaliação com este status
          </p>
          <button
            onClick={function () { setStatusFilter("all"); }}
            className="mt-3 text-red-600 hover:text-red-700 cursor-pointer"
            style={{ fontSize: "0.82rem", fontWeight: 600 }}
          >
            Ver todas
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredReviews.map(function (review) {
            var date = new Date(review.createdAt);
            var dateStr = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
            var st = statusConfig(review.status);
            var isExpanded = expandedId === review.id;

            return (
              <div
                key={review.id}
                className={
                  "bg-white rounded-xl border border-gray-200 overflow-hidden border-l-4 " + st.borderCls
                }
              >
                {/* Status Banner */}
                <div className={"px-4 py-2.5 flex items-center justify-between gap-2 border-b " + st.cls}>
                  <div className="flex items-center gap-2">
                    <span className={st.iconCls}>
                      {statusIcon(review.status)}
                    </span>
                    <span style={{ fontSize: "0.8rem", fontWeight: 700 }}>
                      {st.text}
                    </span>
                  </div>
                  <span className="hidden sm:inline" style={{ fontSize: "0.7rem", fontWeight: 500, opacity: 0.8 }}>
                    {st.desc}
                  </span>
                </div>

                <div className="p-4">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <Link
                        to={"/produto/" + encodeURIComponent(review.sku)}
                        className="text-gray-800 hover:text-red-600 transition-colors"
                        style={{ fontSize: "0.88rem", fontWeight: 700 }}
                      >
                        {review.title || review.sku}
                      </Link>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-gray-400 font-mono" style={{ fontSize: "0.72rem" }}>
                          {review.sku}
                        </span>
                        <span className="text-gray-300">·</span>
                        <span className="text-gray-400" style={{ fontSize: "0.72rem" }}>{dateStr}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {[1, 2, 3, 4, 5].map(function (s) {
                        return (
                          <Star
                            key={s}
                            className={s <= review.rating ? "text-amber-400" : "text-gray-200"}
                            style={{ width: 16, height: 16 }}
                            fill={s <= review.rating ? "#fbbf24" : "#e5e7eb"}
                            strokeWidth={0}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Comment preview / expanded */}
                  {review.comment && (
                    <div className="mt-2">
                      <p
                        className={"text-gray-600 leading-relaxed " + (isExpanded ? "" : "line-clamp-2")}
                        style={{ fontSize: "0.84rem" }}
                      >
                        {review.comment}
                      </p>
                      {review.comment.length > 150 && (
                        <button
                          onClick={function () { setExpandedId(isExpanded ? null : review.id); }}
                          className="text-red-600 hover:text-red-700 mt-1 flex items-center gap-1 cursor-pointer"
                          style={{ fontSize: "0.75rem", fontWeight: 600 }}
                        >
                          {isExpanded ? (
                            <>{React.createElement(ChevronUp, { className: "w-3.5 h-3.5" })} Mostrar menos</>
                          ) : (
                            <>{React.createElement(ChevronDown, { className: "w-3.5 h-3.5" })} Ler mais</>
                          )}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Images */}
                  {review.images && review.images.length > 0 && (
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {review.images.map(function (img, idx) {
                        var imgSt = imgStatusConfig(img.status);
                        return (
                          <div key={img.path || idx} className="relative">
                            <button
                              onClick={function () { setLightboxImg(img.signedUrl); }}
                              className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg overflow-hidden border border-gray-200 hover:border-red-300 transition-colors cursor-pointer"
                            >
                              <img
                                src={img.signedUrl}
                                alt={"Foto " + (idx + 1)}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            </button>
                            {img.status !== "approved" && (
                              <span
                                className={"absolute -top-1 -right-1 border px-1 py-0 rounded " + imgSt.cls}
                                style={{ fontSize: "0.55rem", fontWeight: 700 }}
                              >
                                {img.status === "pending" ? "⏳" : "✕"}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Footer row */}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-3">
                      {review.helpful > 0 && (
                        <span className="flex items-center gap-1 text-gray-400" style={{ fontSize: "0.72rem" }}>
                          <ThumbsUp className="w-3 h-3" />
                          {review.helpful + " pessoa" + (review.helpful !== 1 ? "s" : "") + " achou útil"}
                        </span>
                      )}
                      {review.status === "approved" && (
                        <span className="flex items-center gap-1.5 text-emerald-600" style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                          <Eye className="w-3 h-3" />
                          Visível no site
                        </span>
                      )}
                    </div>
                    <Link
                      to={"/produto/" + encodeURIComponent(review.sku)}
                      className="inline-flex items-center gap-1.5 text-red-600 hover:text-red-700 transition-colors"
                      style={{ fontSize: "0.75rem", fontWeight: 600 }}
                    >
                      Ver produto
                      <ChevronRight className="w-3 h-3" />
                    </Link>
                  </div>

                  {/* Rejection reason */}
                  {review.moderationNote && review.status === "rejected" && (
                    <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-red-700" style={{ fontSize: "0.75rem", fontWeight: 700 }}>
                          Motivo da rejeição
                        </p>
                        <p className="text-red-600 mt-0.5" style={{ fontSize: "0.75rem", lineHeight: 1.4 }}>
                          {review.moderationNote}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Pending info tip */}
                  {review.status === "pending" && (
                    <div className="mt-3 bg-amber-50/70 border border-amber-200/80 rounded-lg px-3 py-2 flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <p className="text-amber-700" style={{ fontSize: "0.72rem" }}>
                        Avaliações são analisadas em até 48 horas. Você será notificado quando houver uma atualização.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Image Lightbox */}
      {lightboxImg && (
        <div
          className="fixed inset-0 bg-black/80 z-[999] flex items-center justify-center p-4"
          onClick={function () { setLightboxImg(null); }}
        >
          <button
            onClick={function () { setLightboxImg(null); }}
            className="absolute top-4 right-4 text-white/70 hover:text-white bg-white/10 rounded-full p-2"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={lightboxImg}
            alt="Foto da avaliação"
            className="max-w-full max-h-[85vh] object-contain rounded-lg"
            onClick={function (e) { e.stopPropagation(); }}
          />
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// ─── Favorites Tab ──────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════

function FavoritosTab() {
  var { favorites, loading: wlLoading } = useWishlist();
  var [detailsMap, setDetailsMap] = useState<Record<string, any>>({});
  var [loadingDetails, setLoadingDetails] = useState(false);

  // Load product details for favorites (title, price, stock)
  useEffect(function () {
    if (favorites.length === 0) {
      setDetailsMap({});
      return;
    }
    var cancelled = false;
    setLoadingDetails(true);

    async function loadDetails() {
      try {
        var skus = favorites.map(function (f) { return f.sku; });
        // Bulk load prices
        var priceResult = await api.getProductPricesBulk(skus);
        var map: Record<string, any> = {};
        if (priceResult.results) {
          for (var i = 0; i < priceResult.results.length; i++) {
            var p = priceResult.results[i];
            map[p.sku] = { ...(map[p.sku] || {}), price: p };
          }
        }
        if (!cancelled) setDetailsMap(map);
      } catch (err) {
        console.error("FavoritosTab: load details error:", err);
      } finally {
        if (!cancelled) setLoadingDetails(false);
      }
    }
    loadDetails();
    return function () { cancelled = true; };
  }, [favorites]);

  if (wlLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <Loader2 className="w-8 h-8 text-red-600 animate-spin mx-auto mb-3" />
        <p className="text-gray-500" style={{ fontSize: "0.85rem" }}>Carregando favoritos...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Heart className="w-5 h-5 text-red-600" />
          <h2 className="text-gray-900" style={{ fontSize: "1.1rem", fontWeight: 600 }}>
            Meus Favoritos
          </h2>
          {favorites.length > 0 && (
            <span className="text-gray-400" style={{ fontSize: "0.78rem" }}>
              {favorites.length + " produto" + (favorites.length !== 1 ? "s" : "")}
            </span>
          )}
        </div>
      </div>

      {favorites.length === 0 ? (
        <div className="p-12 text-center flex flex-col items-center">
          {/* Animated heart illustration */}
          <div className="relative mb-6">
            <div
              className="w-28 h-28 rounded-full border-2 border-dashed border-red-100 flex items-center justify-center"
              style={{ animation: "es-spin 20s linear infinite" }}
            >
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-red-50 to-pink-50 flex items-center justify-center">
                <Heart
                  className="w-9 h-9 text-red-300"
                  fill="currentColor"
                  style={{ animation: "es-heartbeat 2s ease-in-out infinite" }}
                />
              </div>
            </div>
            <Sparkles
              className="w-4 h-4 text-red-300 absolute -top-1 right-0"
              style={{ animation: "es-twinkle 2s ease-in-out infinite" }}
            />
            <Sparkles
              className="w-3 h-3 text-pink-300 absolute bottom-2 -left-2"
              style={{ animation: "es-twinkle 2s ease-in-out 0.7s infinite" }}
            />
            {/* Pulse ring */}
            <div
              className="absolute inset-0 rounded-full border-2 border-red-100"
              style={{ animation: "es-ring 2.5s ease-out infinite" }}
            />
          </div>
          <p className="text-gray-800 mb-1" style={{ fontSize: "1.1rem", fontWeight: 700 }}>
            Nenhum favorito ainda
          </p>
          <p className="text-gray-400 mb-7 max-w-[260px]" style={{ fontSize: "0.85rem", lineHeight: 1.5 }}>
            Clique no icone de coracao nos produtos para salva-los aqui.
          </p>
          <Link
            to="/catalogo"
            className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl transition-all shadow-lg shadow-red-200/50 hover:shadow-red-300/50 hover:-translate-y-0.5"
            style={{ fontSize: "0.9rem", fontWeight: 700, animation: "es-fade-up 0.5s ease both 0.3s" }}
          >
            <Search className="w-4 h-4" />
            Explorar Catálogo
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {favorites.map(function (fav) {
            var priceData = detailsMap[fav.sku]?.price;
            return (
              <div key={fav.sku} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50/50 transition-colors">
                {/* Product image */}
                <Link
                  to={"/produto/" + encodeURIComponent(fav.sku)}
                  className="w-16 h-16 sm:w-20 sm:h-20 bg-white rounded-xl border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center hover:border-red-300 transition-colors"
                >
                  <ProductImage
                    sku={fav.sku}
                    alt={fav.titulo}
                    className="w-full h-full object-contain p-1"
                    fallback={<Package className="w-8 h-8 text-gray-200" />}
                  />
                </Link>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <Link
                    to={"/produto/" + encodeURIComponent(fav.sku)}
                    className="text-gray-800 hover:text-red-600 transition-colors line-clamp-2"
                    style={{ fontSize: "0.9rem", fontWeight: 600, lineHeight: 1.4 }}
                  >
                    {fav.titulo || fav.sku}
                  </Link>
                  <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.75rem" }}>
                    {"SKU: " + fav.sku}
                  </p>

                  {/* Price */}
                  {!loadingDetails && priceData && priceData.found && priceData.price > 0 && (
                    <p className="text-red-600 mt-1" style={{ fontSize: "0.9rem", fontWeight: 700 }}>
                      {"R$ " + priceData.price.toFixed(2).replace(".", ",")}
                    </p>
                  )}
                  {!loadingDetails && (!priceData || !priceData.found) && (
                    <p className="text-gray-400 mt-1" style={{ fontSize: "0.78rem" }}>
                      Preço sob consulta
                    </p>
                  )}
                  {loadingDetails && (
                    <div className="w-20 h-4 bg-gray-100 rounded animate-pulse mt-1" />
                  )}

                  {/* Added date */}
                  <p className="text-gray-300 mt-1" style={{ fontSize: "0.68rem" }}>
                    {"Adicionado em " + new Date(fav.addedAt).toLocaleDateString("pt-BR")}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    to={"/produto/" + encodeURIComponent(fav.sku)}
                    className="hidden sm:flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
                    style={{ fontSize: "0.82rem", fontWeight: 600 }}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Ver
                  </Link>
                  <WishlistButton sku={fav.sku} titulo={fav.titulo} size="md" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
