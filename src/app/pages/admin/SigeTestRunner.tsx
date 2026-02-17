import { useState, useCallback } from "react";
import {
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Zap,
  BarChart3,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Shield,
  RotateCcw,
} from "lucide-react";
import { supabase } from "../../services/supabaseClient";
import * as api from "../../services/api";

interface TestDefinition {
  id: string;
  module: string;
  name: string;
  method: string;
  path: string;
  run: (token: string) => Promise<any>;
}

interface TestResult {
  id: string;
  module: string;
  name: string;
  method: string;
  path: string;
  status: "pending" | "running" | "pass" | "fail" | "skip";
  durationMs: number;
  responsePreview?: string;
  recordCount?: number | string;
  error?: string;
}

// ─── All read-only tests ───
const buildTests = (): TestDefinition[] => [
  // Auth
  {
    id: "user-me",
    module: "Usuarios",
    name: "Dados do usuario autenticado",
    method: "GET",
    path: "/user/me",
    run: (t) => api.sigeUserMe(t),
  },
  // Categorias
  {
    id: "category-list",
    module: "Categorias",
    name: "Listar categorias",
    method: "GET",
    path: "/category",
    run: (t) => api.sigeCategoryGet(t),
  },
  // Clientes
  {
    id: "customer-search",
    module: "Clientes",
    name: "Buscar clientes",
    method: "GET",
    path: "/customer",
    run: (t) => api.sigeCustomerSearch(t),
  },
  // Produtos
  {
    id: "product-search",
    module: "Produtos",
    name: "Buscar produtos",
    method: "GET",
    path: "/product",
    run: (t) => api.sigeProductGet(t),
  },
  // Pedidos
  {
    id: "order-search",
    module: "Pedidos",
    name: "Buscar pedidos",
    method: "GET",
    path: "/order",
    run: (t) => api.sigeOrderSearch(t),
  },
  // Dependencias (sample of key endpoints)
  ...[
    { ep: "area", label: "Areas" },
    { ep: "brand", label: "Marcas" },
    { ep: "country", label: "Paises" },
    { ep: "currency", label: "Moedas" },
    { ep: "unit", label: "Unidades" },
    { ep: "situation", label: "Situacoes" },
    { ep: "group", label: "Grupos" },
    { ep: "risk", label: "Riscos" },
    { ep: "branch", label: "Filiais" },
    { ep: "type-document", label: "Tipos Documento" },
    { ep: "type-moviment", label: "Tipos Movimento" },
    { ep: "type-register", label: "Tipos Registro" },
    { ep: "payment-condition", label: "Cond. Pagamento" },
    { ep: "division-one", label: "Divisao 1" },
    { ep: "division-two", label: "Divisao 2" },
    { ep: "division-three", label: "Divisao 3" },
    { ep: "grate", label: "Grades" },
    { ep: "reference", label: "Referencias" },
    { ep: "local-stock", label: "Local Estoque" },
    { ep: "sequence", label: "Sequencias" },
    { ep: "fiscal-classfication", label: "Class. Fiscal" },
    { ep: "area-work", label: "Area Trabalho" },
    { ep: "group-limit", label: "Grupo Limite" },
    { ep: "promotion", label: "Promocoes" },
    { ep: "balance-v2", label: "Saldo v2" },
    { ep: "list-product", label: "Lista Produto" },
    { ep: "list-product-overview", label: "Lista Prod. Overview" },
    { ep: "tracking", label: "Rastreamento" },
    { ep: "list-price", label: "Lista Precos" },
    { ep: "list-price-items", label: "Itens Lista Precos" },
    { ep: "municipality", label: "Municipios" },
  ].map((d) => ({
    id: `dep-${d.ep}`,
    module: "Dependencias",
    name: d.label,
    method: "GET",
    path: `/${d.ep}`,
    run: (t: string) => api.sigeDep(t, d.ep),
  })),
];

function countRecords(data: any): number | string {
  if (Array.isArray(data)) return data.length;
  if (data?.data && Array.isArray(data.data)) return data.data.length;
  if (data?.items && Array.isArray(data.items)) return data.items.length;
  if (data?.rows && Array.isArray(data.rows)) return data.rows.length;
  if (data?.results && Array.isArray(data.results)) return data.results.length;
  if (typeof data === "object" && data !== null) {
    const keys = Object.keys(data);
    if (keys.length <= 5) return keys.join(", ");
    return `${keys.length} campos`;
  }
  return "—";
}

