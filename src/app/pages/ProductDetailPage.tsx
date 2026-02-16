import { useParams, Link } from "react-router";
import {
  Home,
  ArrowLeft,
  Package,
  Hash,
  Loader2,
  ChevronLeft,
  ChevronRight,
  X,
  Tag,
  Info,
  MessageCircle,
  Copy,
  Check,
} from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import * as api from "../services/api";
import type { ProductImage } from "../services/api";
import { ProductCard } from "../components/ProductCard";
import type { ProdutoItem } from "../components/ProductCard";

export function ProductDetailPage() {
  const { id } = useParams();
  const sku = id ? decodeURIComponent(id) : "";
  const [product, setProduct] = useState<ProdutoItem | null>(null);
  const [related, setRelated] = useState<ProdutoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Image gallery state
  const [images, setImages] = useState<ProductImage[]>([]);
  const [imagesLoading, setImagesLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [mainImgError, setMainImgError] = useState(false);

  // Zoom state
  const [isZooming, setIsZooming] = useState(false);
  const [zoomOrigin, setZoomOrigin] = useState({ x: 50, y: 50 });
  const mainImageRef = useRef<HTMLDivElement>(null);
  const thumbnailsRef = useRef<HTMLDivElement>(null);

  // Attributes state
  const [attributes, setAttributes] = useState<Record<string, string | string[]> | null>(null);
  const [attrsLoading, setAttrsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setNotFound(false);
      setImages([]);
      setActiveIndex(0);
      setMainImgError(false);
      setAttributes(null);
      try {
        const [skuResult, relatedResult] = await Promise.all([
          api.getProdutoBySku(sku),
          api.getCatalog(1, 5),
        ]);

        if (skuResult.data.length > 0) {
          // Check if product is visible via meta
          try {
            const meta = await api.getProductMeta(sku);
            if (meta.visible === false) {
              setNotFound(true);
              setLoading(false);
              return;
            }
          } catch {
            // If meta fetch fails, assume visible (default)
          }
          setProduct(skuResult.data[0]);
        } else {
          setNotFound(true);
        }

        setRelated(relatedResult.data.filter((p) => p.sku !== sku).slice(0, 4));
      } catch (e) {
        console.error("Erro ao carregar produto:", e);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [sku]);

  // Load images
  useEffect(() => {
    if (!sku || notFound) return;
    setImagesLoading(true);
    api
      .getProductImages(sku)
      .then((res) => {
        setImages(res.images || []);
        setActiveIndex(0);
      })
      .catch((e) => {
        console.error("Erro ao carregar imagens:", e);
        setImages([]);
      })
      .finally(() => setImagesLoading(false));
  }, [sku, notFound]);

  // Load attributes
  useEffect(() => {
    if (!sku || notFound) return;
    setAttrsLoading(true);
    api
      .getProductAttributes(sku)
      .then((res) => {
        setAttributes(res.found ? res.attributes : null);
      })
      .catch((e) => {
        console.error("Erro ao carregar atributos:", e);
        setAttributes(null);
      })
      .finally(() => setAttrsLoading(false));
  }, [sku, notFound]);

  const goToPrev = useCallback(() => {
    setActiveIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
    setMainImgError(false);
    setIsZooming(false);
  }, [images.length]);

  const goToNext = useCallback(() => {
    setActiveIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
    setMainImgError(false);
    setIsZooming(false);
  }, [images.length]);

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (!lightboxOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goToPrev();
      else if (e.key === "ArrowRight") goToNext();
      else if (e.key === "Escape") setLightboxOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxOpen, goToPrev, goToNext]);

  // Auto-scroll thumbnails to keep active one visible
  useEffect(() => {
    const container = thumbnailsRef.current;
    if (!container) return;
    const activeThumb = container.children[activeIndex] as HTMLElement | undefined;
    if (!activeThumb) return;
    const thumbLeft = activeThumb.offsetLeft;
    const thumbWidth = activeThumb.offsetWidth;
    const containerWidth = container.clientWidth;
    const scrollTarget = thumbLeft - containerWidth / 2 + thumbWidth / 2;
    container.scrollTo({ left: scrollTarget, behavior: "smooth" });
  }, [activeIndex]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-red-600 animate-spin" />
      </div>
    );
  }

  if (notFound || !product) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Package className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h2 className="text-gray-700 mb-4" style={{ fontSize: "1.5rem", fontWeight: 600 }}>
            Produto nao encontrado
          </h2>
          <p className="text-gray-400 mb-6" style={{ fontSize: "0.9rem" }}>
            O SKU <code className="bg-gray-100 px-2 py-0.5 rounded font-mono">{sku}</code> nao foi localizado.
          </p>
          <Link
            to="/catalogo"
            className="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors inline-flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao Catalogo
          </Link>
        </div>
      </div>
    );
  }

  const activeImage = images[activeIndex] || null;
  const hasImages = images.length > 0;
  const attrEntries = attributes ? Object.entries(attributes) : [];

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
            <Link to="/catalogo" className="hover:text-red-600 transition-colors">
              Catalogo
            </Link>
            <span>/</span>
            <span className="text-gray-600 truncate max-w-[250px]">{product.titulo}</span>
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Product Details — dual scroll: images sticky, info scrolls */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10 items-start">
          {/* Image Gallery — sticky on desktop */}
          <div className="lg:sticky lg:top-[130px] lg:self-start">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Main image */}
              <div className="group/gallery relative flex items-center justify-center min-h-[300px] lg:min-h-[450px] p-4">
                {imagesLoading ? (
                  <Loader2 className="w-10 h-10 text-gray-300 animate-spin" />
                ) : hasImages && !mainImgError ? (
                  <>
                    <div
                      ref={mainImageRef}
                      className="relative w-full h-full flex items-center justify-center overflow-hidden cursor-zoom-in bg-white rounded-lg"
                      style={{ minHeight: "280px" }}
                      onMouseEnter={() => setIsZooming(true)}
                      onMouseLeave={() => setIsZooming(false)}
                      onMouseMove={(e) => {
                        if (!mainImageRef.current) return;
                        const rect = mainImageRef.current.getBoundingClientRect();
                        const x = ((e.clientX - rect.left) / rect.width) * 100;
                        const y = ((e.clientY - rect.top) / rect.height) * 100;
                        setZoomOrigin({ x, y });
                      }}
                      onClick={() => setLightboxOpen(true)}
                    >
                      <img
                        src={activeImage!.url}
                        alt={`${product.titulo} - Imagem ${activeImage!.number}`}
                        className="max-w-full max-h-[420px] object-contain transition-transform duration-200 ease-out pointer-events-none select-none"
                        style={{
                          transform: isZooming ? "scale(2.5)" : "scale(1)",
                          transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`,
                        }}
                        onError={() => setMainImgError(true)}
                      />
                    </div>
                    {images.length > 1 && (
                      <>
                        <button
                          onClick={goToPrev}
                          className="absolute left-0 top-1/2 -translate-y-1/2 w-10 h-20 flex items-center justify-center bg-gradient-to-r from-black/5 to-transparent hover:from-black/15 text-gray-400 hover:text-red-600 transition-all duration-200 opacity-0 group-hover/gallery:opacity-100 rounded-r-xl"
                          aria-label="Imagem anterior"
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button
                          onClick={goToNext}
                          className="absolute right-0 top-1/2 -translate-y-1/2 w-10 h-20 flex items-center justify-center bg-gradient-to-l from-black/5 to-transparent hover:from-black/15 text-gray-400 hover:text-red-600 transition-all duration-200 opacity-0 group-hover/gallery:opacity-100 rounded-l-xl"
                          aria-label="Proxima imagem"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </button>
                      </>
                    )}
                    {images.length > 1 && (
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                        {images.map((_, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              setActiveIndex(idx);
                              setMainImgError(false);
                            }}
                            className={`rounded-full transition-all duration-200 ${
                              idx === activeIndex
                                ? "w-6 h-2 bg-red-500"
                                : "w-2 h-2 bg-gray-300 hover:bg-gray-400"
                            }`}
                            aria-label={`Ir para imagem ${idx + 1}`}
                          />
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center">
                    <Package className="w-24 h-24 text-gray-200 mx-auto mb-4" />
                    <p className="text-gray-400" style={{ fontSize: "0.85rem" }}>
                      Peca automotiva
                    </p>
                  </div>
                )}
              </div>

              {/* Thumbnails with navigation arrows */}
              {hasImages && images.length > 1 && (
                <div className="px-2 pb-4">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={goToPrev}
                      className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      aria-label="Miniatura anterior"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div
                      className="flex-1 flex gap-2 overflow-x-auto hide-scrollbar"
                      ref={thumbnailsRef}
                      style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                    >
                      {images.map((img, idx) => (
                        <button
                          key={img.name}
                          onClick={() => {
                            setActiveIndex(idx);
                            setMainImgError(false);
                          }}
                          className={`shrink-0 w-16 h-16 rounded-lg border-2 overflow-hidden transition-all duration-200 ${
                            idx === activeIndex
                              ? "border-red-500 shadow-md ring-1 ring-red-300"
                              : "border-gray-200 hover:border-red-300 opacity-70 hover:opacity-100"
                          }`}
                        >
                          <img
                            src={img.url}
                            alt={`Miniatura ${img.number}`}
                            className="w-full h-full object-contain p-1 bg-white"
                            loading="lazy"
                          />
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={goToNext}
                      className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      aria-label="Proxima miniatura"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Info + Attributes — scrolls freely */}
          <div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden p-6 lg:p-8 flex flex-col">
              {/* SKU badge + actions */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Hash className="w-4 h-4 text-gray-400" />
                  <span
                    className="font-mono bg-gray-100 text-gray-600 px-3 py-1 rounded-lg"
                    style={{ fontSize: "0.8rem" }}
                  >
                    SKU: {product.sku}
                  </span>
                </div>
                <button
                  onClick={() => {
                    const url = window.location.href;
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                      navigator.clipboard.writeText(url).catch(() => {
                        fallbackCopy(url);
                      });
                    } else {
                      fallbackCopy(url);
                    }
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="flex items-center gap-1.5 text-gray-400 hover:text-red-600 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
                  title="Copiar link"
                  style={{ fontSize: "0.75rem" }}
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copiado!" : "Compartilhar"}
                </button>
              </div>

              {/* Title */}
              <h1 className="text-gray-800 mb-4" style={{ fontSize: "1.5rem", fontWeight: 700, lineHeight: 1.3 }}>
                {product.titulo}
              </h1>

              {/* WhatsApp CTA */}
              <a
                href={`https://wa.me/5544997330202?text=${encodeURIComponent(`Olá! Gostaria de informações sobre a peça:\n\n📦 ${product.titulo}\n🔖 SKU: ${product.sku}\n\n${window.location.href}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 bg-green-50 hover:bg-green-100 border border-green-200 rounded-xl px-4 py-3 mb-5 transition-all group"
              >
                <div className="bg-green-500 rounded-full p-2 shrink-0 group-hover:scale-105 transition-transform">
                  <MessageCircle className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-green-800" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                    Consultar disponibilidade
                  </p>
                  <p className="text-green-600" style={{ fontSize: "0.72rem" }}>
                    Fale com um especialista via WhatsApp
                  </p>
                </div>
                <span className="text-green-600 group-hover:translate-x-0.5 transition-transform" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                  &rarr;
                </span>
              </a>

              {/* Dynamic Attributes */}
              {attrsLoading ? (
                <div className="flex items-center gap-2 text-gray-400 py-6">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span style={{ fontSize: "0.85rem" }}>Carregando especificacoes...</span>
                </div>
              ) : attrEntries.length > 0 ? (
                <div className="flex-1">
                  {/* Section header */}
                  <div className="flex items-center gap-2 mb-3">
                    <Tag className="w-4 h-4 text-red-600" />
                    <span className="text-gray-700" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                      Especificacoes Tecnicas
                    </span>
                    <span
                      className="bg-red-50 text-red-600 px-2 py-0.5 rounded-full"
                      style={{ fontSize: "0.7rem", fontWeight: 500 }}
                    >
                      {attrEntries.length}
                    </span>
                  </div>

                  {/* Attributes table */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    {attrEntries.map(([key, value], idx) => (
                      <div
                        key={key}
                        className={`grid grid-cols-[140px_1fr] sm:grid-cols-[180px_1fr] ${
                          idx < attrEntries.length - 1 ? "border-b border-gray-100" : ""
                        } ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/60"}`}
                      >
                        <div
                          className="px-3 py-2.5 text-gray-500 border-r border-gray-100"
                          style={{ fontSize: "0.8rem", fontWeight: 500 }}
                        >
                          {key}
                        </div>
                        <div className="px-3 py-2.5">
                          {Array.isArray(value) ? (
                            <div className="flex flex-wrap gap-1">
                              {value.map((v, vi) => (
                                <span
                                  key={vi}
                                  className="bg-red-50 text-red-700 border border-red-100 px-2 py-0.5 rounded"
                                  style={{ fontSize: "0.78rem" }}
                                >
                                  {v}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-800" style={{ fontSize: "0.83rem" }}>
                              {value}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-gray-400 py-4">
                  <Info className="w-4 h-4" />
                  <span style={{ fontSize: "0.85rem" }}>
                    Especificacoes nao disponiveis para este produto.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Related Products */}
        {related.length > 0 && (
          <div>
            <h2 className="text-gray-800 mb-6" style={{ fontSize: "1.3rem", fontWeight: 700 }}>
              Outras Pecas
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {related.map((p) => (
                <ProductCard key={p.sku} product={p} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Lightbox Modal */}
      {lightboxOpen && hasImages && (
        <div
          className="fixed inset-0 bg-black/90 z-[999] flex items-center justify-center"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors z-10"
          >
            <X className="w-6 h-6" />
          </button>

          {images.length > 1 && (
            <span
              className="absolute top-5 left-1/2 -translate-x-1/2 text-white/70"
              style={{ fontSize: "0.85rem" }}
            >
              {activeIndex + 1} / {images.length}
            </span>
          )}

          <div
            className="max-w-[90vw] max-h-[85vh] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={activeImage!.url}
              alt={`${product.titulo} - Imagem ${activeImage!.number}`}
              className="max-w-full max-h-[85vh] object-contain"
            />
          </div>

          {images.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  goToPrev();
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white rounded-full p-3 transition-colors"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  goToNext();
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white rounded-full p-3 transition-colors"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}

          {images.length > 1 && (
            <div
              className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 max-w-[90vw] overflow-x-auto px-4 pb-1"
              onClick={(e) => e.stopPropagation()}
            >
              {images.map((img, idx) => (
                <button
                  key={img.name}
                  onClick={() => {
                    setActiveIndex(idx);
                    setMainImgError(false);
                  }}
                  className={`shrink-0 w-14 h-14 rounded-lg border-2 overflow-hidden transition-all ${
                    idx === activeIndex
                      ? "border-white shadow-lg"
                      : "border-white/30 opacity-50 hover:opacity-80"
                  }`}
                >
                  <img
                    src={img.url}
                    alt={`Miniatura ${img.number}`}
                    className="w-full h-full object-contain bg-white p-0.5"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function fallbackCopy(text: string) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand("copy");
  document.body.removeChild(textArea);
}