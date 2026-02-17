import { Link } from "react-router";
import { ProductCard } from "../components/ProductCard";
import type { ProdutoItem } from "../components/ProductCard";
import {
  Truck,
  Shield,
  Headset,
  CreditCard,
  ArrowRight,
  ChevronRight,
  Loader2,
  Package,
  MessageCircle,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import * as api from "../services/api";
import type { ProductBalance } from "../services/api";

/** Hook to animate elements when they scroll into view */
function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, isVisible };
}

const BENEFITS = [
  { icon: Truck, title: "Frete Gratis", desc: "Acima de R$ 299,90", color: "text-blue-600", bg: "bg-blue-50" },
  { icon: Shield, title: "Garantia", desc: "Em todas as pecas", color: "text-green-600", bg: "bg-green-50" },
  { icon: Headset, title: "Suporte", desc: "Atendimento especializado", color: "text-purple-600", bg: "bg-purple-50" },
  { icon: CreditCard, title: "Parcelamento", desc: "Em ate 12x sem juros", color: "text-amber-600", bg: "bg-amber-50" },
];

const STATS = [
  { value: "15.000+", label: "Pecas no catalogo" },
  { value: "8", label: "Unidades pelo Brasil" },
  { value: "25+", label: "Anos de mercado" },
  { value: "98%", label: "Clientes satisfeitos" },
];

