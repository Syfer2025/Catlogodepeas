import { useState, useEffect, useCallback } from "react";
import Save from "lucide-react/dist/esm/icons/save.js";
import Loader2 from "lucide-react/dist/esm/icons/loader-2.js";
import Check from "lucide-react/dist/esm/icons/check.js";
import AlertTriangle from "lucide-react/dist/esm/icons/alert-triangle.js";
import ToggleLeft from "lucide-react/dist/esm/icons/toggle-left.js";
import ToggleRight from "lucide-react/dist/esm/icons/toggle-right.js";
import Info from "lucide-react/dist/esm/icons/info.js";
import ExternalLink from "lucide-react/dist/esm/icons/external-link.js";
import MessageCircle from "lucide-react/dist/esm/icons/message-circle.js";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw.js";
import Send from "lucide-react/dist/esm/icons/send.js";
import Clock from "lucide-react/dist/esm/icons/clock.js";
import Users from "lucide-react/dist/esm/icons/users.js";
import Zap from "lucide-react/dist/esm/icons/zap.js";
import ShoppingCart from "lucide-react/dist/esm/icons/shopping-cart.js";
import CheckCircle2 from "lucide-react/dist/esm/icons/check-circle-2.js";
import XCircle from "lucide-react/dist/esm/icons/x-circle.js";
import Play from "lucide-react/dist/esm/icons/play.js";
import TestTube from "lucide-react/dist/esm/icons/test-tube.js";
import Phone from "lucide-react/dist/esm/icons/phone.js";
import * as api from "../../services/api";
import type { WhatsAppConfig, WhatsAppTemplate } from "../../services/api";
import { getValidAdminToken } from "./adminAuth";

var DEFAULT_TPL: WhatsAppTemplate = { enabled: true, delayMinutes: 60, message: "" };

var DEFAULT_CONFIG: WhatsAppConfig = {
  enabled: false,
  provider: "zenvia",
  zenviaApiToken: "",
  zenviaSender: "",
  blipBotKey: "",
  storePhone: "5544997330202",
  templates: {
    reminder1h: { enabled: true, delayMinutes: 60, message: "Oi {{nome}}! Voce deixou itens no carrinho da Carretao Auto Pecas. Finalize sua compra: {{link}}" },
    reminder24h: { enabled: true, delayMinutes: 1440, message: "{{nome}}, ainda temos suas pecas separadas! Volte e conclua seu pedido: {{link}}" },
    reminder72h: { enabled: true, delayMinutes: 4320, message: "Ultima chance, {{nome}}! Use o cupom VOLTE5 para 5% OFF: {{link}}" },
  },
};

type SubTab = "config" | "templates" | "carts";

function fmtDate(ts: number | null) {
  if (!ts) return "-";
  try { return new Date(ts).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return "-"; }
}

