import { useState, useCallback } from "react";
import {
  Stethoscope,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Search,
  ClipboardCopy,
  RotateCcw,
  Wrench,
  Package,
  User,
  DollarSign,
  Link2,
  Database,
  Shield,
  FileText,
  Scissors,
  Info,
} from "lucide-react";
import { getValidAdminToken } from "./adminAuth";
import * as api from "../../services/api";

interface Props {
  isConnected: boolean;
}

const STATUS_ICON: Record<string, typeof CheckCircle2> = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  fail: XCircle,
  info: Info,
};

const STATUS_COLOR: Record<string, string> = {
  ok: "text-green-600",
  warn: "text-amber-500",
  fail: "text-red-500",
  info: "text-blue-500",
};

const STATUS_BG: Record<string, string> = {
  ok: "bg-green-50 border-green-200",
  warn: "bg-amber-50 border-amber-200",
  fail: "bg-red-50 border-red-200",
  info: "bg-blue-50 border-blue-200",
};

const STEP_ICON: Record<string, typeof Package> = {
  sige_connection: Shield,
  sige_auth_test: Shield,
  find_test_sku: Search,
  kv_sige_map: Database,
  product_search: Package,
  sku_split_search: Scissors,
  reference_by_id: Link2,
  reference_by_sku_direct: Link2,
  reference_direct: Link2,
  global_reference_endpoint: Link2,
  price_resolution: DollarSign,
  customer_validation: User,
  resolveItemPrice_test: DollarSign,
  dry_run_payload: FileText,
};

// Helper: find icon for step name (supports dynamic names like "reference_direct_103716")
function getStepIcon(name: string): typeof Package {
  if (STEP_ICON[name]) return STEP_ICON[name];
  // Check prefix matches for dynamic step names
  for (const [key, icon] of Object.entries(STEP_ICON)) {
    if (name.startsWith(key)) return icon;
  }
  return FileText;
}

