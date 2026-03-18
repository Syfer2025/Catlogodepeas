import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router";
import { Heart, Trash2, ShoppingCart, Package, ArrowLeft } from "lucide-react";
import { useWishlist } from "../contexts/WishlistContext";
import { useCart } from "../contexts/CartContext";
import { ProductImage } from "../components/ProductImage";
import { WishlistButton } from "../components/WishlistButton";
import * as api from "../services/api";

interface FavoriteWithDetails {
  sku: string;
  titulo: string;
  addedAt: string;
  price?: number | null;
  loading: boolean;
}

export function WishlistPage() {
  const { favorites, loading: wishlistLoading, count } = useWishlist();
  const { addItem } = useCart();
  const [items, setItems] = useState<FavoriteWithDetails[]>([]);
  const [pricesLoaded, setPricesLoaded] = useState(false);

  // Sync items from favorites
  useEffect(() => {
    if (wishlistLoading) return;
    setItems(
      favorites.map((f) => ({
        sku: f.sku,
        titulo: f.titulo,
        addedAt: f.addedAt,
        price: undefined,
        loading: true,
      }))
    );
    setPricesLoaded(false);
  }, [favorites, wishlistLoading]);

  // Load prices
  useEffect(() => {
    if (pricesLoaded || items.length === 0 || items.every((i) => !i.loading)) return;

    var cancelled = false;
    (async () => {
      var updated = [...items];
      for (var i = 0; i < updated.length; i++) {
        if (!updated[i].loading) continue;
        try {
          var res = await api.getProdutoBySku(updated[i].sku);
          var prod = res?.data?.[0];
          updated[i] = { ...updated[i], price: prod?.preco ?? null, loading: false };
        } catch {
          updated[i] = { ...updated[i], price: null, loading: false };
        }
      }
      if (!cancelled) {
        setItems(updated);
        setPricesLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [items, pricesLoaded]);

  const handleAddToCart = useCallback(
    (sku: string, titulo: string, price: number) => {
      addItem({ sku, titulo, preco: price, quantidade: 1 });
    },
    [addItem]
  );

  if (wishlistLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-3 border-red-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Heart className="w-7 h-7 text-red-600 fill-red-600" />
        <h1 className="text-2xl font-bold text-gray-900">
          Meus Favoritos
          {count > 0 && (
            <span className="ml-2 text-base font-normal text-gray-500">
              ({count} {count === 1 ? "item" : "itens"})
            </span>
          )}
        </h1>
      </div>

      {/* Empty state */}
      {favorites.length === 0 ? (
        <div className="text-center py-20">
          <Heart className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-700 mb-2">
            Nenhum favorito ainda
          </h2>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Navegue pelo catalogo e clique no coracao para salvar seus produtos favoritos.
          </p>
          <Link
            to="/catalogo"
            className="inline-flex items-center gap-2 bg-red-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-red-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Explorar Catalogo
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {items.map((item) => (
            <div
              key={item.sku}
              className="flex items-center gap-4 bg-white border border-gray-100 rounded-xl p-4 hover:shadow-md transition-shadow"
            >
              {/* Image */}
              <Link
                to={"/produto/" + encodeURIComponent(item.sku)}
                className="shrink-0 w-20 h-20 sm:w-24 sm:h-24 bg-white rounded-lg overflow-hidden flex items-center justify-center border border-gray-50"
              >
                <ProductImage
                  sku={item.sku}
                  alt={item.titulo}
                  className="w-full h-full object-contain p-2"
                  fallback={
                    <Package className="w-8 h-8 text-gray-200" />
                  }
                />
              </Link>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <Link
                  to={"/produto/" + encodeURIComponent(item.sku)}
                  className="text-sm sm:text-base font-medium text-gray-900 hover:text-red-600 transition-colors line-clamp-2"
                >
                  {item.titulo}
                </Link>
                <p className="text-xs text-gray-400 mt-1">
                  SKU: {item.sku}
                </p>
                {item.loading ? (
                  <div className="mt-1 h-5 w-20 bg-gray-100 rounded animate-pulse" />
                ) : item.price != null && item.price > 0 ? (
                  <p className="text-lg font-bold text-red-600 mt-1">
                    R$ {item.price.toFixed(2).replace(".", ",")}
                  </p>
                ) : null}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {!item.loading && item.price != null && item.price > 0 && (
                  <button
                    onClick={() => handleAddToCart(item.sku, item.titulo, item.price!)}
                    className="flex items-center gap-1.5 bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                    title="Adicionar ao carrinho"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    <span className="hidden sm:inline">Comprar</span>
                  </button>
                )}
                <WishlistButton sku={item.sku} titulo={item.titulo} size="md" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
