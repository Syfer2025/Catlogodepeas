import { Link } from "react-router";
import { Package, ShoppingCart } from "lucide-react";
import type { ProductBalance, ProductPrice } from "../services/api";
import { StockBadge } from "./StockBadge";
import { PriceBadge } from "./PriceBadge";
import { StockBar } from "./StockBar";
import { ProductImage } from "./ProductImage";
import { WishlistButton } from "./WishlistButton";
import { ReviewStars } from "./ReviewStars";
import { prefetchProductDetail, scheduleProductDataPrefetch, cancelProductDataPrefetch } from "../utils/prefetch";

export interface ProdutoItem {
  sku: string;
  titulo: string;
}

interface ProductCardProps {
  product: ProdutoItem;
  /** Pass preloaded balance to avoid individual API calls */
  balance?: ProductBalance | null;
  /** Pass preloaded price to avoid individual API calls */
  preloadedPrice?: ProductPrice | null;
  /** Pass preloaded review summary to avoid individual API calls */
  reviewSummary?: { averageRating: number; totalReviews: number } | null;
}

export function ProductCard({ product, balance, preloadedPrice, reviewSummary }: ProductCardProps) {
  const inStock = balance ? (balance.disponivel ?? balance.quantidade ?? 0) > 0 : true;
  const showOutOfStock = balance !== undefined && balance !== null && balance.found && !inStock;

  return (
    <Link
      to={"/produto/" + encodeURIComponent(product.sku)}
      className="group bg-white rounded-xl border border-gray-100 overflow-hidden flex flex-col relative"
      style={{ transition: "box-shadow 0.35s cubic-bezier(.22,.61,.36,1), transform 0.35s cubic-bezier(.22,.61,.36,1)" }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 10px 25px -5px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)"; e.currentTarget.style.transform = "translateY(-2px)"; prefetchProductDetail(); scheduleProductDataPrefetch(product.sku); }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = ""; e.currentTarget.style.transform = ""; cancelProductDataPrefetch(product.sku); }}
      aria-label={product.titulo + " - Código " + product.sku}
    >
      {/* Out-of-stock ribbon */}
      {showOutOfStock && (
        <div className="absolute top-2 sm:top-3 left-0 z-10 bg-red-600 text-white px-2 sm:px-3 py-0.5 sm:py-1 rounded-r-full shadow-sm" style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.03em" }}>
          ESGOTADO
        </div>
      )}

      {/* Wishlist heart */}
      <div className="absolute top-1.5 sm:top-2.5 right-1.5 sm:right-2.5 z-10" onClick={(e) => e.preventDefault()}>
        <WishlistButton sku={product.sku} titulo={product.titulo} size="sm" className="bg-white/80 backdrop-blur-sm shadow-sm hover:shadow-md" />
      </div>

      {/* Image */}
      <div className="relative bg-white aspect-square flex items-center justify-center overflow-hidden">
        <ProductImage
          sku={product.sku}
          alt={product.titulo}
          className={"w-full h-full object-contain p-2 sm:p-4 transition-transform duration-500 ease-out" + (showOutOfStock ? " opacity-50 grayscale" : "")}
          style={{ transitionTimingFunction: "cubic-bezier(.22,.61,.36,1)" }}
          onMouseEnter={(e) => { if (!showOutOfStock) (e.target as HTMLImageElement).style.transform = "scale(1.06)"; }}
          onMouseLeave={(e) => { (e.target as HTMLImageElement).style.transform = "scale(1)"; }}
          fallback={
            <div className="flex flex-col items-center justify-center gap-1 sm:gap-2 text-gray-200 group-hover:text-gray-300 transition-colors">
              <Package className="w-10 h-10 sm:w-14 sm:h-14" />
              <span style={{ fontSize: "0.65rem" }} className="text-gray-300 hidden sm:block">
                Sem imagem
              </span>
            </div>
          }
          width={400}
          height={400}
        />
      </div>

      {/* Info section */}
      <div className="p-2.5 sm:p-4 flex flex-col flex-1 border-t border-gray-100">
        {/* Title */}
        <h3
          className="text-gray-800 mb-1 sm:mb-1.5 group-hover:text-red-600 transition-colors line-clamp-2 flex-1"
          style={{ fontSize: "clamp(0.7rem, 2.5vw, 0.85rem)", fontWeight: 600, lineHeight: 1.4 }}
        >
          {product.titulo}
        </h3>

        {/* Review Stars */}
        <div className="mb-1 sm:mb-2">
          <ReviewStars sku={product.sku} preloaded={reviewSummary} />
        </div>

        {/* Price section */}
        <div className="mb-1.5 sm:mb-3">
          <PriceBadge sku={product.sku} variant="compact" preloaded={preloadedPrice} />
        </div>

        {/* Stock bar */}
        <div className="hidden sm:block">
          <StockBar sku={product.sku} preloaded={balance} />
        </div>

        {/* Bottom: SKU + Stock */}
        <div className="flex items-center justify-between gap-1 sm:gap-1.5 text-gray-500 pt-1.5 sm:pt-2.5 border-t border-gray-100">
          <span
            className="font-mono text-gray-500 truncate"
            style={{ fontSize: "0.6rem" }}
            title={product.sku}
          >
            COD: {product.sku}
          </span>
          {balance !== undefined && (
            <div className="shrink-0" onClick={(e) => e.preventDefault()}>
              <StockBadge sku={product.sku} variant="compact" preloaded={balance} />
            </div>
          )}
        </div>

        {/* CTA Button */}
        <div className="mt-2 sm:mt-3">
          <span
            className={
              "w-full flex items-center justify-center gap-1.5 sm:gap-2 py-1.5 sm:py-2.5 rounded-lg " +
              (showOutOfStock
                ? "bg-gray-100 text-gray-400 cursor-default"
                : "bg-red-600 text-white group-hover:bg-red-700")
            }
            style={{
              fontSize: "clamp(0.68rem, 2.2vw, 0.82rem)",
              fontWeight: 600,
              transition: "background-color 0.3s ease, box-shadow 0.3s ease",
              boxShadow: showOutOfStock ? "none" : undefined,
            }}
            onMouseEnter={(e) => { if (!showOutOfStock) e.currentTarget.style.boxShadow = "0 4px 12px rgba(220,38,38,0.35)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; }}
          >
            <ShoppingCart className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            {showOutOfStock ? "Indisponível" : "Comprar"}
          </span>
        </div>
      </div>
    </Link>
  );
}