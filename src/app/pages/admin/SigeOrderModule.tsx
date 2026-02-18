import { useState, useCallback } from "react";
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  XCircle,
  Search,
  Plus,
  Hash,
  Copy,
  Check,
  Info,
  ChevronUp,
  ShoppingBag,
  Building2,
  CalendarDays,
  FileDigit,
  ToggleLeft,
} from "lucide-react";
import { supabase } from "../../services/supabaseClient";
import * as api from "../../services/api";
import { copyToClipboard } from "../../utils/clipboard";

interface Props {
  isConnected: boolean;
}

type ActiveTab = "search" | "byId" | "create";

const EMPTY_ORDER = {
  codFilial: "",
  codCondPgto: "",
  codCliFor: 0,
  codLocal: "",
  codTipoMv: "",
  codVendComp: 0,
  codTransportador1: 0,
  tipoFrete1: "",
  nomeAux: "",
  numDoctoAux: "",
  codCarteira: 0,
  codLista: 0,
  codCategoria: "",
  codMoeda: 0,
  codAtividade: 0,
  observacaoInterna: "",
  valorV1: 0,
  observacao: {
    descMensagem1: "",
    descMensagem2: "",
    descMensagem3: "",
    descMensagem4: "",
    observacao: "",
  },
  items: [
    {
      codProduto: "",
      codRef: "",
      qtdeUnd: 0,
      valorUnitario: 0,
      valorDesconto: 0,
      valorFrete: 0,
      valorEncargos: 0,
      valorSeguro: 0,
      valorIpi: 0,
      numLote: "",
      qtdeV1: 0,
      qtdeV2: 0,
      codMensagem: "",
      codCbenef: "",
      url: "",
      ncm: "",
    },
  ],
};

const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "A", label: "A - Aberto" },
  { value: "C", label: "C - Cancelado" },
  { value: "F", label: "F - Faturado" },
  { value: "N", label: "N - Outro" },
];

const STATUS_CTB_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "S", label: "S - Faturado" },
  { value: "N", label: "N - Nao Faturado" },
];

