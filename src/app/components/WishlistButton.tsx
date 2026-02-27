import React, { useState } from "react";
import { Heart } from "lucide-react";
import { useWishlist } from "../contexts/WishlistContext";

interface Props {
  sku: string;
  titulo: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  showLabel?: boolean;
}

export function WishlistButton({ sku, titulo, size = "md", className = "", showLabel = false }: Props) {
  var { isFavorite, toggleFavorite } = useWishlist();
  var [animating, setAnimating] = useState(false);
  var fav = isFavorite(sku);

  var iconSize = size === "sm" ? "w-4 h-4" : size === "lg" ? "w-6 h-6" : "w-5 h-5";
  var btnPad = size === "sm" ? "p-1.5" : size === "lg" ? "p-2.5" : "p-2";

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setAnimating(true);
    await toggleFavorite(sku, titulo);
    setTimeout(function () { setAnimating(false); }, 400);
  }

  return (
    <button
      onClick={handleClick}
      className={
        btnPad + " rounded-full transition-all cursor-pointer " +
        (fav
          ? "text-red-500 hover:text-red-600 hover:bg-red-50"
          : "text-gray-300 hover:text-red-400 hover:bg-red-50/60") +
        (animating ? " scale-125" : " scale-100") +
        " " + className
      }
      style={{ transition: "transform 0.25s cubic-bezier(0.34,1.56,0.64,1), color 0.2s, background 0.2s" }}
      title={fav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      aria-label={fav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
    >
      <Heart
        className={iconSize + " transition-all"}
        fill={fav ? "currentColor" : "none"}
        strokeWidth={fav ? 0 : 2}
      />
      {showLabel && (
        <span style={{ fontSize: "0.78rem", fontWeight: 500 }} className="ml-1.5">
          {fav ? "Favoritado" : "Favoritar"}
        </span>
      )}
    </button>
  );
}
