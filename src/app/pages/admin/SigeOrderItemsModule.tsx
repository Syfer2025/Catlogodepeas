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
  ListOrdered,
} from "lucide-react";
import { getValidAdminToken } from "./adminAuth";
import * as api from "../../services/api";
import { copyToClipboard } from "../../utils/clipboard";

interface Props {
  isConnected: boolean;
}

type ActiveTab = "search" | "create";

const EMPTY_ITEM = [
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
];

export function SigeOrderItemsModule({ isConnected }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("search");

  // Search
  const [sId, setSId] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<any>(null);
  const [searchError, setSearchError] = useState("");

  // Create
  const [cId, setCId] = useState("");
  const [createJson, setCreateJson] = useState(JSON.stringify(EMPTY_ITEM, null, 2));
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<any>(null);
  const [createError, setCreateError] = useState("");

  const [copied, setCopied] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const getAccessToken = useCallback(async (): Promise<string> => {
    const token = await getValidAdminToken();
    if (!token) throw new Error("Sessão expirada");
    return token;
  }, []);

  const handleSearch = async () => {
    if (!sId.trim()) { setSearchError("Informe o ID do pedido."); return; }
    setSearching(true); setSearchResult(null); setSearchError("");
    try {
      const token = await getAccessToken();
      const res = await api.sigeOrderItemsGet(token, sId.trim());
      setSearchResult(res);
    } catch (e: any) {
      setSearchError(e.message || "Erro ao buscar items.");
    } finally { setSearching(false); }
  };

  const handleCreate = async () => {
    if (!cId.trim()) { setCreateError("Informe o ID do pedido."); return; }
    setCreating(true); setCreateResult(null); setCreateError("");
    try {
      let body: any;
      try { body = JSON.parse(createJson); } catch { setCreateError("JSON invalido. O body deve ser um array."); setCreating(false); return; }
      const token = await getAccessToken();
      const res = await api.sigeOrderItemsCreate(token, cId.trim(), body);
      setCreateResult(res);
    } catch (e: any) {
      setCreateError(e.message || "Erro ao cadastrar items.");
    } finally { setCreating(false); }
  };

  const handleCopy = (data: any) => {
    copyToClipboard(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const inputClass = "w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 placeholder-gray-400 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 focus:bg-white transition-all";
  const inputStyle = { fontSize: "0.8rem" } as const;

  const tabs: { key: ActiveTab; label: string; icon: typeof Search; method: string; methodColor: string }[] = [
    { key: "search", label: "Buscar", icon: Search, method: "GET", methodColor: "bg-emerald-100 text-emerald-700 border-emerald-200" },
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
        <div className="w-10 h-10 bg-rose-100 rounded-lg flex items-center justify-center shrink-0">
          <ListOrdered className="w-5 h-5 text-rose-600" />
        </div>
        <div className="text-left flex-1">
          <h4 className="text-gray-900" style={{ fontSize: "0.95rem", fontWeight: 700 }}>Pedidos Items</h4>
          <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>Buscar e cadastrar items do pedido — 2 endpoints</p>
        </div>
        <span className="px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 rounded-full shrink-0"
          style={{ fontSize: "0.68rem", fontWeight: 600 }}>Implementado</span>
        {expanded
          ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
          : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4">
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
              <XCircle className="w-3.5 h-3.5" /> Conecte-se ao SIGE primeiro.
            </p>
          )}

          <button onClick={() => setShowHelp(!showHelp)}
            className="flex items-center gap-1.5 text-rose-600 hover:text-rose-700 cursor-pointer"
            style={{ fontSize: "0.72rem", fontWeight: 600 }}>
            <Info className="w-3.5 h-3.5" />
            {showHelp ? "Ocultar" : "Ver"} referencia
            {showHelp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showHelp && (
            <div className="bg-gray-900 rounded-lg p-3">
              <pre className="text-gray-300" style={{ fontSize: "0.72rem", lineHeight: 1.6 }}>
                <code>{`// POST /order-items/{id}
// O body e um ARRAY de items:
[
  {
    "codProduto": "",       // código do produto
    "codRef": "",           // referencia
    "qtdeUnd": 0,           // quantidade
    "valorUnitario": 0,     // valor unitario
    "valorDesconto": 0,     // desconto
    "valorFrete": 0,        // frete
    "valorEncargos": 0,     // encargos
    "valorSeguro": 0,       // seguro
    "valorIpi": 0,          // IPI
    "numLote": "",          // lote
    "qtdeV1": 0,            // qtde v1
    "qtdeV2": 0,            // qtde v2
    "codMensagem": "",      // código mensagem
    "codCbenef": "",        // CBENEF
    "url": "",              // URL
    "ncm": ""               // NCM
  }
]
// NOTA: rota e /order-items/{id} (nao /order/{id}/items)`}</code>
              </pre>
            </div>
          )}

          {/* GET */}
          {activeTab === "search" && (
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              <div className="flex items-center gap-3 p-3 bg-gray-50/50">
                <span className="px-2.5 py-1 rounded border bg-emerald-100 text-emerald-700 border-emerald-200"
                  style={{ fontSize: "0.68rem", fontWeight: 700, fontFamily: "monospace" }}>GET</span>
                <code className="text-gray-800" style={{ fontSize: "0.85rem" }}>/order-items/{"{id}"}</code>
              </div>
              <div className="p-3 space-y-3">
                <p className="text-gray-600" style={{ fontSize: "0.78rem" }}>
                  Busca os items de um pedido pela chave fato.
                </p>
                <div className="relative">
                  <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input type="text" value={sId} onChange={(e) => setSId(e.target.value)}
                    placeholder="ID do pedido (chave fato) *" className={inputClass} style={inputStyle} />
                </div>
                <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-100 rounded"
                  style={{ fontSize: "0.65rem", fontWeight: 600 }}>Proxy: /sige/order-items/:id</span>
                <button onClick={handleSearch} disabled={searching || !isConnected || !sId.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                  style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                  {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  {searching ? "Buscando..." : "Buscar Items"}
                </button>
                <ResultBlock result={searchResult} error={searchError}
                  label={`Resposta GET /order-items/${sId || "{id}"}:`}
                  onCopy={() => handleCopy(searchResult)} />
              </div>
            </div>
          )}

          {/* POST */}
          {activeTab === "create" && (
            <div className="space-y-3">
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 p-3 bg-gray-50/50">
                  <span className="px-2.5 py-1 rounded border bg-blue-100 text-blue-700 border-blue-200"
                    style={{ fontSize: "0.68rem", fontWeight: 700, fontFamily: "monospace" }}>POST</span>
                  <code className="text-gray-800" style={{ fontSize: "0.85rem" }}>/order-items/{"{id}"}</code>
                </div>
                <div className="p-3 space-y-3">
                  <p className="text-gray-600" style={{ fontSize: "0.78rem" }}>
                    Cadastra item(s) no pedido. O body deve ser um <strong>array</strong> de objetos.
                  </p>
                  <div className="relative">
                    <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input type="text" value={cId} onChange={(e) => setCId(e.target.value)}
                      placeholder="ID do pedido (chave fato) *" className={inputClass} style={inputStyle} />
                  </div>
                  <div>
                    <p className="text-gray-500 mb-1.5" style={{ fontSize: "0.7rem", fontWeight: 600 }}>REQUEST BODY (JSON Array)</p>
                    <textarea value={createJson} onChange={(e) => setCreateJson(e.target.value)} rows={20}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 font-mono outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 focus:bg-white transition-all"
                      style={{ fontSize: "0.75rem", lineHeight: 1.5 }} />
                  </div>
                  <button onClick={handleCreate} disabled={creating || !isConnected || !cId.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                    style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                    {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    {creating ? "Cadastrando..." : "Cadastrar Items"}
                  </button>
                  <ResultBlock result={createResult} error={createError}
                    label={`Resposta POST /order-items/${cId || "{id}"}:`}
                    onCopy={() => handleCopy(createResult)} />
                </div>
              </div>

              <div className="p-3 bg-rose-50 rounded-lg border border-rose-100">
                <p className="text-rose-700" style={{ fontSize: "0.72rem" }}>
                  <strong>Atencao:</strong> O body deve ser um <strong>array</strong> (mesmo para 1 item).
                  A rota e <code className="bg-rose-100 px-1 rounded">/order-items/{"{id}"}</code>, diferente das outras rotas de pedido.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}