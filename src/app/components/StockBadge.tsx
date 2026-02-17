import { useState, useEffect } from "react";
import { Loader2, AlertTriangle, PackageCheck, PackageX } from "lucide-react";
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

  useEffect(() => {
    // If preloaded is explicitly provided (even null), use it — no fetch
    if (preloaded !== undefined) {
      setBalance(preloaded);
      setLoading(false);
      setFetchError(null);
      return;
    }
    // Self-fetch for standalone usage (e.g. ProductDetailPage)
    if (!sku) return;
    setLoading(true);
    setFetchError(null);
    console.log(`[StockBadge] Fetching balance for SKU: ${sku}`);
    api.getProductBalance(sku)
      .then((data) => {
        console.log(`[StockBadge] Result for ${sku}:`, data);
        setBalance(data);
        if (data.error) setFetchError(data.error);
      })
      .catch((e) => {
        console.error(`[StockBadge] Fetch error for ${sku}:`, e);
        setFetchError(e.message || "Erro");
        setBalance(null);
      })
      .finally(() => setLoading(false));
  }, [sku, preloaded]);

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
        <span>Consultando estoque...</span>
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
        <span>{fetchError || balance?.error || "Estoque indisponivel"}</span>
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
        <span>SKU nao localizado no sistema SIGE</span>
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

  // ─── Full variant (for ProductDetailPage) ───
  return (
    <div className="rounded-xl border overflow-hidden">
      {/* Header */}
      <div className={`flex items-center gap-3 px-4 py-3 ${
        inStock
          ? "bg-green-50 border-b border-green-100"
          : "bg-red-50 border-b border-red-100"
      }`}>
        {inStock ? (
          <PackageCheck className="w-5 h-5 text-green-600" />
        ) : (
          <PackageX className="w-5 h-5 text-red-500" />
        )}
        <div className="flex-1">
          <p className={inStock ? "text-green-800" : "text-red-700"} style={{ fontSize: "0.88rem", fontWeight: 700 }}>
            {inStock ? "Em Estoque" : "Indisponivel"}
          </p>
          <p className={inStock ? "text-green-600" : "text-red-500"} style={{ fontSize: "0.72rem" }}>
            {inStock ? `${available} unidade${available !== 1 ? "s" : ""} disponive${available !== 1 ? "is" : "l"}` : "Sem estoque no momento"}
          </p>
        </div>
        {balance.cached && (
          <span className="text-gray-400" style={{ fontSize: "0.6rem" }} title="Dado em cache (atualizado a cada 5 min)">
            cache
          </span>
        )}
      </div>

      {/* Details */}
      {(qty > 0 || reserved > 0) && (
        <div className="px-4 py-2.5 bg-white grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-gray-400" style={{ fontSize: "0.6rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Total</p>
            <p className="text-gray-700" style={{ fontSize: "1rem", fontWeight: 700 }}>{qty}</p>
          </div>
          <div>
            <p className="text-amber-500" style={{ fontSize: "0.6rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Reservado</p>
            <p className="text-amber-600" style={{ fontSize: "1rem", fontWeight: 700 }}>{reserved}</p>
          </div>
          <div>
            <p className={inStock ? "text-green-500" : "text-red-400"} style={{ fontSize: "0.6rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Disponivel</p>
            <p className={inStock ? "text-green-700" : "text-red-500"} style={{ fontSize: "1rem", fontWeight: 700 }}>{available}</p>
          </div>
        </div>
      )}

      {/* Per-location breakdown */}
      {balance.locais && balance.locais.length > 1 && (
        <div className="border-t border-gray-100">
          <p className="px-4 py-2 text-gray-400" style={{ fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Por local
          </p>
          <div className="px-4 pb-3 space-y-1.5">
            {balance.locais.map((loc, idx) => (
              <div key={idx} className="flex items-center justify-between text-gray-600 py-1 px-2 bg-gray-50 rounded-lg" style={{ fontSize: "0.75rem" }}>
                <span className="truncate flex-1">
                  {loc.local}{loc.filial ? ` — ${loc.filial}` : ""}
                </span>
                <span className={`shrink-0 ml-3 ${loc.disponivel > 0 ? "text-green-700" : "text-red-500"}`} style={{ fontWeight: 600 }}>
                  {loc.disponivel} disp.
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
