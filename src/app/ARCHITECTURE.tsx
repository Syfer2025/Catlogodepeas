/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║               CARRETAO AUTO PECAS - DOCUMENTACAO TECNICA                    ║
 * ║                   Guia Completo da Arquitetura do Sistema                    ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 *
 * ESTE ARQUIVO E SOMENTE DOCUMENTACAO. Nao exporta nada. Nao e importado.
 * Serve como guia de referencia para desenvolvedores que vao revisar o codigo.
 *
 * Dominio: autopecascarretao.com.br
 * Stack:   React 18 + React Router (Data mode) + Tailwind CSS v4 + Hono (Deno) + Supabase
 * Hospedagem: cPanel compartilhado (frontend) + Supabase Edge Functions (backend)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * 1. VISAO GERAL DA ARQUITETURA
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * O sistema segue uma arquitetura de 3 camadas:
 *
 *   [Browser/React SPA] ──> [Supabase Edge Function (Hono)] ──> [Supabase DB + API SIGE]
 *        Frontend                    Servidor (Proxy)                 Dados
 *
 * - O FRONTEND e uma Single Page Application (SPA) React que roda no browser.
 *   Faz code splitting agressivo via React.lazy + React Router lazy routes.
 *
 * - O SERVIDOR e uma Edge Function Supabase rodando Hono (framework web para Deno).
 *   Atua como proxy/BFF (Backend For Frontend): agrega dados do Supabase DB
 *   e da API externa SIGE (sistema ERP), aplica cache, validacao e seguranca.
 *
 * - O BANCO e o Supabase PostgreSQL com uma unica tabela KV (kv_store_b7b07654).
 *   Toda a persistencia usa chave-valor (key-value), sem schema relacional.
 *   Razao: limitacao do ambiente Figma Make (nao suporta migrations SQL).
 *
 * - A API SIGE e o sistema ERP externo que fornece:
 *   - Catalogo de produtos (titulos, SKUs, referencias)
 *   - Precos (5 tabelas: V1-V5 — atacado/varejo/etc.)
 *   - Saldos de estoque (por deposito)
 *   - Clientes, pedidos, notas fiscais
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * 2. ESTRUTURA DE DIRETORIOS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * /src/app/
 * ├── App.tsx                    # Raiz da aplicacao: providers + RouterProvider
 * ├── routes.ts                  # Definicao de TODAS as rotas do React Router
 * ├── ARCHITECTURE.tsx           # << ESTE ARQUIVO (documentacao)
 * │
 * ├── components/                # Componentes reutilizaveis do frontend
 * │   ├── Layout.tsx             # Shell principal: Header + Outlet + Footer + overlays
 * │   ├── Header.tsx             # Cabecalho: logo, busca, carrinho, menu usuario
 * │   ├── Footer.tsx             # Rodape: links, selos, LGPD
 * │   ├── ProductCard.tsx        # Card de produto (grid do catalogo/home)
 * │   ├── PriceBadge.tsx         # Badge de preco com cache de modulo
 * │   ├── StockBar.tsx           # Barra de estoque visual
 * │   ├── StockBadge.tsx         # Badge textual de estoque
 * │   ├── ReviewStars.tsx        # Estrelas de avaliacao
 * │   ├── ProductImage.tsx       # Imagem de produto com fallback inteligente
 * │   ├── SuperPromoSection.tsx  # Secao de Super Promocao (carousel de ofertas)
 * │   ├── CartDrawer.tsx         # Gaveta lateral do carrinho (animada com Motion)
 * │   ├── SearchAutocomplete.tsx # Campo de busca com autocomplete
 * │   ├── CategoryMegaMenu.tsx   # Mega menu de categorias
 * │   ├── HomeReels.tsx          # Reels de produtos (videos curtos estilo TikTok)
 * │   ├── BrandCarousel.tsx      # Carousel de marcas parceiras
 * │   ├── InfluencerCarousel.tsx # Carousel de influenciadores
 * │   ├── CouponCarousel.tsx     # Carousel de cupons na homepage
 * │   ├── CouponMegaMenu.tsx     # Mega menu de cupons no header
 * │   ├── ShippingCalculator.tsx # Calculadora de frete (CEP → opcoes)
 * │   ├── ProductReviews.tsx     # Sistema de avaliacoes do produto
 * │   ├── ProductReels.tsx       # Reels na pagina de detalhe do produto
 * │   ├── ShareButtons.tsx       # Botoes de compartilhamento social
 * │   ├── WishlistButton.tsx     # Botao de favoritar (coracao)
 * │   ├── AddToCartButton.tsx    # Botao "Adicionar ao Carrinho"
 * │   ├── CheckoutAddressManager.tsx # Gerenciador de enderecos no checkout
 * │   ├── MobileBottomNav.tsx    # Navegacao inferior mobile (tabs fixas)
 * │   ├── WhatsAppButton.tsx     # Botao flutuante do WhatsApp
 * │   ├── ScrollToTopButton.tsx  # Botao "Voltar ao topo"
 * │   ├── CookieConsentBanner.tsx # Banner LGPD de consentimento de cookies
 * │   ├── ExitIntentPopup.tsx    # Popup de saida (exit intent)
 * │   ├── GoogleReviewsBadge.tsx # Badge do Google Reviews
 * │   ├── CartAbandonedTracker.tsx # Rastreador de carrinho abandonado
 * │   ├── GA4Provider.tsx        # Provider do Google Analytics 4
 * │   ├── GTMProvider.tsx        # Provider do Google Tag Manager
 * │   ├── MarketingPixels.tsx    # Pixels de marketing (Meta, TikTok, etc.)
 * │   ├── WebVitalsReporter.tsx  # Coleta de metricas Web Vitals
 * │   ├── GlobalErrorCollector.tsx # Coletor global de erros JS
 * │   ├── ErrorBoundary.tsx      # Error boundary generico React
 * │   ├── OptimizedImage.tsx     # Componente de imagem otimizada
 * │   ├── VirtualProductGrid.tsx # Grid virtualizado (grandes listas)
 * │   ├── RecentlyViewedSection.tsx # "Vistos recentemente" (localStorage)
 * │   ├── JsonLdBreadcrumb.tsx   # Breadcrumb com structured data
 * │   ├── SwipeHint.tsx          # Dica visual de swipe mobile
 * │   ├── TrackingTimeline.tsx   # Timeline de rastreio de pedidos
 * │   ├── AvatarPicker.tsx       # Seletor de avatar do perfil
 * │   ├── HeaderCepInput.tsx     # Input de CEP no header
 * │   ├── ProductCardSkeleton.tsx # Skeleton do card de produto
 * │   ├── CategoryCard.tsx       # Card de categoria
 * │   ├── ui/                    # Componentes shadcn/ui (biblioteca de UI)
 * │   └── figma/                 # Componentes gerados pelo Figma
 * │
 * ├── pages/                     # Paginas (uma por rota)
 * │   ├── HomePage.tsx           # Pagina inicial (banners, promo, destaques)
 * │   ├── CatalogPage.tsx        # Catalogo com filtros e paginacao
 * │   ├── ProductDetailPage.tsx  # Detalhe do produto (preco, estoque, fotos)
 * │   ├── CheckoutPage.tsx       # Fluxo de checkout (carrinho → pagamento)
 * │   ├── ContactPage.tsx        # Pagina de contato
 * │   ├── AboutPage.tsx          # Sobre nos
 * │   ├── UserAuthPage.tsx       # Login/cadastro de clientes
 * │   ├── UserAccountPage.tsx    # Painel "Minha Conta" do cliente
 * │   ├── UserResetPasswordPage.tsx # Redefinicao de senha
 * │   ├── BrandPage.tsx          # Pagina de marca especifica
 * │   ├── AffiliatePage.tsx      # Pagina de afiliados
 * │   ├── CouponsPage.tsx        # Pagina de cupons disponiveis
 * │   ├── TrackingPage.tsx       # Rastreio de pedido
 * │   ├── FaqPage.tsx            # Perguntas frequentes
 * │   ├── PrivacyPolicyPage.tsx  # Politica de privacidade (LGPD)
 * │   ├── TermsPage.tsx          # Termos de uso
 * │   ├── LgpdRightsPage.tsx     # Exercicio de direitos LGPD
 * │   ├── NotFoundPage.tsx       # Pagina 404
 * │   │
 * │   └── admin/                 # Painel administrativo (todas lazy-loaded)
 * │       ├── AdminPage.tsx      # Shell do admin: sidebar + tabs + auth
 * │       ├── AdminLoginPage.tsx # Tela de login do admin
 * │       ├── adminAuth.ts       # Helpers de autenticacao admin (tokens, refresh)
 * │       ├── AdminDashboard.tsx  # Dashboard com metricas e graficos
 * │       ├── AdminProducts.tsx   # CRUD de produtos
 * │       ├── AdminCategories.tsx # CRUD de categorias
 * │       ├── AdminOrders.tsx     # Gestao de pedidos
 * │       ├── AdminClients.tsx    # Lista de clientes
 * │       ├── AdminBanners.tsx    # Gestao de banners da homepage
 * │       ├── AdminMidBanners.tsx # Banners intermediarios da homepage
 * │       ├── AdminSuperPromo.tsx # Configuracao da Super Promocao
 * │       ├── AdminCoupons.tsx    # CRUD de cupons de desconto
 * │       ├── AdminBrands.tsx     # Gestao de marcas
 * │       ├── AdminReels.tsx      # Upload/gestao de reels (videos curtos)
 * │       ├── AdminInfluencers.tsx # Gestao de influenciadores
 * │       ├── AdminReviews.tsx    # Moderacao de avaliacoes
 * │       ├── AdminSettings.tsx   # Configuracoes gerais do site
 * │       ├── AdminShipping.tsx   # Configuracao de frete
 * │       ├── AdminShippingTables.tsx # Tabelas de frete customizadas
 * │       ├── AdminHomepageCategories.tsx # Categorias em destaque na home
 * │       ├── AdminFooterBadges.tsx # Selos do rodape (pagamento, etc.)
 * │       ├── AdminGA4.tsx        # Configuracao Google Analytics 4
 * │       ├── AdminMarketing.tsx  # Pixels de marketing
 * │       ├── AdminEmailMarketing.tsx # Campanhas de email
 * │       ├── AdminExitIntent.tsx # Configuracao do popup de saida
 * │       ├── AdminWhatsApp.tsx   # Configuracao do WhatsApp
 * │       ├── AdminApiSige.tsx    # Painel de integracao SIGE (testes, debug)
 * │       ├── AdminPagHiper.tsx   # Config gateway PagHiper (boleto/pix)
 * │       ├── AdminMercadoPago.tsx # Config Mercado Pago
 * │       ├── AdminAffiliates.tsx # Gestao de afiliados
 * │       ├── AdminWarranty.tsx   # Planos de garantia estendida
 * │       ├── AdminAuditLog.tsx   # Log de auditoria (acoes do admin)
 * │       ├── AdminAdmins.tsx     # Gestao de administradores + permissoes
 * │       ├── AdminAttributes.tsx # Atributos de produtos (Excel upload)
 * │       ├── AdminAutoCateg.tsx  # Categorizacao automatica por IA
 * │       ├── AdminBranches.tsx   # Filiais/depositos
 * │       ├── AdminDimensions.tsx # Dimensoes fisicas (peso/medidas)
 * │       ├── AdminFaq.tsx        # CRUD de perguntas frequentes
 * │       ├── AdminLgpdRequests.tsx # Solicitacoes LGPD
 * │       ├── AdminInfrastructure.tsx # Painel de infraestrutura
 * │       ├── AdminRegressionTest.tsx # Testes de regressao automatizados
 * │       ├── AdminErrorScanner.tsx # Scanner de erros do site
 * │       ├── AdminBulkCategoryAssign.tsx # Atribuicao em massa de categorias
 * │       ├── AdminSisfreteWT.tsx # Config Sisfrete (transportadoras)
 * │       ├── AdminResetPasswordPage.tsx # Reset de senha do admin
 * │       └── Sige*.tsx           # ~15 modulos de integracao detalhada com SIGE
 * │
 * ├── contexts/                  # React Contexts (estado global)
 * │   ├── CartContext.tsx         # Carrinho de compras (localStorage + estado)
 * │   ├── WishlistContext.tsx     # Lista de desejos (sincronizada com servidor)
 * │   ├── AffiliateContext.tsx    # Codigo de afiliado (URL ?ref=CODE → cookie)
 * │   ├── CatalogModeContext.tsx  # Modo catalogo (oculta precos se ativo)
 * │   └── HomepageInitContext.tsx # Cache da homepage (dados iniciais com TTL)
 * │
 * ├── services/                  # Camada de servicos
 * │   ├── api.ts                 # Cliente HTTP principal (~4000 linhas)
 * │   └── supabaseClient.ts      # Singleton do Supabase client
 * │
 * ├── hooks/                     # Custom hooks
 * │   ├── useDocumentMeta.ts     # SEO: title, OG tags, JSON-LD, canonical
 * │   ├── useRecaptcha.ts        # reCAPTCHA v3 (atualmente desabilitado)
 * │   ├── useRecentlyViewed.ts   # Produtos visualizados recentemente
 * │   ├── useApiData.ts          # Hook generico para fetch de dados
 * │   └── useIdlePrefetch.ts     # Prefetch de recursos em idle time
 * │
 * ├── utils/                     # Utilitarios puros
 * │   ├── prefetch.ts            # Prefetch de chunks de rota e dados de produto
 * │   ├── lazyWithRetry.tsx      # React.lazy com retry automatico
 * │   ├── utmTracker.ts          # Captura de parametros UTM
 * │   ├── clipboard.ts           # Copiar para area de transferencia
 * │   └── emptyStateAnimations.ts # CSS para animacoes de estados vazios
 * │
 * └── data/                      # Dados estaticos/defaults
 *     ├── categoryTree.ts        # Arvore de categorias padrao
 *     └── products.ts            # Tipos de produto
 *
 * /supabase/functions/server/    # Backend (Supabase Edge Function)
 * ├── index.tsx                  # Servidor Hono principal (~23k linhas, ~400 rotas)
 * ├── kv_store.tsx               # Utilitario KV (get/set/del/mget/mset)
 * ├── seed.tsx                   # Seed inicial de dados
 * ├── validation.ts              # Validacao e sanitizacao de inputs
 * └── test-shipping-handler.ts   # Handler de teste de frete
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * 3. MAPA DE ROTAS DO FRONTEND (React Router)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Todas as rotas publicas estao dentro do Layout (Header + Footer).
 * As rotas admin sao isoladas (sem Header/Footer publico).
 *
 * ROTAS PUBLICAS (dentro de <Layout>):
 * ┌─────────────────────────────────────┬──────────────────────────────────────────────┐
 * │ Rota                                │ Descricao                                    │
 * ├─────────────────────────────────────┼──────────────────────────────────────────────┤
 * │ /                                   │ Homepage (banners, promo, destaques, reels)  │
 * │ /catalogo                           │ Catalogo com filtros, busca, paginacao       │
 * │ /produto/:id                        │ Detalhe do produto (SKU como :id)            │
 * │ /contato                            │ Formulario de contato                        │
 * │ /sobre                              │ Pagina institucional "Sobre Nos"             │
 * │ /conta                              │ Login/Cadastro de clientes                   │
 * │ /conta/redefinir-senha              │ Redefinicao de senha do cliente              │
 * │ /minha-conta                        │ Painel do cliente (pedidos, favoritos, etc.) │
 * │ /checkout                           │ Fluxo de compra (carrinho → pagamento)       │
 * │ /marca/:slug                        │ Produtos de uma marca especifica             │
 * │ /afiliados                          │ Programa de afiliados                        │
 * │ /cupons                             │ Cupons de desconto disponiveis               │
 * │ /rastreio/:orderId                  │ Rastreamento de pedido                       │
 * │ /faq                                │ Perguntas frequentes                         │
 * │ /politica-de-privacidade            │ Politica de Privacidade (LGPD)               │
 * │ /termos-de-uso                      │ Termos de Uso                                │
 * │ /exercicio-de-direitos              │ Exercicio de Direitos LGPD                   │
 * │ /*                                  │ Pagina 404 (Not Found)                       │
 * └─────────────────────────────────────┴──────────────────────────────────────────────┘
 *
 * ROTAS ADMIN (isoladas, com proprio layout):
 * ┌─────────────────────────────────────┬──────────────────────────────────────────────┐
 * │ /admin                              │ Painel admin (sidebar + tabs lazy-loaded)    │
 * │ /admin/reset-password               │ Reset de senha do admin                      │
 * └─────────────────────────────────────┴──────────────────────────────────────────────┘
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * 4. MAPA DE ROTAS DO SERVIDOR (Hono Edge Function)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Prefixo base: /make-server-b7b07654
 * Todas as rotas usam Authorization: Bearer <anon_key> (Supabase Gateway).
 * Rotas protegidas usam _ut=<user_jwt> como query param para auth de usuario.
 *
 * ── SAUDE / DIAGNOSTICO ──
 * GET  /health                    → Health check simples (warmup do edge function)
 * GET  /health/detailed           → Health check com status DB + SIGE
 * POST /seed                      → Seed inicial de dados (categorias, configs)
 *
 * ── AUTENTICACAO ADMIN ──
 * POST /auth/pre-login-check      → Verifica se email e admin antes do login
 * POST /auth/login-result         → Registra resultado do login no audit log
 * POST /auth/bootstrap-admin      → Bootstrap do primeiro admin (master)
 * POST /auth/claim-admin          → Reivindica role de admin
 * POST /auth/admin-whitelist      → Adiciona/remove email da whitelist admin
 * GET  /auth/admin-whitelist      → Lista emails da whitelist admin
 * GET  /auth/admin-list           → Lista todos admins com detalhes
 * POST /auth/admin-permissions    → Define permissoes por tab para admin
 * GET  /auth/check-admin          → Verifica se usuario autenticado e admin
 * GET  /auth/me                   → Retorna dados do usuario autenticado
 * POST /auth/forgot-password      → Envia email de recuperacao de senha (admin)
 * POST /auth/recovery-status      → Status da recuperacao de senha
 * POST /auth/reset-password       → Reseta senha com token de recuperacao
 *
 * ── AUTENTICACAO CLIENTE (usuario final) ──
 * POST /signup                    → Cadastro de cliente (legado)
 * POST /auth/signup-check         → Verifica se email/CPF/CNPJ ja cadastrado
 * POST /auth/user/signup          → Cadastro completo com dados pessoais
 * GET  /auth/user/me              → Dados do cliente autenticado
 * PUT  /auth/user/profile         → Atualiza perfil do cliente
 * PUT  /auth/user/avatar          → Define avatar (preset)
 * POST /auth/user/avatar/upload   → Upload de avatar personalizado
 * DELETE /auth/user/avatar/custom → Remove avatar customizado
 * POST /auth/user/change-password → Troca senha do cliente
 * POST /auth/user/forgot-password → Recuperacao de senha do cliente
 * GET  /auth/cnpj-lookup          → Consulta CNPJ via API Receita Federal
 * GET  /auth/cnpj-check           → Verifica se CNPJ ja cadastrado
 *
 * ── ENDERECOS DO CLIENTE ──
 * GET    /auth/user/addresses     → Lista enderecos do cliente
 * POST   /auth/user/addresses     → Adiciona novo endereco
 * PUT    /auth/user/addresses/:id → Atualiza endereco existente
 * DELETE /auth/user/addresses/:id → Remove endereco
 *
 * ── FAVORITOS DO CLIENTE ──
 * GET    /auth/user/favorites     → Lista produtos favoritos
 * POST   /auth/user/favorites     → Adiciona favorito
 * DELETE /auth/user/favorites/:sku → Remove favorito
 *
 * ── CLIENTES (admin) ──
 * GET  /auth/admin/clients        → Lista paginada de clientes (admin)
 *
 * ── PRODUTOS (CRUD interno) ──
 * GET    /products                → Lista produtos (KV store)
 * GET    /products/:id            → Produto por ID
 * POST   /products                → Cria produto
 * PUT    /products/:id            → Atualiza produto
 * DELETE /products/:id            → Remove produto
 *
 * ── CATALOGO PUBLICO (integrado com SIGE) ──
 * GET  /produtos                  → Lista paginada com filtros (busca, categoria, etc.)
 *                                   Fonte: KV + SIGE via cache
 * GET  /produtos/destaques        → Produtos em destaque para homepage
 * GET  /produtos/autocomplete     → Autocomplete de busca (titulo + SKU)
 * GET  /produtos/imagens/:sku     → Imagens do produto (Supabase Storage)
 * GET  /produtos/meta/:sku        → Metadados do produto (descricao, SEO)
 * PUT  /produtos/meta/:sku        → Atualiza metadados
 * POST /produtos/meta/bulk        → Atualiza metadados em lote
 * GET  /produtos/meta/all-compact → Lista compacta de todos SKUs+titulos
 * PUT  /produtos/:sku/titulo      → Atualiza titulo do produto
 * PUT  /produtos/:sku/rename      → Renomeia SKU do produto
 * POST /produtos/create           → Cria produto com metadados
 * DELETE /produtos/:sku/delete    → Remove produto e metadados
 * POST /produtos/imagens/:sku/upload → Upload de imagem do produto
 * DELETE /produtos/imagens/:sku/file → Remove imagem especifica
 * POST /produtos/match-skus       → Verifica quais SKUs existem no catalogo
 * GET  /produtos/sige-match/:sku  → Busca correspondencia SKU no SIGE
 * GET  /produtos/atributos        → Lista atributos de produtos
 * POST /produtos/atributos/upload → Upload de atributos via Excel
 * DELETE /produtos/atributos      → Limpa atributos
 * POST /parse-excel               → Parser generico de Excel
 *
 * ── DIMENSOES FISICAS ──
 * GET  /produtos/physical/:sku        → Dimensoes de um produto
 * PUT  /produtos/physical/:sku        → Atualiza dimensoes
 * DELETE /produtos/physical/:sku      → Remove dimensoes
 * GET  /produtos/physical/bulk-list   → Lista dimensoes em lote
 * POST /produtos/physical/bulk-save   → Salva dimensoes em lote
 * POST /produtos/physical/bulk-sync-sige → Sincroniza dimensoes do SIGE
 *
 * ── CATEGORIAS ──
 * GET    /categories              → Lista categorias
 * POST   /categories              → Cria categoria
 * PUT    /categories/:id          → Atualiza categoria
 * DELETE /categories/:id          → Remove categoria
 * GET    /category-tree           → Arvore hierarquica de categorias
 * PUT    /category-tree           → Salva arvore completa
 *
 * ── PRECOS (integrado SIGE) ──
 * GET  /sige/preco/:sku           → Preco de um produto (cache 30min, tier selecionavel)
 * POST /sige/precos/bulk          → Precos em lote (ate 50 SKUs, cache 5min)
 * GET  /admin/price-config        → Config de tier de preco ativo (V1-V5)
 * PUT  /admin/price-config        → Altera tier de preco
 *
 * ── SALDOS/ESTOQUE (integrado SIGE) ──
 * GET  /sige/saldo/:sku           → Saldo de um produto (cache 15min)
 * POST /sige/saldos/bulk          → Saldos em lote (ate 50 SKUs, cache 5min)
 *
 * ── SIGE - APIs detalhadas (modulos admin) ──
 * GET  /sige/produto/:id          → Detalhes do produto no SIGE
 * POST /sige/produto/search       → Busca produtos no SIGE
 * GET  /sige/pedido/:id           → Detalhes do pedido no SIGE
 * POST /sige/pedido               → Cria pedido no SIGE
 * GET  /sige/cliente/:id          → Detalhes do cliente no SIGE
 * POST /sige/cliente              → Cria/atualiza cliente no SIGE
 * GET  /sige/depositos            → Lista depositos
 * GET  /sige/categorias           → Lista categorias SIGE
 * ... (+ ~30 outras rotas SIGE para modulos de integracao)
 *
 * ── SUPER PROMOCAO ──
 * GET  /promo/active              → Promocao ativa atual (publico)
 * GET  /promo/debug               → Debug detalhado da promo (diagnostico)
 * GET  /promo/active-test         → Simula homepage-init para promo + limpa cache
 * GET  /admin/promo               → Config completa da promo (admin)
 * POST /admin/promo               → Salva config da promo
 * DELETE /admin/promo              → Desativa promo
 *
 * ── BANNERS ──
 * GET    /admin/banners           → Lista banners
 * POST   /admin/banners           → Upload de banner
 * PUT    /admin/banners/:id       → Atualiza banner
 * DELETE /admin/banners/:id       → Remove banner
 *
 * ── MID-BANNERS (banners intermediarios da homepage) ──
 * GET    /admin/mid-banners       → Lista mid-banners
 * POST   /admin/mid-banners/:slot → Upload mid-banner (4 slots)
 * DELETE /admin/mid-banners/:slot → Remove mid-banner
 *
 * ── HOMEPAGE CATEGORIES ──
 * GET    /admin/homepage-categories     → Lista categorias da homepage
 * POST   /admin/homepage-categories     → Cria categoria da homepage
 * PUT    /admin/homepage-categories/:id → Atualiza
 * DELETE /admin/homepage-categories/:id → Remove
 *
 * ── LOGO ──
 * GET    /logo                    → URL da logo principal
 * POST   /logo/upload             → Upload nova logo
 * DELETE /logo                    → Remove logo
 * GET    /footer-logo             → URL da logo do rodape
 * POST   /footer-logo/upload      → Upload logo do rodape
 * DELETE /footer-logo             → Remove logo do rodape
 *
 * ── CONFIGURACOES ──
 * GET  /settings                  → Config geral (modo catalogo, WhatsApp, CEP, etc.)
 * PUT  /settings                  → Salva configuracoes
 * GET  /ga4/config                → Config do GA4
 * PUT  /ga4/config                → Salva config do GA4
 * GET  /marketing/config          → Config de pixels de marketing
 * PUT  /marketing/config          → Salva config de marketing
 *
 * ── MENSAGENS/CONTATO ──
 * GET    /messages                → Lista mensagens de contato
 * POST   /messages                → Envia mensagem de contato
 * PUT    /messages/:id            → Marca como lida
 * DELETE /messages/:id            → Remove mensagem
 *
 * ── FRETE ──
 * GET  /shipping/config           → Config de frete (API key, metodo, etc.)
 * PUT  /shipping/config           → Salva config de frete
 * POST /shipping/calculate        → Calcula frete (CEP origem → destino + peso)
 * POST /shipping/test-api         → Testa API de frete
 * GET  /shipping/cep/:cep         → Consulta CEP (via ViaCEP)
 * GET  /shipping/debug-product/:sku → Debug de frete para produto especifico
 * POST /shipping/tables           → Cria/atualiza tabela de frete customizada
 * GET  /shipping/tables           → Lista tabelas de frete
 * GET  /shipping/tables/:id       → Detalhe de tabela
 * DELETE /shipping/tables/:id     → Remove tabela
 *
 * ── PEDIDOS ──
 * POST /orders                    → Cria pedido (checkout)
 * GET  /orders                    → Lista pedidos do usuario
 * GET  /orders/:id                → Detalhe do pedido
 * GET  /admin/orders              → Lista pedidos (admin)
 * PUT  /admin/orders/:id          → Atualiza status do pedido
 *
 * ── PAGAMENTOS ──
 * POST /payment/paghiper/pix      → Gera QR code PIX (PagHiper)
 * POST /payment/paghiper/boleto   → Gera boleto (PagHiper)
 * POST /payment/paghiper/webhook  → Webhook de notificacao PagHiper
 * POST /payment/mercadopago/preference → Cria preferencia Mercado Pago
 * POST /payment/mercadopago/webhook    → Webhook Mercado Pago

 *
 * ── CUPONS ──
 * GET  /coupons/public            → Lista cupons publicos
 * POST /coupons/validate          → Valida cupom no checkout
 * GET  /admin/coupons             → Lista cupons (admin)
 * POST /admin/coupons             → Cria cupom
 * PUT  /admin/coupons/:id         → Atualiza cupom
 * DELETE /admin/coupons/:id       → Remove cupom
 *
 * ── AVALIACOES ──
 * GET  /reviews/:sku              → Lista avaliacoes de um produto
 * POST /reviews/:sku              → Envia avaliacao
 * GET  /reviews/summary/:sku      → Resumo (media + total)
 * POST /reviews/summaries/batch   → Resumos em lote
 * GET  /admin/reviews             → Lista avaliacoes (admin, moderacao)
 * PUT  /admin/reviews/:id         → Aprova/rejeita avaliacao
 * DELETE /admin/reviews/:id       → Remove avaliacao
 *
 * ── GARANTIA ESTENDIDA ──
 * GET  /warranty/plans            → Lista planos de garantia
 * POST /admin/warranty/plans      → Salva planos
 *
 * ── AFILIADOS ──
 * POST /affiliates/register       → Registra clique de afiliado
 * GET  /admin/affiliates          → Lista afiliados e stats
 * POST /admin/affiliates          → Cria/atualiza afiliado
 * DELETE /admin/affiliates/:id    → Remove afiliado
 *
 * ── MARCAS ──
 * GET    /admin/brands            → Lista marcas
 * POST   /admin/brands            → Cria marca
 * PUT    /admin/brands/:id        → Atualiza marca
 * DELETE /admin/brands/:id        → Remove marca
 *
 * ── REELS (videos curtos) ──
 * GET    /reels                   → Lista reels publicos
 * GET    /reels/:sku              → Reels de um produto
 * GET    /admin/reels             → Lista reels (admin)
 * POST   /admin/reels             → Cria reel
 * PUT    /admin/reels/:id         → Atualiza reel
 * DELETE /admin/reels/:id         → Remove reel
 *
 * ── INFLUENCIADORES ──
 * GET    /influencers             → Lista influenciadores publicos
 * GET    /admin/influencers       → Lista influenciadores (admin)
 * POST   /admin/influencers       → Cria influenciador
 * PUT    /admin/influencers/:id   → Atualiza
 * DELETE /admin/influencers/:id   → Remove
 *
 * ── FOOTER BADGES ──
 * GET  /admin/footer-badges       → Lista selos do rodape
 * POST /admin/footer-badges       → Salva selo
 * DELETE /admin/footer-badges/:key → Remove selo
 *
 * ── HOMEPAGE-INIT (endpoint combinado) ──
 * GET /homepage-init              → Retorna TODOS os dados da homepage em 1 chamada:
 *                                   banners, logo, footerLogo, ga4Config,
 *                                   categoryTree, categoryCounts, promo,
 *                                   priceConfig, homepageCategories, midBanners,
 *                                   footerBadges, brands, marketingConfig,
 *                                   exitIntentConfig, googleReviewsConfig
 *                                   Cache em memoria: 10s TTL no servidor
 *
 * ── PRODUTO-DETAIL-INIT (endpoint combinado) ──
 * GET /produto-detail-init/:sku   → Retorna TODOS os dados do detalhe em 1 chamada:
 *                                   meta, images, price, balance, attributes,
 *                                   reviews, reviewSummary, promo, warranty, reels
 *                                   Cache per-SKU: 60s TTL no servidor
 *
 * ── AUDIT LOG ──
 * GET  /admin/audit-log           → Lista entradas do audit log
 *
 * ── AUTO-CATEGORIZACAO ──
 * POST /admin/auto-categorize     → Categoriza produtos automaticamente
 *
 * ── LGPD ──
 * POST /lgpd/request              → Solicitacao de exercicio de direito LGPD
 * GET  /admin/lgpd/requests       → Lista solicitacoes LGPD (admin)
 * PUT  /admin/lgpd/requests/:id   → Atualiza status da solicitacao
 *
 * ── FILIAIS ──
 * GET  /admin/branches            → Lista filiais
 * POST /admin/branches            → Salva filiais
 *
 * ── EMAIL MARKETING ──
 * POST /admin/email/send          → Envia email marketing
 * POST /admin/email/test          → Envia email de teste
 *
 * ── RASTREAMENTO ──
 * GET  /tracking/:orderId         → Info de rastreio do pedido
 * PUT  /admin/tracking/:orderId   → Atualiza codigo de rastreio
 *
 * ── EXIT INTENT ──
 * GET  /exit-intent/config        → Config do popup de saida
 * PUT  /admin/exit-intent/config  → Salva config
 *
 * ── GOOGLE REVIEWS ──
 * GET  /google-reviews/config     → Config do badge Google Reviews
 * PUT  /admin/google-reviews/config → Salva config
 *
 * ── FAQ ──
 * GET  /faq                       → Lista perguntas frequentes (publico)
 * GET  /admin/faq                 → Lista FAQ (admin)
 * POST /admin/faq                 → Salva FAQ
 *
 * ── WHATSAPP ──
 * GET  /whatsapp/config           → Config do WhatsApp
 * PUT  /admin/whatsapp/config     → Salva config WhatsApp
 * POST /cart/abandoned            → Salva snapshot de carrinho abandonado
 * GET  /admin/carts/abandoned     → Lista carrinhos abandonados
 *
 * ── CAPTCHA ──
 * GET  /captcha/site-key          → Retorna site key do reCAPTCHA
 * POST /captcha/verify            → Verifica token reCAPTCHA
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * 5. HIERARQUIA DE PROVIDERS (App.tsx)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * A arvore de providers do App.tsx segue esta ordem (de fora para dentro):
 *
 * <ErrorBoundary>              # Captura erros fatais em qualquer nivel
 *   <CatalogModeProvider>      # Modo catalogo global (oculta precos)
 *     <AffiliateProvider>      # Rastreamento de afiliados (?ref=CODE)
 *       <CartProvider>         # Estado do carrinho (localStorage + React state)
 *         <WishlistProvider>   # Favoritos (sincronizado com servidor)
 *           <RouterProvider>   # React Router com todas as rotas
 *         </WishlistProvider>
 *       </CartProvider>
 *     </AffiliateProvider>
 *   </CatalogModeProvider>
 * </ErrorBoundary>
 *
 * Dentro do Layout.tsx, ha mais providers:
 *
 * <MaintenanceGate>            # Verifica modo manutencao
 *   <HomepageInitProvider>     # Cache de dados da homepage (5min TTL)
 *     <GTMProvider>            # Google Tag Manager
 *       <GA4Provider>          # Google Analytics 4
 *         <MarketingPixelsProvider> # Meta Pixel, TikTok, etc.
 *           <Header />
 *           <Outlet />         # Conteudo da pagina atual
 *           <Footer />
 *           <CartDrawer />     # Gaveta do carrinho (lazy)
 *           <WhatsAppButton /> # Botao flutuante (lazy)
 *           <CookieConsentBanner /> # LGPD consent (lazy)
 *           <ExitIntentPopup />     # Popup de saida (lazy)
 *           <MobileBottomNav />     # Nav mobile (lazy)
 *           <ScrollToTopButton />   # Botao topo (lazy)
 *           <WebVitalsReporter />   # Metricas Core Web Vitals (lazy)
 *           <CartAbandonedTracker/> # Rastreio carrinho abandonado (lazy)
 *         </MarketingPixelsProvider>
 *       </GA4Provider>
 *     </GTMProvider>
 *   </HomepageInitProvider>
 * </MaintenanceGate>
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * 6. FLUXO DE DADOS - HOMEPAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Layout monta → HomepageInitProvider busca GET /homepage-init
 * 2. Servidor retorna JSON com ~12 campos (banners, promo, categorias, etc.)
 * 3. Cache: servidor guarda em memoria por 10s; frontend guarda por 5min
 * 4. HomePage consome via useHomepageInit():
 *    - Banners → HeroBannerCarousel
 *    - Categorias → CategoriesStripInner
 *    - Promo → SuperPromoSection (tambem faz fallback para GET /promo/active)
 *    - Mid-banners → grids de banners intermediarios
 *    - Brands → BrandCarousel
 * 5. Destaques: HomePage busca GET /produtos/destaques → grid de ProductCards
 * 6. Precos/Saldos: bulk-fetch via POST /sige/precos/bulk e /sige/saldos/bulk
 *    - Seeds cache do PriceBadge e StockBar para evitar chamadas individuais
 * 7. Reviews: batch-fetch via POST /reviews/summaries/batch
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * 7. FLUXO DE DADOS - PAGINA DE PRODUTO
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Ao passar mouse no ProductCard → scheduleProductDataPrefetch(sku)
 *    - Faz GET /produto-detail-init/:sku em background (200ms debounce)
 *    - Guarda no cache in-memory (2min TTL)
 * 2. Ao navegar → ProductDetailPage verifica consumeProductDataCache(sku)
 *    - Se cache hit: dados instantaneos, sem loading
 *    - Se cache miss: faz GET /produto-detail-init/:sku (com loading)
 * 3. Servidor retorna: meta, images, price, balance, attributes,
 *    reviews, reviewSummary, promo, warranty, reels em UMA so chamada
 *    - Cache per-SKU no servidor: 60s TTL
 * 4. Preco usa tier selecionado globalmente (V1-V5 via priceConfig)
 * 5. Se promo ativa: aplica desconto (percentage ou fixed) sobre preco
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * 8. SISTEMA DE CACHE (MULTI-CAMADA)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * SERVIDOR:
 * ┌─────────────────────────────┬────────┬────────────────────────────────────────┐
 * │ Cache                       │ TTL    │ Proposito                              │
 * ├─────────────────────────────┼────────┼────────────────────────────────────────┤
 * │ _homepageInitCache          │ 10s    │ Resposta completa do /homepage-init    │
 * │ _productDetailInitCache     │ 60s    │ Resposta per-SKU do /produto-detail    │
 * │ _sigePriceCache (single)    │ 30min  │ Preco individual do SIGE               │
 * │ _sigePriceBulkCache         │ 5min   │ Precos em lote do SIGE                 │
 * │ _sigeBalanceCache (single)  │ 15min  │ Saldo individual do SIGE               │
 * │ _sigeBalanceBulkCache       │ 5min   │ Saldos em lote do SIGE                 │
 * │ _sigeProductCache           │ 5min   │ Dados de produto do SIGE               │
 * │ _autocompletePrefixCache    │ 30s    │ Resultados de autocomplete             │
 * │ _categoryCountsCache        │ 5min   │ Contagem de produtos por categoria     │
 * └─────────────────────────────┴────────┴────────────────────────────────────────┘
 *
 * FRONTEND:
 * ┌─────────────────────────────┬────────┬────────────────────────────────────────┐
 * │ Cache                       │ TTL    │ Proposito                              │
 * ├─────────────────────────────┼────────┼────────────────────────────────────────┤
 * │ HomepageInitContext          │ 5min   │ Dados da homepage (evita re-fetch)     │
 * │ PriceBadge module cache     │ 2min   │ Precos individuais (seeded pelo bulk)  │
 * │ StockBar module cache       │ 2min   │ Saldos individuais (seeded pelo bulk)  │
 * │ ReviewStars module cache    │ 5min   │ Resumos de review (seeded pelo batch)  │
 * │ Product data prefetch cache │ 2min   │ Dados prefetch do detalhe do produto   │
 * │ _destaquesCache             │ 5min   │ Produtos em destaque da homepage       │
 * │ localStorage carrinho       │ ∞      │ Itens do carrinho persistidos          │
 * │ localStorage had_promo      │ ∞      │ Hint de CLS para SuperPromo            │
 * │ localStorage first_banner   │ ∞      │ Preload do primeiro banner (LCP)       │
 * └─────────────────────────────┴────────┴────────────────────────────────────────┘
 *
 * ESTRATEGIA DE INVALIDACAO:
 * - Admin salva algo → frontend chama invalidateHomepageCache()
 *   → limpa _cachedData + incrementa _cacheVersion → listener re-fetch
 * - Admin limpa cache → clearAllPriceCache() + invalidateHomepageCache()
 * - Servidor: POST /admin/promo → invalida _homepageInitCache no isolate atual
 *   (outros isolates expiram pelo TTL de 10s naturalmente)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * 9. SISTEMA DE PRECOS (SIGE)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * A API SIGE retorna 5 tabelas de preco por produto: precoV1 a precoV5.
 * O admin escolhe qual tabela exibir no catalogo via GET/PUT /admin/price-config.
 *
 * Fluxo:
 * 1. Frontend pede preco → POST /sige/precos/bulk (array de SKUs)
 * 2. Servidor consulta SIGE API com codRef (referencia interna)
 * 3. Extrai precoV{tier} do resultado (ex: precoV1 para atacado)
 * 4. Retorna { sku, price, found } para cada SKU
 * 5. Frontend armazena no PriceBadge module cache
 * 6. Se houver promo ativa: computePromoPrice() aplica desconto
 *
 * A funcao resolveItemPrice() no servidor:
 * - Busca o item no array da SIGE filtrando por codRef
 * - Extrai precoV1 (ou V2, V3... conforme tier configurado)
 * - Retorna null se nao encontrado
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * 10. SEGURANCA
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * AUTENTICACAO:
 * - Supabase Auth com JWT (access_token + refresh_token)
 * - Admin: sessao separada em localStorage proprio (carretao_admin_*)
 *   com Supabase client dedicado (non-persisting) para nao contaminar
 *   sessao do cliente em outras abas
 * - Cliente: Supabase client padrao com persistSession
 * - Token passado via ?_ut= query param (evita CORS preflight)
 *
 * AUTORIZACAO ADMIN:
 * - Master admin hardcoded (email fixo)
 * - Whitelist de admins no KV (chave "admin_emails")
 * - Permissoes granulares por tab (chave "admin_perms:<email>")
 * - isAdminUser() verifica token → user_metadata.role === "admin"
 *
 * INPUT VALIDATION:
 * - validation.ts: schema-based validation no servidor
 * - _stripTags(): remove HTML tags (previne stored XSS)
 * - checkBodySize(): limita tamanho do payload
 * - Rate limiting por IP em endpoints sensiveis
 *
 * SEGURANCA HTTP (meta tags no Layout.tsx):
 * - Content-Security-Policy
 * - X-Content-Type-Options: nosniff
 * - X-Frame-Options: SAMEORIGIN
 * - Referrer-Policy: strict-origin-when-cross-origin
 *
 * LGPD:
 * - CookieConsentBanner: consentimento de cookies
 * - /exercicio-de-direitos: formulario de direitos do titular
 * - /admin/lgpd/requests: painel de solicitacoes LGPD
 * - /politica-de-privacidade: politica completa
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * 11. OTIMIZACOES DE PERFORMANCE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * CODE SPLITTING:
 * - Todas as paginas sao lazy-loaded (React Router lazy + Suspense)
 * - ~15 componentes do Layout sao lazy (CartDrawer, Footer, etc.)
 * - ~40 tabs do admin sao lazy-loaded individualmente
 * - lazyWithRetry(): retry com backoff exponencial em falha de import
 *
 * NETWORK:
 * - Edge function warmup: api.ts faz GET /health antes de qualquer request
 * - Concurrency limiter: max 8 requests simultaneos (semaphore)
 * - _requestFastFail(): timeout curto (25s) para calls de display
 * - requestPriority(): bypass do semaphore para auth critica
 * - Deduplicacao: bulk calls agrupam SKUs em 1 request
 *
 * RENDERING:
 * - useMemo/React.memo extensivos para evitar re-renders
 * - VirtualProductGrid: virtualiza grids com 100+ itens
 * - Skeleton states: reserva espaco durante loading (CLS prevention)
 * - hadPromoLastVisit: localStorage hint para reservar espaco da promo
 * - Opacity-only animations (sem translate-y que causa CLS)
 *
 * IMAGENS:
 * - Preload do primeiro banner via localStorage cache da URL
 * - fetchpriority="high" no banner ATF (Above The Fold)
 * - loading="lazy" em imagens below-fold
 * - ProductImage com fallback visual se imagem falhar
 *
 * PREFETCH:
 * - Chunks de rota: prefetchCatalog/prefetchProductDetail apos 3s
 * - Data prefetch: scheduleProductDataPrefetch() no hover do card
 * - Bulk seed: precos/saldos do bulk "plantam" no cache dos componentes
 *   individuais (PriceBadge, StockBar, ReviewStars)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * 12. FLUXO DE CHECKOUT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Usuario adiciona produtos ao carrinho (CartContext → localStorage)
 * 2. CartDrawer mostra resumo; usuario clica "Finalizar"
 * 3. CheckoutPage:
 *    a. Se nao logado → redireciona para /conta
 *    b. Seleciona/adiciona endereco de entrega
 *    c. Calcula frete (POST /shipping/calculate)
 *    d. Aplica cupom opcional (POST /coupons/validate)
 *    e. Escolhe forma de pagamento:
 *       - PIX (PagHiper)
 *       - Boleto (PagHiper)
 *       - Mercado Pago (redirect)
 *    f. POST /orders → cria pedido no backend
 *    g. Backend sincroniza com SIGE se configurado
 * 4. CartAbandonedTracker: se usuario sai sem finalizar,
 *    salva snapshot para recuperacao via WhatsApp
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * 13. SISTEMA DE SUPER PROMOCAO
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Admin cria promo em AdminSuperPromo.tsx:
 * - Define titulo, subtitulo, cor de fundo
 * - Define periodo (startDate/endDate como timestamps)
 * - Define tipo de desconto (percentage ou fixed) + valor
 * - Seleciona produtos (com desconto individual opcional)
 * - Salva via POST /admin/promo → armazena no KV "super_promo"
 *
 * Frontend (SuperPromoSection):
 * - Estrategia DUAL-SOURCE:
 *   1. Fast path: usa initData.promo do HomepageInit (imediato)
 *   2. Autoritativo: SEMPRE chama GET /promo/active em paralelo
 *   3. Retry automatico em caso de falha
 * - Countdown visual ate endDate
 * - Carousel de PromoCards com auto-scroll
 * - "De R$ X por R$ Y" com badge de desconto
 * - Auto-hide quando promo expira
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * 14. ANALYTICS & TRACKING
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * GA4Provider: injeta gtag.js + fires eventos
 * - page_view, view_item, add_to_cart, begin_checkout, purchase
 * - view_promotion, select_promotion (Super Promo)
 * - search (autocomplete)
 *
 * GTMProvider: Google Tag Manager container
 * MarketingPixels: Meta Pixel, TikTok Pixel, custom pixels
 * utmTracker: captura UTM params da URL → localStorage
 * WebVitalsReporter: LCP, FID, CLS, FCP, TTFB → POST /web-vitals
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * 15. PADROES DE CODIGO
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - Funcoes nomeadas (function foo() {}) ao inves de arrow functions
 *   para melhor stack trace debugging
 * - `var` ao inves de `let/const` em muitos lugares — decisao historica
 *   do ambiente Figma Make; nao impacta funcionalidade
 * - useCallback extensivo para funcoes passadas como props/deps
 * - AbortController em todos os useEffect que fazem fetch
 *   (cleanup cancela requests em andamento no unmount)
 * - Try/catch silencioso para localStorage (modo privado pode falhar)
 * - Logs com prefixo [ComponentName] para facilitar debug
 * - Tipos TypeScript para todas as interfaces de API
 * - Sem CSS-in-JS: 100% Tailwind classes inline
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FIM DA DOCUMENTACAO
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// Este arquivo nao exporta nada — e puramente documentacao.
export {};
