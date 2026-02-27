import { useState, useEffect, useCallback } from "react";
import { ShoppingCart, Plus, Minus, Check, Loader2, Ban } from "lucide-react";
import { useCart } from "../contexts/CartContext";
import * as api from "../services/api";
import { getResolvedProductImageUrl } from "./ProductImage";
import { useGA4 } from "./GA4Provider";
import { toast } from "sonner";
import { useCatalogMode } from "../contexts/CatalogModeContext";

interface AddToCartButtonProps {
  sku: string;
  titulo: string;
  /** "full" for detail page, "compact" for ProductCard */
  variant?: "full" | "compact";
  /** When provided, use this price instead of fetching from SIGE (e.g. Super Promo price) */
  overridePrice?: number | null;
  /** Pre-fetched price data — avoids redundant getProductPrice() API call */
  preloadedPrice?: number | null;
  /** When true, the product cannot be added to cart (stock = 0) */
  outOfStock?: boolean;
  /** Available stock quantity — limits the qty selector */
  availableQty?: number | null;
  /** Callback to update parent's balance state after force-refresh */
  onStockUpdate?: (available: number | null, outOfStock: boolean) => void;
  /** Extended warranty selection from parent */
  warranty?: { planId: string; name: string; price: number; durationMonths: number } | null;
}

