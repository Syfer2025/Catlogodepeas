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
  CreditCard,
} from "lucide-react";
import { supabase } from "../../services/supabaseClient";
import * as api from "../../services/api";

interface Props {
  isConnected: boolean;
}

export function SigeOrderInstallmentModule({ isConnected }: Props) {
  const [expanded, setExpanded] = useState(false);

  const [sId, setSId] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<any>(null);
  const [searchError, setSearchError] = useState("");
  const [copied, setCopied] = useState(false);

  const getAccessToken = useCallback(async (): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Sessao expirada");
    return session.access_token;
  }, []);

  const handleSearch = async () => {
    if (!sId.trim()) { setSearchError("Informe o ID do pedido."); return; }
    setSearching(true); setSearchResult(null); setSearchError("");
    try {
      const token = await getAccessToken();
      const res = await api.sigeOrderInstallmentGet(token, sId.trim());
      setSearchResult(res);
    } catch (e: any) {
      setSearchError(e.message || "Erro ao buscar parcelamento.");
    } finally { setSearching(false); }
  };

  const handleCopy = (data: any) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const inputClass = "w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 placeholder-gray-400 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 focus:bg-white transition-all";
  const inputStyle = { fontSize: "0.8rem" } as const;

  return (
    <div>
      <button onClick={() => setExpanded(!expanded)}
        className="w-full p-5 flex items-center gap-3 hover:bg-gray-50/30 transition-colors cursor-pointer">
        <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center shrink-0">
          <CreditCard className="w-5 h-5 text-violet-600" />
        </div>
        <div className="text-left flex-1">
          <h4 className="text-gray-900" style={{ fontSize: "0.95rem", fontWeight: 700 }}>Pedidos Parcelamento</h4>
          <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>Buscar parcelas do pedido — 1 endpoint</p>
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
              <XCircle className="w-3.5 h-3.5" /> Conecte-se ao SIGE primeiro.
            </p>
          )}

          <div className="border border-gray-100 rounded-lg overflow-hidden">
            <div className="flex items-center gap-3 p-3 bg-gray-50/50">
              <span className="px-2.5 py-1 rounded border bg-emerald-100 text-emerald-700 border-emerald-200"
                style={{ fontSize: "0.68rem", fontWeight: 700, fontFamily: "monospace" }}>GET</span>
              <code className="text-gray-800" style={{ fontSize: "0.85rem" }}>/order/{"{id}"}/installment</code>
            </div>
            <div className="p-3 space-y-3">
              <p className="text-gray-600" style={{ fontSize: "0.78rem" }}>
                Busca as parcelas de um pedido pela chave fato.
              </p>
              <div className="relative">
                <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input type="text" value={sId} onChange={(e) => setSId(e.target.value)}
                  placeholder="ID do pedido (chave fato) *" className={inputClass} style={inputStyle} />
              </div>
              <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-100 rounded"
                style={{ fontSize: "0.65rem", fontWeight: 600 }}>Proxy: /sige/order/:id/installment</span>
              <button onClick={handleSearch} disabled={searching || !isConnected || !sId.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                {searching ? "Buscando..." : "Buscar Parcelas"}
              </button>

              {searchError && (
                <div className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-100 rounded-lg">
                  <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-red-700" style={{ fontSize: "0.75rem" }}>{searchError}</p>
                </div>
              )}
              {searchResult && (
                <div className="bg-gray-900 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
                    <p className="text-green-400" style={{ fontSize: "0.68rem", fontWeight: 600 }}>
                      Resposta GET /order/{sId || "{id}"}/installment:
                    </p>
                    <button onClick={() => handleCopy(searchResult)}
                      className="flex items-center gap-1 px-2 py-0.5 text-gray-400 hover:text-white rounded transition-colors cursor-pointer"
                      style={{ fontSize: "0.65rem" }}>
                      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                      {copied ? "Copiado" : "Copiar"}
                    </button>
                  </div>
                  <div className="px-3 pb-3 overflow-x-auto max-h-[500px] overflow-y-auto">
                    <pre className="text-gray-300" style={{ fontSize: "0.72rem", lineHeight: 1.5 }}>
                      <code>{JSON.stringify(searchResult, null, 2)}</code>
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