export function SigeOrderModule({ isConnected }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("search");

  // Search params
  const [sLimit, setSLimit] = useState("50");
  const [sOffset, setSOffset] = useState("1");
  const [sStatus, setSStatus] = useState("");
  const [sStatusCtb, setSStatusCtb] = useState("");
  const [sCodFilial, setSCodFilial] = useState("");
  const [sCodCliFor, setSCodCliFor] = useState("");
  const [sCodTipoMv, setSCodTipoMv] = useState("");
  const [sCodCarteira, setSCodCarteira] = useState("");
  const [sCodDocto, setSCodDocto] = useState("");
  const [sSerieSeq, setSSerieSeq] = useState("");
  const [sDataMovto, setSDataMovto] = useState("");
  const [sNumDocto, setSNumDocto] = useState("");
  const [sQtdeItens, setSQtdeItens] = useState("");
  const [sCodAtividade, setSCodAtividade] = useState("");
  const [sNomeAux, setSNomeAux] = useState("");
  const [sNumDoctoAux, setSNumDoctoAux] = useState("");
  const [sObsInterna, setSObsInterna] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<any>(null);
  const [searchError, setSearchError] = useState("");

  // By ID
  const [bId, setBId] = useState("");
  const [fetchingById, setFetchingById] = useState(false);
  const [byIdResult, setByIdResult] = useState<any>(null);
  const [byIdError, setByIdError] = useState("");

  // Create
  const [createJson, setCreateJson] = useState(JSON.stringify(EMPTY_ORDER, null, 2));
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<any>(null);
  const [createError, setCreateError] = useState("");

  const [copied, setCopied] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const getAccessToken = useCallback(async (): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Sessao expirada");
    return session.access_token;
  }, []);

  const handleSearch = async () => {
    setSearching(true); setSearchResult(null); setSearchError("");
    try {
      const token = await getAccessToken();
      const params: Record<string, string> = {};
      if (sLimit.trim()) params.limit = sLimit.trim();
      if (sOffset.trim()) params.offset = sOffset.trim();
      if (sStatus.trim()) params.status = sStatus.trim();
      if (sStatusCtb.trim()) params.statusCtb = sStatusCtb.trim();
      if (sCodFilial.trim()) params.codFilial = sCodFilial.trim();
      if (sCodCliFor.trim()) params.codCliFor = sCodCliFor.trim();
      if (sCodTipoMv.trim()) params.codTipoMv = sCodTipoMv.trim();
      if (sCodCarteira.trim()) params.codCarteira = sCodCarteira.trim();
      if (sCodDocto.trim()) params.codDocto = sCodDocto.trim();
      if (sSerieSeq.trim()) params.serieSeq = sSerieSeq.trim();
      if (sDataMovto.trim()) params.dataMovto = sDataMovto.trim();
      if (sNumDocto.trim()) params.numDocto = sNumDocto.trim();
      if (sQtdeItens.trim()) params.qtdeItens = sQtdeItens.trim();
      if (sCodAtividade.trim()) params.codAtividade = sCodAtividade.trim();
      if (sNomeAux.trim()) params.nomeAux = sNomeAux.trim();
      if (sNumDoctoAux.trim()) params.numDoctoAux = sNumDoctoAux.trim();
      if (sObsInterna.trim()) params.observacaoInterna = sObsInterna.trim();
      const res = await api.sigeOrderSearch(token, params);
      setSearchResult(res);
    } catch (e: any) {
      setSearchError(e.message || "Erro ao buscar pedidos.");
    } finally { setSearching(false); }
  };

  const handleGetById = async () => {
    if (!bId.trim()) { setByIdError("Informe o ID (chave fato)."); return; }
    setFetchingById(true); setByIdResult(null); setByIdError("");
    try {
      const token = await getAccessToken();
      const res = await api.sigeOrderGetById(token, bId.trim());
      setByIdResult(res);
    } catch (e: any) {
      setByIdError(e.message || "Erro ao buscar pedido.");
    } finally { setFetchingById(false); }
  };

  const handleCreate = async () => {
    setCreating(true); setCreateResult(null); setCreateError("");
    try {
      let body: any;
      try { body = JSON.parse(createJson); } catch { setCreateError("JSON invalido."); setCreating(false); return; }
      const token = await getAccessToken();
      const res = await api.sigeOrderCreate(token, body);
      setCreateResult(res);
    } catch (e: any) {
      setCreateError(e.message || "Erro ao cadastrar pedido.");
    } finally { setCreating(false); }
  };

  const handleCopy = (data: any) => {
    copyToClipboard(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const inputClass = "w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 placeholder-gray-400 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 focus:bg-white transition-all";
  const inputStyle = { fontSize: "0.8rem" } as const;

  const tabs: { key: ActiveTab; label: string; icon: typeof Search; method: string; methodColor: string }[] = [
    { key: "search", label: "Buscar", icon: Search, method: "GET", methodColor: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    { key: "byId", label: "Por Chave", icon: Hash, method: "GET", methodColor: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    { key: "create", label: "Cadastrar", icon: Plus, method: "POST", methodColor: "bg-blue-100 text-blue-700 border-blue-200" },
  ];

  const ResultBlock = ({ result, error, label, onCopy }: { result: any; error: string; label: string; onCopy: () => void }) => (
    <>
      {error && (
        <div className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-100 rounded-lg">
          <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
          <p className="text-red-700" style={{ fontSize: "0.75rem" }}>{error}</p>
        </div>
      )}
      {result && (
        <div className="bg-gray-900 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
            <p className="text-green-400" style={{ fontSize: "0.68rem", fontWeight: 600 }}>{label}</p>
            <button onClick={onCopy}
              className="flex items-center gap-1 px-2 py-0.5 text-gray-400 hover:text-white rounded transition-colors cursor-pointer"
              style={{ fontSize: "0.65rem" }}>
              {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
          <div className="px-3 pb-3 overflow-x-auto max-h-[500px] overflow-y-auto">
            <pre className="text-gray-300" style={{ fontSize: "0.72rem", lineHeight: 1.5 }}>
              <code>{JSON.stringify(result, null, 2)}</code>
            </pre>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div>
      <button onClick={() => setExpanded(!expanded)}
        className="w-full p-5 flex items-center gap-3 hover:bg-gray-50/30 transition-colors cursor-pointer">
        <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center shrink-0">
          <ShoppingBag className="w-5 h-5 text-orange-600" />
        </div>
        <div className="text-left flex-1">
          <h4 className="text-gray-900" style={{ fontSize: "0.95rem", fontWeight: 700 }}>Pedidos</h4>
          <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>Buscar, buscar por chave fato e cadastrar orders — 3 endpoints</p>
        </div>
        <span className="px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 rounded-full shrink-0"
          style={{ fontSize: "0.68rem", fontWeight: 600 }}>Implementado</span>
        {expanded
          ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
          : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4">
          {/* Tab bar */}
          <div className="flex flex-wrap gap-1.5 p-1 bg-gray-100 rounded-lg">
            {tabs.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                  activeTab === tab.key
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}
                style={{ fontSize: "0.78rem", fontWeight: activeTab === tab.key ? 600 : 500 }}>
                <span className={`px-1.5 py-0.5 rounded border ${tab.methodColor}`}
                  style={{ fontSize: "0.6rem", fontWeight: 700, fontFamily: "monospace" }}>
                  {tab.method}
                </span>
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          {!isConnected && (
            <p className="text-amber-600 flex items-center gap-1.5" style={{ fontSize: "0.75rem" }}>
              <XCircle className="w-3.5 h-3.5" />
              Conecte-se ao SIGE primeiro.
            </p>
          )}

          <button onClick={() => setShowHelp(!showHelp)}
            className="flex items-center gap-1.5 text-orange-600 hover:text-orange-700 cursor-pointer"
            style={{ fontSize: "0.72rem", fontWeight: 600 }}>
            <Info className="w-3.5 h-3.5" />
            {showHelp ? "Ocultar" : "Ver"} referencia
            {showHelp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showHelp && (
            <div className="bg-gray-900 rounded-lg p-3">
              <pre className="text-gray-300" style={{ fontSize: "0.72rem", lineHeight: 1.6 }}>
                <code>{`// Regras de filtros do GET /order:
// status:    A=Aberto | C=Cancelado | F=Faturado | N=?
// statusCtb: S=Faturado | N=Nao Faturado
// dataMovto: YYYY-MM-DD (>=data) ou YYYY-MM-DD,YYYY-MM-DD (entre)
// limit: max 50 (padrao) | offset: pagina (padrao 1)

// POST /order — campos obrigatorios:
//   codCliFor, codTipoMv, items[]
// Tags opcionais usam config padrao do SIGE se omitidas
// codVendComp: buscar em /customer tipoCadastro>V
// codTransportador1: buscar em /customer tipoCadastro>T

// Items: array de objetos com codProduto, codRef,
//   qtdeUnd, valorUnitario, etc.`}</code>
              </pre>
            </div>
          )}

          {/* ─── GET /order ─── */}
          {activeTab === "search" && (
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              <div className="flex items-center gap-3 p-3 bg-gray-50/50">
                <span className="px-2.5 py-1 rounded border bg-emerald-100 text-emerald-700 border-emerald-200"
                  style={{ fontSize: "0.68rem", fontWeight: 700, fontFamily: "monospace" }}>GET</span>
                <code className="text-gray-800" style={{ fontSize: "0.85rem" }}>/order</code>
              </div>
              <div className="p-3 space-y-3">
                <p className="text-gray-600" style={{ fontSize: "0.78rem" }}>
                  Busca pedidos (orders) com ate 17 filtros opcionais.
                </p>

                {/* Basic filters */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="relative">
                    <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input type="number" value={sLimit} onChange={(e) => setSLimit(e.target.value)}
                      placeholder="limit (50)" className={inputClass} style={inputStyle} />
                  </div>
                  <div className="relative">
                    <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input type="number" value={sOffset} onChange={(e) => setSOffset(e.target.value)}
                      placeholder="offset (1)" className={inputClass} style={inputStyle} />
                  </div>
                  <div className="relative">
                    <ToggleLeft className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <select value={sStatus} onChange={(e) => setSStatus(e.target.value)}
                      className={`${inputClass} appearance-none`} style={inputStyle}>
                      {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="relative">
                    <ToggleLeft className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <select value={sStatusCtb} onChange={(e) => setSStatusCtb(e.target.value)}
                      className={`${inputClass} appearance-none`} style={inputStyle}>
                      {STATUS_CTB_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="relative">
                    <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input type="text" value={sCodFilial} onChange={(e) => setSCodFilial(e.target.value)}
                      placeholder="codFilial" className={inputClass} style={inputStyle} />
                  </div>
                  <div className="relative">
                    <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input type="text" value={sCodCliFor} onChange={(e) => setSCodCliFor(e.target.value)}
                      placeholder="codCliFor" className={inputClass} style={inputStyle} />
                  </div>
                  <div className="relative">
                    <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input type="text" value={sDataMovto} onChange={(e) => setSDataMovto(e.target.value)}
                      placeholder="dataMovto (YYYY-MM-DD)" className={inputClass} style={inputStyle} />
                  </div>
                </div>

                {/* Expandable extra filters */}
                <button onClick={() => setShowFilters(!showFilters)}
                  className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 cursor-pointer"
                  style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                  {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {showFilters ? "Ocultar" : "Mais"} filtros ({10} adicionais)
                </button>

                {showFilters && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="relative">
                        <FileDigit className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input type="text" value={sCodTipoMv} onChange={(e) => setSCodTipoMv(e.target.value)}
                          placeholder="codTipoMv" className={inputClass} style={inputStyle} />
                      </div>
                      <div className="relative">
                        <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input type="text" value={sCodCarteira} onChange={(e) => setSCodCarteira(e.target.value)}
                          placeholder="codCarteira" className={inputClass} style={inputStyle} />
                      </div>
                      <div className="relative">
                        <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input type="text" value={sCodDocto} onChange={(e) => setSCodDocto(e.target.value)}
                          placeholder="codDocto" className={inputClass} style={inputStyle} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="relative">
                        <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input type="text" value={sSerieSeq} onChange={(e) => setSSerieSeq(e.target.value)}
                          placeholder="serieSeq" className={inputClass} style={inputStyle} />
                      </div>
                      <div className="relative">
                        <FileDigit className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input type="text" value={sNumDocto} onChange={(e) => setSNumDocto(e.target.value)}
                          placeholder="numDocto" className={inputClass} style={inputStyle} />
                      </div>
                      <div className="relative">
                        <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input type="text" value={sQtdeItens} onChange={(e) => setSQtdeItens(e.target.value)}
                          placeholder="qtdeItens" className={inputClass} style={inputStyle} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="relative">
                        <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input type="text" value={sCodAtividade} onChange={(e) => setSCodAtividade(e.target.value)}
                          placeholder="codAtividade" className={inputClass} style={inputStyle} />
                      </div>
                      <div className="relative">
                        <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input type="text" value={sNomeAux} onChange={(e) => setSNomeAux(e.target.value)}
                          placeholder="nomeAux (similar/igual)" className={inputClass} style={inputStyle} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="relative">
                        <FileDigit className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input type="text" value={sNumDoctoAux} onChange={(e) => setSNumDoctoAux(e.target.value)}
                          placeholder="numDoctoAux (similar/igual)" className={inputClass} style={inputStyle} />
                      </div>
                      <div className="relative">
                        <FileDigit className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input type="text" value={sObsInterna} onChange={(e) => setSObsInterna(e.target.value)}
                          placeholder="observacaoInterna (similar/igual)" className={inputClass} style={inputStyle} />
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-100 rounded"
                    style={{ fontSize: "0.65rem", fontWeight: 600 }}>Proxy: /sige/order</span>
                </div>

                <button onClick={handleSearch} disabled={searching || !isConnected}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                  style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                  {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  {searching ? "Buscando..." : "Buscar Pedidos"}
                </button>
                <ResultBlock result={searchResult} error={searchError}
                  label="Resposta GET /order:"
                  onCopy={() => handleCopy(searchResult)} />
              </div>
            </div>
          )}

          {/* ─── GET /order/{id} ─── */}
          {activeTab === "byId" && (
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              <div className="flex items-center gap-3 p-3 bg-gray-50/50">
                <span className="px-2.5 py-1 rounded border bg-emerald-100 text-emerald-700 border-emerald-200"
                  style={{ fontSize: "0.68rem", fontWeight: 700, fontFamily: "monospace" }}>GET</span>
                <code className="text-gray-800" style={{ fontSize: "0.85rem" }}>/order/{"{id}"}</code>
              </div>
              <div className="p-3 space-y-3">
                <p className="text-gray-600" style={{ fontSize: "0.78rem" }}>
                  Busca um pedido (order) pela chave fato (ID).
                </p>

                <div className="relative">
                  <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input type="text" value={bId} onChange={(e) => setBId(e.target.value)}
                    placeholder="Chave fato (ID) do pedido *" className={inputClass} style={inputStyle} />
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-100 rounded"
                    style={{ fontSize: "0.65rem", fontWeight: 600 }}>Proxy: /sige/order/:id</span>
                </div>

                <button onClick={handleGetById} disabled={fetchingById || !isConnected || !bId.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                  style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                  {fetchingById ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  {fetchingById ? "Buscando..." : "Buscar Pedido"}
                </button>
                <ResultBlock result={byIdResult} error={byIdError}
                  label={`Resposta GET /order/${bId || "{id}"}:`}
                  onCopy={() => handleCopy(byIdResult)} />
              </div>
            </div>
          )}

          {/* ─── POST /order ─── */}
          {activeTab === "create" && (
            <div className="space-y-3">
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 p-3 bg-gray-50/50">
                  <span className="px-2.5 py-1 rounded border bg-blue-100 text-blue-700 border-blue-200"
                    style={{ fontSize: "0.68rem", fontWeight: 700, fontFamily: "monospace" }}>POST</span>
                  <code className="text-gray-800" style={{ fontSize: "0.85rem" }}>/order</code>
                </div>
                <div className="p-3 space-y-3">
                  <p className="text-gray-600" style={{ fontSize: "0.78rem" }}>
                    Cadastra um novo pedido. Campos obrigatorios: <code className="bg-gray-100 px-1 rounded">codCliFor</code>,
                    <code className="bg-gray-100 px-1 rounded ml-1">codTipoMv</code>,
                    <code className="bg-gray-100 px-1 rounded ml-1">items[]</code>.
                  </p>

                  <div>
                    <p className="text-gray-500 mb-1.5" style={{ fontSize: "0.7rem", fontWeight: 600 }}>REQUEST BODY (JSON)</p>
                    <textarea value={createJson} onChange={(e) => setCreateJson(e.target.value)}
                      rows={24}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 font-mono outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 focus:bg-white transition-all"
                      style={{ fontSize: "0.75rem", lineHeight: 1.5 }} />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-100 rounded"
                      style={{ fontSize: "0.65rem", fontWeight: 600 }}>Proxy: /sige/order</span>
                  </div>

                  <button onClick={handleCreate} disabled={creating || !isConnected}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                    style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                    {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    {creating ? "Cadastrando..." : "Cadastrar Pedido"}
                  </button>
                  <ResultBlock result={createResult} error={createError}
                    label="Resposta POST /order:"
                    onCopy={() => handleCopy(createResult)} />
                </div>
              </div>

              <div className="p-3 bg-orange-50 rounded-lg border border-orange-100">
                <p className="text-orange-700" style={{ fontSize: "0.72rem" }}>
                  <strong>Dica:</strong> Campos obrigatorios: <code className="bg-orange-100 px-1 rounded">codCliFor</code>,
                  <code className="bg-orange-100 px-1 rounded mx-1">codTipoMv</code> e
                  <code className="bg-orange-100 px-1 rounded">items[]</code>.
                  Demais tags usam configuracoes padrao do SIGE se omitidas. Use <code className="bg-orange-100 px-1 rounded">/customer</code> com
                  tipoCadastro V/T para obter codVendComp e codTransportador1.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}