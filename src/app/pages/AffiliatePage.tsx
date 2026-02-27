import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import {
  Users,
  Link2,
  DollarSign,
  TrendingUp,
  Copy,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Home,
  ChevronRight,
  Eye,
  MousePointerClick,
  ShoppingCart,
  Wallet,
  Clock,
  Award,
  ArrowRight,
  ExternalLink,
  Phone,
  AtSign,
  KeyRound,
  MessageCircle,
  Edit3,
  Save,
  X,
  BadgeCheck,
  Ban,
  Hourglass,
  ShieldCheck,
  Percent,
  Calendar,
  Hash,
  Info,
} from "lucide-react";
import { supabase } from "../services/supabaseClient";
import * as api from "../services/api";
import type { Affiliate, AffiliateCommission } from "../services/api";
import { useDocumentMeta } from "../hooks/useDocumentMeta";

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

var statusLabels: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  pending: { label: "Pendente", color: "text-amber-600 bg-amber-50", icon: Hourglass },
  approved: { label: "Aprovado", color: "text-emerald-600 bg-emerald-50", icon: CheckCircle2 },
  rejected: { label: "Rejeitado", color: "text-red-600 bg-red-50", icon: Ban },
  suspended: { label: "Suspenso", color: "text-gray-600 bg-gray-100", icon: Ban },
};

var commStatusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendente", color: "text-amber-600 bg-amber-50" },
  approved: { label: "Aprovada", color: "text-blue-600 bg-blue-50" },
  paid: { label: "Paga", color: "text-emerald-600 bg-emerald-50" },
  rejected: { label: "Rejeitada", color: "text-red-600 bg-red-50" },
};

