import { useState, useCallback } from "react";
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  XCircle,
  Search,
  Plus,
  Pencil,
  Hash,
  Copy,
  Check,
  Info,
  ChevronUp,
  FileType2,
  Type,
} from "lucide-react";
import { getValidAdminToken } from "./adminAuth";
import * as api from "../../services/api";
import { copyToClipboard } from "../../utils/clipboard";

interface Props {
  isConnected: boolean;
}

type ActiveTab = "search" | "create" | "update";

const EMPTY_ITEM = [
  {
    numItem: 0,
    numSubItem: 0,
    texto: "",
    campoV1: "",
    campoV2: "",
    campoV3: "",
    campoV4: "",
    campoV5: "",
    campoV6: "",
  },
];

export function SigeOrderItemsTextModule({ isConnected }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("search");

  // Search
  const [sId, setSId] = useState("");
  const [sNumItem, setSNumItem] = useState("");
  const [sNumSubItem, setSNumSubItem] = useState("");
  const [sTexto, setSTexto] = useState("");
  const [sCampoV1, setSCampoV1] = useState("");
  const [sCampoV2, setSCampoV2] = useState("");
  const [sCampoV3, setSCampoV3] = useState("");
  const [sCampoV4, setSCampoV4] = useState("");
  const [sCampoV5, setSCampoV5] = useState("");
  const [sCampoV6, setSCampoV6] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<any>(null);
  const [searchError, setSearchError] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Create
  const [cId, setCId] = useState("");
  const [createJson, setCreateJson] = useState(JSON.stringify(EMPTY_ITEM, null, 2));
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<any>(null);
  const [createError, setCreateError] = useState("");

  // Update
  const [uId, setUId] = useState("");
  const [updateJson, setUpdateJson] = useState(JSON.stringify(EMPTY_ITEM, null, 2));
  const [updating, setUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState<any>(null);
  const [updateError, setUpdateError] = useState("");

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
      const params: Record<string, string> = {};
      if (sNumItem.trim()) params.numItem = sNumItem.trim();
      if (sNumSubItem.trim()) params.numSubItem = sNumSubItem.trim();
      if (sTexto.trim()) params.texto = sTexto.trim();
      if (sCampoV1.trim()) params.campoV1 = sCampoV1.trim();
      if (sCampoV2.trim()) params.campoV2 = sCampoV2.trim();
      if (sCampoV3.trim()) params.campoV3 = sCampoV3.trim();
      if (sCampoV4.trim()) params.campoV4 = sCampoV4.trim();
      if (sCampoV5.trim()) params.campoV5 = sCampoV5.trim();
      if (sCampoV6.trim()) params.campoV6 = sCampoV6.trim();
      const res = await api.sigeOrderItemsTextGet(token, sId.trim(), params);
      setSearchResult(res);
    } catch (e: any) {
      setSearchError(e.message || "Erro ao buscar textos dos items.");
    } finally { setSearching(false); }
  };

  const handleCreate = async () => {
    if (!cId.trim()) { setCreateError("Informe o ID do pedido."); return; }
    setCreating(true); setCreateResult(null); setCreateError("");
    try {
      let body: any;
      try { body = JSON.parse(createJson); } catch { setCreateError("JSON invalido. O body deve ser um array."); setCreating(false); return; }
      const token = await getAccessToken();
      const res = await api.sigeOrderItemsTextCreate(token, cId.trim(), body);
      setCreateResult(res);
    } catch (e: any) {
      setCreateError(e.message || "Erro ao cadastrar textos.");
    } finally { setCreating(false); }
  };

  const handleUpdate = async () => {
    if (!uId.trim()) { setUpdateError("Informe o ID do pedido."); return; }
    setUpdating(true); setUpdateResult(null); setUpdateError("");
    try {
      let body: any;
      try { body = JSON.parse(updateJson); } catch { setUpdateError("JSON invalido. O body deve ser um array."); setUpdating(false); return; }
      const token = await getAccessToken();
      const res = await api.sigeOrderItemsTextUpdate(token, uId.trim(), body);
      setUpdateResult(res);
    } catch (e: any) {
      setUpdateError(e.message || "Erro ao alterar textos.");
    } finally { setUpdating(false); }
  };

  const handleCopy = (data: any) => {
    copyToClipboard(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const inputClass = "w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 placeholder-gray-400 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 focus:bg-white transition-all";
  const inputStyle = { fontSize: "0.8rem" } as const;

  const tabs: { key: ActiveTab; label: string; icon: typeof Search; method: string; methodColor: string }[] = [
    { key: "search", label: "Buscar", icon: Search, method: "GET", methodColor: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    { key: "create", label: "Cadastrar", icon: Plus, method: "POST", methodColor: "bg-blue-100 text-blue-700 border-blue-200" },
    { key: "update", label: "Alterar", icon: Pencil, method: "PUT", methodColor: "bg-amber-100 text-amber-700 border-amber-200" },
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
        <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center shrink-0">
          <FileType2 className="w-5 h-5 text-teal-600" />
        </div>
        <div className="text-left flex-1">
          <h4 className="text-gray-900" style={{ fontSize: "0.95rem", fontWeight: 700 }}>Pedidos Items Text</h4>
          <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>Textos/observacoes dos items do pedido — 3 endpoints</p>
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
              <XCircle className="w-3.5 h-3.5" /> Conecte-se ao SIGE primeiro.
            </p>
          )}

          <button onClick={() => setShowHelp(!showHelp)}
            className="flex items-center gap-1.5 text-teal-600 hover:text-teal-700 cursor-pointer"
            style={{ fontSize: "0.72rem", fontWeight: 600 }}>
            <Info className="w-3.5 h-3.5" />
            {showHelp ? "Ocultar" : "Ver"} referencia
            {showHelp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showHelp && (
            <div className="bg-gray-900 rounded-lg p-3">
              <pre className="text-gray-300" style={{ fontSize: "0.72rem", lineHeight: 1.6 }}>
                <code>{`// Rota: /order-items/{id}/text

// GET - Filtros (query params):
//   numItem     - número do item (múltiplos por vírgula)
//   numSubItem  - número do sub-item (int)
//   texto       - texto do item (similar/igual)
//   campoV1..V6 - observacoes V1 a V6 (similar/igual)

// POST / PUT - Body (ARRAY):
[
  {
    "numItem": 0,
    "numSubItem": 0,
    "texto": "",
    "campoV1": "",
    "campoV2": "",
    "campoV3": "",
    "campoV4": "",
    "campoV5": "",
    "campoV6": ""
  }
]`}</code>
              </pre>
            </div>
          )}

          {/* ─── GET ─── */}
          {activeTab === "search" && (
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              <div className="flex items-center gap-3 p-3 bg-gray-50/50">
                <span className="px-2.5 py-1 rounded border bg-emerald-100 text-emerald-700 border-emerald-200"
                  style={{ fontSize: "0.68rem", fontWeight: 700, fontFamily: "monospace" }}>GET</span>
                <code className="text-gray-800" style={{ fontSize: "0.85rem" }}>/order-items/{"{id}"}/text</code>
              </div>
              <div className="p-3 space-y-3">
                <p className="text-gray-600" style={{ fontSize: "0.78rem" }}>
                  Busca os textos dos itens de um pedido pela chave fato, com até 9 filtros.
                </p>

                <div className="relative">
                  <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input type="text" value={sId} onChange={(e) => setSId(e.target.value)}
                    placeholder="ID do pedido (chave fato) *" className={inputClass} style={inputStyle} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="relative">
                    <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input type="text" value={sNumItem} onChange={(e) => setSNumItem(e.target.value)}
                      placeholder="numItem (ex: 1,2,3)" className={inputClass} style={inputStyle} />
                  </div>
                  <div className="relative">
                    <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input type="text" value={sNumSubItem} onChange={(e) => setSNumSubItem(e.target.value)}
                      placeholder="numSubItem (int)" className={inputClass} style={inputStyle} />
                  </div>
                  <div className="relative">
                    <Type className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input type="text" value={sTexto} onChange={(e) => setSTexto(e.target.value)}
                      placeholder="texto (similar/igual)" className={inputClass} style={inputStyle} />
                  </div>
                </div>

                {/* Expandable campoV1-V6 */}
                <button onClick={() => setShowFilters(!showFilters)}
                  className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 cursor-pointer"
                  style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                  {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {showFilters ? "Ocultar" : "Mais"} filtros (campoV1-V6)
                </button>

                {showFilters && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="relative">
                      <Type className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input type="text" value={sCampoV1} onChange={(e) => setSCampoV1(e.target.value)}
                        placeholder="campoV1" className={inputClass} style={inputStyle} />
                    </div>
                    <div className="relative">
                      <Type className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input type="text" value={sCampoV2} onChange={(e) => setSCampoV2(e.target.value)}
                        placeholder="campoV2" className={inputClass} style={inputStyle} />
                    </div>
                    <div className="relative">
                      <Type className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input type="text" value={sCampoV3} onChange={(e) => setSCampoV3(e.target.value)}
                        placeholder="campoV3" className={inputClass} style={inputStyle} />
                    </div>
                    <div className="relative">
                      <Type className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input type="text" value={sCampoV4} onChange={(e) => setSCampoV4(e.target.value)}
                        placeholder="campoV4" className={inputClass} style={inputStyle} />
                    </div>
                    <div className="relative">
                      <Type className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input type="text" value={sCampoV5} onChange={(e) => setSCampoV5(e.target.value)}
                        placeholder="campoV5" className={inputClass} style={inputStyle} />
                    </div>
                    <div className="relative">
                      <Type className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input type="text" value={sCampoV6} onChange={(e) => setSCampoV6(e.target.value)}
                        placeholder="campoV6" className={inputClass} style={inputStyle} />
                    </div>
                  </div>
                )}

                <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-100 rounded"
                  style={{ fontSize: "0.65rem", fontWeight: 600 }}>Proxy: /sige/order-items/:id/text</span>

                <button onClick={handleSearch} disabled={searching || !isConnected || !sId.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                  style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                  {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  {searching ? "Buscando..." : "Buscar Textos"}
                </button>
                <ResultBlock result={searchResult} error={searchError}
                  label={`Resposta GET /order-items/${sId || "{id}"}/text:`}
                  onCopy={() => handleCopy(searchResult)} />
              </div>
            </div>
          )}

          {/* ─── POST ─── */}
          {activeTab === "create" && (
            <div className="space-y-3">
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 p-3 bg-gray-50/50">
                  <span className="px-2.5 py-1 rounded border bg-blue-100 text-blue-700 border-blue-200"
                    style={{ fontSize: "0.68rem", fontWeight: 700, fontFamily: "monospace" }}>POST</span>
                  <code className="text-gray-800" style={{ fontSize: "0.85rem" }}>/order-items/{"{id}"}/text</code>
                </div>
                <div className="p-3 space-y-3">
                  <p className="text-gray-600" style={{ fontSize: "0.78rem" }}>
                    Cadastra textos/observacoes nos items do pedido. O body deve ser um <strong>array</strong>.
                  </p>
                  <div className="relative">
                    <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input type="text" value={cId} onChange={(e) => setCId(e.target.value)}
                      placeholder="ID do pedido (chave fato) *" className={inputClass} style={inputStyle} />
                  </div>
                  <div>
                    <p className="text-gray-500 mb-1.5" style={{ fontSize: "0.7rem", fontWeight: 600 }}>REQUEST BODY (JSON Array)</p>
                    <textarea value={createJson} onChange={(e) => setCreateJson(e.target.value)} rows={14}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 font-mono outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 focus:bg-white transition-all"
                      style={{ fontSize: "0.75rem", lineHeight: 1.5 }} />
                  </div>
                  <button onClick={handleCreate} disabled={creating || !isConnected || !cId.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                    style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                    {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    {creating ? "Cadastrando..." : "Cadastrar Textos"}
                  </button>
                  <ResultBlock result={createResult} error={createError}
                    label={`Resposta POST /order-items/${cId || "{id}"}/text:`}
                    onCopy={() => handleCopy(createResult)} />
                </div>
              </div>

              <div className="p-3 bg-teal-50 rounded-lg border border-teal-100">
                <p className="text-teal-700" style={{ fontSize: "0.72rem" }}>
                  <strong>Atencao:</strong> O body deve ser um <strong>array</strong> (mesmo para 1 texto).
                  Campos disponiveis: <code className="bg-teal-100 px-1 rounded">numItem</code>,
                  <code className="bg-teal-100 px-1 rounded mx-0.5">numSubItem</code>,
                  <code className="bg-teal-100 px-1 rounded mx-0.5">texto</code> e
                  <code className="bg-teal-100 px-1 rounded">campoV1</code> a
                  <code className="bg-teal-100 px-1 rounded ml-0.5">campoV6</code>.
                </p>
              </div>
            </div>
          )}

          {/* ─── PUT ─── */}
          {activeTab === "update" && (
            <div className="space-y-3">
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 p-3 bg-gray-50/50">
                  <span className="px-2.5 py-1 rounded border bg-amber-100 text-amber-700 border-amber-200"
                    style={{ fontSize: "0.68rem", fontWeight: 700, fontFamily: "monospace" }}>PUT</span>
                  <code className="text-gray-800" style={{ fontSize: "0.85rem" }}>/order-items/{"{id}"}/text</code>
                </div>
                <div className="p-3 space-y-3">
                  <p className="text-gray-600" style={{ fontSize: "0.78rem" }}>
                    Altera textos/observacoes dos items do pedido. O body deve ser um <strong>array</strong>.
                  </p>
                  <div className="relative">
                    <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input type="text" value={uId} onChange={(e) => setUId(e.target.value)}
                      placeholder="ID do pedido (chave fato) *" className={inputClass} style={inputStyle} />
                  </div>
                  <div>
                    <p className="text-gray-500 mb-1.5" style={{ fontSize: "0.7rem", fontWeight: 600 }}>REQUEST BODY (JSON Array)</p>
                    <textarea value={updateJson} onChange={(e) => setUpdateJson(e.target.value)} rows={14}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 font-mono outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 focus:bg-white transition-all"
                      style={{ fontSize: "0.75rem", lineHeight: 1.5 }} />
                  </div>
                  <button onClick={handleUpdate} disabled={updating || !isConnected || !uId.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                    style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                    {updating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pencil className="w-3.5 h-3.5" />}
                    {updating ? "Alterando..." : "Alterar Textos"}
                  </button>
                  <ResultBlock result={updateResult} error={updateError}
                    label={`Resposta PUT /order-items/${uId || "{id}"}/text:`}
                    onCopy={() => handleCopy(updateResult)} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}