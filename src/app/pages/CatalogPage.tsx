import { useState, useEffect, useCallback } from "react";
import { useSearchParams, Link } from "react-router";
import { ProductCard } from "../components/ProductCard";
import type { ProdutoItem } from "../components/ProductCard";
import {
  X,
  Grid3X3,
  List,
  Home,
  Loader2,
  Package,
  Hash,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Database,
  Layers,
  Tag,
} from "lucide-react";
import * as api from "../services/api";
import { getProductMainImageUrl } from "../services/api";

const ITEMS_PER_PAGE = 24;

/** Small thumbnail for list-view rows */
function ListRowThumb({ sku }: { sku: string }) {
  const [err, setErr] = useState(false);
  if (err) {
    return (
      <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center shrink-0 hidden sm:flex">
        <Package className="w-4 h-4 text-gray-300" />
      </div>
    );
  }
  return (
    <img
      src={getProductMainImageUrl(sku)}
      alt=""
      className="w-10 h-10 rounded bg-white border border-gray-200 object-contain p-0.5 shrink-0 hidden sm:block"
      onError={() => setErr(true)}
      loading="lazy"
    />
  );
}

export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [produtos, setProdutos] = useState<ProdutoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Category info from backend response
  const [categoryName, setCategoryName] = useState<string | null>(null);
  const [categoryBreadcrumb, setCategoryBreadcrumb] = useState<string[] | null>(null);

  const searchQuery = searchParams.get("busca") || "";
  const categoriaSlug = searchParams.get("categoria") || "";

  const fetchProdutos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getCatalog(page, ITEMS_PER_PAGE, searchQuery, categoriaSlug);
      setProdutos(result.data);
      setTotalPages(result.pagination.totalPages);
      setTotal(result.pagination.total);
      setCategoryName(result.categoryName || null);
      setCategoryBreadcrumb(result.categoryBreadcrumb || null);
    } catch (e: any) {
      console.error("Erro ao buscar produtos do catalogo:", e);
      setError(e.message || "Erro ao carregar produtos.");
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, categoriaSlug]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, categoriaSlug]);

  useEffect(() => {
    fetchProdutos();
  }, [fetchProdutos]);

  const clearSearch = () => {
    const newParams = new URLSearchParams(searchParams);
    newParams.delete("busca");
    setSearchParams(newParams);
    setPage(1);
  };

  const clearCategory = () => {
    const newParams = new URLSearchParams(searchParams);
    newParams.delete("categoria");
    setSearchParams(newParams);
    setPage(1);
  };

  const clearAllFilters = () => {
    setSearchParams({});
    setPage(1);
  };

  const goToPage = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 7;
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push("...");
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (page < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  const hasFilters = !!searchQuery || !!categoriaSlug;

  // Build page title
  const pageTitle = categoriaSlug && categoryName
    ? categoryName
    : searchQuery
    ? `Resultados para "${searchQuery}"`
    : "Catalogo de Pecas";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Breadcrumb */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <nav className="flex items-center gap-2 text-gray-400 flex-wrap" style={{ fontSize: "0.8rem" }}>
            <Link to="/" className="flex items-center gap-1 hover:text-red-600 transition-colors">
              <Home className="w-3.5 h-3.5" />
              Inicio
            </Link>
            <span>/</span>
            {categoriaSlug && categoryBreadcrumb ? (
              <>
                <Link to="/catalogo" className="hover:text-red-600 transition-colors">
                  Catalogo
                </Link>
                {categoryBreadcrumb.map((crumb, idx) => (
                  <span key={idx} className="flex items-center gap-2">
                    <span>/</span>
                    {idx === categoryBreadcrumb.length - 1 ? (
                      <span className="text-gray-700 font-medium">{crumb}</span>
                    ) : (
                      <span className="text-gray-500">{crumb}</span>
                    )}
                  </span>
                ))}
              </>
            ) : (
              <span className="text-gray-700">Catalogo</span>
            )}
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {categoriaSlug ? (
                <Layers className="w-5 h-5 text-red-600" />
              ) : (
                <Database className="w-5 h-5 text-red-600" />
              )}
              <h1 className="text-gray-800" style={{ fontSize: "1.6rem", fontWeight: 800, letterSpacing: "-0.01em" }}>
                {pageTitle}
              </h1>
            </div>
            <p className="text-gray-400 mt-1" style={{ fontSize: "0.85rem" }}>
              {loading
                ? "Carregando..."
                : `${total} produto${total !== 1 ? "s" : ""} encontrado${total !== 1 ? "s" : ""}`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* View mode */}
            <div className="hidden sm:flex border border-gray-300 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-2 ${viewMode === "grid" ? "bg-red-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-2 ${viewMode === "list" ? "bg-red-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Active filters */}
        {hasFilters && (
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <span className="text-gray-500" style={{ fontSize: "0.8rem" }}>Filtros ativos:</span>

            {categoriaSlug && (
              <button
                onClick={clearCategory}
                className="flex items-center gap-1.5 bg-red-50 text-red-600 border border-red-200 px-2.5 py-1 rounded-full hover:bg-red-100 transition-colors"
                style={{ fontSize: "0.8rem" }}
              >
                <Tag className="w-3 h-3" />
                {categoryName || categoriaSlug}
                <X className="w-3 h-3" />
              </button>
            )}

            {searchQuery && (
              <button
                onClick={clearSearch}
                className="flex items-center gap-1 bg-red-50 text-red-600 border border-red-200 px-2.5 py-1 rounded-full hover:bg-red-100 transition-colors"
                style={{ fontSize: "0.8rem" }}
              >
                "{searchQuery}"
                <X className="w-3 h-3" />
              </button>
            )}

            {(searchQuery && categoriaSlug) && (
              <button
                onClick={clearAllFilters}
                className="text-gray-400 hover:text-red-600 transition-colors underline"
                style={{ fontSize: "0.8rem" }}
              >
                Limpar todos
              </button>
            )}

            {!(searchQuery && categoriaSlug) && (
              <button
                onClick={searchQuery ? clearSearch : clearCategory}
                className="text-gray-400 hover:text-red-600 transition-colors underline"
                style={{ fontSize: "0.8rem" }}
              >
                Limpar
              </button>
            )}
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-red-800 mb-1" style={{ fontSize: "1rem", fontWeight: 600 }}>
                  Erro ao carregar produtos
                </h3>
                <p className="text-red-700 mb-3" style={{ fontSize: "0.9rem" }}>{error}</p>
                <button
                  onClick={fetchProdutos}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
                  style={{ fontSize: "0.85rem" }}
                >
                  Tentar novamente
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1">
          {loading ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <Loader2 className="w-16 h-16 mx-auto text-gray-300 animate-spin mb-4" />
              <h3 className="text-gray-700 mb-2" style={{ fontSize: "1.1rem", fontWeight: 600 }}>
                Carregando produtos...
              </h3>
              <p className="text-gray-400" style={{ fontSize: "0.85rem" }}>
                Buscando dados do banco de dados
              </p>
            </div>
          ) : !error && produtos.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <Package className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <h3 className="text-gray-700 mb-2" style={{ fontSize: "1.1rem", fontWeight: 600 }}>
                Nenhum produto encontrado
              </h3>
              <p className="text-gray-400 mb-4" style={{ fontSize: "0.9rem" }}>
                {categoriaSlug && searchQuery
                  ? `Nenhum resultado para "${searchQuery}" na categoria "${categoryName || categoriaSlug}".`
                  : categoriaSlug
                  ? `Nenhum produto alocado na categoria "${categoryName || categoriaSlug}".`
                  : searchQuery
                  ? `Nenhum resultado para "${searchQuery}". Tente outro termo.`
                  : "Nenhum produto disponivel no momento."}
              </p>
              {hasFilters && (
                <div className="flex items-center justify-center gap-3">
                  {categoriaSlug && (
                    <button
                      onClick={clearCategory}
                      className="bg-white border border-gray-300 hover:border-red-300 text-gray-600 hover:text-red-600 px-5 py-2 rounded-lg transition-colors"
                      style={{ fontSize: "0.9rem" }}
                    >
                      Ver todo o catalogo
                    </button>
                  )}
                  {searchQuery && (
                    <button
                      onClick={clearSearch}
                      className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-lg transition-colors"
                      style={{ fontSize: "0.9rem" }}
                    >
                      Limpar Busca
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : !error && (
            <>
              {viewMode === "grid" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5">
                  {produtos.map((produto) => (
                    <ProductCard key={produto.sku} product={produto} />
                  ))}
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {/* Table header */}
                  <div className="hidden sm:grid grid-cols-[48px_1fr_200px] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-200">
                    <span></span>
                    <span
                      className="text-gray-500"
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Titulo da Peca
                    </span>
                    <span
                      className="text-gray-500"
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      SKU
                    </span>
                  </div>
                  {produtos.map((produto, idx) => (
                    <Link
                      key={produto.sku}
                      to={`/produto/${encodeURIComponent(produto.sku)}`}
                      className={`grid grid-cols-1 sm:grid-cols-[48px_1fr_200px] gap-2 sm:gap-4 px-5 py-3 hover:bg-red-50 transition-colors items-center ${
                        idx < produtos.length - 1 ? "border-b border-gray-100" : ""
                      }`}
                    >
                      <ListRowThumb sku={produto.sku} />
                      <div className="flex items-center gap-3">
                        <span className="text-gray-800" style={{ fontSize: "0.9rem", fontWeight: 500 }}>
                          {produto.titulo}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 sm:justify-start pl-8 sm:pl-0">
                        <Hash className="w-3.5 h-3.5 text-gray-400" />
                        <span
                          className="font-mono text-gray-500 bg-gray-50 px-2 py-0.5 rounded"
                          style={{ fontSize: "0.8rem" }}
                        >
                          {produto.sku}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <p className="text-gray-400 order-2 sm:order-1" style={{ fontSize: "0.85rem" }}>
                    Pagina {page} de {totalPages} ({total} produtos)
                  </p>
                  <div className="flex items-center gap-1 order-1 sm:order-2">
                    <button
                      onClick={() => goToPage(page - 1)}
                      disabled={page === 1}
                      className="p-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-red-50 hover:border-red-300 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    {getPageNumbers().map((p, i) =>
                      typeof p === "string" ? (
                        <span key={`ellipsis-${i}`} className="px-2 text-gray-400" style={{ fontSize: "0.85rem" }}>
                          ...
                        </span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => goToPage(p)}
                          className={`min-w-[36px] h-9 rounded-lg transition-colors ${
                            p === page
                              ? "bg-red-600 text-white"
                              : "border border-gray-300 text-gray-600 hover:bg-red-50 hover:border-red-300 hover:text-red-600"
                          }`}
                          style={{ fontSize: "0.85rem", fontWeight: p === page ? 600 : 400 }}
                        >
                          {p}
                        </button>
                      )
                    )}
                    <button
                      onClick={() => goToPage(page + 1)}
                      disabled={page === totalPages}
                      className="p-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-red-50 hover:border-red-300 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}