import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router";
import Home from "lucide-react/dist/esm/icons/home";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import Search from "lucide-react/dist/esm/icons/search";
import HelpCircle from "lucide-react/dist/esm/icons/help-circle";
import MessageCircle from "lucide-react/dist/esm/icons/message-circle";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import * as api from "../services/api";

// ─── Default FAQ items shown while loading / if none configured ───
var DEFAULT_FAQ: api.FaqItem[] = [
  { id: "d1", question: "Quais formas de pagamento voces aceitam?", answer: "Aceitamos PIX (com desconto), Boleto Bancario e Cartao de Credito (via Mercado Pago). O PIX oferece a melhor experiencia — pagamento instantaneo e confirmacao automatica.", category: "Pagamentos", active: true, order: 0, createdAt: 0, updatedAt: 0 },
  { id: "d2", question: "Qual o prazo de entrega?", answer: "O prazo varia de acordo com a regiao e a transportadora escolhida. Voce pode simular o frete e o prazo diretamente na pagina do produto, informando seu CEP. Geralmente, entregas na regiao Sul e Sudeste chegam em 3 a 7 dias uteis.", category: "Frete e Entregas", active: true, order: 1, createdAt: 0, updatedAt: 0 },
  { id: "d3", question: "Como posso rastrear meu pedido?", answer: "Apos o envio, voce recebera um e-mail com o codigo de rastreio. Tambem pode acompanhar o status na area 'Minha Conta' > 'Meus Pedidos'. Oferecemos rastreamento em tempo real via SisFrete.", category: "Frete e Entregas", active: true, order: 2, createdAt: 0, updatedAt: 0 },
  { id: "d4", question: "As pecas possuem garantia?", answer: "Sim! Todas as pecas possuem garantia do fabricante. Alem disso, oferecemos a opcao de Garantia Estendida em diversos produtos, que pode ser adicionada no momento da compra com cobertura de ate 24 meses.", category: "Garantia", active: true, order: 3, createdAt: 0, updatedAt: 0 },
  { id: "d5", question: "Como sei se a peca e compativel com meu veiculo?", answer: "Na pagina de cada produto, voce encontra a lista de veiculos compativeis. Em caso de duvida, entre em contato conosco pelo WhatsApp que nossos especialistas ajudam a conferir a aplicacao.", category: "Produtos", active: true, order: 4, createdAt: 0, updatedAt: 0 },
  { id: "d6", question: "Posso devolver ou trocar um produto?", answer: "Sim. Voce tem ate 7 dias apos o recebimento para solicitar a troca ou devolucao, conforme o Codigo de Defesa do Consumidor. O produto deve estar na embalagem original e sem uso. Entre em contato conosco para iniciar o processo.", category: "Trocas e Devoluções", active: true, order: 5, createdAt: 0, updatedAt: 0 },
  { id: "d7", question: "Voces emitem nota fiscal?", answer: "Sim, emitimos nota fiscal eletonica (NF-e) em todos os pedidos. A nota e enviada automaticamente para o e-mail cadastrado apos a confirmacao do pagamento.", category: "Pagamentos", active: true, order: 6, createdAt: 0, updatedAt: 0 },
  { id: "d8", question: "O frete e gratis?", answer: "Oferecemos frete gratis para pedidos acima de determinado valor em diversas regioes. As condicoes sao exibidas automaticamente ao calcular o frete na pagina do produto ou no carrinho.", category: "Frete e Entregas", active: true, order: 7, createdAt: 0, updatedAt: 0 },
  { id: "d9", question: "Voces possuem loja fisica?", answer: "Sim! O Carretao Auto Pecas possui diversas filiais nos estados do Parana, Santa Catarina e Mato Grosso. Confira os enderecos e horarios de funcionamento na pagina 'Sobre / Filiais'.", category: "Geral", active: true, order: 8, createdAt: 0, updatedAt: 0 },
  { id: "d10", question: "Como utilizar um cupom de desconto?", answer: "Na tela de checkout, voce encontra o campo 'Cupom de desconto'. Basta digitar o codigo do cupom e clicar em 'Aplicar'. O desconto sera refletido automaticamente no total do pedido. Voce tambem pode encontrar cupons ativos no menu superior do site.", category: "Pagamentos", active: true, order: 9, createdAt: 0, updatedAt: 0 },
];

// ─── Category icons/colors ───
var CATEGORY_COLORS: Record<string, string> = {
  "Pagamentos": "bg-green-50 text-green-700 border-green-200",
  "Frete e Entregas": "bg-blue-50 text-blue-700 border-blue-200",
  "Garantia": "bg-purple-50 text-purple-700 border-purple-200",
  "Produtos": "bg-amber-50 text-amber-700 border-amber-200",
  "Trocas e Devoluções": "bg-orange-50 text-orange-700 border-orange-200",
  "Geral": "bg-gray-50 text-gray-700 border-gray-200",
};

function getCategoryClass(cat: string): string {
  return CATEGORY_COLORS[cat] || "bg-gray-50 text-gray-700 border-gray-200";
}

