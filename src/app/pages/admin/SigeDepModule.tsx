import { useState, useCallback } from "react";
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  Play,
  XCircle,
  Search,
  Database,
  Layers,
  MapPin,
  Package,
  CreditCard,
  Truck,
  Tag,
  X,
  Copy,
  Check,
} from "lucide-react";
import { getValidAdminToken } from "./adminAuth";
import * as api from "../../services/api";
import { copyToClipboard } from "../../utils/clipboard";

// ─── Endpoint definitions ───

interface DepParam {
  name: string;
  placeholder: string;
  hint?: string;
}

interface DepEndpoint {
  path: string;
  label: string;
  desc: string;
  params: DepParam[];
  category: string;
}

const CATEGORIES = [
  { key: "localizacao", label: "Localização & Estrutura", icon: MapPin, color: "text-blue-600 bg-blue-100" },
  { key: "produto", label: "Produto - Classificação", icon: Layers, color: "text-purple-600 bg-purple-100" },
  { key: "dados", label: "Produto - Dados & Saldo", icon: Package, color: "text-emerald-600 bg-emerald-100" },
  { key: "financeiro", label: "Financeiro & Operacional", icon: CreditCard, color: "text-amber-600 bg-amber-100" },
  { key: "precos", label: "Lista de Precos", icon: Tag, color: "text-pink-600 bg-pink-100" },
  { key: "rastreio", label: "Rastreio", icon: Truck, color: "text-red-600 bg-red-100" },
];

