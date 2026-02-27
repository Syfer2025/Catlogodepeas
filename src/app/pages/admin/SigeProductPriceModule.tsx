import { useState, useCallback } from "react";
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  XCircle,
  Search,
  Hash,
  Copy,
  Check,
  Info,
  ChevronUp,
  DollarSign,
  Tag,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Database,
  Zap,
  ArrowRight,
} from "lucide-react";
import * as api from "../../services/api";
import { copyToClipboard } from "../../utils/clipboard";
import { getValidAdminToken } from "./adminAuth";

interface Props {
  isConnected: boolean;
}

export function SigeProductPriceModule({ isConnected }: Props) {
  const [expanded, setExpanded] = useState(false);

  // Search
  const [sku, setSku] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<api.ProductPrice | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Batch mode
  const [batchSkus, setBatchSkus] = useState("");
  const [batchMode, setBatchMode] = useState(false);
  const [batchResults, setBatchResults] = useState<api.ProductPrice[]>([]);
  const [batchSearching, setBatchSearching] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });

  // Custom price management
  const [customPrice, setCustomPrice] = useState("");
  const [settingCustom, setSettingCustom] = useState(false);
  const [deletingCustom, setDeletingCustom] = useState(false);
  const [customMsg, setCustomMsg] = useState("");

  // Cache
  const [clearingCache, setClearingCache] = useState(false);
  const [cacheMsg, setCacheMsg] = useState("");

  const getAccessToken = useCallback(async (): Promise<string> => {
    const token = await getValidAdminToken();
    if (!token) throw new Error("Sessão expirada");
    return token;
  }, []);

  const handleSearch = async () => {
    const trimmed = sku.trim();
    if (!trimmed) { setError("Informe o SKU do produto."); return; }
    setSearching(true); setResult(null); setError(""); setCustomMsg("");
    try {
      const res = await api.getProductPrice(trimmed);
      setResult(res);
      console.log("[Price Module] Result:", res);
    } catch (e: any) {
      setError(e.message || "Erro ao buscar preco.");
    } finally { setSearching(false); }
  };

  const handleBatchSearch = async () => {
    const skus = batchSkus
      .split(/[\n,;]+/)
      .map(s => s.trim())
      .filter(Boolean);
    if (skus.length === 0) { setError("Informe pelo menos um SKU."); return; }
    setBatchSearching(true); setBatchResults([]); setError("");
    setBatchProgress({ current: 0, total: skus.length });
    const results: api.ProductPrice[] = [];
    for (let i = 0; i < skus.length; i++) {
      setBatchProgress({ current: i + 1, total: skus.length });
      try {
        const res = await api.getProductPrice(skus[i]);
        results.push(res);
      } catch (e: any) {
        results.push({
          sku: skus[i], found: false, source: "none",
          price: null, v1: null, v2: null, v3: null,
          tier: "v2", error: e.message,
        });
      }
    }
    setBatchResults(results);
    setBatchSearching(false);
  };

  const handleSetCustomPrice = async () => {
    const trimmed = sku.trim();
    const priceVal = parseFloat(customPrice);
    if (!trimmed) { setCustomMsg("Informe o SKU."); return; }
    if (isNaN(priceVal) || priceVal <= 0) { setCustomMsg("Informe um preço válido."); return; }
    setSettingCustom(true); setCustomMsg("");
    try {
      const token = await getAccessToken();
      await api.setProductCustomPrice(trimmed, priceVal, token);
      setCustomMsg(`Preco custom R$ ${priceVal.toFixed(2)} salvo para ${trimmed}.`);
      setCustomPrice("");
      // Re-fetch to show updated result
      const res = await api.getProductPrice(trimmed);
      setResult(res);
    } catch (e: any) {
      setCustomMsg(`Erro: ${e.message}`);
    } finally { setSettingCustom(false); }
  };

  const handleDeleteCustomPrice = async () => {
    const trimmed = sku.trim();
    if (!trimmed) return;
    setDeletingCustom(true); setCustomMsg("");
    try {
      const token = await getAccessToken();
      await api.deleteProductCustomPrice(trimmed, token);
      setCustomMsg(`Preco custom removido para ${trimmed}.`);
      const res = await api.getProductPrice(trimmed);
      setResult(res);
    } catch (e: any) {
      setCustomMsg(`Erro: ${e.message}`);
    } finally { setDeletingCustom(false); }
  };

  const handleClearCache = async () => {
    setClearingCache(true); setCacheMsg("");
    try {
      const token = await getAccessToken();
      const res = await api.clearPriceCache(token);
      setCacheMsg(`Cache limpo: ${res.cleared} entradas removidas.`);
    } catch (e: any) {
      setCacheMsg(`Erro: ${e.message}`);
    } finally { setClearingCache(false); }
  };

  const handleCopy = () => {
    const data = batchResults.length > 0 ? batchResults : result;
    copyToClipboard(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatCurrency = (val: number | null | undefined): string => {
    if (val === null || val === undefined) return "—";
    return `R$ ${val.toFixed(2)}`;
  };

  const inputClass = "w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 placeholder-gray-400 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 focus:bg-white transition-all";
  const inputStyle = { fontSize: "0.8rem" } as const;

  return (
    <div>
      <button onClick={() => setExpanded(!expanded)}
        className="w-full p-5 flex items-center gap-3 hover:bg-gray-50/30 transition-colors cursor-pointer">
        <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center shrink-0">
          <DollarSign className="w-5 h-5 text-amber-600" />
        </div>
        <div className="text-left flex-1">
          <h4 className="text-gray-900" style={{ fontSize: "0.95rem", fontWeight: 700 }}>Produto Preco</h4>
          <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>Consultar preços por SKU com V1/V2/V3, custom e cache — 4 endpoints</p>
        </div>
        <span className="px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 rounded-full shrink-0"
          style={{ fontSize: "0.68rem", fontWeight: 600 }}>Implementado</span>
        {expanded
          ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
          : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4">

          {!isConnected && (
            <p className="text-amber-600 flex items-center gap-1.5" style={{ fontSize: "0.75rem" }}>
              <AlertTriangle className="w-3.5 h-3.5" />
              Conecte-se ao SIGE primeiro para buscar preços do ERP. Preços custom funcionam sem conexão.
            </p>
          )}

          {/* Help reference */}
          <button onClick={() => setShowHelp(!showHelp)}
            className="flex items-center gap-1.5 text-amber-600 hover:text-amber-700 cursor-pointer"
            style={{ fontSize: "0.72rem", fontWeight: 600 }}>
            <Info className="w-3.5 h-3.5" />
            {showHelp ? "Ocultar" : "Ver"} referência de endpoints
            {showHelp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showHelp && (
            <div className="bg-gray-900 rounded-lg p-3">
              <pre className="text-gray-300" style={{ fontSize: "0.72rem", lineHeight: 1.6 }}>
                <code>{`GET  /produtos/preco/:sku     — Busca preço (custom > SIGE)
PUT  /produtos/preco/:sku     — Define preço custom (admin)
DEL  /produtos/preco/:sku     — Remove preço custom (admin)
GET  /produtos/custom-prices  — Lista todos os preços custom
DEL  /price-cache             — Limpa cache de preços
GET  /sige/list-price         — Lista tabelas de preço do SIGE
GET  /sige/list-price-items   — Itens de lista de preço (por codProduto)

Estratégias de busca (em ordem):
  1. Preço custom (price_custom_<sku>)
  2. Cache (10min found / 2min not found)
  3. Encontrar produto: mapping > codProduto > base > clean
  4. Buscar preços: GET /list-price-items?codProduto={id}
  5. Mapear listas para V1/V2/V3 (config ou auto)

Fonte de preços:
  SIGE /list-price-items retorna itens por codLista.
  Cada codLista é mapeado para V1, V2 ou V3.
  Configure o mapeamento em Config > Preços.
  Sem mapeamento: auto-atribui por ordem de codLista.`}</code>
              </pre>
            </div>
          )}

          {/* Mode toggle */}
          <div className="flex items-center gap-2">
            <button onClick={() => setBatchMode(false)}
              className={`px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${!batchMode ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"}`}
              style={{ fontSize: "0.78rem", fontWeight: 600 }}>
              <span className="flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5" /> Consulta Unitaria
              </span>
            </button>
            <button onClick={() => setBatchMode(true)}
              className={`px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${batchMode ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"}`}
              style={{ fontSize: "0.78rem", fontWeight: 600 }}>
              <span className="flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" /> Consulta em Lote
              </span>
            </button>
          </div>

          {/* ─── Single SKU lookup ─── */}
          {!batchMode && (
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              <div className="flex items-center gap-3 p-3 bg-gray-50/50">
                <span className="px-2.5 py-1 rounded border bg-emerald-100 text-emerald-700 border-emerald-200"
                  style={{ fontSize: "0.68rem", fontWeight: 700, fontFamily: "monospace" }}>GET</span>
                <code className="text-gray-800" style={{ fontSize: "0.85rem" }}>/produtos/preco/{"{sku}"}</code>
              </div>
              <div className="p-3 space-y-3">
                <p className="text-gray-600" style={{ fontSize: "0.78rem" }}>
                  Busca o preço de um produto por SKU. Verifica preço custom, cache e depois consulta o SIGE com múltiplas estratégias.
                </p>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input type="text" value={sku} onChange={(e) => setSku(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                      placeholder="SKU do produto (ex: 7891234567890)"
                      className={inputClass} style={inputStyle} />
                  </div>
                  <button onClick={handleSearch} disabled={searching || !sku.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer shrink-0"
                    style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                    {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    {searching ? "Buscando..." : "Buscar"}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-100 rounded"
                    style={{ fontSize: "0.65rem", fontWeight: 600 }}>Proxy: /produtos/preco/:sku</span>
                </div>

                {/* Error */}
                {error && (
                  <div className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-100 rounded-lg">
                    <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                    <p className="text-red-700" style={{ fontSize: "0.75rem" }}>{error}</p>
                  </div>
                )}

                {/* Result */}
                {result && (
                  <div className="space-y-3">
                    {/* Summary card */}
                    <div className={`p-3 rounded-lg border ${result.found ? "bg-green-50 border-green-100" : "bg-gray-50 border-gray-200"}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {result.found ? (
                            <CheckCircle2 className="w-4.5 h-4.5 text-green-500" />
                          ) : (
                            <XCircle className="w-4.5 h-4.5 text-gray-400" />
                          )}
                          <span className={`font-semibold ${result.found ? "text-green-800" : "text-gray-600"}`}
                            style={{ fontSize: "0.88rem" }}>
                            {result.found ? "Preço encontrado" : "Preço não encontrado"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {result.cached && (
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded"
                              style={{ fontSize: "0.65rem", fontWeight: 600 }}>CACHE</span>
                          )}
                          <span className={`px-2 py-0.5 rounded border ${
                            result.source === "custom" ? "bg-purple-50 text-purple-700 border-purple-200" :
                            result.source === "sige" ? "bg-amber-50 text-amber-700 border-amber-200" :
                            "bg-gray-100 text-gray-500 border-gray-200"
                          }`} style={{ fontSize: "0.65rem", fontWeight: 600 }}>
                            {result.source === "custom" ? "CUSTOM" : result.source === "sige" ? "SIGE" : "NENHUM"}
                          </span>
                        </div>
                      </div>

                      {/* Price display */}
                      {result.found && (
                        <div className="mt-3">
                          <div className="flex items-baseline gap-2 mb-3">
                            <DollarSign className="w-5 h-5 text-green-600" />
                            <span className="text-green-800" style={{ fontSize: "1.5rem", fontWeight: 800 }}>
                              {formatCurrency(result.price)}
                            </span>
                            <span className="text-green-600" style={{ fontSize: "0.72rem" }}>
                              (tabela: {result.tier?.toUpperCase()})
                            </span>
                          </div>

                          {/* V1/V2/V3 grid */}
                          {result.source !== "custom" && (
                            <div className="grid grid-cols-4 gap-2">
                              {[
                                { label: "V1", value: result.v1, tier: "v1" },
                                { label: "V2", value: result.v2, tier: "v2" },
                                { label: "V3", value: result.v3, tier: "v3" },
                                { label: "Base", value: result.base, tier: "base" },
                              ].map(item => (
                                <div key={item.label} className={`p-2 rounded-lg text-center ${
                                  result.tier === item.tier ? "bg-amber-100 border-2 border-amber-300" : "bg-white border border-gray-200"
                                }`}>
                                  <p className="text-gray-400" style={{ fontSize: "0.65rem", fontWeight: 700 }}>{item.label}</p>
                                  <p className={`mt-0.5 ${item.value !== null ? "text-gray-800 font-semibold" : "text-gray-400"}`}
                                    style={{ fontSize: "0.82rem" }}>
                                    {formatCurrency(item.value)}
                                  </p>
                                  {result.tier === item.tier && (
                                    <p className="text-amber-600 mt-0.5" style={{ fontSize: "0.6rem", fontWeight: 600 }}>SELECIONADA</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Info rows */}
                      <div className="mt-3 space-y-1">
                        {result.descricao && (
                          <div className="flex items-center gap-2 text-gray-600" style={{ fontSize: "0.75rem" }}>
                            <span className="text-gray-400 shrink-0">Descrição:</span>
                            <span className="font-medium truncate">{result.descricao}</span>
                          </div>
                        )}
                        {result.sigeId && (
                          <div className="flex items-center gap-2 text-gray-600" style={{ fontSize: "0.75rem" }}>
                            <span className="text-gray-400 shrink-0">SIGE ID:</span>
                            <code className="font-mono bg-gray-100 px-1 rounded">{result.sigeId}</code>
                          </div>
                        )}
                        {result.showPrice !== undefined && (
                          <div className="flex items-center gap-2 text-gray-600" style={{ fontSize: "0.75rem" }}>
                            <span className="text-gray-400 shrink-0">showPrice:</span>
                            <span className={result.showPrice ? "text-green-600" : "text-red-500"}>
                              {result.showPrice ? "Sim (preço visível)" : "Não (preço oculto)"}
                            </span>
                          </div>
                        )}
                        {result.error && (
                          <div className="flex items-center gap-2 text-red-600" style={{ fontSize: "0.75rem" }}>
                            <span className="text-red-400 shrink-0">Erro:</span>
                            <span>{result.error}</span>
                          </div>
                        )}
                      </div>

                      {/* Price list debug info */}
                      {result.source === "sige" && (
                        <div className="mt-3 pt-2 border-t border-gray-200 space-y-2">
                          {/* Price list items found */}
                          <p className="text-gray-500 flex items-center gap-1" style={{ fontSize: "0.68rem", fontWeight: 600 }}>
                            <Database className="w-3 h-3" />
                            Listas de preço SIGE: {result._priceListItems ?? 0} item(ns) via <code className="bg-gray-100 px-1 rounded">GET /list-price-items</code>
                          </p>

                          {/* Detected list codes with prices */}
                          {result._priceListDebug && result._priceListDebug.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-gray-500" style={{ fontSize: "0.65rem", fontWeight: 600 }}>
                                Tabelas encontradas:
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                {result._priceListDebug.map((entry: any, i: number) => (
                                  <div key={i} className={`flex items-center justify-between px-2 py-1.5 rounded border ${
                                    entry.price !== null ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"
                                  }`}>
                                    <div className="flex items-center gap-1.5">
                                      <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 rounded font-mono"
                                        style={{ fontSize: "0.62rem", fontWeight: 700 }}>
                                        Lista {entry.codLista}
                                      </span>
                                      {entry.descLista && (
                                        <span className="text-gray-500 truncate" style={{ fontSize: "0.62rem", maxWidth: "120px" }}>
                                          {entry.descLista}
                                        </span>
                                      )}
                                    </div>
                                    <span className={`font-mono font-semibold ${entry.price !== null ? "text-green-700" : "text-gray-400"}`}
                                      style={{ fontSize: "0.72rem" }}>
                                      {entry.price !== null ? `R$ ${Number(entry.price).toFixed(2)}` : "—"}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Item sample keys */}
                          {result._itemSampleKeys && result._itemSampleKeys.length > 0 && (
                            <div>
                              <p className="text-gray-500 mb-1" style={{ fontSize: "0.65rem", fontWeight: 600 }}>
                                <Zap className="w-3 h-3 inline mr-1" />
                                Campos retornados por item da lista:
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {result._itemSampleKeys.map((k: string, i: number) => (
                                  <span key={i} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 border border-gray-200 rounded font-mono"
                                    style={{ fontSize: "0.6rem" }}>
                                    {k}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Mapping config info */}
                          {result._listMapping && Object.keys(result._listMapping).length > 0 && (
                            <div className="flex items-center gap-2">
                              <span className="text-gray-500" style={{ fontSize: "0.65rem", fontWeight: 600 }}>Mapeamento configurado:</span>
                              {Object.entries(result._listMapping).map(([tier, codLista]) => (
                                <span key={tier} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded font-mono"
                                  style={{ fontSize: "0.6rem" }}>
                                  {tier.toUpperCase()} → Lista {String(codLista)}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* No mapping warning */}
                          {(!result._listMapping || Object.keys(result._listMapping).length === 0) && result._priceListItems !== undefined && result._priceListItems > 0 && (
                            <div className="flex items-start gap-2 p-2 bg-blue-50 border border-blue-100 rounded-lg">
                              <Info className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
                              <p className="text-blue-700" style={{ fontSize: "0.72rem" }}>
                                Sem mapeamento configurado. As listas foram auto-atribuidas em ordem: primeira→V1, segunda→V2, terceira→V3.
                                Configure o mapeamento em <strong>Configuracoes &gt; Precos</strong> para controlar qual lista corresponde a cada tier.
                              </p>
                            </div>
                          )}

                          {/* No items found warning */}
                          {(result._priceListItems === 0 || result._priceListItems === undefined) && !result.found && (
                            <div className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-100 rounded-lg">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                              <p className="text-amber-700" style={{ fontSize: "0.72rem" }}>
                                Nenhum item de lista de preço encontrado para este produto no SIGE.
                                Verifique se o produto possui preços cadastrados em alguma lista de preço no SIGE
                                (<code className="bg-amber-100 px-1 rounded">GET /list-price-items?codProduto={result.sigeId}</code>).
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Custom price actions */}
                    <div className="p-3 bg-purple-50/50 border border-purple-100 rounded-lg space-y-2">
                      <p className="text-purple-700 flex items-center gap-1.5" style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                        <DollarSign className="w-3.5 h-3.5" />
                        Gerenciar preço custom para {sku.trim()}
                      </p>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                          <input type="number" step="0.01" min="0" value={customPrice}
                            onChange={(e) => setCustomPrice(e.target.value)}
                            placeholder="Preco (ex: 29.90)"
                            className="w-full pl-9 pr-3 py-2 border border-purple-200 rounded-lg bg-white text-gray-800 placeholder-gray-400 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all"
                            style={{ fontSize: "0.8rem" }} />
                        </div>
                        <button onClick={handleSetCustomPrice}
                          disabled={settingCustom || !sku.trim() || !customPrice}
                          className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer shrink-0"
                          style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                          {settingCustom ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                          Salvar
                        </button>
                        {result.source === "custom" && (
                          <button onClick={handleDeleteCustomPrice}
                            disabled={deletingCustom}
                            className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer shrink-0"
                            style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                            {deletingCustom ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            Remover Custom
                          </button>
                        )}
                      </div>
                      {customMsg && (
                        <p className={`${customMsg.startsWith("Erro") ? "text-red-600" : "text-green-600"}`}
                          style={{ fontSize: "0.72rem" }}>{customMsg}</p>
                      )}
                    </div>

                    {/* Raw JSON */}
                    <div className="bg-gray-900 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
                        <p className="text-green-400" style={{ fontSize: "0.68rem", fontWeight: 600 }}>
                          Resposta GET /produtos/preco/{sku.trim()}:
                        </p>
                        <button onClick={handleCopy}
                          className="flex items-center gap-1 px-2 py-0.5 text-gray-400 hover:text-white rounded transition-colors cursor-pointer"
                          style={{ fontSize: "0.65rem" }}>
                          {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                          {copied ? "Copiado" : "Copiar"}
                        </button>
                      </div>
                      <div className="px-3 pb-3 overflow-x-auto max-h-[400px] overflow-y-auto">
                        <pre className="text-gray-300" style={{ fontSize: "0.72rem", lineHeight: 1.5 }}>
                          <code>{JSON.stringify(result, null, 2)}</code>
                        </pre>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── Batch mode ─── */}
          {batchMode && (
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              <div className="flex items-center gap-3 p-3 bg-gray-50/50">
                <span className="px-2.5 py-1 rounded border bg-emerald-100 text-emerald-700 border-emerald-200"
                  style={{ fontSize: "0.68rem", fontWeight: 700, fontFamily: "monospace" }}>GET</span>
                <code className="text-gray-800" style={{ fontSize: "0.85rem" }}>/produtos/preco/:sku (lote)</code>
              </div>
              <div className="p-3 space-y-3">
                <p className="text-gray-600" style={{ fontSize: "0.78rem" }}>
                  Consulte preços de vários SKUs de uma vez. Separe por linha, vírgula ou ponto-e-vírgula.
                </p>

                <textarea value={batchSkus} onChange={(e) => setBatchSkus(e.target.value)}
                  rows={4}
                  placeholder={"SKU-001\nSKU-002\nSKU-003"}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 placeholder-gray-400 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 focus:bg-white transition-all resize-y"
                  style={{ fontSize: "0.8rem", fontFamily: "monospace" }} />

                <div className="flex items-center gap-2">
                  <button onClick={handleBatchSearch}
                    disabled={batchSearching || !batchSkus.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                    style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                    {batchSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    {batchSearching ? `Buscando ${batchProgress.current}/${batchProgress.total}...` : "Buscar Todos"}
                  </button>
                  {batchSearching && (
                    <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div className="bg-amber-500 h-full rounded-full transition-all"
                        style={{ width: `${batchProgress.total ? (batchProgress.current / batchProgress.total * 100) : 0}%` }} />
                    </div>
                  )}
                </div>

                {error && (
                  <div className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-100 rounded-lg">
                    <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                    <p className="text-red-700" style={{ fontSize: "0.75rem" }}>{error}</p>
                  </div>
                )}

                {/* Batch results table */}
                {batchResults.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-gray-700" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                        {batchResults.length} resultado(s) — {batchResults.filter(r => r.found).length} encontrado(s)
                      </p>
                      <button onClick={handleCopy}
                        className="flex items-center gap-1 px-2 py-1 text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition-colors cursor-pointer"
                        style={{ fontSize: "0.68rem" }}>
                        {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                        {copied ? "Copiado" : "Copiar JSON"}
                      </button>
                    </div>

                    <div className="overflow-x-auto border border-gray-200 rounded-lg">
                      <table className="w-full" style={{ fontSize: "0.75rem" }}>
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="px-3 py-2 text-left text-gray-500 font-semibold">SKU</th>
                            <th className="px-3 py-2 text-center text-gray-500 font-semibold">Status</th>
                            <th className="px-3 py-2 text-center text-gray-500 font-semibold">Fonte</th>
                            <th className="px-3 py-2 text-right text-gray-500 font-semibold">Preco</th>
                            <th className="px-3 py-2 text-right text-gray-500 font-semibold">V1</th>
                            <th className="px-3 py-2 text-right text-gray-500 font-semibold">V2</th>
                            <th className="px-3 py-2 text-right text-gray-500 font-semibold">V3</th>
                            <th className="px-3 py-2 text-center text-gray-500 font-semibold">Tier</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {batchResults.map((r, i) => (
                            <tr key={`${r.sku}-${i}`} className={`${r.found ? "bg-white" : "bg-red-50/30"} hover:bg-gray-50 transition-colors`}>
                              <td className="px-3 py-2 font-mono text-gray-800">{r.sku}</td>
                              <td className="px-3 py-2 text-center">
                                {r.found ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mx-auto" />
                                ) : (
                                  <XCircle className="w-3.5 h-3.5 text-red-400 mx-auto" />
                                )}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <span className={`px-1.5 py-0.5 rounded ${
                                  r.source === "custom" ? "bg-purple-100 text-purple-700" :
                                  r.source === "sige" ? "bg-amber-100 text-amber-700" :
                                  "bg-gray-100 text-gray-500"
                                }`} style={{ fontSize: "0.65rem", fontWeight: 600 }}>
                                  {r.source?.toUpperCase() || "—"}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right font-semibold text-gray-800">{formatCurrency(r.price)}</td>
                              <td className="px-3 py-2 text-right text-gray-600">{formatCurrency(r.v1)}</td>
                              <td className="px-3 py-2 text-right text-gray-600">{formatCurrency(r.v2)}</td>
                              <td className="px-3 py-2 text-right text-gray-600">{formatCurrency(r.v3)}</td>
                              <td className="px-3 py-2 text-center text-gray-500">{r.tier?.toUpperCase()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── Cache management ─── */}
          <div className="flex items-center gap-3 p-3 bg-blue-50/50 border border-blue-100 rounded-lg">
            <div className="flex-1">
              <p className="text-blue-700" style={{ fontSize: "0.75rem" }}>
                <strong>Cache de preços:</strong> 10 min para encontrados, 2 min para não encontrados.
              </p>
              {cacheMsg && (
                <p className={`mt-1 ${cacheMsg.startsWith("Erro") ? "text-red-600" : "text-green-600"}`}
                  style={{ fontSize: "0.72rem" }}>{cacheMsg}</p>
              )}
            </div>
            <button onClick={handleClearCache} disabled={clearingCache}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-200 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer shrink-0"
              style={{ fontSize: "0.75rem", fontWeight: 600 }}>
              {clearingCache ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Limpar Cache
            </button>
          </div>
        </div>
      )}
    </div>
  );
}