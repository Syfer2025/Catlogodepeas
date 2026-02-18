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
  Package,
  Tag,
  FileText,
  ListFilter,
} from "lucide-react";
import { supabase } from "../../services/supabaseClient";
import * as api from "../../services/api";
import { copyToClipboard } from "../../utils/clipboard";

interface Props {
  isConnected: boolean;
}

type ActiveTab = "search" | "create" | "update";

const EMPTY_PRODUCT = {
  tipoProduto: "",
  descProdutoEst: "",
  descProdutoNf: null,
  descProdutoRot: null,
  codDivisao1: "",
  codDivisao2: "",
  codDivisao3: "",
  codCf: null,
  codGrade: null,
  codGrupo: null,
  codMarca: null,
  unidadeCompromentimento: "",
  codUnidadePri: "",
  codUnidadeAux: "",
  codUnidadeCpa: "",
  codUnidadeVda: "",
  codUnidadeNCM: null,
};

const TIPO_PRODUTO_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "PA", label: "PA - Produto Acabado" },
  { value: "PC", label: "PC - Pecas Compradas" },
  { value: "PF", label: "PF - Pecas Fabricadas" },
  { value: "PP", label: "PP - Pecas Processadas" },
  { value: "SE", label: "SE - Servicos" },
  { value: "MP", label: "MP - Materia Prima" },
  { value: "MC", label: "MC - Material Consumo" },
  { value: "FM", label: "FM - Formula" },
];

