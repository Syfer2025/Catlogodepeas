import React, { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router";
import { ArrowLeft, Award, Package, Loader2, AlertCircle } from "lucide-react";
import * as api from "../services/api";
import type { BrandItem } from "../services/api";
import { ProductCard } from "../components/ProductCard";
import type { ProdutoItem } from "../components/ProductCard";
import { useDocumentMeta } from "../hooks/useDocumentMeta";

export function BrandPage() {
  const { slug } = useParams<{ slug: string }>();
  const [brand, setBrand] = useState<BrandItem | null>(null);
  const [products, setProducts] = useState<ProdutoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        // Load products from SIGE by SKU
        if (res.brand.products && res.brand.products.length > 0) {
          setProductsLoading(true);
          const skus = res.brand.products.map(function (p) { return p.sku; });
          try {
            const prodResults: ProdutoItem[] = [];
            // Fetch products in batches of 10
            for (var i = 0; i < skus.length; i += 10) {
              var batch = skus.slice(i, i + 10);
              var batchPromises = batch.map(function (sku) {
                return api.getProductDetail(sku)
                  .then(function (detail) {
                    if (detail && detail.produto) {
                      return detail.produto as ProdutoItem;
                    }
                    return null;
                  })
                  .catch(function () { return null; });
              });
              var batchResults = await Promise.all(batchPromises);
              for (var j = 0; j < batchResults.length; j++) {
                if (batchResults[j]) prodResults.push(batchResults[j]!);
              }
            }
            setProducts(prodResults);
          } catch (e) {
            console.error("[BrandPage] Error loading products:", e);
          } finally {
            setProductsLoading(false);
          }
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
      <section
        className="relative overflow-hidden"
        style={{ backgroundColor: brand.bgColor || "#f8f8f8" }}
      >
        <div className="max-w-7xl mx-auto px-4 py-8 md:py-12">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* Logo */}
            <div
              className="w-32 h-32 sm:w-40 sm:h-40 rounded-2xl bg-white flex items-center justify-center shrink-0 p-4"
              style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}
            >
              {brand.logoUrl ? (
                <img
                  src={brand.logoUrl}
                  alt={brand.name}
                  className="max-w-full max-h-full object-contain"
                  style={brand.logoZoom && brand.logoZoom !== 1 ? { transform: "scale(" + brand.logoZoom + ")" } : undefined}
                />
              ) : (
                <Award className="w-12 h-12 text-gray-300" />
              )}
            </div>

            {/* Info */}
            <div className="text-center sm:text-left">
              <h1
                className="text-gray-800 mb-2"
                style={{ fontSize: "clamp(1.4rem, 3vw, 2rem)", fontWeight: 800, letterSpacing: "-0.01em" }}
              >
                {brand.name}
              </h1>
              <p className="text-gray-500" style={{ fontSize: "0.9rem" }}>
                {brand.products.length} {brand.products.length === 1 ? "produto" : "produtos"} disponíveis
              </p>
            </div>
          </div>
        </div>

        {/* Breadcrumb */}
        <div className="max-w-7xl mx-auto px-4 pb-4">
          <nav className="flex items-center gap-1.5 text-gray-400" style={{ fontSize: "0.75rem" }}>
            <Link to="/" className="hover:text-red-600 transition-colors">Início</Link>
            <span>/</span>
            <span className="text-gray-600 font-medium">{brand.name}</span>
          </nav>
        </div>
      </section>

      {/* Products Grid */}
      <section className="py-8 md:py-12 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4">
          {productsLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <Loader2 className="w-7 h-7 text-red-500 animate-spin mx-auto mb-3" />
                <p className="text-gray-400" style={{ fontSize: "0.82rem" }}>
                  Carregando produtos...
                </p>
              </div>
            </div>
          ) : products.length === 0 ? (
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
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-5">
              {products.map(function (product) {
                return (
                  <ProductCard
                    key={product.sku}
                    product={product}
                  />
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}