export function AddToCartButton({ sku, titulo, variant = "full", overridePrice, preloadedPrice, outOfStock, availableQty, onStockUpdate, warranty }: AddToCartButtonProps) {
  const { catalogMode } = useCatalogMode();
  const { addItem, items } = useCart();
  const { trackEvent } = useGA4();
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(true);
  const [added, setAdded] = useState(false);
  const [validating, setValidating] = useState(false);

  // Live stock state — initialized from props, updated by force-refresh
  const [liveOutOfStock, setLiveOutOfStock] = useState(outOfStock || false);
  const [liveAvailableQty, setLiveAvailableQty] = useState(availableQty);

  // Sync with parent prop changes
  useEffect(() => {
    setLiveOutOfStock(outOfStock || false);
  }, [outOfStock]);
  useEffect(() => {
    setLiveAvailableQty(availableQty);
  }, [availableQty]);

  const existingItem = items.find((i) => i.sku === sku);

  // Fetch price (skip if overridePrice or preloadedPrice is provided)
  useEffect(() => {
    if (overridePrice !== undefined && overridePrice !== null) {
      setPrice(overridePrice);
      setPriceLoading(false);
      return;
    }
    if (preloadedPrice !== undefined && preloadedPrice !== null) {
      setPrice(preloadedPrice);
      setPriceLoading(false);
      return;
    }
    let cancelled = false;
    setPriceLoading(true);
    api
      .getProductPrice(sku)
      .then((data) => {
        if (cancelled) return;
        if (data.found && data.price !== null) {
          setPrice(data.price);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setPriceLoading(false); });
    return () => { cancelled = true; };
  }, [sku, overridePrice, preloadedPrice]);

  // ═══════ STOCK VALIDATION LAYER 2: Real-time check before adding to cart ═══════
  const validateAndAdd = useCallback(async (qtyToAdd: number) => {
    setValidating(true);
    try {
      var fresh = await api.getProductBalance(sku, { force: true });
      var freshAvailable = fresh.found ? (fresh.disponivel ?? fresh.quantidade ?? 0) : null;
      var freshOutOfStock = fresh.found && freshAvailable !== null && freshAvailable <= 0;

      console.log("[AddToCart] Layer 2 stock validation: SKU=" + sku +
        " requested=" + qtyToAdd + " available=" + freshAvailable);

      // Update live state
      if (freshAvailable !== null) {
        setLiveAvailableQty(freshAvailable);
        setLiveOutOfStock(freshOutOfStock);
        if (onStockUpdate) {
          onStockUpdate(freshAvailable, freshOutOfStock);
        }
      }

      // Check: completely out of stock
      if (freshOutOfStock) {
        toast.error("Produto esgotado", {
          description: "\"" + titulo + "\" acabou de ficar sem estoque.",
          duration: 4000,
        });
        setValidating(false);
        return;
      }

      // Check: requested qty exceeds available
      var existingInCart = existingItem ? existingItem.quantidade : 0;
      var totalNeeded = existingInCart + qtyToAdd;
      if (freshAvailable !== null && totalNeeded > freshAvailable) {
        var canAdd = Math.max(0, freshAvailable - existingInCart);
        if (canAdd <= 0) {
          toast.error("Limite de estoque atingido", {
            description: "Voce ja tem " + existingInCart + " un. no carrinho e so ha " + freshAvailable + " un. disponiveis.",
            duration: 4000,
          });
          setValidating(false);
          return;
        }
        // Auto-reduce quantity and warn
        toast.warning("Quantidade ajustada", {
          description: "Estoque disponivel: " + freshAvailable + " un. Adicionando " + canAdd + " un. ao inves de " + qtyToAdd + ".",
          duration: 4000,
        });
        qtyToAdd = canAdd;
        setQuantity(canAdd);
      }

      // Stock validated — proceed with add
      addItem({
        sku,
        titulo,
        quantidade: qtyToAdd,
        precoUnitario: price,
        imageUrl: getResolvedProductImageUrl(sku),
        isPromo: overridePrice !== undefined && overridePrice !== null,
        warranty: warranty,
      });
      trackEvent("add_to_cart", {
        currency: "BRL",
        value: price ? price * qtyToAdd : 0,
        items: [{ item_id: sku, item_name: titulo, quantity: qtyToAdd, price: price ?? 0 }],
      });
      toast.success("Produto adicionado ao carrinho!", { description: titulo, duration: 2500 });
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    } catch (e) {
      console.warn("[AddToCart] Layer 2 stock validation failed (allowing add):", e);
      // Non-blocking: if validation fails, still allow the add
      // (checkout will catch it later)
      addItem({
        sku,
        titulo,
        quantidade: qtyToAdd,
        precoUnitario: price,
        imageUrl: getResolvedProductImageUrl(sku),
        isPromo: overridePrice !== undefined && overridePrice !== null,
        warranty: warranty,
      });
      trackEvent("add_to_cart", {
        currency: "BRL",
        value: price ? price * qtyToAdd : 0,
        items: [{ item_id: sku, item_name: titulo, quantity: qtyToAdd, price: price ?? 0 }],
      });
      toast.success("Produto adicionado ao carrinho!", { description: titulo, duration: 2500 });
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    } finally {
      setValidating(false);
    }
  }, [sku, titulo, price, existingItem, addItem, trackEvent, overridePrice, onStockUpdate, warranty]);

  const handleAdd = useCallback(() => {
    validateAndAdd(quantity);
  }, [quantity, validateAndAdd]);

  // ─── Compact variant (for ProductCard) ───
  if (variant === "compact") {
    if (catalogMode) {
      return null;
    }
    if (liveOutOfStock) {
      return (
        <span
          className="flex items-center gap-1.5 bg-gray-200 text-gray-400 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-default"
          title="Produto esgotado"
        >
          <Ban className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Esgotado</span>
        </span>
      );
    }
    return (
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          validateAndAdd(1);
        }}
        disabled={validating}
        className={"flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all text-xs font-semibold shadow-sm cursor-pointer " +
          (validating ? "bg-gray-400 text-white" : "bg-red-600 text-white hover:bg-red-700")}
        title="Adicionar ao carrinho"
      >
        {validating ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <ShoppingCart className="w-3.5 h-3.5" />
        )}
        <span className="hidden sm:inline">{validating ? "Aguarde..." : "Adicionar"}</span>
      </button>
    );
  }

  // ─── Full variant (for ProductDetailPage) ───
  // Compute max qty: cap at available stock if known, else no limit
  const existingInCart = existingItem ? existingItem.quantidade : 0;
  const effectiveAvailableQty = liveAvailableQty;
  const maxAddable = (effectiveAvailableQty !== null && effectiveAvailableQty !== undefined)
    ? Math.max(0, effectiveAvailableQty - existingInCart)
    : Infinity;
  const isDisabled = priceLoading || liveOutOfStock || maxAddable <= 0 || validating;

  if (catalogMode) {
    return (
      <div className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700"
        style={{ fontSize: "0.9rem", fontWeight: 600 }}>
        <ShoppingCart className="w-5 h-5" />
        Entre em contato para comprar
      </div>
    );
  }

  // Out of stock — show full disabled state
  if (liveOutOfStock) {
    return (
      <div className="space-y-2">
        <button
          disabled
          className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gray-200 text-gray-400 cursor-not-allowed shadow-none"
          style={{ fontSize: "0.95rem", fontWeight: 700 }}
        >
          <Ban className="w-5 h-5" />
          Produto Esgotado
        </button>
        <p className="text-gray-400 text-center" style={{ fontSize: "0.78rem" }}>
          Este produto esta sem estoque no momento.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Quantity selector + Add button */}
      <div className="flex items-center gap-3">
        {/* Quantity */}
        <div className="flex items-center gap-0 bg-gray-100 rounded-xl border border-gray-200">
          <button
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-red-600 hover:bg-gray-200 rounded-l-xl transition-colors cursor-pointer"
            disabled={validating}
          >
            <Minus className="w-4 h-4" />
          </button>
          <input
            type="number"
            value={quantity}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val) && val > 0) {
                const cap = (effectiveAvailableQty !== null && effectiveAvailableQty !== undefined)
                  ? Math.min(val, Math.max(1, effectiveAvailableQty - existingInCart))
                  : val;
                setQuantity(cap);
              }
            }}
            className="w-14 text-center text-gray-800 bg-transparent border-0 focus:outline-none"
            style={{ fontSize: "1rem", fontWeight: 700 }}
            min={1}
            disabled={validating}
          />
          <button
            onClick={() => setQuantity((q) => {
              const next = q + 1;
              if (effectiveAvailableQty !== null && effectiveAvailableQty !== undefined) {
                return Math.min(next, Math.max(1, effectiveAvailableQty - existingInCart));
              }
              return next;
            })}
            className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-red-600 hover:bg-gray-200 rounded-r-xl transition-colors cursor-pointer"
            disabled={validating}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Add to Cart */}
        <button
          onClick={handleAdd}
          disabled={isDisabled}
          className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl transition-all shadow-lg cursor-pointer ${
            added
              ? "bg-green-600 text-white shadow-green-200"
              : validating
                ? "bg-red-500 text-white shadow-red-200"
                : "bg-red-600 text-white hover:bg-red-700 shadow-red-200"
          } disabled:opacity-50 disabled:pointer-events-none`}
          style={{ fontSize: "0.95rem", fontWeight: 700 }}
        >
          {added ? (
            <>
              <Check className="w-5 h-5" />
              Adicionado!
            </>
          ) : validating ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Adicionando...
            </>
          ) : priceLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Carregando...
            </>
          ) : maxAddable <= 0 ? (
            <>
              <Ban className="w-5 h-5" />
              Limite de estoque atingido
            </>
          ) : (
            <>
              <ShoppingCart className="w-5 h-5" />
              Adicionar ao Carrinho
            </>
          )}
        </button>
      </div>

      {/* Stock limit hint */}
      {effectiveAvailableQty !== null && effectiveAvailableQty !== undefined && effectiveAvailableQty > 0 && (
        <p className="text-gray-400" style={{ fontSize: "0.72rem" }}>
          {effectiveAvailableQty} un. disponiveis
          {existingInCart > 0 ? " (" + existingInCart + " ja no carrinho)" : ""}
        </p>
      )}

      {/* Already in cart indicator */}
      {existingItem && !added && maxAddable > 0 && (
        <p className="text-gray-400 flex items-center gap-1.5" style={{ fontSize: "0.78rem" }}>
          <ShoppingCart className="w-3 h-3" />
          Voce ja tem {existingItem.quantidade} un. no carrinho
        </p>
      )}
    </div>
  );
}