export function SigeProductModule({ isConnected }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("search");

  // ─── Search state ───
  const [sLimit, setSLimit] = useState("50");
  const [sOffset, setSOffset] = useState("1");
  const [sCodProduto, setSCodProduto] = useState("");
  const [sTipoProduto, setSTipoProduto] = useState("");
  const [sDescEst, setSDescEst] = useState("");
  const [sDescNf, setSDescNf] = useState("");
  const [sDescRot, setSDescRot] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<any>(null);
  const [searchError, setSearchError] = useState("");

  // ─── Create state ───
  const [createJson, setCreateJson] = useState(JSON.stringify(EMPTY_PRODUCT, null, 2));
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<any>(null);
  const [createError, setCreateError] = useState("");

  // ─── Update state ───
  const [updateId, setUpdateId] = useState("");
  const [updateJson, setUpdateJson] = useState(JSON.stringify(EMPTY_PRODUCT, null, 2));
  const [updating, setUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState<any>(null);
  const [updateError, setUpdateError] = useState("");

  // ─── Clipboard ───
  const [copied, setCopied] = useState(false);

  // ─── Docs toggle ───
  const [showHelp, setShowHelp] = useState(false);

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
      if (sLimit.trim() && sLimit.trim() !== "50") params.limit = sLimit.trim();
      if (sOffset.trim() && sOffset.trim() !== "1") params.offset = sOffset.trim();
      if (sCodProduto.trim()) params.codProduto = sCodProduto.trim();
      if (sTipoProduto.trim()) params.tipoProduto = sTipoProduto.trim();
      if (sDescEst.trim()) params.descProdutoEst = sDescEst.trim();
      if (sDescNf.trim()) params.descProdutoNf = sDescNf.trim();
      if (sDescRot.trim()) params.descProdutoRot = sDescRot.trim();
      const result = await api.sigeProductGet(token, params);
      setSearchResult(result);
    } catch (e: any) {
      setSearchError(e.message || "Erro ao buscar produtos.");
    } finally { setSearching(false); }
  };

  const handleCreate = async () => {
    setCreating(true); setCreateResult(null); setCreateError("");
    try {
      let body: any;
      try { body = JSON.parse(createJson); } catch { setCreateError("JSON invalido."); setCreating(false); return; }
      const token = await getAccessToken();
      const result = await api.sigeProductCreate(token, body);
      setCreateResult(result);
    } catch (e: any) {
      setCreateError(e.message || "Erro ao cadastrar produto.");
    } finally { setCreating(false); }
  };

  const handleUpdate = async () => {
    if (!updateId.trim()) { setUpdateError("Informe o ID do produto."); return; }
    setUpdating(true); setUpdateResult(null); setUpdateError("");
    try {
      let body: any;
      try { body = JSON.parse(updateJson); } catch { setUpdateError("JSON invalido."); setUpdating(false); return; }
      const token = await getAccessToken();
      const result = await api.sigeProductUpdate(token, updateId.trim(), body);
      setUpdateResult(result);
    } catch (e: any) {
      setUpdateError(e.message || "Erro ao alterar produto.");
    } finally { setUpdating(false); }
  };

  const handleCopy = (data: any) => {
    copyToClipboard(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const inputClass = "w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 placeholder-gray-400 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 focus:bg-white transition-all";
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
        <div className="w-10 h-10 bg-sky-100 rounded-lg flex items-center justify-center shrink-0">
          <Package className="w-5 h-5 text-sky-600" />
        </div>
        <div className="text-left flex-1">
          <h4 className="text-gray-900" style={{ fontSize: "0.95rem", fontWeight: 700 }}>Produto</h4>
          <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>Buscar, cadastrar e alterar produtos — 3 endpoints</p>
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
            className="flex items-center gap-1.5 text-sky-600 hover:text-sky-700 cursor-pointer"
            style={{ fontSize: "0.72rem", fontWeight: 600 }}>
            <Info className="w-3.5 h-3.5" />
            {showHelp ? "Ocultar" : "Ver"} referencia de campos e tipos
            {showHelp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showHelp && (
            <div className="bg-gray-900 rounded-lg p-3">
              <pre className="text-gray-300" style={{ fontSize: "0.72rem", lineHeight: 1.6 }}>
                <code>{`// Campos do Produto
{
  "tipoProduto": "",         // tipo do produto (ver tabela abaixo)
  "descProdutoEst": "",      // descricao de estoque
  "descProdutoNf": null,     // descricao nota fiscal
  "descProdutoRot": null,    // descricao rotulo
  "codDivisao1": "",         // codigo divisao 1
  "codDivisao2": "",         // codigo divisao 2
  "codDivisao3": "",         // codigo divisao 3
  "codCf": null,             // codigo classificacao fiscal
  "codGrade": null,          // codigo grade
  "codGrupo": null,          // codigo grupo
  "codMarca": null,          // codigo marca
  "unidadeCompromentimento": "", // P=Primaria | A=Auxiliar
  "codUnidadePri": "",       // unidade primaria
  "codUnidadeAux": "",       // unidade auxiliar
  "codUnidadeCpa": "",       // unidade compra
  "codUnidadeVda": "",       // unidade venda
  "codUnidadeNCM": null      // unidade NCM
}

// tipoProduto — valores aceitos:
//   PA -> Produto Acabado
//   PC -> Pecas Compradas
//   PF -> Pecas Fabricadas
//   PP -> Pecas Processadas
//   SE -> Servicos
//   MP -> Materia Prima
//   MC -> Material Consumo
//   FM -> Formula

// unidadeCompromentimento — valores aceitos:
//   P -> Primaria
//   A -> Auxiliar

// Paginacao:
//   limit  -> qtd por pagina (padrao: 50, min: 1, sem max)
//   offset -> pagina (padrao: 1)

// codProduto -> pode ser multiplos separados por virgula
//   Ex: "123,456,789"`}</code>
              </pre>
            </div>
          )}

          {/* ─── GET /product ─── */}
          {activeTab === "search" && (
            <div className="space-y-3">
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 p-3 bg-gray-50/50">
                  <span className="px-2.5 py-1 rounded border bg-emerald-100 text-emerald-700 border-emerald-200"
                    style={{ fontSize: "0.68rem", fontWeight: 700, fontFamily: "monospace" }}>GET</span>
                  <code className="text-gray-800" style={{ fontSize: "0.85rem" }}>/product</code>
                </div>
                <div className="p-3 space-y-3">
                  <p className="text-gray-600" style={{ fontSize: "0.78rem" }}>
                    Busca produtos com paginacao e filtros opcionais. Padrao: 50 itens por pagina, pagina 1.
                  </p>

                  {/* Pagination row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="relative">
                      <ListFilter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input type="number" value={sLimit} onChange={(e) => setSLimit(e.target.value)}
                        placeholder="limit (50)" className={inputClass} style={inputStyle} min="1" />
                    </div>
                    <div className="relative">
                      <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input type="number" value={sOffset} onChange={(e) => setSOffset(e.target.value)}
                        placeholder="offset/pagina (1)" className={inputClass} style={inputStyle} min="1" />
                    </div>
                    <div className="relative">
                      <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input type="text" value={sCodProduto} onChange={(e) => setSCodProduto(e.target.value)}
                        placeholder="codProduto (ex: 123,456)" className={inputClass} style={inputStyle} />
                    </div>
                    <div className="relative">
                      <Package className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <select value={sTipoProduto} onChange={(e) => setSTipoProduto(e.target.value)}
                        className={`${inputClass} appearance-none`} style={inputStyle}>
                        {TIPO_PRODUTO_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Description filters */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="relative">
                      <FileText className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input type="text" value={sDescEst} onChange={(e) => setSDescEst(e.target.value)}
                        placeholder="descProdutoEst (estoque)" className={inputClass} style={inputStyle} />
                    </div>
                    <div className="relative">
                      <FileText className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input type="text" value={sDescNf} onChange={(e) => setSDescNf(e.target.value)}
                        placeholder="descProdutoNf (nota fiscal)" className={inputClass} style={inputStyle} />
                    </div>
                    <div className="relative">
                      <FileText className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input type="text" value={sDescRot} onChange={(e) => setSDescRot(e.target.value)}
                        placeholder="descProdutoRot (rotulo)" className={inputClass} style={inputStyle} />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-100 rounded"
                      style={{ fontSize: "0.65rem", fontWeight: 600 }}>Proxy: /sige/product</span>
                  </div>

                  <button onClick={handleSearch} disabled={searching || !isConnected}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                    style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                    {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    {searching ? "Buscando..." : "Buscar Produtos"}
                  </button>
                  <ResultBlock result={searchResult} error={searchError}
                    label="Resposta GET /product:"
                    onCopy={() => handleCopy(searchResult)} />
                </div>
              </div>
            </div>
          )}

          {/* ─── POST /product ─── */}
          {activeTab === "create" && (
            <div className="space-y-3">
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 p-3 bg-gray-50/50">
                  <span className="px-2.5 py-1 rounded border bg-blue-100 text-blue-700 border-blue-200"
                    style={{ fontSize: "0.68rem", fontWeight: 700, fontFamily: "monospace" }}>POST</span>
                  <code className="text-gray-800" style={{ fontSize: "0.85rem" }}>/product</code>
                </div>
                <div className="p-3 space-y-3">
                  <p className="text-gray-600" style={{ fontSize: "0.78rem" }}>
                    Cadastra um novo produto no SIGE. Preencha o body com os dados do produto.
                  </p>

                  <div>
                    <p className="text-gray-500 mb-1.5" style={{ fontSize: "0.7rem", fontWeight: 600 }}>REQUEST BODY (JSON)</p>
                    <textarea value={createJson} onChange={(e) => setCreateJson(e.target.value)}
                      rows={16}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 font-mono outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 focus:bg-white transition-all"
                      style={{ fontSize: "0.75rem", lineHeight: 1.5 }} />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-100 rounded"
                      style={{ fontSize: "0.65rem", fontWeight: 600 }}>Proxy: /sige/product</span>
                  </div>

                  <button onClick={handleCreate} disabled={creating || !isConnected}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                    style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                    {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    {creating ? "Cadastrando..." : "Cadastrar Produto"}
                  </button>
                  <ResultBlock result={createResult} error={createError}
                    label="Resposta POST /product:"
                    onCopy={() => handleCopy(createResult)} />
                </div>
              </div>

              <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                <p className="text-blue-700" style={{ fontSize: "0.72rem" }}>
                  <strong>Dica:</strong> Use a referencia de campos para verificar os valores aceitos em
                  <code className="bg-blue-100 px-1 rounded mx-1">tipoProduto</code> e
                  <code className="bg-blue-100 px-1 rounded mx-1">unidadeCompromentimento</code>.
                </p>
              </div>
            </div>
          )}

          {/* ─── PUT /product/{id} ─── */}
          {activeTab === "update" && (
            <div className="space-y-3">
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 p-3 bg-gray-50/50">
                  <span className="px-2.5 py-1 rounded border bg-amber-100 text-amber-700 border-amber-200"
                    style={{ fontSize: "0.68rem", fontWeight: 700, fontFamily: "monospace" }}>PUT</span>
                  <code className="text-gray-800" style={{ fontSize: "0.85rem" }}>/product/{"{id}"}</code>
                </div>
                <div className="p-3 space-y-3">
                  <p className="text-gray-600" style={{ fontSize: "0.78rem" }}>
                    Altera um produto existente pelo seu ID. Envie os campos que deseja atualizar.
                  </p>

                  <div className="relative">
                    <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input type="text" value={updateId} onChange={(e) => setUpdateId(e.target.value)}
                      placeholder="ID do produto *" className={inputClass} style={inputStyle} />
                  </div>

                  <div>
                    <p className="text-gray-500 mb-1.5" style={{ fontSize: "0.7rem", fontWeight: 600 }}>REQUEST BODY (JSON)</p>
                    <textarea value={updateJson} onChange={(e) => setUpdateJson(e.target.value)}
                      rows={16}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 font-mono outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 focus:bg-white transition-all"
                      style={{ fontSize: "0.75rem", lineHeight: 1.5 }} />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-100 rounded"
                      style={{ fontSize: "0.65rem", fontWeight: 600 }}>Proxy: /sige/product/:id</span>
                  </div>

                  <button onClick={handleUpdate} disabled={updating || !isConnected || !updateId.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                    style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                    {updating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pencil className="w-3.5 h-3.5" />}
                    {updating ? "Alterando..." : "Alterar Produto"}
                  </button>
                  <ResultBlock result={updateResult} error={updateError}
                    label={`Resposta PUT /product/${updateId || "{id}"}:`}
                    onCopy={() => handleCopy(updateResult)} />
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                <p className="text-amber-700" style={{ fontSize: "0.72rem" }}>
                  <strong>Dica:</strong> Use a aba "Buscar" para listar os produtos e obter o ID (codProduto) do produto que deseja alterar.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}