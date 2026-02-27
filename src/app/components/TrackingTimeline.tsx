import React, { useState, useEffect } from "react";
import {
  Package,
  Truck,
  MapPin,
  CheckCircle2,
  Clock,
  Loader2,
  AlertTriangle,
  ExternalLink,
  Copy,
  Check,
  PackageOpen,
  ArrowLeft,
  RefreshCw,
  Info,
} from "lucide-react";
import * as api from "../services/api";

/* ─── helpers ─── */

function classifyEvent(descricao: string): {
  icon: typeof Package;
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
} {
  var d = (descricao || "").toLowerCase();
  if (d.includes("entreg")) {
    return { icon: CheckCircle2, color: "text-green-600", bgColor: "bg-green-50", borderColor: "border-green-300", label: "Entregue" };
  }
  if (d.includes("saiu para entrega") || d.includes("em rota")) {
    return { icon: MapPin, color: "text-blue-600", bgColor: "bg-blue-50", borderColor: "border-blue-300", label: "Saiu para Entrega" };
  }
  if (d.includes("transito") || d.includes("trânsito") || d.includes("transferencia") || d.includes("transferência")) {
    return { icon: Truck, color: "text-amber-600", bgColor: "bg-amber-50", borderColor: "border-amber-300", label: "Em Trânsito" };
  }
  if (d.includes("postado") || d.includes("coletado") || d.includes("recebido na unidade")) {
    return { icon: PackageOpen, color: "text-purple-600", bgColor: "bg-purple-50", borderColor: "border-purple-300", label: "Postado" };
  }
  return { icon: Package, color: "text-gray-600", bgColor: "bg-gray-50", borderColor: "border-gray-300", label: "Atualizado" };
}

function formatTrackingDate(dateStr: string): { date: string; time: string } {
  try {
    var d = new Date(dateStr);
    return {
      date: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }),
      time: d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    };
  } catch {
    return { date: dateStr, time: "" };
  }
}

/* ─── Inline tracking panel (for OrdersTab) ─── */

interface InlineTrackingProps {
  accessToken: string;
  localOrderId: string;
  onClose: () => void;
}

