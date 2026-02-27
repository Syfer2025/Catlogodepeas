import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertTriangle, PackageCheck, PackageX, RefreshCw } from "lucide-react";
import * as api from "../services/api";
import type { ProductBalance } from "../services/api";

interface StockBadgeProps {
  sku: string;
  /** "full" shows quantity + details, "compact" just a colored dot/label, "inline" for table cells */
  variant?: "full" | "compact" | "inline";
  /** If balance data already loaded externally, pass it to avoid duplicate fetch */
  preloaded?: ProductBalance | null;
}

export function StockBadge({ sku, variant = "compact", preloaded }: StockBadgeProps) {
  const [balance, setBalance] = useState<ProductBalance | null>(preloaded ?? null);
  const [loading, setLoading] = useState(preloaded === undefined);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchBalance = useCallback((force = false) => {
    if (!sku) return;
    setLoading(true);
    setFetchError(null);
    console.log(`[StockBadge] Fetching balance for SKU: ${sku}${force ? " (FORCE)" : ""}`);
    api.getProductBalance(sku, { force, debug: force })
      .then((data) => {
        console.log(`[StockBadge] Result for ${sku}:`, JSON.stringify(data));
        console.log(`[StockBadge] ${sku} → found=${data.found}, sige=${data.sige}, qty=${data.quantidade}, disp=${data.disponivel}, error=${data.error || "none"}`);
        if (data._debug) console.log(`[StockBadge] Debug log:`, data._debug);
        if (data._sigeResponses) console.log(`[StockBadge] SIGE responses:`, data._sigeResponses);
        setBalance(data);
        if (data.error) setFetchError(data.error);
      })
      .catch((e) => {
        console.error(`[StockBadge] Fetch error for ${sku}:`, e);
        setFetchError(e.message || "Erro");
        setBalance(null);
      })
      .finally(() => setLoading(false));
  }, [sku]);

  useEffect(() => {
    // If preloaded is explicitly provided (even null), use it — no fetch
    if (preloaded !== undefined) {
      setBalance(preloaded);
      setLoading(false);
      setFetchError(null);
      return;
    }
    // Debounce individual fetch by 300ms to let bulk/preloaded results arrive first.
    // The auto-batching layer in api.ts now handles connection pooling, so we no
    // longer need the old 1500ms debounce for that purpose.
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      fetchBalance(false);
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [sku, preloaded, fetchBalance]);

  // ─── Loading state ───
  if (loading) {
    if (variant === "inline") {
      return <Loader2 className="w-3.5 h-3.5 text-gray-300 animate-spin" />;
    }
    if (variant === "compact") {
      return (
        <div className="flex items-center gap-1 text-gray-400" style={{ fontSize: "0.65rem" }}>
          <Loader2 className="w-3 h-3 animate-spin" />
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 text-gray-400 py-3 px-4 rounded-xl border border-gray-100 bg-gray-50" style={{ fontSize: "0.8rem" }}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Verificando disponibilidade...</span>
      </div>
    );
  }

  // ─── No data / SIGE not configured ───
  if (!balance || (!balance.sige && !balance.found)) {
    if (variant === "inline") {
      return <span className="text-gray-300" style={{ fontSize: "0.72rem" }}>—</span>;
    }
    if (variant === "compact") {
      return null; // Don't show on cards if SIGE not connected
    }
    // full variant — show info about missing SIGE
    return (
      <div className="flex items-center gap-2 text-gray-400 py-3 px-4 rounded-xl border border-gray-100 bg-gray-50" style={{ fontSize: "0.78rem" }}>
        <AlertTriangle className="w-4 h-4 text-amber-400" />
        <span className="flex-1">{fetchError || balance?.error || "Estoque indisponível"}</span>
        <button onClick={() => fetchBalance(true)} className="p-1 rounded-full hover:bg-gray-200 transition-colors" title="Tentar novamente">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // ─── Product not found in SIGE ───
  if (!balance.found) {
    if (variant === "inline") {
      return <span className="text-gray-400" style={{ fontSize: "0.72rem" }}>N/D</span>;
    }
    if (variant === "compact") {
      return null;
    }
    return (
      <div className="flex items-center gap-2 text-amber-600 py-3 px-4 rounded-xl border border-amber-100 bg-amber-50" style={{ fontSize: "0.78rem" }}>
        <AlertTriangle className="w-4 h-4" />
        <span className="flex-1">SKU não localizado no sistema SIGE</span>
        <button onClick={() => fetchBalance(true)} className="p-1 rounded-full hover:bg-amber-100 transition-colors" title="Forçar nova consulta (ignora cache)">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  const qty = balance.quantidade ?? 0;
  const available = balance.disponivel ?? qty;
  const reserved = balance.reservado ?? 0;
  const inStock = available > 0;

  // ─── Compact variant (for ProductCard) ───
  if (variant === "compact") {
    return (
      <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full border ${
        inStock
          ? "bg-green-50 text-green-700 border-green-200"
          : "bg-red-50 text-red-600 border-red-200"
      }`} style={{ fontSize: "0.68rem", fontWeight: 600 }}>
        <div className={`w-1.5 h-1.5 rounded-full ${inStock ? "bg-green-500" : "bg-red-500"}`} />
        {inStock ? `${available} disp.` : "Sem estoque"}
      </div>
    );
  }

  // ─── Inline variant (for admin tables) ───
  if (variant === "inline") {
    return (
      <div className="flex items-center gap-1.5">
        {inStock ? <PackageCheck className="w-3.5 h-3.5 text-green-500" /> : <PackageX className="w-3.5 h-3.5 text-red-400" />}
        <span className={inStock ? "text-green-700" : "text-red-500"} style={{ fontSize: "0.78rem", fontWeight: 600 }}>
          {available}
        </span>
        {reserved > 0 && (
          <span className="text-amber-500" style={{ fontSize: "0.65rem" }}>
            ({reserved} res.)
          </span>
        )}
      </div>
    );
  }

  // ─── Full variant (for ProductDetailPage) — simple single-line ───
  return (
    <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border ${
      inStock
        ? "bg-green-50 border-green-200"
        : "bg-red-50 border-red-200"
    }`}>
      {inStock ? (
        <PackageCheck className="w-5 h-5 text-green-600 shrink-0" />
      ) : (
        <PackageX className="w-5 h-5 text-red-500 shrink-0" />
      )}
      <p className={inStock ? "text-green-800" : "text-red-700"} style={{ fontSize: "0.9rem", fontWeight: 700 }}>
        {inStock
          ? `${available} disponíve${available !== 1 ? "is" : "l"} em estoque`
          : "Produto indisponível"}
      </p>
    </div>
  );
}