export function FaqPage() {
  useDocumentMeta({
    title: "Perguntas Frequentes (FAQ) | Carretao Auto Pecas",
    description: "Tire suas duvidas sobre pagamentos, entregas, garantia, trocas e mais. FAQ completo da Carretao Auto Pecas.",
  });

  var [items, setItems] = useState<api.FaqItem[]>([]);
  var [loading, setLoading] = useState(true);
  var [search, setSearch] = useState("");
  var [openIds, setOpenIds] = useState<Set<string>>(new Set());
  var [activeCategory, setActiveCategory] = useState<string>("Todas");

  useEffect(function () {
    api.getPublicFaq()
      .then(function (data) {
        if (data.items && data.items.length > 0) {
          setItems(data.items);
        } else {
          setItems(DEFAULT_FAQ);
        }
      })
      .catch(function () {
        setItems(DEFAULT_FAQ);
      })
      .finally(function () {
        setLoading(false);
      });
  }, []);

  var categories = useMemo(function () {
    var cats = new Set<string>();
    items.forEach(function (item) { cats.add(item.category); });
    return ["Todas", ...Array.from(cats)];
  }, [items]);

  var filtered = useMemo(function () {
    var result = items;
    if (activeCategory !== "Todas") {
      result = result.filter(function (i) { return i.category === activeCategory; });
    }
    if (search.trim()) {
      var q = search.toLowerCase().trim();
      result = result.filter(function (i) {
        return i.question.toLowerCase().includes(q) || i.answer.toLowerCase().includes(q);
      });
    }
    return result;
  }, [items, activeCategory, search]);

  function toggleItem(id: string) {
    setOpenIds(function (prev) {
      var next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  // FAQ Schema (JSON-LD) for SEO
  var faqSchema = useMemo(function () {
    if (items.length === 0) return null;
    return {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: items.map(function (item) {
        return {
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        };
      }),
    };
  }, [items]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* FAQ Schema JSON-LD */}
      {faqSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      )}

      {/* Breadcrumb */}
      <div className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <nav className="flex items-center gap-1.5 text-sm text-gray-500" aria-label="Breadcrumb">
            <Link to="/" className="hover:text-red-600 transition-colors" aria-label="Inicio">
              <Home className="w-4 h-4" />
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-gray-800 font-medium">Perguntas Frequentes</span>
          </nav>
        </div>
      </div>

      {/* Hero */}
      <div className="bg-gradient-to-br from-red-700 via-red-600 to-red-500 text-white">
        <div className="max-w-5xl mx-auto px-4 py-12 md:py-16 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/15 mb-5">
            <HelpCircle className="w-8 h-8" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-3">Perguntas Frequentes</h1>
          <p className="text-red-100 text-lg max-w-xl mx-auto">
            Encontre respostas rapidas sobre pedidos, pagamentos, entregas e mais.
          </p>

          {/* Search */}
          <div className="mt-8 max-w-lg mx-auto">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar pergunta..."
                value={search}
                onChange={function (e) { setSearch(e.target.value); }}
                className="w-full pl-12 pr-4 py-3.5 rounded-xl text-gray-800 bg-white shadow-lg border-0 focus:ring-2 focus:ring-red-300 outline-none text-base"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-8 md:py-12">
        {/* Category filter */}
        <div className="flex flex-wrap gap-2 mb-8">
          {categories.map(function (cat) {
            var isActive = cat === activeCategory;
            return (
              <button
                key={cat}
                onClick={function () { setActiveCategory(cat); }}
                className={"px-4 py-2 rounded-full text-sm font-medium transition-all border "
                  + (isActive
                    ? "bg-red-600 text-white border-red-600 shadow-sm"
                    : "bg-white text-gray-600 border-gray-200 hover:border-red-300 hover:text-red-600")}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-16">
            <div className="inline-block w-8 h-8 border-3 border-red-200 border-t-red-600 rounded-full animate-spin" />
            <p className="mt-3 text-gray-500 text-sm">Carregando...</p>
          </div>
        )}

        {/* FAQ Items */}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-16">
            <HelpCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Nenhuma pergunta encontrada.</p>
            {search && (
              <button
                onClick={function () { setSearch(""); }}
                className="mt-3 text-red-600 hover:text-red-700 text-sm font-medium"
              >
                Limpar busca
              </button>
            )}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map(function (item) {
              var isOpen = openIds.has(item.id);
              return (
                <div
                  key={item.id}
                  className={"bg-white rounded-xl border transition-all overflow-hidden "
                    + (isOpen ? "border-red-200 shadow-md" : "border-gray-200 hover:border-gray-300 hover:shadow-sm")}
                >
                  <button
                    onClick={function () { toggleItem(item.id); }}
                    className="w-full flex items-start gap-3 p-5 text-left"
                    aria-expanded={isOpen}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className={"inline-block px-2.5 py-0.5 rounded-full text-xs font-medium border " + getCategoryClass(item.category)}>
                          {item.category}
                        </span>
                      </div>
                      <h3 className={"font-semibold text-base " + (isOpen ? "text-red-700" : "text-gray-800")}>
                        {item.question}
                      </h3>
                    </div>
                    <ChevronDown
                      className={"w-5 h-5 flex-shrink-0 mt-1 transition-transform duration-200 "
                        + (isOpen ? "rotate-180 text-red-500" : "text-gray-400")}
                    />
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-5 -mt-1">
                      <div className="border-t border-gray-100 pt-4">
                        <div
                          className="text-gray-600 text-sm leading-relaxed whitespace-pre-line"
                          dangerouslySetInnerHTML={{ __html: item.answer }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* CTA */}
        <div className="mt-12 bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <MessageCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">Nao encontrou o que procurava?</h2>
          <p className="text-gray-500 mb-5 max-w-md mx-auto">
            Nossa equipe esta pronta para te ajudar. Entre em contato pelo WhatsApp ou visite nossa pagina de contato.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/contato"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors"
            >
              Fale Conosco
            </Link>
            <a
              href="https://wa.me/5544312300"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
