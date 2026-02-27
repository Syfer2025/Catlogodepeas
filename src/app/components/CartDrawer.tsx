import { useEffect } from "react";
import { Link } from "react-router";
import {
  X,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  Package,
  ArrowRight,
  Flame,
  Search,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useCart } from "../contexts/CartContext";
import { ProductImage } from "./ProductImage";
import { useCatalogMode } from "../contexts/CatalogModeContext";

/* Empty cart animation keyframes — injected once */
var _emptyCartCssInjected = false;
(function injectEmptyCartCss() {
  if (_emptyCartCssInjected || typeof document === "undefined") return;
  _emptyCartCssInjected = true;
  var style = document.createElement("style");
  style.textContent = [
    "@keyframes empty-cart-spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}",
    "@keyframes empty-cart-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}",
    "@keyframes empty-cart-twinkle{0%,100%{opacity:0.4;transform:scale(0.8)}50%{opacity:1;transform:scale(1.2)}}",
  ].join("");
  document.head.appendChild(style);
})();

function formatPrice(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

export function CartDrawer() {
  const { catalogMode } = useCatalogMode();
  const {
    items,
    totalItems,
    totalPrice,
    removeItem,
    updateQuantity,
    clearCart,
    isDrawerOpen,
    closeDrawer,
  } = useCart();

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isDrawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isDrawerOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isDrawerOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isDrawerOpen, closeDrawer]);

  return (
    <AnimatePresence>
      {isDrawerOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 z-[900] backdrop-blur-sm"
            onClick={closeDrawer}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-[901] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-white">
              <div className="flex items-center gap-3">
                <div className="bg-red-50 rounded-full p-2">
                  <ShoppingCart className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h2
                    className="text-gray-800"
                    style={{ fontSize: "1.1rem", fontWeight: 700 }}
                  >
                    Meu Carrinho
                  </h2>
                  <p
                    className="text-gray-400"
                    style={{ fontSize: "0.75rem" }}
                  >
                    {totalItems === 0
                      ? "Nenhum item"
                      : totalItems === 1
                      ? "1 item"
                      : `${totalItems} itens`}
                  </p>
                </div>
              </div>
              <button
                onClick={closeDrawer}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full px-6 text-center">
                  {/* Animated illustration */}
                  <div className="relative mb-6">
                    {/* Dashed circle */}
                    <div
                      className="w-28 h-28 rounded-full border-2 border-dashed border-gray-200 flex items-center justify-center"
                      style={{ animation: "empty-cart-spin 20s linear infinite" }}
                    >
                      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center">
                        <ShoppingCart className="w-9 h-9 text-red-300" style={{ animation: "empty-cart-float 3s ease-in-out infinite" }} />
                      </div>
                    </div>
                    {/* Floating sparkles */}
                    <Sparkles
                      className="w-4 h-4 text-amber-300 absolute -top-1 right-1"
                      style={{ animation: "empty-cart-twinkle 2s ease-in-out infinite" }}
                    />
                    <Sparkles
                      className="w-3 h-3 text-red-300 absolute bottom-2 -left-2"
                      style={{ animation: "empty-cart-twinkle 2s ease-in-out 0.7s infinite" }}
                    />
                  </div>

                  <p
                    className="text-gray-700 mb-1"
                    style={{ fontSize: "1.1rem", fontWeight: 700 }}
                  >
                    Seu carrinho está vazio
                  </p>
                  <p
                    className="text-gray-400 mb-8 max-w-[240px]"
                    style={{ fontSize: "0.85rem", lineHeight: 1.5 }}
                  >
                    Explore nosso catálogo e encontre as peças que você precisa!
                  </p>

                  {/* Action buttons */}
                  <div className="flex flex-col gap-3 w-full max-w-[260px]">
                    <Link
                      to="/catalogo"
                      onClick={closeDrawer}
                      className="bg-red-600 text-white px-6 py-3 rounded-xl hover:bg-red-700 transition-all inline-flex items-center justify-center gap-2 shadow-lg shadow-red-200/50 hover:shadow-red-300/50 hover:-translate-y-0.5"
                      style={{ fontSize: "0.9rem", fontWeight: 700 }}
                    >
                      <Search className="w-4 h-4" />
                      Explorar Catálogo
                    </Link>
                    <Link
                      to="/"
                      onClick={closeDrawer}
                      className="text-gray-500 hover:text-red-600 px-6 py-2 rounded-xl hover:bg-red-50 transition-all inline-flex items-center justify-center gap-2"
                      style={{ fontSize: "0.82rem", fontWeight: 500 }}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Ver Ofertas em Destaque
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {items.map((item) => (
                    <CartItemRow
                      key={item.sku}
                      item={item}
                      onRemove={() => removeItem(item.sku)}
                      onUpdateQty={(qty) => updateQuantity(item.sku, qty)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="border-t border-gray-200 bg-white p-5 space-y-4">
                {/* Total */}
                <div className="flex items-center justify-between">
                  <span
                    className="text-gray-600"
                    style={{ fontSize: "0.9rem", fontWeight: 500 }}
                  >
                    Subtotal
                  </span>
                  <span
                    className="text-gray-900"
                    style={{ fontSize: "1.3rem", fontWeight: 800 }}
                  >
                    {catalogMode ? "—" : totalPrice > 0 ? formatPrice(totalPrice) : "Sob consulta"}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2">
                  {catalogMode ? (
                    <div className="flex items-center justify-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 px-6 py-3 rounded-xl"
                      style={{ fontSize: "0.88rem", fontWeight: 600 }}>
                      Compras desabilitadas no momento
                    </div>
                  ) : (
                  <Link
                    to="/checkout"
                    onClick={closeDrawer}
                    className="flex items-center justify-center gap-2 bg-red-600 text-white px-6 py-3 rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
                    style={{ fontSize: "0.95rem", fontWeight: 700 }}
                  >
                    Finalizar Pedido
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                  )}
                  <button
                    onClick={clearCart}
                    className="flex items-center justify-center gap-2 text-gray-400 hover:text-red-600 py-2 transition-colors"
                    style={{ fontSize: "0.8rem" }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Limpar carrinho
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Individual cart item row
function CartItemRow({
  item,
  onRemove,
  onUpdateQty,
}: {
  item: {
    sku: string;
    titulo: string;
    quantidade: number;
    precoUnitario: number | null;
    imageUrl: string;
    isPromo?: boolean;
    warranty?: { planId: string; name: string; price: number; durationMonths: number } | null;
  };
  onRemove: () => void;
  onUpdateQty: (qty: number) => void;
}) {
  return (
    <div className="flex gap-3 p-4 hover:bg-gray-50/50 transition-colors">
      {/* Image */}
      <div className="w-16 h-16 bg-white rounded-lg border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center relative">
        {item.isPromo && (
          <div
            className="absolute top-0 left-0 right-0 bg-emerald-600 text-white flex items-center justify-center gap-0.5 z-10"
            style={{ fontSize: "0.48rem", fontWeight: 800, padding: "1px 0", letterSpacing: "0.04em" }}
          >
            <Flame className="w-2 h-2" />
            PROMO
          </div>
        )}
        <ProductImage
          sku={item.sku}
          alt={item.titulo}
          className="w-full h-full object-contain p-1"
          fallback={<Package className="w-6 h-6 text-gray-300" />}
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p
          className="text-gray-700 line-clamp-2"
          style={{ fontSize: "0.82rem", fontWeight: 500, lineHeight: 1.4 }}
        >
          {item.titulo}
        </p>
        <p
          className="text-gray-400 font-mono mt-0.5"
          style={{ fontSize: "0.68rem" }}
        >
          SKU: {item.sku}
        </p>

        {/* Warranty badge */}
        {item.warranty && (
          <div className="flex items-center gap-1 mt-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md w-fit">
            <ShieldCheck className="w-3 h-3" />
            <span style={{ fontSize: "0.62rem", fontWeight: 600 }}>
              {item.warranty.name} (+{formatPrice(item.warranty.price)})
            </span>
          </div>
        )}

        {/* Price + Qty controls */}
        <div className="flex items-center justify-between mt-2">
          {/* Quantity */}
          <div className="flex items-center gap-0 bg-gray-100 rounded-lg">
            <button
              onClick={() => onUpdateQty(item.quantidade - 1)}
              className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-red-600 hover:bg-gray-200 rounded-l-lg transition-colors cursor-pointer"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span
              className="w-8 text-center text-gray-800"
              style={{ fontSize: "0.82rem", fontWeight: 600 }}
            >
              {item.quantidade}
            </span>
            <button
              onClick={() => onUpdateQty(item.quantidade + 1)}
              className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-red-600 hover:bg-gray-200 rounded-r-lg transition-colors cursor-pointer"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          {/* Price */}
          <div className="text-right">
            {item.precoUnitario ? (
              <>
                <p
                  className="text-red-600"
                  style={{ fontSize: "0.88rem", fontWeight: 700 }}
                >
                  {formatPrice((item.precoUnitario + (item.warranty ? item.warranty.price : 0)) * item.quantidade)}
                </p>
                {(item.quantidade > 1 || item.warranty) && (
                  <p
                    className="text-gray-400"
                    style={{ fontSize: "0.65rem" }}
                  >
                    {formatPrice(item.precoUnitario + (item.warranty ? item.warranty.price : 0))} un.
                  </p>
                )}
              </>
            ) : (
              <p
                className="text-gray-400 italic"
                style={{ fontSize: "0.78rem" }}
              >
                Sob consulta
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Remove */}
      <button
        onClick={onRemove}
        className="self-start p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0 cursor-pointer"
        title="Remover item"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}