const ENDPOINTS: DepEndpoint[] = [
  // ── Localização & Estrutura ──
  { path: "area", label: "Área", desc: "Busca cod. da área do produto", category: "localizacao",
    params: [{ name: "codArea", placeholder: "Cod. área (ou múltiplos, vírgula)" }, { name: "nomeArea", placeholder: "Nome da área" }] },
  { path: "area-work", label: "Ramo", desc: "Busca cod. do ramo do produto", category: "localizacao",
    params: [{ name: "codRamo", placeholder: "Cod. ramo" }, { name: "nomeRamo", placeholder: "Nome do ramo" }] },
  { path: "branch", label: "Filial", desc: "Busca filiais da empresa", category: "localizacao",
    params: [{ name: "codFilial", placeholder: "Cod. filial" }, { name: "nomeFilial", placeholder: "Nome filial" }, { name: "apelidoFilial", placeholder: "Apelido filial" }] },
  { path: "country", label: "País", desc: "Busca cod. do país", category: "localizacao",
    params: [{ name: "codPais", placeholder: "Cod. país" }, { name: "nomePais", placeholder: "Nome país" }, { name: "apelidoPais", placeholder: "Apelido país" }] },
  { path: "municipality", label: "Município", desc: "Busca municípios (paginado)", category: "localizacao",
    params: [{ name: "limit", placeholder: "Limite (padrão 50)" }, { name: "offset", placeholder: "Página (padrão 1)" }, { name: "cidade", placeholder: "Cidade" }, { name: "uf", placeholder: "UF (ex: SP)" }] },
  { path: "local-stock", label: "Local Estoque", desc: "Busca locais de estoque", category: "localizacao",
    params: [{ name: "codFilial", placeholder: "Cod. filial" }, { name: "codLocal", placeholder: "Cod. local" }, { name: "descLocal", placeholder: "Descrição local" }] },

  // ── Produto - Classificação ──
  { path: "brand", label: "Marca", desc: "Busca marcas de produto", category: "produto",
    params: [{ name: "codMarca", placeholder: "Cod. marca" }, { name: "descMarca", placeholder: "Descrição marca" }] },
  { path: "division-one", label: "Divisão 1 (Seção)", desc: "Busca seções de produto", category: "produto",
    params: [{ name: "codDivisao", placeholder: "Cod. divisão" }, { name: "descDivisao", placeholder: "Descrição" }] },
  { path: "division-two", label: "Divisão 2 (Grupo)", desc: "Busca grupos de produto", category: "produto",
    params: [{ name: "codDivisao", placeholder: "Cod. divisão" }, { name: "descDivisao", placeholder: "Descrição" }] },
  { path: "division-three", label: "Divisão 3 (SubGrupo)", desc: "Busca subgrupos de produto", category: "produto",
    params: [{ name: "codDivisao", placeholder: "Cod. divisão" }, { name: "descDivisao", placeholder: "Descrição" }] },
  { path: "group", label: "Grupo", desc: "Busca grupos de produto", category: "produto",
    params: [{ name: "codGrupo", placeholder: "Cod. grupo" }, { name: "descricao", placeholder: "Descrição" }] },
  { path: "grate", label: "Grade", desc: "Busca grades de produto", category: "produto",
    params: [{ name: "codGrade", placeholder: "Cod. grade" }, { name: "descricao", placeholder: "Descrição" }, { name: "status", placeholder: "Status (A=Ativo, I=Inativo)" }] },
  { path: "unit", label: "Unidade", desc: "Busca unidades de medida", category: "produto",
    params: [{ name: "codUnidade", placeholder: "Cod. unidade" }, { name: "descUnidade", placeholder: "Descrição" }, { name: "permiteQtdFracionaria", placeholder: "Fracionária (S/N)" }] },
  { path: "risk", label: "Risco", desc: "Busca classificações de risco", category: "produto",
    params: [{ name: "codRisco", placeholder: "Cod. risco" }, { name: "descricao", placeholder: "Descrição" }] },
  { path: "fiscal-classfication", label: "Classificação Fiscal", desc: "Busca NCM/IPI (paginado)", category: "produto",
    params: [{ name: "limit", placeholder: "Limite (padrão 50)" }, { name: "offset", placeholder: "Página (padrão 1)" }, { name: "codCf", placeholder: "Cod. CF" }, { name: "codIpi", placeholder: "Cod. IPI" }, { name: "descIpi", placeholder: "Descrição" }, { name: "tributado", placeholder: "Tributado (S/N)" }] },
  { path: "group-limit", label: "Grupo Limite", desc: "Busca grupos de limite (paginado)", category: "produto",
    params: [{ name: "limit", placeholder: "Limite (padrão 50)" }, { name: "offset", placeholder: "Página (padrão 1)" }, { name: "codGrupoLimite", placeholder: "Cod. grupo limite" }, { name: "codMoeda", placeholder: "Cod. moeda" }, { name: "nome", placeholder: "Nome" }, { name: "bloqueiaGrupo", placeholder: "Bloqueia (S/N)" }] },

  // ── Produto - Dados & Saldo ──
  { path: "list-product", label: "Lista Produtos", desc: "Busca lista de produtos (paginado)", category: "dados",
    params: [{ name: "page", placeholder: "Página (padrão 1)" }, { name: "perPage", placeholder: "Por página (padrão 50)" }, { name: "codProduto", placeholder: "Cod. produto" }, { name: "codRef", placeholder: "Cod. referência" }, { name: "descricao", placeholder: "Descrição" }, { name: "dataAlteracao", placeholder: "Data alteração (YYYY-MM-DD)" }, { name: "enviaEcommerce", placeholder: "Envia ecommerce (S/N)" }] },
  { path: "list-product-overview", label: "Visão Geral Produtos", desc: "Busca visão geral dos produtos (paginado)", category: "dados",
    params: [{ name: "page", placeholder: "Página (padrão 1)" }, { name: "perPage", placeholder: "Por página (padrão 50)" }, { name: "codProduto", placeholder: "Cod. produto" }, { name: "codRef", placeholder: "Cod. referência" }, { name: "descProdutoEst", placeholder: "Descrição" }, { name: "tipoProduto", placeholder: "Tipo (P/K)" }, { name: "statusProduto", placeholder: "Status" }, { name: "codDivisao1", placeholder: "Divisão 1" }, { name: "codDivisao2", placeholder: "Divisão 2" }, { name: "codDivisao3", placeholder: "Divisão 3" }, { name: "codLista", placeholder: "Cod. lista" }, { name: "codLocal", placeholder: "Cod. local" }, { name: "estruturaProduto", placeholder: "Estrutura" }] },
  { path: "reference", label: "Referências", desc: "Busca referências dos produtos (paginado)", category: "dados",
    params: [{ name: "limit", placeholder: "Limite (padrão 50)" }, { name: "offset", placeholder: "Página (padrão 1)" }, { name: "codRef", placeholder: "Cod. referência" }, { name: "ean", placeholder: "EAN" }, { name: "status", placeholder: "Status" }, { name: "codProdFabricante", placeholder: "Cod. fabricante" }, { name: "ncm", placeholder: "NCM" }, { name: "codGrupoComissionado", placeholder: "Grupo comissionado" }, { name: "enviaEcommerce", placeholder: "Ecommerce (S/N)" }] },
  { path: "balance-v2", label: "Saldo Produto V2", desc: "Busca saldos dos produtos. Tipo: P=Produto, K=Kit", category: "dados",
    params: [{ name: "page", placeholder: "Página (padrão 1)" }, { name: "perPage", placeholder: "Por página (padrão 50)" }, { name: "codProduto", placeholder: "Cod. produto" }, { name: "codRef", placeholder: "Cod. referência" }, { name: "codFilial", placeholder: "Cod. filial" }, { name: "codLocal", placeholder: "Cod. local estoque" }, { name: "tipoProduto", placeholder: "Tipo (P/K)" }] },
  { path: "promotion", label: "Promoções", desc: "Busca promoções de produtos (paginado)", category: "dados",
    params: [{ name: "limit", placeholder: "Limite (padrão 50)" }, { name: "offset", placeholder: "Página (padrão 1)" }, { name: "codFilial", placeholder: "Cod. filial" }, { name: "codProduto", placeholder: "Cod. produto" }, { name: "codRef", placeholder: "Cod. referência" }, { name: "dataInicio", placeholder: "Data início (YYYY-MM-DD)" }, { name: "dataFim", placeholder: "Data fim (YYYY-MM-DD)" }, { name: "qtdeMin", placeholder: "Qtde mínima" }, { name: "qtdeMax", placeholder: "Qtde máxima" }, { name: "qtdePromocao", placeholder: "Qtde promoção" }] },

  // ── Financeiro & Operacional ──
  { path: "currency", label: "Moeda", desc: "Busca moedas disponíveis", category: "financeiro",
    params: [{ name: "codMoeda", placeholder: "Cod. moeda" }, { name: "descMoeda", placeholder: "Descrição" }] },
  { path: "payment-condition", label: "Cond. Pagamento", desc: "Busca condições de pagamento", category: "financeiro",
    params: [{ name: "codCondPgto", placeholder: "Cod. condição" }, { name: "descCondPgto", placeholder: "Descrição" }, { name: "qtdeParcela", placeholder: "Qtde parcelas" }, { name: "qtdeDiasEntreParcelas", placeholder: "Dias entre parcelas" }] },
  { path: "situation", label: "Situação", desc: "Busca situações de cadastro (status)", category: "financeiro",
    params: [{ name: "codSituacao", placeholder: "Cod. situação" }, { name: "nomeSituacao", placeholder: "Nome situação" }] },
  { path: "type-document", label: "Tipo Documento", desc: "Busca tipos de documento", category: "financeiro",
    params: [{ name: "codDocto", placeholder: "Cod. documento" }, { name: "classe", placeholder: "Classe (S=Saídas, N=Entradas)" }, { name: "descDocumento", placeholder: "Descrição" }] },
  { path: "type-moviment", label: "Tipo Movimento", desc: "Busca tipos de movimento", category: "financeiro",
    params: [{ name: "codTipoMv", placeholder: "Cod. tipo movimento" }, { name: "codDocto", placeholder: "Cod. documento" }, { name: "descricao", placeholder: "Descrição" }] },
  { path: "type-register", label: "Tipo Cadastro", desc: "Busca tipos de cadastro", category: "financeiro",
    params: [{ name: "tipoCadastro", placeholder: "Tipo cadastro" }, { name: "codSituacao", placeholder: "Cod. situação" }, { name: "descCadastro", placeholder: "Descrição" }] },
  { path: "sequence", label: "Sequência", desc: "Busca sequências de documentos (paginado)", category: "financeiro",
    params: [{ name: "limit", placeholder: "Limite (padrão 50)" }, { name: "offset", placeholder: "Página (padrão 1)" }, { name: "codFilial", placeholder: "Cod. filial" }, { name: "codDocto", placeholder: "Cod. documento" }, { name: "statusSequencia", placeholder: "Status" }] },

  // ── Lista de Preços ──
  { path: "list-price", label: "Lista Preço", desc: "Busca listas de preços", category: "precos",
    params: [{ name: "codLista", placeholder: "Cod. lista (ou múltiplos, vírgula)" }, { name: "descLista", placeholder: "Descrição da lista" }] },
  { path: "list-price-items", label: "Itens Lista Preço", desc: "Busca itens das listas de preços (paginado)", category: "precos",
    params: [{ name: "limit", placeholder: "Limite (padrão 50)" }, { name: "offset", placeholder: "Página (padrão 1)" }, { name: "codLista", placeholder: "Cod. lista" }, { name: "codMoeda", placeholder: "Cod. moeda" }, { name: "codProduto", placeholder: "Cod. produto" }, { name: "codRef", placeholder: "Cod. referência" }] },

  // ── Rastreio ──
  { path: "tracking", label: "Rastreio", desc: "Busca rastreio pelo número do pedido do site", category: "rastreio",
    params: [{ name: "_pathId", placeholder: "ID do pedido *", hint: "Parâmetro de path obrigatório" }] },
];