export function HomePage() {
  const [produtos, setProdutos] = useState<ProdutoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [balanceMap, setBalanceMap] = useState<Record<string, ProductBalance>>({});
  const benefitsReveal = useScrollReveal();
  const productsReveal = useScrollReveal();
  const ctaReveal = useScrollReveal();
  const statsReveal = useScrollReveal();

  useEffect(() => {
    const load = async () => {
      try {
        const result = await api.getDestaques(8);
        setProdutos(result.data);
      } catch (e) {
        console.error("Erro ao carregar produtos do catalogo:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Bulk-load stock balances for featured products
  useEffect(() => {
    if (produtos.length === 0) return;
    const skus = produtos.map((p) => p.sku);
    api.getProductBalances(skus)
      .then((res) => {
        const map: Record<string, ProductBalance> = {};
        for (const b of (res.results || [])) { map[b.sku] = b; }
        setBalanceMap(map);
      })
      .catch((e) => console.error("[HomePage] Bulk balance error:", e));
  }, [produtos]);

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative bg-gray-900 overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1698998882494-57c3e043f340?crop=entropy&cs=tinysrgb&fit=max&fm=webp&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhdXRvbW90aXZlJTIwbWVjaGFuaWMlMjB3b3Jrc2hvcHxlbnwxfHx8fDE3NzA5ODY5MDh8MA&ixlib=rb-4.1.0&q=75&w=1080"
            alt="Workshop"
            className="w-full h-full object-cover opacity-30"
            // @ts-ignore
            fetchpriority="high"
            width={1080}
            height={720}
          />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 py-16 md:py-24 lg:py-32">
          <div className="max-w-2xl">
            <span
              className="inline-block bg-red-600 text-white px-3 py-1 rounded-full mb-4"
              style={{ fontSize: "0.8rem", fontWeight: 500 }}
            >
              Catalogo Online
            </span>
            <h1 className="text-white mb-4" style={{ fontSize: "clamp(1.8rem, 5vw, 3rem)", fontWeight: 700, lineHeight: 1.15 }}>
              Encontre as <span className="text-red-500">melhores pecas</span> para seu veiculo
            </h1>
            <p className="text-gray-300 mb-8 max-w-lg" style={{ fontSize: "1rem", lineHeight: 1.7 }}>
              Pecas automotivas das melhores marcas. Qualidade garantida, entrega rapida e precos imbativeis.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/catalogo"
                className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg flex items-center gap-2 transition-colors"
                style={{ fontSize: "0.95rem", fontWeight: 500 }}
              >
                Ver Catalogo
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/contato"
                className="bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-lg border border-white/20 transition-colors"
                style={{ fontSize: "0.95rem", fontWeight: 500 }}
              >
                Fale Conosco
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Strip */}
      <section className="bg-white border-b border-gray-100 py-8">
        <div
          ref={benefitsReveal.ref}
          className={`max-w-7xl mx-auto px-4 transition-all duration-700 ${
            benefitsReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {BENEFITS.map((item, idx) => (
              <div
                key={item.title}
                className="flex items-center gap-3 p-4 rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all"
                style={{ transitionDelay: `${idx * 80}ms` }}
              >
                <div className={`${item.bg} rounded-xl p-2.5 shrink-0`}>
                  <item.icon className={`w-5 h-5 ${item.color}`} />
                </div>
                <div>
                  <p className="text-gray-800" style={{ fontSize: "0.85rem", fontWeight: 600 }}>{item.title}</p>
                  <p className="text-gray-400" style={{ fontSize: "0.73rem" }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Products from DB */}
      <section className="py-12 md:py-16 bg-gray-50">
        <div
          ref={productsReveal.ref}
          className={`max-w-7xl mx-auto px-4 transition-all duration-700 ${
            productsReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <div className="flex items-end justify-between mb-8">
            <div>
              <span
                className="text-red-600 mb-1.5 block"
                style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}
              >
                Catalogo
              </span>
              <h2 className="text-gray-800" style={{ fontSize: "1.6rem", fontWeight: 800, letterSpacing: "-0.01em" }}>
                Pecas em Destaque
              </h2>
            </div>
            <Link
              to="/catalogo"
              className="hidden sm:flex items-center gap-1.5 text-red-600 hover:text-red-700 transition-colors bg-red-50 hover:bg-red-100 px-4 py-2 rounded-lg"
              style={{ fontSize: "0.85rem", fontWeight: 600 }}
            >
              Ver todos
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <Loader2 className="w-10 h-10 text-red-400 animate-spin mx-auto mb-3" />
                <p className="text-gray-400" style={{ fontSize: "0.85rem" }}>Carregando produtos...</p>
              </div>
            </div>
          ) : produtos.length === 0 ? (
            <div className="text-center py-16">
              <Package className="w-14 h-14 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-400" style={{ fontSize: "0.9rem" }}>
                Nenhum produto disponivel no momento.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {produtos.map((produto) => (
                <ProductCard key={produto.sku} product={produto} balance={balanceMap[produto.sku]} />
              ))}
            </div>
          )}

          <div className="text-center mt-8 sm:hidden">
            <Link
              to="/catalogo"
              className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl transition-colors"
              style={{ fontSize: "0.9rem", fontWeight: 600 }}
            >
              Ver Catalogo Completo
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="bg-white py-12 border-y border-gray-100">
        <div
          ref={statsReveal.ref}
          className={`max-w-7xl mx-auto px-4 transition-all duration-700 ${
            statsReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
            {STATS.map((stat, idx) => (
              <div
                key={stat.label}
                className="text-center"
                style={{ transitionDelay: `${idx * 100}ms` }}
              >
                <p
                  className="text-red-600 mb-1"
                  style={{ fontSize: "clamp(1.5rem, 3vw, 2.2rem)", fontWeight: 800, letterSpacing: "-0.02em" }}
                >
                  {stat.value}
                </p>
                <p className="text-gray-500" style={{ fontSize: "0.82rem", fontWeight: 500 }}>
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-red-600 via-red-600 to-red-700" />
        <div className="absolute inset-0 opacity-10">
          <img
            src="https://images.unsplash.com/photo-1767713328609-3ccdca8ef3ab?crop=entropy&cs=tinysrgb&fit=max&fm=webp&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhdXRvbW90aXZlJTIwZW5naW5lJTIwcGFydHMlMjBjbG9zZSUyMHVwfGVufDF8fHx8MTc3MTAxNDIwNXww&ixlib=rb-4.1.0&q=60&w=800"
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            width={800}
            height={533}
          />
        </div>
        <div
          ref={ctaReveal.ref}
          className={`relative max-w-7xl mx-auto px-4 py-14 md:py-16 transition-all duration-700 ${
            ctaReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <div className="max-w-2xl mx-auto text-center">
            <h2
              className="text-white mb-3"
              style={{ fontSize: "clamp(1.3rem, 3vw, 1.7rem)", fontWeight: 800, letterSpacing: "-0.01em" }}
            >
              Precisa de ajuda para encontrar a peca certa?
            </h2>
            <p className="text-red-100 mb-7 max-w-xl mx-auto" style={{ fontSize: "0.95rem", lineHeight: 1.6 }}>
              Nossa equipe de especialistas esta pronta para ajudar. Entre em contato e encontre a peca ideal para seu veiculo.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/contato"
                className="inline-flex items-center gap-2 bg-white text-red-600 hover:bg-gray-50 px-6 py-3 rounded-xl transition-all hover:shadow-lg active:scale-[0.98]"
                style={{ fontSize: "0.95rem", fontWeight: 700 }}
              >
                Falar com Especialista
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="https://wa.me/5544997330202"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white border border-white/20 px-6 py-3 rounded-xl transition-all backdrop-blur-sm"
                style={{ fontSize: "0.95rem", fontWeight: 500 }}
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}