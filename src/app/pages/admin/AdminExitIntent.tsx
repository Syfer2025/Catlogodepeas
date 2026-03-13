import { useState, useEffect, useCallback } from "react";
import Save from "lucide-react/dist/esm/icons/save.js";
import Loader2 from "lucide-react/dist/esm/icons/loader-2.js";
import Check from "lucide-react/dist/esm/icons/check.js";
import AlertTriangle from "lucide-react/dist/esm/icons/alert-triangle.js";
import ToggleLeft from "lucide-react/dist/esm/icons/toggle-left.js";
import ToggleRight from "lucide-react/dist/esm/icons/toggle-right.js";
import Info from "lucide-react/dist/esm/icons/info.js";
import Gift from "lucide-react/dist/esm/icons/gift.js";
import Users from "lucide-react/dist/esm/icons/users.js";
import Mail from "lucide-react/dist/esm/icons/mail.js";
import Clock from "lucide-react/dist/esm/icons/clock.js";
import Smartphone from "lucide-react/dist/esm/icons/smartphone.js";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw.js";
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js";
import ExternalLink from "lucide-react/dist/esm/icons/external-link.js";
import * as api from "../../services/api";
import type { ExitIntentConfig } from "../../services/api";
import { getValidAdminToken } from "./adminAuth";

var DEFAULT_CONFIG: ExitIntentConfig = {
  enabled: false,
  title: "Espere! Temos um presente pra voce",
  subtitle: "Cadastre seu email e ganhe um cupom exclusivo de primeira compra!",
  couponCode: "PRIMEIRA10",
  discountText: "10% OFF na primeira compra",
  buttonText: "Quero meu cupom!",
  successMessage: "Cupom enviado! Use no checkout.",
  showAfterSeconds: 0,
  showOnMobile: false,
};

