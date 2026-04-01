import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, Link } from "react-router";
import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left";
import Award from "lucide-react/dist/esm/icons/award";
import Package from "lucide-react/dist/esm/icons/package";
import Loader2 from "lucide-react/dist/esm/icons/loader-circle";
import AlertCircle from "lucide-react/dist/esm/icons/circle-alert";
import Filter from "lucide-react/dist/esm/icons/filter";
import ChevronLeft from "lucide-react/dist/esm/icons/chevron-left";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import * as api from "../services/api";
import type { BrandItem } from "../services/api";
import { ProductCard } from "../components/ProductCard";
import type { ProdutoItem } from "../components/ProductCard";
import { useDocumentMeta } from "../hooks/useDocumentMeta";

type ProductWithCategory = ProdutoItem & { categoryName?: string };

var PRODUCTS_PER_PAGE = 24;

export function BrandPage() {
  const { slug } = useParams<{ slug: string }>();
  const [brand, setBrand] = useState<BrandItem | null>(null);
  const [products, setProducts] = useState<ProductWithCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useDocumentMeta({
    title: brand ? brand.name + " - Carretão Auto Peças" : "Marca - Carretão Auto Peças",
    description: brand ? "Produtos da marca " + brand.name + " na Carretão Auto Peças" : "",
  });

  const loadBrand = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getBrandBySlug(slug);
      if (res.brand) {
        setBrand(res.brand);
        if (res.brand.products && res.brand.products.length > 0) {
          setProducts(res.brand.products.map(function (p) {
            return { sku: p.sku, titulo: p.titulo, categoryName: p.category || "" };
          }));
        }
      }
    } catch (e: any) {
      console.error("[BrandPage] Error:", e);
      setError(e.message || "Erro ao carregar marca.");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { loadBrand(); }, [loadBrand]);

  const categories = useMemo(() => {
    if (!products || products.length === 0) return [];
    const catMap = new Map<string, number>();
    products.forEach(p => {
      if (p.categoryName) {
        catMap.set(p.categoryName, (catMap.get(p.categoryName) || 0) + 1);
      }
    });

    const arr = Array.from(catMap.entries()).map(([name, count]) => ({
      name,
      count
    }));

    arr.sort((a, b) => b.count - a.count);
    return arr;
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (!selectedCategory) return products;
    return products.filter(p => p.categoryName === selectedCategory);
  }, [products, selectedCategory]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pagedProducts = filteredProducts.slice((safePage - 1) * PRODUCTS_PER_PAGE, safePage * PRODUCTS_PER_PAGE);

  const goToPage = (p: number) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-red-500 animate-spin mx-auto mb-3" />
          <p className="text-gray-400" style={{ fontSize: "0.85rem" }}>Carregando marca...</p>
        </div>
      </div>
    );
  }

  if (error || !brand) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-gray-700 mb-2" style={{ fontSize: "1.1rem", fontWeight: 700 }}>
            Marca não encontrada
          </h2>
          <p className="text-gray-400 mb-6" style={{ fontSize: "0.85rem" }}>
            {error || "A marca que você está procurando não existe ou foi removida."}
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-lg transition-colors"
            style={{ fontSize: "0.85rem", fontWeight: 600 }}
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao início
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh]">
      {/* Brand Header */}
      <section className="border-b border-gray-100 bg-white">
        <div className="max-w-7xl mx-auto px-4 pt-3 pb-4">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-gray-400 mb-3" style={{ fontSize: "0.75rem" }}>
            <Link to="/" className="hover:text-red-600 transition-colors">Início</Link>
            <span>/</span>
            <span className="text-gray-600 font-medium">{brand.name}</span>
          </nav>

          <div className="flex items-center gap-4">
            {/* Logo card — same style as homepage carousel */}
            <div
              className="flex items-center justify-center shrink-0 rounded-xl border border-gray-200 overflow-hidden"
              style={{ width: 130, height: 80, backgroundColor: brand.bgColor || "#ffffff" }}
            >
              {brand.logoUrl ? (
                <img
                  src={brand.logoUrl}
                  alt={brand.name}
                  className="max-w-[90px] max-h-[55px] object-contain"
                  loading="eager"
                  style={brand.logoZoom && brand.logoZoom !== 1 ? { transform: "scale(" + brand.logoZoom + ")" } : undefined}
                />
              ) : (
                <Award className="w-8 h-8 text-gray-300" />
              )}
            </div>

            <div>
              <h1 className="text-gray-800" style={{ fontSize: "1.1rem", fontWeight: 700 }}>
                {brand.name}
              </h1>
              <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.8rem" }}>
                {products.length} {products.length === 1 ? "produto" : "produtos"}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Products Grid */}
      <section className="py-8 md:py-12 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4">
          {products.length === 0 ? (
            <div className="text-center py-16">
              <Package className="w-12 h-12 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-500 mb-1" style={{ fontSize: "0.95rem", fontWeight: 600 }}>
                Nenhum produto encontrado
              </p>
              <p className="text-gray-400" style={{ fontSize: "0.82rem" }}>
                Esta marca ainda não possui produtos cadastrados.
              </p>
            </div>
          ) : (
            <div className={categories.length > 0 ? "flex flex-col lg:flex-row gap-8" : ""}>

              {/* Sidebar — only when there are categories */}
              {categories.length > 0 && (
                <aside className="w-full lg:w-56 shrink-0">
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                      <Filter className="w-4 h-4 text-gray-400" />
                      <h3 className="text-gray-700 font-semibold" style={{ fontSize: "0.82rem" }}>
                        Categorias
                      </h3>
                    </div>

                    <div className="p-2 space-y-0.5">
                      <button
                        onClick={() => { setSelectedCategory(null); setPage(1); }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors text-left ${
                          selectedCategory === null
                            ? "bg-red-50 text-red-600 font-medium"
                            : "text-gray-600 hover:bg-gray-50"
                        }`}
                        style={{ fontSize: "0.78rem" }}
                      >
                        <span>Todos</span>
                        <span className="text-gray-400 text-xs">{products.length}</span>
                      </button>

                      {categories.map(cat => (
                        <button
                          key={cat.name}
                          onClick={() => { setSelectedCategory(cat.name); setPage(1); }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors text-left ${
                            selectedCategory === cat.name
                              ? "bg-red-50 text-red-600 font-medium"
                              : "text-gray-600 hover:bg-gray-50"
                          }`}
                          style={{ fontSize: "0.78rem" }}
                        >
                          <span className="truncate pr-2">{cat.name}</span>
                          <span className={`text-xs ${
                            selectedCategory === cat.name ? "text-red-500" : "text-gray-400"
                          }`}>
                            {cat.count}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </aside>
              )}

              {/* Product grid */}
              <div className="flex-1">
                {/* Top bar: category name + page info */}
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-gray-700 font-medium" style={{ fontSize: "0.9rem" }}>
                    {selectedCategory || "Todos os Produtos"}
                    {selectedCategory && (
                      <button
                        onClick={() => { setSelectedCategory(null); setPage(1); }}
                        className="ml-2 text-red-500 hover:text-red-600 text-xs font-medium"
                      >
                        (limpar)
                      </button>
                    )}
                  </h2>
                  <span className="text-gray-400" style={{ fontSize: "0.78rem" }}>
                    {filteredProducts.length} {filteredProducts.length === 1 ? "item" : "itens"}
                    {totalPages > 1 && (" — pág. " + safePage + "/" + totalPages)}
                  </span>
                </div>

                <div className={`grid grid-cols-2 sm:grid-cols-3 ${categories.length > 0 ? "lg:grid-cols-4" : "lg:grid-cols-5"} gap-3 sm:gap-5`}>
                  {pagedProducts.map(function (product) {
                    return (
                      <ProductCard
                        key={product.sku}
                        product={product}
                      />
                    );
                  })}
                </div>

                {pagedProducts.length === 0 && selectedCategory && (
                  <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
                    <p className="text-gray-500 mb-2">Nenhum produto nesta categoria.</p>
                    <button
                      onClick={() => { setSelectedCategory(null); setPage(1); }}
                      className="text-red-500 hover:text-red-600 text-sm font-medium"
                    >
                      Limpar filtro
                    </button>
                  </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-1.5 mt-8">
                    <button
                      onClick={() => goToPage(safePage - 1)}
                      disabled={safePage <= 1}
                      className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4 text-gray-600" />
                    </button>

                    {Array.from({ length: totalPages }, function (_, i) { return i + 1; }).map(function (p) {
                      // Show first, last, and pages near current
                      if (p === 1 || p === totalPages || (p >= safePage - 2 && p <= safePage + 2)) {
                        return (
                          <button
                            key={p}
                            onClick={() => goToPage(p)}
                            className={`min-w-[36px] h-9 rounded-lg text-sm font-medium transition-colors ${
                              p === safePage
                                ? "bg-red-600 text-white"
                                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                            }`}
                          >
                            {p}
                          </button>
                        );
                      }
                      // Show ellipsis
                      if (p === safePage - 3 || p === safePage + 3) {
                        return <span key={p} className="px-1 text-gray-400 text-sm">...</span>;
                      }
                      return null;
                    })}

                    <button
                      onClick={() => goToPage(safePage + 1)}
                      disabled={safePage >= totalPages}
                      className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight className="w-4 h-4 text-gray-600" />
                    </button>
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      </section>
    </div>
  );
}