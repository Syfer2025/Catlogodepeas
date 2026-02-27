import React, { useState, useEffect, useCallback } from "react";
import {
  Save,
  Loader2,
  Check,
  Settings,
  Send,
  Search,
  RefreshCw,
  Package,
  Truck,
  MapPin,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Ban,
  Copy,
  Link2,
  FileText,
  Box,
  PackageOpen,
  UserPlus,
  Users,
  Trash2,
  Key,
  Phone,
  Mail,
  Hash,
  Info,
} from "lucide-react";
import * as api from "../../services/api";
import type {
  SisfreteWTConfig,
  SisfreteWTPedido,
  SisfreteWTRastreio,
  SisfreteWTSentOrder,
  AdminOrder,
  SisfreteDeliveryConfig,
  SisfreteDeliveryman,
} from "../../services/api";
import { supabase } from "../../services/supabaseClient";
import { getValidAdminToken } from "./adminAuth";

type SubTab = "config" | "send-order" | "sent-orders" | "rastreio" | "delivery";

async function getToken(): Promise<string> {
  const t = await getValidAdminToken();
  if (!t) throw new Error("Sessao expirada.");
  return t;
}

function fmtDate(ts: string | number | null | undefined): string {
  if (!ts) return "\u2014";
  const d = typeof ts === "number" ? new Date(ts) : new Date(ts);
  return d.toLocaleString("pt-BR");
}

function fmtBRL(v: number | null | undefined): string {
  if (v == null) return "\u2014";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
}

/* ================= MAIN ================= */
export function AdminSisfreteWT() {
  const [subTab, setSubTab] = useState<SubTab>("config");

  const tabs: { id: SubTab; label: string; icon: typeof Settings }[] = [
    { id: "config", label: "Configuracao", icon: Settings },
    { id: "send-order", label: "Enviar Pedido", icon: Send },
    { id: "sent-orders", label: "Pedidos Enviados", icon: Package },
    { id: "rastreio", label: "Rastreios", icon: Search },
    { id: "delivery", label: "Entregadores", icon: Users },
  ];

  return (
    <div>
      <div className="flex items-center gap-2 mb-5">
        <Truck className="w-6 h-6 text-green-600" />
        <h2 className="text-xl font-bold text-gray-800">SisFrete Webtracking</h2>
        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">API v1.1.0</span>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-5" style={{ fontSize: "0.82rem" }}>
        <p className="text-blue-800">
          <b>API Webtracking</b> ({" "}
          <code className="bg-blue-100 px-1 rounded">api3.sisfrete.com.br</code> ) permite enviar pedidos para
          rastreamento, consultar eventos de rastreio, enviar produtos e embalamentos.{" "}
          <a
            href="https://api3.sisfrete.com.br/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-semibold"
          >
            Documentacao <ExternalLink className="inline w-3 h-3" />
          </a>
        </p>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-200 pb-0">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = subTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={
                "flex items-center gap-1.5 px-3 py-2 rounded-t-lg border border-b-0 transition-colors " +
                (active
                  ? "bg-white text-green-700 border-gray-200 font-semibold -mb-px"
                  : "bg-gray-50 text-gray-500 border-transparent hover:bg-gray-100")
              }
              style={{ fontSize: "0.82rem" }}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {subTab === "config" && <ConfigTab />}
      {subTab === "send-order" && <SendOrderTab />}
      {subTab === "sent-orders" && <SentOrdersTab />}
      {subTab === "rastreio" && <RastreioTab />}
      {subTab === "delivery" && <DeliveryTab />}
    </div>
  );
}

