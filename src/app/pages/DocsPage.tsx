/**
 * DOCS PAGE (/docs) — Pagina de documentacao tecnica interativa do e-commerce.
 * Renderiza toda a arquitetura do sistema em formato visual navegavel.
 * Sidebar com navegacao por secoes, busca full-text, badges por tipo,
 * tabelas de cache/rotas formatadas, e diagrama de arquitetura.
 * Dados: conteudo hardcoded extraido do ARCHITECTURE.tsx.
 */
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Link } from "react-router";
import {
  Home, ChevronRight, Search, BookOpen, Server, Database, Shield, Zap,
  ShoppingCart, BarChart3, Code2, FolderTree, Globe, Layout, Lock,
  FileCode, Settings, CreditCard, Megaphone, Package, Eye, ChevronDown,
  ChevronUp, Copy, Check, Menu, X, ArrowUp, Layers, Network, Cpu,
  HardDrive, Tag, Users, Truck, Star, ExternalLink, Clock, AlertTriangle
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════ */
/*  DOCUMENTATION DATA                                                */
/* ═══════════════════════════════════════════════════════════════════ */

interface DocSection {
  id: string;
  title: string;
  icon: typeof Home;
  color: string;
  content: DocBlock[];
}

type DocBlock =
  | { type: "text"; value: string }
  | { type: "diagram"; value: string }
  | { type: "tree"; value: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "list"; items: string[] }
  | { type: "code"; language: string; value: string }
  | { type: "callout"; variant: "info" | "warning" | "tip"; value: string }
  | { type: "subtitle"; value: string };

var sections: DocSection[] = [
  {
    id: "overview",
    title: "Visao Geral",
    icon: Globe,
    color: "blue",
    content: [
      { type: "text", value: "O Carretao Auto Pecas e um e-commerce completo de pecas automotivas, construido como uma SPA (Single Page Application) com arquitetura de 3 camadas." },
      { type: "callout", variant: "info", value: "Dominio: autopecascarretao.com.br | Stack: React 18 + React Router v7 + Tailwind CSS v4 + Hono (Deno) + Supabase | Hospedagem: cPanel (frontend) + Supabase Edge Functions (backend)" },
      { type: "diagram", value: "[Browser/React SPA]  ───>  [Supabase Edge Function (Hono)]  ───>  [Supabase DB + API SIGE]\n     Frontend                    Servidor (Proxy/BFF)                    Dados" },
      { type: "subtitle", value: "Camadas" },
      { type: "list", items: [
        "FRONTEND — SPA React com code splitting agressivo via React.lazy + React Router lazy routes. ~185 arquivos TypeScript/TSX.",
        "SERVIDOR — Edge Function Supabase rodando Hono (web framework para Deno). Atua como proxy/BFF: agrega dados do Supabase DB e da API externa SIGE, aplica cache, validacao e seguranca. ~400 rotas.",
        "BANCO — Supabase PostgreSQL com tabela KV (kv_store_b7b07654). Toda persistencia usa chave-valor (key-value), sem schema relacional.",
        "API SIGE — Sistema ERP externo que fornece: catalogo de produtos, precos (5 tabelas V1-V5), saldos de estoque, clientes, pedidos e notas fiscais."
      ]},
    ]
  },
  {
    id: "directory",
    title: "Estrutura de Diretorios",
    icon: FolderTree,
    color: "green",
    content: [
      { type: "text", value: "O projeto segue uma organizacao clara por responsabilidade:" },
      { type: "tree", value: `/src/app/
├── App.tsx                    # Raiz: providers + RouterProvider
├── routes.ts                  # Todas as rotas React Router
├── ARCHITECTURE.tsx           # Documentacao tecnica (somente comentarios)
│
├── components/                # ~50 componentes reutilizaveis
│   ├── Layout.tsx             # Shell: Header + Outlet + Footer + overlays
│   ├── Header.tsx             # Cabecalho: logo, busca, carrinho, menu
│   ├── Footer.tsx             # Rodape: links, selos, LGPD
│   ├── ProductCard.tsx        # Card de produto (grid catalogo/home)
│   ├── PriceBadge.tsx         # Badge de preco com cache de modulo
│   ├── StockBar.tsx           # Barra de estoque visual
│   ├── CartDrawer.tsx         # Gaveta lateral do carrinho (Motion)
│   ├── SearchAutocomplete.tsx # Busca com autocomplete
│   ├── SuperPromoSection.tsx  # Secao Super Promocao (carousel)
│   ├── HomeReels.tsx          # Reels estilo TikTok
│   ├── ShippingCalculator.tsx # Calculadora de frete
│   ├── VirtualProductGrid.tsx # Grid virtualizado (grandes listas)
│   └── ... (+35 componentes)
│
├── pages/                     # Uma pagina por rota
│   ├── HomePage.tsx           # Pagina inicial
│   ├── CatalogPage.tsx        # Catalogo com filtros
│   ├── ProductDetailPage.tsx  # Detalhe do produto
│   ├── CheckoutPage.tsx       # Fluxo de checkout
│   ├── UserAuthPage.tsx       # Login/cadastro clientes
│   ├── UserAccountPage.tsx    # Painel "Minha Conta"
│   └── admin/                 # ~40 tabs do painel admin
│       ├── AdminPage.tsx      # Shell do admin
│       ├── AdminDashboard.tsx # Dashboard com metricas
│       ├── AdminProducts.tsx  # CRUD de produtos
│       ├── AdminOrders.tsx    # Gestao de pedidos
│       └── ... (+35 modulos)
│
├── contexts/                  # React Contexts (estado global)
│   ├── CartContext.tsx         # Carrinho (localStorage + state)
│   ├── WishlistContext.tsx     # Favoritos (sync servidor)
│   ├── AffiliateContext.tsx    # Afiliados (?ref=CODE)
│   ├── CatalogModeContext.tsx  # Modo catalogo (oculta precos)
│   └── HomepageInitContext.tsx # Cache homepage (5min TTL)
│
├── services/                  # Camada de servicos
│   ├── api.ts                 # Cliente HTTP (~4000 linhas)
│   └── supabaseClient.ts      # Singleton Supabase client
│
├── hooks/                     # Custom hooks
│   ├── useDocumentMeta.ts     # SEO: title, OG, JSON-LD
│   ├── useRecentlyViewed.ts   # Produtos recentes
│   └── useIdlePrefetch.ts     # Prefetch em idle time
│
├── utils/                     # Utilitarios puros
│   ├── prefetch.ts            # Prefetch de chunks e dados
│   ├── lazyWithRetry.tsx      # React.lazy com retry
│   └── utmTracker.ts          # Captura UTM params
│
└── data/                      # Dados estaticos
    ├── categoryTree.ts        # Arvore de categorias
    └── products.ts            # Tipos de produto

/supabase/functions/server/    # Backend (Edge Function)
├── index.tsx                  # Servidor Hono (~23k linhas, ~400 rotas)
├── kv_store.tsx               # Utilitario KV (get/set/del)
├── seed.tsx                   # Seed inicial de dados
├── validation.ts              # Validacao de inputs
└── test-shipping-handler.ts   # Handler de teste de frete` },
    ]
  },
  {
    id: "routes-frontend",
    title: "Rotas do Frontend",
    icon: Layout,
    color: "purple",
    content: [
      { type: "text", value: "Todas as rotas publicas estao dentro do Layout (Header + Footer). As rotas admin sao isoladas com layout proprio. Todas usam lazy loading para code splitting." },
      { type: "subtitle", value: "Rotas Publicas" },
      { type: "table", headers: ["Rota", "Pagina", "Descricao"], rows: [
        ["/", "HomePage", "Homepage (banners, promo, destaques, reels)"],
        ["/catalogo", "CatalogPage", "Catalogo com filtros, busca, paginacao"],
        ["/produto/:id", "ProductDetailPage", "Detalhe do produto (SKU como :id)"],
        ["/contato", "ContactPage", "Formulario de contato"],
        ["/sobre", "AboutPage", "Nossas Filiais (mapa, telefone, horario)"],
        ["/conta", "UserAuthPage", "Login/Cadastro de clientes"],
        ["/conta/redefinir-senha", "UserResetPasswordPage", "Redefinicao de senha"],
        ["/minha-conta", "UserAccountPage", "Painel do cliente (pedidos, favoritos)"],
        ["/checkout", "CheckoutPage", "Fluxo de compra (carrinho → pagamento)"],
        ["/marca/:slug", "BrandPage", "Produtos de uma marca especifica"],
        ["/afiliados", "AffiliatePage", "Programa de afiliados"],
        ["/cupons", "CouponsPage", "Cupons de desconto disponiveis"],
        ["/rastreio/:orderId", "TrackingPage", "Rastreamento de pedido"],
        ["/faq", "FaqPage", "Perguntas frequentes"],
        ["/politica-de-privacidade", "PrivacyPolicyPage", "Politica de Privacidade (LGPD)"],
        ["/termos-de-uso", "TermsPage", "Termos de Uso"],
        ["/exercicio-de-direitos", "LgpdRightsPage", "Exercicio de Direitos LGPD"],
        ["/*", "NotFoundPage", "Pagina 404"],
      ]},
      { type: "subtitle", value: "Rotas Admin" },
      { type: "table", headers: ["Rota", "Pagina", "Descricao"], rows: [
        ["/admin", "AdminPage", "Painel admin (sidebar + ~40 tabs lazy-loaded)"],
        ["/admin/reset-password", "AdminResetPasswordPage", "Reset de senha do admin"],
      ]},
    ]
  },
  {
    id: "routes-server",
    title: "Rotas do Servidor",
    icon: Server,
    color: "orange",
    content: [
      { type: "text", value: "O servidor Hono roda como Supabase Edge Function com prefixo /make-server-b7b07654. Todas usam Authorization: Bearer <anon_key>. Rotas protegidas passam o JWT do usuario via header X-User-Token." },
      { type: "subtitle", value: "Saude / Diagnostico" },
      { type: "table", headers: ["Metodo", "Rota", "Descricao"], rows: [
        ["GET", "/health", "Health check simples (warmup)"],
        ["GET", "/health/detailed", "Health check com status DB + SIGE"],
        ["POST", "/seed", "Seed inicial de dados"],
      ]},
      { type: "subtitle", value: "Autenticacao Admin" },
      { type: "table", headers: ["Metodo", "Rota", "Descricao"], rows: [
        ["POST", "/auth/pre-login-check", "Verifica se email e admin"],
        ["POST", "/auth/login-result", "Registra resultado do login"],
        ["POST", "/auth/bootstrap-admin", "Bootstrap do primeiro admin"],
        ["POST", "/auth/claim-admin", "Reivindica role de admin"],
        ["POST/GET", "/auth/admin-whitelist", "Gerencia whitelist admin"],
        ["GET", "/auth/admin-list", "Lista todos admins"],
        ["POST", "/auth/admin-permissions", "Define permissoes por tab"],
        ["GET", "/auth/check-admin", "Verifica se e admin"],
        ["GET", "/auth/me", "Dados do usuario autenticado"],
        ["POST", "/auth/forgot-password", "Email de recuperacao"],
        ["POST", "/auth/reset-password", "Reseta senha com token"],
      ]},
      { type: "subtitle", value: "Autenticacao Cliente" },
      { type: "table", headers: ["Metodo", "Rota", "Descricao"], rows: [
        ["POST", "/auth/user/signup", "Cadastro completo"],
        ["GET", "/auth/user/me", "Dados do cliente autenticado"],
        ["PUT", "/auth/user/profile", "Atualiza perfil"],
        ["PUT/POST/DELETE", "/auth/user/avatar/*", "Gerencia avatar"],
        ["POST", "/auth/user/change-password", "Troca senha"],
        ["POST", "/auth/user/forgot-password", "Recuperacao de senha"],
        ["GET/POST/PUT/DELETE", "/auth/user/addresses/*", "CRUD enderecos"],
        ["GET/POST/DELETE", "/auth/user/favorites/*", "Gerencia favoritos"],
      ]},
      { type: "subtitle", value: "Catalogo Publico" },
      { type: "table", headers: ["Metodo", "Rota", "Descricao"], rows: [
        ["GET", "/produtos", "Lista paginada com filtros"],
        ["GET", "/produtos/destaques", "Produtos em destaque"],
        ["GET", "/produtos/autocomplete", "Autocomplete de busca"],
        ["GET", "/produtos/imagens/:sku", "Imagens do produto"],
        ["GET/PUT", "/produtos/meta/:sku", "Metadados do produto"],
        ["POST", "/produtos/meta/bulk", "Metadados em lote"],
        ["GET", "/produtos/atributos", "Lista atributos"],
      ]},
      { type: "subtitle", value: "Precos & Estoque (SIGE)" },
      { type: "table", headers: ["Metodo", "Rota", "Descricao"], rows: [
        ["GET", "/sige/preco/:sku", "Preco individual (cache 30min)"],
        ["POST", "/sige/precos/bulk", "Precos em lote (ate 50 SKUs, cache 5min)"],
        ["GET", "/sige/saldo/:sku", "Saldo individual (cache 15min)"],
        ["POST", "/sige/saldos/bulk", "Saldos em lote (cache 5min)"],
        ["GET/PUT", "/admin/price-config", "Config tier de preco (V1-V5)"],
      ]},
      { type: "subtitle", value: "Pedidos & Pagamentos" },
      { type: "table", headers: ["Metodo", "Rota", "Descricao"], rows: [
        ["POST", "/orders", "Cria pedido (checkout)"],
        ["GET", "/orders", "Lista pedidos do usuario"],
        ["GET", "/orders/:id", "Detalhe do pedido"],
        ["POST", "/payment/paghiper/pix", "Gera QR code PIX"],
        ["POST", "/payment/paghiper/boleto", "Gera boleto"],
        ["POST", "/payment/mercadopago/preference", "Cria preferencia MP"],
        ["POST", "/payment/*/webhook", "Webhooks de pagamento"],
      ]},
      { type: "subtitle", value: "Frete" },
      { type: "table", headers: ["Metodo", "Rota", "Descricao"], rows: [
        ["GET/PUT", "/shipping/config", "Config de frete"],
        ["POST", "/shipping/calculate", "Calcula frete (CEP + peso)"],
        ["GET", "/shipping/cep/:cep", "Consulta CEP (ViaCEP)"],
        ["GET/POST/DELETE", "/shipping/tables/*", "Tabelas de frete custom"],
      ]},
      { type: "subtitle", value: "Endpoints Combinados (Performance)" },
      { type: "table", headers: ["Metodo", "Rota", "Descricao"], rows: [
        ["GET", "/homepage-init", "TODOS os dados da homepage em 1 call (cache 10s)"],
        ["GET", "/produto-detail-init/:sku", "TODOS os dados do detalhe em 1 call (cache 60s per-SKU)"],
      ]},
      { type: "callout", variant: "tip", value: "Os endpoints combinados homepage-init e produto-detail-init reduzem de ~12 requests para 1, acelerando drasticamente o carregamento." },
      { type: "subtitle", value: "Demais Rotas" },
      { type: "table", headers: ["Grupo", "Exemplos", "Total aprox."], rows: [
        ["Super Promocao", "/promo/active, /admin/promo", "~6 rotas"],
        ["Banners", "/admin/banners, /admin/mid-banners", "~8 rotas"],
        ["Categorias", "/categories, /category-tree", "~6 rotas"],
        ["Cupons", "/coupons/public, /coupons/validate, /admin/coupons", "~6 rotas"],
        ["Avaliacoes", "/reviews/:sku, /admin/reviews", "~7 rotas"],
        ["Marcas", "/admin/brands", "~4 rotas"],
        ["Reels & Influencers", "/reels, /influencers, /admin/reels", "~10 rotas"],
        ["Configuracoes", "/settings, /ga4, /marketing, /whatsapp", "~10 rotas"],
        ["LGPD", "/lgpd/request, /admin/lgpd/requests", "~3 rotas"],
        ["SIGE Detalhado", "/sige/produto, /sige/pedido, /sige/cliente", "~30 rotas"],
        ["Afiliados", "/affiliates, /admin/affiliates", "~4 rotas"],
        ["Email Marketing", "/admin/email/send, /admin/email/test", "~2 rotas"],
        ["Audit Log", "/admin/audit-log", "~1 rota"],
      ]},
    ]
  },
  {
    id: "providers",
    title: "Hierarquia de Providers",
    icon: Layers,
    color: "indigo",
    content: [
      { type: "text", value: "A arvore de Providers do React segue uma ordem especifica para garantir que cada contexto tenha acesso aos que estao acima dele." },
      { type: "subtitle", value: "App.tsx (Raiz)" },
      { type: "code", language: "tsx", value: `<ErrorBoundary>              // Captura erros fatais
  <CatalogModeProvider>      // Modo catalogo (oculta precos)
    <AffiliateProvider>      // Rastreamento de afiliados
      <CartProvider>         // Estado do carrinho
        <WishlistProvider>   // Lista de favoritos
          <RouterProvider>   // React Router + rotas
        </WishlistProvider>
      </CartProvider>
    </AffiliateProvider>
  </CatalogModeProvider>
</ErrorBoundary>` },
      { type: "subtitle", value: "Layout.tsx (Dentro do Router)" },
      { type: "code", language: "tsx", value: `<MaintenanceGate>              // Verifica modo manutencao
  <HomepageInitProvider>       // Cache homepage (5min TTL)
    <GTMProvider>              // Google Tag Manager
      <GA4Provider>            // Google Analytics 4
        <MarketingPixelsProvider>  // Meta, TikTok pixels
          <Header />
          <Outlet />           // Pagina atual
          <Footer />
          <CartDrawer />       // Lazy
          <WhatsAppButton />   // Lazy
          <CookieConsentBanner /> // Lazy (LGPD)
          <ExitIntentPopup />  // Lazy
          <MobileBottomNav />  // Lazy
          <ScrollToTopButton /> // Lazy
          <WebVitalsReporter /> // Lazy
          <CartAbandonedTracker /> // Lazy
        </MarketingPixelsProvider>
      </GA4Provider>
    </GTMProvider>
  </HomepageInitProvider>
</MaintenanceGate>` },
    ]
  },
  {
    id: "data-flow",
    title: "Fluxos de Dados",
    icon: Network,
    color: "cyan",
    content: [
      { type: "subtitle", value: "Homepage" },
      { type: "list", items: [
        "1. Layout monta → HomepageInitProvider busca GET /homepage-init",
        "2. Servidor retorna JSON com ~15 campos (banners, promo, categorias, marcas, configs...)",
        "3. Cache: servidor guarda em memoria por 10s; frontend guarda por 5min",
        "4. HomePage consome via useHomepageInit(): Banners → HeroBannerCarousel, Categorias → CategoriesStrip, Promo → SuperPromoSection, Brands → BrandCarousel",
        "5. Destaques: busca GET /produtos/destaques → grid de ProductCards",
        "6. Precos/Saldos: bulk-fetch via POST /sige/precos/bulk e /sige/saldos/bulk → seeda caches individuais",
        "7. Reviews: batch-fetch via POST /reviews/summaries/batch",
      ]},
      { type: "subtitle", value: "Pagina de Produto" },
      { type: "list", items: [
        "1. Hover no ProductCard → scheduleProductDataPrefetch(sku) com 200ms debounce",
        "2. Faz GET /produto-detail-init/:sku em background → cache in-memory (2min TTL)",
        "3. Ao navegar → ProductDetailPage verifica consumeProductDataCache(sku)",
        "4. Cache hit: dados instantaneos (zero loading). Cache miss: fetch com skeleton",
        "5. Servidor retorna: meta, images, price, balance, attributes, reviews, promo, warranty, reels em 1 call",
        "6. Cache per-SKU no servidor: 60s TTL",
      ]},
      { type: "subtitle", value: "Checkout" },
      { type: "list", items: [
        "1. Usuario adiciona produtos ao carrinho (CartContext → localStorage)",
        "2. CartDrawer mostra resumo → clica 'Finalizar'",
        "3. CheckoutPage: verifica auth → seleciona endereco → calcula frete → aplica cupom",
        "4. Escolhe pagamento: PIX (PagHiper), Boleto (PagHiper), ou Mercado Pago",
        "5. POST /orders → cria pedido → backend sincroniza com SIGE",
        "6. CartAbandonedTracker: se sair sem finalizar, salva snapshot para recuperacao via WhatsApp",
      ]},
    ]
  },
  {
    id: "cache",
    title: "Sistema de Cache",
    icon: HardDrive,
    color: "amber",
    content: [
      { type: "text", value: "O sistema usa cache multi-camada para minimizar latencia e chamadas a APIs externas." },
      { type: "subtitle", value: "Cache do Servidor (Edge Function)" },
      { type: "table", headers: ["Cache", "TTL", "Proposito"], rows: [
        ["_homepageInitCache", "10s", "Resposta completa do /homepage-init"],
        ["_productDetailInitCache", "60s", "Resposta per-SKU do /produto-detail-init"],
        ["_sigePriceCache (single)", "30min", "Preco individual do SIGE"],
        ["_sigePriceBulkCache", "5min", "Precos em lote do SIGE"],
        ["_sigeBalanceCache (single)", "15min", "Saldo individual do SIGE"],
        ["_sigeBalanceBulkCache", "5min", "Saldos em lote do SIGE"],
        ["_sigeProductCache", "5min", "Dados de produto do SIGE"],
        ["_autocompletePrefixCache", "30s", "Resultados de autocomplete"],
        ["_categoryCountsCache", "5min", "Contagem de produtos por categoria"],
      ]},
      { type: "subtitle", value: "Cache do Frontend (Browser)" },
      { type: "table", headers: ["Cache", "TTL", "Proposito"], rows: [
        ["HomepageInitContext", "5min", "Dados da homepage (evita re-fetch)"],
        ["PriceBadge module cache", "2min", "Precos individuais (seeded pelo bulk)"],
        ["StockBar module cache", "2min", "Saldos individuais (seeded pelo bulk)"],
        ["ReviewStars module cache", "5min", "Resumos de review (seeded pelo batch)"],
        ["Product data prefetch", "2min", "Dados prefetch do detalhe do produto"],
        ["_destaquesCache", "5min", "Produtos em destaque da homepage"],
        ["localStorage carrinho", "Permanente", "Itens do carrinho persistidos"],
        ["localStorage had_promo", "Permanente", "Hint CLS para SuperPromo"],
        ["localStorage first_banner", "Permanente", "Preload do 1o banner (LCP)"],
      ]},
      { type: "subtitle", value: "Invalidacao" },
      { type: "list", items: [
        "Admin salva algo → frontend chama invalidateHomepageCache() → limpa _cachedData + incrementa _cacheVersion → listener re-fetch",
        "Admin limpa cache → clearAllPriceCache() + invalidateHomepageCache()",
        "Servidor: POST /admin/promo → invalida _homepageInitCache no isolate atual; outros isolates expiram pelo TTL de 10s",
      ]},
    ]
  },
  {
    id: "pricing",
    title: "Sistema de Precos",
    icon: Tag,
    color: "emerald",
    content: [
      { type: "text", value: "A API SIGE retorna 5 tabelas de preco por produto: precoV1 a precoV5. O admin escolhe qual tabela exibir via /admin/price-config." },
      { type: "list", items: [
        "1. Frontend pede preco → POST /sige/precos/bulk (array de SKUs)",
        "2. Servidor consulta SIGE API com codRef (referencia interna)",
        "3. Extrai precoV{tier} do resultado (ex: precoV1 para atacado)",
        "4. Retorna { sku, price, found } para cada SKU",
        "5. Frontend armazena no PriceBadge module cache",
        "6. Se houver promo ativa: computePromoPrice() aplica desconto",
      ]},
      { type: "callout", variant: "info", value: "A funcao resolveItemPrice() no servidor busca o item no array SIGE filtrando por codRef, extrai o preco do tier configurado e retorna null se nao encontrado." },
    ]
  },
  {
    id: "promo",
    title: "Super Promocao",
    icon: Star,
    color: "rose",
    content: [
      { type: "text", value: "O admin configura promocoes com titulo, periodo, tipo de desconto e produtos selecionados." },
      { type: "subtitle", value: "Configuracao (Admin)" },
      { type: "list", items: [
        "Define titulo, subtitulo, cor de fundo",
        "Define periodo (startDate/endDate como timestamps)",
        "Define tipo de desconto (percentage ou fixed) + valor",
        "Seleciona produtos (com desconto individual opcional)",
        "Salva via POST /admin/promo → armazena no KV 'super_promo'",
      ]},
      { type: "subtitle", value: "Exibicao (Frontend)" },
      { type: "list", items: [
        "Estrategia DUAL-SOURCE: Fast path usa initData.promo do HomepageInit (imediato)",
        "Autoritativo: SEMPRE chama GET /promo/active em paralelo",
        "Retry automatico em caso de falha",
        "Countdown visual ate endDate",
        "Carousel de PromoCards com auto-scroll",
        "'De R$ X por R$ Y' com badge de desconto",
        "Auto-hide quando promo expira",
      ]},
    ]
  },
  {
    id: "security",
    title: "Seguranca",
    icon: Shield,
    color: "red",
    content: [
      { type: "subtitle", value: "Autenticacao" },
      { type: "list", items: [
        "Supabase Auth com JWT (access_token + refresh_token)",
        "Admin: sessao separada em localStorage proprio (carretao_admin_*) com Supabase client dedicado (non-persisting)",
        "Cliente: Supabase client padrao com persistSession",
        "Token do usuario passado via header X-User-Token (nunca via URL para evitar vazamento em logs)",
      ]},
      { type: "subtitle", value: "Autorizacao Admin" },
      { type: "list", items: [
        "Master admin hardcoded (email fixo)",
        "Whitelist de admins no KV (chave 'admin_emails')",
        "Permissoes granulares por tab (chave 'admin_perms:<email>')",
        "isAdminUser() verifica token → user_metadata.role === 'admin'",
      ]},
      { type: "subtitle", value: "Input Validation" },
      { type: "list", items: [
        "validation.ts: schema-based validation no servidor",
        "_stripTags(): remove HTML tags (previne stored XSS)",
        "checkBodySize(): limita tamanho do payload",
        "Rate limiting por IP em endpoints sensiveis",
      ]},
      { type: "subtitle", value: "Seguranca HTTP" },
      { type: "list", items: [
        "Content-Security-Policy (CSP) via meta tags no Layout.tsx",
        "X-Content-Type-Options: nosniff",
        "X-Frame-Options: SAMEORIGIN",
        "Referrer-Policy: strict-origin-when-cross-origin",
      ]},
      { type: "subtitle", value: "LGPD" },
      { type: "list", items: [
        "CookieConsentBanner: consentimento de cookies antes de ativar analytics",
        "/exercicio-de-direitos: formulario de direitos do titular",
        "/admin/lgpd/requests: painel de solicitacoes LGPD para o admin",
        "/politica-de-privacidade: politica completa de privacidade",
      ]},
    ]
  },
  {
    id: "performance",
    title: "Performance",
    icon: Zap,
    color: "yellow",
    content: [
      { type: "subtitle", value: "Code Splitting" },
      { type: "list", items: [
        "Todas as paginas sao lazy-loaded (React Router lazy + Suspense)",
        "~15 componentes do Layout sao lazy (CartDrawer, Footer, etc.)",
        "~40 tabs do admin sao lazy-loaded individualmente",
        "lazyWithRetry(): retry com backoff exponencial em falha de import",
      ]},
      { type: "subtitle", value: "Network" },
      { type: "list", items: [
        "Edge function warmup: api.ts faz GET /health antes de qualquer request",
        "Concurrency limiter: max 8 requests simultaneos (semaphore)",
        "_requestFastFail(): timeout curto (25s) para calls de display",
        "requestPriority(): bypass do semaphore para auth critica",
        "Deduplicacao: bulk calls agrupam SKUs em 1 request",
      ]},
      { type: "subtitle", value: "Rendering" },
      { type: "list", items: [
        "useMemo/React.memo extensivos para evitar re-renders",
        "VirtualProductGrid: virtualiza grids com 100+ itens",
        "Skeleton states: reserva espaco durante loading (CLS prevention)",
        "hadPromoLastVisit: localStorage hint para reservar espaco da promo",
        "Opacity-only animations (sem translate-y que causa CLS)",
      ]},
      { type: "subtitle", value: "Imagens" },
      { type: "list", items: [
        "Preload do primeiro banner via localStorage cache da URL",
        "fetchpriority='high' no banner ATF (Above The Fold)",
        "loading='lazy' em imagens below-fold",
        "ProductImage com fallback visual se imagem falhar",
      ]},
      { type: "subtitle", value: "Prefetch" },
      { type: "list", items: [
        "Chunks de rota: prefetchCatalog/prefetchProductDetail apos 3s",
        "Data prefetch: scheduleProductDataPrefetch() no hover do card",
        "Bulk seed: precos/saldos do bulk 'plantam' no cache dos componentes individuais (PriceBadge, StockBar, ReviewStars)",
      ]},
    ]
  },
  {
    id: "analytics",
    title: "Analytics & Tracking",
    icon: BarChart3,
    color: "sky",
    content: [
      { type: "subtitle", value: "Google Analytics 4 (GA4)" },
      { type: "list", items: [
        "page_view, view_item, add_to_cart, begin_checkout, purchase",
        "view_promotion, select_promotion (Super Promo)",
        "search (autocomplete)",
        "generate_lead (formulario de contato)",
      ]},
      { type: "subtitle", value: "Outros" },
      { type: "list", items: [
        "GTMProvider: Google Tag Manager container",
        "MarketingPixels: Meta Pixel, TikTok Pixel, custom pixels",
        "utmTracker: captura UTM params da URL → localStorage",
        "WebVitalsReporter: LCP, FID, CLS, FCP, TTFB → POST /web-vitals",
        "CartAbandonedTracker: sincroniza snapshot do carrinho para recuperacao",
      ]},
    ]
  },
  {
    id: "patterns",
    title: "Padroes de Codigo",
    icon: Code2,
    color: "slate",
    content: [
      { type: "list", items: [
        "Funcoes nomeadas (function foo() {}) ao inves de arrow functions — melhor stack trace para debugging",
        "'var' ao inves de 'let/const' em muitos lugares — decisao historica do ambiente; nao impacta funcionalidade",
        "useCallback extensivo para funcoes passadas como props/deps",
        "AbortController em todos os useEffect que fazem fetch (cleanup cancela requests no unmount)",
        "Try/catch silencioso para localStorage (modo privado pode falhar)",
        "Logs com prefixo [ComponentName] para facilitar debug",
        "Tipos TypeScript para todas as interfaces de API",
        "100% Tailwind classes inline — sem CSS-in-JS",
        "Headers JSDoc em todos os ~60 arquivos-chave descrevendo proposito, dados, integracoes",
      ]},
    ]
  },
  {
    id: "integrations",
    title: "Mapa de Integracoes",
    icon: ExternalLink,
    color: "purple",
    content: [
      { type: "text", value: "O sistema integra com diversos servicos externos, todos intermediados pelo servidor Hono (nunca acessados diretamente pelo frontend)." },
      { type: "table", headers: ["Servico", "Finalidade", "Onde e usado"], rows: [
        ["API SIGE (ERP)", "Catalogo, precos (V1-V5), saldos, clientes, pedidos", "Servidor: /sige/*, /produtos, /orders"],
        ["Supabase Auth", "Cadastro/login de clientes e admins, JWT tokens", "Frontend (signIn) + Servidor (createUser)"],
        ["Supabase Storage", "Imagens de produtos, banners, avatares, logos", "Servidor: upload/download com signed URLs"],
        ["Supabase PostgreSQL", "Tabela KV unica (kv_store_b7b07654)", "Servidor: kv_store.tsx (get/set/del)"],
        ["PagHiper", "Pagamento via PIX e Boleto", "Servidor: /payment/paghiper/*"],
        ["Mercado Pago", "Pagamento via cartao/redirect", "Servidor: /payment/mercadopago/*"],

        ["ViaCEP", "Consulta de enderecos por CEP", "Servidor: /shipping/cep/:cep"],
        ["Sisfrete / Frete API", "Calculo de frete (transportadoras)", "Servidor: /shipping/calculate"],
        ["Google Analytics 4", "Rastreamento de eventos e conversoes", "Frontend: GA4Provider.tsx"],
        ["Google Tag Manager", "Container de tags (marketing)", "Frontend: GTMProvider.tsx"],
        ["Meta / TikTok Pixel", "Rastreamento de Ads", "Frontend: MarketingPixels.tsx"],
        ["reCAPTCHA v3", "Protecao anti-bot (desativado)", "Frontend + Servidor: /captcha/verify"],
        ["Receita Federal (CNPJ)", "Consulta dados empresa por CNPJ", "Servidor: /auth/cnpj-lookup"],
      ]},
      { type: "callout", variant: "warning", value: "IMPORTANTE: Nenhuma API externa e chamada diretamente pelo frontend. Todas passam pelo servidor Hono que atua como proxy, adicionando autenticacao, cache e validacao." },
    ]
  },
  {
    id: "api-examples",
    title: "Exemplos de API",
    icon: FileCode,
    color: "blue",
    content: [
      { type: "text", value: "Exemplos de request/response das APIs mais importantes para facilitar integracao e debug." },
      { type: "subtitle", value: "GET /homepage-init" },
      { type: "code", language: "json", value: "// Response (200 OK) — retorna ~15 campos em 1 chamada:\n{\n  \"banners\": [{ \"id\": \"b1\", \"imageUrl\": \"...\", \"link\": \"/catalogo\" }],\n  \"logo\": \"https://...supabase.co/storage/...\",\n  \"categoryTree\": [{ \"id\": \"c1\", \"name\": \"Motor\", \"children\": [...] }],\n  \"categoryCounts\": { \"Motor\": 342, \"Suspensao\": 128 },\n  \"promo\": { \"title\": \"Super Promo\", \"endDate\": 1742400000, \"items\": [...] },\n  \"priceConfig\": { \"tier\": \"precoV1\", \"label\": \"Atacado\" },\n  \"brands\": [{ \"name\": \"Bosch\", \"slug\": \"bosch\", \"logoUrl\": \"...\" }],\n  // + ga4Config, footerLogo, midBanners, footerBadges, marketingConfig, ...\n}" },
      { type: "subtitle", value: "POST /sige/precos/bulk" },
      { type: "code", language: "json", value: "// Request:\n{ \"skus\": [\"SKU001\", \"SKU002\", \"SKU003\"] }\n\n// Response (200 OK):\n{\n  \"prices\": [\n    { \"sku\": \"SKU001\", \"price\": 189.90, \"found\": true },\n    { \"sku\": \"SKU002\", \"price\": 45.50, \"found\": true },\n    { \"sku\": \"SKU003\", \"price\": null, \"found\": false }\n  ],\n  \"tier\": \"precoV1\"\n}" },
      { type: "subtitle", value: "GET /produto-detail-init/:sku" },
      { type: "code", language: "json", value: "// Response (200 OK) — todos os dados do produto em 1 chamada:\n{\n  \"meta\": { \"title\": \"Filtro de Oleo Motor\", \"brand\": \"Bosch\" },\n  \"images\": [\"https://...signed-url-1.jpg\", \"https://...signed-url-2.jpg\"],\n  \"price\": { \"sku\": \"SKU001\", \"price\": 189.90, \"found\": true },\n  \"balance\": { \"sku\": \"SKU001\", \"quantity\": 42 },\n  \"attributes\": { \"Peso\": \"0.8kg\", \"Aplicacao\": \"Scania R 440\" },\n  \"reviewSummary\": { \"average\": 4.7, \"total\": 23 },\n  \"warranty\": [{ \"name\": \"12 meses\", \"price\": 29.90 }],\n  \"reels\": [{ \"videoUrl\": \"...\", \"thumbnailUrl\": \"...\" }]\n}" },
      { type: "subtitle", value: "POST /shipping/calculate" },
      { type: "code", language: "json", value: "// Request:\n{ \"cepDestino\": \"01310-100\", \"items\": [{ \"sku\": \"SKU001\", \"quantity\": 2 }] }\n\n// Response (200 OK):\n{\n  \"options\": [\n    { \"carrier\": \"PAC\", \"price\": 32.50, \"days\": 8 },\n    { \"carrier\": \"SEDEX\", \"price\": 58.90, \"days\": 3 },\n    { \"carrier\": \"Braspress\", \"price\": 45.00, \"days\": 5 }\n  ]\n}" },
    ]
  },
  {
    id: "kv-schema",
    title: "Schema do KV Store",
    icon: Database,
    color: "indigo",
    content: [
      { type: "text", value: "O banco e uma tabela KV unica (kv_store_b7b07654). Operacoes via kv_store.tsx: get, set, del, mget, mset, mdel, getByPrefix." },
      { type: "table", headers: ["Chave (key)", "Tipo do Valor", "Descricao"], rows: [
        ["product:<sku>", "{title, sku, codRef, category}", "Dados basicos do produto"],
        ["product_meta:<sku>", "{description, seoTitle, brand}", "Metadados e SEO"],
        ["product_images:<sku>", "string[] (signed URLs)", "Imagens do produto"],
        ["product_physical:<sku>", "{weight, width, height, length}", "Dimensoes para frete"],
        ["super_promo", "{title, startDate, endDate, items}", "Super Promocao ativa"],
        ["settings", "{maintenanceMode, whatsapp, cep}", "Configuracoes gerais"],
        ["price_config", "{tier, label}", "Tier de preco ativo"],
        ["admin_emails", "string[]", "Whitelist de admins"],
        ["admin_perms:<email>", "{tabs: string[]}", "Permissoes por admin"],
        ["category_tree", "TreeNode[]", "Arvore de categorias"],
        ["banner:<id>", "{imageUrl, link, order}", "Banners homepage"],
        ["coupon:<id>", "{code, discount, type}", "Cupons de desconto"],
        ["order:<id>", "{items, total, status, userId}", "Pedidos"],
        ["review:<sku>:<id>", "{author, rating, text}", "Avaliacoes"],
        ["brand:<id>", "{name, slug, logoUrl}", "Marcas"],
        ["ga4_config", "{measurementId, enabled}", "Config GA4"],
        ["shipping_config", "{apiKey, method, cepOrigem}", "Config frete"],
        ["audit_log:<ts>", "{action, admin, details}", "Log auditoria"],
        ["cart_abandoned:<id>", "{items, userId, timestamp}", "Carrinhos abandonados"],
      ]},
    ]
  },
  {
    id: "deploy",
    title: "Deploy & Infraestrutura",
    icon: Truck,
    color: "green",
    content: [
      { type: "text", value: "O deploy e automatizado via script bash no servidor cPanel, com push para GitHub." },
      { type: "subtitle", value: "Fluxo de Deploy" },
      { type: "list", items: [
        "1. Alteracoes feitas no Figma Make (desenvolvimento)",
        "2. Codigo exportado/comitado para o repositorio GitHub",
        "3. No servidor cPanel: bash ~/build-and-push.sh",
        "4. Script: git pull → npm install → npm run build (Vite) → copia dist/ para public_html/",
        "5. Script commita e pusha de volta ao GitHub (backup do build)",
        "6. cPanel serve arquivos estaticos via Apache",
      ]},
      { type: "subtitle", value: "Ambientes" },
      { type: "table", headers: ["Ambiente", "URL", "Proposito"], rows: [
        ["Producao", "autopecascarretao.com.br", "Site publico (cPanel)"],
        ["Testes", "cafe-puce-47800704.figma.site", "Preview Figma Make"],
        ["Backend", "aztdgagxvrlylszieujs.supabase.co", "Edge Functions + DB + Storage"],
      ]},
      { type: "subtitle", value: "Script de Deploy" },
      { type: "code", language: "bash", value: "#!/bin/bash\n# /home/autopecascarreta/build-and-push.sh\ncd /home/autopecascarreta/repositorio\ngit pull origin main\nnpm install --legacy-peer-deps\nnpm run build\ncp -r dist/* /home/autopecascarreta/public_html/\ngit add -A && git commit -m \"build: deploy $(date +%Y-%m-%d_%H:%M)\"\ngit push origin main" },
      { type: "callout", variant: "warning", value: "O .htaccess no public_html deve ter RewriteRule para redirecionar todas as rotas para index.html (SPA fallback), caso contrario rotas como /catalogo retornam 404." },
    ]
  },
  {
    id: "env-vars",
    title: "Variaveis de Ambiente",
    icon: Lock,
    color: "red",
    content: [
      { type: "text", value: "Variaveis configuradas no Supabase Edge Functions. O frontend NAO acessa nenhuma diretamente." },
      { type: "table", headers: ["Variavel", "Onde", "Descricao"], rows: [
        ["SUPABASE_URL", "Servidor", "URL do projeto Supabase"],
        ["SUPABASE_ANON_KEY", "Frontend + Servidor", "Chave publica anon (segura)"],
        ["SUPABASE_SERVICE_ROLE_KEY", "Servidor APENAS", "Chave admin — NUNCA expor no frontend!"],
        ["SUPABASE_DB_URL", "Servidor", "Connection string PostgreSQL"],
        ["RECAPTCHA_SITE_KEY", "Frontend", "Site key reCAPTCHA v3"],
        ["RECAPTCHA_SECRET_KEY", "Servidor APENAS", "Secret key reCAPTCHA v3"],

        ["GOOGLE_PSI_API_KEY", "Servidor", "API key PageSpeed Insights"],
      ]},
      { type: "callout", variant: "warning", value: "A SUPABASE_SERVICE_ROLE_KEY NUNCA deve ser exposta no frontend. Daria acesso total ao banco de dados." },
      { type: "subtitle", value: "Credenciais Dinamicas (KV)" },
      { type: "text", value: "Credenciais salvas no KV pelo admin, lidas pelo servidor em runtime:" },
      { type: "list", items: [
        "SIGE Token/URL: KV 'sige_config' (AdminApiSige)",
        "PagHiper Key/Token: KV 'paghiper_config' (AdminPagHiper)",
        "Mercado Pago Token: KV 'mercadopago_config' (AdminMercadoPago)",
        "Frete API Key: KV 'shipping_config' (AdminShipping)",
        "GA4 ID: KV 'ga4_config' (AdminGA4)",
      ]},
    ]
  },
  {
    id: "glossary",
    title: "Glossario",
    icon: BookOpen,
    color: "slate",
    content: [
      { type: "text", value: "Termos tecnicos usados na documentacao e no codigo." },
      { type: "table", headers: ["Termo", "Significado"], rows: [
        ["SPA", "Single Page Application — app web que roda no browser sem recarregar"],
        ["BFF", "Backend For Frontend — servidor que agrega dados para o frontend"],
        ["KV", "Key-Value — banco chave-valor simples (chave → valor JSON)"],
        ["SIGE", "Sistema Integrado de Gestao Empresarial — ERP externo"],
        ["SKU", "Stock Keeping Unit — codigo unico do produto"],
        ["codRef", "Codigo de Referencia — ID do produto na API SIGE"],
        ["Tier de Preco", "Tabela de preco (V1-V5) — atacado, varejo, etc."],
        ["TTL", "Time To Live — tempo de validade no cache"],
        ["Edge Function", "Funcao serverless no edge (Supabase + Deno)"],
        ["Hono", "Framework web leve para JS/TS (Deno, Bun, Workers)"],
        ["Lazy Loading", "Carregamento sob demanda (codigo so baixa quando necessario)"],
        ["Code Splitting", "Divisao do bundle JS em chunks (1 arquivo por pagina)"],
        ["CLS", "Cumulative Layout Shift — mudancas visuais inesperadas"],
        ["LCP", "Largest Contentful Paint — maior elemento visivel renderizado"],
        ["Prefetch", "Carregar recursos antecipadamente em background"],
        ["Bulk Seed", "Dados em lote plantados nos caches individuais"],
        ["Semaphore", "Controle de concorrencia (max 8 requests simultaneos)"],
        ["LGPD", "Lei Geral de Protecao de Dados (privacidade brasileira)"],
        ["CSP", "Content Security Policy — controla recursos do browser"],
        ["JWT", "JSON Web Token — token assinado para autenticacao"],
        ["Signed URL", "URL temporaria com assinatura para arquivo privado"],
        ["Isolate", "Instancia isolada da Edge Function"],
        ["PIX", "Pagamento instantaneo brasileiro via QR code"],
        ["Webhook", "URL que recebe notificacoes automaticas de servicos"],
      ]},
    ]
  },
];

/* ═══════════════════════════════════════════════════════════════════ */
/*  COLOR UTILS                                                       */
/* ═══════════════════════════════════════════════════════════════════ */

function colorClasses(color: string) {
  var map: Record<string, { bg: string; bgLight: string; text: string; border: string; ring: string }> = {
    blue:    { bg: "bg-blue-600",    bgLight: "bg-blue-50",    text: "text-blue-600",    border: "border-blue-200",    ring: "ring-blue-500/20" },
    green:   { bg: "bg-green-600",   bgLight: "bg-green-50",   text: "text-green-600",   border: "border-green-200",   ring: "ring-green-500/20" },
    purple:  { bg: "bg-purple-600",  bgLight: "bg-purple-50",  text: "text-purple-600",  border: "border-purple-200",  ring: "ring-purple-500/20" },
    orange:  { bg: "bg-orange-600",  bgLight: "bg-orange-50",  text: "text-orange-600",  border: "border-orange-200",  ring: "ring-orange-500/20" },
    indigo:  { bg: "bg-indigo-600",  bgLight: "bg-indigo-50",  text: "text-indigo-600",  border: "border-indigo-200",  ring: "ring-indigo-500/20" },
    cyan:    { bg: "bg-cyan-600",    bgLight: "bg-cyan-50",    text: "text-cyan-600",    border: "border-cyan-200",    ring: "ring-cyan-500/20" },
    amber:   { bg: "bg-amber-600",   bgLight: "bg-amber-50",   text: "text-amber-600",   border: "border-amber-200",   ring: "ring-amber-500/20" },
    emerald: { bg: "bg-emerald-600", bgLight: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-200", ring: "ring-emerald-500/20" },
    rose:    { bg: "bg-rose-600",    bgLight: "bg-rose-50",    text: "text-rose-600",    border: "border-rose-200",    ring: "ring-rose-500/20" },
    red:     { bg: "bg-red-600",     bgLight: "bg-red-50",     text: "text-red-600",     border: "border-red-200",     ring: "ring-red-500/20" },
    yellow:  { bg: "bg-yellow-600",  bgLight: "bg-yellow-50",  text: "text-yellow-700",  border: "border-yellow-200",  ring: "ring-yellow-500/20" },
    sky:     { bg: "bg-sky-600",     bgLight: "bg-sky-50",     text: "text-sky-600",     border: "border-sky-200",     ring: "ring-sky-500/20" },
    slate:   { bg: "bg-slate-600",   bgLight: "bg-slate-50",   text: "text-slate-600",   border: "border-slate-200",   ring: "ring-slate-500/20" },
  };
  return map[color] || map.blue;
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  BLOCK RENDERERS                                                   */
/* ═══════════════════════════════════════════════════════════════════ */

function TextBlock({ value }: { value: string }) {
  return <p className="text-gray-700 leading-relaxed" style={{ fontSize: "0.95rem" }}>{value}</p>;
}

function SubtitleBlock({ value }: { value: string }) {
  return (
    <h3 className="text-gray-900 mt-6 mb-2 flex items-center gap-2" style={{ fontSize: "1.05rem", fontWeight: 700 }}>
      <div className="w-1 h-5 bg-red-500 rounded-full" />
      {value}
    </h3>
  );
}

function DiagramBlock({ value }: { value: string }) {
  return (
    <div className="bg-gray-900 text-green-400 rounded-xl p-5 overflow-x-auto my-4">
      <pre className="whitespace-pre" style={{ fontSize: "0.82rem", fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace" }}>
        {value}
      </pre>
    </div>
  );
}

function TreeBlock({ value }: { value: string }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 overflow-x-auto my-4">
      <pre className="text-gray-700 whitespace-pre" style={{ fontSize: "0.78rem", lineHeight: 1.6, fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace" }}>
        {value}
      </pre>
    </div>
  );
}

function TableBlock({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto my-4 rounded-xl border border-gray-200">
      <table className="w-full text-left" style={{ fontSize: "0.82rem" }}>
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {headers.map(function (h, i) {
              return <th key={i} className="px-4 py-2.5 text-gray-600" style={{ fontWeight: 600, fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>;
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map(function (row, ri) {
            return (
              <tr key={ri} className={"border-b border-gray-100 " + (ri % 2 === 0 ? "bg-white" : "bg-gray-50/50") + " hover:bg-blue-50/40 transition-colors"}>
                {row.map(function (cell, ci) {
                  return (
                    <td key={ci} className="px-4 py-2.5 text-gray-700">
                      {ci === 0 && headers[0] === "Metodo" ? (
                        <span className="inline-flex gap-1 flex-wrap">
                          {cell.split("/").map(function (m, mi) {
                            var methodColors: Record<string, string> = {
                              "GET": "bg-green-100 text-green-700",
                              "POST": "bg-blue-100 text-blue-700",
                              "PUT": "bg-amber-100 text-amber-700",
                              "DELETE": "bg-red-100 text-red-700",
                            };
                            return <span key={mi} className={"px-1.5 py-0.5 rounded font-mono " + (methodColors[m.trim()] || "bg-gray-100 text-gray-600")} style={{ fontSize: "0.7rem", fontWeight: 600 }}>{m.trim()}</span>;
                          })}
                        </span>
                      ) : ci === 1 && (headers[0] === "Metodo" || headers[1] === "Rota") ? (
                        <code className="text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded" style={{ fontSize: "0.78rem" }}>{cell}</code>
                      ) : (
                        cell
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ListBlock({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 my-3">
      {items.map(function (item, i) {
        var isNumbered = /^\d+\./.test(item);
        return (
          <li key={i} className="flex items-start gap-2.5 text-gray-700" style={{ fontSize: "0.9rem" }}>
            {isNumbered ? (
              <span className="shrink-0 w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center mt-0.5" style={{ fontSize: "0.65rem", fontWeight: 700 }}>{item.match(/^\d+/)![0]}</span>
            ) : (
              <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-gray-400 mt-2" />
            )}
            <span className="leading-relaxed">{isNumbered ? item.replace(/^\d+\.\s*/, "") : item}</span>
          </li>
        );
      })}
    </ul>
  );
}

function CodeBlock({ value }: { value: string }) {
  var [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(value).catch(function () {});
    setCopied(true);
    setTimeout(function () { setCopied(false); }, 2000);
  }
  return (
    <div className="relative group my-4">
      <button
        onClick={handleCopy}
        className="absolute top-3 right-3 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-gray-400 hover:text-white transition-all opacity-0 group-hover:opacity-100"
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
      <div className="bg-gray-900 rounded-xl p-5 overflow-x-auto">
        <pre className="text-gray-300 whitespace-pre" style={{ fontSize: "0.78rem", lineHeight: 1.65, fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace" }}>
          {value}
        </pre>
      </div>
    </div>
  );
}

function CalloutBlock({ variant, value }: { variant: "info" | "warning" | "tip"; value: string }) {
  var styles = {
    info:    { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-800", icon: <Eye className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" /> },
    warning: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800", icon: <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" /> },
    tip:     { bg: "bg-green-50", border: "border-green-200", text: "text-green-800", icon: <Zap className="w-4 h-4 text-green-500 shrink-0 mt-0.5" /> },
  };
  var s = styles[variant];
  return (
    <div className={"flex items-start gap-3 rounded-xl border p-4 my-4 " + s.bg + " " + s.border}>
      {s.icon}
      <p className={s.text} style={{ fontSize: "0.88rem", lineHeight: 1.6 }}>{value}</p>
    </div>
  );
}

function RenderBlock({ block }: { block: DocBlock }) {
  switch (block.type) {
    case "text": return <TextBlock value={block.value} />;
    case "subtitle": return <SubtitleBlock value={block.value} />;
    case "diagram": return <DiagramBlock value={block.value} />;
    case "tree": return <TreeBlock value={block.value} />;
    case "table": return <TableBlock headers={block.headers} rows={block.rows} />;
    case "list": return <ListBlock items={block.items} />;
    case "code": return <CodeBlock value={block.value} />;
    case "callout": return <CalloutBlock variant={block.variant} value={block.value} />;
    default: return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  MAIN PAGE                                                         */
/* ═══════════════════════════════════════════════════════════════════ */

export function DocsPage() {
  var [activeSection, setActiveSection] = useState(sections[0].id);
  var [search, setSearch] = useState("");
  var [sidebarOpen, setSidebarOpen] = useState(false);
  var [readProgress, setReadProgress] = useState(0);
  var [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  var sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Reading progress bar
  useEffect(function () {
    function handleScroll() {
      var scrollTop = window.scrollY;
      var docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight > 0) {
        setReadProgress(Math.min((scrollTop / docHeight) * 100, 100));
      }
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return function () { window.removeEventListener("scroll", handleScroll); };
  }, []);

  var toggleCollapse = useCallback(function (id: string) {
    setCollapsedSections(function (prev) {
      var next = Object.assign({}, prev);
      next[id] = !prev[id];
      return next;
    });
  }, []);

  // Search filter
  var filteredSections = useMemo(function () {
    if (!search.trim()) return sections;
    var q = search.toLowerCase();
    return sections.filter(function (sec) {
      if (sec.title.toLowerCase().includes(q)) return true;
      return sec.content.some(function (block) {
        if ("value" in block && typeof block.value === "string") return block.value.toLowerCase().includes(q);
        if ("items" in block) return block.items.some(function (item) { return item.toLowerCase().includes(q); });
        if ("rows" in block) return block.rows.some(function (row) { return row.some(function (cell) { return cell.toLowerCase().includes(q); }); });
        return false;
      });
    });
  }, [search]);

  // Intersection observer for active section
  useEffect(function () {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          setActiveSection(entry.target.id);
        }
      });
    }, { rootMargin: "-80px 0px -60% 0px", threshold: 0 });

    sections.forEach(function (sec) {
      var el = sectionRefs.current[sec.id];
      if (el) observer.observe(el);
    });

    return function () { observer.disconnect(); };
  }, []);

  var scrollToSection = useCallback(function (id: string) {
    var el = sectionRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveSection(id);
      setSidebarOpen(false);
    }
  }, []);

  var totalRoutes = "~400";
  var totalComponents = "~50";
  var totalFiles = "~185";

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Reading progress bar */}
      <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-gray-200/50">
        <div
          className="h-full bg-gradient-to-r from-red-500 to-red-600 transition-all duration-150"
          style={{ width: readProgress + "%" }}
        />
      </div>

      {/* Breadcrumb */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <nav className="flex items-center gap-1.5 text-gray-500" style={{ fontSize: "0.8rem" }}>
            <Link to="/" className="hover:text-red-600 transition-colors flex items-center gap-1">
              <Home className="w-3.5 h-3.5" />
              Inicio
            </Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-gray-900 font-medium">Documentacao Tecnica</span>
          </nav>
        </div>
      </div>

      {/* Header */}
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 py-10 lg:py-14">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-red-600 rounded-2xl shadow-lg shadow-red-600/30">
              <BookOpen className="w-7 h-7" />
            </div>
            <div>
              <h1 style={{ fontSize: "1.8rem", fontWeight: 800 }}>Documentacao Tecnica</h1>
              <p className="text-gray-400" style={{ fontSize: "0.95rem" }}>Carretao Auto Pecas — Guia Completo da Arquitetura</p>
            </div>
          </div>

          {/* Stats */}
          <div className="flex flex-wrap gap-3 mt-6">
            {[
              { icon: FileCode, label: "Arquivos", value: totalFiles },
              { icon: Server, label: "Rotas API", value: totalRoutes },
              { icon: Layers, label: "Componentes", value: totalComponents },
              { icon: Database, label: "Cache Layers", value: "9+9" },
            ].map(function (stat) {
              return (
                <div key={stat.label} className="flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2.5">
                  <stat.icon className="w-4 h-4 text-red-400" />
                  <span className="text-white" style={{ fontSize: "0.85rem", fontWeight: 700 }}>{stat.value}</span>
                  <span className="text-gray-400" style={{ fontSize: "0.8rem" }}>{stat.label}</span>
                </div>
              );
            })}
          </div>

          {/* Search */}
          <div className="relative mt-6 max-w-xl">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={function (e) { setSearch(e.target.value); }}
              placeholder="Buscar na documentacao..."
              className="w-full pl-10 pr-4 py-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50"
              style={{ fontSize: "0.9rem" }}
            />
            {search && (
              <button onClick={function () { setSearch(""); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile sidebar toggle */}
      <div className="lg:hidden sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-2.5">
        <button
          onClick={function () { setSidebarOpen(!sidebarOpen); }}
          className="flex items-center gap-2 text-gray-700 hover:text-red-600 transition-colors"
          style={{ fontSize: "0.88rem", fontWeight: 600 }}
        >
          <Menu className="w-5 h-5" />
          Navegacao
          {sidebarOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6 lg:py-10 flex gap-8">
        {/* Sidebar */}
        <aside className={"shrink-0 lg:block " + (sidebarOpen ? "fixed inset-0 z-40 bg-white p-4 pt-16 overflow-y-auto lg:relative lg:inset-auto lg:z-auto lg:p-0 lg:pt-0" : "hidden lg:block")} style={{ width: "260px" }}>
          {sidebarOpen && (
            <button onClick={function () { setSidebarOpen(false); }} className="absolute top-4 right-4 lg:hidden p-2 text-gray-500 hover:text-gray-700">
              <X className="w-5 h-5" />
            </button>
          )}
          <div className="sticky top-24">
            <h2 className="text-gray-400 mb-3" style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Secoes</h2>
            <nav className="space-y-0.5">
              {sections.map(function (sec) {
                var isActive = activeSection === sec.id;
                var c = colorClasses(sec.color);
                var isInSearch = !search || filteredSections.some(function (f) { return f.id === sec.id; });
                return (
                  <button
                    key={sec.id}
                    onClick={function () { scrollToSection(sec.id); }}
                    disabled={!isInSearch}
                    className={"w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all " +
                      (isActive ? c.bgLight + " " + c.text + " ring-1 " + c.ring : "hover:bg-gray-100 text-gray-600") +
                      (!isInSearch ? " opacity-30 cursor-not-allowed" : " cursor-pointer")}
                    style={{ fontSize: "0.84rem", fontWeight: isActive ? 600 : 400 }}
                  >
                    <sec.icon className="w-4 h-4 shrink-0" />
                    {sec.title}
                  </button>
                );
              })}
            </nav>

            {/* Section count */}
            <div className="mt-4 px-3 py-2 bg-gray-100 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="text-gray-500" style={{ fontSize: "0.7rem", fontWeight: 600 }}>Progresso de leitura</span>
                <span className="text-gray-700" style={{ fontSize: "0.7rem", fontWeight: 700 }}>{Math.round(readProgress)}%</span>
              </div>
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-red-500 rounded-full transition-all duration-300" style={{ width: readProgress + "%" }} />
              </div>
            </div>

            {/* Legend */}
            <div className="mt-8 pt-6 border-t border-gray-200">
              <h2 className="text-gray-400 mb-3" style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Legenda</h2>
              <div className="space-y-2">
                {[
                  { color: "bg-green-100 text-green-700", label: "GET" },
                  { color: "bg-blue-100 text-blue-700", label: "POST" },
                  { color: "bg-amber-100 text-amber-700", label: "PUT" },
                  { color: "bg-red-100 text-red-700", label: "DELETE" },
                ].map(function (m) {
                  return (
                    <div key={m.label} className="flex items-center gap-2">
                      <span className={"px-1.5 py-0.5 rounded font-mono " + m.color} style={{ fontSize: "0.65rem", fontWeight: 600 }}>{m.label}</span>
                      <span className="text-gray-500" style={{ fontSize: "0.75rem" }}>HTTP Method</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          {filteredSections.length === 0 ? (
            <div className="text-center py-20">
              <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500" style={{ fontSize: "1rem", fontWeight: 600 }}>Nenhum resultado para "{search}"</p>
              <p className="text-gray-400 mt-1" style={{ fontSize: "0.88rem" }}>Tente termos como "cache", "preco", "checkout", "SIGE"</p>
            </div>
          ) : (
            <div className="space-y-10">
              {filteredSections.map(function (sec) {
                var c = colorClasses(sec.color);
                var Icon = sec.icon;
                return (
                  <section
                    key={sec.id}
                    id={sec.id}
                    ref={function (el) { sectionRefs.current[sec.id] = el; }}
                    className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm"
                    style={{ scrollMarginTop: "100px" }}
                  >
                    {/* Section header — click to collapse */}
                    <button
                      onClick={function () { toggleCollapse(sec.id); }}
                      className={"flex items-center gap-3 px-6 py-4 border-b w-full text-left cursor-pointer hover:brightness-95 transition-all " + c.border + " " + c.bgLight}
                    >
                      <div className={"p-2 rounded-xl " + c.bg + " text-white"}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <h2 className="text-gray-900 flex-1" style={{ fontSize: "1.25rem", fontWeight: 800 }}>{sec.title}</h2>
                      <span className="text-gray-400 shrink-0">
                        {collapsedSections[sec.id] ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                      </span>
                    </button>

                    {/* Section content (collapsible) */}
                    {!collapsedSections[sec.id] && (
                      <div className="px-6 py-5">
                        {sec.content.map(function (block, i) {
                          return <RenderBlock key={i} block={block} />;
                        })}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}

          {/* Footer info */}
          <div className="mt-10 text-center text-gray-400 pb-10" style={{ fontSize: "0.8rem" }}>
            <p>Documentacao gerada a partir do arquivo ARCHITECTURE.tsx</p>
            <p className="mt-1">Carretao Auto Pecas — autopecascarretao.com.br</p>
          </div>
        </main>
      </div>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={function () { setSidebarOpen(false); }} />
      )}
    </div>
  );
}