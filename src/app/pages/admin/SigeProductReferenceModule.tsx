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
  Bookmark,
  Tag,
  ToggleLeft,
  ShoppingCart,
} from "lucide-react";
import { getValidAdminToken } from "./adminAuth";
import * as api from "../../services/api";
import { copyToClipboard } from "../../utils/clipboard";

interface Props {
  isConnected: boolean;
}

type ActiveTab = "search" | "create" | "update";

const EMPTY_REFERENCE = {
  codRef: "",
  pesoBruto: 0,
  pesoLiquido: 0,
  ean: "",
  status: "",
  codProdFabricante: "",
  controlaLote: "",
  composicao: "",
  observacao1: "",
  observacao2: "",
  ncm: "",
  comissionado: "",
  codGrupoComissionado: "",
  cest: "",
  caminhoImagem1: "",
  caminhoImagem2: "",
  caminhoImagem3: "",
  enviaEcommerce: "",
};

const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "A", label: "A - Ativo" },
  { value: "I", label: "I - Inativo" },
  { value: "O", label: "O - Inventario" },
];

const ECOMMERCE_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "S", label: "S - Sim" },
  { value: "N", label: "N - Nao" },
];

export function SigeProductReferenceModule({ isConnected }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("search");

  // Search
  const [sProductId, setSProductId] = useState("");
  const [sCodRef, setSCodRef] = useState("");
  const [sStatus, setSStatus] = useState("");
  const [sEnviaEcommerce, setSEnviaEcommerce] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<any>(null);
  const [searchError, setSearchError] = useState("");

  // Create
  const [cProductId, setCProductId] = useState("");
  const [createJson, setCreateJson] = useState(JSON.stringify(EMPTY_REFERENCE, null, 2));
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<any>(null);
  const [createError, setCreateError] = useState("");

  // Update
  const [uProductId, setUProductId] = useState("");
  const [updateJson, setUpdateJson] = useState(JSON.stringify(EMPTY_REFERENCE, null, 2));
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
    if (!sProductId.trim()) { setSearchError("Informe o ID do produto."); return; }
    setSearching(true); setSearchResult(null); setSearchError("");
    try {
      const token = await getAccessToken();
      const params: Record<string, string> = {};
      if (sCodRef.trim()) params.codRef = sCodRef.trim();
      if (sStatus.trim()) params.status = sStatus.trim();
      if (sEnviaEcommerce.trim()) params.enviaEcommerce = sEnviaEcommerce.trim();
      const res = await api.sigeProductReferenceGet(token, sProductId.trim(), params);
      setSearchResult(res);
    } catch (e: any) {
      setSearchError(e.message || "Erro ao buscar referencias.");
    } finally { setSearching(false); }
  };

  const handleCreate = async () => {
    if (!cProductId.trim()) { setCreateError("Informe o ID do produto."); return; }
    setCreating(true); setCreateResult(null); setCreateError("");
    try {
      let body: any;
      try { body = JSON.parse(createJson); } catch { setCreateError("JSON invalido."); setCreating(false); return; }
      const token = await getAccessToken();
      const res = await api.sigeProductReferenceCreate(token, cProductId.trim(), body);
      setCreateResult(res);
    } catch (e: any) {
      setCreateError(e.message || "Erro ao cadastrar referência.");
    } finally { setCreating(false); }
  };

  const handleUpdate = async () => {
    if (!uProductId.trim()) { setUpdateError("Informe o ID do produto."); return; }
    setUpdating(true); setUpdateResult(null); setUpdateError("");
    try {
      let body: any;
      try { body = JSON.parse(updateJson); } catch { setUpdateError("JSON invalido."); setUpdating(false); return; }
      const token = await getAccessToken();
      const res = await api.sigeProductReferenceUpdate(token, uProductId.trim(), body);
      setUpdateResult(res);
    } catch (e: any) {
      setUpdateError(e.message || "Erro ao alterar referência.");
    } finally { setUpdating(false); }
  };

  const handleCopy = (data: any) => {
    copyToClipboard(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const inputClass = "w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 placeholder-gray-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:bg-white transition-all";
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
        <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center shrink-0">
          <Bookmark className="w-5 h-5 text-indigo-600" />
        </div>
        <div className="text-left flex-1">
          <h4 className="text-gray-900" style={{ fontSize: "0.95rem", fontWeight: 700 }}>Produto Referência</h4>
          <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>Buscar, cadastrar e alterar referências do produto — 3 endpoints</p>
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
              Conecte-se ao SIGE primeiro para usar estes endpoints.
            </p>
          )}

          {/* Reference docs */}
          <button onClick={() => setShowHelp(!showHelp)}
            className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700 cursor-pointer"
            style={{ fontSize: "0.72rem", fontWeight: 600 }}>
            <Info className="w-3.5 h-3.5" />
            {showHelp ? "Ocultar" : "Ver"} referência de campos
            {showHelp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showHelp && (
            <div className="bg-gray-900 rounded-lg p-3">
              <pre className="text-gray-300" style={{ fontSize: "0.72rem", lineHeight: 1.6 }}>
                <code>{`// Campos da Referência do Produto
{
  "codRef": "",              // código da referência
  "pesoBruto": 0,            // peso bruto (numérico)
  "pesoLiquido": 0,          // peso líquido (numérico)
  "ean": "",                 // código EAN/barras
  "status": "",              // A=Ativo | I=Inativo | O=Inventário
  "codProdFabricante": "",   // código do fabricante
  "controlaLote": "",        // S=Sim | N=Não
  "composicao": "",          // S=Sim | N=Não
  "observacao1": "",         // observação livre 1
  "observacao2": "",         // observação livre 2
  "ncm": "",                 // NCM (classificação fiscal)
  "comissionado": "",        // S=Sim | N=Não
  "codGrupoComissionado": "",// código grupo comissão
  "cest": "",                // CEST
  "caminhoImagem1": "",      // URL/path imagem 1
  "caminhoImagem2": "",      // URL/path imagem 2
  "caminhoImagem3": "",      // URL/path imagem 3
  "enviaEcommerce": ""       // S=Sim | N=Nao
}

// status:
//   A -> Ativo
//   I -> Inativo
//   O -> Inventario

// Campos S/N: controlaLote, composicao,
//   comissionado, enviaEcommerce

// Filtros do GET (query params):
//   codRef          -> múltiplos separados por vírgula
//   status          -> A | I | O
//   enviaEcommerce  -> S | N`}</code>
              </pre>
            </div>
          )}

          {/* ─── GET /product/{id}/reference ─── */}
          {activeTab === "search" && (
            <div className="space-y-3">
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 p-3 bg-gray-50/50">
                  <span className="px-2.5 py-1 rounded border bg-emerald-100 text-emerald-700 border-emerald-200"
                    style={{ fontSize: "0.68rem", fontWeight: 700, fontFamily: "monospace" }}>GET</span>
                  <code className="text-gray-800" style={{ fontSize: "0.85rem" }}>/product/{"{id}"}/reference</code>
                </div>
                <div className="p-3 space-y-3">
                  <p className="text-gray-600" style={{ fontSize: "0.78rem" }}>
                    Busca as referencias de um produto, com filtros por codigo, status e e-commerce.
                  </p>

                  <div className="relative">
                    <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input type="text" value={sProductId} onChange={(e) => setSProductId(e.target.value)}
                      placeholder="ID do produto *" className={inputClass} style={inputStyle} />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="relative">
                      <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input type="text" value={sCodRef} onChange={(e) => setSCodRef(e.target.value)}
                        placeholder="codRef (ex: REF1,REF2)" className={inputClass} style={inputStyle} />
                    </div>
                    <div className="relative">
                      <ToggleLeft className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <select value={sStatus} onChange={(e) => setSStatus(e.target.value)}
                        className={`${inputClass} appearance-none`} style={inputStyle}>
                        {STATUS_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="relative">
                      <ShoppingCart className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <select value={sEnviaEcommerce} onChange={(e) => setSEnviaEcommerce(e.target.value)}
                        className={`${inputClass} appearance-none`} style={inputStyle}>
                        {ECOMMERCE_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-100 rounded"
                      style={{ fontSize: "0.65rem", fontWeight: 600 }}>Proxy: /sige/product/:id/reference</span>
                  </div>

                  <button onClick={handleSearch} disabled={searching || !isConnected || !sProductId.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                    style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                    {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    {searching ? "Buscando..." : "Buscar Referencias"}
                  </button>
                  <ResultBlock result={searchResult} error={searchError}
                    label={`Resposta GET /product/${sProductId || "{id}"}/reference:`}
                    onCopy={() => handleCopy(searchResult)} />
                </div>
              </div>
            </div>
          )}

          {/* ─── POST /product/{id}/reference ─── */}
          {activeTab === "create" && (
            <div className="space-y-3">
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 p-3 bg-gray-50/50">
                  <span className="px-2.5 py-1 rounded border bg-blue-100 text-blue-700 border-blue-200"
                    style={{ fontSize: "0.68rem", fontWeight: 700, fontFamily: "monospace" }}>POST</span>
                  <code className="text-gray-800" style={{ fontSize: "0.85rem" }}>/product/{"{id}"}/reference</code>
                </div>
                <div className="p-3 space-y-3">
                  <p className="text-gray-600" style={{ fontSize: "0.78rem" }}>
                    Cadastra uma nova referência para um produto. Não envie tags desnecessárias.
                  </p>

                  <div className="relative">
                    <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input type="text" value={cProductId} onChange={(e) => setCProductId(e.target.value)}
                      placeholder="ID do produto *" className={inputClass} style={inputStyle} />
                  </div>

                  <div>
                    <p className="text-gray-500 mb-1.5" style={{ fontSize: "0.7rem", fontWeight: 600 }}>REQUEST BODY (JSON)</p>
                    <textarea value={createJson} onChange={(e) => setCreateJson(e.target.value)}
                      rows={18}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 font-mono outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:bg-white transition-all"
                      style={{ fontSize: "0.75rem", lineHeight: 1.5 }} />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-100 rounded"
                      style={{ fontSize: "0.65rem", fontWeight: 600 }}>Proxy: /sige/product/:id/reference</span>
                  </div>

                  <button onClick={handleCreate} disabled={creating || !isConnected || !cProductId.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                    style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                    {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    {creating ? "Cadastrando..." : "Cadastrar Referência"}
                  </button>
                  <ResultBlock result={createResult} error={createError}
                    label={`Resposta POST /product/${cProductId || "{id}"}/reference:`}
                    onCopy={() => handleCopy(createResult)} />
                </div>
              </div>

              <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                <p className="text-blue-700" style={{ fontSize: "0.72rem" }}>
                  <strong>Dica:</strong> Remova do body os campos que não deseja preencher. Cada tag entra como parâmetro na criação.
                  Campos <code className="bg-blue-100 px-1 rounded">S/N</code>: controlaLote, composicao, comissionado, enviaEcommerce.
                </p>
              </div>
            </div>
          )}

          {/* ─── PUT /product/{id}/reference ─── */}
          {activeTab === "update" && (
            <div className="space-y-3">
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 p-3 bg-gray-50/50">
                  <span className="px-2.5 py-1 rounded border bg-amber-100 text-amber-700 border-amber-200"
                    style={{ fontSize: "0.68rem", fontWeight: 700, fontFamily: "monospace" }}>PUT</span>
                  <code className="text-gray-800" style={{ fontSize: "0.85rem" }}>/product/{"{id}"}/reference</code>
                </div>
                <div className="p-3 space-y-3">
                  <p className="text-gray-600" style={{ fontSize: "0.78rem" }}>
                    Atualiza uma referência existente de um produto. Envie apenas os campos a alterar.
                  </p>

                  <div className="relative">
                    <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input type="text" value={uProductId} onChange={(e) => setUProductId(e.target.value)}
                      placeholder="ID do produto *" className={inputClass} style={inputStyle} />
                  </div>

                  <div>
                    <p className="text-gray-500 mb-1.5" style={{ fontSize: "0.7rem", fontWeight: 600 }}>REQUEST BODY (JSON)</p>
                    <textarea value={updateJson} onChange={(e) => setUpdateJson(e.target.value)}
                      rows={18}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 font-mono outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:bg-white transition-all"
                      style={{ fontSize: "0.75rem", lineHeight: 1.5 }} />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-100 rounded"
                      style={{ fontSize: "0.65rem", fontWeight: 600 }}>Proxy: /sige/product/:id/reference</span>
                  </div>

                  <button onClick={handleUpdate} disabled={updating || !isConnected || !uProductId.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                    style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                    {updating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pencil className="w-3.5 h-3.5" />}
                    {updating ? "Alterando..." : "Alterar Referência"}
                  </button>
                  <ResultBlock result={updateResult} error={updateError}
                    label={`Resposta PUT /product/${uProductId || "{id}"}/reference:`}
                    onCopy={() => handleCopy(updateResult)} />
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                <p className="text-amber-700" style={{ fontSize: "0.72rem" }}>
                  <strong>Dica:</strong> Use a aba "Buscar" para listar as referencias e obter o
                  <code className="bg-amber-100 px-1 rounded mx-1">codRef</code> da referência a alterar.
                  Inclua <code className="bg-amber-100 px-1 rounded">codRef</code> no body para identificar qual referência atualizar.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}