/* ================= CONFIG TAB ================= */
function ConfigTab() {
  const [config, setConfig] = useState<SisfreteWTConfig>({
    apiToken: "",
    canalVenda: "Carretao Auto Pecas",
    subCanal: "Loja Virtual",
    cnpjCd: "",
    enabled: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        const cfg = await api.sisfreteWTGetConfig(token);
        if (cfg) setConfig(cfg);
      } catch (e: any) {
        setError(e.message || "Erro ao carregar config");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const token = await getToken();
      const result = await api.sisfreteWTSaveConfig(token, config);
      if (result) setConfig(result);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setError(e.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-green-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 max-w-2xl">
      <h3 className="font-semibold text-gray-800 mb-4" style={{ fontSize: "0.95rem" }}>
        Configuracao Webtracking
      </h3>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 mb-4" style={{ fontSize: "0.82rem" }}>
          {error}
        </div>
      )}

      <div className="space-y-4">
        {/* Enabled toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            className={"w-10 h-5 rounded-full relative transition-colors " + (config.enabled ? "bg-green-500" : "bg-gray-300")}
            onClick={() => setConfig({ ...config, enabled: !config.enabled })}
          >
            <div
              className={"w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all " + (config.enabled ? "left-5.5" : "left-0.5")}
              style={{ left: config.enabled ? "22px" : "2px" }}
            />
          </div>
          <span className="text-sm font-medium text-gray-700">
            Integracao Webtracking {config.enabled ? "Ativa" : "Inativa"}
          </span>
        </label>

        {/* Token */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Token API (Token-API header)</label>
          <div className="relative">
            <input
              type={showToken ? "text" : "password"}
              value={config.apiToken}
              onChange={(e) => setConfig({ ...config, apiToken: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 text-sm"
              placeholder="Cole aqui o token do SisFrete Webtracking"
            />
            <button
              onClick={() => setShowToken(!showToken)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Obtido no painel SisFrete: Integracao &gt; Webtracking API
          </p>
        </div>

        {/* Canal de Venda */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Canal de Venda</label>
          <input
            type="text"
            value={config.canalVenda}
            onChange={(e) => setConfig({ ...config, canalVenda: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="Ex: Carretao Auto Pecas"
          />
        </div>

        {/* Sub Canal */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Sub-Canal</label>
          <input
            type="text"
            value={config.subCanal}
            onChange={(e) => setConfig({ ...config, subCanal: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="Ex: Loja Virtual"
          />
        </div>

        {/* CNPJ CD */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ do Centro de Distribuicao (14 digitos, opcional)</label>
          <input
            type="text"
            value={config.cnpjCd}
            onChange={(e) => setConfig({ ...config, cnpjCd: e.target.value.replace(/\D/g, "").slice(0, 14) })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
            placeholder="00000000000000"
            maxLength={14}
          />
        </div>

        {/* Instructions */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Como configurar:</h4>
          <ol className="list-decimal list-inside space-y-1 text-xs text-gray-600">
            <li>
              Acesse o painel{" "}
              <a href="https://sisfrete.com.br" target="_blank" rel="noopener noreferrer" className="underline font-semibold text-green-600">
                SisFrete
              </a>{" "}
              e copie o <b>Token de API Webtracking</b>
            </li>
            <li>Cole o token no campo acima</li>
            <li>Configure o Canal de Venda e Sub-Canal (identificam a origem dos pedidos)</li>
            <li>O CNPJ do CD e opcional — se informado, sera validado pelo SisFrete</li>
            <li>
              Base URL: <code className="bg-gray-100 px-1 rounded">https://api3.sisfrete.com.br/api</code>
            </li>
          </ol>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-5 pt-4 border-t border-gray-100">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
          style={{ fontSize: "0.85rem" }}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saving ? "Salvando..." : saved ? "Salvo!" : "Salvar Configuracao"}
        </button>
        {config.updatedAt && (
          <span className="text-xs text-gray-400">Atualizado em {fmtDate(config.updatedAt)}</span>
        )}
      </div>
    </div>
  );
}

/* ========== SHIPPING OPTION AUTO-FILL HELPER ========== */
interface OrderShippingOpt {
  carrierId?: string;
  carrierName: string;
  carrierType?: string;
  price: number;
  deliveryDays: number;
  free: boolean;
  sisfreteQuoteId?: string;
}

function parseShippingOptionForNfe(opt: OrderShippingOpt | null | undefined) {
  if (!opt) return null;
  var name = opt.carrierName || "";
  if (!name) return null;

  // carrierName is typically "Transportadora - Servico" or "SisFrete - Servico"
  var dashIdx = name.indexOf(" - ");
  var transpNome = dashIdx > 0 ? name.slice(0, dashIdx).trim() : name.trim();
  var servicoRaw = dashIdx > 0 ? name.slice(dashIdx + 3).trim() : "";

  // Derive codigoServico from carrierId or service name
  // carrierId patterns: "sisfrete_0_1", "sisfrete_xml_2", "correios_pac", etc.
  var cId = opt.carrierId || "";
  var codServico = "";
  if (cId && cId.indexOf("sisfrete_") === 0) {
    // Extract the service index as code
    var parts = cId.split("_");
    codServico = parts[parts.length - 1] || "";
  } else if (cId) {
    codServico = cId;
  }

  // Map servicoEntrega from the raw service name
  var servicoEntrega = "Normal";
  var lower = (servicoRaw + " " + name).toLowerCase();
  if (lower.indexOf("sedex") !== -1) {
    servicoEntrega = "SEDEX";
  } else if (lower.indexOf("expres") !== -1 || lower.indexOf("rapido") !== -1) {
    servicoEntrega = "Expressa";
  } else if (lower.indexOf("pac") !== -1) {
    servicoEntrega = "PAC";
  } else if (lower.indexOf("motoboy") !== -1 || lower.indexOf("delivery") !== -1) {
    servicoEntrega = "Motoboy";
  }

  // Derive codigoTransportadora from carrierId prefix or name
  var codTransp = "";
  if (cId && cId.indexOf("sisfrete_") === 0) {
    // Use transportadora name abbreviation as code
    codTransp = transpNome.slice(0, 6).toUpperCase().replace(/\s/g, "");
  } else if (cId) {
    codTransp = cId.split("_")[0] || "";
  } else {
    codTransp = transpNome.slice(0, 6).toUpperCase().replace(/\s/g, "");
  }

  return {
    transportadoraNome: transpNome,
    codigoServico: codServico,
    codigoTransportadora: codTransp,
    servicoEntrega: servicoEntrega,
    prazoExpedicao: opt.deliveryDays || 0,
  };
}

/* ================= SEND ORDER TAB ================= */
function SendOrderTab() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<any>(null);
  const [autoFilled, setAutoFilled] = useState(false);

  // NF-e fields for the selected order
  const [nfeData, setNfeData] = useState({
    chaveNfe: "",
    numeroNota: 0,
    serieNota: "1",
    dataEmissaoNota: "",
    numeroObjeto: "",
    codigoServico: "",
    codigoTransportadora: "",
    transportadoraNome: "",
    servicoEntrega: "Normal",
    statusPedido: "Aguardando envio",
    prazoExpedicao: 0,
  });
  // Auto-fill NF-e fields from shipping option when order is selected
  const selectOrder = useCallback((o: AdminOrder) => {
    setSelectedOrder(o);
    setSendResult(null);
    var parsed = parseShippingOptionForNfe(o.shippingOption);
    if (parsed) {
      setNfeData({
        chaveNfe: "",
        numeroNota: 0,
        serieNota: "1",
        dataEmissaoNota: "",
        numeroObjeto: "",
        codigoServico: parsed.codigoServico,
        codigoTransportadora: parsed.codigoTransportadora,
        transportadoraNome: parsed.transportadoraNome,
        servicoEntrega: parsed.servicoEntrega,
        statusPedido: "Aguardando envio",
        prazoExpedicao: parsed.prazoExpedicao,
      });
      setAutoFilled(true);
    } else {
      setNfeData({
        chaveNfe: "",
        numeroNota: 0,
        serieNota: "1",
        dataEmissaoNota: "",
        numeroObjeto: "",
        codigoServico: "",
        codigoTransportadora: "",
        transportadoraNome: "",
        servicoEntrega: "Normal",
        statusPedido: "Aguardando envio",
        prazoExpedicao: 0,
      });
      setAutoFilled(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const res = await api.adminGetOrders(token);
      setOrders((res.orders || []).filter((o) => o.status === "paid" || o.status === "sige_registered"));
    } catch (e: any) {
      setError(e.message || "Erro ao carregar pedidos");
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!selectedOrder) return;
    setSending(true);
    setSendResult(null);
    setError("");
    try {
      const token = await getToken();
      const cfg = await api.sisfreteWTGetConfig(token);

      const addr = selectedOrder.shippingAddress;
      const pedido: SisfreteWTPedido = {
        canalVenda: cfg.canalVenda || "Carretao Auto Pecas",
        subCanal: cfg.subCanal || "Loja Virtual",
        chaveNfe: nfeData.chaveNfe,
        numeroDoPedido: selectedOrder.localOrderId || selectedOrder.orderId || "",
        codigoServico: nfeData.codigoServico,
        codigoTransportadora: nfeData.codigoTransportadora,
        dataEmissaoNota: nfeData.dataEmissaoNota || new Date().toISOString(),
        dataVenda: selectedOrder.createdAt ? selectedOrder.createdAt.split("T")[0] : new Date().toISOString().split("T")[0],
        cnpjCd: cfg.cnpjCd || "",
        destinatarioBairro: "",
        destinatarioCelular: addr?.phone || "",
        destinatarioCep: addr?.cep || "",
        destinatarioCidade: addr?.city || "",
        destinatarioCpfCnpj: "",
        destinatarioEmail: selectedOrder.userEmail || "",
        destinatarioEstado: addr?.state || "",
        destinatarioNome: addr?.name || selectedOrder.userName || "",
        destinatarioNumero: "",
        destinatarioPais: "Brasil",
        destinatarioRua: addr?.address || "",
        destinatarioTipo: "F",
        pedidoCanalVenda: selectedOrder.localOrderId || "",
        numeroNota: nfeData.numeroNota,
        numeroObjeto: nfeData.numeroObjeto,
        serieNota: nfeData.serieNota,
        servicoEntrega: nfeData.servicoEntrega,
        statusPedido: nfeData.statusPedido,
        transportadoraNome: nfeData.transportadoraNome,
        prazoExpedicao: nfeData.prazoExpedicao || undefined,
        idCotacao: selectedOrder.shippingOption?.sisfreteQuoteId || undefined,
        valorFrete: selectedOrder.shippingOption?.price || 0,
        valorPedido: selectedOrder.total || 0,
        produtos: (selectedOrder.items || []).map((it, idx) => ({
          codigo: it.sku || "ITEM" + idx,
          altura: 10,
          largura: 15,
          comprimento: 20,
          peso: 1,
          quantidade: it.quantidade || 1,
          valor: it.valorUnitario || 0,
          cubicoComFator: 0,
          cubicoIndividual: 0,
        })),
      };

      const result = await api.sisfreteWTSendOrder(token, [pedido]);
      setSendResult(result);
    } catch (e: any) {
      setError(e.message || "Erro ao enviar pedido");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-green-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2" style={{ fontSize: "0.82rem" }}>
          {error}
        </div>
      )}

      {sendResult && (
        <div
          className={
            "rounded-lg px-4 py-3 border " +
            (sendResult.success ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700")
          }
          style={{ fontSize: "0.82rem" }}
        >
          <div className="flex items-center gap-2 font-semibold mb-1">
            {sendResult.success ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {sendResult.success ? "Pedido enviado com sucesso!" : "Erro ao enviar pedido"}
          </div>
          <pre className="text-xs bg-white bg-opacity-50 rounded p-2 mt-2 overflow-x-auto max-h-40">
            {JSON.stringify(sendResult.data || sendResult.error, null, 2)}
          </pre>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Order selector */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-800 mb-3" style={{ fontSize: "0.9rem" }}>
            <Package className="inline w-4 h-4 mr-1.5 text-green-600" />
            Selecionar Pedido (pagos/registrados)
          </h3>

          {orders.length === 0 ? (
            <p className="text-gray-400 text-sm py-4 text-center">Nenhum pedido pago disponivel.</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {orders.map((o, oIdx) => {
                const isSelected = selectedOrder?.localOrderId === o.localOrderId;
                return (
                  <button
                    key={(o.localOrderId || o.orderId || "order") + "_" + oIdx}
                    onClick={() => selectOrder(o)}
                    className={
                      "w-full text-left px-3 py-2 rounded-lg border transition-colors " +
                      (isSelected ? "border-green-400 bg-green-50" : "border-gray-100 bg-gray-50 hover:bg-gray-100")
                    }
                    style={{ fontSize: "0.8rem" }}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-gray-800">#{o.localOrderId?.slice(0, 12) || o.orderId}</span>
                      <span className="font-bold text-green-700">{fmtBRL(o.total)}</span>
                    </div>
                    <div className="text-gray-500 mt-0.5">
                      {o.userName || o.userEmail || "Anonimo"} &middot; {fmtDate(o.createdAt)}
                    </div>
                    <div className="text-gray-400 mt-0.5 flex items-center gap-1.5">
                      <span>{o.itemCount || o.items?.length || 0} item(ns) &middot; {o.shippingAddress?.city || ""}/{o.shippingAddress?.state || ""}</span>
                      {o.shippingOption?.sisfreteQuoteId && (
                        <span className="inline-flex items-center gap-0.5 bg-blue-100 text-blue-700 px-1.5 py-0 rounded text-[10px] font-semibold" title={"Cotacao #" + o.shippingOption.sisfreteQuoteId}>
                          <Link2 className="w-2.5 h-2.5" /> Cotacao
                        </span>
                      )}
                      {o.shippingOption?.carrierName && !o.shippingOption?.sisfreteQuoteId && (
                        <span className="inline-flex items-center gap-0.5 bg-gray-100 text-gray-500 px-1.5 py-0 rounded text-[10px] font-medium">
                          <Truck className="w-2.5 h-2.5" /> {o.shippingOption.carrierName.slice(0, 20)}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <button
            onClick={loadOrders}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-green-600 mt-3"
          >
            <RefreshCw className="w-3 h-3" /> Recarregar pedidos
          </button>
        </div>

        {/* NF-e / Shipping data form */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-800 mb-3" style={{ fontSize: "0.9rem" }}>
            <FileText className="inline w-4 h-4 mr-1.5 text-blue-600" />
            Dados de NF-e / Transporte
          </h3>

          {!selectedOrder ? (
            <p className="text-gray-400 text-sm py-8 text-center">Selecione um pedido ao lado</p>
          ) : (
            <div className="space-y-3">
              {/* Auto-fill banner */}
              {autoFilled && selectedOrder.shippingOption && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                  <p className="text-xs text-emerald-700 font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    Campos de transporte preenchidos via cotacao
                  </p>
                  <p className="text-xs text-emerald-500 mt-0.5">
                    Transportadora, servico e prazo foram carregados automaticamente de{" "}
                    <b>{selectedOrder.shippingOption.carrierName}</b>
                    {selectedOrder.shippingOption.sisfreteQuoteId && (
                      <span> (cotacao #{selectedOrder.shippingOption.sisfreteQuoteId})</span>
                    )}
                    . Voce pode editar se necessario.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-0.5">Chave NF-e (44 digitos)</label>
                <input
                  type="text"
                  value={nfeData.chaveNfe}
                  onChange={(e) => setNfeData({ ...nfeData, chaveNfe: e.target.value.replace(/\D/g, "").slice(0, 44) })}
                  className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs font-mono"
                  maxLength={44}
                  placeholder="12345678901234567890123456789012345678901234"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">N. da Nota</label>
                  <input
                    type="number"
                    value={nfeData.numeroNota || ""}
                    onChange={(e) => setNfeData({ ...nfeData, numeroNota: parseInt(e.target.value) || 0 })}
                    className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">Serie Nota</label>
                  <input
                    type="text"
                    value={nfeData.serieNota}
                    onChange={(e) => setNfeData({ ...nfeData, serieNota: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-0.5">Data Emissao NF-e</label>
                <input
                  type="datetime-local"
                  value={nfeData.dataEmissaoNota}
                  onChange={(e) => setNfeData({ ...nfeData, dataEmissaoNota: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-0.5">Codigo de Rastreio (opcional)</label>
                <input
                  type="text"
                  value={nfeData.numeroObjeto}
                  onChange={(e) => setNfeData({ ...nfeData, numeroObjeto: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs font-mono"
                  placeholder="AB123456789BR"
                />
                <p className="text-xs text-gray-400 mt-0.5">Se vazio, o SisFrete fornecera o codigo de rastreio</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">
                    Cod. Servico
                    {autoFilled && nfeData.codigoServico && <span className="ml-1 text-emerald-500 font-normal">(auto)</span>}
                  </label>
                  <input
                    type="text"
                    value={nfeData.codigoServico}
                    onChange={(e) => setNfeData({ ...nfeData, codigoServico: e.target.value })}
                    className={"w-full border rounded-lg px-2.5 py-1.5 text-xs " + (autoFilled && nfeData.codigoServico ? "border-emerald-300 bg-emerald-50" : "border-gray-300")}
                    placeholder="EXP, PAC, etc."
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">
                    Cod. Transportadora
                    {autoFilled && nfeData.codigoTransportadora && <span className="ml-1 text-emerald-500 font-normal">(auto)</span>}
                  </label>
                  <input
                    type="text"
                    value={nfeData.codigoTransportadora}
                    onChange={(e) => setNfeData({ ...nfeData, codigoTransportadora: e.target.value })}
                    className={"w-full border rounded-lg px-2.5 py-1.5 text-xs " + (autoFilled && nfeData.codigoTransportadora ? "border-emerald-300 bg-emerald-50" : "border-gray-300")}
                    placeholder="RDN01"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-0.5">
                  Nome Transportadora
                  {autoFilled && nfeData.transportadoraNome && <span className="ml-1 text-emerald-500 font-normal">(auto)</span>}
                </label>
                <input
                  type="text"
                  value={nfeData.transportadoraNome}
                  onChange={(e) => setNfeData({ ...nfeData, transportadoraNome: e.target.value })}
                  className={"w-full border rounded-lg px-2.5 py-1.5 text-xs " + (autoFilled && nfeData.transportadoraNome ? "border-emerald-300 bg-emerald-50" : "border-gray-300")}
                  placeholder="Rodonaves, Braspress, etc."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">
                    Servico Entrega
                    {autoFilled && nfeData.servicoEntrega !== "Normal" && <span className="ml-1 text-emerald-500 font-normal">(auto)</span>}
                  </label>
                  <select
                    value={nfeData.servicoEntrega}
                    onChange={(e) => setNfeData({ ...nfeData, servicoEntrega: e.target.value })}
                    className={"w-full border rounded-lg px-2.5 py-1.5 text-xs " + (autoFilled && nfeData.servicoEntrega !== "Normal" ? "border-emerald-300 bg-emerald-50" : "border-gray-300")}
                  >
                    <option>Normal</option>
                    <option>Expressa</option>
                    <option>PAC</option>
                    <option>SEDEX</option>
                    <option>Motoboy</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">
                    Prazo Expedicao (dias)
                    {autoFilled && nfeData.prazoExpedicao > 0 && <span className="ml-1 text-emerald-500 font-normal">(auto)</span>}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={nfeData.prazoExpedicao || ""}
                    onChange={(e) => setNfeData({ ...nfeData, prazoExpedicao: parseInt(e.target.value) || 0 })}
                    className={"w-full border rounded-lg px-2.5 py-1.5 text-xs " + (autoFilled && nfeData.prazoExpedicao > 0 ? "border-emerald-300 bg-emerald-50" : "border-gray-300")}
                  />
                </div>
              </div>

              {/* Destination summary */}
              {selectedOrder.shippingAddress && (
                <div className="bg-gray-50 rounded-lg p-2.5 mt-2">
                  <p className="text-xs text-gray-500 font-semibold mb-1">
                    <MapPin className="inline w-3 h-3 mr-1" />
                    Destinatario
                  </p>
                  <p className="text-xs text-gray-700">
                    {selectedOrder.shippingAddress.name || selectedOrder.userName} &mdash;{" "}
                    {selectedOrder.shippingAddress.address}, {selectedOrder.shippingAddress.city}/{selectedOrder.shippingAddress.state}{" "}
                    CEP {selectedOrder.shippingAddress.cep}
                  </p>
                </div>
              )}

              {/* SisFrete Quote ID indicator */}
              {selectedOrder.shippingOption?.sisfreteQuoteId ? (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 mt-1">
                  <p className="text-xs text-blue-700 font-semibold flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-blue-500" />
                    ID Cotacao SisFrete vinculado:
                    <code className="bg-blue-100 px-1.5 py-0.5 rounded font-mono text-blue-800">{selectedOrder.shippingOption.sisfreteQuoteId}</code>
                  </p>
                  <p className="text-xs text-blue-500 mt-0.5">Este ID sera enviado junto com o despacho para rastreabilidade</p>
                </div>
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 mt-1">
                  <p className="text-xs text-gray-500 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-gray-400" />
                    Sem ID de cotacao — normal dependendo do modo/plano da API SisFrete. O despacho sera enviado sem este campo.
                  </p>
                </div>
              )}

              <button
                onClick={handleSend}
                disabled={sending || !nfeData.chaveNfe}
                className="w-full flex items-center justify-center gap-2 bg-green-600 text-white py-2.5 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors mt-2"
                style={{ fontSize: "0.85rem" }}
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? "Enviando..." : "Enviar para SisFrete"}
              </button>

              {!nfeData.chaveNfe && (
                <p className="text-xs text-amber-600 text-center">
                  <AlertTriangle className="inline w-3 h-3 mr-1" />
                  Preencha a Chave NF-e para enviar
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================= SENT ORDERS TAB ================= */
function SentOrdersTab() {
  const [sentOrders, setSentOrders] = useState<SisfreteWTSentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  // Cancel modal
  const [cancelTarget, setCancelTarget] = useState<SisfreteWTSentOrder | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelResult, setCancelResult] = useState<any>(null);

  useEffect(() => {
    loadSentOrders();
  }, []);

  const loadSentOrders = async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const res = await api.sisfreteWTGetSentOrders(token);
      setSentOrders(res.orders || []);
    } catch (e: any) {
      setError(e.message || "Erro");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (order: SisfreteWTSentOrder) => {
    setCancelling(true);
    setCancelResult(null);
    try {
      const token = await getToken();
      const result = await api.sisfreteWTCancelOrder(token, {
        chaveNfe: order.pedido.chaveNfe,
        numeroDoPedido: order.pedido.numeroDoPedido,
        pedidoCanalVenda: order.pedido.pedidoCanalVenda,
      });
      setCancelResult(result);
      await loadSentOrders();
    } catch (e: any) {
      setCancelResult({ success: false, error: e.message });
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-green-600 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800" style={{ fontSize: "0.9rem" }}>
          Pedidos Enviados ao SisFrete ({sentOrders.length})
        </h3>
        <button onClick={loadSentOrders} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-green-600">
          <RefreshCw className="w-3 h-3" /> Atualizar
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 mb-4" style={{ fontSize: "0.82rem" }}>
          {error}
        </div>
      )}

      {cancelResult && (
        <div
          className={
            "rounded-lg px-4 py-3 border mb-4 " +
            (cancelResult.success ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700")
          }
          style={{ fontSize: "0.82rem" }}
        >
          {cancelResult.success ? "Pedido cancelado com sucesso!" : "Erro: " + (cancelResult.error || JSON.stringify(cancelResult.data))}
        </div>
      )}

      {sentOrders.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nenhum pedido enviado ainda.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sentOrders.map((so, idx) => {
            const p = so.pedido;
            const isExpanded = expandedIdx === idx;
            const isCancelled = so.status === "cancelled";
            return (
              <div
                key={idx}
                className={"bg-white rounded-lg border " + (isCancelled ? "border-red-200 opacity-70" : "border-gray-200")}
              >
                <button
                  onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={
                        "w-2 h-2 rounded-full " +
                        (isCancelled ? "bg-red-400" : "bg-green-400")
                      }
                    />
                    <div>
                      <span className="font-semibold text-gray-800 text-sm">#{p.numeroDoPedido}</span>
                      <span className="text-gray-400 text-xs ml-2">{p.numeroObjeto}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">{fmtDate(so.sentAt)}</span>
                    <span
                      className={
                        "text-xs px-2 py-0.5 rounded-full font-medium " +
                        (isCancelled ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700")
                      }
                    >
                      {isCancelled ? "Cancelado" : "Enviado"}
                    </span>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-100">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3 text-xs">
                      <div>
                        <span className="text-gray-400">NF-e:</span>
                        <p className="text-gray-700 font-mono break-all">{p.chaveNfe}</p>
                      </div>
                      <div>
                        <span className="text-gray-400">Transportadora:</span>
                        <p className="text-gray-700">{p.transportadoraNome}</p>
                      </div>
                      <div>
                        <span className="text-gray-400">Servico:</span>
                        <p className="text-gray-700">{p.servicoEntrega}</p>
                      </div>
                      <div>
                        <span className="text-gray-400">Valor Pedido:</span>
                        <p className="text-gray-700 font-bold">{fmtBRL(p.valorPedido)}</p>
                      </div>
                      <div>
                        <span className="text-gray-400">Valor Frete:</span>
                        <p className="text-gray-700">{fmtBRL(p.valorFrete)}</p>
                      </div>
                      <div>
                        <span className="text-gray-400">Destinatario:</span>
                        <p className="text-gray-700">{p.destinatarioNome}</p>
                        <p className="text-gray-500">{p.destinatarioCidade}/{p.destinatarioEstado}</p>
                      </div>
                    </div>

                    {so.response && (
                      <details className="mt-3">
                        <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Resposta da API</summary>
                        <pre className="text-xs bg-gray-50 rounded p-2 mt-1 overflow-x-auto max-h-32">
                          {JSON.stringify(so.response, null, 2)}
                        </pre>
                      </details>
                    )}

                    {!isCancelled && (
                      <button
                        onClick={() => handleCancel(so)}
                        disabled={cancelling}
                        className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 mt-3 px-2.5 py-1.5 rounded-lg border border-red-200 hover:bg-red-50"
                      >
                        {cancelling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3" />}
                        Cancelar Pedido no SisFrete
                      </button>
                    )}
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

/* ================= RASTREIO TAB ================= */
function RastreioTab() {
  const [events, setEvents] = useState<SisfreteWTRastreio[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastFetch, setLastFetch] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const res = await api.sisfreteWTGetRastreio(token);
      if (res.success) {
        setEvents(res.events || []);
        setLastFetch(new Date().toLocaleString("pt-BR"));
      } else {
        setError((res as any).error || "Erro ao buscar rastreios");
      }
    } catch (e: any) {
      setError(e.message || "Erro");
    } finally {
      setLoading(false);
    }
  }, []);

  const filteredEvents = events.filter((ev) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      (ev.objeto || "").toLowerCase().includes(q) ||
      (ev.pedido || "").toLowerCase().includes(q) ||
      (ev.descricao || "").toLowerCase().includes(q)
    );
  });

  // Group events by pedido
  const groupedByPedido: Record<string, SisfreteWTRastreio[]> = {};
  for (const ev of filteredEvents) {
    const key = ev.pedido || "sem-pedido";
    if (!groupedByPedido[key]) groupedByPedido[key] = [];
    groupedByPedido[key].push(ev);
  }

  // Sort groups by latest event date
  const sortedGroups = Object.entries(groupedByPedido).sort((a, b) => {
    const latestA = Math.max(...a[1].map((e) => new Date(e.data_hora || 0).getTime()));
    const latestB = Math.max(...b[1].map((e) => new Date(e.data_hora || 0).getTime()));
    return latestB - latestA;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h3 className="font-semibold text-gray-800" style={{ fontSize: "0.9rem" }}>
          Rastreios SisFrete
          {events.length > 0 && <span className="text-gray-400 font-normal ml-2">({events.length} eventos)</span>}
        </h3>
        <div className="flex items-center gap-2">
          {lastFetch && <span className="text-xs text-gray-400">Ultima consulta: {lastFetch}</span>}
          <button
            onClick={loadEvents}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            {loading ? "Consultando..." : "Consultar Rastreios"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 mb-4" style={{ fontSize: "0.82rem" }}>
          {error}
        </div>
      )}

      {events.length === 0 && !loading && !error && (
        <div className="text-center py-12 text-gray-400">
          <Search className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Clique em "Consultar Rastreios" para buscar os ultimos eventos.</p>
          <p className="text-xs mt-1">A API retorna ate 500 registros por requisicao.</p>
        </div>
      )}

      {events.length > 0 && (
        <>
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm"
              placeholder="Buscar por pedido, objeto ou descricao..."
            />
          </div>

          {/* Grouped tracking */}
          <div className="space-y-4">
            {sortedGroups.map(([pedido, pedidoEvents]) => {
              const sorted = [...pedidoEvents].sort((a, b) => new Date(b.data_hora || 0).getTime() - new Date(a.data_hora || 0).getTime());
              const latest = sorted[0];
              const isDelivered = (latest.descricao || "").toLowerCase().includes("entrega realizada");
              const isInTransit = (latest.descricao || "").toLowerCase().includes("transporte");

              return (
                <div key={pedido} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {/* Header */}
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={
                          "w-2.5 h-2.5 rounded-full " +
                          (isDelivered ? "bg-green-500" : isInTransit ? "bg-blue-500" : "bg-amber-500")
                        }
                      />
                      <span className="font-semibold text-gray-800 text-sm">Pedido #{pedido}</span>
                      {latest.objeto && (
                        <span className="text-xs text-gray-400 font-mono">{latest.objeto}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {latest.link && (
                        <a
                          href={latest.link.startsWith("http") ? latest.link : "https://" + latest.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <Link2 className="w-3 h-3" /> Rastrear
                        </a>
                      )}
                      <span
                        className={
                          "text-xs px-2 py-0.5 rounded-full font-medium " +
                          (isDelivered
                            ? "bg-green-100 text-green-700"
                            : isInTransit
                            ? "bg-blue-100 text-blue-700"
                            : "bg-amber-100 text-amber-700")
                        }
                      >
                        {isDelivered ? "Entregue" : isInTransit ? "Em Transito" : "Em Andamento"}
                      </span>
                    </div>
                  </div>

                  {/* Timeline */}
                  <div className="px-4 py-3">
                    <div className="relative">
                      {sorted.map((ev, evIdx) => {
                        const isLast = evIdx === sorted.length - 1;
                        return (
                          <div key={ev.id || evIdx} className="flex gap-3 pb-3 relative">
                            {/* Timeline line */}
                            {!isLast && (
                              <div
                                className="absolute left-[5px] top-3 w-0.5 bg-gray-200"
                                style={{ height: "calc(100% - 6px)" }}
                              />
                            )}
                            {/* Dot */}
                            <div
                              className={
                                "w-3 h-3 rounded-full mt-0.5 flex-shrink-0 z-10 " +
                                (evIdx === 0 ? "bg-green-500" : "bg-gray-300")
                              }
                            />
                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-800 font-medium">{ev.descricao || "Evento"}</p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                <Clock className="inline w-3 h-3 mr-1" />
                                {fmtDate(ev.data_hora)}
                                {ev.danfe && (
                                  <span className="ml-2 font-mono text-gray-300" title="DANFE">
                                    NF-e: ...{ev.danfe.slice(-8)}
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ================= DELIVERY TAB ================= */
function DeliveryTab() {
  const [dlvConfig, setDlvConfig] = useState<SisfreteDeliveryConfig>({ apiToken: "", enabled: false });
  const [deliverymen, setDeliverymen] = useState<SisfreteDeliveryman[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [apiDetails, setApiDetails] = useState<any>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ document: "", erpCodeDeliveryman: "", erpCodeStore: "1", name: "", phone: "", email: "", active: "" });
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<any>(null);
  const [showPwChange, setShowPwChange] = useState(false);
  const [pwOld, setPwOld] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwChanging, setPwChanging] = useState(false);
  const [pwResult, setPwResult] = useState<any>(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true); setError("");
    try {
      const token = await getToken();
      const [cfg, list] = await Promise.all([api.sisfreteDeliveryGetConfig(token), api.sisfreteDeliveryListDeliverymen(token)]);
      if (cfg) setDlvConfig(cfg);
      setDeliverymen(list.deliverymen || []);
    } catch (e: any) { setError(e.message || "Erro"); } finally { setLoading(false); }
  };

  const handleSaveConfig = async () => {
    setSaving(true); setError(""); setSaved(false);
    try {
      const token = await getToken();
      const r = await api.sisfreteDeliverySaveConfig(token, dlvConfig);
      if (r) setDlvConfig(r);
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (e: any) { setError(e.message || "Erro"); } finally { setSaving(false); }
  };

  const handleCreate = async () => {
    setCreating(true); setCreateResult(null); setError("");
    try {
      const token = await getToken();
      const r = await api.sisfreteDeliveryCreateDeliveryman(token, {
        document: formData.document, erpCodeDeliveryman: formData.erpCodeDeliveryman,
        erpCodeStore: formData.erpCodeStore.split(",").map((s) => s.trim()).filter(Boolean),
        name: formData.name, phone: formData.phone, email: formData.email, active: formData.active,
      });
      setCreateResult(r);
      if (r.success) {
        setFormData({ document: "", erpCodeDeliveryman: "", erpCodeStore: "1", name: "", phone: "", email: "", active: "" });
        setShowForm(false);
        const list = await api.sisfreteDeliveryListDeliverymen(token);
        setDeliverymen(list.deliverymen || []);
      }
    } catch (e: any) { setCreateResult({ success: false, error: e.message }); } finally { setCreating(false); }
  };

  const handleRemove = async (doc: string) => {
    if (!confirm("Remover este entregador da lista local?")) return;
    try {
      const token = await getToken();
      await api.sisfreteDeliveryRemoveDeliveryman(token, doc);
      setDeliverymen((prev) => prev.filter((d) => d.document !== doc));
    } catch (e: any) { setError(e.message || "Erro"); }
  };

  const handleFetchDetails = async () => {
    setDetailsLoading(true); setApiDetails(null);
    try { const token = await getToken(); setApiDetails(await api.sisfreteDeliveryGetDetails(token)); }
    catch (e: any) { setApiDetails({ success: false, error: e.message }); }
    finally { setDetailsLoading(false); }
  };

  const handleChangePw = async () => {
    setPwChanging(true); setPwResult(null);
    try {
      const token = await getToken();
      const r = await api.sisfreteDeliveryChangePassword(token, pwOld, pwNew);
      setPwResult(r);
      if (r.success) { setPwOld(""); setPwNew(""); }
    } catch (e: any) { setPwResult({ success: false, error: e.message }); } finally { setPwChanging(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-orange-500 animate-spin" /></div>;

  return (
    <div className="space-y-5">
      <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3" style={{ fontSize: "0.82rem" }}>
        <p className="text-orange-800">
          <b>SisFrete Delivery</b> &mdash; API REST para gerenciamento de entregadores.{" "}
          <code className="bg-orange-100 px-1 rounded text-xs">sisfrete-delivery.persys.eti.br/api</code>
        </p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2" style={{ fontSize: "0.82rem" }}>{error}</div>}

      {createResult && (
        <div className={"rounded-lg px-4 py-3 border " + (createResult.success ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700")} style={{ fontSize: "0.82rem" }}>
          <div className="flex items-center gap-2 font-semibold">
            {createResult.success ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {createResult.success ? "Entregador criado com sucesso!" : "Erro ao criar entregador"}
          </div>
          {createResult.data && <pre className="text-xs bg-white bg-opacity-50 rounded p-2 mt-2 overflow-x-auto max-h-32">{JSON.stringify(createResult.data || createResult.error, null, 2)}</pre>}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Config panel */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-800 mb-3" style={{ fontSize: "0.9rem" }}>
            <Settings className="inline w-4 h-4 mr-1.5 text-orange-600" />Configuracao Delivery
          </h3>
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <div className={"w-10 h-5 rounded-full relative transition-colors " + (dlvConfig.enabled ? "bg-orange-500" : "bg-gray-300")} onClick={() => setDlvConfig({ ...dlvConfig, enabled: !dlvConfig.enabled })}>
                <div className="w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all" style={{ left: dlvConfig.enabled ? "22px" : "2px" }} />
              </div>
              <span className="text-sm font-medium text-gray-700">{dlvConfig.enabled ? "Ativa" : "Inativa"}</span>
            </label>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Token API (Authorization-API)</label>
              <div className="relative">
                <input type={showToken ? "text" : "password"} value={dlvConfig.apiToken} onChange={(e) => setDlvConfig({ ...dlvConfig, apiToken: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-1.5 pr-10 text-xs" placeholder="Token SisFrete Delivery" />
                <button onClick={() => setShowToken(!showToken)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button onClick={handleSaveConfig} disabled={saving} className="flex items-center gap-1.5 bg-orange-600 text-white px-3 py-1.5 rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors" style={{ fontSize: "0.8rem" }}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                {saving ? "Salvando..." : saved ? "Salvo!" : "Salvar"}
              </button>
              {dlvConfig.updatedAt && <span className="text-xs text-gray-400">{fmtDate(dlvConfig.updatedAt)}</span>}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100">
            <button onClick={handleFetchDetails} disabled={detailsLoading} className="flex items-center gap-1.5 text-xs text-orange-600 hover:text-orange-700">
              {detailsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
              Consultar detalhes do entregador na API
            </button>
            {apiDetails && <pre className="text-xs bg-gray-50 rounded p-2 mt-2 overflow-x-auto max-h-40 border border-gray-100">{JSON.stringify(apiDetails, null, 2)}</pre>}
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100">
            <button onClick={() => setShowPwChange(!showPwChange)} className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-orange-600">
              <Key className="w-3 h-3" />{showPwChange ? "Fechar" : "Alterar senha do entregador"}
            </button>
            {showPwChange && (
              <div className="mt-2 space-y-2">
                <input type="password" value={pwOld} onChange={(e) => setPwOld(e.target.value)} className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs" placeholder="Senha atual" />
                <input type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs" placeholder="Nova senha" />
                <button onClick={handleChangePw} disabled={pwChanging || !pwOld || !pwNew} className="flex items-center gap-1.5 bg-gray-700 text-white px-3 py-1.5 rounded-lg hover:bg-gray-800 disabled:opacity-50 text-xs">
                  {pwChanging ? <Loader2 className="w-3 h-3 animate-spin" /> : <Key className="w-3 h-3" />}Alterar Senha
                </button>
                {pwResult && <p className={"text-xs " + (pwResult.success ? "text-green-600" : "text-red-600")}>{pwResult.success ? "Senha alterada!" : "Erro: " + (pwResult.error || "falha")}</p>}
              </div>
            )}
          </div>
        </div>

        {/* Deliverymen list + form */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-800" style={{ fontSize: "0.9rem" }}>
              <Users className="inline w-4 h-4 mr-1.5 text-orange-600" />Entregadores ({deliverymen.length})
            </h3>
            <button onClick={() => { setShowForm(!showForm); setCreateResult(null); }} className={"flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors " + (showForm ? "bg-gray-100 text-gray-600" : "bg-orange-600 text-white hover:bg-orange-700")}>
              {showForm ? <ChevronUp className="w-3 h-3" /> : <UserPlus className="w-3 h-3" />}
              {showForm ? "Fechar" : "Novo Entregador"}
            </button>
          </div>

          {showForm && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4 space-y-2.5">
              <p className="text-xs font-semibold text-orange-800 mb-2"><UserPlus className="inline w-3.5 h-3.5 mr-1" />Criar Entregador (API v2)</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-600 mb-0.5">Nome *</label>
                  <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full border border-gray-300 rounded px-2 py-1 text-xs" placeholder="Nome completo" />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-0.5">CPF/CNPJ *</label>
                  <input type="text" value={formData.document} onChange={(e) => setFormData({ ...formData, document: e.target.value.replace(/\D/g, "").slice(0, 14) })} className="w-full border border-gray-300 rounded px-2 py-1 text-xs font-mono" placeholder="Somente numeros" maxLength={14} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-600 mb-0.5">Telefone</label>
                  <input type="text" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="w-full border border-gray-300 rounded px-2 py-1 text-xs" placeholder="14996999999" />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-0.5">Email</label>
                  <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full border border-gray-300 rounded px-2 py-1 text-xs" placeholder="email@empresa.com" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-gray-600 mb-0.5">Cod. ERP</label>
                  <input type="text" value={formData.erpCodeDeliveryman} onChange={(e) => setFormData({ ...formData, erpCodeDeliveryman: e.target.value })} className="w-full border border-gray-300 rounded px-2 py-1 text-xs" placeholder="252" />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-0.5">Cod. Loja(s)</label>
                  <input type="text" value={formData.erpCodeStore} onChange={(e) => setFormData({ ...formData, erpCodeStore: e.target.value })} className="w-full border border-gray-300 rounded px-2 py-1 text-xs" placeholder="1,2,3" />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-0.5">Ativo</label>
                  <select value={formData.active} onChange={(e) => setFormData({ ...formData, active: e.target.value })} className="w-full border border-gray-300 rounded px-2 py-1 text-xs">
                    <option value="">Padrao</option>
                    <option value="1">Sim</option>
                    <option value="0">Nao</option>
                  </select>
                </div>
              </div>
              <button onClick={handleCreate} disabled={creating || !formData.name || !formData.document} className="w-full flex items-center justify-center gap-1.5 bg-orange-600 text-white py-2 rounded-lg hover:bg-orange-700 disabled:opacity-50 text-xs mt-1">
                {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                {creating ? "Criando..." : "Criar Entregador"}
              </button>
            </div>
          )}

          {deliverymen.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-xs">Nenhum entregador cadastrado.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {deliverymen.map((d, idx) => (
                <div key={d.document + "_" + idx} className="bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-gray-800 text-sm">{d.name}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                        <span className="flex items-center gap-1"><Hash className="w-3 h-3" />{d.document}</span>
                        {d.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{d.phone}</span>}
                        {d.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{d.email}</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                        <span>ERP: {d.erpCodeDeliveryman}</span>
                        <span>Lojas: {(d.erpCodeStore || []).join(", ")}</span>
                        {d.createdAt && <span>{fmtDate(d.createdAt)}</span>}
                      </div>
                    </div>
                    <button onClick={() => handleRemove(d.document)} className="text-red-400 hover:text-red-600 p-1" title="Remover da lista local">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button onClick={loadAll} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-orange-600 mt-3">
            <RefreshCw className="w-3 h-3" /> Recarregar
          </button>
        </div>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Como usar a API Delivery:</h4>
        <ol className="list-decimal list-inside space-y-1 text-xs text-gray-600">
          <li>Obtenha o token <b>Authorization-API</b> no painel SisFrete Delivery</li>
          <li>Cole o token no campo acima e salve</li>
          <li>Use <b>"Novo Entregador"</b> para criar entregadores via API v2 (<code className="bg-gray-100 px-1 rounded">/api/v2/deliveryman</code>)</li>
          <li><b>"Consultar detalhes"</b> usa o endpoint GET <code className="bg-gray-100 px-1 rounded">/api/deliveryman</code></li>
          <li><b>"Alterar senha"</b> usa PUT <code className="bg-gray-100 px-1 rounded">/api/deliveryman/change_password</code></li>
          <li>A lista local armazena os entregadores criados pelo painel (nao sincroniza automaticamente)</li>
        </ol>
      </div>
    </div>
  );
}