import { useState, useEffect, useCallback } from "react";
import Activity from "lucide-react/dist/esm/icons/activity.js";
import AlertTriangle from "lucide-react/dist/esm/icons/alert-triangle.js";
import BarChart3 from "lucide-react/dist/esm/icons/bar-chart-3.js";
import Check from "lucide-react/dist/esm/icons/check.js";
import Clock from "lucide-react/dist/esm/icons/clock.js";
import Database from "lucide-react/dist/esm/icons/database.js";
import ExternalLink from "lucide-react/dist/esm/icons/external-link.js";
import Globe from "lucide-react/dist/esm/icons/globe.js";
import Image from "lucide-react/dist/esm/icons/image.js";
import Map from "lucide-react/dist/esm/icons/map.js";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw.js";
import Server from "lucide-react/dist/esm/icons/server.js";
import Shield from "lucide-react/dist/esm/icons/shield.js";
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js";
import TrendingUp from "lucide-react/dist/esm/icons/trending-up.js";
import Wifi from "lucide-react/dist/esm/icons/wifi.js";
import X from "lucide-react/dist/esm/icons/x.js";
import Zap from "lucide-react/dist/esm/icons/zap.js";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down.js";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right.js";
import Copy from "lucide-react/dist/esm/icons/copy.js";
import Gauge from "lucide-react/dist/esm/icons/gauge.js";
import Smartphone from "lucide-react/dist/esm/icons/smartphone.js";
import Monitor from "lucide-react/dist/esm/icons/monitor.js";
import Play from "lucide-react/dist/esm/icons/play.js";
import Loader2 from "lucide-react/dist/esm/icons/loader-2.js";
import ArrowUpRight from "lucide-react/dist/esm/icons/arrow-up-right.js";
import ArrowDownRight from "lucide-react/dist/esm/icons/arrow-down-right.js";
import Minus from "lucide-react/dist/esm/icons/minus.js";
import * as api from "../../services/api";
import type { InfraStats, PsiScanResult } from "../../services/api";
import { toast } from "sonner";
import { projectId } from "../../../../utils/supabase/info";
import { getValidAdminToken } from "./adminAuth";

// ─── Web Vital thresholds (Google's official values) ───
var VITAL_THRESHOLDS: Record<string, { good: number; poor: number; unit: string; label: string }> = {
  CLS: { good: 0.1, poor: 0.25, unit: "", label: "Cumulative Layout Shift" },
  INP: { good: 200, poor: 500, unit: "ms", label: "Interaction to Next Paint" },
  LCP: { good: 2500, poor: 4000, unit: "ms", label: "Largest Contentful Paint" },
  FCP: { good: 1800, poor: 3000, unit: "ms", label: "First Contentful Paint" },
  TTFB: { good: 800, poor: 1800, unit: "ms", label: "Time to First Byte" },
};

function ratingColor(rating: string): string {
  if (rating === "good") return "#16a34a";
  if (rating === "needs-improvement") return "#d97706";
  return "#dc2626";
}

function valueRating(name: string, value: number): string {
  var t = VITAL_THRESHOLDS[name];
  if (!t) return "unknown";
  if (value <= t.good) return "good";
  if (value <= t.poor) return "needs-improvement";
  return "poor";
}

function formatVitalValue(name: string, value: number): string {
  if (name === "CLS") return value.toFixed(3);
  return Math.round(value) + "ms";
}

function timeAgo(ts: number): string {
  var diff = Date.now() - ts;
  if (diff < 60000) return "agora";
  if (diff < 3600000) return Math.floor(diff / 60000) + "min atrás";
  if (diff < 86400000) return Math.floor(diff / 3600000) + "h atrás";
  return Math.floor(diff / 86400000) + "d atrás";
}

type Tab = "vitals" | "errors" | "seo" | "infra" | "psi";