interface SigeDepModuleProps {
  isConnected: boolean;
}

export function SigeDepModule({ isConnected }: SigeDepModuleProps) {
  const [expanded, setExpanded] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});

  // Test console
  const [selectedEndpoint, setSelectedEndpoint] = useState<DepEndpoint | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testError, setTestError] = useState("");
  const [copied, setCopied] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");

  const getAccessToken = useCallback(async (): Promise<string> => {
    const token = await getValidAdminToken();
    if (!token) throw new Error("Sessão expirada");
    return token;
  }, []);

  const selectEndpoint = (ep: DepEndpoint) => {
    setSelectedEndpoint(ep);
    setParamValues({});
    setTestResult(null);
    setTestError("");
  };

  const handleTest = async () => {
    if (!selectedEndpoint) return;
    setTesting(true); setTestResult(null); setTestError("");
    try {
      const token = await getAccessToken();

      // Handle tracking/{id} which uses path param
      let endpoint = selectedEndpoint.path;
      const queryParams: Record<string, string> = {};

      for (const [key, val] of Object.entries(paramValues)) {
        if (key === "_pathId" && val.trim()) {
          endpoint = `${selectedEndpoint.path}/${encodeURIComponent(val.trim())}`;
        } else if (val.trim()) {
          queryParams[key] = val.trim();
        }
      }

      const result = await api.sigeDep(token, endpoint, queryParams);
      setTestResult(result);
      console.log(`[SIGE] GET /${selectedEndpoint.path} result:`, result);
    } catch (e: any) {
      setTestError(e.message || "Erro ao consultar endpoint.");
      console.log(`[SIGE] GET /${selectedEndpoint?.path} error:`, e.message);
    } finally { setTesting(false); }
  };

  const handleCopy = () => {
    if (testResult) {
      copyToClipboard(JSON.stringify(testResult, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const toggleCat = (key: string) => {
    setExpandedCats(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Count results
  const resultCount = testResult?.data
    ? Array.isArray(testResult.data) ? testResult.data.length
    : typeof testResult.data === "object" && testResult.data.data && Array.isArray(testResult.data.data) ? testResult.data.data.length
    : 1
    : 0;

  // Filter endpoints
  const filteredEndpoints = searchFilter.trim()
    ? ENDPOINTS.filter(ep =>
        ep.label.toLowerCase().includes(searchFilter.toLowerCase()) ||
        ep.path.toLowerCase().includes(searchFilter.toLowerCase()) ||
        ep.desc.toLowerCase().includes(searchFilter.toLowerCase())
      )
    : ENDPOINTS;

  return (
    <div>
      <button onClick={() => setExpanded(!expanded)}
        className="w-full p-5 flex items-center gap-3 hover:bg-gray-50/30 transition-colors cursor-pointer">
        <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center shrink-0">
          <Database className="w-5 h-5 text-orange-600" />
        </div>
        <div className="text-left flex-1">
          <h4 className="text-gray-900" style={{ fontSize: "0.95rem", fontWeight: 700 }}>Dependencias</h4>
          <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>
            Tabelas auxiliares, saldos, referências e rastreio — {ENDPOINTS.length} endpoints
          </p>
        </div>
        <span className="px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 rounded-full shrink-0"
          style={{ fontSize: "0.68rem", fontWeight: 600 }}>Implementado</span>
        {expanded
          ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
          : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4">

          {/* ── Test Console ── */}
          <div className="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-orange-200/60 bg-orange-100/30">
              <h5 className="text-orange-800 flex items-center gap-2" style={{ fontSize: "0.88rem", fontWeight: 700 }}>
                <Play className="w-4 h-4" />
                Console de Teste
              </h5>
              <p className="text-orange-600 mt-0.5" style={{ fontSize: "0.72rem" }}>
                Selecione um endpoint, preencha os parametros opcionais e clique em Executar
              </p>
            </div>

            <div className="p-4 space-y-3">
              {/* Endpoint selector */}
              <div>
                <label className="block text-gray-600 mb-1" style={{ fontSize: "0.75rem", fontWeight: 600 }}>Endpoint</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <select
                    value={selectedEndpoint?.path || ""}
                    onChange={(e) => {
                      const ep = ENDPOINTS.find(x => x.path === e.target.value);
                      if (ep) selectEndpoint(ep);
                    }}
                    className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg bg-white text-gray-800 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all cursor-pointer appearance-none"
                    style={{ fontSize: "0.85rem" }}>
                    <option value="">Selecione um endpoint...</option>
                    {CATEGORIES.map(cat => {
                      const eps = filteredEndpoints.filter(ep => ep.category === cat.key);
                      if (eps.length === 0) return null;
                      return (
                        <optgroup key={cat.key} label={`━ ${cat.label}`}>
                          {eps.map(ep => (
                            <option key={ep.path} value={ep.path}>
                              GET /{ep.path} — {ep.label}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* Selected endpoint info + params */}
              {selectedEndpoint && (
                <>
                  <div className="flex items-center gap-2 p-2.5 bg-white rounded-lg border border-gray-100">
                    <span className="px-2.5 py-1 rounded border bg-emerald-100 text-emerald-700 border-emerald-200"
                      style={{ fontSize: "0.68rem", fontWeight: 700, fontFamily: "monospace" }}>GET</span>
                    <code className="text-gray-800" style={{ fontSize: "0.85rem" }}>/{selectedEndpoint.path}{selectedEndpoint.params.some(p => p.name === "_pathId") ? "/{id}" : ""}</code>
                    <span className="text-gray-400 ml-auto hidden sm:inline" style={{ fontSize: "0.72rem" }}>
                      {selectedEndpoint.desc}
                    </span>
                  </div>

                  {/* Dynamic params */}
                  {selectedEndpoint.params.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-gray-500" style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Parametros {selectedEndpoint.params.some(p => p.name === "_pathId") ? "" : "(todos opcionais)"}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {selectedEndpoint.params.map(param => (
                          <div key={param.name} className="relative">
                            <input
                              type="text"
                              value={paramValues[param.name] || ""}
                              onChange={(e) => setParamValues(prev => ({ ...prev, [param.name]: e.target.value }))}
                              placeholder={param.placeholder}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-gray-800 placeholder-gray-400 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all"
                              style={{ fontSize: "0.82rem" }}
                            />
                            {param.hint && (
                              <p className="text-amber-600 mt-0.5 ml-1" style={{ fontSize: "0.65rem" }}>{param.hint}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Execute button */}
                  <div className="flex items-center gap-3">
                    <button onClick={handleTest}
                      disabled={testing || !isConnected}
                      className="flex items-center gap-2 px-5 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                      style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                      {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                      {testing ? "Consultando..." : "Executar"}
                    </button>
                    {!isConnected && (
                      <p className="text-amber-600" style={{ fontSize: "0.72rem" }}>
                        Conecte-se ao SIGE primeiro.
                      </p>
                    )}
                    {testResult && (
                      <div className="flex items-center gap-2 ml-auto">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${testResult.ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                          HTTP {testResult.sigeStatus}
                        </span>
                        <span className="text-gray-400" style={{ fontSize: "0.72rem" }}>
                          {resultCount} registro(s)
                        </span>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Error */}
              {testError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-lg">
                  <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-red-700" style={{ fontSize: "0.78rem" }}>{testError}</p>
                </div>
              )}

              {/* Result */}
              {testResult && (
                <div className="bg-gray-900 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-800">
                    <p className="text-green-400" style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                      Resposta SIGE — GET {testResult.endpoint}
                    </p>
                    <button onClick={handleCopy}
                      className="flex items-center gap-1 px-2 py-1 text-gray-400 hover:text-white rounded transition-colors cursor-pointer"
                      style={{ fontSize: "0.68rem" }}>
                      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                      {copied ? "Copiado!" : "Copiar"}
                    </button>
                  </div>
                  <div className="p-3 overflow-x-auto max-h-[400px] overflow-y-auto">
                    <pre className="text-gray-300" style={{ fontSize: "0.75rem", lineHeight: 1.5 }}>
                      <code>{JSON.stringify(testResult.data, null, 2)}</code>
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Endpoint documentation by category ── */}
          <div className="space-y-2">
            <div className="flex items-center gap-3 mb-2">
              <p className="text-gray-500" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                Documentação dos endpoints ({ENDPOINTS.length} total)
              </p>
              <div className="relative flex-1 max-w-[220px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                <input type="text" value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Filtrar..."
                  className="w-full pl-7 pr-7 py-1.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 placeholder-gray-400 outline-none focus:border-gray-300 transition-all"
                  style={{ fontSize: "0.75rem" }} />
                {searchFilter && (
                  <button onClick={() => setSearchFilter("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {CATEGORIES.map(cat => {
              const eps = filteredEndpoints.filter(ep => ep.category === cat.key);
              if (eps.length === 0) return null;
              const Icon = cat.icon;
              const isOpen = expandedCats[cat.key] || false;
              return (
                <div key={cat.key} className="border border-gray-100 rounded-lg overflow-hidden">
                  <button onClick={() => toggleCat(cat.key)}
                    className="w-full flex items-center gap-2.5 p-3 bg-gray-50/50 hover:bg-gray-50 transition-colors cursor-pointer">
                    <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${cat.color}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-gray-800 text-left flex-1" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                      {cat.label}
                    </span>
                    <span className="text-gray-400" style={{ fontSize: "0.68rem" }}>
                      {eps.length} endpoint{eps.length > 1 ? "s" : ""}
                    </span>
                    {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                  </button>

                  {isOpen && (
                    <div className="divide-y divide-gray-50">
                      {eps.map(ep => (
                        <div key={ep.path} className="px-3 py-2.5 flex items-center gap-3 hover:bg-gray-50/30">
                          <span className="px-2 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200 shrink-0"
                            style={{ fontSize: "0.62rem", fontWeight: 700, fontFamily: "monospace" }}>GET</span>
                          <code className="text-gray-700 shrink-0" style={{ fontSize: "0.78rem" }}>/{ep.path}</code>
                          <span className="text-gray-400 truncate hidden sm:inline" style={{ fontSize: "0.72rem" }}>
                            — {ep.desc}
                          </span>
                          <span className="text-gray-300 ml-auto shrink-0" style={{ fontSize: "0.65rem" }}>
                            {ep.params.length} param{ep.params.length !== 1 ? "s" : ""}
                          </span>
                          <button onClick={() => selectEndpoint(ep)}
                            className="px-2 py-1 text-orange-600 hover:bg-orange-50 rounded transition-colors cursor-pointer shrink-0"
                            style={{ fontSize: "0.68rem", fontWeight: 600 }}>
                            Testar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Proxy info */}
          <div className="p-3 bg-orange-50 rounded-lg border border-orange-100">
            <p className="text-orange-700" style={{ fontSize: "0.75rem" }}>
              <strong>Proxy generico:</strong> Todos os {ENDPOINTS.length} endpoints passam por <code className="bg-orange-100 px-1 rounded">/sige/dep/&#123;endpoint&#125;</code>.
              Os parametros de query sao encaminhados automaticamente ao SIGE. A whitelist no backend restringe aos endpoints permitidos.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}