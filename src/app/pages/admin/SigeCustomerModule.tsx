import { useState, useCallback } from "react";
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  Play,
  XCircle,
  Search,
  Users,
  Plus,
  Pencil,
  Hash,
  User,
  FileText,
  MapPin,
  Phone,
  Copy,
  Check,
  ChevronUp,
  Info,
} from "lucide-react";
import { getValidAdminToken } from "./adminAuth";
import * as api from "../../services/api";
import { copyToClipboard } from "../../utils/clipboard";

interface SigeCustomerModuleProps {
  isConnected: boolean;
}

type ActiveTab = "search" | "getById" | "create" | "update";

export function SigeCustomerModule({ isConnected }: SigeCustomerModuleProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("search");

  // ─── Search state ───
  const [sLimit, setSLimit] = useState("10");
  const [sOffset, setSOffset] = useState("1");
  const [sComplemento, setSComplemento] = useState("0");
  const [sEndereco, setSEndereco] = useState("0");
  const [sContato, setSContato] = useState("0");
  const [sTipoCadastro, setSTipoCadastro] = useState("");
  const [sNomeCadastro, setSNomeCadastro] = useState("");
  const [sApelido, setSApelido] = useState("");
  const [sTipoFJ, setSTipoFJ] = useState("");
  const [sCpfCgc, setSCpfCgc] = useState("");
  const [sRgIe, setSRgIe] = useState("");
  const [sCodSituacao, setSCodSituacao] = useState("");
  const [sCodFilial, setSCodFilial] = useState("");
  const [sCodCategoria, setSCodCategoria] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<any>(null);
  const [searchError, setSearchError] = useState("");

  // ─── Get by ID state ───
  const [gId, setGId] = useState("");
  const [gComplemento, setGComplemento] = useState("0");
  const [gEndereco, setGEndereco] = useState("0");
  const [gContato, setGContato] = useState("0");
  const [gettingById, setGettingById] = useState(false);
  const [getByIdResult, setGetByIdResult] = useState<any>(null);
  const [getByIdError, setGetByIdError] = useState("");

  // ─── Create state ───
  const [createJson, setCreateJson] = useState(JSON.stringify({
    tipoCadastro: "",
    codFilial: "",
    codArea: "",
    nomeCadastro: "",
    apelido: "",
    cpfCgc: "",
    rgIe: null,
    uf: "",
    observacao: null,
    codRamo: null,
    codCategoria: null,
  }, null, 2));
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<any>(null);
  const [createError, setCreateError] = useState("");
  const [showCreateHelp, setShowCreateHelp] = useState(false);

  // ─── Update state ───
  const [updateId, setUpdateId] = useState("");
  const [updateJson, setUpdateJson] = useState(JSON.stringify({
    codFilial: "",
    codArea: "",
    nomeCadastro: "",
    apelido: null,
    cpfCgc: "",
    rgIe: null,
    uf: "",
    observacao: null,
    codSituacao: "",
    codRamo: "",
    codCategoria: null,
  }, null, 2));
  const [updating, setUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState<any>(null);
  const [updateError, setUpdateError] = useState("");

  // ─── Clipboard ───
  const [copied, setCopied] = useState(false);

  const getAccessToken = useCallback(async (): Promise<string> => {
    const token = await getValidAdminToken();
    if (!token) throw new Error("Sessão expirada");
    return token;
  }, []);

  const handleSearch = async () => {
    setSearching(true); setSearchResult(null); setSearchError("");
    try {
      const token = await getAccessToken();
      const params: Record<string, string> = {};
      if (sLimit.trim()) params.limit = sLimit.trim();
      if (sOffset.trim()) params.offset = sOffset.trim();
      if (sComplemento === "1") params.complemento = "1";
      if (sEndereco === "1") params.endereco = "1";
      if (sContato === "1") params.contato = "1";
      if (sTipoCadastro.trim()) params.tipoCadastro = sTipoCadastro.trim();
      if (sNomeCadastro.trim()) params.nomeCadastro = sNomeCadastro.trim();
      if (sApelido.trim()) params.apelido = sApelido.trim();
      if (sTipoFJ.trim()) params.tipoFJ = sTipoFJ.trim();
      if (sCpfCgc.trim()) params.cpfCgc = sCpfCgc.trim();
      if (sRgIe.trim()) params.rgIe = sRgIe.trim();
      if (sCodSituacao.trim()) params.codSituacao = sCodSituacao.trim();
      if (sCodFilial.trim()) params.codFilial = sCodFilial.trim();
      if (sCodCategoria.trim()) params.codCategoria = sCodCategoria.trim();
      const result = await api.sigeCustomerSearch(token, params);
      setSearchResult(result);
    } catch (e: any) {
      setSearchError(e.message || "Erro ao buscar clientes.");
    } finally { setSearching(false); }
  };

  const handleGetById = async () => {
    if (!gId.trim()) { setGetByIdError("Informe o ID."); return; }
    setGettingById(true); setGetByIdResult(null); setGetByIdError("");
    try {
      const token = await getAccessToken();
      const params: Record<string, string> = {};
      if (gComplemento === "1") params.complemento = "1";
      if (gEndereco === "1") params.endereco = "1";
      if (gContato === "1") params.contato = "1";
      const result = await api.sigeCustomerGetById(token, gId.trim(), params);
      setGetByIdResult(result);
    } catch (e: any) {
      setGetByIdError(e.message || "Erro ao buscar cliente.");
    } finally { setGettingById(false); }
  };

  const handleCreate = async () => {
    setCreating(true); setCreateResult(null); setCreateError("");
    try {
      let body: any;
      try { body = JSON.parse(createJson); } catch { setCreateError("JSON inválido."); setCreating(false); return; }
      if (!body.tipoCadastro || !body.nomeCadastro) { setCreateError("tipoCadastro e nomeCadastro são obrigatórios."); setCreating(false); return; }
      const token = await getAccessToken();
      const result = await api.sigeCustomerCreate(token, body);
      setCreateResult(result);
    } catch (e: any) {
      setCreateError(e.message || "Erro ao cadastrar cliente.");
    } finally { setCreating(false); }
  };

  const handleUpdate = async () => {
    if (!updateId.trim()) { setUpdateError("Informe o ID."); return; }
    setUpdating(true); setUpdateResult(null); setUpdateError("");
    try {
      let body: any;
      try { body = JSON.parse(updateJson); } catch { setUpdateError("JSON inválido."); setUpdating(false); return; }
      const token = await getAccessToken();
      const result = await api.sigeCustomerUpdate(token, updateId.trim(), body);
      setUpdateResult(result);
    } catch (e: any) {
      setUpdateError(e.message || "Erro ao alterar cliente.");
    } finally { setUpdating(false); }
  };

  const handleCopy = (data: any) => {
    copyToClipboard(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const inputClass = "w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 placeholder-gray-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:bg-white transition-all";
  const inputStyle = { fontSize: "0.8rem" } as const;
  const labelStyle = { fontSize: "0.7rem", fontWeight: 600 } as const;

  const tabs: { key: ActiveTab; label: string; icon: typeof Search; method: string; methodColor: string }[] = [
    { key: "search", label: "Buscar", icon: Search, method: "GET", methodColor: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    { key: "getById", label: "Por ID", icon: Hash, method: "GET", methodColor: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    { key: "create", label: "Cadastrar", icon: Plus, method: "POST", methodColor: "bg-blue-100 text-blue-700 border-blue-200" },
    { key: "update", label: "Alterar", icon: Pencil, method: "PUT", methodColor: "bg-amber-100 text-amber-700 border-amber-200" },
  ];

  const ToggleChip = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
    <button type="button" onClick={() => onChange(value === "1" ? "0" : "1")}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
        value === "1"
          ? "bg-indigo-50 text-indigo-700 border-indigo-200"
          : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
      }`}>
      <span className={`w-2 h-2 rounded-full ${value === "1" ? "bg-indigo-500" : "bg-gray-300"}`} />
      {label}
    </button>
  );

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
          <div className="px-3 pb-3 overflow-x-auto max-h-[400px] overflow-y-auto">
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
          <Users className="w-5 h-5 text-indigo-600" />
        </div>
        <div className="text-left flex-1">
          <h4 className="text-gray-900" style={{ fontSize: "0.95rem", fontWeight: 700 }}>Clientes</h4>
          <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>Buscar, cadastrar e alterar clientes — 4 endpoints</p>
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

          {/* ─── GET /customer ─── */}
          {activeTab === "search" && (
            <div className="space-y-3">
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 p-3 bg-gray-50/50">
                  <span className="px-2.5 py-1 rounded border bg-emerald-100 text-emerald-700 border-emerald-200"
                    style={{ fontSize: "0.68rem", fontWeight: 700, fontFamily: "monospace" }}>GET</span>
                  <code className="text-gray-800" style={{ fontSize: "0.85rem" }}>/customer</code>
                </div>
                <div className="p-3 space-y-3">
                  <p className="text-gray-600" style={{ fontSize: "0.78rem" }}>
                    Busca cadastros de clientes com filtros, paginação e includes opcionais.
                  </p>

                  {/* Includes toggle */}
                  <div>
                    <p className="text-gray-500 mb-1.5" style={labelStyle}>INCLUIR DADOS EXTRAS</p>
                    <div className="flex flex-wrap gap-2">
                      <ToggleChip label="Complemento" value={sComplemento} onChange={setSComplemento} />
                      <ToggleChip label="Endereço" value={sEndereco} onChange={setSEndereco} />
                      <ToggleChip label="Contato" value={sContato} onChange={setSContato} />
                    </div>
                  </div>

                  {/* Pagination */}
                  <div>
                    <p className="text-gray-500 mb-1.5" style={labelStyle}>PAGINACAO</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="relative">
                        <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input type="text" value={sLimit} onChange={(e) => setSLimit(e.target.value)}
                          placeholder="limit (padrão 50)" className={inputClass} style={inputStyle} />
                      </div>
                      <div className="relative">
                        <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input type="text" value={sOffset} onChange={(e) => setSOffset(e.target.value)}
                          placeholder="offset / página (padrão 1)" className={inputClass} style={inputStyle} />
                      </div>
                    </div>
                  </div>

                  {/* Filters */}
                  <div>
                    <p className="text-gray-500 mb-1.5" style={labelStyle}>FILTROS</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <div className="relative">
                        <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input type="text" value={sNomeCadastro} onChange={(e) => setSNomeCadastro(e.target.value)}
                          placeholder="nomeCadastro" className={inputClass} style={inputStyle} />
                      </div>
                      <div className="relative">
                        <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input type="text" value={sApelido} onChange={(e) => setSApelido(e.target.value)}
                          placeholder="apelido" className={inputClass} style={inputStyle} />
                      </div>
                      <div className="relative">
                        <FileText className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input type="text" value={sCpfCgc} onChange={(e) => setSCpfCgc(e.target.value)}
                          placeholder="cpfCgc" className={inputClass} style={inputStyle} />
                      </div>
                      <div className="relative">
                        <FileText className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input type="text" value={sRgIe} onChange={(e) => setSRgIe(e.target.value)}
                          placeholder="rgIe" className={inputClass} style={inputStyle} />
                      </div>
                      <div className="relative">
                        <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input type="text" value={sTipoCadastro} onChange={(e) => setSTipoCadastro(e.target.value)}
                          placeholder="tipoCadastro" className={inputClass} style={inputStyle} />
                      </div>
                      <div className="relative">
                        <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <select value={sTipoFJ} onChange={(e) => setSTipoFJ(e.target.value)}
                          className={`${inputClass} appearance-none`} style={inputStyle}>
                          <option value="">tipoFJ (todos)</option>
                          <option value="F">F - Pessoa Fisica</option>
                          <option value="J">J - Pessoa Juridica</option>
                        </select>
                      </div>
                      <div className="relative">
                        <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input type="text" value={sCodSituacao} onChange={(e) => setSCodSituacao(e.target.value)}
                          placeholder="codSituacao" className={inputClass} style={inputStyle} />
                      </div>
                      <div className="relative">
                        <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input type="text" value={sCodFilial} onChange={(e) => setSCodFilial(e.target.value)}
                          placeholder="codFilial" className={inputClass} style={inputStyle} />
                      </div>
                      <div className="relative">
                        <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input type="text" value={sCodCategoria} onChange={(e) => setSCodCategoria(e.target.value)}
                          placeholder="codCategoria" className={inputClass} style={inputStyle} />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-100 rounded"
                      style={{ fontSize: "0.65rem", fontWeight: 600 }}>Proxy: /sige/customer</span>
                  </div>

                  <button onClick={handleSearch} disabled={searching || !isConnected}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                    style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                    {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    {searching ? "Buscando..." : "Buscar Clientes"}
                  </button>
                  <ResultBlock result={searchResult} error={searchError} label="Resposta GET /customer:" onCopy={() => handleCopy(searchResult)} />
                </div>
              </div>

              {/* Tip */}
              <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                <p className="text-indigo-700" style={{ fontSize: "0.72rem" }}>
                  <strong>Dica:</strong> Use <code className="bg-indigo-100 px-1 rounded">limit</code> com valores baixos para evitar respostas pesadas.
                  Dependencias como <code className="bg-indigo-100 px-1 rounded">tipoCadastro</code>, <code className="bg-indigo-100 px-1 rounded">codFilial</code> e
                  <code className="bg-indigo-100 px-1 rounded">codArea</code> podem ser consultadas no modulo Dependencias.
                </p>
              </div>
            </div>
          )}

          {/* ─── GET /customer/{id} ─── */}
          {activeTab === "getById" && (
            <div className="space-y-3">
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 p-3 bg-gray-50/50">
                  <span className="px-2.5 py-1 rounded border bg-emerald-100 text-emerald-700 border-emerald-200"
                    style={{ fontSize: "0.68rem", fontWeight: 700, fontFamily: "monospace" }}>GET</span>
                  <code className="text-gray-800" style={{ fontSize: "0.85rem" }}>/customer/{"{id}"}</code>
                </div>
                <div className="p-3 space-y-3">
                  <p className="text-gray-600" style={{ fontSize: "0.78rem" }}>
                    Busca um cliente específico pelo seu ID, com includes opcionais.
                  </p>

                  <div>
                    <p className="text-gray-500 mb-1.5" style={labelStyle}>INCLUIR DADOS EXTRAS</p>
                    <div className="flex flex-wrap gap-2">
                      <ToggleChip label="Complemento" value={gComplemento} onChange={setGComplemento} />
                      <ToggleChip label="Endereço" value={gEndereco} onChange={setGEndereco} />
                      <ToggleChip label="Contato" value={gContato} onChange={setGContato} />
                    </div>
                  </div>

                  <div className="relative">
                    <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input type="text" value={gId} onChange={(e) => setGId(e.target.value)}
                      placeholder="ID do cliente (numerico)" className={inputClass} style={inputStyle} />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-100 rounded"
                      style={{ fontSize: "0.65rem", fontWeight: 600 }}>Proxy: /sige/customer/:id</span>
                  </div>

                  <button onClick={handleGetById} disabled={gettingById || !isConnected || !gId.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                    style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                    {gettingById ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    {gettingById ? "Buscando..." : "Buscar por ID"}
                  </button>
                  <ResultBlock result={getByIdResult} error={getByIdError} label={`Resposta GET /customer/${gId}:`} onCopy={() => handleCopy(getByIdResult)} />
                </div>
              </div>
            </div>
          )}

          {/* ─── POST /customer ─── */}
          {activeTab === "create" && (
            <div className="space-y-3">
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 p-3 bg-gray-50/50">
                  <span className="px-2.5 py-1 rounded border bg-blue-100 text-blue-700 border-blue-200"
                    style={{ fontSize: "0.68rem", fontWeight: 700, fontFamily: "monospace" }}>POST</span>
                  <code className="text-gray-800" style={{ fontSize: "0.85rem" }}>/customer</code>
                </div>
                <div className="p-3 space-y-3">
                  <p className="text-gray-600" style={{ fontSize: "0.78rem" }}>
                    Cadastra um novo cliente. Objetos opcionais: <code className="bg-gray-100 px-1 rounded">complemento</code>,
                    <code className="bg-gray-100 px-1 rounded ml-0.5">endereco</code>,
                    <code className="bg-gray-100 px-1 rounded ml-0.5">contato</code> — só inclua se for preencher.
                  </p>

                  <button onClick={() => setShowCreateHelp(!showCreateHelp)}
                    className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700 cursor-pointer"
                    style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                    <Info className="w-3.5 h-3.5" />
                    {showCreateHelp ? "Ocultar" : "Ver"} modelo completo com complemento/endereço/contato
                    {showCreateHelp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>

                  {showCreateHelp && (
                    <div className="bg-gray-900 rounded-lg p-3 overflow-x-auto">
                      <pre className="text-gray-300" style={{ fontSize: "0.7rem", lineHeight: 1.4 }}>
                        <code>{`// Modelo completo (complemento, endereço e contato são opcionais)
{
  "tipoCadastro": "",     // obrigatório — ver /type-register
  "codFilial": "",        // obrigatório — ver /branch
  "codArea": "",          // ver /area
  "nomeCadastro": "",     // obrigatório
  "apelido": "",
  "cpfCgc": "",
  "rgIe": null,
  "uf": "SP",
  "observacao": null,
  "codRamo": null,        // ver /area-work
  "codCategoria": null,   // ver /category
  "complemento": {        // OPCIONAL — só inclua se preencher
    "codLista": 0,
    "codGrupoLimite": null,
    "codRisco": null,
    "percDesconto": null,
    "codMoeda": null,
    "codVendedor": null,
    "consumidorFinal": "S | N",
    "aceitaSubstTrib": "S | N",
    "percSubstTrib": null,
    "codTransportadora": null,
    "contribuinteICMS": "null | C | I | N"
  },
  "endereco": {           // OPCIONAL
    "tipoEndereco": "",
    "cep": "", "endereco": "", "bairro": "",
    "cidade": "", "numero": null, "uf": "SP",
    "codPais": "", "codMunicipio": null,
    "fone": "", "email": null
  },
  "contato": {            // OPCIONAL
    "nome": "", "cargo": null,
    "fone": "", "email": "",
    "foneCel": null, "observacao": null
  }
}`}</code>
                      </pre>
                    </div>
                  )}

                  <div>
                    <p className="text-gray-500 mb-1.5" style={labelStyle}>REQUEST BODY (JSON)</p>
                    <textarea value={createJson} onChange={(e) => setCreateJson(e.target.value)}
                      rows={12}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 font-mono outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:bg-white transition-all"
                      style={{ fontSize: "0.78rem", lineHeight: 1.5 }} />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-100 rounded"
                      style={{ fontSize: "0.65rem", fontWeight: 600 }}>Proxy: /sige/customer</span>
                  </div>

                  <button onClick={handleCreate} disabled={creating || !isConnected}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                    style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                    {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    {creating ? "Cadastrando..." : "Cadastrar Cliente"}
                  </button>
                  <ResultBlock result={createResult} error={createError} label="Resposta POST /customer:" onCopy={() => handleCopy(createResult)} />
                </div>
              </div>
            </div>
          )}

          {/* ─── PUT /customer/{id} ─── */}
          {activeTab === "update" && (
            <div className="space-y-3">
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 p-3 bg-gray-50/50">
                  <span className="px-2.5 py-1 rounded border bg-amber-100 text-amber-700 border-amber-200"
                    style={{ fontSize: "0.68rem", fontWeight: 700, fontFamily: "monospace" }}>PUT</span>
                  <code className="text-gray-800" style={{ fontSize: "0.85rem" }}>/customer/{"{id}"}</code>
                </div>
                <div className="p-3 space-y-3">
                  <p className="text-gray-600" style={{ fontSize: "0.78rem" }}>
                    Altera um cliente existente pelo ID. Envie apenas os campos que deseja alterar.
                  </p>

                  <div className="relative">
                    <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input type="text" value={updateId} onChange={(e) => setUpdateId(e.target.value)}
                      placeholder="ID do cliente" className={inputClass} style={inputStyle} />
                  </div>

                  <div>
                    <p className="text-gray-500 mb-1.5" style={labelStyle}>REQUEST BODY (JSON)</p>
                    <textarea value={updateJson} onChange={(e) => setUpdateJson(e.target.value)}
                      rows={10}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 font-mono outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:bg-white transition-all"
                      style={{ fontSize: "0.78rem", lineHeight: 1.5 }} />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-100 rounded"
                      style={{ fontSize: "0.65rem", fontWeight: 600 }}>Proxy: /sige/customer/:id</span>
                  </div>

                  <button onClick={handleUpdate} disabled={updating || !isConnected || !updateId.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                    style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                    {updating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pencil className="w-3.5 h-3.5" />}
                    {updating ? "Alterando..." : "Alterar Cliente"}
                  </button>
                  <ResultBlock result={updateResult} error={updateError} label={`Resposta PUT /customer/${updateId}:`} onCopy={() => handleCopy(updateResult)} />
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                <p className="text-amber-700" style={{ fontSize: "0.72rem" }}>
                  <strong>Dica:</strong> Use a aba "Buscar" ou "Por ID" para encontrar o ID do cliente que deseja alterar.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}