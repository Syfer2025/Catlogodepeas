import React, { useRef } from "react";
import { Link } from "react-router";
import { ChevronLeft, ChevronRight, Award } from "lucide-react";
import type { BrandItem } from "../services/api";

interface BrandCarouselProps {
  brands: BrandItem[];
}

export function BrandCarousel({ brands }: BrandCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (!brands || brands.length === 0) return null;

  const scroll = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    var amount = dir === "left" ? -220 : 220;
    scrollRef.current.scrollBy({ left: amount, behavior: "smooth" });
  };

  return (
    <section className="bg-white border-b border-gray-100 py-6">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Award className="w-4.5 h-4.5 text-red-500" />
            <h3
              className="text-gray-700"
              style={{ fontSize: "0.85rem", fontWeight: 700 }}
            >
              Marcas
            </h3>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={function () { scroll("left"); }}
              className="p-1.5 rounded-full border border-gray-200 bg-white hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
              aria-label="Rolar marcas para esquerda"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={function () { scroll("right"); }}
              className="p-1.5 rounded-full border border-gray-200 bg-white hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
              aria-label="Rolar marcas para direita"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto pb-1 hide-scrollbar"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {brands.map(function (brand) {
            return (
              <Link
                key={brand.id}
                to={"/marca/" + brand.slug}
                className="group flex items-center justify-center shrink-0 rounded-xl border border-gray-200 hover:border-red-300 hover:shadow-md overflow-hidden transition-all duration-200"
                style={{
                  width: "130px",
                  height: "80px",
                  backgroundColor: brand.bgColor || "#ffffff",
                }}
              >
                {brand.logoUrl ? (
                  <img
                    src={brand.logoUrl}
                    alt={brand.name}
                    className={"max-w-[90px] max-h-[55px] object-contain transition-transform duration-300" + (brand.logoZoom && brand.logoZoom !== 1 ? "" : " group-hover:scale-110")}
                    loading="lazy"
                    draggable={false}
                    style={brand.logoZoom && brand.logoZoom !== 1 ? { transform: "scale(" + brand.logoZoom + ")" } : undefined}
                  />
                ) : (
                  <span
                    className="text-gray-600 text-center px-2"
                    style={{ fontSize: "0.72rem", fontWeight: 600 }}
                  >
                    {brand.name}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}