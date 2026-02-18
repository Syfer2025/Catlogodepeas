import { useState, useCallback, useRef } from "react";
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  Search,
  Hash,
  Copy,
  Check,
  Package,
  PackageCheck,
  PackageX,
  AlertTriangle,
  BarChart3,
  RefreshCw,
  Play,
  XCircle,
  ArrowRight,
  Eye,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  Database,
  Zap,
  Info,
} from "lucide-react";
import { supabase } from "../../services/supabaseClient";
import * as api from "../../services/api";
import { copyToClipboard } from "../../utils/clipboard";

interface Props {
  isConnected: boolean;
}

interface SigeProduct {
  id?: string | number;
  codProduto?: string;
  codigo?: string;
  descProdutoEst?: string;
  descricao?: string;
  descProduto?: string;
  tipoProduto?: string;
  [key: string]: any;
}

interface ProductWithBalance {
  product: SigeProduct;
  balance: {
    loading: boolean;
    error?: string;
    quantidade?: number;
    reservado?: number;
    disponivel?: number;
    found: boolean;
    raw?: any;
  } | null;
}

export function SigeStockExplorer({ isConnected }: Props) {
  const [expanded, setExpanded] = useState(false);

  // Search state
  const [searchMode, setSearchMode] = useState<"list" | "sku">("list");
  const [limit, setLimit] = useState("20");
  const [offset, setOffset] = useState("1");
  const [codProduto, setCodProduto] = useState("");
  const [descFilter, setDescFilter] = useState("");
  const [tipoProduto, setTipoProduto] = useState("");

  // Single SKU lookup
  const [singleSku, setSingleSku] = useState("");
  const [singleResult, setSingleResult] = useState<any>(null);
  const [singleLoading, setSingleLoading] = useState(false);
  const [singleError, setSingleError] = useState("");

  // Results
  const [products, setProducts] = useState<ProductWithBalance[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [rawResponse, setRawResponse] = useState<any>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  // Balance loading
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [balanceProgress, setBalanceProgress] = useState({ done: 0, total: 0 });

  // Expanded detail
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);

  const abortRef = useRef(false);

  const getAccessToken = useCallback(async (): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Sessao expirada");
    return session.access_token;
  }, []);

  // ── Search SIGE products ──
  const handleSearch = async () => {
    setSearching(true);
    setProducts([]);
    setError("");
    setRawResponse(null);
    abortRef.current = false;
    try {
      const token = await getAccessToken();
      const params: Record<string, string> = {};
      if (limit.trim()) params.limit = limit.trim();
      if (offset.trim()) params.offset = offset.trim();
      if (codProduto.trim()) params.codProduto = codProduto.trim();
      if (descFilter.trim()) params.descProdutoEst = descFilter.trim();
      if (tipoProduto.trim()) params.tipoProduto = tipoProduto.trim();

      console.log("[StockExplorer] Calling sigeProductGet with params:", params);
      const result = await api.sigeProductGet(token, params);
      console.log("[StockExplorer] Raw API response:", result);
      setRawResponse(result);

      // Deep extract products array — try many possible formats
      let items: SigeProduct[] = [];
      if (Array.isArray(result)) {
        items = result;
      } else if (result && typeof result === "object") {
        // Try common wrapper keys
        for (const key of ["dados", "data", "items", "content", "products", "results", "records", "rows", "list"]) {
          const candidate = result[key];
          if (Array.isArray(candidate) && candidate.length > 0) {
            items = candidate;
            console.log(`[StockExplorer] Found ${items.length} products under key "${key}"`);
            break;
          }
        }
        // If still empty, check nested .data.data (double wrap)
        if (items.length === 0 && result.data && typeof result.data === "object") {
          for (const key of ["dados", "data", "items", "content", "products", "results"]) {
            const candidate = result.data[key];
            if (Array.isArray(candidate) && candidate.length > 0) {
              items = candidate;
              console.log(`[StockExplorer] Found ${items.length} products under data.${key}`);
              break;
            }
          }
          // If result.data itself is an array
          if (items.length === 0 && Array.isArray(result.data)) {
            items = result.data;
            console.log(`[StockExplorer] Found ${items.length} products in result.data (array)`);
          }
        }
        // Last resort: if result is a single product object
        if (items.length === 0 && (result.codProduto || result.id || result.descProdutoEst)) {
          items = [result];
          console.log("[StockExplorer] Result appears to be a single product object");
        }
      }

      console.log(`[StockExplorer] Extracted ${items.length} products`);

      if (items.length === 0 && result && !result.error) {
        // Show a diagnostic warning
        const keys = result && typeof result === "object" ? Object.keys(result) : [];
        setError(`A API SIGE respondeu mas nao conseguimos extrair produtos. Chaves na resposta: [${keys.join(", ")}]. Veja o JSON bruto abaixo.`);
        setShowRaw(true);
      }

      const mapped: ProductWithBalance[] = items.map((p) => ({
        product: p,
        balance: null,
      }));
      setProducts(mapped);

      // Auto-fetch balances
      if (mapped.length > 0) {
        fetchBalancesForProducts(mapped, token);
      }
    } catch (e: any) {
      console.error("[StockExplorer] Error:", e);
      setError(e.message || "Erro ao buscar produtos no SIGE.");
    } finally {
      setSearching(false);
    }
  };

  // ── Fetch balances for all products ──
  const fetchBalancesForProducts = async (prods: ProductWithBalance[], token: string) => {
    setLoadingBalances(true);
    setBalanceProgress({ done: 0, total: prods.length });

    const updated = [...prods];
    const BATCH = 3;

    for (let i = 0; i < updated.length; i += BATCH) {
      if (abortRef.current) break;
      const batch = updated.slice(i, i + BATCH);
      await Promise.all(
        batch.map(async (item, bIdx) => {
          const idx = i + bIdx;
          const p = item.product;
          const pid = String(p.id || p.codProduto || p.codigo || "");
          if (!pid) {
            updated[idx] = {
              ...item,
              balance: { loading: false, found: false, error: "Sem ID" },
            };
            return;
          }
          updated[idx] = {
            ...item,
            balance: { loading: true, found: false },
          };
          try {
            const balRes = await api.sigeProductBalanceGet(token, pid);
            const balData = balRes?.data || balRes;

            // Parse balance — expanded field detection for SIGE
            const QTD_KEYS = ["quantidade","qtdSaldo","saldo","saldoFisico","saldoAtual","qtdFisica","qtdEstoque","qtd","estoque","qtde","qtdAtual","qtdTotal","saldoTotal","qtdSaldoFisico","vlSaldo","vlrSaldo"];
            const RES_KEYS = ["reservado","qtdReservado","qtdReserva","saldoReservado","qtdReservada","vlReservado"];
            const DISP_KEYS = ["disponivel","qtdDisponivel","saldoDisponivel","qtdDisp","vlDisponivel"];

            function tryNumFields(obj: any, fields: string[]): number {
              for (const k of fields) {
                if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") {
                  const v = Number(obj[k]);
                  if (!isNaN(v) && v !== 0) return v;
                }
              }
              return 0;
            }
            function autoDetect(obj: any): number {
              const skip = /^(cod|id|num|pagina|qtdRegistro|qtdPagina|grade|divisao|unidade)/i;
              for (const [k, v] of Object.entries(obj)) {
                if (typeof v === "number" && v > 0 && !skip.test(k)) return v;
                if (typeof v === "string" && !isNaN(Number(v)) && Number(v) > 0 && !skip.test(k)) return Number(v);
              }
              return 0;
            }

            let items2: any[] = [];
            if (Array.isArray(balData)) items2 = balData;
            else if (balData?.dados && Array.isArray(balData.dados)) items2 = balData.dados;
            else if (balData?.data && Array.isArray(balData.data)) items2 = balData.data;
            else if (balData?.items && Array.isArray(balData.items)) items2 = balData.items;
            else if (balData?.content && Array.isArray(balData.content)) items2 = balData.content;

            let totalQtd = 0, totalRes = 0, totalDisp = 0;
            if (items2.length > 0) {
              console.log(`[StockExplorer] Balance for ${pid}: ${items2.length} items, keys=[${Object.keys(items2[0]).join(",")}]`);
              for (const it of items2) {
                let q = tryNumFields(it, QTD_KEYS);
                if (q === 0) q = autoDetect(it);
                const r = tryNumFields(it, RES_KEYS);
                totalQtd += q;
                totalRes += r;
              }
              totalDisp = totalQtd - totalRes;
            } else if (typeof balData === "object" && balData !== null && !balData.error) {
              let q = tryNumFields(balData, QTD_KEYS);
              if (q === 0) q = autoDetect(balData);
              totalQtd = q;
              totalRes = tryNumFields(balData, RES_KEYS);
              totalDisp = totalQtd - totalRes;
              if (totalQtd === 0) {
                console.log(`[StockExplorer] Balance for ${pid}: no qty found. Keys=[${Object.keys(balData).join(",")}]`, balData);
              }
            }

            updated[idx] = {
              ...item,
              balance: {
                loading: false,
                found: true,
                quantidade: totalQtd,
                reservado: totalRes,
                disponivel: totalDisp,
                raw: balData,
              },
            };
          } catch (e: any) {
            updated[idx] = {
              ...item,
              balance: {
                loading: false,
                found: false,
                error: e.message || "Erro",
                raw: null,
              },
            };
          }
        })
      );
      setProducts([...updated]);
      setBalanceProgress({ done: Math.min(i + BATCH, updated.length), total: updated.length });
    }
    setLoadingBalances(false);
  };

  // ── Single SKU deep lookup (uses the 6-strategy endpoint) ──
  const handleSingleLookup = async () => {
    if (!singleSku.trim()) { setSingleError("Informe um SKU."); return; }
    setSingleLoading(true);
    setSingleResult(null);
    setSingleError("");
    try {
      const result = await api.getProductBalance(singleSku.trim(), { force: true, debug: true });
      setSingleResult(result);
    } catch (e: any) {
      setSingleError(e.message || "Erro ao buscar saldo.");
    } finally {
      setSingleLoading(false);
    }
  };

  const handleCopy = (data: any) => {
    copyToClipboard(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getProductId = (p: SigeProduct) => String(p.id || p.codProduto || p.codigo || "—");
  const getProductDesc = (p: SigeProduct) => p.descProdutoEst || p.descricao || p.descProduto || "(sem descricao)";

  // Stats
  const withBalance = products.filter((p) => p.balance && !p.balance.loading && p.balance.found);
  const inStock = withBalance.filter((p) => (p.balance!.disponivel ?? p.balance!.quantidade ?? 0) > 0).length;
  const outOfStock = withBalance.filter((p) => (p.balance!.disponivel ?? p.balance!.quantidade ?? 0) === 0).length;
  const balErrors = products.filter((p) => p.balance && !p.balance.loading && !p.balance.found).length;

  const inputClass = "w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 placeholder-gray-400 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 focus:bg-white transition-all";
  const inputStyle = { fontSize: "0.8rem" } as const;
  const btnPrimary = "flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50";

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-5 flex items-center gap-3 hover:bg-gray-50/30 transition-colors cursor-pointer"
      >
        <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center shrink-0">
          <Zap className="w-5 h-5 text-red-600" />
        </div>
        <div className="text-left flex-1">
          <p className="text-gray-800" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
            Consultar Produtos SIGE + Saldo
          </p>
          <p className="text-gray-400" style={{ fontSize: "0.7rem" }}>
            Busque produtos no SIGE e veja o saldo em tempo real
          </p>
        </div>
        <span
          className="px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 rounded-full shrink-0"
          style={{ fontSize: "0.68rem", fontWeight: 600 }}
        >
          Diagnostico
        </span>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4">
          {!isConnected && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-amber-700" style={{ fontSize: "0.78rem" }}>
                Conecte-se ao SIGE primeiro para usar esta funcionalidade.
              </p>
            </div>
          )}

          {/* Tab bar */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setSearchMode("list")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md transition-colors ${
                searchMode === "list"
                  ? "bg-white text-red-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
              style={{ fontSize: "0.78rem", fontWeight: 600 }}
            >
              <Package className="w-3.5 h-3.5" />
              Listar Produtos + Saldo
            </button>
            <button
              onClick={() => setSearchMode("sku")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md transition-colors ${
                searchMode === "sku"
                  ? "bg-white text-red-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
              style={{ fontSize: "0.78rem", fontWeight: 600 }}
            >
              <Search className="w-3.5 h-3.5" />
              Consulta SKU (6 estrategias)
            </button>
          </div>

          {/* ════════════════════════════════════ */}
          {/* TAB: List Products + Balance         */}
          {/* ════════════════════════════════════ */}
          {searchMode === "list" && (
            <div className="space-y-3">
              {/* Search filters */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                <p className="text-gray-600 flex items-center gap-1.5" style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                  <Search className="w-3.5 h-3.5" /> Filtros de busca SIGE
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-gray-500 mb-1" style={{ fontSize: "0.7rem", fontWeight: 500 }}>codProduto</label>
                    <div className="relative">
                      <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input
                        value={codProduto}
                        onChange={(e) => setCodProduto(e.target.value)}
                        placeholder="Ex: 1234"
                        className={inputClass}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-gray-500 mb-1" style={{ fontSize: "0.7rem", fontWeight: 500 }}>descProdutoEst</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input
                        value={descFilter}
                        onChange={(e) => setDescFilter(e.target.value)}
                        placeholder="Descricao..."
                        className={inputClass}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-gray-500 mb-1" style={{ fontSize: "0.7rem", fontWeight: 500 }}>tipoProduto</label>
                    <select
                      value={tipoProduto}
                      onChange={(e) => setTipoProduto(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                      style={{ fontSize: "0.8rem" }}
                    >
                      <option value="">Todos</option>
                      <option value="PA">PA - Produto Acabado</option>
                      <option value="PC">PC - Pecas Compradas</option>
                      <option value="PF">PF - Pecas Fabricadas</option>
                      <option value="PP">PP - Pecas Processadas</option>
                      <option value="SE">SE - Servicos</option>
                      <option value="MP">MP - Materia Prima</option>
                      <option value="MC">MC - Material Consumo</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-gray-500 mb-1" style={{ fontSize: "0.7rem", fontWeight: 500 }}>limit</label>
                    <input
                      value={limit}
                      onChange={(e) => setLimit(e.target.value)}
                      placeholder="20"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 outline-none focus:border-red-400"
                      style={{ fontSize: "0.8rem" }}
                    />
                  </div>
                  <div>
                    <label className="block text-gray-500 mb-1" style={{ fontSize: "0.7rem", fontWeight: 500 }}>offset</label>
                    <input
                      value={offset}
                      onChange={(e) => setOffset(e.target.value)}
                      placeholder="1"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 outline-none focus:border-red-400"
                      style={{ fontSize: "0.8rem" }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSearch}
                    disabled={searching || !isConnected}
                    className={btnPrimary}
                    style={{ fontSize: "0.8rem", fontWeight: 600 }}
                  >
                    {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    Buscar Produtos + Saldo
                  </button>
                  {products.length > 0 && (
                    <button
                      onClick={() => { setProducts([]); setRawResponse(null); setError(""); }}
                      className="px-3 py-2 text-gray-500 hover:text-red-600 border border-gray-200 rounded-lg transition-colors"
                      style={{ fontSize: "0.8rem" }}
                    >
                      Limpar
                    </button>
                  )}
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                  <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-red-700" style={{ fontSize: "0.78rem" }}>{error}</p>
                </div>
              )}

              {/* Stats bar */}
              {products.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-lg">
                    <Package className="w-3.5 h-3.5 text-gray-500" />
                    <span className="text-gray-700" style={{ fontSize: "0.75rem", fontWeight: 600 }}>{products.length} produtos</span>
                  </div>
                  {loadingBalances ? (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
                      <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                      <span className="text-blue-700" style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                        Verificando saldos... {balanceProgress.done}/{balanceProgress.total}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-1 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg">
                        <PackageCheck className="w-3.5 h-3.5 text-green-600" />
                        <span className="text-green-700" style={{ fontSize: "0.75rem", fontWeight: 600 }}>{inStock} com estoque</span>
                      </div>
                      <div className="flex items-center gap-1 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg">
                        <PackageX className="w-3.5 h-3.5 text-red-500" />
                        <span className="text-red-700" style={{ fontSize: "0.75rem", fontWeight: 600 }}>{outOfStock} sem estoque</span>
                      </div>
                      {balErrors > 0 && (
                        <div className="flex items-center gap-1 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                          <span className="text-amber-700" style={{ fontSize: "0.75rem", fontWeight: 600 }}>{balErrors} erro(s)</span>
                        </div>
                      )}
                    </>
                  )}
                  <button
                    onClick={() => setShowRaw(!showRaw)}
                    className="ml-auto px-2.5 py-1.5 text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg transition-colors"
                    style={{ fontSize: "0.7rem" }}
                  >
                    {showRaw ? "Ocultar JSON" : "Ver JSON bruto"}
                  </button>
                </div>
              )}

              {/* Diagnostic: when all balances loaded but all zero */}
              {!loadingBalances && products.length > 0 && withBalance.length > 0 && inStock === 0 && (() => {
                const firstBal = products.find(p => p.balance?.raw)?.balance;
                if (!firstBal?.raw) return null;
                const raw = firstBal.raw;
                const topKeys = raw && typeof raw === "object" ? Object.keys(raw) : [];
                let sampleItemKeys: string[] = [];
                if (raw?.dados && Array.isArray(raw.dados) && raw.dados.length > 0) sampleItemKeys = Object.keys(raw.dados[0]);
                else if (Array.isArray(raw) && raw.length > 0) sampleItemKeys = Object.keys(raw[0]);
                else if (raw?.data && Array.isArray(raw.data) && raw.data.length > 0) sampleItemKeys = Object.keys(raw.data[0]);
                return (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-amber-800" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                          Todos os saldos vieram zerados — possivel formato de campo nao reconhecido
                        </p>
                        <p className="text-amber-700 mt-1" style={{ fontSize: "0.72rem" }}>
                          <strong>Chaves top-level da resposta de saldo:</strong> [{topKeys.join(", ")}]
                        </p>
                        {sampleItemKeys.length > 0 && (
                          <p className="text-amber-700" style={{ fontSize: "0.72rem" }}>
                            <strong>Chaves do item de saldo:</strong> [{sampleItemKeys.join(", ")}]
                          </p>
                        )}
                        <p className="text-amber-600 mt-1" style={{ fontSize: "0.68rem" }}>
                          Clique no icone de olho em qualquer produto para ver o JSON bruto completo da resposta de saldo.
                        </p>
                      </div>
                    </div>
                    <pre className="bg-white border border-amber-100 rounded-lg p-2 text-gray-700 overflow-x-auto max-h-40" style={{ fontSize: "0.6rem" }}>
                      {JSON.stringify(raw, null, 2)}
                    </pre>
                  </div>
                );
              })()}

              {/* Products table */}
              {products.length > 0 && (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="text-left px-4 py-2.5 text-gray-500" style={{ fontSize: "0.7rem", fontWeight: 600 }}>#</th>
                          <th className="text-left px-4 py-2.5 text-gray-500" style={{ fontSize: "0.7rem", fontWeight: 600 }}>ID/Cod</th>
                          <th className="text-left px-4 py-2.5 text-gray-500" style={{ fontSize: "0.7rem", fontWeight: 600 }}>Descricao</th>
                          <th className="text-left px-4 py-2.5 text-gray-500" style={{ fontSize: "0.7rem", fontWeight: 600 }}>Tipo</th>
                          <th className="text-right px-4 py-2.5 text-gray-500" style={{ fontSize: "0.7rem", fontWeight: 600 }}>Qtd</th>
                          <th className="text-right px-4 py-2.5 text-gray-500" style={{ fontSize: "0.7rem", fontWeight: 600 }}>Reserv.</th>
                          <th className="text-right px-4 py-2.5 text-gray-500" style={{ fontSize: "0.7rem", fontWeight: 600 }}>Disp.</th>
                          <th className="text-center px-4 py-2.5 text-gray-500" style={{ fontSize: "0.7rem", fontWeight: 600 }}>Status</th>
                          <th className="text-center px-4 py-2.5 text-gray-500" style={{ fontSize: "0.7rem", fontWeight: 600 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {products.map((item, idx) => {
                          const p = item.product;
                          const b = item.balance;
                          const pid = getProductId(p);
                          const isExpanded = expandedProduct === pid;
                          const avail = b && b.found ? (b.disponivel ?? b.quantidade ?? 0) : null;

                          return (
                            <tr
                              key={`${pid}-${idx}`}
                              className={`border-b border-gray-100 transition-colors ${
                                isExpanded ? "bg-blue-50/30" : "hover:bg-gray-50/50"
                              }`}
                            >
                              <td className="px-4 py-2.5 text-gray-400" style={{ fontSize: "0.72rem" }}>{idx + 1}</td>
                              <td className="px-4 py-2.5">
                                <span className="font-mono text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded" style={{ fontSize: "0.72rem" }}>
                                  {pid}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-gray-700 max-w-[300px] truncate" style={{ fontSize: "0.78rem" }}>
                                {getProductDesc(p)}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className="text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded" style={{ fontSize: "0.68rem" }}>
                                  {p.tipoProduto || "—"}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                {b === null || b.loading ? (
                                  <Loader2 className="w-3.5 h-3.5 text-gray-300 animate-spin ml-auto" />
                                ) : b.found ? (
                                  <span className="text-gray-700" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                                    {b.quantidade ?? 0}
                                  </span>
                                ) : (
                                  <span className="text-gray-300" style={{ fontSize: "0.72rem" }}>—</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                {b && !b.loading && b.found ? (
                                  <span className="text-gray-500" style={{ fontSize: "0.78rem" }}>
                                    {b.reservado ?? 0}
                                  </span>
                                ) : (
                                  <span className="text-gray-300" style={{ fontSize: "0.72rem" }}>—</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                {b && !b.loading && b.found ? (
                                  <span
                                    className={`${avail! > 0 ? "text-green-700" : "text-red-600"}`}
                                    style={{ fontSize: "0.78rem", fontWeight: 700 }}
                                  >
                                    {b.disponivel ?? 0}
                                  </span>
                                ) : (
                                  <span className="text-gray-300" style={{ fontSize: "0.72rem" }}>—</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                {b === null || b.loading ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-400 rounded-full" style={{ fontSize: "0.65rem" }}>
                                    <Loader2 className="w-2.5 h-2.5 animate-spin" /> Carregando
                                  </span>
                                ) : b.found ? (
                                  avail! > 0 ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full" style={{ fontSize: "0.65rem", fontWeight: 600 }}>
                                      <PackageCheck className="w-2.5 h-2.5" /> Disponivel
                                    </span>
                                  ) : (
                                    <div className="inline-flex flex-col items-center gap-0.5">
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-600 rounded-full" style={{ fontSize: "0.65rem", fontWeight: 600 }}>
                                        <PackageX className="w-2.5 h-2.5" /> Zerado
                                      </span>
                                      {b.raw && typeof b.raw === "object" && (
                                        <span className="text-gray-400" style={{ fontSize: "0.55rem" }} title={JSON.stringify(Object.keys(b.raw))}>
                                          keys: {Object.keys(b.raw).slice(0, 3).join(",")}...
                                        </span>
                                      )}
                                    </div>
                                  )
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full" style={{ fontSize: "0.65rem", fontWeight: 600 }}>
                                    <AlertTriangle className="w-2.5 h-2.5" /> {b.error ? "Erro" : "N/A"}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <button
                                  onClick={() => setExpandedProduct(isExpanded ? null : pid)}
                                  className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                                  title="Ver detalhes"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination controls */}
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200">
                    <button
                      onClick={() => {
                        const newOffset = Math.max(1, parseInt(offset || "1") - parseInt(limit || "20"));
                        setOffset(String(newOffset));
                        setTimeout(handleSearch, 50);
                      }}
                      disabled={parseInt(offset || "1") <= 1 || searching}
                      className="flex items-center gap-1 px-3 py-1.5 text-gray-500 hover:text-red-600 border border-gray-200 rounded-lg transition-colors disabled:opacity-30"
                      style={{ fontSize: "0.75rem" }}
                    >
                      <ChevronLeft className="w-3.5 h-3.5" /> Anterior
                    </button>
                    <span className="text-gray-400" style={{ fontSize: "0.72rem" }}>
                      Offset: {offset} | Limit: {limit}
                    </span>
                    <button
                      onClick={() => {
                        const newOffset = parseInt(offset || "1") + parseInt(limit || "20");
                        setOffset(String(newOffset));
                        setTimeout(handleSearch, 50);
                      }}
                      disabled={products.length < parseInt(limit || "20") || searching}
                      className="flex items-center gap-1 px-3 py-1.5 text-gray-500 hover:text-red-600 border border-gray-200 rounded-lg transition-colors disabled:opacity-30"
                      style={{ fontSize: "0.75rem" }}
                    >
                      Proximo <ChevronRightIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Expanded product detail */}
              {expandedProduct && products.find((p) => getProductId(p.product) === expandedProduct) && (() => {
                const item = products.find((p) => getProductId(p.product) === expandedProduct)!;
                return (
                  <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-blue-800" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                        Detalhes: {getProductId(item.product)} — {getProductDesc(item.product)}
                      </p>
                      <button
                        onClick={() => handleCopy({ product: item.product, balance: item.balance })}
                        className="flex items-center gap-1 px-2 py-1 text-blue-600 hover:text-blue-800 border border-blue-200 rounded-lg transition-colors"
                        style={{ fontSize: "0.7rem" }}
                      >
                        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copied ? "Copiado!" : "Copiar"}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <p className="text-blue-700 mb-1" style={{ fontSize: "0.7rem", fontWeight: 600 }}>Produto (SIGE)</p>
                        <pre className="bg-white border border-blue-100 rounded-lg p-3 text-gray-700 overflow-x-auto max-h-60" style={{ fontSize: "0.68rem" }}>
                          {JSON.stringify(item.product, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <p className="text-blue-700 mb-1" style={{ fontSize: "0.7rem", fontWeight: 600 }}>Saldo (Balance)</p>
                        <pre className="bg-white border border-blue-100 rounded-lg p-3 text-gray-700 overflow-x-auto max-h-60" style={{ fontSize: "0.68rem" }}>
                          {JSON.stringify(item.balance, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Raw JSON — show when toggled OR when products couldn't be parsed */}
              {rawResponse && (showRaw || (products.length === 0 && !searching)) && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-gray-600" style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                      Resposta bruta da API SIGE
                      {products.length === 0 && <span className="text-amber-600 ml-2">(nenhum produto extraido — analise a estrutura)</span>}
                    </p>
                    <button
                      onClick={() => handleCopy(rawResponse)}
                      className="flex items-center gap-1 px-2 py-1 text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg transition-colors"
                      style={{ fontSize: "0.7rem" }}
                    >
                      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copied ? "Copiado!" : "Copiar"}
                    </button>
                  </div>
                  <pre className="bg-white border border-gray-100 rounded-lg p-3 text-gray-700 overflow-x-auto max-h-80" style={{ fontSize: "0.65rem" }}>
                    {JSON.stringify(rawResponse, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════ */}
          {/* TAB: Single SKU deep lookup          */}
          {/* ════════════════════════════════════ */}
          {searchMode === "sku" && (
            <div className="space-y-3">
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-gray-600" style={{ fontSize: "0.75rem" }}>
                    Esta consulta usa o endpoint <code className="bg-gray-200 px-1 rounded text-red-600">GET /produtos/saldo/:sku</code> com
                    <strong> ?force=1&debug=1</strong>, que executa as 6 estrategias de busca sequenciais e retorna logs detalhados.
                    Ideal para diagnosticar por que um produto nao esta sendo encontrado.
                  </p>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input
                      value={singleSku}
                      onChange={(e) => setSingleSku(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSingleLookup()}
                      placeholder="SKU do produto (ex: 1234, ABC-001)"
                      className={inputClass}
                      style={inputStyle}
                    />
                  </div>
                  <button
                    onClick={handleSingleLookup}
                    disabled={singleLoading || !isConnected}
                    className={btnPrimary}
                    style={{ fontSize: "0.8rem", fontWeight: 600 }}
                  >
                    {singleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Consultar
                  </button>
                </div>
              </div>

              {singleError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                  <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-red-700" style={{ fontSize: "0.78rem" }}>{singleError}</p>
                </div>
              )}

              {singleResult && (
                <div className="space-y-3">
                  {/* Summary card */}
                  <div className={`border rounded-xl p-4 ${
                    singleResult.found
                      ? (singleResult.disponivel ?? singleResult.quantidade ?? 0) > 0
                        ? "bg-green-50/50 border-green-200"
                        : "bg-red-50/50 border-red-200"
                      : "bg-amber-50/50 border-amber-200"
                  }`}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        singleResult.found
                          ? (singleResult.disponivel ?? singleResult.quantidade ?? 0) > 0
                            ? "bg-green-100"
                            : "bg-red-100"
                          : "bg-amber-100"
                      }`}>
                        {singleResult.found ? (
                          (singleResult.disponivel ?? singleResult.quantidade ?? 0) > 0
                            ? <PackageCheck className="w-5 h-5 text-green-600" />
                            : <PackageX className="w-5 h-5 text-red-500" />
                        ) : (
                          <AlertTriangle className="w-5 h-5 text-amber-600" />
                        )}
                      </div>
                      <div>
                        <p className="text-gray-800" style={{ fontSize: "0.85rem", fontWeight: 700 }}>
                          SKU: {singleResult.sku}
                          {singleResult.sigeId && singleResult.sigeId !== singleResult.sku && (
                            <span className="ml-2 text-gray-400" style={{ fontSize: "0.72rem", fontWeight: 400 }}>
                              (SIGE ID: {singleResult.sigeId})
                            </span>
                          )}
                        </p>
                        {singleResult.descricao && (
                          <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>{singleResult.descricao}</p>
                        )}
                      </div>
                    </div>

                    {singleResult.found ? (
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-white rounded-lg p-3 text-center border border-gray-100">
                          <p className="text-gray-400" style={{ fontSize: "0.65rem", fontWeight: 500 }}>Quantidade</p>
                          <p className="text-gray-800" style={{ fontSize: "1.2rem", fontWeight: 700 }}>
                            {singleResult.quantidade ?? 0}
                          </p>
                        </div>
                        <div className="bg-white rounded-lg p-3 text-center border border-gray-100">
                          <p className="text-gray-400" style={{ fontSize: "0.65rem", fontWeight: 500 }}>Reservado</p>
                          <p className="text-gray-800" style={{ fontSize: "1.2rem", fontWeight: 700 }}>
                            {singleResult.reservado ?? 0}
                          </p>
                        </div>
                        <div className={`rounded-lg p-3 text-center border ${
                          (singleResult.disponivel ?? 0) > 0
                            ? "bg-green-50 border-green-200"
                            : "bg-red-50 border-red-200"
                        }`}>
                          <p className="text-gray-400" style={{ fontSize: "0.65rem", fontWeight: 500 }}>Disponivel</p>
                          <p className={(singleResult.disponivel ?? 0) > 0 ? "text-green-700" : "text-red-600"} style={{ fontSize: "1.2rem", fontWeight: 700 }}>
                            {singleResult.disponivel ?? 0}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-amber-700 bg-amber-100/50 p-2 rounded-lg" style={{ fontSize: "0.78rem" }}>
                        Produto nao encontrado no SIGE. Verifique os logs de debug abaixo para entender cada estrategia tentada.
                      </p>
                    )}

                    {/* Locais breakdown */}
                    {singleResult.locais && singleResult.locais.length > 0 && (
                      <div className="mt-3">
                        <p className="text-gray-600 mb-1.5" style={{ fontSize: "0.72rem", fontWeight: 600 }}>Por local/filial:</p>
                        <div className="space-y-1">
                          {singleResult.locais.map((l: any, i: number) => (
                            <div key={i} className="flex items-center justify-between bg-white rounded-lg px-3 py-1.5 border border-gray-100">
                              <span className="text-gray-600" style={{ fontSize: "0.72rem" }}>
                                {l.local || l.filial || `Local ${i + 1}`}
                                {l.filial && l.local && ` (Filial: ${l.filial})`}
                              </span>
                              <span className={`${l.disponivel > 0 ? "text-green-700" : "text-gray-400"}`} style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                                {l.disponivel ?? l.quantidade ?? 0}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Debug logs */}
                  {singleResult._debug && singleResult._debug.length > 0 && (
                    <div className="bg-gray-900 rounded-xl p-4 overflow-x-auto">
                      <p className="text-gray-400 mb-2" style={{ fontSize: "0.7rem", fontWeight: 600 }}>Debug Log (6 estrategias)</p>
                      <div className="space-y-0.5">
                        {singleResult._debug.map((line: string, i: number) => (
                          <p key={i} className="font-mono text-green-400" style={{ fontSize: "0.65rem" }}>{line}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* SIGE responses */}
                  {singleResult._sigeResponses && singleResult._sigeResponses.length > 0 && (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                      <p className="text-gray-600 mb-2" style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                        Respostas da API SIGE ({singleResult._sigeResponses.length} chamadas)
                      </p>
                      <div className="space-y-2">
                        {singleResult._sigeResponses.map((resp: any, i: number) => (
                          <div key={i} className="bg-white border border-gray-100 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`px-1.5 py-0.5 rounded text-white ${resp.ok ? "bg-green-500" : "bg-red-500"}`} style={{ fontSize: "0.6rem", fontWeight: 700 }}>
                                {resp.status || "?"}
                              </span>
                              <span className="text-gray-600 font-mono" style={{ fontSize: "0.68rem" }}>{resp.step || resp.path}</span>
                            </div>
                            <pre className="text-gray-500 overflow-x-auto max-h-32" style={{ fontSize: "0.62rem" }}>
                              {JSON.stringify(resp.data, null, 2)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Full JSON */}
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-gray-600" style={{ fontSize: "0.72rem", fontWeight: 600 }}>Resposta completa</p>
                      <button
                        onClick={() => handleCopy(singleResult)}
                        className="flex items-center gap-1 px-2 py-1 text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg transition-colors"
                        style={{ fontSize: "0.7rem" }}
                      >
                        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copied ? "Copiado!" : "Copiar JSON"}
                      </button>
                    </div>
                    <pre className="bg-white border border-gray-100 rounded-lg p-3 text-gray-700 overflow-x-auto max-h-60" style={{ fontSize: "0.65rem" }}>
                      {JSON.stringify(singleResult, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}