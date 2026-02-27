import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, Loader2, CheckCircle2, AlertCircle, Link2, Link2Off,
  Search, Package, ChevronDown, ChevronUp, X, ArrowRight, Hash,
  BarChart3, Zap, Download, AlertTriangle, Eye,
} from "lucide-react";
import * as api from "../../services/api";
import type { SigeMapping, SigeSyncResult } from "../../services/api";
import { getValidAdminToken } from "./adminAuth";

interface SigeStockSyncProps {
  onSyncComplete?: () => void;
}

export function SigeStockSync({ onSyncComplete }: SigeStockSyncProps) {
  const [mappings, setMappings] = useState<SigeMapping[]>([]);
  const [loadingMappings, setLoadingMappings] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SigeSyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [resultFilter, setResultFilter] = useState<"all" | "matched" | "unmatched">("all");
  const [resultSearch, setResultSearch] = useState("");

  // Manual mapping
  const [manualSku, setManualSku] = useState("");
  const [manualSigeId, setManualSigeId] = useState("");
  const [manualDesc, setManualDesc] = useState("");
  const [manualLoading, setManualLoading] = useState(false);
  const [manualMsg, setManualMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const getToken = async (): Promise<string> => {
    const token = await getValidAdminToken();
    return token || "";
  };

  const loadMappings = useCallback(async () => {
    setLoadingMappings(true);
    try {
      const res = await api.getSigeMappings();
      setMappings(res.mappings || []);
    } catch (e: any) {
      console.error("[SigeStockSync] Error loading mappings:", e);
    } finally {
      setLoadingMappings(false);
    }
  }, []);

  useEffect(() => { loadMappings(); }, [loadMappings]);

  const runSync = async (clearExisting = false) => {
    setSyncing(true);
    setSyncError(null);
    setSyncResult(null);
    try {
      const token = await getToken();
      const result = await api.triggerSigeSync(token, {
        fetchBalances: true,
        clearExisting,
        batchSize: 500,
      });
      setSyncResult(result);
      setShowResults(true);
      await loadMappings();
      onSyncComplete?.();
    } catch (e: any) {
      setSyncError(e.message || "Erro ao sincronizar");
    } finally {
      setSyncing(false);
    }
  };

  const handleManualMap = async () => {
    if (!manualSku.trim() || !manualSigeId.trim()) {
      setManualMsg({ type: "error", text: "SKU e SIGE ID são obrigatórios." });
      return;
    }
    setManualLoading(true);
    setManualMsg(null);
    try {
      const token = await getToken();
      await api.setSigeMapping(token, manualSku.trim(), {
        sigeId: manualSigeId.trim(),
        descricao: manualDesc.trim(),
      });
      setManualMsg({ type: "success", text: `Mapeamento salvo: ${manualSku} → SIGE ${manualSigeId}` });
      setManualSku("");
      setManualSigeId("");
      setManualDesc("");
      await loadMappings();
      onSyncComplete?.();
    } catch (e: any) {
      setManualMsg({ type: "error", text: e.message || "Erro ao salvar mapeamento" });
    } finally {
      setManualLoading(false);
    }
  };

  const handleRemoveMapping = async (sku: string) => {
    try {
      const token = await getToken();
      await api.deleteSigeMapping(token, sku);
      setMappings(prev => prev.filter(m => m.sku !== sku));
      onSyncComplete?.();
    } catch (e: any) {
      console.error("[SigeStockSync] Error removing mapping:", e);
    }
  };

  const matchTypeLabel = (mt: string) => {
    const labels: Record<string, string> = {
      exact_cod: "Exato (codProduto)",
      clean_cod: "Normalizado",
      no_zeros: "Sem zeros",
      sige_id: "ID SIGE",
      base_dash: "Base (pre-hifen)",
      manual: "Manual",
    };
    return labels[mt] || mt;
  };

  const filteredResults = (syncResult?.matchResults || []).filter(r => {
    if (resultFilter === "matched" && !r.matched) return false;
    if (resultFilter === "unmatched" && r.matched) return false;
    if (resultSearch) {
      const q = resultSearch.toLowerCase();
      return (
        r.sku.toLowerCase().includes(q) ||
        (r.descricao || "").toLowerCase().includes(q) ||
        (r.titulo || "").toLowerCase().includes(q) ||
        (r.sigeId || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="w-9 h-9 bg-purple-100 rounded-lg flex items-center justify-center shrink-0">
          <Link2 className="w-5 h-5 text-purple-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-gray-800" style={{ fontSize: "0.92rem", fontWeight: 700 }}>
              Sincronizacao SIGE
            </span>
            {loadingMappings ? (
              <Loader2 className="w-3.5 h-3.5 text-gray-300 animate-spin" />
            ) : (
              <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full" style={{ fontSize: "0.68rem", fontWeight: 600 }}>
                {mappings.length} mapeados
              </span>
            )}
          </div>
          <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.72rem" }}>
            Vincular produtos locais com IDs do SIGE para exibir estoque automaticamente
          </p>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {expanded && (
        <div className="border-t border-gray-100">
          {/* Summary Stats */}
          <div className="px-5 py-4 bg-gray-50/50 border-b border-gray-100">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white rounded-lg border border-gray-200 p-3 text-center">
                <p className="text-gray-400" style={{ fontSize: "0.6rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Mapeados
                </p>
                <p className="text-purple-700 mt-0.5" style={{ fontSize: "1.2rem", fontWeight: 700 }}>
                  {loadingMappings ? "..." : mappings.length}
                </p>
              </div>
              {syncResult && (
                <>
                  <div className="bg-white rounded-lg border border-green-200 p-3 text-center">
                    <p className="text-green-500" style={{ fontSize: "0.6rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Matched
                    </p>
                    <p className="text-green-700 mt-0.5" style={{ fontSize: "1.2rem", fontWeight: 700 }}>
                      {syncResult.matched}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg border border-red-200 p-3 text-center">
                    <p className="text-red-400" style={{ fontSize: "0.6rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Sem match
                    </p>
                    <p className="text-red-600 mt-0.5" style={{ fontSize: "1.2rem", fontWeight: 700 }}>
                      {syncResult.unmatched}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg border border-blue-200 p-3 text-center">
                    <p className="text-blue-400" style={{ fontSize: "0.6rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Saldos
                    </p>
                    <p className="text-blue-700 mt-0.5" style={{ fontSize: "1.2rem", fontWeight: 700 }}>
                      {syncResult.balanceFetched}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="px-5 py-4 flex flex-wrap gap-2 border-b border-gray-100">
            <button
              onClick={() => runSync(false)}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{ fontSize: "0.82rem", fontWeight: 600 }}
            >
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {syncing ? "Sincronizando..." : "Sincronizar Novos"}
            </button>
            <button
              onClick={() => {
                if (confirm("Isso vai re-sincronizar TODOS os produtos. Os mapeamentos manuais serão substituídos. Continuar?")) {
                  runSync(true);
                }
              }}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
              style={{ fontSize: "0.82rem", fontWeight: 600 }}
            >
              <RefreshCw className="w-4 h-4" />
              Re-sincronizar Tudo
            </button>
          </div>

          {/* Sync Progress/Error */}
          {syncing && (
            <div className="px-5 py-3 bg-purple-50 border-b border-purple-100 flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-purple-600 animate-spin" />
              <div>
                <p className="text-purple-800" style={{ fontSize: "0.82rem", fontWeight: 600 }}>Sincronizando...</p>
                <p className="text-purple-600" style={{ fontSize: "0.72rem" }}>
                  Carregando todos os produtos do SIGE e cruzando com a base local. Isso pode levar alguns minutos.
                </p>
              </div>
            </div>
          )}

          {syncError && (
            <div className="px-5 py-3 bg-red-50 border-b border-red-100 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
              <p className="text-red-700 flex-1" style={{ fontSize: "0.82rem" }}>{syncError}</p>
            </div>
          )}

          {/* Sync Results */}
          {syncResult && showResults && (
            <div className="border-b border-gray-100">
              <div className="px-5 py-3 bg-green-50 border-b border-green-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <p className="text-green-800" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                      Sincronizacao concluida!
                    </p>
                  </div>
                  <button onClick={() => setShowResults(false)} className="p-1 rounded hover:bg-green-100">
                    <X className="w-3.5 h-3.5 text-green-600" />
                  </button>
                </div>
                <p className="text-green-600 mt-1" style={{ fontSize: "0.72rem" }}>
                  {syncResult.localProducts} produtos locais × {syncResult.sigeProducts} produtos SIGE
                  {syncResult.skipped > 0 && ` (${syncResult.skipped} já mapeados)`}
                </p>
              </div>

              {/* Results filter/search */}
              <div className="px-5 py-3 flex flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50/50">
                <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                  {(["all", "matched", "unmatched"] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setResultFilter(f)}
                      className={`px-3 py-1.5 transition-colors ${resultFilter === f ? "bg-purple-600 text-white" : "bg-white text-gray-600 hover:bg-gray-100"}`}
                      style={{ fontSize: "0.72rem", fontWeight: 600 }}
                    >
                      {f === "all" ? `Todos (${syncResult.totalResults})` :
                       f === "matched" ? `Match (${syncResult.matched})` :
                       `Sem match (${syncResult.unmatched})`}
                    </button>
                  ))}
                </div>
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar SKU, descrição..."
                    value={resultSearch}
                    onChange={(e) => setResultSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg bg-white text-gray-700"
                    style={{ fontSize: "0.75rem" }}
                  />
                </div>
              </div>

              {/* Results list */}
              <div className="max-h-[400px] overflow-y-auto">
                {filteredResults.length === 0 ? (
                  <div className="px-5 py-6 text-center text-gray-400" style={{ fontSize: "0.8rem" }}>
                    Nenhum resultado encontrado.
                  </div>
                ) : (
                  filteredResults.slice(0, 100).map((r, idx) => (
                    <div
                      key={r.sku}
                      className={`px-5 py-2.5 flex items-center gap-3 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"} ${r.matched ? "" : "border-l-2 border-red-300"}`}
                    >
                      <div className={`w-2 h-2 rounded-full shrink-0 ${r.matched ? "bg-green-500" : "bg-red-400"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded" style={{ fontSize: "0.7rem" }}>
                            {r.sku}
                          </span>
                          {r.matched && (
                            <>
                              <ArrowRight className="w-3 h-3 text-gray-400 shrink-0" />
                              <span className="font-mono text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded" style={{ fontSize: "0.7rem" }}>
                                SIGE: {r.sigeId}
                              </span>
                              <span className="text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full" style={{ fontSize: "0.6rem" }}>
                                {matchTypeLabel(r.matchType || "")}
                              </span>
                            </>
                          )}
                        </div>
                        <p className="text-gray-500 truncate mt-0.5" style={{ fontSize: "0.7rem" }}>
                          {r.matched ? r.descricao : r.titulo}
                        </p>
                      </div>
                      {!r.matched && (
                        <button
                          onClick={() => {
                            setManualSku(r.sku);
                            setManualSigeId("");
                            setManualDesc("");
                          }}
                          className="text-purple-600 hover:text-purple-700 px-2 py-1 rounded hover:bg-purple-50 transition-colors shrink-0"
                          style={{ fontSize: "0.68rem", fontWeight: 600 }}
                        >
                          Mapear
                        </button>
                      )}
                    </div>
                  ))
                )}
                {filteredResults.length > 100 && (
                  <div className="px-5 py-2 text-center text-gray-400" style={{ fontSize: "0.7rem" }}>
                    Mostrando 100 de {filteredResults.length} resultados
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Manual Mapping */}
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-gray-700 mb-3" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
              Mapeamento Manual
            </p>
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[120px]">
                <label className="block text-gray-400 mb-1" style={{ fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase" }}>SKU Local</label>
                <input
                  type="text"
                  value={manualSku}
                  onChange={(e) => setManualSku(e.target.value)}
                  placeholder="ex: 112274376"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-700 bg-white"
                  style={{ fontSize: "0.8rem" }}
                />
              </div>
              <div className="flex-1 min-w-[120px]">
                <label className="block text-gray-400 mb-1" style={{ fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase" }}>SIGE ID</label>
                <input
                  type="text"
                  value={manualSigeId}
                  onChange={(e) => setManualSigeId(e.target.value)}
                  placeholder="ex: 12345"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-700 bg-white"
                  style={{ fontSize: "0.8rem" }}
                />
              </div>
              <div className="flex-1 min-w-[150px]">
                <label className="block text-gray-400 mb-1" style={{ fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase" }}>Descrição (opcional)</label>
                <input
                  type="text"
                  value={manualDesc}
                  onChange={(e) => setManualDesc(e.target.value)}
                  placeholder="Descrição do produto SIGE"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-700 bg-white"
                  style={{ fontSize: "0.8rem" }}
                />
              </div>
              <button
                onClick={handleManualMap}
                disabled={manualLoading}
                className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors shrink-0"
                style={{ fontSize: "0.8rem", fontWeight: 600 }}
              >
                {manualLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                Salvar
              </button>
            </div>
            {manualMsg && (
              <div className={`mt-2 flex items-center gap-2 px-3 py-2 rounded-lg ${manualMsg.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`} style={{ fontSize: "0.75rem" }}>
                {manualMsg.type === "success" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                {manualMsg.text}
              </div>
            )}
          </div>

          {/* Existing Mappings Preview */}
          {mappings.length > 0 && (
            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-gray-700" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                  Mapeamentos Atuais ({mappings.length})
                </p>
              </div>
              <div className="max-h-[250px] overflow-y-auto border border-gray-200 rounded-lg">
                {mappings.slice(0, 50).map((m, idx) => (
                  <div
                    key={m.sku}
                    className={`flex items-center gap-2 px-3 py-2 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"} ${idx < Math.min(mappings.length, 50) - 1 ? "border-b border-gray-100" : ""}`}
                  >
                    <span className="font-mono text-gray-600" style={{ fontSize: "0.7rem" }}>{m.sku}</span>
                    <ArrowRight className="w-3 h-3 text-gray-300 shrink-0" />
                    <span className="font-mono text-purple-600" style={{ fontSize: "0.7rem" }}>{m.sigeId}</span>
                    <span className="text-gray-400 truncate" style={{ fontSize: "0.65rem" }}>
                      {m.descricao?.substring(0, 40)}
                    </span>
                    <span className="text-gray-300 ml-auto shrink-0 px-1.5 py-0.5 bg-gray-100 rounded" style={{ fontSize: "0.58rem" }}>
                      {matchTypeLabel(m.matchType)}
                    </span>
                    <button
                      onClick={() => {
                        if (confirm(`Remover mapeamento ${m.sku} → SIGE ${m.sigeId}?`)) {
                          handleRemoveMapping(m.sku);
                        }
                      }}
                      className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors shrink-0"
                      title="Remover mapeamento"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {mappings.length > 50 && (
                  <div className="px-3 py-2 text-center text-gray-400 bg-gray-50" style={{ fontSize: "0.7rem" }}>
                    + {mappings.length - 50} mapeamentos adicionais
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}