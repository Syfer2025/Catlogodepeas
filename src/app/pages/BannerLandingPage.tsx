import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { AlertTriangle, ArrowLeft, Home, Loader2, Sparkles } from "lucide-react";
import type { ProdutoItem } from "../components/ProductCard";
import { ProductCardSkeletonGrid } from "../components/ProductCardSkeleton";
import { VirtualProductGrid } from "../components/VirtualProductGrid";
import { JsonLdBreadcrumb } from "../components/JsonLdBreadcrumb";
import { useGA4 } from "../components/GA4Provider";
import { useMarketing } from "../components/MarketingPixels";
import { seedPriceCache } from "../components/PriceBadge";
import { seedReviewStarsCache } from "../components/ReviewStars";
import { seedStockCache } from "../components/StockBar";
import { useHomepageInit } from "../contexts/HomepageInitContext";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import * as api from "../services/api";
import type { ProductBalance, ProductMeta, ProductPrice } from "../services/api";

export function BannerLandingPage() {
  const { bannerId } = useParams<{ bannerId: string }>();
  const { data: initData, loading: initLoading } = useHomepageInit();
  const { trackEvent } = useGA4();
  const { trackMetaEvent } = useMarketing();

  const [products, setProducts] = useState<ProdutoItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingSkus, setMissingSkus] = useState<string[]>([]);
  const [balanceMap, setBalanceMap] = useState<Record<string, ProductBalance>>({});
  const [priceMap, setPriceMap] = useState<Record<string, ProductPrice>>({});
  const [reviewMap, setReviewMap] = useState<Record<string, { averageRating: number; totalReviews: number }>>({});
  const [metaMap, setMetaMap] = useState<Record<string, ProductMeta>>({});

  const banner = useMemo(() => {
    return (initData?.banners || []).find((item) => item.id === bannerId && item.customPageEnabled);
  }, [initData, bannerId]);

  const selectedSkus = banner?.selectedProductSkus || [];
  const selectedSkuKey = selectedSkus.join("|");

  const pageTitle = banner?.title || "Vitrine Especial";
  const pageDescription = banner?.subtitle
    || "Seleção especial de produtos da Carretão Auto Peças.";

  useDocumentMeta({
    title: pageTitle + " - Carretão Auto Peças",
    description: pageDescription,
    ogTitle: pageTitle + " - Carretão Auto Peças",
    ogDescription: pageDescription,
  });

  useEffect(() => {
    if (initLoading) return;
    if (!bannerId) {
      setError("Banner não encontrado.");
      setLoadingProducts(false);
      return;
    }
    if (!banner || selectedSkus.length === 0) {
      setProducts([]);
      setMissingSkus([]);
      setError("Essa vitrine não está disponível no momento.");
      setLoadingProducts(false);
      return;
    }

    var cancelled = false;
    setLoadingProducts(true);
    setError(null);

    api.getProductsBasicBulk(selectedSkus)
      .then((result) => {
        if (cancelled) return;
        setProducts(result.products || []);
        setMissingSkus(result.missingSkus || []);
        if (!result.products || result.products.length === 0) {
          setError("Nenhum produto disponível foi encontrado para este banner.");
        }
      })
      .catch((e: any) => {
        if (cancelled) return;
        console.error("[BannerLandingPage] Error loading curated products:", e);
        setProducts([]);
        setMissingSkus([]);
        setError(e.message || "Erro ao carregar a vitrine do banner.");
      })
      .finally(() => {
        if (!cancelled) setLoadingProducts(false);
      });

    return () => {
      cancelled = true;
    };
  }, [initLoading, bannerId, banner, selectedSkuKey]);

  useEffect(() => {
    if (products.length === 0) {
      setBalanceMap({});
      setPriceMap({});
      setReviewMap({});
      setMetaMap({});
      return;
    }

    const abortController = new AbortController();
    const skus = products.map((product) => product.sku);

    api.getProductBalances(skus, { signal: abortController.signal })
      .then((result) => {
        if (abortController.signal.aborted) return;
        const nextMap: Record<string, ProductBalance> = {};
        for (const balance of result.results || []) nextMap[balance.sku] = balance;
        setBalanceMap(nextMap);
        seedStockCache((result.results || []).map((balance: any) => ({
          sku: balance.sku,
          qty: balance.found ? (balance.disponivel ?? balance.quantidade ?? 0) : null,
        })));
      })
      .catch((e) => {
        if (e && e.name !== "AbortError") console.error("[BannerLandingPage] Bulk balance error:", e);
      });

    api.getProductPricesBulkSafe(skus, { signal: abortController.signal })
      .then((result) => {
        if (abortController.signal.aborted) return;
        const nextMap: Record<string, ProductPrice> = {};
        for (const price of result.results || []) nextMap[price.sku] = price;
        setPriceMap(nextMap);
        seedPriceCache((result.results || []).map((price) => ({ sku: price.sku, data: price })));
      })
      .catch((e) => {
        if (e && e.name !== "AbortError") console.error("[BannerLandingPage] Bulk price error:", e);
      });

    api.getReviewSummariesBatch(skus, { signal: abortController.signal })
      .then((result) => {
        if (abortController.signal.aborted) return;
        const summaries = result.summaries || {};
        const seededEntries: Array<{ sku: string; averageRating: number; totalReviews: number }> = [];
        const nextMap: Record<string, { averageRating: number; totalReviews: number }> = {};

        for (const sku of skus) {
          if (summaries[sku]) {
            seededEntries.push({
              sku,
              averageRating: summaries[sku].averageRating,
              totalReviews: summaries[sku].totalReviews,
            });
            nextMap[sku] = {
              averageRating: summaries[sku].averageRating,
              totalReviews: summaries[sku].totalReviews,
            };
          } else {
            nextMap[sku] = { averageRating: 0, totalReviews: 0 };
          }
        }

        seedReviewStarsCache(seededEntries);
        setReviewMap(nextMap);
      })
      .catch((e) => {
        if (e && e.name !== "AbortError") console.error("[BannerLandingPage] Bulk review error:", e);
      });

    api.getProductMetaBulk(skus)
      .then((result) => {
        if (abortController.signal.aborted) return;
        const nextMap: Record<string, ProductMeta> = {};
        for (const sku of skus) {
          if (result[sku]) nextMap[sku] = { ...result[sku], sellable: result[sku].sellable === true };
          else nextMap[sku] = { sellable: false };
        }
        setMetaMap(nextMap);
      })
      .catch((e) => {
        if (e && e.name !== "AbortError") console.error("[BannerLandingPage] Bulk meta error:", e);
      });

    return () => {
      abortController.abort();
    };
  }, [products]);

  useEffect(() => {
    if (!banner || products.length === 0) return;

    const items = products.slice(0, 10).map((product, index) => ({
      item_id: product.sku,
      item_name: product.titulo,
      index,
    }));

    trackEvent("view_item_list", {
      item_list_id: banner.id,
      item_list_name: banner.title || "Vitrine do banner",
      items,
    });
    trackMetaEvent("ViewContent", {
      content_type: "product_group",
      content_category: banner.title || "Vitrine do banner",
    });
  }, [banner, products, trackEvent, trackMetaEvent]);

  const isLoading = initLoading || loadingProducts;

  if (!isLoading && (!bannerId || !banner)) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md text-center bg-white border border-gray-200 rounded-2xl p-8">
          <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h1 className="text-gray-800 mb-2" style={{ fontSize: "1.2rem", fontWeight: 700 }}>
            Vitrine não encontrada
          </h1>
          <p className="text-gray-500 mb-6" style={{ fontSize: "0.9rem", lineHeight: 1.6 }}>
            Esse banner não possui uma subpágina ativa ou foi removido da homepage.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-lg transition-colors"
              style={{ fontSize: "0.85rem", fontWeight: 600 }}
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar para a home
            </Link>
            <Link
              to="/catalogo"
              className="inline-flex items-center justify-center gap-2 border border-gray-300 text-gray-600 hover:border-red-300 hover:text-red-600 px-5 py-2.5 rounded-lg transition-colors"
              style={{ fontSize: "0.85rem", fontWeight: 600 }}
            >
              Ver catálogo
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <nav className="flex items-center gap-2 text-gray-400 flex-wrap" style={{ fontSize: "0.8rem" }}>
            <Link to="/" className="flex items-center gap-1 hover:text-red-600 transition-colors">
              <Home className="w-3.5 h-3.5" />
              Início
            </Link>
            <span>/</span>
            <span className="text-gray-700 font-medium">{pageTitle}</span>
          </nav>
        </div>
      </div>

      <JsonLdBreadcrumb items={[{ name: "Início", url: "/" }, { name: pageTitle }]} />

      <section className="relative overflow-hidden bg-gray-900">
        {banner?.imageUrl && (
          <img
            src={banner.imageUrl}
            alt={banner.title || "Banner"}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/65 to-black/35" />
        <div className="relative max-w-7xl mx-auto px-4 py-10 sm:py-14 lg:py-16">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-white/80 hover:text-white transition-colors mb-5"
            style={{ fontSize: "0.82rem", fontWeight: 600 }}
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar para a home
          </Link>

          <div className="max-w-3xl">
            <span
              className="inline-flex items-center gap-2 bg-white/10 border border-white/15 text-white px-3 py-1 rounded-full mb-4"
              style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Vitrine Curada
            </span>

            <h1 className="text-white" style={{ fontSize: "clamp(1.8rem, 4vw, 3.2rem)", fontWeight: 800, lineHeight: 1.08 }}>
              {pageTitle}
            </h1>

            {banner?.subtitle && (
              <p className="text-white/80 mt-4 max-w-2xl" style={{ fontSize: "clamp(0.92rem, 1.8vw, 1.05rem)", lineHeight: 1.7 }}>
                {banner.subtitle}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3 mt-6">
              <span className="bg-white text-gray-900 px-4 py-2 rounded-full" style={{ fontSize: "0.82rem", fontWeight: 700 }}>
                {products.length} produto{products.length === 1 ? "" : "s"}
              </span>
              <Link
                to="/catalogo"
                className="inline-flex items-center gap-2 border border-white/25 text-white hover:bg-white/10 px-4 py-2 rounded-full transition-colors"
                style={{ fontSize: "0.82rem", fontWeight: 600 }}
              >
                Ver catálogo completo
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 py-8 sm:py-10">
        {missingSkus.length > 0 && !error && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
            <p className="text-amber-800" style={{ fontSize: "0.82rem", lineHeight: 1.6 }}>
              Alguns produtos dessa vitrine ficaram indisponíveis e foram ocultados automaticamente.
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 mb-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-red-800 mb-1" style={{ fontSize: "0.95rem", fontWeight: 700 }}>
                  Não foi possível montar esta vitrine
                </h2>
                <p className="text-red-700" style={{ fontSize: "0.85rem", lineHeight: 1.6 }}>
                  {error}
                </p>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <ProductCardSkeletonGrid count={8} gridClass="grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4" />
        ) : products.length > 0 ? (
          <VirtualProductGrid
            products={products}
            balanceMap={balanceMap}
            priceMap={priceMap}
            reviewMap={reviewMap}
            metaMap={metaMap}
            gridClass="grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4"
          />
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center">
            <Loader2 className="w-8 h-8 text-gray-300 mx-auto mb-4" />
            <h2 className="text-gray-800 mb-2" style={{ fontSize: "1rem", fontWeight: 700 }}>
              Nenhum produto disponível nesta vitrine
            </h2>
            <p className="text-gray-500 mb-6" style={{ fontSize: "0.88rem", lineHeight: 1.6 }}>
              Os itens selecionados para este banner estão temporariamente indisponíveis ou foram removidos.
            </p>
            <Link
              to="/catalogo"
              className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-lg transition-colors"
              style={{ fontSize: "0.85rem", fontWeight: 600 }}
            >
              Ver catálogo completo
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}