export function SigeOrderDiagnoseModule({ isConnected }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [sku, setSku] = useState("");
  const [codCliente, setCodCliente] = useState("");
  const [verbose, setVerbose] = useState(false);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState("");
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

  const runDiagnose = useCallback(async () => {
    setRunning(true);
    setError("");
    setReport(null);
    setExpandedSteps({});
    try {
      const token = await getValidAdminToken();
      if (!token) { setError("Sessão expirada. Faça login novamente."); return; }

      const result = await api.sigeDiagnoseOrder(token, {
        sku: sku.trim() || undefined,
        codCliente: codCliente.trim() || undefined,
        verbose,
      });
      setReport(result);

      // Auto-expand failures and warnings
      const autoExpand: Record<string, boolean> = {};
      (result.steps || []).forEach((s: any) => {
        if (s.status === "fail" || s.status === "warn") {
          autoExpand[s.name] = true;
        }
      });
      setExpandedSteps(autoExpand);
    } catch (e: any) {
      console.error("Diagnose error:", e);
      setError(e.message || "Erro ao executar diagnostico");
    } finally {
      setRunning(false);
    }
  }, [sku, codCliente, verbose]);

  const toggleStep = (name: string) => {
    setExpandedSteps(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const copyReport = () => {
    if (!report) return;
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors cursor-pointer"
      >
        <h3 className="flex items-center gap-2" style={{ fontSize: "1rem", fontWeight: 600, color: "#1f2937" }}>
          <Stethoscope className="w-5 h-5 text-violet-500" />
          Diagnóstico de Pedido
          <span className="px-2 py-0.5 bg-violet-50 text-violet-600 rounded-full" style={{ fontSize: "0.68rem", fontWeight: 600 }}>
            dry-run
          </span>
        </h3>
        {expanded
          ? <ChevronDown className="w-4.5 h-4.5 text-gray-400" />
          : <ChevronRight className="w-4.5 h-4.5 text-gray-400" />
        }
      </button>

      {expanded && (
        <div className="border-t border-gray-100 p-5 space-y-4">
          {/* Description */}
          <p className="text-gray-500" style={{ fontSize: "0.82rem", lineHeight: 1.5 }}>
            Testa cada etapa do fluxo de criação de pedido (checkout &rarr; <code className="bg-gray-100 px-1 rounded text-xs">resolveProductRef</code> &rarr; <code className="bg-gray-100 px-1 rounded text-xs">POST /order</code>) <strong>sem criar nenhum pedido real</strong>. Identifica problemas de SKU, referência, preço e cliente.
          </p>

          {/* Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-600 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                SKU do produto (opcional)
              </label>
              <input
                type="text"
                value={sku}
                onChange={e => setSku(e.target.value)}
                placeholder="Ex: 029161-493 ou deixe vazio"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none"
              />
              <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.68rem" }}>
                Se vazio, usa o primeiro produto do catalogo
              </p>
            </div>
            <div>
              <label className="block text-gray-600 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                codCliente SIGE (opcional)
              </label>
              <input
                type="text"
                value={codCliente}
                onChange={e => setCodCliente(e.target.value)}
                placeholder="Ex: 12345 ou deixe vazio"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none"
              />
              <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.68rem" }}>
                Valida se o cliente existe no SIGE
              </p>
            </div>
          </div>

          {/* Options & Run */}
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={verbose}
                onChange={e => setVerbose(e.target.checked)}
                className="rounded border-gray-300 text-violet-600 focus:ring-violet-500"
              />
              Verbose (detalhes extras)
            </label>

            <button
              onClick={runDiagnose}
              disabled={running || !isConnected}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
              style={{ fontSize: "0.85rem", fontWeight: 500 }}
            >
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {running ? "Diagnosticando..." : "Executar Diagnostico"}
            </button>

            {report && (
              <>
                <button
                  onClick={runDiagnose}
                  disabled={running}
                  className="flex items-center gap-1.5 px-3 py-2 text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                  style={{ fontSize: "0.8rem" }}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Re-executar
                </button>
                <button
                  onClick={copyReport}
                  className="flex items-center gap-1.5 px-3 py-2 text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                  style={{ fontSize: "0.8rem" }}
                >
                  <ClipboardCopy className="w-3.5 h-3.5" />
                  {copied ? "Copiado!" : "Copiar JSON"}
                </button>
              </>
            )}
          </div>

          {!isConnected && (
            <p className="text-amber-600 bg-amber-50 px-3 py-2 rounded-lg" style={{ fontSize: "0.8rem" }}>
              Conecte-se a API SIGE primeiro para usar o diagnostico.
            </p>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start gap-2">
              <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-red-700" style={{ fontSize: "0.82rem" }}>{error}</p>
            </div>
          )}

          {/* Results */}
          {report && (
            <div className="space-y-3">
              {/* Summary bar */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 rounded-full">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                  <span className="text-green-700" style={{ fontSize: "0.78rem", fontWeight: 600 }}>{report.conclusion?.passed || 0} OK</span>
                </div>
                {(report.conclusion?.info || 0) > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-full">
                    <Info className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-blue-700" style={{ fontSize: "0.78rem", fontWeight: 600 }}>{report.conclusion.info} Esperado</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-amber-700" style={{ fontSize: "0.78rem", fontWeight: 600 }}>{report.conclusion?.warnings || 0} Avisos</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 rounded-full">
                  <XCircle className="w-3.5 h-3.5 text-red-500" />
                  <span className="text-red-700" style={{ fontSize: "0.78rem", fontWeight: 600 }}>{report.conclusion?.failures || 0} Falhas</span>
                </div>

                {report.conclusion?.readyToCreateOrder && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 border border-green-300 rounded-full">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-700" />
                    <span className="text-green-800" style={{ fontSize: "0.78rem", fontWeight: 600 }}>Pronto para criar pedido</span>
                  </div>
                )}
              </div>

              {/* Top Fixes */}
              {report.conclusion?.topFixes?.length > 0 && (
                <div className="bg-violet-50 border border-violet-200 rounded-lg p-4 space-y-2">
                  <h4 className="flex items-center gap-1.5 text-violet-800" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                    <Wrench className="w-4 h-4" />
                    Correcoes Sugeridas
                  </h4>
                  <ul className="space-y-1.5">
                    {report.conclusion.topFixes.map((fix: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-violet-700" style={{ fontSize: "0.78rem", lineHeight: 1.4 }}>
                        <span className="shrink-0 mt-0.5 w-4 h-4 bg-violet-200 rounded-full flex items-center justify-center text-violet-700" style={{ fontSize: "0.65rem", fontWeight: 700 }}>{i + 1}</span>
                        <span>{fix}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Steps */}
              <div className="space-y-1">
                {(report.steps || []).map((step: any, idx: number) => {
                  const Icon = STATUS_ICON[step.status] || AlertTriangle;
                  const StepIcon = getStepIcon(step.name);
                  const colorClass = STATUS_COLOR[step.status] || "text-gray-500";
                  const bgClass = STATUS_BG[step.status] || "bg-gray-50 border-gray-200";
                  const isExpanded = expandedSteps[step.name] ?? false;

                  // Collect detail keys (everything except name, status, message)
                  const detailKeys = Object.keys(step).filter(k => !["name", "status", "message"].includes(k));

                  return (
                    <div key={idx} className={`border rounded-lg overflow-hidden ${bgClass}`}>
                      <button
                        onClick={() => toggleStep(step.name)}
                        className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-white/40 transition-colors cursor-pointer"
                      >
                        <Icon className={`w-4 h-4 shrink-0 ${colorClass}`} />
                        <StepIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="text-gray-700 text-left flex-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>
                          {step.name?.replace(/_/g, " ")}
                        </span>
                        <span className="text-gray-500 text-right hidden sm:block max-w-xs truncate" style={{ fontSize: "0.72rem" }}>
                          {step.message?.substring(0, 80)}
                        </span>
                        {detailKeys.length > 0 && (
                          isExpanded
                            ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            : <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        )}
                      </button>

                      {isExpanded && (
                        <div className="border-t border-white/60 px-4 py-3 bg-white/50">
                          {step.message && (
                            <p className="text-gray-700 mb-2" style={{ fontSize: "0.78rem", lineHeight: 1.5 }}>
                              {step.message}
                            </p>
                          )}
                          {detailKeys.length > 0 && (
                            <div className="space-y-1.5">
                              {detailKeys.map(key => {
                                const val = step[key];
                                if (val === null || val === undefined) return null;
                                return (
                                  <div key={key} className="flex flex-col gap-0.5">
                                    <span className="text-gray-500" style={{ fontSize: "0.7rem", fontWeight: 600 }}>
                                      {key}
                                    </span>
                                    <div className="bg-gray-50 rounded px-2.5 py-1.5 overflow-x-auto">
                                      <pre className="text-gray-700 whitespace-pre-wrap break-all" style={{ fontSize: "0.72rem", lineHeight: 1.4 }}>
                                        {typeof val === "object" ? JSON.stringify(val, null, 2) : String(val)}
                                      </pre>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Timestamp */}
              <p className="text-gray-400 text-right" style={{ fontSize: "0.68rem" }}>
                Executado em: {report.timestamp}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}