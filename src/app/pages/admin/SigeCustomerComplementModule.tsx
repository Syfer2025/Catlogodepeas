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
  FileCheck,
} from "lucide-react";
import { getValidAdminToken } from "./adminAuth";
import * as api from "../../services/api";
import { copyToClipboard } from "../../utils/clipboard";

interface Props {
  isConnected: boolean;
}

type ActiveTab = "search" | "create" | "update";

const EMPTY_COMPLEMENT = {
  codLista: 0,
  codGrupoLimite: null,
  codRisco: null,
  percDesconto: null,
  codMoeda: null,
  codVendedor: null,
  consumidorFinal: "S",
  aceitaSubstTrib: "N",
  percSubstTrib: null,
  codTransportadora: null,
  contribuinteICMS: null,
};

export function SigeCustomerComplementModule({ isConnected }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("search");

  // ─── Search state ───
  const [searchId, setSearchId] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<any>(null);
  const [searchError, setSearchError] = useState("");

  // ─── Create state ───
  const [createId, setCreateId] = useState("");
  const [createJson, setCreateJson] = useState(JSON.stringify(EMPTY_COMPLEMENT, null, 2));
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<any>(null);
  const [createError, setCreateError] = useState("");

  // ─── Update state ───
  const [updateId, setUpdateId] = useState("");
  const [updateJson, setUpdateJson] = useState(JSON.stringify(EMPTY_COMPLEMENT, null, 2));
  const [updating, setUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState<any>(null);
  const [updateError, setUpdateError] = useState("");

  // ─── Clipboard ───
  const [copied, setCopied] = useState(false);

  // ─── Docs toggle ───
  const [showHelp, setShowHelp] = useState(false);

  const getAccessToken = useCallback(async (): Promise<string> => {
    const token = await getValidAdminToken();
    if (!token) throw new Error("Sessão expirada");
    return token;
  }, []);

  const handleSearch = async () => {
    if (!searchId.trim()) { setSearchError("Informe o ID do cliente."); return; }
    setSearching(true); setSearchResult(null); setSearchError("");
    try {
      const token = await getAccessToken();
      const result = await api.sigeCustomerComplementGet(token, searchId.trim());
      setSearchResult(result);
    } catch (e: any) {
      setSearchError(e.message || "Erro ao buscar complemento.");
    } finally { setSearching(false); }
  };

  const handleCreate = async () => {
    if (!createId.trim()) { setCreateError("Informe o ID do cliente."); return; }
    setCreating(true); setCreateResult(null); setCreateError("");
    try {
      let body: any;
      try { body = JSON.parse(createJson); } catch { setCreateError("JSON inválido."); setCreating(false); return; }
      const token = await getAccessToken();
      const result = await api.sigeCustomerComplementCreate(token, createId.trim(), body);
      setCreateResult(result);
    } catch (e: any) {
      setCreateError(e.message || "Erro ao cadastrar complemento.");
    } finally { setCreating(false); }
  };

  const handleUpdate = async () => {
    if (!updateId.trim()) { setUpdateError("Informe o ID do cliente."); return; }
    setUpdating(true); setUpdateResult(null); setUpdateError("");
    try {
      let body: any;
      try { body = JSON.parse(updateJson); } catch { setUpdateError("JSON inválido."); setUpdating(false); return; }
      const token = await getAccessToken();
      const result = await api.sigeCustomerComplementUpdate(token, updateId.trim(), body);
      setUpdateResult(result);
    } catch (e: any) {
      setUpdateError(e.message || "Erro ao alterar complemento.");
    } finally { setUpdating(false); }
  };

  const handleCopy = (data: any) => {
    copyToClipboard(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const inputClass = "w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 placeholder-gray-400 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 focus:bg-white transition-all";
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
        <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center shrink-0">
          <FileCheck className="w-5 h-5 text-violet-600" />
        </div>
        <div className="text-left flex-1">
          <h4 className="text-gray-900" style={{ fontSize: "0.95rem", fontWeight: 700 }}>Cliente Complemento</h4>
          <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>Buscar, cadastrar e alterar complemento do cadastro — 3 endpoints</p>
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

          {/* contribuinteICMS reference */}
          <button onClick={() => setShowHelp(!showHelp)}
            className="flex items-center gap-1.5 text-violet-600 hover:text-violet-700 cursor-pointer"
            style={{ fontSize: "0.72rem", fontWeight: 600 }}>
            <Info className="w-3.5 h-3.5" />
            {showHelp ? "Ocultar" : "Ver"} referência de campos
            {showHelp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showHelp && (
            <div className="bg-gray-900 rounded-lg p-3">
              <pre className="text-gray-300" style={{ fontSize: "0.72rem", lineHeight: 1.6 }}>
                <code>{`// Campos do Complemento
{
  "codLista": 0,           // código da lista de preço
  "codGrupoLimite": null,  // cod grupo limite de credito
  "codRisco": null,        // cod risco do cadastro
  "percDesconto": null,    // percentual de desconto
  "codMoeda": null,        // cod moeda
  "codVendedor": null,     // cod vendedor vinculado
  "consumidorFinal": "",   // "S" = Sim | "N" = Nao
  "aceitaSubstTrib": "",   // "S" = Sim | "N" = Nao
  "percSubstTrib": null,   // percentual subst. tributaria
  "codTransportadora": null, // cod transportadora
  "contribuinteICMS": ""   // Tipos de contribuicao:
}

// contribuinteICMS — valores aceitos:
//   null  -> NENHUM
//   "C"   -> CONTRIBUINTE
//   "N"   -> NAO CONTRIBUINTE
//   "I"   -> ISENTO

// Obs: cada cadastro pode ter apenas 1 complemento.
// Alguns campos podem ser obrigatórios — valide com a empresa.`}</code>
              </pre>
            </div>
          )}

          {/* ─── GET /customer/{id}/complement ─── */}
          {activeTab === "search" && (
            <div className="space-y-3">
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 p-3 bg-gray-50/50">
                  <span className="px-2.5 py-1 rounded border bg-emerald-100 text-emerald-700 border-emerald-200"
                    style={{ fontSize: "0.68rem", fontWeight: 700, fontFamily: "monospace" }}>GET</span>
                  <code className="text-gray-800" style={{ fontSize: "0.85rem" }}>/customer/{"{id}"}/complement</code>
                </div>
                <div className="p-3 space-y-3">
                  <p className="text-gray-600" style={{ fontSize: "0.78rem" }}>
                    Busca o complemento do cadastro pelo ID do cliente. Cada cadastro possui no máximo 1 registro de complemento.
                  </p>

                  <div className="relative">
                    <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input type="text" value={searchId} onChange={(e) => setSearchId(e.target.value)}
                      placeholder="ID do cliente *" className={inputClass} style={inputStyle} />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-100 rounded"
                      style={{ fontSize: "0.65rem", fontWeight: 600 }}>Proxy: /sige/customer/:id/complement</span>
                  </div>

                  <button onClick={handleSearch} disabled={searching || !isConnected || !searchId.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                    style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                    {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    {searching ? "Buscando..." : "Buscar Complemento"}
                  </button>
                  <ResultBlock result={searchResult} error={searchError}
                    label={`Resposta GET /customer/${searchId || "{id}"}/complement:`}
                    onCopy={() => handleCopy(searchResult)} />
                </div>
              </div>
            </div>
          )}

          {/* ─── POST /customer/{id}/complement ─── */}
          {activeTab === "create" && (
            <div className="space-y-3">
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 p-3 bg-gray-50/50">
                  <span className="px-2.5 py-1 rounded border bg-blue-100 text-blue-700 border-blue-200"
                    style={{ fontSize: "0.68rem", fontWeight: 700, fontFamily: "monospace" }}>POST</span>
                  <code className="text-gray-800" style={{ fontSize: "0.85rem" }}>/customer/{"{id}"}/complement</code>
                </div>
                <div className="p-3 space-y-3">
                  <p className="text-gray-600" style={{ fontSize: "0.78rem" }}>
                    Cadastra o complemento para um cliente. Cada cadastro suporta apenas <strong>1 registro</strong> de complemento.
                  </p>

                  <div className="relative">
                    <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input type="text" value={createId} onChange={(e) => setCreateId(e.target.value)}
                      placeholder="ID do cliente *" className={inputClass} style={inputStyle} />
                  </div>

                  <div>
                    <p className="text-gray-500 mb-1.5" style={{ fontSize: "0.7rem", fontWeight: 600 }}>REQUEST BODY (JSON)</p>
                    <textarea value={createJson} onChange={(e) => setCreateJson(e.target.value)}
                      rows={12}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 font-mono outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 focus:bg-white transition-all"
                      style={{ fontSize: "0.75rem", lineHeight: 1.5 }} />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-100 rounded"
                      style={{ fontSize: "0.65rem", fontWeight: 600 }}>Proxy: /sige/customer/:id/complement</span>
                  </div>

                  <button onClick={handleCreate} disabled={creating || !isConnected || !createId.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                    style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                    {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    {creating ? "Cadastrando..." : "Cadastrar Complemento"}
                  </button>
                  <ResultBlock result={createResult} error={createError}
                    label={`Resposta POST /customer/${createId || "{id}"}/complement:`}
                    onCopy={() => handleCopy(createResult)} />
                </div>
              </div>

              <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                <p className="text-blue-700" style={{ fontSize: "0.72rem" }}>
                  <strong>Importante:</strong> Cada cliente suporta apenas <strong>1</strong> complemento. Se já existir, use a aba "Alterar" para atualizar.
                </p>
              </div>
            </div>
          )}

          {/* ─── PUT /customer/{id}/complement ─── */}
          {activeTab === "update" && (
            <div className="space-y-3">
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 p-3 bg-gray-50/50">
                  <span className="px-2.5 py-1 rounded border bg-amber-100 text-amber-700 border-amber-200"
                    style={{ fontSize: "0.68rem", fontWeight: 700, fontFamily: "monospace" }}>PUT</span>
                  <code className="text-gray-800" style={{ fontSize: "0.85rem" }}>/customer/{"{id}"}/complement</code>
                </div>
                <div className="p-3 space-y-3">
                  <p className="text-gray-600" style={{ fontSize: "0.78rem" }}>
                    Altera o complemento existente de um cliente. Envie os campos que deseja atualizar.
                  </p>

                  <div className="relative">
                    <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input type="text" value={updateId} onChange={(e) => setUpdateId(e.target.value)}
                      placeholder="ID do cliente *" className={inputClass} style={inputStyle} />
                  </div>

                  <div>
                    <p className="text-gray-500 mb-1.5" style={{ fontSize: "0.7rem", fontWeight: 600 }}>REQUEST BODY (JSON)</p>
                    <textarea value={updateJson} onChange={(e) => setUpdateJson(e.target.value)}
                      rows={12}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 font-mono outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 focus:bg-white transition-all"
                      style={{ fontSize: "0.75rem", lineHeight: 1.5 }} />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-100 rounded"
                      style={{ fontSize: "0.65rem", fontWeight: 600 }}>Proxy: /sige/customer/:id/complement</span>
                  </div>

                  <button onClick={handleUpdate} disabled={updating || !isConnected || !updateId.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                    style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                    {updating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pencil className="w-3.5 h-3.5" />}
                    {updating ? "Alterando..." : "Alterar Complemento"}
                  </button>
                  <ResultBlock result={updateResult} error={updateError}
                    label={`Resposta PUT /customer/${updateId || "{id}"}/complement:`}
                    onCopy={() => handleCopy(updateResult)} />
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                <p className="text-amber-700" style={{ fontSize: "0.72rem" }}>
                  <strong>Dica:</strong> Use a aba "Buscar" para verificar o complemento existente antes de alterar.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}