export function InlineTracking({ accessToken, localOrderId, onClose }: InlineTrackingProps) {
  var [data, setData] = useState<api.OrderTrackingResult | null>(null);
  var [loading, setLoading] = useState(true);
  var [error, setError] = useState<string | null>(null);
  var [copied, setCopied] = useState(false);
  var [refreshing, setRefreshing] = useState(false);

  var fetchTracking = async function (showRefresh?: boolean) {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      var result = await api.getOrderTracking(accessToken, localOrderId);
      setData(result);
    } catch (err: any) {
      console.error("Tracking fetch error:", err);
      setError(err.message || "Erro ao consultar rastreio.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(function () {
    fetchTracking();
  }, [accessToken, localOrderId]);

  // Auto-refresh every 2 minutes when tracking is active and not delivered
  useEffect(function () {
    if (!data || !data.found) return;
    // Check if the last event is "Entregue" — if so, no need to auto-refresh
    if (data.events.length > 0) {
      var lastEvt = data.events[data.events.length - 1];
      if ((lastEvt.descricao || "").toLowerCase().includes("entreg")) return;
    }
    var timer = setInterval(function () {
      fetchTracking(true);
    }, 120000); // 2 minutes
    return function () { clearInterval(timer); };
  }, [data]);

  var handleCopy = function (text: string) {
    navigator.clipboard.writeText(text).then(function () {
      setCopied(true);
      setTimeout(function () { setCopied(false); }, 2000);
    });
  };

  if (loading) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 mt-3 mb-2">
        <div className="flex items-center justify-center gap-3">
          <Loader2 className="w-5 h-5 text-red-600 animate-spin" />
          <p className="text-gray-500" style={{ fontSize: "0.85rem" }}>Consultando rastreio...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 mt-3 mb-2">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-700" style={{ fontSize: "0.85rem" }}>{error}</p>
            <button
              onClick={function () { fetchTracking(); }}
              className="mt-2 text-red-600 hover:text-red-700 text-xs font-medium underline cursor-pointer"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data || !data.found) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mt-3 mb-2">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-gray-700 font-medium" style={{ fontSize: "0.88rem" }}>
              Rastreio ainda nao disponivel
            </p>
            <p className="text-gray-500 mt-1" style={{ fontSize: "0.8rem" }}>
              {data?.message || "Este pedido ainda nao foi enviado para rastreamento. Voce sera notificado quando houver atualizacoes."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-xl mt-3 mb-2 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Truck className="w-4 h-4 text-green-600" />
          <span className="text-gray-800 font-semibold" style={{ fontSize: "0.88rem" }}>
            Rastreio do Pedido
          </span>
          {data.carrierName && (
            <span className="text-gray-400" style={{ fontSize: "0.75rem" }}>
              via {data.carrierName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={function () { fetchTracking(true); }}
            disabled={refreshing}
            className="flex items-center gap-1 text-gray-500 hover:text-gray-700 transition-colors cursor-pointer disabled:opacity-50"
            style={{ fontSize: "0.75rem" }}
            title="Atualizar rastreio"
          >
            <RefreshCw className={"w-3.5 h-3.5" + (refreshing ? " animate-spin" : "")} />
          </button>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
            style={{ fontSize: "0.75rem" }}
          >
            Fechar
          </button>
        </div>
      </div>

      {/* Tracking code */}
      {data.trackingCode && (
        <div className="px-5 py-2.5 bg-blue-50/50 border-b border-gray-100 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Package className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-gray-500" style={{ fontSize: "0.75rem" }}>Codigo de rastreio:</span>
            <span className="text-blue-800 font-mono font-bold" style={{ fontSize: "0.85rem" }}>
              {data.trackingCode}
            </span>
          </div>
          <button
            onClick={function () { handleCopy(data!.trackingCode!); }}
            className="flex items-center gap-1 text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
            style={{ fontSize: "0.72rem" }}
            title="Copiar codigo"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? "Copiado!" : "Copiar"}
          </button>
          {data.trackingLink && (
            <a
              href={data.trackingLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-blue-600 hover:text-blue-700 transition-colors"
              style={{ fontSize: "0.72rem" }}
            >
              <ExternalLink className="w-3 h-3" />
              Ver no site
            </a>
          )}
        </div>
      )}

      {/* Timeline */}
      {data.events.length > 0 ? (
        <div className="px-5 py-4">
          <div className="relative">
            {data.events.slice().reverse().map(function (event, idx) {
              var info = classifyEvent(event.descricao);
              var Icon = info.icon;
              var dt = formatTrackingDate(event.data_hora);
              var isLatest = idx === 0;
              var isLast = idx === data!.events.length - 1;

              return (
                <div key={event.id || idx} className="flex gap-3 relative">
                  {/* Timeline line */}
                  {!isLast && (
                    <div
                      className={"absolute left-[15px] top-[32px] w-0.5 " + (isLatest ? "bg-gradient-to-b from-green-300 to-gray-200" : "bg-gray-200")}
                      style={{ bottom: "-8px" }}
                    />
                  )}

                  {/* Icon */}
                  <div className={"relative z-10 shrink-0 w-[30px] h-[30px] rounded-full flex items-center justify-center border-2 " + info.bgColor + " " + info.borderColor + (isLatest ? " ring-2 ring-offset-1 ring-green-200" : "")}>
                    <Icon className={"w-3.5 h-3.5 " + info.color} />
                  </div>

                  {/* Content */}
                  <div className={"flex-1 pb-5 " + (isLatest ? "" : "")}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p
                        className={"leading-snug " + (isLatest ? "text-gray-900 font-semibold" : "text-gray-700")}
                        style={{ fontSize: isLatest ? "0.88rem" : "0.82rem" }}
                      >
                        {event.descricao}
                      </p>
                      {isLatest && (
                        <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full" style={{ fontSize: "0.62rem", fontWeight: 700 }}>
                          <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                          Ultimo
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Clock className="w-3 h-3 text-gray-400" />
                      <span className="text-gray-400" style={{ fontSize: "0.75rem" }}>
                        {dt.date} {dt.time && "as " + dt.time}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="px-5 py-6 text-center">
          <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-600 font-medium" style={{ fontSize: "0.88rem" }}>
            Aguardando atualizacoes de rastreio
          </p>
          <p className="text-gray-400 mt-1" style={{ fontSize: "0.78rem" }}>
            O pedido foi enviado para rastreamento{data.sentAt ? " em " + formatTrackingDate(data.sentAt).date : ""}. As etapas aparecerão aqui em breve.
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── Full tracking page ─── */

interface TrackingPageContentProps {
  accessToken: string;
  localOrderId: string;
  onBack?: () => void;
}

export function TrackingPageContent({ accessToken, localOrderId, onBack }: TrackingPageContentProps) {
  var [data, setData] = useState<api.OrderTrackingResult | null>(null);
  var [loading, setLoading] = useState(true);
  var [error, setError] = useState<string | null>(null);
  var [copied, setCopied] = useState(false);
  var [lastRefresh, setLastRefresh] = useState<string>("");

  var fetchData = function () {
    return api.getOrderTracking(accessToken, localOrderId)
      .then(function (result) {
        setData(result);
        setLastRefresh(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
      })
      .catch(function (err: any) { setError(err.message || "Erro ao consultar rastreio."); });
  };

  useEffect(function () {
    setLoading(true);
    setError(null);
    fetchData().finally(function () { setLoading(false); });
  }, [accessToken, localOrderId]);

  // Auto-refresh every 2 minutes when tracking is active and not delivered
  useEffect(function () {
    if (!data || !data.found) return;
    if (data.events.length > 0) {
      var lastEvt = data.events[data.events.length - 1];
      if ((lastEvt.descricao || "").toLowerCase().includes("entreg")) return;
    }
    var timer = setInterval(function () { fetchData(); }, 120000);
    return function () { clearInterval(timer); };
  }, [data]);

  var handleCopy = function (text: string) {
    navigator.clipboard.writeText(text).then(function () {
      setCopied(true);
      setTimeout(function () { setCopied(false); }, 2000);
    });
  };

  // Progress bar calculation
  var progressPercent = 0;
  var progressLabel = "Processando";
  if (data && data.found && data.events.length > 0) {
    var lastEvent = data.events[data.events.length - 1];
    var lastDesc = (lastEvent.descricao || "").toLowerCase();
    if (lastDesc.includes("entreg")) { progressPercent = 100; progressLabel = "Entregue"; }
    else if (lastDesc.includes("saiu para entrega") || lastDesc.includes("em rota")) { progressPercent = 80; progressLabel = "Saiu para Entrega"; }
    else if (lastDesc.includes("transito") || lastDesc.includes("trânsito")) { progressPercent = 50; progressLabel = "Em Transito"; }
    else if (lastDesc.includes("postado") || lastDesc.includes("coletado")) { progressPercent = 20; progressLabel = "Postado"; }
    else { progressPercent = 10; progressLabel = "Atualizado"; }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Back button */}
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors mb-6 cursor-pointer"
          style={{ fontSize: "0.88rem" }}
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para Meus Pedidos
        </button>
      )}

      {/* Title */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
          <Truck className="w-5 h-5 text-green-600" />
        </div>
        <div>
          <h1 className="text-gray-900" style={{ fontSize: "1.3rem", fontWeight: 700 }}>
            Rastreio do Pedido
          </h1>
          <p className="text-gray-500" style={{ fontSize: "0.82rem" }}>
            {"Pedido #" + localOrderId}
          </p>
        </div>
        {lastRefresh && data && data.found && (
          <div className="ml-auto flex items-center gap-1.5 text-gray-400" style={{ fontSize: "0.72rem" }}>
            <RefreshCw className="w-3 h-3" />
            {"Atualizado as " + lastRefresh}
          </div>
        )}
      </div>

      {loading ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
          <Loader2 className="w-8 h-8 text-red-600 animate-spin mx-auto mb-3" />
          <p className="text-gray-500" style={{ fontSize: "0.88rem" }}>Consultando rastreio no SisFrete...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-red-800 font-semibold" style={{ fontSize: "0.95rem" }}>Erro ao consultar rastreio</p>
              <p className="text-red-600 mt-1" style={{ fontSize: "0.85rem" }}>{error}</p>
            </div>
          </div>
        </div>
      ) : !data || !data.found ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8 text-gray-400" />
          </div>
          <p className="text-gray-800 font-semibold" style={{ fontSize: "1.05rem" }}>
            Rastreio nao disponivel
          </p>
          <p className="text-gray-500 mt-2 max-w-sm mx-auto" style={{ fontSize: "0.85rem", lineHeight: 1.6 }}>
            {data?.message || "Este pedido ainda nao foi enviado para rastreamento."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Progress card */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-800 font-semibold" style={{ fontSize: "0.9rem" }}>
                {progressLabel}
              </span>
              <span className="text-gray-400" style={{ fontSize: "0.78rem" }}>
                {progressPercent}%
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={"h-full rounded-full transition-all duration-700 " + (progressPercent >= 100 ? "bg-green-500" : progressPercent >= 50 ? "bg-blue-500" : "bg-amber-500")}
                style={{ width: progressPercent + "%" }}
              />
            </div>
            <div className="flex justify-between mt-2">
              {[
                { label: "Postado", at: 20 },
                { label: "Em Transito", at: 50 },
                { label: "Saiu p/ Entrega", at: 80 },
                { label: "Entregue", at: 100 },
              ].map(function (step) {
                var reached = progressPercent >= step.at;
                return (
                  <span
                    key={step.at}
                    className={reached ? "text-gray-700 font-medium" : "text-gray-400"}
                    style={{ fontSize: "0.65rem" }}
                  >
                    {step.label}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Tracking code card */}
          {data.trackingCode && (
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1">
                  <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>Codigo de Rastreio</p>
                  <p className="text-gray-900 font-mono" style={{ fontSize: "1.1rem", fontWeight: 700 }}>
                    {data.trackingCode}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={function () { handleCopy(data!.trackingCode!); }}
                    className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg transition-colors cursor-pointer"
                    style={{ fontSize: "0.78rem", fontWeight: 500 }}
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? "Copiado!" : "Copiar"}
                  </button>
                  {data.trackingLink && (
                    <a
                      href={data.trackingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-2 rounded-lg transition-colors"
                      style={{ fontSize: "0.78rem", fontWeight: 500 }}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Rastrear
                    </a>
                  )}
                </div>
              </div>
              {data.carrierName && (
                <p className="text-gray-400 mt-2" style={{ fontSize: "0.75rem" }}>
                  {"Transportadora: " + data.carrierName}
                  {data.servicoEntrega ? " - " + data.servicoEntrega : ""}
                </p>
              )}
            </div>
          )}

          {/* Timeline card */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-gray-800 font-semibold" style={{ fontSize: "0.88rem" }}>
                Historico de Rastreio
              </span>
              <span className="text-gray-400" style={{ fontSize: "0.75rem" }}>
                {data.events.length + " evento" + (data.events.length !== 1 ? "s" : "")}
              </span>
            </div>

            {data.events.length > 0 ? (
              <div className="px-5 py-4">
                <div className="relative">
                  {data.events.slice().reverse().map(function (event, idx) {
                    var info = classifyEvent(event.descricao);
                    var Icon = info.icon;
                    var dt = formatTrackingDate(event.data_hora);
                    var isLatest = idx === 0;
                    var isLast = idx === data!.events.length - 1;

                    return (
                      <div key={event.id || idx} className="flex gap-4 relative">
                        {!isLast && (
                          <div
                            className={"absolute left-[17px] top-[36px] w-0.5 " + (isLatest ? "bg-gradient-to-b from-green-300 to-gray-200" : "bg-gray-200")}
                            style={{ bottom: "-8px" }}
                          />
                        )}
                        <div className={"relative z-10 shrink-0 w-[34px] h-[34px] rounded-full flex items-center justify-center border-2 " + info.bgColor + " " + info.borderColor + (isLatest ? " ring-2 ring-offset-2 ring-green-200" : "")}>
                          <Icon className={"w-4 h-4 " + info.color} />
                        </div>
                        <div className="flex-1 pb-6">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p
                              className={isLatest ? "text-gray-900 font-semibold" : "text-gray-700"}
                              style={{ fontSize: isLatest ? "0.92rem" : "0.85rem" }}
                            >
                              {event.descricao}
                            </p>
                            {isLatest && (
                              <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2 py-0.5 rounded-full" style={{ fontSize: "0.65rem", fontWeight: 700 }}>
                                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                Mais recente
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <Clock className="w-3 h-3 text-gray-400" />
                            <span className="text-gray-400" style={{ fontSize: "0.78rem" }}>
                              {dt.date}{dt.time ? " as " + dt.time : ""}
                            </span>
                          </div>
                          {event.danfe && (
                            <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.72rem" }}>
                              {"DANFE: " + event.danfe}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center">
                <Clock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-600 font-medium" style={{ fontSize: "0.92rem" }}>
                  Aguardando atualizacoes
                </p>
                <p className="text-gray-400 mt-1" style={{ fontSize: "0.82rem" }}>
                  As etapas de rastreio aparecerão aqui em breve.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}