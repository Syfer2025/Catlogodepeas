import { Link } from "react-router";
import { Package, Hash, Eye } from "lucide-react";
import { useState } from "react";
import { getProductMainImageUrl } from "../services/api";

export interface ProdutoItem {
  sku: string;
  titulo: string;
}

interface ProductCardProps {
  product: ProdutoItem;
}

export function ProductCard({ product }: ProductCardProps) {
  const [imgError, setImgError] = useState(false);
  const mainImageUrl = getProductMainImageUrl(product.sku);

  return (
    <Link
      to={`/produto/${encodeURIComponent(product.sku)}`}
      className="group bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-xl hover:shadow-gray-200/50 hover:border-red-200 transition-all duration-300 flex flex-col hover:-translate-y-0.5"
    >
      {/* Image */}
      <div className="relative bg-white aspect-square flex items-center justify-center overflow-hidden">
        {!imgError ? (
          <img
            src={mainImageUrl}
            alt={product.titulo}
            className="w-full h-full object-contain p-3 group-hover:scale-105 transition-transform duration-500"
            onError={() => setImgError(true)}
            loading="lazy"
            decoding="async"
            width={400}
            height={400}
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 text-gray-300 group-hover:text-red-300 transition-colors">
            <Package className="w-12 h-12" />
            <span style={{ fontSize: "0.7rem" }} className="text-gray-400">
              Sem imagem
            </span>
          </div>
        )}
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-4">
          <span
            className="bg-white/95 backdrop-blur-sm text-gray-800 px-4 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg translate-y-2 group-hover:translate-y-0 transition-transform duration-300"
            style={{ fontSize: "0.78rem", fontWeight: 600 }}
          >
            <Eye className="w-3.5 h-3.5" />
            Ver Detalhes
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="p-4 flex flex-col flex-1 border-t border-gray-100">
        {/* Title */}
        <h3
          className="text-gray-800 mb-3 group-hover:text-red-600 transition-colors line-clamp-3 flex-1"
          style={{ fontSize: "0.88rem", fontWeight: 500, lineHeight: 1.5 }}
        >
          {product.titulo}
        </h3>

        {/* SKU */}
        <div className="flex items-center gap-1.5 text-gray-400 mt-auto pt-2 border-t border-gray-50">
          <Hash className="w-3.5 h-3.5" />
          <span
            className="font-mono bg-gray-50 px-2 py-0.5 rounded truncate"
            style={{ fontSize: "0.73rem" }}
          >
            {product.sku}
          </span>
        </div>
      </div>
    </Link>
  );
}