export function AdminInfrastructure() {
  var [stats, setStats] = useState<InfraStats | null>(null);
  var [loading, setLoading] = useState(true);
  var [activeTab, setActiveTab] = useState<Tab>("vitals");
  var [expandedErrors, setExpandedErrors] = useState<Record<string, boolean>>({});

  // PSI state
  var [psiHistory, setPsiHistory] = useState<PsiScanResult[]>([]);
  var [psiLoading, setPsiLoading] = useState(false);
  var [psiScanning, setPsiScanning] = useState(false);
  var [psiStrategy, setPsiStrategy] = useState<"mobile" | "desktop">("mobile");
  var [psiUrl, setPsiUrl] = useState("https://www.autopecascarretao.com.br");
  var [psiSelectedScan, setPsiSelectedScan] = useState<PsiScanResult | null>(null);

  // Always fetch a fresh, auto-refreshed admin token before each API call
  async function getToken(): Promise<string> {
    var t = await getValidAdminToken();
    return t || "";
  }

  var loadStats = useCallback(function () {
    setLoading(true);
    getToken().then(function (token) {
      if (!token) { setLoading(false); return; }
      return api.getInfraStats(token);
    }).then(function (data) {
      if (data) setStats(data);
    }).catch(function (err) {
      console.error("[AdminInfrastructure] Load error:", err);
      toast.error("Erro ao carregar estatísticas de infraestrutura.");
    }).finally(function () {
      setLoading(false);
    });
  }, []);

  var loadPsiHistory = useCallback(function () {
    setPsiLoading(true);
    getToken().then(function (token) {
      if (!token) { setPsiLoading(false); return; }
      return api.getPsiHistory(token);
    }).then(function (data) {
      if (data) {
        setPsiHistory(data.history || []);
        if (data.history && data.history.length > 0) {
          setPsiSelectedScan(data.history[data.history.length - 1]);
        }
      }
    }).catch(function (err) {
      console.error("[AdminInfrastructure] PSI history error:", err);
    }).finally(function () {
      setPsiLoading(false);
    });
  }, []);

  useEffect(function () {
    loadStats();
    loadPsiHistory();
  }, [loadStats, loadPsiHistory]);

  function handleClearErrors() {
    if (!confirm("Limpar todo o log de erros persistido?")) return;
    getToken().then(function (token) {
      if (!token) return;
      return api.clearInfraErrors(token);
    }).then(function () {
      toast.success("Log de erros limpo.");
      loadStats();
    }).catch(function () {
      toast.error("Erro ao limpar log.");
    });
  }

  function handleClearVitals() {
    if (!confirm("Limpar todos os dados de Web Vitals?")) return;
    getToken().then(function (token) {
      if (!token) return;
      return api.clearInfraVitals(token);
    }).then(function () {
      toast.success("Dados de Web Vitals limpos.");
      loadStats();
    }).catch(function () {
      toast.error("Erro ao limpar vitals.");
    });
  }

  var sitemapUrl = "https://" + projectId + ".supabase.co/functions/v1/make-server-b7b07654/sitemap.xml";
  var robotsUrl = "https://" + projectId + ".supabase.co/functions/v1/make-server-b7b07654/robots.txt";

  // ─── Tab Navigation ───
  var tabs: Array<{ id: Tab; label: string; icon: typeof Activity }> = [
    { id: "vitals", label: "Web Vitals", icon: Zap },
    { id: "errors", label: "Monitoramento de Erros", icon: AlertTriangle },
    { id: "seo", label: "SEO & Sitemap", icon: Globe },
    { id: "infra", label: "Infraestrutura", icon: Server },
    { id: "psi", label: "PageSpeed Insights", icon: Gauge },
  ];

  // ─── Compute error counts ───
  var errorCount = 0;
  var recentErrorCount = 0;
  if (stats && stats.errorSummary) {
    var errorEntries = Object.values(stats.errorSummary);
    for (var ei = 0; ei < errorEntries.length; ei++) {
      errorCount += errorEntries[ei].count;
      if (errorEntries[ei].lastSeen > Date.now() - 3600000) recentErrorCount++;
    }
  }

  // ─── Compute vital score ───
  var vitalScore = "---";
  var vitalScoreColor = "#6b7280";
  if (stats && stats.vitalsP75 && stats.vitalsP75.metrics) {
    var metrics = stats.vitalsP75.metrics;
    var goodCount = 0;
    var totalCount = 0;
    var vitalKeys = Object.keys(metrics);
    for (var vk = 0; vk < vitalKeys.length; vk++) {
      var m = metrics[vitalKeys[vk]];
      totalCount += m.samples;
      goodCount += m.good;
    }
    if (totalCount > 0) {
      var pct = Math.round((goodCount / totalCount) * 100);
      vitalScore = pct + "%";
      vitalScoreColor = pct >= 75 ? "#16a34a" : pct >= 50 ? "#d97706" : "#dc2626";
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-gray-900 flex items-center gap-2" style={{ fontSize: "1.3rem", fontWeight: 700 }}>
            <Activity className="w-6 h-6 text-red-600" />
            Infraestrutura & SEO
          </h2>
          <p className="text-gray-500 mt-1" style={{ fontSize: "0.85rem" }}>
            Monitoramento de performance, erros, SEO e infraestrutura do site
          </p>
        </div>
        <button
          onClick={loadStats}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors disabled:opacity-50"
          style={{ fontSize: "0.85rem", fontWeight: 500 }}
        >
          <RefreshCw className={"w-4 h-4" + (loading ? " animate-spin" : "")} />
          Atualizar
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-amber-500" />
            <span className="text-gray-500" style={{ fontSize: "0.78rem", fontWeight: 500 }}>Core Web Vitals</span>
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: vitalScoreColor }}>{vitalScore}</div>
          <p className="text-gray-400" style={{ fontSize: "0.72rem" }}>avaliações "bom"</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span className="text-gray-500" style={{ fontSize: "0.78rem", fontWeight: 500 }}>Erros (total)</span>
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: errorCount > 0 ? "#dc2626" : "#16a34a" }}>{errorCount}</div>
          <p className="text-gray-400" style={{ fontSize: "0.72rem" }}>
            {recentErrorCount > 0 ? recentErrorCount + " na última hora" : "nenhum recente"}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Map className="w-4 h-4 text-blue-500" />
            <span className="text-gray-500" style={{ fontSize: "0.78rem", fontWeight: 500 }}>Sitemap URLs</span>
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#1d4ed8" }}>
            {stats ? (stats.sitemapStats.static + stats.sitemapStats.categories + stats.sitemapStats.brands) : "---"}
          </div>
          <p className="text-gray-400" style={{ fontSize: "0.72rem" }}>+ produtos dinâmicos</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-green-500" />
            <span className="text-gray-500" style={{ fontSize: "0.78rem", fontWeight: 500 }}>Rate Limit</span>
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#16a34a" }}>
            {stats ? stats.rateLimitStats.activeKeys : "---"}
          </div>
          <p className="text-gray-400" style={{ fontSize: "0.72rem" }}>
            IPs rastreados{stats && stats.rateLimitStats.failedLogins > 0 ? " | " + stats.rateLimitStats.failedLogins + " bloqueados" : ""}
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {tabs.map(function (tab) {
          var Icon = tab.icon;
          var isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={function () { setActiveTab(tab.id); }}
              className={"flex items-center gap-1.5 px-4 py-2 rounded-lg transition-all flex-1 justify-center " +
                (isActive ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700")}
              style={{ fontSize: "0.82rem", fontWeight: isActive ? 600 : 400 }}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Loading */}
      {loading && !stats && (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-3 border-red-200 border-t-red-600 rounded-full animate-spin" />
        </div>
      )}

      {/* ═══ Web Vitals Tab ═══ */}
      {activeTab === "vitals" && stats && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "1rem", fontWeight: 600 }}>
              <TrendingUp className="w-5 h-5 text-amber-500" />
              Core Web Vitals (Campo Real)
            </h3>
            <button
              onClick={handleClearVitals}
              className="flex items-center gap-1.5 px-3 py-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              style={{ fontSize: "0.78rem" }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Limpar dados
            </button>
          </div>

          {/* Vital Cards */}
          {stats.vitalsP75 && stats.vitalsP75.metrics && Object.keys(stats.vitalsP75.metrics).length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {["LCP", "INP", "CLS", "FCP", "TTFB"].map(function (name) {
                  var data = stats!.vitalsP75!.metrics[name];
                  if (!data) return null;
                  var threshold = VITAL_THRESHOLDS[name];
                  var rating = valueRating(name, data.p75);
                  var color = ratingColor(rating);
                  var totalSamples = data.good + data.needsImprovement + data.poor;
                  var goodPct = totalSamples > 0 ? Math.round((data.good / totalSamples) * 100) : 0;
                  var niPct = totalSamples > 0 ? Math.round((data.needsImprovement / totalSamples) * 100) : 0;
                  var poorPct = totalSamples > 0 ? Math.round((data.poor / totalSamples) * 100) : 0;

                  return (
                    <div key={name} className="bg-white rounded-xl border border-gray-200 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <span className="text-gray-800" style={{ fontSize: "0.95rem", fontWeight: 700 }}>{name}</span>
                          <p className="text-gray-400" style={{ fontSize: "0.7rem" }}>{threshold?.label}</p>
                        </div>
                        <div
                          className="px-2 py-0.5 rounded-full text-white"
                          style={{ fontSize: "0.7rem", fontWeight: 600, backgroundColor: color }}
                        >
                          {rating === "good" ? "Bom" : rating === "needs-improvement" ? "Melhorar" : "Ruim"}
                        </div>
                      </div>

                      <div className="mb-3">
                        <span style={{ fontSize: "1.6rem", fontWeight: 700, color: color }}>
                          {formatVitalValue(name, data.p75)}
                        </span>
                        <span className="text-gray-400 ml-1" style={{ fontSize: "0.72rem" }}>p75</span>
                        <span className="text-gray-400 mx-2">|</span>
                        <span className="text-gray-500" style={{ fontSize: "0.82rem" }}>
                          {formatVitalValue(name, data.median)}
                        </span>
                        <span className="text-gray-400 ml-1" style={{ fontSize: "0.72rem" }}>mediana</span>
                      </div>

                      {/* Distribution bar */}
                      <div className="flex rounded-full overflow-hidden h-2 mb-2">
                        {goodPct > 0 && <div style={{ width: goodPct + "%", backgroundColor: "#16a34a" }} />}
                        {niPct > 0 && <div style={{ width: niPct + "%", backgroundColor: "#d97706" }} />}
                        {poorPct > 0 && <div style={{ width: poorPct + "%", backgroundColor: "#dc2626" }} />}
                      </div>

                      <div className="flex justify-between" style={{ fontSize: "0.7rem" }}>
                        <span style={{ color: "#16a34a" }}>{goodPct}% bom</span>
                        <span style={{ color: "#d97706" }}>{niPct}% melhorar</span>
                        <span style={{ color: "#dc2626" }}>{poorPct}% ruim</span>
                      </div>

                      <p className="text-gray-400 mt-2" style={{ fontSize: "0.68rem" }}>
                        {data.samples} amostras | Limite bom: {threshold ? (name === "CLS" ? threshold.good : threshold.good + "ms") : ""}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Thresholds Reference */}
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                <h4 className="text-gray-600 mb-3" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                  Limites oficiais do Google (p75)
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {Object.entries(VITAL_THRESHOLDS).map(function ([name, t]) {
                    return (
                      <div key={name} className="text-center">
                        <div className="text-gray-700" style={{ fontSize: "0.78rem", fontWeight: 600 }}>{name}</div>
                        <div className="flex items-center gap-1 justify-center mt-1" style={{ fontSize: "0.7rem" }}>
                          <span style={{ color: "#16a34a" }}>{name === "CLS" ? t.good : t.good + "ms"}</span>
                          <span className="text-gray-300">|</span>
                          <span style={{ color: "#dc2626" }}>{name === "CLS" ? t.poor : t.poor + "ms"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <BarChart3 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500" style={{ fontSize: "0.9rem", fontWeight: 500 }}>
                Nenhum dado de Web Vitals coletado ainda
              </p>
              <p className="text-gray-400 mt-1" style={{ fontSize: "0.78rem" }}>
                Os dados aparecem automaticamente conforme usuários acessam o site. A coleta usa a biblioteca oficial <code>web-vitals</code>.
              </p>
            </div>
          )}

          {/* Recent samples */}
          {stats.vitalsData && stats.vitalsData.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <h4 className="text-gray-700" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                  Últimas amostras ({stats.vitalsData.length})
                </h4>
              </div>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full" style={{ fontSize: "0.75rem" }}>
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-left">
                      <th className="px-4 py-2 font-medium">Métrica</th>
                      <th className="px-4 py-2 font-medium">Valor</th>
                      <th className="px-4 py-2 font-medium">Rating</th>
                      <th className="px-4 py-2 font-medium">Página</th>
                      <th className="px-4 py-2 font-medium">Quando</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.vitalsData.slice().reverse().slice(0, 50).map(function (v, idx) {
                      return (
                        <tr key={idx} className="border-t border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-1.5 font-medium text-gray-700">{v.name}</td>
                          <td className="px-4 py-1.5" style={{ color: ratingColor(v.rating) }}>
                            {formatVitalValue(v.name, v.value)}
                          </td>
                          <td className="px-4 py-1.5">
                            <span
                              className="px-1.5 py-0.5 rounded text-white"
                              style={{ fontSize: "0.65rem", fontWeight: 600, backgroundColor: ratingColor(v.rating) }}
                            >
                              {v.rating === "good" ? "bom" : v.rating === "needs-improvement" ? "melhorar" : "ruim"}
                            </span>
                          </td>
                          <td className="px-4 py-1.5 text-gray-500 truncate max-w-[120px]">{v.url}</td>
                          <td className="px-4 py-1.5 text-gray-400">{timeAgo(v.timestamp)}</td>
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

      {/* ═══ Errors Tab ═══ */}
      {activeTab === "errors" && stats && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "1rem", fontWeight: 600 }}>
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Monitoramento de Erros (Backend Persistido)
            </h3>
            <button
              onClick={handleClearErrors}
              className="flex items-center gap-1.5 px-3 py-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              style={{ fontSize: "0.78rem" }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Limpar tudo
            </button>
          </div>

          {/* Error Summary */}
          {Object.keys(stats.errorSummary).length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <h4 className="text-gray-700" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                  Erros agrupados ({Object.keys(stats.errorSummary).length} tipos)
                </h4>
              </div>
              <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
                {Object.entries(stats.errorSummary)
                  .sort(function (a, b) { return b[1].count - a[1].count; })
                  .map(function ([msg, info]) {
                    var isExpanded = expandedErrors[msg] || false;
                    return (
                      <div key={msg} className="hover:bg-gray-50 transition-colors">
                        <button
                          onClick={function () {
                            setExpandedErrors(function (prev) {
                              var next = Object.assign({}, prev);
                              next[msg] = !prev[msg];
                              return next;
                            });
                          }}
                          className="w-full text-left px-4 py-3 flex items-start gap-3"
                        >
                          {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <p className="text-gray-700 truncate" style={{ fontSize: "0.8rem", fontWeight: 500 }}>
                              {msg}
                            </p>
                            <div className="flex items-center gap-3 mt-1" style={{ fontSize: "0.7rem" }}>
                              <span className="text-red-500 font-medium">{info.count}x</span>
                              <span className="text-gray-400">{info.type}</span>
                              <span className="text-gray-400">{timeAgo(info.lastSeen)}</span>
                            </div>
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="px-4 pb-3 pl-11">
                            <div className="bg-gray-50 rounded-lg p-3" style={{ fontSize: "0.72rem" }}>
                              <p className="text-gray-600 break-all">{msg}</p>
                              {/* Find matching recent log entries */}
                              {stats!.errorLog
                                .filter(function (e) { return e.message.substring(0, 100) === msg; })
                                .slice(-3)
                                .map(function (e, i) {
                                  return (
                                    <div key={i} className="mt-2 pt-2 border-t border-gray-200">
                                      <p className="text-gray-400">URL: {e.url}</p>
                                      <p className="text-gray-400">UA: {e.userAgent.substring(0, 80)}...</p>
                                      {e.stack && (
                                        <pre className="text-gray-500 mt-1 whitespace-pre-wrap break-all" style={{ fontSize: "0.68rem" }}>
                                          {e.stack.substring(0, 300)}
                                        </pre>
                                      )}
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <Check className="w-10 h-10 text-green-400 mx-auto mb-3" />
              <p className="text-gray-500" style={{ fontSize: "0.9rem", fontWeight: 500 }}>
                Nenhum erro registrado
              </p>
              <p className="text-gray-400 mt-1" style={{ fontSize: "0.78rem" }}>
                Erros do frontend são coletados automaticamente e enviados ao backend para persistência.
              </p>
            </div>
          )}

          {/* Recent Error Log */}
          {stats.errorLog && stats.errorLog.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <h4 className="text-gray-700" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                  Log recente ({stats.errorLog.length} entradas)
                </h4>
              </div>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full" style={{ fontSize: "0.73rem" }}>
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-left">
                      <th className="px-4 py-2 font-medium">Tipo</th>
                      <th className="px-4 py-2 font-medium">Mensagem</th>
                      <th className="px-4 py-2 font-medium">Página</th>
                      <th className="px-4 py-2 font-medium">Quando</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.errorLog.slice().reverse().slice(0, 30).map(function (e, idx) {
                      return (
                        <tr key={idx} className="border-t border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-1.5">
                            <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-600" style={{ fontSize: "0.65rem", fontWeight: 600 }}>
                              {e.type}
                            </span>
                          </td>
                          <td className="px-4 py-1.5 text-gray-700 truncate max-w-[250px]" title={e.message}>
                            {e.message.substring(0, 80)}
                          </td>
                          <td className="px-4 py-1.5 text-gray-500">{e.url}</td>
                          <td className="px-4 py-1.5 text-gray-400">{timeAgo(e.timestamp)}</td>
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

      {/* ═══ SEO Tab ═══ */}
      {activeTab === "seo" && stats && (
        <div className="space-y-4">
          <h3 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "1rem", fontWeight: 600 }}>
            <Globe className="w-5 h-5 text-blue-500" />
            SEO & Sitemap
          </h3>

          {/* Sitemap Stats */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h4 className="text-gray-700 mb-4" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
              Sitemap Dinâmico
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <div className="text-blue-700" style={{ fontSize: "1.3rem", fontWeight: 700 }}>{stats.sitemapStats.static}</div>
                <div className="text-blue-500" style={{ fontSize: "0.72rem" }}>Páginas estáticas</div>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <div className="text-green-700" style={{ fontSize: "1.3rem", fontWeight: 700 }}>{stats.sitemapStats.categories}</div>
                <div className="text-green-500" style={{ fontSize: "0.72rem" }}>Categorias</div>
              </div>
              <div className="bg-purple-50 rounded-lg p-3 text-center">
                <div className="text-purple-700" style={{ fontSize: "1.3rem", fontWeight: 700 }}>{stats.sitemapStats.brands}</div>
                <div className="text-purple-500" style={{ fontSize: "0.72rem" }}>Marcas</div>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 text-center">
                <div className="text-amber-700" style={{ fontSize: "1.3rem", fontWeight: 700 }}>dinâmico</div>
                <div className="text-amber-500" style={{ fontSize: "0.72rem" }}>Produtos</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Map className="w-4 h-4 text-blue-500" />
                  <span className="text-gray-700" style={{ fontSize: "0.82rem", fontWeight: 500 }}>sitemap.xml</span>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={sitemapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-600 hover:text-blue-700"
                    style={{ fontSize: "0.75rem" }}
                  >
                    Abrir <ExternalLink className="w-3 h-3" />
                  </a>
                  <button
                    onClick={function () {
                      navigator.clipboard.writeText(sitemapUrl).then(function () {
                        toast.success("URL copiada!");
                      }).catch(function () {
                        toast.error("Erro ao copiar.");
                      });
                    }}
                    className="p-1 hover:bg-gray-200 rounded"
                    title="Copiar URL"
                  >
                    <Copy className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-green-500" />
                  <span className="text-gray-700" style={{ fontSize: "0.82rem", fontWeight: 500 }}>robots.txt</span>
                </div>
                <a
                  href={robotsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-blue-600 hover:text-blue-700"
                  style={{ fontSize: "0.75rem" }}
                >
                  Abrir <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>

          {/* Google Search Console Instructions */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h4 className="text-gray-700 mb-3 flex items-center gap-2" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
              <Globe className="w-4 h-4 text-blue-500" />
              Google Search Console — Configuração
            </h4>
            <div className="space-y-3" style={{ fontSize: "0.82rem" }}>
              <div className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center flex-shrink-0" style={{ fontSize: "0.75rem", fontWeight: 700 }}>1</div>
                <div>
                  <p className="text-gray-700 font-medium">Acesse o Google Search Console</p>
                  <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline" style={{ fontSize: "0.78rem" }}>
                    search.google.com/search-console
                  </a>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center flex-shrink-0" style={{ fontSize: "0.75rem", fontWeight: 700 }}>2</div>
                <div>
                  <p className="text-gray-700 font-medium">Adicione a propriedade do site</p>
                  <p className="text-gray-500" style={{ fontSize: "0.78rem" }}>Use "Prefixo do URL" com <code>https://www.autopecascarretao.com.br</code></p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center flex-shrink-0" style={{ fontSize: "0.75rem", fontWeight: 700 }}>3</div>
                <div>
                  <p className="text-gray-700 font-medium">Verifique a propriedade</p>
                  <p className="text-gray-500" style={{ fontSize: "0.78rem" }}>Recomendado: verificação via Google Analytics (já configurado) ou tag HTML</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center flex-shrink-0" style={{ fontSize: "0.75rem", fontWeight: 700 }}>4</div>
                <div>
                  <p className="text-gray-700 font-medium">Submeta o sitemap</p>
                  <p className="text-gray-500" style={{ fontSize: "0.78rem" }}>
                    Em "Sitemaps", adicione a URL:
                  </p>
                  <code className="bg-gray-100 px-2 py-1 rounded text-gray-700 block mt-1 break-all" style={{ fontSize: "0.72rem" }}>
                    {sitemapUrl}
                  </code>
                </div>
              </div>
            </div>
          </div>

          {/* SEO Checklist */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h4 className="text-gray-700 mb-3" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
              Checklist SEO Implementado
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" style={{ fontSize: "0.8rem" }}>
              {[
                "Meta description dinâmica",
                "Open Graph tags (og:title, og:description)",
                "JSON-LD AutoPartsStore",
                "JSON-LD WebSite + SearchAction",
                "Sitemap dinâmico (produtos + categorias + marcas)",
                "robots.txt com regras corretas",
                "Tag lang=pt-BR no HTML",
                "Theme color (#dc2626)",
                "Breadcrumbs estruturados (JSON-LD)",
                "Canonical URLs",
                "Meta robots: index, follow",
                "Preconnect / DNS-prefetch",
                "Core Web Vitals (campo real)",
                "Imagens com loading=lazy",
                "Fonte self-hosted (Inter Variable)",
                "Pre-render skeleton shell",
              ].map(function (item) {
                return (
                  <div key={item} className="flex items-center gap-2 py-1">
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span className="text-gray-600">{item}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Infrastructure Tab ═══ */}
      {activeTab === "infra" && stats && (
        <div className="space-y-4">
          <h3 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "1rem", fontWeight: 600 }}>
            <Server className="w-5 h-5 text-purple-500" />
            Infraestrutura
          </h3>

          {/* Rate Limiting */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h4 className="text-gray-700 mb-3 flex items-center gap-2" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
              <Shield className="w-4 h-4 text-green-500" />
              Rate Limiting & Proteção contra Brute-Force
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div className="bg-green-50 rounded-lg p-4">
                <div className="text-green-800" style={{ fontSize: "1.3rem", fontWeight: 700 }}>
                  {stats.rateLimitStats.activeKeys}
                </div>
                <div className="text-green-600" style={{ fontSize: "0.78rem" }}>IPs rastreados ativos</div>
              </div>
              <div className="bg-red-50 rounded-lg p-4">
                <div className="text-red-800" style={{ fontSize: "1.3rem", fontWeight: 700 }}>
                  {stats.rateLimitStats.failedLogins}
                </div>
                <div className="text-red-600" style={{ fontSize: "0.78rem" }}>Emails com tentativas de login falhas</div>
              </div>
            </div>

            <h5 className="text-gray-600 mb-2" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
              Rotas protegidas por rate limit:
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2" style={{ fontSize: "0.75rem" }}>
              {[
                { route: "Login/Signup", limit: "6-10/min" },
                { route: "Forgot Password", limit: "3-5/min" },
                { route: "Consulta de frete", limit: "30/min" },
                { route: "PIX / Boleto / Cartão", limit: "5/min" },
                { route: "Criar pedido SIGE", limit: "5/min" },
                { route: "Validar cupom", limit: "30/min" },
                { route: "Usar cupom", limit: "10/min" },
                { route: "LGPD request", limit: "5/min" },
                { route: "Review submit", limit: "10/min" },
                { route: "Review helpful", limit: "20/min" },
                { route: "CNPJ lookup", limit: "10/min" },
                { route: "Exit Intent lead", limit: "5/min" },
                { route: "Web Vitals report", limit: "30/min" },
                { route: "Error report", limit: "20/min" },
                { route: "Image CDN proxy", limit: "100/min" },
                { route: "Webhooks PagHiper/MP", limit: "60/min" },
                { route: "Global (todas rotas)", limit: "120/min" },
                { route: "Brute-force lockout", limit: "5/10/15 falhas" },
              ].map(function (item) {
                return (
                  <div key={item.route} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-gray-600">{item.route}</span>
                    <span className="text-gray-800 font-mono font-medium">{item.limit}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Image CDN */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h4 className="text-gray-700 mb-3 flex items-center gap-2" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
              <Image className="w-4 h-4 text-indigo-500" />
              CDN de Imagens
            </h4>
            <div className="space-y-3" style={{ fontSize: "0.82rem" }}>
              <div className="flex items-start gap-3">
                <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-gray-700 font-medium">Supabase Storage Render API</p>
                  <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>
                    Redimensionamento server-side via <code>/render/image/public/</code> com srcset responsivo
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-gray-700 font-medium">Image CDN Proxy</p>
                  <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>
                    Proxy para imagens externas (SIGE) com cache agressivo: <code>max-age=30d, immutable</code>
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-gray-700 font-medium">Lazy loading nativo</p>
                  <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>
                    Todas as imagens usam <code>loading="lazy"</code> e <code>decoding="async"</code>
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-gray-700 font-medium">Preconnect para Supabase</p>
                  <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>
                    DNS-prefetch + preconnect (CORS e no-CORS) para minimizar latência de imagens
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Error Monitoring Architecture */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h4 className="text-gray-700 mb-3 flex items-center gap-2" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
              <Wifi className="w-4 h-4 text-orange-500" />
              Monitoramento de Erros — Arquitetura
            </h4>
            <div className="space-y-2" style={{ fontSize: "0.8rem" }}>
              <div className="flex items-center gap-2 bg-orange-50 rounded-lg px-4 py-3">
                <div className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0" />
                <span className="text-gray-700">
                  <strong>Camada 1:</strong> GlobalErrorCollector (in-memory) — captura runtime, promise, resource, console.error
                </span>
              </div>
              <div className="flex items-center gap-2 bg-blue-50 rounded-lg px-4 py-3">
                <div className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                <span className="text-gray-700">
                  <strong>Camada 2:</strong> Backend /error-report — persistência no KV store (últimos 300 erros)
                </span>
              </div>
              <div className="flex items-center gap-2 bg-purple-50 rounded-lg px-4 py-3">
                <div className="w-2 h-2 rounded-full bg-purple-400 flex-shrink-0" />
                <span className="text-gray-700">
                  <strong>Camada 3:</strong> Error Summary — agrupamento por mensagem com contadores e lastSeen
                </span>
              </div>
              <div className="flex items-center gap-2 bg-green-50 rounded-lg px-4 py-3">
                <div className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                <span className="text-gray-700">
                  <strong>Transporte:</strong> sendBeacon (sobrevive a page unload) + fetch fallback + debounce 5s
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ PageSpeed Insights Tab ═══ */}
      {activeTab === "psi" && (
        <PsiTab
          getToken={getToken}
          psiHistory={psiHistory}
          setPsiHistory={setPsiHistory}
          psiScanning={psiScanning}
          setPsiScanning={setPsiScanning}
          psiSelectedScan={psiSelectedScan}
          setPsiSelectedScan={setPsiSelectedScan}
          psiStrategy={psiStrategy}
          setPsiStrategy={setPsiStrategy}
          psiUrl={psiUrl}
          setPsiUrl={setPsiUrl}
          psiLoading={psiLoading}
          loadPsiHistory={loadPsiHistory}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// PSI Tab — Full PageSpeed Insights dashboard
// ═══════════════════════════════════════════════════════════════════════

function scoreColor(score: number): string {
  if (score >= 90) return "#16a34a";
  if (score >= 50) return "#d97706";
  return "#dc2626";
}

var CATEGORY_LABELS: Record<string, string> = {
  "performance": "Performance",
  "seo": "SEO",
  "accessibility": "Acessibilidade",
  "best-practices": "Boas Práticas",
};

var LAB_METRIC_LABELS: Record<string, string> = {
  "first-contentful-paint": "First Contentful Paint",
  "largest-contentful-paint": "Largest Contentful Paint",
  "total-blocking-time": "Total Blocking Time",
  "cumulative-layout-shift": "Cumulative Layout Shift",
  "speed-index": "Speed Index",
  "interactive": "Time to Interactive",
  "server-response-time": "Server Response Time",
};

function ScoreGauge({ score, label, size }: { score: number; label: string; size?: number }) {
  var s = size || 88;
  var r = (s - 10) / 2;
  var circ = 2 * Math.PI * r;
  var progress = (score / 100) * circ;
  var color = scoreColor(score);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: s, height: s }}>
        <svg width={s} height={s} className="transform -rotate-90">
          <circle cx={s / 2} cy={s / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={4} />
          <circle
            cx={s / 2} cy={s / 2} r={r} fill="none"
            stroke={color} strokeWidth={4}
            strokeDasharray={circ}
            strokeDashoffset={circ - progress}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.8s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span style={{ fontSize: s > 70 ? "1.2rem" : "1rem", fontWeight: 700, color: color }}>{score}</span>
        </div>
      </div>
      <span className="text-gray-600 text-center" style={{ fontSize: "0.72rem", fontWeight: 500 }}>{label}</span>
    </div>
  );
}

function PsiTab({
  getToken, psiHistory, setPsiHistory, psiScanning, setPsiScanning,
  psiSelectedScan, setPsiSelectedScan, psiStrategy, setPsiStrategy,
  psiUrl, setPsiUrl, psiLoading, loadPsiHistory,
}: {
  getToken: () => Promise<string>;
  psiHistory: PsiScanResult[];
  setPsiHistory: React.Dispatch<React.SetStateAction<PsiScanResult[]>>;
  psiScanning: boolean;
  setPsiScanning: React.Dispatch<React.SetStateAction<boolean>>;
  psiSelectedScan: PsiScanResult | null;
  setPsiSelectedScan: React.Dispatch<React.SetStateAction<PsiScanResult | null>>;
  psiStrategy: "mobile" | "desktop";
  setPsiStrategy: React.Dispatch<React.SetStateAction<"mobile" | "desktop">>;
  psiUrl: string;
  setPsiUrl: React.Dispatch<React.SetStateAction<string>>;
  psiLoading: boolean;
  loadPsiHistory: () => void;
}) {
  function handleScan() {
    if (!psiUrl.trim()) { toast.error("Informe a URL para análise."); return; }
    setPsiScanning(true);
    toast.info("Iniciando análise Lighthouse (" + psiStrategy + ")... Pode levar até 2 minutos.");
    getToken().then(function (token) {
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");
      return api.runPsiScan(token, { url: psiUrl, strategy: psiStrategy });
    })
      .then(function (data) {
        if (data.ok && data.scan) {
          setPsiHistory(function (prev) { return prev.concat([data.scan]); });
          setPsiSelectedScan(data.scan);
          toast.success("Análise concluída! Performance: " + (data.scan.scores.performance || "N/A"));
        }
      })
      .catch(function (err: any) {
        console.error("[PSI] Scan error:", err);
        toast.error("Erro: " + (err.message || "Erro desconhecido"));
      })
      .finally(function () { setPsiScanning(false); });
  }

  function handleClearHistory() {
    if (!confirm("Limpar todo o histórico de análises PageSpeed?")) return;
    getToken().then(function (token) {
      if (!token) return;
      return api.clearPsiHistory(token);
    }).then(function () {
      setPsiHistory([]); setPsiSelectedScan(null); toast.success("Histórico limpo.");
    }).catch(function () { toast.error("Erro ao limpar histórico."); });
  }

  var scan = psiSelectedScan;
  var perfTrend: "up" | "down" | "stable" | null = null;
  if (psiHistory.length >= 2 && scan) {
    var sameStrategy = psiHistory.filter(function (h) { return h.strategy === scan!.strategy; });
    if (sameStrategy.length >= 2) {
      var prev = sameStrategy[sameStrategy.length - 2];
      var prevPerf = prev.scores.performance || 0;
      var currPerf = scan.scores.performance || 0;
      if (currPerf > prevPerf + 2) perfTrend = "up";
      else if (currPerf < prevPerf - 2) perfTrend = "down";
      else perfTrend = "stable";
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "1rem", fontWeight: 600 }}>
          <Gauge className="w-5 h-5 text-blue-500" />
          Google PageSpeed Insights
        </h3>
        <div className="flex items-center gap-2">
          {psiHistory.length > 0 && (
            <button onClick={handleClearHistory} className="flex items-center gap-1.5 px-3 py-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" style={{ fontSize: "0.78rem" }}>
              <Trash2 className="w-3.5 h-3.5" /> Limpar histórico
            </button>
          )}
          <button onClick={loadPsiHistory} disabled={psiLoading} className="flex items-center gap-1.5 px-3 py-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors" style={{ fontSize: "0.78rem" }}>
            <RefreshCw className={"w-3.5 h-3.5" + (psiLoading ? " animate-spin" : "")} />
          </button>
        </div>
      </div>

      {/* Scan Control Bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="text-gray-500 block mb-1" style={{ fontSize: "0.72rem", fontWeight: 600 }}>URL</label>
            <input type="text" value={psiUrl} onChange={function (e) { setPsiUrl(e.target.value); }}
              className="w-full bg-gray-50 border border-gray-200 px-3 py-2 rounded-lg text-gray-700 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
              style={{ fontSize: "0.82rem" }} placeholder="https://www.autopecascarretao.com.br" />
          </div>
          <div>
            <label className="text-gray-500 block mb-1" style={{ fontSize: "0.72rem", fontWeight: 600 }}>Dispositivo</label>
            <div className="flex rounded-lg overflow-hidden border border-gray-200">
              <button onClick={function () { setPsiStrategy("mobile"); }}
                className={"flex items-center gap-1.5 px-3 py-2 transition-colors " + (psiStrategy === "mobile" ? "bg-blue-500 text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100")}
                style={{ fontSize: "0.78rem", fontWeight: 500 }}>
                <Smartphone className="w-3.5 h-3.5" /> Mobile
              </button>
              <button onClick={function () { setPsiStrategy("desktop"); }}
                className={"flex items-center gap-1.5 px-3 py-2 transition-colors " + (psiStrategy === "desktop" ? "bg-blue-500 text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100")}
                style={{ fontSize: "0.78rem", fontWeight: 500 }}>
                <Monitor className="w-3.5 h-3.5" /> Desktop
              </button>
            </div>
          </div>
          <button onClick={handleScan} disabled={psiScanning}
            className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-red-700 via-red-600 to-red-500 text-white rounded-lg hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed transition-all"
            style={{ fontSize: "0.85rem", fontWeight: 600 }}>
            {psiScanning ? (<><Loader2 className="w-4 h-4 animate-spin" /> Analisando...</>) : (<><Play className="w-4 h-4" /> Analisar</>)}
          </button>
        </div>
        {psiScanning && (
          <div className="mt-3 flex items-center gap-2 text-gray-500" style={{ fontSize: "0.78rem" }}>
            <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
            Executando Lighthouse... A análise pode levar até 2 minutos.
          </div>
        )}
      </div>

      {!scan && !psiLoading && psiHistory.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <Gauge className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500" style={{ fontSize: "0.9rem", fontWeight: 500 }}>Nenhuma análise realizada ainda</p>
          <p className="text-gray-400 mt-1" style={{ fontSize: "0.78rem" }}>
            Clique em "Analisar" para executar a primeira auditoria Lighthouse via Google PageSpeed Insights API.
          </p>
        </div>
      )}

      {scan && (
        <>
          {/* Score Gauges */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h4 className="text-gray-700" style={{ fontSize: "0.9rem", fontWeight: 600 }}>Pontuações Lighthouse</h4>
                <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full" style={{ fontSize: "0.68rem", fontWeight: 500 }}>
                  {scan.strategy === "mobile" ? "Mobile" : "Desktop"}
                </span>
                {perfTrend && (
                  <span className="flex items-center gap-0.5" style={{ fontSize: "0.72rem" }}>
                    {perfTrend === "up" && <><ArrowUpRight className="w-3.5 h-3.5 text-green-500" /><span className="text-green-600">melhorou</span></>}
                    {perfTrend === "down" && <><ArrowDownRight className="w-3.5 h-3.5 text-red-500" /><span className="text-red-600">piorou</span></>}
                    {perfTrend === "stable" && <><Minus className="w-3.5 h-3.5 text-gray-400" /><span className="text-gray-500">estável</span></>}
                  </span>
                )}
              </div>
              <div className="text-gray-400" style={{ fontSize: "0.72rem" }}>{timeAgo(scan.timestamp)} | v{scan.lighthouseVersion}</div>
            </div>
            <div className="flex flex-wrap justify-center gap-6 sm:gap-8">
              {Object.entries(scan.scores).map(function ([cat, score]) {
                return <ScoreGauge key={cat} score={score} label={CATEGORY_LABELS[cat] || cat} />;
              })}
            </div>
          </div>

          {/* Lab Metrics */}
          {Object.keys(scan.labMetrics).length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h4 className="text-gray-700 mb-3" style={{ fontSize: "0.9rem", fontWeight: 600 }}>Métricas de Laboratório</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Object.entries(scan.labMetrics).map(function ([key, metric]) {
                  if (key === "render-blocking-resources") return null;
                  var mScore = metric.score;
                  var mColor = mScore >= 0.9 ? "#16a34a" : mScore >= 0.5 ? "#d97706" : "#dc2626";
                  return (
                    <div key={key} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                      <p className="text-gray-700 truncate min-w-0" style={{ fontSize: "0.78rem", fontWeight: 500 }}>{LAB_METRIC_LABELS[key] || key}</p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="font-mono" style={{ fontSize: "0.82rem", fontWeight: 700, color: mColor }}>
                          {metric.displayValue || (key === "cumulative-layout-shift" ? metric.value.toFixed(3) : Math.round(metric.value) + "ms")}
                        </span>
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: mColor }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Field Data (CrUX) */}
          {Object.keys(scan.fieldMetrics).length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h4 className="text-gray-700 mb-1" style={{ fontSize: "0.9rem", fontWeight: 600 }}>Dados de Campo (CrUX)</h4>
              <p className="text-gray-400 mb-3" style={{ fontSize: "0.72rem" }}>
                Dados reais do Chrome | Status: {scan.overallCategory === "FAST" ? "Rápido" : scan.overallCategory === "AVERAGE" ? "Médio" : scan.overallCategory === "SLOW" ? "Lento" : "Sem dados suficientes"}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.entries(scan.fieldMetrics).map(function ([key, fm]) {
                  var catColor = fm.category === "FAST" ? "#16a34a" : fm.category === "AVERAGE" ? "#d97706" : fm.category === "SLOW" ? "#dc2626" : "#6b7280";
                  return (
                    <div key={key} className="bg-gray-50 rounded-lg px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-600" style={{ fontSize: "0.75rem", fontWeight: 500 }}>{key.replace(/_/g, " ")}</span>
                        <span className="px-1.5 py-0.5 rounded text-white" style={{ fontSize: "0.65rem", fontWeight: 600, backgroundColor: catColor }}>
                          {fm.category === "FAST" ? "Rápido" : fm.category === "AVERAGE" ? "Médio" : fm.category === "SLOW" ? "Lento" : "N/A"}
                        </span>
                      </div>
                      <span className="font-mono" style={{ fontSize: "0.9rem", fontWeight: 700, color: catColor }}>p75: {fm.percentile}</span>
                      {fm.distributions && fm.distributions.length === 3 && (
                        <div className="flex rounded-full overflow-hidden h-1.5 mt-2">
                          <div style={{ width: Math.round(fm.distributions[0].proportion * 100) + "%", backgroundColor: "#16a34a" }} />
                          <div style={{ width: Math.round(fm.distributions[1].proportion * 100) + "%", backgroundColor: "#d97706" }} />
                          <div style={{ width: Math.round(fm.distributions[2].proportion * 100) + "%", backgroundColor: "#dc2626" }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Opportunities */}
          {scan.opportunities.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h4 className="text-gray-700 mb-3 flex items-center gap-2" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                <TrendingUp className="w-4 h-4 text-amber-500" /> Oportunidades de Melhoria
              </h4>
              <div className="space-y-2">
                {scan.opportunities.map(function (opp) {
                  var oppColor = opp.score >= 0.5 ? "#d97706" : "#dc2626";
                  return (
                    <div key={opp.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: oppColor }} />
                        <span className="text-gray-700 truncate" style={{ fontSize: "0.78rem" }}>{opp.title}</span>
                      </div>
                      <span className="text-amber-700 font-mono flex-shrink-0 ml-3" style={{ fontSize: "0.78rem", fontWeight: 600 }}>-{opp.savings}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Diagnostics */}
          {scan.diagnostics.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h4 className="text-gray-700 mb-3 flex items-center gap-2" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                <AlertTriangle className="w-4 h-4 text-orange-500" /> Diagnósticos
              </h4>
              <div className="space-y-2">
                {scan.diagnostics.map(function (diag) {
                  var diagColor = diag.score >= 0.5 ? "#d97706" : "#dc2626";
                  return (
                    <div key={diag.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: diagColor }} />
                        <span className="text-gray-700 truncate" style={{ fontSize: "0.78rem" }}>{diag.title}</span>
                      </div>
                      {diag.displayValue && <span className="text-gray-500 font-mono flex-shrink-0 ml-3" style={{ fontSize: "0.72rem" }}>{diag.displayValue}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* History Table */}
      {psiHistory.length > 1 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h4 className="text-gray-700" style={{ fontSize: "0.85rem", fontWeight: 600 }}>Histórico de Scans ({psiHistory.length})</h4>
          </div>
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full" style={{ fontSize: "0.75rem" }}>
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-left">
                  <th className="px-4 py-2 font-medium">Quando</th>
                  <th className="px-4 py-2 font-medium">Dispositivo</th>
                  <th className="px-4 py-2 font-medium text-center">Perf</th>
                  <th className="px-4 py-2 font-medium text-center">SEO</th>
                  <th className="px-4 py-2 font-medium text-center">A11y</th>
                  <th className="px-4 py-2 font-medium text-center">BP</th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {psiHistory.slice().reverse().map(function (h) {
                  var isSelected = scan && scan.id === h.id;
                  return (
                    <tr key={h.id} className={"border-t border-gray-50 hover:bg-gray-50 " + (isSelected ? "bg-blue-50" : "")}>
                      <td className="px-4 py-2 text-gray-600">{timeAgo(h.timestamp)}</td>
                      <td className="px-4 py-2 text-gray-500">
                        {h.strategy === "mobile" ? <Smartphone className="w-3.5 h-3.5 inline" /> : <Monitor className="w-3.5 h-3.5 inline" />}
                        {" "}{h.strategy}
                      </td>
                      {["performance", "seo", "accessibility", "best-practices"].map(function (cat) {
                        var s = h.scores[cat];
                        return (
                          <td key={cat} className="px-4 py-2 text-center">
                            {s != null ? <span className="font-mono font-bold" style={{ color: scoreColor(s) }}>{s}</span> : <span className="text-gray-300">--</span>}
                          </td>
                        );
                      })}
                      <td className="px-4 py-2">
                        <button onClick={function () { setPsiSelectedScan(h); }}
                          className={"px-2 py-1 rounded text-xs " + (isSelected ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}>
                          {isSelected ? "Ativo" : "Ver"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Performance Trend Mini-Chart */}
      {psiHistory.length >= 3 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h4 className="text-gray-700 mb-3" style={{ fontSize: "0.9rem", fontWeight: 600 }}>Evolução — Performance Score</h4>
          <div className="flex items-end gap-1" style={{ height: 80 }}>
            {psiHistory.slice(-20).map(function (h) {
              var perf = h.scores.performance || 0;
              var barH = Math.max(4, (perf / 100) * 70);
              return (
                <div key={h.id} className="flex flex-col items-center flex-1 min-w-0">
                  <div className="w-full rounded-t transition-all cursor-pointer"
                    style={{ height: barH, backgroundColor: scoreColor(perf), opacity: scan && scan.id === h.id ? 1 : 0.6, minWidth: 6, maxWidth: 28 }}
                    onClick={function () { setPsiSelectedScan(h); }}
                    title={perf + " | " + h.strategy + " | " + timeAgo(h.timestamp)} />
                  <span className="text-gray-400 mt-0.5 hidden sm:block" style={{ fontSize: "0.55rem" }}>{perf}</span>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-gray-400" style={{ fontSize: "0.6rem" }}>{psiHistory.length > 20 ? "últimos 20" : psiHistory.length + " scans"}</span>
            <div className="flex gap-3" style={{ fontSize: "0.6rem" }}>
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#16a34a" }} /> 90+</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#d97706" }} /> 50-89</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#dc2626" }} /> 0-49</span>
            </div>
          </div>
        </div>
      )}

      {/* PSI Info */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
        <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>
          <strong>Como funciona:</strong> A API PageSpeed Insights executa o Lighthouse remotamente nos servidores do Google,
          analisando a URL informada. Inclui dados de laboratório (simulados) e, quando disponíveis, dados de campo (CrUX)
          de usuários reais do Chrome. Os resultados são persistidos no backend para acompanhar a evolução.
          {" "}
          <a href={"https://pagespeed.web.dev/analysis?url=" + encodeURIComponent(psiUrl)} target="_blank" rel="noopener noreferrer"
            className="text-blue-600 hover:underline inline-flex items-center gap-0.5">
            Abrir no PageSpeed.web.dev <ExternalLink className="w-3 h-3 inline" />
          </a>
        </p>
      </div>
    </div>
  );
}