function truncatePreview(data: any, max = 120): string {
  try {
    const str = JSON.stringify(data);
    return str.length > max ? str.slice(0, max) + "..." : str;
  } catch {
    return String(data).slice(0, max);
  }
}

interface Props {
  isConnected: boolean;
}

export function SigeTestRunner({ isConnected }: Props) {
  const [results, setResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);
  const [currentTest, setCurrentTest] = useState("");
  const [progress, setProgress] = useState(0);
  const [totalTests, setTotalTests] = useState(0);
  const [expandedReport, setExpandedReport] = useState(true);
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
  const [startTime, setStartTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);

  const getAccessToken = useCallback(async (): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Sessao expirada");
    return session.access_token;
  }, []);

  const runAllTests = useCallback(async () => {
    setRunning(true);
    setExpandedReport(true);
    setExpandedModules({});
    const tests = buildTests();
    setTotalTests(tests.length);
    setProgress(0);

    const initialResults: TestResult[] = tests.map((t) => ({
      id: t.id,
      module: t.module,
      name: t.name,
      method: t.method,
      path: t.path,
      status: "pending",
      durationMs: 0,
    }));
    setResults(initialResults);

    let token: string;
    try {
      token = await getAccessToken();
    } catch {
      setResults(initialResults.map((r) => ({ ...r, status: "skip" as const, error: "Sessao expirada" })));
      setRunning(false);
      return;
    }

    const start = Date.now();
    setStartTime(start);
    const updatedResults = [...initialResults];

    for (let i = 0; i < tests.length; i++) {
      const test = tests[i];
      setCurrentTest(`${test.module}: ${test.name}`);
      setProgress(i);

      // Mark as running
      updatedResults[i] = { ...updatedResults[i], status: "running" };
      setResults([...updatedResults]);

      const t0 = performance.now();
      try {
        const data = await test.run(token);
        const t1 = performance.now();
        const duration = Math.round(t1 - t0);
        updatedResults[i] = {
          ...updatedResults[i],
          status: "pass",
          durationMs: duration,
          responsePreview: truncatePreview(data),
          recordCount: countRecords(data),
        };
      } catch (e: any) {
        const t1 = performance.now();
        const duration = Math.round(t1 - t0);
        updatedResults[i] = {
          ...updatedResults[i],
          status: "fail",
          durationMs: duration,
          error: e.message || String(e),
        };
      }
      setResults([...updatedResults]);
    }

    const end = Date.now();
    setTotalDuration(end - start);
    setProgress(tests.length);
    setCurrentTest("");
    setRunning(false);
  }, [getAccessToken]);

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const skipped = results.filter((r) => r.status === "skip").length;
  const pending = results.filter((r) => r.status === "pending" || r.status === "running").length;
  const total = results.length;
  const avgMs = total > 0 && (passed + failed > 0) ? Math.round(results.filter((r) => r.durationMs > 0).reduce((a, b) => a + b.durationMs, 0) / (passed + failed)) : 0;
  const slowest = results.filter((r) => r.durationMs > 0).sort((a, b) => b.durationMs - a.durationMs)[0];
  const fastest = results.filter((r) => r.durationMs > 0).sort((a, b) => a.durationMs - b.durationMs)[0];

  // Group by module
  const modules = Array.from(new Set(results.map((r) => r.module)));
  const byModule = modules.map((m) => ({
    name: m,
    tests: results.filter((r) => r.module === m),
    passed: results.filter((r) => r.module === m && r.status === "pass").length,
    failed: results.filter((r) => r.module === m && r.status === "fail").length,
    total: results.filter((r) => r.module === m).length,
  }));

  const statusIcon = (s: TestResult["status"]) => {
    switch (s) {
      case "pass": return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "fail": return <XCircle className="w-4 h-4 text-red-500" />;
      case "running": return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case "skip": return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      default: return <Clock className="w-4 h-4 text-gray-300" />;
    }
  };

  const statusBg = (s: TestResult["status"]) => {
    switch (s) {
      case "pass": return "bg-green-50 border-green-100";
      case "fail": return "bg-red-50 border-red-100";
      case "running": return "bg-blue-50 border-blue-100";
      case "skip": return "bg-amber-50 border-amber-100";
      default: return "bg-gray-50 border-gray-100";
    }
  };

  const methodColor = (m: string) => {
    switch (m) {
      case "GET": return "bg-emerald-100 text-emerald-700";
      case "POST": return "bg-blue-100 text-blue-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  const durationColor = (ms: number) => {
    if (ms < 500) return "text-green-600";
    if (ms < 1500) return "text-amber-600";
    return "text-red-600";
  };

  const progressPercent = totalTests > 0 ? Math.round((progress / totalTests) * 100) : 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50/80 to-purple-50/50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "1rem", fontWeight: 600 }}>
              <Zap className="w-5 h-5 text-indigo-600" />
              Teste Completo da API
            </h3>
            <p className="text-gray-500 mt-0.5" style={{ fontSize: "0.78rem" }}>
              Executa todos os endpoints de leitura e gera um relatorio
            </p>
          </div>
          <div className="flex items-center gap-2">
            {results.length > 0 && !running && (
              <button
                onClick={() => { setResults([]); setTotalDuration(0); }}
                className="flex items-center gap-1.5 px-3 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                style={{ fontSize: "0.8rem" }}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Limpar
              </button>
            )}
            <button
              onClick={runAllTests}
              disabled={running || !isConnected}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
              style={{ fontSize: "0.88rem", fontWeight: 600 }}
            >
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {running ? "Executando..." : "Executar Todos os Testes"}
            </button>
          </div>
        </div>

        {!isConnected && (
          <div className="mt-3 flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-100 rounded-lg">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <p className="text-amber-700" style={{ fontSize: "0.75rem" }}>
              Conecte-se ao SIGE primeiro para executar os testes.
            </p>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {running && (
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 truncate max-w-[60%]" style={{ fontSize: "0.78rem" }}>
              {currentTest || "Preparando..."}
            </span>
            <span className="text-gray-500 shrink-0" style={{ fontSize: "0.75rem", fontWeight: 600 }}>
              {progress}/{totalTests} ({progressPercent}%)
            </span>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Report */}
      {results.length > 0 && !running && (
        <div>
          {/* Summary Cards */}
          <div className="p-5 border-b border-gray-100">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {/* Total */}
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-100 text-center">
                <p className="text-gray-400" style={{ fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Total</p>
                <p className="text-gray-800 mt-0.5" style={{ fontSize: "1.3rem", fontWeight: 700 }}>{total}</p>
              </div>
              {/* Passed */}
              <div className="p-3 bg-green-50 rounded-lg border border-green-100 text-center">
                <p className="text-green-500" style={{ fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Passou</p>
                <p className="text-green-700 mt-0.5" style={{ fontSize: "1.3rem", fontWeight: 700 }}>{passed}</p>
              </div>
              {/* Failed */}
              <div className={`p-3 rounded-lg border text-center ${failed > 0 ? "bg-red-50 border-red-100" : "bg-gray-50 border-gray-100"}`}>
                <p className={failed > 0 ? "text-red-500" : "text-gray-400"} style={{ fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Falhou</p>
                <p className={`mt-0.5 ${failed > 0 ? "text-red-700" : "text-gray-400"}`} style={{ fontSize: "1.3rem", fontWeight: 700 }}>{failed}</p>
              </div>
              {/* Duration */}
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 text-center">
                <p className="text-blue-500" style={{ fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Tempo Total</p>
                <p className="text-blue-700 mt-0.5" style={{ fontSize: "1.3rem", fontWeight: 700 }}>{(totalDuration / 1000).toFixed(1)}s</p>
              </div>
              {/* Avg */}
              <div className="p-3 bg-purple-50 rounded-lg border border-purple-100 text-center">
                <p className="text-purple-500" style={{ fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Media</p>
                <p className="text-purple-700 mt-0.5" style={{ fontSize: "1.3rem", fontWeight: 700 }}>{avgMs}ms</p>
              </div>
              {/* Score */}
              <div className={`p-3 rounded-lg border text-center ${
                failed === 0 ? "bg-green-50 border-green-100" : failed <= 3 ? "bg-amber-50 border-amber-100" : "bg-red-50 border-red-100"
              }`}>
                <p className={failed === 0 ? "text-green-500" : failed <= 3 ? "text-amber-500" : "text-red-500"} style={{ fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Score</p>
                <p className={`mt-0.5 ${failed === 0 ? "text-green-700" : failed <= 3 ? "text-amber-700" : "text-red-700"}`} style={{ fontSize: "1.3rem", fontWeight: 700 }}>
                  {total > 0 ? Math.round((passed / total) * 100) : 0}%
                </p>
              </div>
            </div>

            {/* Overall status banner */}
            {failed === 0 && passed > 0 && (
              <div className="mt-4 flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                <CheckCircle2 className="w-6 h-6 text-green-500 shrink-0" />
                <div>
                  <p className="text-green-800" style={{ fontSize: "0.95rem", fontWeight: 700 }}>
                    Todos os testes passaram!
                  </p>
                  <p className="text-green-600" style={{ fontSize: "0.78rem" }}>
                    {passed} endpoints testados com sucesso em {(totalDuration / 1000).toFixed(1)}s
                  </p>
                </div>
              </div>
            )}
            {failed > 0 && (
              <div className="mt-4 flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                <XCircle className="w-6 h-6 text-red-500 shrink-0" />
                <div>
                  <p className="text-red-800" style={{ fontSize: "0.95rem", fontWeight: 700 }}>
                    {failed} teste{failed > 1 ? "s" : ""} falhou{failed > 1 ? "ram" : ""}
                  </p>
                  <p className="text-red-600" style={{ fontSize: "0.78rem" }}>
                    {passed}/{total} endpoints funcionando ({Math.round((passed / total) * 100)}%)
                  </p>
                </div>
              </div>
            )}

            {/* Performance highlights */}
            {(fastest || slowest) && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {fastest && (
                  <div className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-lg border border-gray-100">
                    <Zap className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    <span className="text-gray-500" style={{ fontSize: "0.72rem" }}>Mais rapido:</span>
                    <span className="text-gray-700 truncate" style={{ fontSize: "0.72rem", fontWeight: 600 }}>{fastest.name}</span>
                    <span className="text-green-600 shrink-0 ml-auto" style={{ fontSize: "0.72rem", fontWeight: 700 }}>{fastest.durationMs}ms</span>
                  </div>
                )}
                {slowest && slowest.id !== fastest?.id && (
                  <div className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-lg border border-gray-100">
                    <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span className="text-gray-500" style={{ fontSize: "0.72rem" }}>Mais lento:</span>
                    <span className="text-gray-700 truncate" style={{ fontSize: "0.72rem", fontWeight: 600 }}>{slowest.name}</span>
                    <span className="text-amber-600 shrink-0 ml-auto" style={{ fontSize: "0.72rem", fontWeight: 700 }}>{slowest.durationMs}ms</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Detailed Results by Module */}
          <div>
            <button
              onClick={() => setExpandedReport(!expandedReport)}
              className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50/50 transition-colors cursor-pointer border-b border-gray-100"
            >
              <span className="text-gray-700 flex items-center gap-2" style={{ fontSize: "0.88rem", fontWeight: 600 }}>
                <BarChart3 className="w-4 h-4 text-gray-400" />
                Detalhes por Modulo
              </span>
              {expandedReport ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
            </button>

            {expandedReport && (
              <div className="divide-y divide-gray-100">
                {byModule.map((mod) => (
                  <div key={mod.name}>
                    <button
                      onClick={() => setExpandedModules((p) => ({ ...p, [mod.name]: !p[mod.name] }))}
                      className="w-full px-5 py-3 flex items-center gap-3 hover:bg-gray-50/30 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {mod.failed === 0 ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                        )}
                        <span className="text-gray-800 truncate" style={{ fontSize: "0.88rem", fontWeight: 600 }}>{mod.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded-full" style={{ fontSize: "0.68rem", fontWeight: 600 }}>
                          {mod.passed}/{mod.total}
                        </span>
                        {mod.failed > 0 && (
                          <span className="px-2 py-0.5 bg-red-50 text-red-700 rounded-full" style={{ fontSize: "0.68rem", fontWeight: 600 }}>
                            {mod.failed} falha{mod.failed > 1 ? "s" : ""}
                          </span>
                        )}
                        {expandedModules[mod.name]
                          ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                          : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                      </div>
                    </button>

                    {expandedModules[mod.name] && (
                      <div className="px-5 pb-4 space-y-1.5">
                        {mod.tests.map((test) => (
                          <div
                            key={test.id}
                            className={`flex items-center gap-3 p-2.5 rounded-lg border ${statusBg(test.status)}`}
                          >
                            <div className="shrink-0">{statusIcon(test.status)}</div>
                            <span className={`px-1.5 py-0.5 rounded shrink-0 ${methodColor(test.method)}`} style={{ fontSize: "0.6rem", fontWeight: 700, fontFamily: "monospace" }}>
                              {test.method}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-gray-800 truncate" style={{ fontSize: "0.8rem", fontWeight: 500 }}>{test.name}</p>
                              <code className="text-gray-400" style={{ fontSize: "0.68rem" }}>{test.path}</code>
                            </div>
                            <div className="shrink-0 text-right">
                              {test.durationMs > 0 && (
                                <p className={durationColor(test.durationMs)} style={{ fontSize: "0.75rem", fontWeight: 700 }}>
                                  {test.durationMs}ms
                                </p>
                              )}
                              {test.recordCount !== undefined && test.status === "pass" && (
                                <p className="text-gray-400" style={{ fontSize: "0.65rem" }}>
                                  {typeof test.recordCount === "number" ? `${test.recordCount} reg.` : test.recordCount}
                                </p>
                              )}
                            </div>
                            {test.error && (
                              <div className="w-full mt-1.5">
                                <p className="text-red-600 truncate" style={{ fontSize: "0.7rem" }} title={test.error}>
                                  {test.error}
                                </p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Failed Tests Detail */}
          {failed > 0 && (
            <div className="px-5 py-4 border-t border-gray-100 bg-red-50/30">
              <h4 className="text-red-800 flex items-center gap-2 mb-3" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                <XCircle className="w-4 h-4 text-red-500" />
                Detalhes dos Erros
              </h4>
              <div className="space-y-2">
                {results.filter((r) => r.status === "fail").map((test) => (
                  <div key={test.id} className="p-3 bg-white rounded-lg border border-red-100">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`px-1.5 py-0.5 rounded ${methodColor(test.method)}`} style={{ fontSize: "0.6rem", fontWeight: 700, fontFamily: "monospace" }}>
                        {test.method}
                      </span>
                      <span className="text-gray-800" style={{ fontSize: "0.8rem", fontWeight: 600 }}>{test.module}: {test.name}</span>
                      <span className="text-red-500 ml-auto" style={{ fontSize: "0.72rem", fontWeight: 600 }}>{test.durationMs}ms</span>
                    </div>
                    <pre className="text-red-700 whitespace-pre-wrap break-all" style={{ fontSize: "0.72rem", lineHeight: 1.5 }}>
                      {test.error}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Security note */}
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50">
            <p className="text-gray-400 flex items-center gap-1.5" style={{ fontSize: "0.68rem" }}>
              <Shield className="w-3 h-3" />
              Apenas endpoints GET (leitura) sao testados — nenhum dado foi criado ou modificado.
            </p>
          </div>
        </div>
      )}

      {/* Running - live results */}
      {running && results.length > 0 && (
        <div className="max-h-[400px] overflow-y-auto">
          <div className="px-5 py-3 space-y-1.5">
            {results.map((test) => (
              <div
                key={test.id}
                className={`flex items-center gap-3 p-2 rounded-lg border transition-all ${statusBg(test.status)}`}
              >
                <div className="shrink-0">{statusIcon(test.status)}</div>
                <span className={`px-1.5 py-0.5 rounded shrink-0 ${methodColor(test.method)}`} style={{ fontSize: "0.6rem", fontWeight: 700, fontFamily: "monospace" }}>
                  {test.method}
                </span>
                <span className="text-gray-700 truncate flex-1" style={{ fontSize: "0.78rem" }}>{test.name}</span>
                {test.durationMs > 0 && (
                  <span className={`shrink-0 ${durationColor(test.durationMs)}`} style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                    {test.durationMs}ms
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