export function AffiliatePage() {
  useDocumentMeta({
    title: "Programa de Afiliados - Carretão Auto Peças",
    description: "Ganhe comissões indicando produtos da Carretão Auto Peças. Cadastre-se no programa de afiliados.",
  });

  var [accessToken, setAccessToken] = useState<string | null>(null);
  var [loading, setLoading] = useState(true);
  var [affiliate, setAffiliate] = useState<Affiliate | null>(null);
  var [dashboard, setDashboard] = useState<any>(null);
  var [commissions, setCommissions] = useState<AffiliateCommission[]>([]);
  var [config, setConfig] = useState<any>(null);

  // Registration form
  var [regName, setRegName] = useState("");
  var [regPhone, setRegPhone] = useState("");
  var [regSocial, setRegSocial] = useState("");
  var [regPix, setRegPix] = useState("");
  var [regMotivation, setRegMotivation] = useState("");
  var [registering, setRegistering] = useState(false);
  var [regError, setRegError] = useState("");

  // Edit profile
  var [editing, setEditing] = useState(false);
  var [editPhone, setEditPhone] = useState("");
  var [editSocial, setEditSocial] = useState("");
  var [editPix, setEditPix] = useState("");
  var [saving, setSaving] = useState(false);

  // Copy link
  var [copied, setCopied] = useState(false);

  // Auth check
  useEffect(function () {
    supabase.auth.getSession().then(function (res) {
      var session = res.data?.session;
      if (session?.access_token) {
        setAccessToken(session.access_token);
      }
      setLoading(false);
    });
  }, []);

  // Load affiliate data
  var loadData = useCallback(async function () {
    if (!accessToken) return;
    try {
      var profileRes = await api.affiliateGetProfile(accessToken);
      setAffiliate(profileRes.affiliate);

      if (profileRes.affiliate && profileRes.affiliate.status === "approved") {
        var dashRes = await api.affiliateGetDashboard(accessToken);
        setDashboard(dashRes);
        setCommissions(dashRes.commissions || []);
        setConfig(dashRes.config);
      }
    } catch (e) {
      console.error("[Affiliate] Load data error:", e);
    }
  }, [accessToken]);

  useEffect(function () {
    loadData();
  }, [loadData]);

  // Register
  var handleRegister = async function () {
    if (!accessToken) return;
    if (!regName.trim()) { setRegError("Preencha seu nome."); return; }
    if (!regPix.trim()) { setRegError("Preencha sua chave PIX para receber comissões."); return; }

    setRegistering(true);
    setRegError("");
    try {
      var res = await api.affiliateRegister(accessToken, {
        name: regName.trim(),
        phone: regPhone.trim(),
        socialMedia: regSocial.trim(),
        pixKey: regPix.trim(),
        motivation: regMotivation.trim(),
      });
      setAffiliate(res.affiliate);
    } catch (e: any) {
      setRegError(e.message || "Erro ao cadastrar.");
    } finally {
      setRegistering(false);
    }
  };

  // Update profile
  var handleSaveProfile = async function () {
    if (!accessToken) return;
    setSaving(true);
    try {
      var res = await api.affiliateUpdateProfile(accessToken, {
        phone: editPhone,
        socialMedia: editSocial,
        pixKey: editPix,
      });
      setAffiliate(res.affiliate);
      setEditing(false);
    } catch (e: any) {
      console.error("[Affiliate] Update profile error:", e);
    } finally {
      setSaving(false);
    }
  };

  // Copy link
  var copyLink = function () {
    if (!affiliate) return;
    var url = window.location.origin + "?ref=" + affiliate.code;
    navigator.clipboard.writeText(url).then(function () {
      setCopied(true);
      setTimeout(function () { setCopied(false); }, 2500);
    });
  };

  var startEdit = function () {
    if (!affiliate) return;
    setEditPhone(affiliate.phone || "");
    setEditSocial(affiliate.socialMedia || "");
    setEditPix(affiliate.pixKey || "");
    setEditing(true);
  };

  // ─── Loading state ───
  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
      </div>
    );
  }

  // ─── Not logged in ───
  if (!accessToken) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-gray-400 mb-8" style={{ fontSize: "0.8rem" }}>
          <Link to="/" className="hover:text-red-600 transition-colors flex items-center gap-1"><Home className="w-3.5 h-3.5" /> Início</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-gray-600">Afiliados</span>
        </nav>

        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-5">
            <Users className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-gray-900 mb-3" style={{ fontSize: "1.5rem", fontWeight: 700 }}>
            Programa de Afiliados
          </h1>
          <p className="text-gray-500 mb-6 max-w-md mx-auto" style={{ fontSize: "0.9rem" }}>
            Ganhe comissões indicando produtos da Carretão Auto Peças. Faça login para se cadastrar.
          </p>
          <Link
            to="/conta"
            className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors"
            style={{ fontSize: "0.9rem", fontWeight: 600 }}
          >
            Fazer Login <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Benefits section */}
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: Link2, title: "Link Exclusivo", desc: "Receba seu link personalizado para compartilhar" },
            { icon: DollarSign, title: "Comissões", desc: "Ganhe em cada venda gerada pelo seu link" },
            { icon: TrendingUp, title: "Dashboard", desc: "Acompanhe cliques, vendas e ganhos em tempo real" },
          ].map(function (benefit) {
            return (
              <div key={benefit.title} className="bg-white rounded-xl border border-gray-200 p-5 text-center">
                <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center mx-auto mb-3">
                  <benefit.icon className="w-5 h-5 text-red-600" />
                </div>
                <h3 className="text-gray-800 mb-1" style={{ fontSize: "0.9rem", fontWeight: 600 }}>{benefit.title}</h3>
                <p className="text-gray-400" style={{ fontSize: "0.78rem" }}>{benefit.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── Not registered yet — show registration form ───
  if (!affiliate) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <nav className="flex items-center gap-1.5 text-gray-400 mb-6" style={{ fontSize: "0.8rem" }}>
          <Link to="/" className="hover:text-red-600 transition-colors flex items-center gap-1"><Home className="w-3.5 h-3.5" /> Início</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-gray-600">Afiliados</span>
        </nav>

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-red-600 to-red-700 px-6 py-8 text-center">
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-4">
              <Users className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-white mb-2" style={{ fontSize: "1.4rem", fontWeight: 700 }}>
              Torne-se um Afiliado
            </h1>
            <p className="text-red-100" style={{ fontSize: "0.85rem" }}>
              Preencha o formulário abaixo para se inscrever no programa
            </p>
          </div>

          <div className="p-6 space-y-4">
            <div>
              <label className="text-gray-700 mb-1.5 block" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                Nome completo *
              </label>
              <input
                type="text"
                value={regName}
                onChange={function (e) { setRegName(e.target.value); }}
                placeholder="Seu nome"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-white text-gray-900 focus:ring-2 focus:ring-red-500 outline-none"
                style={{ fontSize: "0.85rem" }}
              />
            </div>
            <div>
              <label className="text-gray-700 mb-1.5 block" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                Telefone / WhatsApp
              </label>
              <input
                type="text"
                value={regPhone}
                onChange={function (e) { setRegPhone(e.target.value); }}
                placeholder="(11) 99999-9999"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-white text-gray-900 focus:ring-2 focus:ring-red-500 outline-none"
                style={{ fontSize: "0.85rem" }}
              />
            </div>
            <div>
              <label className="text-gray-700 mb-1.5 block" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                Redes sociais (Instagram, YouTube, etc.)
              </label>
              <input
                type="text"
                value={regSocial}
                onChange={function (e) { setRegSocial(e.target.value); }}
                placeholder="@seuusuario ou link do canal"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-white text-gray-900 focus:ring-2 focus:ring-red-500 outline-none"
                style={{ fontSize: "0.85rem" }}
              />
            </div>
            <div>
              <label className="text-gray-700 mb-1.5 block" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                Chave PIX para recebimento *
              </label>
              <input
                type="text"
                value={regPix}
                onChange={function (e) { setRegPix(e.target.value); }}
                placeholder="CPF, e-mail, celular ou chave aleatória"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-white text-gray-900 focus:ring-2 focus:ring-red-500 outline-none"
                style={{ fontSize: "0.85rem" }}
              />
            </div>
            <div>
              <label className="text-gray-700 mb-1.5 block" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                Por que quer ser afiliado?
              </label>
              <textarea
                value={regMotivation}
                onChange={function (e) { setRegMotivation(e.target.value); }}
                placeholder="Conte um pouco sobre você e como pretende divulgar..."
                rows={3}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-white text-gray-900 focus:ring-2 focus:ring-red-500 outline-none resize-none"
                style={{ fontSize: "0.85rem" }}
              />
            </div>

            {regError && (
              <div className="flex items-center gap-2 bg-red-50 text-red-600 px-4 py-2.5 rounded-xl" style={{ fontSize: "0.8rem" }}>
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {regError}
              </div>
            )}

            <button
              onClick={handleRegister}
              disabled={registering}
              className="w-full py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:bg-red-400 transition-colors flex items-center justify-center gap-2"
              style={{ fontSize: "0.9rem", fontWeight: 600 }}
            >
              {registering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
              {registering ? "Cadastrando..." : "Enviar Inscrição"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Pending / Rejected / Suspended status ───
  if (affiliate.status !== "approved") {
    var statusInfo = statusLabels[affiliate.status] || statusLabels.pending;
    var StatusIcon = statusInfo.icon;
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <nav className="flex items-center gap-1.5 text-gray-400 mb-6" style={{ fontSize: "0.8rem" }}>
          <Link to="/" className="hover:text-red-600 transition-colors flex items-center gap-1"><Home className="w-3.5 h-3.5" /> Início</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-gray-600">Afiliados</span>
        </nav>

        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <div className={"w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 " + statusInfo.color}>
            <StatusIcon className="w-8 h-8" />
          </div>
          <h1 className="text-gray-900 mb-2" style={{ fontSize: "1.3rem", fontWeight: 700 }}>
            Inscrição {statusInfo.label}
          </h1>
          {affiliate.status === "pending" && (
            <p className="text-gray-500 max-w-sm mx-auto" style={{ fontSize: "0.88rem" }}>
              Sua inscrição está sendo analisada pela equipe. Você receberá uma notificação quando for aprovada.
            </p>
          )}
          {affiliate.status === "rejected" && (
            <div>
              <p className="text-gray-500 mb-2" style={{ fontSize: "0.88rem" }}>
                Infelizmente sua inscrição não foi aprovada.
              </p>
              {affiliate.rejectionReason && (
                <p className="text-red-600 bg-red-50 px-4 py-2 rounded-lg inline-block" style={{ fontSize: "0.8rem" }}>
                  Motivo: {affiliate.rejectionReason}
                </p>
              )}
            </div>
          )}
          {affiliate.status === "suspended" && (
            <p className="text-gray-500" style={{ fontSize: "0.88rem" }}>
              Sua conta de afiliado foi suspensa. Entre em contato com o suporte para mais informações.
            </p>
          )}

          <div className="mt-6 bg-gray-50 rounded-xl p-4 text-left max-w-sm mx-auto">
            <p className="text-gray-500 mb-1" style={{ fontSize: "0.72rem", fontWeight: 600 }}>Código de afiliado</p>
            <p className="text-gray-800 font-mono" style={{ fontSize: "1rem", fontWeight: 700 }}>{affiliate.code}</p>
            <p className="text-gray-400 mt-2" style={{ fontSize: "0.72rem" }}>
              Cadastro em {formatDate(affiliate.createdAt)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Approved — Full Dashboard ───
  var stats = dashboard?.stats || {};
  var referralLink = window.location.origin + "?ref=" + affiliate.code;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-gray-400 mb-6" style={{ fontSize: "0.8rem" }}>
        <Link to="/" className="hover:text-red-600 transition-colors flex items-center gap-1"><Home className="w-3.5 h-3.5" /> Início</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-gray-600">Painel de Afiliado</span>
      </nav>

      {/* Header */}
      <div className="bg-gradient-to-r from-red-600 to-red-700 rounded-2xl p-6 mb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Award className="w-5 h-5 text-red-200" />
              <span className="text-red-200" style={{ fontSize: "0.8rem", fontWeight: 600 }}>AFILIADO ATIVO</span>
            </div>
            <h1 className="text-white" style={{ fontSize: "1.4rem", fontWeight: 700 }}>
              Olá, {affiliate.name.split(" ")[0]}!
            </h1>
            <p className="text-red-100 mt-1" style={{ fontSize: "0.82rem" }}>
              Código: <span className="font-mono font-bold text-white">{affiliate.code}</span>
              {config && (
                <span className="ml-2">
                  · Comissão: <span className="font-bold text-white">{config.commissionPercent}%</span>
                </span>
              )}
            </p>
          </div>
          <button
            onClick={startEdit}
            className="px-4 py-2 bg-white/15 text-white rounded-lg hover:bg-white/25 transition-colors flex items-center gap-2"
            style={{ fontSize: "0.8rem", fontWeight: 500 }}
          >
            <Edit3 className="w-3.5 h-3.5" /> Editar Perfil
          </button>
        </div>
      </div>

      {/* Referral Link */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Link2 className="w-4 h-4 text-red-600" />
          <span className="text-gray-700" style={{ fontSize: "0.85rem", fontWeight: 600 }}>Seu link de indicação</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-600 font-mono overflow-hidden" style={{ fontSize: "0.78rem" }}>
            <span className="truncate block">{referralLink}</span>
          </div>
          <button
            onClick={copyLink}
            className={"px-4 py-2.5 rounded-lg flex items-center gap-2 transition-colors " +
              (copied ? "bg-emerald-600 text-white" : "bg-red-600 text-white hover:bg-red-700")}
            style={{ fontSize: "0.8rem", fontWeight: 600 }}
          >
            {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copiado!" : "Copiar"}
          </button>
        </div>
        <p className="text-gray-400 mt-2" style={{ fontSize: "0.7rem" }}>
          Compartilhe este link nas suas redes sociais, WhatsApp, e-mail, etc. O cookie de rastreamento dura {config?.cookieDays || 30} dias.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { icon: MousePointerClick, label: "Cliques", value: String(stats.totalClicks || 0), color: "text-blue-600 bg-blue-50" },
          { icon: ShoppingCart, label: "Conversões", value: String(stats.totalConversions || 0), color: "text-emerald-600 bg-emerald-50" },
          { icon: TrendingUp, label: "Taxa Conversão", value: (stats.conversionRate || 0) + "%", color: "text-purple-600 bg-purple-50" },
          { icon: DollarSign, label: "Comissão Total", value: formatBRL(stats.totalCommission || 0), color: "text-red-600 bg-red-50" },
        ].map(function (stat) {
          return (
            <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={"w-8 h-8 rounded-lg flex items-center justify-center " + stat.color}>
                  <stat.icon className="w-4 h-4" />
                </div>
              </div>
              <p className="text-gray-900" style={{ fontSize: "1.2rem", fontWeight: 700 }}>{stat.value}</p>
              <p className="text-gray-400" style={{ fontSize: "0.72rem", fontWeight: 500 }}>{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Financial Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-amber-600" />
            <span className="text-amber-700" style={{ fontSize: "0.75rem", fontWeight: 600 }}>Pendente</span>
          </div>
          <p className="text-amber-800" style={{ fontSize: "1.1rem", fontWeight: 700 }}>
            {formatBRL(stats.pendingCommission || 0)}
          </p>
        </div>
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <BadgeCheck className="w-4 h-4 text-blue-600" />
            <span className="text-blue-700" style={{ fontSize: "0.75rem", fontWeight: 600 }}>Aprovada</span>
          </div>
          <p className="text-blue-800" style={{ fontSize: "1.1rem", fontWeight: 700 }}>
            {formatBRL(stats.approvedCommission || 0)}
          </p>
        </div>
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="w-4 h-4 text-emerald-600" />
            <span className="text-emerald-700" style={{ fontSize: "0.75rem", fontWeight: 600 }}>Total Pago</span>
          </div>
          <p className="text-emerald-800" style={{ fontSize: "1.1rem", fontWeight: 700 }}>
            {formatBRL(stats.totalPaid || 0)}
          </p>
        </div>
      </div>

      {/* Commissions Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-red-600" />
            <h2 className="text-gray-800" style={{ fontSize: "0.95rem", fontWeight: 600 }}>Últimas Comissões</h2>
          </div>
          <span className="text-gray-400" style={{ fontSize: "0.72rem" }}>{commissions.length} registros</span>
        </div>

        {commissions.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <DollarSign className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400" style={{ fontSize: "0.85rem" }}>
              Nenhuma comissão registrada ainda. Compartilhe seu link para começar!
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {commissions.map(function (comm) {
              var cs = commStatusLabels[comm.status] || commStatusLabels.pending;
              return (
                <div key={comm.orderId} className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Hash className="w-3 h-3 text-gray-300" />
                      <span className="text-gray-700 font-mono" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                        {comm.orderId}
                      </span>
                      <span className={"px-2 py-0.5 rounded-full " + cs.color} style={{ fontSize: "0.62rem", fontWeight: 600 }}>
                        {cs.label}
                      </span>
                    </div>
                    <p className="text-gray-400" style={{ fontSize: "0.7rem" }}>
                      {formatDateTime(comm.createdAt)} · Venda: {formatBRL(comm.orderTotal)} · {comm.commissionPercent}%
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-gray-800" style={{ fontSize: "0.95rem", fontWeight: 700 }}>
                      {formatBRL(comm.commissionValue)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Profile Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={function () { setEditing(false); }}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={function (e) { e.stopPropagation(); }}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="text-gray-900" style={{ fontSize: "1.05rem", fontWeight: 700 }}>Editar Perfil</h3>
              <button onClick={function () { setEditing(false); }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-gray-600 mb-1 block" style={{ fontSize: "0.78rem", fontWeight: 600 }}>Telefone</label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={function (e) { setEditPhone(e.target.value); }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-red-500 outline-none"
                  style={{ fontSize: "0.85rem" }}
                />
              </div>
              <div>
                <label className="text-gray-600 mb-1 block" style={{ fontSize: "0.78rem", fontWeight: 600 }}>Redes sociais</label>
                <input
                  type="text"
                  value={editSocial}
                  onChange={function (e) { setEditSocial(e.target.value); }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-red-500 outline-none"
                  style={{ fontSize: "0.85rem" }}
                />
              </div>
              <div>
                <label className="text-gray-600 mb-1 block" style={{ fontSize: "0.78rem", fontWeight: 600 }}>Chave PIX</label>
                <input
                  type="text"
                  value={editPix}
                  onChange={function (e) { setEditPix(e.target.value); }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-red-500 outline-none"
                  style={{ fontSize: "0.85rem" }}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 pb-5">
              <button
                onClick={function () { setEditing(false); }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                style={{ fontSize: "0.8rem" }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-red-400 transition-colors flex items-center gap-2"
                style={{ fontSize: "0.8rem", fontWeight: 600 }}
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
