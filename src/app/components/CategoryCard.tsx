import { Link } from "react-router";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { ArrowRight } from "lucide-react";
import type { Category } from "../data/products";

interface CategoryCardProps {
  category: Category;
}

export function CategoryCard({ category }: CategoryCardProps) {
  return (
    <Link
      to={`/catalogo?categoria=${category.slug}`}
      className="group relative rounded-xl overflow-hidden aspect-[4/3] block"
    >
      <ImageWithFallback
        src={category.image}
        alt={category.name}
        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-4">
        <h3 className="text-white mb-0.5" style={{ fontSize: "1.1rem", fontWeight: 600 }}>
          {category.name}
        </h3>
        <div className="flex items-center justify-between">
          <p className="text-gray-300" style={{ fontSize: "0.8rem" }}>
            {category.count} produtos
          </p>
          <div className="bg-red-600 group-hover:bg-red-500 rounded-full p-1.5 transition-colors">
            <ArrowRight className="w-3.5 h-3.5 text-white" />
          </div>
        </div>
      </div>
    </Link>
  );
}