export function AdminExitIntent() {
  var [config, setConfig] = useState<ExitIntentConfig>(DEFAULT_CONFIG);
  var [leads, setLeads] = useState<any[]>([]);
  var [loading, setLoading] = useState(true);
  var [saving, setSaving] = useState(false);
  var [saved, setSaved] = useState(false);
  var [error, setError] = useState("");
  var [activeTab, setActiveTab] = useState<"config" | "leads">("config");

  var load = useCallback(async function () {
    setLoading(true);
    setError("");
    try {
      var token = await getValidAdminToken();
      var [cfgRes, leadsRes] = await Promise.all([
        api.getExitIntentConfig().catch(function () { return DEFAULT_CONFIG; }),
        token ? api.getExitIntentLeads(token).catch(function () { return { leads: [] }; }) : Promise.resolve({ leads: [] }),
      ]);
      setConfig({ ...DEFAULT_CONFIG, ...cfgRes });
      setLeads(leadsRes.leads || []);
    } catch (e: any) {
      setError(e.message || "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(function () { load(); }, [load]);

  var handleSave = async function () {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      var token = await getValidAdminToken();
      var result = await api.updateExitIntentConfig(config, token || undefined);
      setConfig({ ...DEFAULT_CONFIG, ...result });
      setSaved(true);
      setTimeout(function () { setSaved(false); }, 3000);
    } catch (e: any) {
      setError(e.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-red-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "1.2rem", fontWeight: 700 }}>
            <Gift className="w-5 h-5 text-red-600" />
            Exit Intent Popup
          </h2>
          <p className="text-gray-500 mt-1" style={{ fontSize: "0.82rem" }}>
            Capture leads quando o usuario esta prestes a sair do site
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
            style={{ fontSize: "0.88rem", fontWeight: 600 }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saving ? "Salvando..." : saved ? "Salvo!" : "Salvar"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-red-700" style={{ fontSize: "0.82rem" }}>{error}</p>
        </div>
      )}

      {/* Tab selector */}
      <div className="flex gap-2">
        <button
          onClick={function () { setActiveTab("config"); }}
          className={"px-4 py-2 rounded-lg transition-colors cursor-pointer " + (activeTab === "config" ? "bg-red-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}
          style={{ fontSize: "0.85rem", fontWeight: 600 }}
        >
          Configuracao
        </button>
        <button
          onClick={function () { setActiveTab("leads"); }}
          className={"px-4 py-2 rounded-lg transition-colors cursor-pointer flex items-center gap-2 " + (activeTab === "leads" ? "bg-red-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}
          style={{ fontSize: "0.85rem", fontWeight: 600 }}
        >
          <Users className="w-4 h-4" />
          Leads Capturados
          {leads.length > 0 && (
            <span className={"px-1.5 py-0.5 rounded-full " + (activeTab === "leads" ? "bg-white/20 text-white" : "bg-red-100 text-red-600")} style={{ fontSize: "0.7rem", fontWeight: 700 }}>
              {leads.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === "config" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-gray-800" style={{ fontSize: "1rem", fontWeight: 700 }}>
                Ativar Exit Intent Popup
              </h3>
              <p className="text-gray-500 mt-1" style={{ fontSize: "0.78rem" }}>
                Quando ativado, exibe um popup com oferta quando o usuario move o mouse para fora da pagina
              </p>
            </div>
            <button
              onClick={function () { setConfig({ ...config, enabled: !config.enabled }); }}
              className="cursor-pointer"
            >
              {config.enabled ? (
                <ToggleRight className="w-10 h-10 text-green-500" />
              ) : (
                <ToggleLeft className="w-10 h-10 text-gray-300" />
              )}
            </button>
          </div>

          {/* Title */}
          <div>
            <label className="block text-gray-600 mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
              Titulo do Popup
            </label>
            <input
              type="text"
              value={config.title}
              onChange={function (e) { setConfig({ ...config, title: e.target.value }); }}
              placeholder="Espere! Temos um presente pra voce"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-800 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
              style={{ fontSize: "0.88rem" }}
            />
          </div>

          {/* Subtitle */}
          <div>
            <label className="block text-gray-600 mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
              Subtitulo
            </label>
            <input
              type="text"
              value={config.subtitle}
              onChange={function (e) { setConfig({ ...config, subtitle: e.target.value }); }}
              placeholder="Cadastre seu email e ganhe um cupom exclusivo!"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-800 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
              style={{ fontSize: "0.88rem" }}
            />
          </div>

          {/* Coupon + Discount */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-600 mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                Codigo do Cupom
              </label>
              <input
                type="text"
                value={config.couponCode}
                onChange={function (e) { setConfig({ ...config, couponCode: e.target.value.toUpperCase() }); }}
                placeholder="PRIMEIRA10"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-800 font-mono focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                style={{ fontSize: "0.88rem" }}
              />
              <p className="text-gray-400 mt-1" style={{ fontSize: "0.7rem" }}>
                Este cupom deve estar criado na aba "Cupons" do admin
              </p>
            </div>
            <div>
              <label className="block text-gray-600 mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                Texto do Desconto
              </label>
              <input
                type="text"
                value={config.discountText}
                onChange={function (e) { setConfig({ ...config, discountText: e.target.value }); }}
                placeholder="10% OFF na primeira compra"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-800 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                style={{ fontSize: "0.88rem" }}
              />
            </div>
          </div>

          {/* Button text + Success message */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-600 mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                Texto do Botao
              </label>
              <input
                type="text"
                value={config.buttonText}
                onChange={function (e) { setConfig({ ...config, buttonText: e.target.value }); }}
                placeholder="Quero meu cupom!"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-800 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                style={{ fontSize: "0.88rem" }}
              />
            </div>
            <div>
              <label className="block text-gray-600 mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                Mensagem de Sucesso
              </label>
              <input
                type="text"
                value={config.successMessage}
                onChange={function (e) { setConfig({ ...config, successMessage: e.target.value }); }}
                placeholder="Cupom enviado! Use no checkout."
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-800 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                style={{ fontSize: "0.88rem" }}
              />
            </div>
          </div>

          {/* Delay + Mobile */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-600 mb-1.5 flex items-center gap-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                <Clock className="w-3.5 h-3.5" />
                Atraso Minimo (segundos)
              </label>
              <input
                type="number"
                min={0}
                max={120}
                value={config.showAfterSeconds}
                onChange={function (e) { setConfig({ ...config, showAfterSeconds: Math.max(0, Math.min(120, parseInt(e.target.value) || 0)) }); }}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-800 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                style={{ fontSize: "0.88rem" }}
              />
              <p className="text-gray-400 mt-1" style={{ fontSize: "0.7rem" }}>
                O popup so aparece apos este tempo (minimo 5s automatico)
              </p>
            </div>
            <div className="flex items-center gap-3 pt-6">
              <button
                onClick={function () { setConfig({ ...config, showOnMobile: !config.showOnMobile }); }}
                className="cursor-pointer"
              >
                {config.showOnMobile ? (
                  <ToggleRight className="w-8 h-8 text-green-500" />
                ) : (
                  <ToggleLeft className="w-8 h-8 text-gray-300" />
                )}
              </button>
              <div>
                <p className="text-gray-700 flex items-center gap-1.5" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                  <Smartphone className="w-3.5 h-3.5" />
                  Mostrar no Mobile
                </p>
                <p className="text-gray-400" style={{ fontSize: "0.7rem" }}>
                  Ativa deteccao por scroll rapido no celular
                </p>
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-amber-800" style={{ fontSize: "0.85rem", fontWeight: 700 }}>Como funciona</h4>
                <ul className="text-amber-700 mt-2 space-y-1 list-disc list-inside" style={{ fontSize: "0.78rem" }}>
                  <li><strong>Desktop:</strong> Detecta quando o mouse sai da area do site (indica intencao de fechar aba)</li>
                  <li><strong>Mobile:</strong> Detecta scroll rapido para cima repetido (indica intencao de voltar)</li>
                  <li>Aparece apenas <strong>1 vez a cada 3 dias</strong> por visitante</li>
                  <li>Apos capturar o email, <strong>nunca mais aparece</strong> para aquele visitante</li>
                  <li>Os leads capturados sao automaticamente adicionados aos <strong>assinantes do Email Marketing</strong></li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "leads" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {leads.length === 0 ? (
            <div className="text-center py-16">
              <Mail className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500" style={{ fontSize: "0.9rem", fontWeight: 500 }}>Nenhum lead capturado ainda</p>
              <p className="text-gray-400 mt-1" style={{ fontSize: "0.8rem" }}>Os leads aparecerao aqui conforme os visitantes preencherem o popup</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full" style={{ fontSize: "0.8rem" }}>
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Email</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Nome</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Pagina</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-semibold">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map(function (lead, i) {
                    return (
                      <tr key={lead.email || i} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-800 font-medium">{lead.email}</td>
                        <td className="px-4 py-3 text-gray-600">{lead.name || "-"}</td>
                        <td className="px-4 py-3 text-gray-500">{lead.page || "/"}</td>
                        <td className="px-4 py-3 text-gray-500">
                          {lead.capturedAt ? new Date(lead.capturedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
