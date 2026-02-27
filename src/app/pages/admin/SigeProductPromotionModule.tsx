import { useState, useCallback } from "react";
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  XCircle,
  Search,
  Hash,
  Copy,
  Check,
  Info,
  ChevronUp,
  Percent,
  Building2,
  Tag,
  CalendarDays,
  ArrowDown01,
  ArrowUp01,
} from "lucide-react";
import { getValidAdminToken } from "./adminAuth";
import * as api from "../../services/api";
import { copyToClipboard } from "../../utils/clipboard";

interface Props {
  isConnected: boolean;
}

export function SigeProductPromotionModule({ isConnected }: Props) {
  const [expanded, setExpanded] = useState(false);

  const [productId, setProductId] = useState("");
  const [codFilial, setCodFilial] = useState("");
  const [codRef, setCodRef] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [qtdeMin, setQtdeMin] = useState("");
  const [qtdeMax, setQtdeMax] = useState("");
  const [qtdePromocao, setQtdePromocao] = useState("");

  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const getAccessToken = useCallback(async (): Promise<string> => {
    const token = await getValidAdminToken();
    if (!token) throw new Error("Sessão expirada");
    return token;
  }, []);

  const handleSearch = async () => {
    if (!productId.trim()) { setError("Informe o ID do produto."); return; }
    setSearching(true); setResult(null); setError("");
    try {
      const token = await getAccessToken();
      const params: Record<string, string> = {};
      if (codFilial.trim()) params.codFilial = codFilial.trim();
      if (codRef.trim()) params.codRef = codRef.trim();
      if (dataInicio.trim()) params.dataInicio = dataInicio.trim();
      if (dataFim.trim()) params.dataFim = dataFim.trim();
      if (qtdeMin.trim()) params.qtdeMin = qtdeMin.trim();
      if (qtdeMax.trim()) params.qtdeMax = qtdeMax.trim();
      if (qtdePromocao.trim()) params.qtdePromocao = qtdePromocao.trim();
      const res = await api.sigeProductPromotionGet(token, productId.trim(), params);
      setResult(res);
    } catch (e: any) {
      setError(e.message || "Erro ao buscar promoções.");
    } finally { setSearching(false); }
  };

  const handleCopy = () => {
    copyToClipboard(JSON.stringify(result, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const inputClass = "w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 placeholder-gray-400 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 focus:bg-white transition-all";
  const inputStyle = { fontSize: "0.8rem" } as const;

  return (
    <div>
      <button onClick={() => setExpanded(!expanded)}
        className="w-full p-5 flex items-center gap-3 hover:bg-gray-50/30 transition-colors cursor-pointer">
        <div className="w-10 h-10 bg-rose-100 rounded-lg flex items-center justify-center shrink-0">
          <Percent className="w-5 h-5 text-rose-600" />
        </div>
        <div className="text-left flex-1">
          <h4 className="text-gray-900" style={{ fontSize: "0.95rem", fontWeight: 700 }}>Produto Promoção</h4>
          <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>Buscar promoções por filial, referência, datas e quantidades — 1 endpoint</p>
        </div>
        <span className="px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 rounded-full shrink-0"
          style={{ fontSize: "0.68rem", fontWeight: 600 }}>Implementado</span>
        {expanded
          ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
          : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4">

          {!isConnected && (
            <p className="text-amber-600 flex items-center gap-1.5" style={{ fontSize: "0.75rem" }}>
              <XCircle className="w-3.5 h-3.5" />
              Conecte-se ao SIGE primeiro.
            </p>
          )}

          <button onClick={() => setShowHelp(!showHelp)}
            className="flex items-center gap-1.5 text-rose-600 hover:text-rose-700 cursor-pointer"
            style={{ fontSize: "0.72rem", fontWeight: 600 }}>
            <Info className="w-3.5 h-3.5" />
            {showHelp ? "Ocultar" : "Ver"} referência de filtros
            {showHelp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showHelp && (
            <div className="bg-gray-900 rounded-lg p-3">
              <pre className="text-gray-300" style={{ fontSize: "0.72rem", lineHeight: 1.6 }}>
                <code>{`GET /product/{id}/promotion

// Retorna as promoções ativas de um produto.

// Filtros opcionais (múltiplos separados por vírgula onde indicado):
//   codFilial     -> código da filial (vírgula p/ múltiplos)
//   codRef        -> código de referência (vírgula p/ múltiplos)
//   dataInicio    -> data de início (formato: YYYY-MM-DD)
//   dataFim       -> data final (formato: YYYY-MM-DD)
//   qtdeMin       -> quantidade mínima (inteiro)
//   qtdeMax       -> quantidade máxima (inteiro)
//   qtdePromocao  -> quantidade em promoção (inteiro)`}</code>
              </pre>
            </div>
          )}

          <div className="border border-gray-100 rounded-lg overflow-hidden">
            <div className="flex items-center gap-3 p-3 bg-gray-50/50">
              <span className="px-2.5 py-1 rounded border bg-emerald-100 text-emerald-700 border-emerald-200"
                style={{ fontSize: "0.68rem", fontWeight: 700, fontFamily: "monospace" }}>GET</span>
              <code className="text-gray-800" style={{ fontSize: "0.85rem" }}>/product/{"{id}"}/promotion</code>
            </div>
            <div className="p-3 space-y-3">
              <p className="text-gray-600" style={{ fontSize: "0.78rem" }}>
                Busca promoções de um produto, com filtros por filial, referência, período e quantidades.
              </p>

              <div className="relative">
                <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input type="text" value={productId} onChange={(e) => setProductId(e.target.value)}
                  placeholder="ID do produto *" className={inputClass} style={inputStyle} />
              </div>

              {/* Row 1: codFilial + codRef */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="relative">
                  <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input type="text" value={codFilial} onChange={(e) => setCodFilial(e.target.value)}
                    placeholder="codFilial" className={inputClass} style={inputStyle} />
                </div>
                <div className="relative">
                  <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input type="text" value={codRef} onChange={(e) => setCodRef(e.target.value)}
                    placeholder="codRef" className={inputClass} style={inputStyle} />
                </div>
              </div>

              {/* Row 2: datas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="relative">
                  <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input type="text" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)}
                    placeholder="dataInicio (YYYY-MM-DD)" className={inputClass} style={inputStyle} />
                </div>
                <div className="relative">
                  <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input type="text" value={dataFim} onChange={(e) => setDataFim(e.target.value)}
                    placeholder="dataFim (YYYY-MM-DD)" className={inputClass} style={inputStyle} />
                </div>
              </div>

              {/* Row 3: quantities */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="relative">
                  <ArrowDown01 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input type="number" value={qtdeMin} onChange={(e) => setQtdeMin(e.target.value)}
                    placeholder="qtdeMin" className={inputClass} style={inputStyle} />
                </div>
                <div className="relative">
                  <ArrowUp01 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input type="number" value={qtdeMax} onChange={(e) => setQtdeMax(e.target.value)}
                    placeholder="qtdeMax" className={inputClass} style={inputStyle} />
                </div>
                <div className="relative">
                  <Percent className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input type="number" value={qtdePromocao} onChange={(e) => setQtdePromocao(e.target.value)}
                    placeholder="qtdePromocao" className={inputClass} style={inputStyle} />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-100 rounded"
                  style={{ fontSize: "0.65rem", fontWeight: 600 }}>Proxy: /sige/product/:id/promotion</span>
              </div>

              <button onClick={handleSearch} disabled={searching || !isConnected || !productId.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                {searching ? "Buscando..." : "Buscar Promoções"}
              </button>

              {error && (
                <div className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-100 rounded-lg">
                  <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-red-700" style={{ fontSize: "0.75rem" }}>{error}</p>
                </div>
              )}

              {result && (
                <div className="bg-gray-900 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
                    <p className="text-green-400" style={{ fontSize: "0.68rem", fontWeight: 600 }}>
                      Resposta GET /product/{productId}/promotion:
                    </p>
                    <button onClick={handleCopy}
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
            </div>
          </div>

          <div className="p-3 bg-rose-50 rounded-lg border border-rose-100">
            <p className="text-rose-700" style={{ fontSize: "0.72rem" }}>
              <strong>Dica:</strong> Use os campos de data no formato <code className="bg-rose-100 px-1 rounded">YYYY-MM-DD</code> para
              filtrar promoções por período. Os filtros de quantidade aceitam valores inteiros.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}