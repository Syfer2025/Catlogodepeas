import { useState, useCallback } from "react";
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  Play,
  XCircle,
  Search,
  FolderTree,
  Plus,
  Pencil,
  Trash2,
  Hash,
  Tag,
  ArrowUpDown,
  CheckCircle2,
  Copy,
  Check,
  X,
} from "lucide-react";
import { supabase } from "../../services/supabaseClient";
import * as api from "../../services/api";
import { copyToClipboard } from "../../utils/clipboard";

interface SigeCategoryModuleProps {
  isConnected: boolean;
}

type ActiveTab = "search" | "create" | "update" | "delete";

export function SigeCategoryModule({ isConnected }: SigeCategoryModuleProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("search");

  // ─── Search state ───
  const [searchCod, setSearchCod] = useState("");
  const [searchNome, setSearchNome] = useState("");
  const [searchClasse, setSearchClasse] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<any>(null);
  const [searchError, setSearchError] = useState("");

  // ─── Create state ───
  const [createCod, setCreateCod] = useState("");
  const [createNome, setCreateNome] = useState("");
  const [createClasse, setCreateClasse] = useState("");
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<any>(null);
  const [createError, setCreateError] = useState("");

  // ─── Update state ───
  const [updateId, setUpdateId] = useState("");
  const [updateNome, setUpdateNome] = useState("");
  const [updateClasse, setUpdateClasse] = useState("");
  const [updating, setUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState<any>(null);
  const [updateError, setUpdateError] = useState("");

  // ─── Delete state ───
  const [deleteId, setDeleteId] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<any>(null);
  const [deleteError, setDeleteError] = useState("");

  // ─── Clipboard ───
  const [copied, setCopied] = useState(false);

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
      if (searchCod.trim()) params.codCategoria = searchCod.trim();
      if (searchNome.trim()) params.nomeCategoria = searchNome.trim();
      if (searchClasse.trim()) params.classe = searchClasse.trim();
      const result = await api.sigeCategoryGet(token, params);
      setSearchResult(result);
      console.log("[SIGE] GET /category result:", result);
    } catch (e: any) {
      setSearchError(e.message || "Erro ao buscar categorias.");
      console.log("[SIGE] GET /category error:", e.message);
    } finally { setSearching(false); }
  };

  const handleCreate = async () => {
    if (!createCod.trim() || !createNome.trim() || !createClasse) {
      setCreateError("Preencha todos os campos."); return;
    }
    setCreating(true); setCreateResult(null); setCreateError("");
    try {
      const token = await getAccessToken();
      const result = await api.sigeCategoryCreate(token, {
        codCategoria: createCod.trim(),
        nomeCategoria: createNome.trim(),
        classe: createClasse,
      });
      setCreateResult(result);
      console.log("[SIGE] POST /category result:", result);
    } catch (e: any) {
      setCreateError(e.message || "Erro ao criar categoria.");
      console.log("[SIGE] POST /category error:", e.message);
    } finally { setCreating(false); }
  };

  const handleUpdate = async () => {
    if (!updateId.trim() || !updateNome.trim() || !updateClasse) {
      setUpdateError("Preencha todos os campos."); return;
    }
    setUpdating(true); setUpdateResult(null); setUpdateError("");
    try {
      const token = await getAccessToken();
      const result = await api.sigeCategoryUpdate(token, updateId.trim(), {
        nomeCategoria: updateNome.trim(),
        classe: updateClasse,
      });
      setUpdateResult(result);
      console.log("[SIGE] PUT /category result:", result);
    } catch (e: any) {
      setUpdateError(e.message || "Erro ao alterar categoria.");
      console.log("[SIGE] PUT /category error:", e.message);
    } finally { setUpdating(false); }
  };

  const handleDelete = async () => {
    if (!deleteId.trim()) { setDeleteError("Informe o ID."); return; }
    setDeleting(true); setDeleteResult(null); setDeleteError("");
    try {
      const token = await getAccessToken();
      const result = await api.sigeCategoryDelete(token, deleteId.trim());
      setDeleteResult(result);
      console.log("[SIGE] DELETE /category result:", result);
    } catch (e: any) {
      setDeleteError(e.message || "Erro ao deletar categoria.");
      console.log("[SIGE] DELETE /category error:", e.message);
    } finally { setDeleting(false); }
  };

  const handleCopy = (data: any) => {
    copyToClipboard(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const inputClass = "w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 placeholder-gray-400 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 focus:bg-white transition-all";
  const inputStyle = { fontSize: "0.82rem" } as const;

  const tabs: { key: ActiveTab; label: string; icon: typeof Search; method: string; methodColor: string }[] = [
    { key: "search", label: "Buscar", icon: Search, method: "GET", methodColor: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    { key: "create", label: "Cadastrar", icon: Plus, method: "POST", methodColor: "bg-blue-100 text-blue-700 border-blue-200" },
    { key: "update", label: "Alterar", icon: Pencil, method: "PUT", methodColor: "bg-amber-100 text-amber-700 border-amber-200" },
    { key: "delete", label: "Deletar", icon: Trash2, method: "DELETE", methodColor: "bg-red-100 text-red-700 border-red-200" },
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
          <div className="px-3 pb-3 overflow-x-auto">
            <pre className="text-gray-300" style={{ fontSize: "0.75rem", lineHeight: 1.5 }}>
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
        <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center shrink-0">
          <FolderTree className="w-5 h-5 text-amber-600" />
        </div>
        <div className="text-left flex-1">
          <h4 className="text-gray-900" style={{ fontSize: "0.95rem", fontWeight: 700 }}>Categorias</h4>
          <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>CRUD de categorias — 4 endpoints</p>
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

          {/* ─── GET /category ─── */}
          {activeTab === "search" && (
            <div className="space-y-3">
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 p-3 bg-gray-50/50">
                  <span className="px-2.5 py-1 rounded border bg-emerald-100 text-emerald-700 border-emerald-200"
                    style={{ fontSize: "0.68rem", fontWeight: 700, fontFamily: "monospace" }}>GET</span>
                  <code className="text-gray-800" style={{ fontSize: "0.85rem" }}>/category</code>
                </div>
                <div className="p-3 space-y-3">
                  <p className="text-gray-600" style={{ fontSize: "0.78rem" }}>
                    Busca categorias da aplicacao. Todos os filtros sao opcionais.
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-100 rounded"
                      style={{ fontSize: "0.65rem", fontWeight: 600 }}>Proxy: /sige/category</span>
                  </div>
                  <div className="pt-2 border-t border-gray-100 space-y-3">
                    <p className="text-gray-500 flex items-center gap-1.5" style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      <Play className="w-3 h-3" /> Testar endpoint
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="relative">
                        <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input type="text" value={searchCod} onChange={(e) => setSearchCod(e.target.value)}
                          placeholder="codCategoria (ex: 01,02)" className={inputClass} style={inputStyle} />
                      </div>
                      <div className="relative">
                        <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input type="text" value={searchNome} onChange={(e) => setSearchNome(e.target.value)}
                          placeholder="nomeCategoria" className={inputClass} style={inputStyle} />
                      </div>
                      <div className="relative">
                        <ArrowUpDown className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <select value={searchClasse} onChange={(e) => setSearchClasse(e.target.value)}
                          className={`${inputClass} appearance-none`} style={inputStyle}>
                          <option value="">classe (todas)</option>
                          <option value="S">S - Saidas</option>
                          <option value="E">E - Entradas</option>
                        </select>
                      </div>
                    </div>
                    <button onClick={handleSearch} disabled={searching || !isConnected}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                      style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                      {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                      {searching ? "Buscando..." : "Buscar Categorias"}
                    </button>
                    <ResultBlock result={searchResult} error={searchError} label="Resposta GET /category:" onCopy={() => handleCopy(searchResult)} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── POST /category ─── */}
          {activeTab === "create" && (
            <div className="space-y-3">
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 p-3 bg-gray-50/50">
                  <span className="px-2.5 py-1 rounded border bg-blue-100 text-blue-700 border-blue-200"
                    style={{ fontSize: "0.68rem", fontWeight: 700, fontFamily: "monospace" }}>POST</span>
                  <code className="text-gray-800" style={{ fontSize: "0.85rem" }}>/category</code>
                </div>
                <div className="p-3 space-y-3">
                  <p className="text-gray-600" style={{ fontSize: "0.78rem" }}>
                    Cadastra uma nova categoria na aplicacao SIGE.
                  </p>
                  <div className="bg-gray-900 rounded-lg p-3 overflow-x-auto">
                    <pre className="text-gray-300" style={{ fontSize: "0.75rem", lineHeight: 1.5 }}>
                      <code>{`// Request Body\n{\n  "codCategoria": "00",\n  "nomeCategoria": "Nome da Categoria",\n  "classe": "S | E"\n}\n\n// Responses: 200, 400, 401, 404, 500`}</code>
                    </pre>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-100 rounded"
                      style={{ fontSize: "0.65rem", fontWeight: 600 }}>Proxy: /sige/category</span>
                  </div>
                  <div className="pt-2 border-t border-gray-100 space-y-3">
                    <p className="text-gray-500 flex items-center gap-1.5" style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      <Play className="w-3 h-3" /> Testar endpoint
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="relative">
                        <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input type="text" value={createCod} onChange={(e) => setCreateCod(e.target.value)}
                          placeholder="codCategoria (ex: 01)" className={inputClass} style={inputStyle} />
                      </div>
                      <div className="relative">
                        <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input type="text" value={createNome} onChange={(e) => setCreateNome(e.target.value)}
                          placeholder="nomeCategoria" className={inputClass} style={inputStyle} />
                      </div>
                      <div className="relative">
                        <ArrowUpDown className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <select value={createClasse} onChange={(e) => setCreateClasse(e.target.value)}
                          className={`${inputClass} appearance-none`} style={inputStyle}>
                          <option value="">Selecione a classe...</option>
                          <option value="S">S - Saidas</option>
                          <option value="E">E - Entradas</option>
                        </select>
                      </div>
                    </div>
                    <button onClick={handleCreate}
                      disabled={creating || !isConnected || !createCod.trim() || !createNome.trim() || !createClasse}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                      style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                      {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                      {creating ? "Criando..." : "Cadastrar Categoria"}
                    </button>
                    <ResultBlock result={createResult} error={createError} label="Resposta POST /category:" onCopy={() => handleCopy(createResult)} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── PUT /category/{id} ─── */}
          {activeTab === "update" && (
            <div className="space-y-3">
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 p-3 bg-gray-50/50">
                  <span className="px-2.5 py-1 rounded border bg-amber-100 text-amber-700 border-amber-200"
                    style={{ fontSize: "0.68rem", fontWeight: 700, fontFamily: "monospace" }}>PUT</span>
                  <code className="text-gray-800" style={{ fontSize: "0.85rem" }}>/category/{"{id}"}</code>
                </div>
                <div className="p-3 space-y-3">
                  <p className="text-gray-600" style={{ fontSize: "0.78rem" }}>
                    Altera uma categoria existente pelo seu ID.
                  </p>
                  <div className="bg-gray-900 rounded-lg p-3 overflow-x-auto">
                    <pre className="text-gray-300" style={{ fontSize: "0.75rem", lineHeight: 1.5 }}>
                      <code>{`// Path: /category/{id}\n\n// Request Body\n{\n  "nomeCategoria": "Novo nome",\n  "classe": "S | E"\n}\n\n// Responses: 200, 400, 401, 404, 500`}</code>
                    </pre>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-100 rounded"
                      style={{ fontSize: "0.65rem", fontWeight: 600 }}>Proxy: /sige/category/:id</span>
                  </div>
                  <div className="pt-2 border-t border-gray-100 space-y-3">
                    <p className="text-gray-500 flex items-center gap-1.5" style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      <Play className="w-3 h-3" /> Testar endpoint
                    </p>
                    <div className="relative">
                      <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input type="text" value={updateId} onChange={(e) => setUpdateId(e.target.value)}
                        placeholder="ID da categoria" className={inputClass} style={inputStyle} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="relative">
                        <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input type="text" value={updateNome} onChange={(e) => setUpdateNome(e.target.value)}
                          placeholder="nomeCategoria" className={inputClass} style={inputStyle} />
                      </div>
                      <div className="relative">
                        <ArrowUpDown className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <select value={updateClasse} onChange={(e) => setUpdateClasse(e.target.value)}
                          className={`${inputClass} appearance-none`} style={inputStyle}>
                          <option value="">Selecione a classe...</option>
                          <option value="S">S - Saidas</option>
                          <option value="E">E - Entradas</option>
                        </select>
                      </div>
                    </div>
                    <button onClick={handleUpdate}
                      disabled={updating || !isConnected || !updateId.trim() || !updateNome.trim() || !updateClasse}
                      className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                      style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                      {updating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pencil className="w-3.5 h-3.5" />}
                      {updating ? "Alterando..." : "Alterar Categoria"}
                    </button>
                    <ResultBlock result={updateResult} error={updateError} label="Resposta PUT /category/{id}:" onCopy={() => handleCopy(updateResult)} />
                  </div>
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                <p className="text-amber-700" style={{ fontSize: "0.75rem" }}>
                  <strong>Dica:</strong> Use a aba "Buscar" para encontrar o ID da categoria que deseja alterar.
                </p>
              </div>
            </div>
          )}

          {/* ─── DELETE /category/{id} ─── */}
          {activeTab === "delete" && (
            <div className="space-y-3">
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 p-3 bg-gray-50/50">
                  <span className="px-2.5 py-1 rounded border bg-red-100 text-red-700 border-red-200"
                    style={{ fontSize: "0.68rem", fontWeight: 700, fontFamily: "monospace" }}>DELETE</span>
                  <code className="text-gray-800" style={{ fontSize: "0.85rem" }}>/category/{"{id}"}</code>
                </div>
                <div className="p-3 space-y-3">
                  <p className="text-gray-600" style={{ fontSize: "0.78rem" }}>
                    Deleta uma categoria pelo ID. <strong className="text-red-600">Acao irreversivel.</strong>
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-100 rounded"
                      style={{ fontSize: "0.65rem", fontWeight: 600 }}>Proxy: /sige/category/:id</span>
                  </div>
                  <div className="pt-2 border-t border-gray-100 space-y-3">
                    <p className="text-gray-500 flex items-center gap-1.5" style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      <Play className="w-3 h-3" /> Testar endpoint
                    </p>
                    <div className="relative">
                      <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input type="text" value={deleteId} onChange={(e) => setDeleteId(e.target.value)}
                        placeholder="ID da categoria para deletar" className={inputClass} style={inputStyle} />
                    </div>
                    <button onClick={handleDelete}
                      disabled={deleting || !isConnected || !deleteId.trim()}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                      style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                      {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      {deleting ? "Deletando..." : "Deletar Categoria"}
                    </button>
                    <ResultBlock result={deleteResult} error={deleteError} label="Resposta DELETE /category/{id}:" onCopy={() => handleCopy(deleteResult)} />
                  </div>
                </div>
              </div>

              <div className="p-3 bg-red-50 rounded-lg border border-red-100">
                <p className="text-red-700" style={{ fontSize: "0.75rem" }}>
                  <strong>Atencao:</strong> A delecao de categorias e permanente e pode afetar registros associados no SIGE.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}