export function AdminWhatsApp() {
  var [config, setConfig] = useState<WhatsAppConfig>(DEFAULT_CONFIG);
  var [carts, setCarts] = useState<any[]>([]);
  var [loading, setLoading] = useState(true);
  var [saving, setSaving] = useState(false);
  var [saved, setSaved] = useState(false);
  var [error, setError] = useState("");
  var [success, setSuccess] = useState("");
  var [activeTab, setActiveTab] = useState<SubTab>("config");
  var [testPhone, setTestPhone] = useState("");
  var [testSending, setTestSending] = useState(false);
  var [processing, setProcessing] = useState(false);

  var load = useCallback(async function () {
    setLoading(true);
    setError("");
    try {
      var token = await getValidAdminToken();
      if (!token) { setError("Token admin invalido"); setLoading(false); return; }
      var [cfgRes, cartsRes] = await Promise.all([
        api.getWhatsAppConfig(token).catch(function () { return DEFAULT_CONFIG; }),
        api.getAbandonedCarts(token).catch(function () { return { carts: [] }; }),
      ]);
      setConfig({ ...DEFAULT_CONFIG, ...cfgRes, templates: { ...DEFAULT_CONFIG.templates, ...(cfgRes.templates || {}) } });
      setCarts(cartsRes.carts || []);
    } catch (e: any) {
      setError(e.message || "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(function () { load(); }, [load]);

  var handleSave = async function () {
    setSaving(true); setError(""); setSaved(false);
    try {
      var token = await getValidAdminToken();
      if (!token) throw new Error("Token invalido");
      var result = await api.updateWhatsAppConfig(config, token);
      setConfig({ ...DEFAULT_CONFIG, ...result, templates: { ...DEFAULT_CONFIG.templates, ...(result.templates || {}) } });
      setSaved(true);
      setTimeout(function () { setSaved(false); }, 3000);
    } catch (e: any) { setError(e.message || "Erro ao salvar."); }
    finally { setSaving(false); }
  };

  var handleTest = async function () {
    if (!testPhone.trim()) { setError("Informe o telefone para teste"); return; }
    setTestSending(true); setError(""); setSuccess("");
    try {
      var token = await getValidAdminToken();
      if (!token) throw new Error("Token invalido");
      var res = await api.sendWhatsAppTest(token, testPhone.replace(/\D/g, ""));
      if (res.ok) { setSuccess("Mensagem de teste enviada com sucesso!"); setTimeout(function () { setSuccess(""); }, 4000); }
      else { setError(res.error || "Erro ao enviar teste"); }
    } catch (e: any) { setError(e.message || "Erro ao enviar teste"); }
    finally { setTestSending(false); }
  };

  var handleProcess = async function () {
    setProcessing(true); setError(""); setSuccess("");
    try {
      var token = await getValidAdminToken();
      if (!token) throw new Error("Token invalido");
      var res = await api.processAbandonedCarts(token);
      var msg = "Processados: " + res.processed + " carrinhos, " + res.sent + " mensagens enviadas.";
      if (res.errors && res.errors.length > 0) msg += " Erros: " + res.errors.length;
      setSuccess(msg);
      setTimeout(function () { setSuccess(""); }, 6000);
      load();
    } catch (e: any) { setError(e.message || "Erro ao processar"); }
    finally { setProcessing(false); }
  };

  function updateTemplate(key: "reminder1h" | "reminder24h" | "reminder72h", field: string, value: any) {
    setConfig(function (prev) {
      var tpls = { ...prev.templates };
      tpls[key] = { ...tpls[key], [field]: value };
      return { ...prev, templates: tpls };
    });
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-red-500 animate-spin" /></div>;

  var pendingCarts = carts.filter(function (c) { return !c.completed; });
  var completedCarts = carts.filter(function (c) { return c.completed; });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "1.2rem", fontWeight: 700 }}>
            <MessageCircle className="w-5 h-5 text-green-600" />
            WhatsApp — Carrinho Abandonado
          </h2>
          <p className="text-gray-500 mt-1" style={{ fontSize: "0.82rem" }}>
            Recupere vendas enviando lembretes automaticos via WhatsApp (Zenvia ou Take Blip)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50 cursor-pointer shadow-sm" style={{ fontSize: "0.88rem", fontWeight: 600 }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saving ? "Salvando..." : saved ? "Salvo!" : "Salvar"}
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start gap-2"><AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" /><p className="text-red-700" style={{ fontSize: "0.82rem" }}>{error}</p></div>}
      {success && <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" /><p className="text-green-700" style={{ fontSize: "0.82rem" }}>{success}</p></div>}

      {/* Sub tabs */}
      <div className="flex gap-2">
        {([
          { id: "config" as SubTab, label: "Configuracao", icon: MessageCircle },
          { id: "templates" as SubTab, label: "Templates", icon: Clock },
          { id: "carts" as SubTab, label: "Carrinhos", icon: ShoppingCart },
        ]).map(function (t) {
          return (
            <button key={t.id} onClick={function () { setActiveTab(t.id); }} className={"px-4 py-2 rounded-lg transition-colors cursor-pointer flex items-center gap-2 " + (activeTab === t.id ? "bg-green-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")} style={{ fontSize: "0.85rem", fontWeight: 600 }}>
              <t.icon className="w-4 h-4" /> {t.label}
              {t.id === "carts" && pendingCarts.length > 0 && (
                <span className={"px-1.5 py-0.5 rounded-full " + (activeTab === "carts" ? "bg-white/20" : "bg-amber-100 text-amber-700")} style={{ fontSize: "0.7rem", fontWeight: 700 }}>{pendingCarts.length}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* CONFIG TAB */}
      {activeTab === "config" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          {/* Enable */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-gray-800" style={{ fontSize: "1rem", fontWeight: 700 }}>Ativar Recuperacao de Carrinho via WhatsApp</h3>
              <p className="text-gray-500 mt-1" style={{ fontSize: "0.78rem" }}>Envia lembretes automaticos para clientes que abandonaram o carrinho</p>
            </div>
            <button onClick={function () { setConfig({ ...config, enabled: !config.enabled }); }} className="cursor-pointer">
              {config.enabled ? <ToggleRight className="w-10 h-10 text-green-500" /> : <ToggleLeft className="w-10 h-10 text-gray-300" />}
            </button>
          </div>

          {/* Provider selector */}
          <div>
            <label className="block text-gray-600 mb-2" style={{ fontSize: "0.82rem", fontWeight: 600 }}>Provedor de WhatsApp Business API</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Zenvia */}
              <button onClick={function () { setConfig({ ...config, provider: "zenvia" }); }} className={"p-4 rounded-xl border-2 transition-all text-left cursor-pointer " + (config.provider === "zenvia" ? "border-green-400 bg-green-50 shadow-sm" : "border-gray-200 bg-white hover:border-gray-300")}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-800" style={{ fontSize: "0.95rem", fontWeight: 700 }}>Zenvia</span>
                  {config.provider === "zenvia" && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                </div>
                <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>API robusta, integracao simples, planos a partir de ~R$120/mes</p>
              </button>
              {/* Blip */}
              <button onClick={function () { setConfig({ ...config, provider: "blip" }); }} className={"p-4 rounded-xl border-2 transition-all text-left cursor-pointer " + (config.provider === "blip" ? "border-blue-400 bg-blue-50 shadow-sm" : "border-gray-200 bg-white hover:border-gray-300")}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-800" style={{ fontSize: "0.95rem", fontWeight: 700 }}>Take Blip</span>
                  {config.provider === "blip" && <CheckCircle2 className="w-5 h-5 text-blue-500" />}
                </div>
                <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>Plataforma completa de chatbot, ideal para fluxos complexos</p>
              </button>
            </div>
          </div>

          {/* Provider-specific fields */}
          {config.provider === "zenvia" ? (
            <div className="space-y-4 bg-green-50/50 rounded-lg p-4 border border-green-100">
              <h4 className="text-green-800 flex items-center gap-2" style={{ fontSize: "0.9rem", fontWeight: 700 }}>
                <Zap className="w-4 h-4" /> Configuracao Zenvia
              </h4>
              <div>
                <label className="block text-gray-600 mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>API Token</label>
                <input type="password" value={config.zenviaApiToken} onChange={function (e) { setConfig({ ...config, zenviaApiToken: e.target.value }); }} placeholder="Cole seu token da Zenvia aqui" className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-800 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none" style={{ fontSize: "0.88rem" }} />
                <p className="text-gray-400 mt-1" style={{ fontSize: "0.7rem" }}>Zenvia &rarr; Configuracoes &rarr; Integracao &rarr; API Token</p>
              </div>
              <div>
                <label className="block text-gray-600 mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>Sender (Remetente)</label>
                <input type="text" value={config.zenviaSender} onChange={function (e) { setConfig({ ...config, zenviaSender: e.target.value }); }} placeholder="Ex: carretao-whatsapp" className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-800 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none" style={{ fontSize: "0.88rem" }} />
                <p className="text-gray-400 mt-1" style={{ fontSize: "0.7rem" }}>Nome do remetente configurado na Zenvia para o canal WhatsApp</p>
              </div>
              <a href="https://app.zenvia.com/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-green-600 hover:text-green-700 transition-colors" style={{ fontSize: "0.82rem", fontWeight: 500 }}>
                <ExternalLink className="w-3.5 h-3.5" /> Abrir painel Zenvia
              </a>
            </div>
          ) : (
            <div className="space-y-4 bg-blue-50/50 rounded-lg p-4 border border-blue-100">
              <h4 className="text-blue-800 flex items-center gap-2" style={{ fontSize: "0.9rem", fontWeight: 700 }}>
                <Zap className="w-4 h-4" /> Configuracao Take Blip
              </h4>
              <div>
                <label className="block text-gray-600 mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>Bot Key (Authorization)</label>
                <input type="password" value={config.blipBotKey} onChange={function (e) { setConfig({ ...config, blipBotKey: e.target.value }); }} placeholder="Cole a chave do seu bot Blip aqui" className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" style={{ fontSize: "0.88rem" }} />
                <p className="text-gray-400 mt-1" style={{ fontSize: "0.7rem" }}>Portal Blip &rarr; Seu Bot &rarr; Configuracoes &rarr; Informacoes de conexao &rarr; Authorization</p>
              </div>
              <a href="https://portal.blip.ai/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-700 transition-colors" style={{ fontSize: "0.82rem", fontWeight: 500 }}>
                <ExternalLink className="w-3.5 h-3.5" /> Abrir portal Take Blip
              </a>
            </div>
          )}

          {/* Test message */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <h4 className="text-gray-700 flex items-center gap-2 mb-3" style={{ fontSize: "0.9rem", fontWeight: 700 }}>
              <TestTube className="w-4 h-4" /> Enviar Mensagem de Teste
            </h4>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" value={testPhone} onChange={function (e) { setTestPhone(e.target.value); }} placeholder="5544999999999" className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-gray-800 focus:ring-2 focus:ring-green-500 outline-none" style={{ fontSize: "0.88rem" }} />
              </div>
              <button onClick={handleTest} disabled={testSending} className="px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white rounded-lg flex items-center gap-2 transition-colors cursor-pointer" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                {testSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Enviar
              </button>
            </div>
          </div>

          {/* How it works */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-amber-800" style={{ fontSize: "0.85rem", fontWeight: 700 }}>Como funciona</h4>
                <ul className="text-amber-700 mt-2 space-y-1 list-disc list-inside" style={{ fontSize: "0.78rem" }}>
                  <li>Quando um cliente logado adiciona itens ao carrinho, um snapshot e salvo automaticamente</li>
                  <li>Apos o tempo configurado, o sistema envia a mensagem de lembrete via WhatsApp</li>
                  <li>Sao 3 lembretes: <strong>1h</strong> (lembrete suave), <strong>24h</strong> (urgencia), <strong>72h</strong> (ultima chance + cupom)</li>
                  <li>Use o botao "Processar Agora" na aba Carrinhos ou configure um cron externo</li>
                  <li>Variaveis disponiveis nos templates: <code className="bg-amber-100 px-1 rounded">{"{{nome}}"}</code> <code className="bg-amber-100 px-1 rounded">{"{{link}}"}</code> <code className="bg-amber-100 px-1 rounded">{"{{total}}"}</code> <code className="bg-amber-100 px-1 rounded">{"{{itens}}"}</code></li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TEMPLATES TAB */}
      {activeTab === "templates" && (
        <div className="space-y-4">
          {([
            { key: "reminder1h" as const, label: "Lembrete 1h", desc: "Lembrete suave — enviado 1 hora apos abandono", color: "text-blue-600 bg-blue-50 border-blue-200" },
            { key: "reminder24h" as const, label: "Lembrete 24h", desc: "Tom de urgencia — enviado 24 horas apos abandono", color: "text-amber-600 bg-amber-50 border-amber-200" },
            { key: "reminder72h" as const, label: "Lembrete 72h", desc: "Ultima chance com cupom — enviado 72 horas apos abandono", color: "text-red-600 bg-red-50 border-red-200" },
          ]).map(function (item) {
            var tpl = config.templates[item.key] || DEFAULT_TPL;
            return (
              <div key={item.key} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100">
                  <div>
                    <h4 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "0.95rem", fontWeight: 700 }}>
                      <Clock className="w-4 h-4 text-gray-400" />
                      {item.label}
                    </h4>
                    <p className="text-gray-500 mt-0.5" style={{ fontSize: "0.75rem" }}>{item.desc}</p>
                  </div>
                  <button onClick={function () { updateTemplate(item.key, "enabled", !tpl.enabled); }} className="cursor-pointer">
                    {tpl.enabled ? <ToggleRight className="w-8 h-8 text-green-500" /> : <ToggleLeft className="w-8 h-8 text-gray-300" />}
                  </button>
                </div>
                <div className="p-5 space-y-4">
                  <div>
                    <label className="block text-gray-600 mb-1.5 flex items-center gap-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                      <Clock className="w-3.5 h-3.5" /> Atraso (minutos)
                    </label>
                    <input type="number" min={1} max={10080} value={tpl.delayMinutes} onChange={function (e) { updateTemplate(item.key, "delayMinutes", Math.max(1, parseInt(e.target.value) || 60)); }} className="w-40 border border-gray-300 rounded-lg px-3 py-2 text-gray-800 focus:ring-2 focus:ring-green-500 outline-none" style={{ fontSize: "0.88rem" }} />
                    <span className="text-gray-400 ml-2" style={{ fontSize: "0.75rem" }}>({Math.round(tpl.delayMinutes / 60)}h {tpl.delayMinutes % 60}min)</span>
                  </div>
                  <div>
                    <label className="block text-gray-600 mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>Mensagem</label>
                    <textarea value={tpl.message} onChange={function (e) { updateTemplate(item.key, "message", e.target.value); }} rows={4} className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-800 focus:ring-2 focus:ring-green-500 outline-none resize-y" style={{ fontSize: "0.85rem" }} placeholder={"Oi {{nome}}! ..."} />
                    <p className="text-gray-400 mt-1" style={{ fontSize: "0.7rem" }}>
                      Variaveis: {"{{nome}}"} {"{{link}}"} {"{{total}}"} {"{{itens}}"}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CARTS TAB */}
      {activeTab === "carts" && (
        <div className="space-y-4">
          {/* Process button */}
          <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 p-4">
            <div>
              <p className="text-gray-700" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                {pendingCarts.length} carrinhos pendentes
              </p>
              <p className="text-gray-400" style={{ fontSize: "0.75rem" }}>
                Clique para enviar lembretes para carrinhos elegíveis agora
              </p>
            </div>
            <button onClick={handleProcess} disabled={processing || !config.enabled} className="px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-lg flex items-center gap-2 transition-colors cursor-pointer" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
              {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Processar Agora
            </button>
          </div>

          {/* Carts list */}
          {carts.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
              <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500" style={{ fontSize: "0.9rem", fontWeight: 500 }}>Nenhum carrinho registrado</p>
              <p className="text-gray-400 mt-1" style={{ fontSize: "0.8rem" }}>Os carrinhos aparecerao aqui conforme os clientes navegarem pelo site</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full" style={{ fontSize: "0.8rem" }}>
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-3 text-gray-500 font-semibold">Telefone</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-semibold">Nome</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-semibold">Itens</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-semibold">Total</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-semibold">Status</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-semibold">Lembretes</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-semibold">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {carts.map(function (cart, i) {
                      return (
                        <tr key={cart.phone || cart.email || i} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-800 font-medium font-mono">{cart.phone || "-"}</td>
                          <td className="px-4 py-3 text-gray-600">{cart.name || "-"}</td>
                          <td className="px-4 py-3 text-gray-500">{(cart.items || []).length} itens</td>
                          <td className="px-4 py-3 text-gray-700 font-medium">R$ {(cart.totalPrice || 0).toFixed(2).replace(".", ",")}</td>
                          <td className="px-4 py-3">
                            {cart.completed ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200" style={{ fontSize: "0.7rem", fontWeight: 600 }}>
                                <CheckCircle2 className="w-3 h-3" /> Comprou
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200" style={{ fontSize: "0.7rem", fontWeight: 600 }}>
                                <XCircle className="w-3 h-3" /> Abandonado
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-500">
                            {(cart.remindersSent || []).length > 0 ? (
                              <div className="flex gap-1">
                                {(cart.remindersSent || []).map(function (r: string) {
                                  return <span key={r} className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">{r.replace("reminder", "")}</span>;
                                })}
                              </div>
                            ) : "-"}
                          </td>
                          <td className="px-4 py-3 text-gray-500">{fmtDate(cart.createdAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
