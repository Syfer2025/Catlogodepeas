import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, Link } from "react-router";
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
  ArrowUpDown,
  ChevronDown,
  Filter,
  Search,
  Sparkles,
} from "lucide-react";
import { StockBadge } from "../components/StockBadge";
import { PriceBadge } from "../components/PriceBadge";
import { seedPriceCache } from "../components/PriceBadge";
import { seedStockCache } from "../components/StockBar";
import { seedReviewStarsCache } from "../components/ReviewStars";
import * as api from "../services/api";
import type { ProductBalance, ProductPrice } from "../services/api";
import { ProductImage } from "../components/ProductImage";
import { useGA4 } from "../components/GA4Provider";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { ProductCardSkeletonGrid } from "../components/ProductCardSkeleton";
import { VirtualProductGrid } from "../components/VirtualProductGrid";
import "../utils/emptyStateAnimations";
import { JsonLdBreadcrumb } from "../components/JsonLdBreadcrumb";

const ITEMS_PER_PAGE = 48;

/** Small thumbnail for list-view rows */
function ListRowThumb({ sku }: { sku: string }) {
  return (
    <ProductImage
      sku={sku}
      alt=""
      className="w-10 h-10 rounded bg-white border border-gray-200 object-contain p-0.5 shrink-0 hidden sm:block"
      fallback={
        <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center shrink-0 hidden sm:flex">
          <Package className="w-4 h-4 text-gray-300" />
        </div>
      }
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

  // Stock balances from SIGE (loaded in bulk after products)
  const [balanceMap, setBalanceMap] = useState<Record<string, ProductBalance>>({});
  // Prices from SIGE (loaded in bulk after products)
  const [priceMap, setPriceMap] = useState<Record<string, ProductPrice>>({});
  // Review summaries (loaded in bulk after products)
  const [reviewMap, setReviewMap] = useState<Record<string, { averageRating: number; totalReviews: number }>>({});

  // ── Sort & filter state ──
  const [sortMode, setSortMode] = useState<string>("nome-asc");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [stockFilter, setStockFilter] = useState<"all" | "inStock" | "outOfStock">("all");

  const searchQuery = searchParams.get("busca") || "";
  const categoriaSlug = searchParams.get("categoria") || "";
  const { trackEvent } = useGA4();

  // ── Dynamic SEO meta tags ──
  var _catTitle = categoryName ? categoryName + " - Carretão Auto Peças" : searchQuery ? "Busca: " + searchQuery + " - Carretão Auto Peças" : "Catálogo de Peças - Carretão Auto Peças";
  var _catDesc = categoryName ? "Peças de " + categoryName + " para caminhões na Carretão Auto Peças. Confira preços e disponibilidade." : "Catálogo completo de peças para caminhões. Mais de 15.000 itens com entrega para todo o Brasil.";
  useDocumentMeta({
    title: _catTitle,
    description: _catDesc,
    ogTitle: _catTitle,
    ogDescription: _catDesc,
  });

  // All sort modes are now handled server-side
  const serverSortParam = sortMode;

  const fetchProdutos = useCallback(async () => {
    setLoading(true);
    setError(null);
    setBalanceMap({}); // Clear balance data for new page/filter
    setPriceMap({}); // Clear price data for new page/filter
    try {
      const result = await api.getCatalog(page, ITEMS_PER_PAGE, searchQuery, categoriaSlug, serverSortParam);
      setProdutos(result.data);
      setTotalPages(result.pagination.totalPages);
      setTotal(result.pagination.total);
      setCategoryName(result.categoryName || null);
      setCategoryBreadcrumb(result.categoryBreadcrumb || null);

      // GA4: track search when there's a search query
      if (searchQuery) {
        trackEvent("search", { search_term: searchQuery });
      }
    } catch (e: any) {
      console.error("Erro ao buscar produtos do catalogo:", e);
      setError(e.message || "Erro ao carregar produtos.");
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, categoriaSlug, serverSortParam, trackEvent]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, categoriaSlug]);

  useEffect(() => {
    fetchProdutos();
  }, [fetchProdutos]);

  // Bulk-load stock balances + prices after products are fetched
  useEffect(() => {
    if (produtos.length === 0) return;
    const ac = new AbortController();
    const skus = produtos.map((p) => p.sku);

    // Fetch prices and stocks in parallel (2 calls instead of N*2)
    api.getProductBalances(skus, { signal: ac.signal })
      .then((res) => {
        if (ac.signal.aborted) return;
        const map: Record<string, ProductBalance> = {};
        for (const b of (res.results || [])) { map[b.sku] = b; }
        setBalanceMap(map);
        // Seed StockBar module cache
        seedStockCache((res.results || []).map((b: any) => ({
          sku: b.sku,
          qty: b.found ? (b.disponivel ?? b.quantidade ?? 0) : null,
        })));
      })
      .catch((e) => { if (e && e.name !== "AbortError") console.error("[CatalogPage] Bulk balance error:", e); });

    api.getProductPricesBulk(skus, { signal: ac.signal })
      .then((res) => {
        if (ac.signal.aborted) return;
        const map: Record<string, ProductPrice> = {};
        for (const p of (res.results || [])) { map[p.sku] = p; }
        setPriceMap(map);
        // Seed PriceBadge module cache
        seedPriceCache((res.results || []).map((p: ProductPrice) => ({ sku: p.sku, data: p })));
      })
      .catch((e) => { if (e && e.name !== "AbortError") console.error("[CatalogPage] Bulk price error:", e); });

    // Fetch review summaries in parallel (seeds ReviewStars cache)
    api.getReviewSummariesBatch(skus, { signal: ac.signal })
      .then((res) => {
        if (ac.signal.aborted) return;
        var entries: Array<{ sku: string; averageRating: number; totalReviews: number }> = [];
        var summaries = res.summaries || {};
        for (var sk in summaries) {
          entries.push({ sku: sk, averageRating: summaries[sk].averageRating, totalReviews: summaries[sk].totalReviews });
        }
        seedReviewStarsCache(entries);
        // Build reviewMap for ALL skus (default 0/0 for products without reviews)
        var rMap: Record<string, { averageRating: number; totalReviews: number }> = {};
        for (var si = 0; si < skus.length; si++) {
          var s = skus[si];
          rMap[s] = summaries[s]
            ? { averageRating: summaries[s].averageRating, totalReviews: summaries[s].totalReviews }
            : { averageRating: 0, totalReviews: 0 };
        }
        setReviewMap(rMap);
      })
      .catch((e) => { if (e && e.name !== "AbortError") console.error("[CatalogPage] Bulk review summaries error:", e); });

    return function () { ac.abort(); };
  }, [produtos]);

  // ── Computed sorted + filtered product list ──
  // Server handles all sort modes globally across pages
  const sortedProdutos = useMemo(() => {
    var list = [...produtos];

    // Stock filter (client-side — filters within the page returned by server)
    if (stockFilter !== "all" && Object.keys(balanceMap).length > 0) {
      list = list.filter(function (p) {
        var bal = balanceMap[p.sku];
        if (!bal || !bal.found) return stockFilter === "all";
        var qty = bal.disponivel ?? bal.quantidade ?? 0;
        return stockFilter === "inStock" ? qty > 0 : qty <= 0;
      });
    }

    return list;
  }, [produtos, stockFilter, balanceMap]);

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
      // Scroll to top — use both methods for mobile compatibility
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
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
    : "Catálogo de Peças";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Breadcrumb */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <nav className="flex items-center gap-2 text-gray-400 flex-wrap" style={{ fontSize: "0.8rem" }}>
            <Link to="/" className="flex items-center gap-1 hover:text-red-600 transition-colors">
              <Home className="w-3.5 h-3.5" />
              Início
            </Link>
            <span>/</span>
            {categoriaSlug && categoryBreadcrumb ? (
              <>
                <Link to="/catalogo" className="hover:text-red-600 transition-colors">
                  Catálogo
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
              <span className="text-gray-700">Catálogo</span>
            )}
          </nav>
        </div>
      </div>
      {/* JSON-LD BreadcrumbList for Google rich results */}
      <JsonLdBreadcrumb items={
        categoriaSlug && categoryBreadcrumb
          ? [{ name: "Início", url: "/" }, { name: "Catálogo", url: "/catalogo" }].concat(
              categoryBreadcrumb.map(function (crumb, idx) {
                return { name: crumb, url: idx === categoryBreadcrumb.length - 1 ? undefined : undefined };
              })
            )
          : [{ name: "Início", url: "/" }, { name: "Catálogo" }]
      } />

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

          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            {/* Sort dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowSortMenu(!showSortMenu)}
                className="flex items-center gap-1.5 bg-white border border-gray-300 hover:border-red-300 px-3 py-2 rounded-lg text-gray-600 hover:text-red-600 transition-colors"
                style={{ fontSize: "0.82rem" }}
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Ordenar:</span>
                <span className="font-medium">
                  {sortMode === "nome-asc" ? "A-Z" : sortMode === "nome-desc" ? "Z-A" : sortMode === "preco-asc" ? "Menor preço" : sortMode === "preco-desc" ? "Maior preço" : sortMode === "sku-asc" ? "SKU" : sortMode === "estoque" ? "Estoque" : "Nome"}
                </span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {showSortMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowSortMenu(false)} />
                  <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 min-w-[180px]">
                    {[
                      { value: "nome-asc", label: "Nome A-Z" },
                      { value: "nome-desc", label: "Nome Z-A" },
                      { value: "sku-asc", label: "Código (SKU)" },
                      { value: "preco-asc", label: "Menor preço" },
                      { value: "preco-desc", label: "Maior preço" },
                      { value: "estoque", label: "Maior estoque" },
                    ].map(function (opt) {
                      return (
                        <button
                          key={opt.value}
                          onClick={function () {
                            setSortMode(opt.value);
                            setShowSortMenu(false);
                            // All sorts are server-side, always reset to page 1
                            setPage(1);
                          }}
                          className={"w-full text-left px-4 py-2 hover:bg-red-50 transition-colors " + (sortMode === opt.value ? "text-red-600 font-semibold bg-red-50/50" : "text-gray-700")}
                          style={{ fontSize: "0.82rem" }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Stock filter */}
            <div className="flex border border-gray-300 rounded-lg overflow-hidden bg-white">
              <button
                onClick={() => setStockFilter("all")}
                className={"px-2.5 py-2 transition-colors " + (stockFilter === "all" ? "bg-red-600 text-white" : "text-gray-500 hover:bg-gray-50")}
                style={{ fontSize: "0.75rem", fontWeight: 600 }}
                title="Todos"
              >
                Todos
              </button>
              <button
                onClick={() => setStockFilter("inStock")}
                className={"px-2.5 py-2 transition-colors border-l border-gray-300 " + (stockFilter === "inStock" ? "bg-green-600 text-white" : "text-gray-500 hover:bg-gray-50")}
                style={{ fontSize: "0.75rem", fontWeight: 600 }}
                title="Em estoque"
              >
                Em estoque
              </button>
            </div>

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
            <ProductCardSkeletonGrid count={24} gridClass="grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4" />
          ) : !error && sortedProdutos.length === 0 && produtos.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center flex flex-col items-center">
              {/* Animated search illustration */}
              <div className="relative mb-6">
                <div
                  className="w-28 h-28 rounded-full border-2 border-dashed border-gray-200 flex items-center justify-center"
                  style={{ animation: "es-spin 20s linear infinite" }}
                >
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-gray-50 to-red-50 flex items-center justify-center">
                    <Search
                      className="w-9 h-9 text-gray-300"
                      style={{ animation: "es-shake 2s ease-in-out 1s both" }}
                    />
                  </div>
                </div>
                <Sparkles
                  className="w-4 h-4 text-red-300 absolute -top-1 right-0"
                  style={{ animation: "es-twinkle 2s ease-in-out infinite" }}
                />
                <Sparkles
                  className="w-3 h-3 text-amber-300 absolute bottom-2 -left-2"
                  style={{ animation: "es-twinkle 2s ease-in-out 0.7s infinite" }}
                />
              </div>
              <h3 className="text-gray-800 mb-1" style={{ fontSize: "1.1rem", fontWeight: 700 }}>
                Nenhum produto encontrado
              </h3>
              <p className="text-gray-400 mb-6 max-w-xs" style={{ fontSize: "0.9rem", lineHeight: 1.5 }}>
                {categoriaSlug && searchQuery
                  ? "Nenhum resultado para \"" + searchQuery + "\" na categoria \"" + (categoryName || categoriaSlug) + "\"."
                  : categoriaSlug
                  ? "Nenhum produto alocado na categoria \"" + (categoryName || categoriaSlug) + "\"."
                  : searchQuery
                  ? "Nenhum resultado para \"" + searchQuery + "\". Tente outro termo."
                  : "Nenhum produto disponível no momento."}
              </p>
              {hasFilters && (
                <div
                  className="flex flex-col sm:flex-row items-center justify-center gap-3"
                  style={{ animation: "es-fade-up 0.5s ease both 0.3s" }}
                >
                  {categoriaSlug && (
                    <button
                      onClick={clearCategory}
                      className="bg-white border border-gray-300 hover:border-red-300 text-gray-600 hover:text-red-600 px-5 py-2.5 rounded-xl transition-all hover:-translate-y-0.5"
                      style={{ fontSize: "0.9rem", fontWeight: 500 }}
                    >
                      Ver todo o catálogo
                    </button>
                  )}
                  {searchQuery && (
                    <button
                      onClick={clearSearch}
                      className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-red-200/50 hover:-translate-y-0.5"
                      style={{ fontSize: "0.9rem", fontWeight: 600 }}
                    >
                      Limpar Busca
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : !error && (
            <>
              {/* Active sort/filter info bar */}
              {stockFilter !== "all" && (
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <span className="flex items-center gap-1.5 bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-full" style={{ fontSize: "0.78rem" }}>
                    <Filter className="w-3 h-3" />
                    {stockFilter === "inStock" ? "Em estoque" : "Sem estoque"}
                    <button onClick={() => setStockFilter("all")} className="hover:text-green-900">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                </div>
              )}

              {/* No results after filtering */}
              {sortedProdutos.length === 0 && produtos.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-10 text-center flex flex-col items-center mb-6">
                  <div className="relative mb-5">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-gray-50 to-amber-50 flex items-center justify-center">
                      <Filter className="w-7 h-7 text-gray-300" style={{ animation: "es-float 3s ease-in-out infinite" }} />
                    </div>
                    <Sparkles className="w-3 h-3 text-amber-300 absolute -top-1 right-0" style={{ animation: "es-twinkle 2s ease-in-out infinite" }} />
                  </div>
                  <p className="text-gray-500 mb-1" style={{ fontSize: "0.95rem", fontWeight: 600 }}>
                    Nenhum produto neste filtro
                  </p>
                  <p className="text-gray-400 mb-4 max-w-[260px]" style={{ fontSize: "0.82rem", lineHeight: 1.5 }}>
                    Nenhum produto corresponde ao filtro selecionado nesta página.
                  </p>
                  <button
                    onClick={() => setStockFilter("all")}
                    className="text-red-600 hover:text-red-700 transition-colors inline-flex items-center gap-1.5"
                    style={{ fontSize: "0.85rem", fontWeight: 600 }}
                  >
                    <X className="w-3.5 h-3.5" />
                    Limpar filtro de estoque
                  </button>
                </div>
              )}

              {sortedProdutos.length > 0 && viewMode === "grid" ? (
                <VirtualProductGrid
                  products={sortedProdutos}
                  balanceMap={balanceMap}
                  priceMap={priceMap}
                  reviewMap={reviewMap}
                  gridClass="grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4"
                />
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {/* Table header */}
                  <div className="hidden sm:grid grid-cols-[48px_1fr_160px_120px_100px] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-200">
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
                      Título da Peça
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
                    <span
                      className="text-gray-500"
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Preço
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
                      Estoque
                    </span>
                  </div>
                  {produtos.map((produto, idx) => (
                    <Link
                      key={produto.sku}
                      to={`/produto/${encodeURIComponent(produto.sku)}`}
                      className={`grid grid-cols-1 sm:grid-cols-[48px_1fr_160px_120px_100px] gap-2 sm:gap-4 px-5 py-3 hover:bg-red-50 transition-colors items-center ${
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
                      <div className="pl-8 sm:pl-0" onClick={(e) => e.preventDefault()}>
                        <PriceBadge sku={produto.sku} variant="compact" preloaded={priceMap[produto.sku]} />
                      </div>
                      <div className="pl-8 sm:pl-0" onClick={(e) => e.preventDefault()}>
                        <StockBadge sku={produto.sku} variant="compact" preloaded={balanceMap[produto.sku]} />
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <p className="text-gray-400 order-2 sm:order-1" style={{ fontSize: "0.85rem" }}>
                    Página {page} de {totalPages} ({total} produtos)
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