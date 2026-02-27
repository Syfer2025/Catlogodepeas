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
  BarChart3,
  Building2,
  MapPin,
  Tag,
  Boxes,
} from "lucide-react";
import { getValidAdminToken } from "./adminAuth";
import * as api from "../../services/api";
import { copyToClipboard } from "../../utils/clipboard";

interface Props {
  isConnected: boolean;
}

export function SigeProductBalanceModule({ isConnected }: Props) {
  const [expanded, setExpanded] = useState(false);

  const [productId, setProductId] = useState("");
  const [codFilial, setCodFilial] = useState("");
  const [codLocal, setCodLocal] = useState("");
  const [codRef, setCodRef] = useState("");
  const [numLote, setNumLote] = useState("");

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
      if (codLocal.trim()) params.codLocal = codLocal.trim();
      if (codRef.trim()) params.codRef = codRef.trim();
      if (numLote.trim()) params.numLote = numLote.trim();
      const res = await api.sigeProductBalanceGet(token, productId.trim(), params);
      setResult(res);
    } catch (e: any) {
      setError(e.message || "Erro ao buscar saldo.");
    } finally { setSearching(false); }
  };

  const handleCopy = () => {
    copyToClipboard(JSON.stringify(result, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const inputClass = "w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 placeholder-gray-400 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 focus:bg-white transition-all";
  const inputStyle = { fontSize: "0.8rem" } as const;

  return (
    <div>
      <button onClick={() => setExpanded(!expanded)}
        className="w-full p-5 flex items-center gap-3 hover:bg-gray-50/30 transition-colors cursor-pointer">
        <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center shrink-0">
          <BarChart3 className="w-5 h-5 text-teal-600" />
        </div>
        <div className="text-left flex-1">
          <h4 className="text-gray-900" style={{ fontSize: "0.95rem", fontWeight: 700 }}>Produto Saldo</h4>
          <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>Buscar saldos por filial, local, referência e lote — 1 endpoint</p>
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
            className="flex items-center gap-1.5 text-teal-600 hover:text-teal-700 cursor-pointer"
            style={{ fontSize: "0.72rem", fontWeight: 600 }}>
            <Info className="w-3.5 h-3.5" />
            {showHelp ? "Ocultar" : "Ver"} referência de filtros
            {showHelp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showHelp && (
            <div className="bg-gray-900 rounded-lg p-3">
              <pre className="text-gray-300" style={{ fontSize: "0.72rem", lineHeight: 1.6 }}>
                <code>{`GET /product/{id}/balance

// Filtros (todos opcionais, múltiplos separados por vírgula):
//   codFilial  -> código da filial (ex: "1" ou "1,2,3")
//   codLocal   -> local de estoque (ex: "01" ou "01,02")
//   codRef     -> código de referência (ex: "A1" ou "A1,B2")
//   numLote    -> número do lote (ex: "L001" ou "L001,L002")

// Resposta: saldos do produto com detalhamento
// por filial, local de estoque e referencias.`}</code>
              </pre>
            </div>
          )}

          <div className="border border-gray-100 rounded-lg overflow-hidden">
            <div className="flex items-center gap-3 p-3 bg-gray-50/50">
              <span className="px-2.5 py-1 rounded border bg-emerald-100 text-emerald-700 border-emerald-200"
                style={{ fontSize: "0.68rem", fontWeight: 700, fontFamily: "monospace" }}>GET</span>
              <code className="text-gray-800" style={{ fontSize: "0.85rem" }}>/product/{"{id}"}/balance</code>
            </div>
            <div className="p-3 space-y-3">
              <p className="text-gray-600" style={{ fontSize: "0.78rem" }}>
                Busca saldos de um produto, com filtros opcionais por filial, local, referência e lote.
              </p>

              <div className="relative">
                <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input type="text" value={productId} onChange={(e) => setProductId(e.target.value)}
                  placeholder="ID do produto *" className={inputClass} style={inputStyle} />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="relative">
                  <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input type="text" value={codFilial} onChange={(e) => setCodFilial(e.target.value)}
                    placeholder="codFilial" className={inputClass} style={inputStyle} />
                </div>
                <div className="relative">
                  <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input type="text" value={codLocal} onChange={(e) => setCodLocal(e.target.value)}
                    placeholder="codLocal" className={inputClass} style={inputStyle} />
                </div>
                <div className="relative">
                  <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input type="text" value={codRef} onChange={(e) => setCodRef(e.target.value)}
                    placeholder="codRef" className={inputClass} style={inputStyle} />
                </div>
                <div className="relative">
                  <Boxes className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input type="text" value={numLote} onChange={(e) => setNumLote(e.target.value)}
                    placeholder="numLote" className={inputClass} style={inputStyle} />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-100 rounded"
                  style={{ fontSize: "0.65rem", fontWeight: 600 }}>Proxy: /sige/product/:id/balance</span>
              </div>

              <button onClick={handleSearch} disabled={searching || !isConnected || !productId.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                {searching ? "Buscando..." : "Buscar Saldo"}
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
                      Resposta GET /product/{productId}/balance:
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
        </div>
      )}
    </div>
  );
}