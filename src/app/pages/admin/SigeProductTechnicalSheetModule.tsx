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
  FileText,
  Tag,
  Type,
} from "lucide-react";
import { supabase } from "../../services/supabaseClient";
import * as api from "../../services/api";

interface Props {
  isConnected: boolean;
}

type ActiveTab = "search" | "create" | "update";

const EMPTY_BODY = { codRef: "", texto: "" };

export function SigeProductTechnicalSheetModule({ isConnected }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("search");

  // Search
  const [sProductId, setSProductId] = useState("");
  const [sCodRef, setSCodRef] = useState("");
  const [sTexto, setSTexto] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<any>(null);
  const [searchError, setSearchError] = useState("");

  // Create
  const [cProductId, setCProductId] = useState("");
  const [createJson, setCreateJson] = useState(JSON.stringify(EMPTY_BODY, null, 2));
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<any>(null);
  const [createError, setCreateError] = useState("");

  // Update
  const [uProductId, setUProductId] = useState("");
  const [updateJson, setUpdateJson] = useState(JSON.stringify(EMPTY_BODY, null, 2));
  const [updating, setUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState<any>(null);
  const [updateError, setUpdateError] = useState("");

  const [copied, setCopied] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const getAccessToken = useCallback(async (): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Sessao expirada");
    return session.access_token;
  }, []);

  const handleSearch = async () => {
    if (!sProductId.trim()) { setSearchError("Informe o ID do produto."); return; }
    setSearching(true); setSearchResult(null); setSearchError("");
    try {
      const token = await getAccessToken();
      const params: Record<string, string> = {};
      if (sCodRef.trim()) params.codRef = sCodRef.trim();
      if (sTexto.trim()) params.texto = sTexto.trim();
      const res = await api.sigeProductTechnicalSheetGet(token, sProductId.trim(), params);
      setSearchResult(res);
    } catch (e: any) {
      setSearchError(e.message || "Erro ao buscar ficha tecnica.");
    } finally { setSearching(false); }
  };

  const handleCreate = async () => {
    if (!cProductId.trim()) { setCreateError("Informe o ID do produto."); return; }
    setCreating(true); setCreateResult(null); setCreateError("");
    try {
      let body: any;
      try { body = JSON.parse(createJson); } catch { setCreateError("JSON invalido."); setCreating(false); return; }
      const token = await getAccessToken();
      const res = await api.sigeProductTechnicalSheetCreate(token, cProductId.trim(), body);
      setCreateResult(res);
    } catch (e: any) {
      setCreateError(e.message || "Erro ao cadastrar ficha tecnica.");
    } finally { setCreating(false); }
  };

  const handleUpdate = async () => {
    if (!uProductId.trim()) { setUpdateError("Informe o ID do produto."); return; }
    setUpdating(true); setUpdateResult(null); setUpdateError("");
    try {
      let body: any;
      try { body = JSON.parse(updateJson); } catch { setUpdateError("JSON invalido."); setUpdating(false); return; }
      const token = await getAccessToken();
      const res = await api.sigeProductTechnicalSheetUpdate(token, uProductId.trim(), body);
      setUpdateResult(res);
    } catch (e: any) {
      setUpdateError(e.message || "Erro ao alterar ficha tecnica.");
    } finally { setUpdating(false); }
  };

  const handleCopy = (data: any) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const inputClass = "w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 placeholder-gray-400 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 focus:bg-white transition-all";
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
        <div className="w-10 h-10 bg-cyan-100 rounded-lg flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5 text-cyan-600" />
        </div>
        <div className="text-left flex-1">
          <h4 className="text-gray-900" style={{ fontSize: "0.95rem", fontWeight: 700 }}>Produto Ficha Tecnica</h4>
          <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>Observacoes/textos por referencia do produto — 3 endpoints</p>
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
            className="flex items-center gap-1.5 text-cyan-600 hover:text-cyan-700 cursor-pointer"
            style={{ fontSize: "0.72rem", fontWeight: 600 }}>
            <Info className="w-3.5 h-3.5" />
            {showHelp ? "Ocultar" : "Ver"} referencia
            {showHelp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showHelp && (
            <div className="bg-gray-900 rounded-lg p-3">
              <pre className="text-gray-300" style={{ fontSize: "0.72rem", lineHeight: 1.6 }}>
                <code>{`// Ficha Tecnica = observacoes ("Texto") por referencia

// GET  /product/{id}/technical-sheet
//   Filtros: codRef (multiplos por virgula), texto (similar/igual)

// POST /product/{id}/technical-sheet
// PUT  /product/{id}/technical-sheet
//   Body: { "codRef": "", "texto": "" }

// Nao envie tags desnecessarias no body.`}</code>
              </pre>
            </div>
          )}

          {/* ─── GET ─── */}
          {activeTab === "search" && (
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              <div className="flex items-center gap-3 p-3 bg-gray-50/50">
                <span className="px-2.5 py-1 rounded border bg-emerald-100 text-emerald-700 border-emerald-200"
                  style={{ fontSize: "0.68rem", fontWeight: 700, fontFamily: "monospace" }}>GET</span>
                <code className="text-gray-800" style={{ fontSize: "0.85rem" }}>/product/{"{id}"}/technical-sheet</code>
              </div>
              <div className="p-3 space-y-3">
                <p className="text-gray-600" style={{ fontSize: "0.78rem" }}>
                  Busca as observacoes (textos) do produto por referencia.
                </p>

                <div className="relative">
                  <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input type="text" value={sProductId} onChange={(e) => setSProductId(e.target.value)}
                    placeholder="ID do produto *" className={inputClass} style={inputStyle} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="relative">
                    <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input type="text" value={sCodRef} onChange={(e) => setSCodRef(e.target.value)}
                      placeholder="codRef (ex: REF1,REF2)" className={inputClass} style={inputStyle} />
                  </div>
                  <div className="relative">
                    <Type className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input type="text" value={sTexto} onChange={(e) => setSTexto(e.target.value)}
                      placeholder="texto (busca similar/igual)" className={inputClass} style={inputStyle} />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-100 rounded"
                    style={{ fontSize: "0.65rem", fontWeight: 600 }}>Proxy: /sige/product/:id/technical-sheet</span>
                </div>

                <button onClick={handleSearch} disabled={searching || !isConnected || !sProductId.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                  style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                  {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  {searching ? "Buscando..." : "Buscar Ficha Tecnica"}
                </button>
                <ResultBlock result={searchResult} error={searchError}
                  label={`Resposta GET /product/${sProductId || "{id}"}/technical-sheet:`}
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
                  <code className="text-gray-800" style={{ fontSize: "0.85rem" }}>/product/{"{id}"}/technical-sheet</code>
                </div>
                <div className="p-3 space-y-3">
                  <p className="text-gray-600" style={{ fontSize: "0.78rem" }}>
                    Cadastra uma ficha tecnica (texto) para uma referencia do produto.
                  </p>

                  <div className="relative">
                    <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input type="text" value={cProductId} onChange={(e) => setCProductId(e.target.value)}
                      placeholder="ID do produto *" className={inputClass} style={inputStyle} />
                  </div>

                  <div>
                    <p className="text-gray-500 mb-1.5" style={{ fontSize: "0.7rem", fontWeight: 600 }}>REQUEST BODY (JSON)</p>
                    <textarea value={createJson} onChange={(e) => setCreateJson(e.target.value)}
                      rows={5}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 font-mono outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 focus:bg-white transition-all"
                      style={{ fontSize: "0.75rem", lineHeight: 1.5 }} />
                  </div>

                  <button onClick={handleCreate} disabled={creating || !isConnected || !cProductId.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                    style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                    {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    {creating ? "Cadastrando..." : "Cadastrar Ficha"}
                  </button>
                  <ResultBlock result={createResult} error={createError}
                    label={`Resposta POST /product/${cProductId || "{id}"}/technical-sheet:`}
                    onCopy={() => handleCopy(createResult)} />
                </div>
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
                  <code className="text-gray-800" style={{ fontSize: "0.85rem" }}>/product/{"{id}"}/technical-sheet</code>
                </div>
                <div className="p-3 space-y-3">
                  <p className="text-gray-600" style={{ fontSize: "0.78rem" }}>
                    Atualiza a ficha tecnica (texto) de uma referencia do produto.
                  </p>

                  <div className="relative">
                    <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input type="text" value={uProductId} onChange={(e) => setUProductId(e.target.value)}
                      placeholder="ID do produto *" className={inputClass} style={inputStyle} />
                  </div>

                  <div>
                    <p className="text-gray-500 mb-1.5" style={{ fontSize: "0.7rem", fontWeight: 600 }}>REQUEST BODY (JSON)</p>
                    <textarea value={updateJson} onChange={(e) => setUpdateJson(e.target.value)}
                      rows={5}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 font-mono outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 focus:bg-white transition-all"
                      style={{ fontSize: "0.75rem", lineHeight: 1.5 }} />
                  </div>

                  <button onClick={handleUpdate} disabled={updating || !isConnected || !uProductId.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                    style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                    {updating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pencil className="w-3.5 h-3.5" />}
                    {updating ? "Alterando..." : "Alterar Ficha"}
                  </button>
                  <ResultBlock result={updateResult} error={updateError}
                    label={`Resposta PUT /product/${uProductId || "{id}"}/technical-sheet:`}
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
