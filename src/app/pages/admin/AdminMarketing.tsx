import { useState, useEffect } from "react";
import Save from "lucide-react/dist/esm/icons/save.js";
import Loader2 from "lucide-react/dist/esm/icons/loader-2.js";
import Check from "lucide-react/dist/esm/icons/check.js";
import AlertTriangle from "lucide-react/dist/esm/icons/alert-triangle.js";
import CheckCircle2 from "lucide-react/dist/esm/icons/check-circle-2.js";
import ToggleLeft from "lucide-react/dist/esm/icons/toggle-left.js";
import ToggleRight from "lucide-react/dist/esm/icons/toggle-right.js";
import Info from "lucide-react/dist/esm/icons/info.js";
import ExternalLink from "lucide-react/dist/esm/icons/external-link.js";
import Copy from "lucide-react/dist/esm/icons/copy.js";
import Globe from "lucide-react/dist/esm/icons/globe.js";
import Facebook from "lucide-react/dist/esm/icons/facebook.js";
import BarChart3 from "lucide-react/dist/esm/icons/bar-chart-3.js";
import Eye from "lucide-react/dist/esm/icons/eye.js";
import MousePointerClick from "lucide-react/dist/esm/icons/mouse-pointer-click.js";
import Megaphone from "lucide-react/dist/esm/icons/megaphone.js";
import ShoppingCart from "lucide-react/dist/esm/icons/shopping-cart.js";
import CreditCard from "lucide-react/dist/esm/icons/credit-card.js";
import Search from "lucide-react/dist/esm/icons/search.js";
import Package from "lucide-react/dist/esm/icons/package.js";
import Activity from "lucide-react/dist/esm/icons/activity.js";
import XCircle from "lucide-react/dist/esm/icons/x-circle.js";
import Music from "lucide-react/dist/esm/icons/music.js";
import Layers from "lucide-react/dist/esm/icons/layers.js";
import BookOpen from "lucide-react/dist/esm/icons/book-open.js";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down.js";
import ChevronUp from "lucide-react/dist/esm/icons/chevron-up.js";
import Zap from "lucide-react/dist/esm/icons/zap.js";
import ArrowRight from "lucide-react/dist/esm/icons/arrow-right.js";
import * as api from "../../services/api";
import type { MarketingConfig, GA4Config } from "../../services/api";
import { getValidAdminToken } from "./adminAuth";

var DEFAULT_MKT: MarketingConfig = {
  gtmId: "",
  gtmEnabled: false,
  metaPixelId: "",
  metaPixelEnabled: false,
  googleAdsId: "",
  googleAdsConversionLabel: "",
  googleAdsEnabled: false,
  clarityProjectId: "",
  clarityEnabled: false,
  tiktokPixelId: "",
  tiktokPixelEnabled: false,
};

var DEFAULT_GA4: GA4Config = {
  measurementId: "",
  enabled: false,
  trackPageViews: true,
  trackAddToCart: true,
  trackCheckout: true,
  trackPurchase: true,
  trackSearch: true,
  trackViewItem: true,
};

type PixelTab = "gtm" | "ga4" | "meta" | "gads" | "clarity" | "tiktok";

interface GA4EventInfo {
  key: keyof GA4Config;
  label: string;
  description: string;
  icon: typeof Eye;
  gaEventName: string;
}

var GA4_EVENTS: GA4EventInfo[] = [
  { key: "trackPageViews", label: "Visualizacao de Pagina", description: "Rastreia cada pagina visitada (page_view)", icon: Eye, gaEventName: "page_view" },
  { key: "trackViewItem", label: "Visualizacao de Produto", description: "Rastreia quando um produto e aberto (view_item)", icon: Package, gaEventName: "view_item" },
  { key: "trackAddToCart", label: "Adicionar ao Carrinho", description: "Rastreia quando um produto e adicionado ao carrinho (add_to_cart)", icon: ShoppingCart, gaEventName: "add_to_cart" },
  { key: "trackSearch", label: "Pesquisa", description: "Rastreia buscas no catalogo (search)", icon: Search, gaEventName: "search" },
  { key: "trackCheckout", label: "Inicio do Checkout", description: "Rastreia quando o checkout e iniciado (begin_checkout)", icon: CreditCard, gaEventName: "begin_checkout" },
  { key: "trackPurchase", label: "Compra Concluida", description: "Rastreia quando um pagamento e confirmado (purchase)", icon: CheckCircle2, gaEventName: "purchase" },
];

export function AdminMarketing() {
  var [mktConfig, setMktConfig] = useState<MarketingConfig>(DEFAULT_MKT);
  var [ga4Config, setGa4Config] = useState<GA4Config>(DEFAULT_GA4);
  var [loading, setLoading] = useState(true);
  var [saving, setSaving] = useState(false);
  var [saved, setSaved] = useState(false);
  var [error, setError] = useState("");
  var [activeTab, setActiveTab] = useState<PixelTab>("ga4");
  var [copied, setCopied] = useState("");
  var [testSent, setTestSent] = useState(false);
  var [showGuide, setShowGuide] = useState(false);

  useEffect(function () {
    Promise.all([
      api.getMarketingConfig().catch(function () { return DEFAULT_MKT; }),
      api.getGA4Config().catch(function () { return DEFAULT_GA4; }),
    ]).then(function (results) {
      setMktConfig({ ...DEFAULT_MKT, ...results[0] });
      setGa4Config({ ...DEFAULT_GA4, ...results[1] });
    }).catch(function (e) {
      setError("Erro ao carregar configuracoes: " + String(e));
    }).finally(function () {
      setLoading(false);
    });
  }, []);

  var handleSave = async function () {
    // Validate GA4 measurement ID if enabled
    if (ga4Config.enabled && ga4Config.measurementId && !ga4Config.measurementId.match(/^G-[A-Z0-9]+$/)) {
      setError("GA4 Measurement ID invalido. Deve estar no formato G-XXXXXXXXXX");
      return;
    }
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      var token = await getValidAdminToken();
      var results = await Promise.all([
        api.updateMarketingConfig(mktConfig, token || undefined),
        api.updateGA4Config(ga4Config, token || undefined),
      ]);
      setMktConfig({ ...DEFAULT_MKT, ...results[0] });
      setGa4Config({ ...DEFAULT_GA4, ...results[1] });
      setSaved(true);
      setTimeout(function () { setSaved(false); }, 3000);
    } catch (e: any) {
      setError(e.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  var handleCopy = function (text: string, label: string) {
    navigator.clipboard.writeText(text).then(function () {
      setCopied(label);
      setTimeout(function () { setCopied(""); }, 2000);
    });
  };

  var handleTestGA4 = function () {
    if (typeof window !== "undefined" && (window as any).gtag && ga4Config.measurementId) {
      (window as any).gtag("event", "admin_test_event", {
        event_category: "testing",
        event_label: "GA4 Integration Test",
        value: 1,
      });
      setTestSent(true);
      setTimeout(function () { setTestSent(false); }, 3000);
    } else {
      setError("GA4 nao esta carregado. Salve as configuracoes e recarregue a pagina.");
      setTimeout(function () { setError(""); }, 4000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-red-500 animate-spin" />
      </div>
    );
  }

  var isValidGA4Id = ga4Config.measurementId ? !!ga4Config.measurementId.match(/^G-[A-Z0-9]+$/) : true;
  var enabledGA4Events = GA4_EVENTS.filter(function (e) { return ga4Config[e.key] as boolean; }).length;

  var tabs: { id: PixelTab; label: string; icon: any; enabled: boolean; color: string }[] = [
    { id: "gtm", label: "Google Tag Manager", icon: Layers, enabled: mktConfig.gtmEnabled, color: "text-sky-600 bg-sky-50" },
    { id: "ga4", label: "Google Analytics", icon: BarChart3, enabled: ga4Config.enabled, color: "text-orange-600 bg-orange-50" },
    { id: "meta", label: "Meta Pixel", icon: Facebook, enabled: mktConfig.metaPixelEnabled, color: "text-blue-600 bg-blue-50" },
    { id: "gads", label: "Google Ads", icon: Megaphone, enabled: mktConfig.googleAdsEnabled, color: "text-green-600 bg-green-50" },
    { id: "clarity", label: "MS Clarity", icon: Eye, enabled: mktConfig.clarityEnabled, color: "text-purple-600 bg-purple-50" },
    { id: "tiktok", label: "TikTok Pixel", icon: Music, enabled: mktConfig.tiktokPixelEnabled, color: "text-pink-600 bg-pink-50" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "1.2rem", fontWeight: 700 }}>
            <Megaphone className="w-5 h-5 text-red-600" />
            Marketing &amp; Analytics
          </h2>
          <p className="text-gray-500 mt-1" style={{ fontSize: "0.82rem" }}>
            Configure todos os pixels de rastreamento, analytics e conversao em um so lugar
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
          style={{ fontSize: "0.88rem", fontWeight: 600 }}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saving ? "Salvando..." : saved ? "Salvo!" : "Salvar Tudo"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-red-700" style={{ fontSize: "0.82rem" }}>{error}</p>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          GUIA COMPLETO — Tutorial colapsavel
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button
          onClick={function () { setShowGuide(!showGuide); }}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="bg-red-50 rounded-lg p-2">
              <BookOpen className="w-5 h-5 text-red-600" />
            </div>
            <div className="text-left">
              <h3 className="text-gray-800" style={{ fontSize: "0.95rem", fontWeight: 700 }}>
                Guia Completo — Como Configurar os Pixels Corretamente
              </h3>
              <p className="text-gray-500 mt-0.5" style={{ fontSize: "0.75rem" }}>
                Passo a passo para cada plataforma. Leia antes de configurar.
              </p>
            </div>
          </div>
          {showGuide ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </button>

        {showGuide && (
          <div className="border-t border-gray-100 px-5 pb-6 pt-4 space-y-6">

            {/* Entenda primeiro */}
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2">
              <h4 className="text-red-800 flex items-center gap-2" style={{ fontSize: "0.88rem", fontWeight: 700 }}>
                <Zap className="w-4 h-4" />
                Entenda primeiro: o que JA esta pronto no seu site
              </h4>
              <ul className="space-y-1.5">
                {[
                  "O codigo de rastreamento de todos os pixels ja esta instalado no site",
                  "Todos os eventos de e-commerce (add_to_cart, purchase, search, etc.) ja sao disparados automaticamente",
                  "O banner de consentimento LGPD ja bloqueia os pixels ate o usuario aceitar",
                  "Parametros UTM (utm_source, gclid, fbclid) ja sao capturados e enviados junto com os eventos",
                  "Voce so precisa obter os IDs de cada plataforma e colar aqui nesta pagina",
                ].map(function (item, i) {
                  return (
                    <li key={i} className="text-red-700 flex items-start gap-1.5" style={{ fontSize: "0.78rem" }}>
                      <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-red-500" />
                      {item}
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Duas opcoes */}
            <div>
              <h4 className="text-gray-800 mb-3 flex items-center gap-2" style={{ fontSize: "0.9rem", fontWeight: 700 }}>
                <ArrowRight className="w-4 h-4 text-red-600" />
                Voce tem duas opcoes de configuracao:
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Opcao A */}
                <div className="rounded-xl border-2 border-green-200 bg-green-50/50 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="bg-green-600 text-white rounded-full w-6 h-6 flex items-center justify-center" style={{ fontSize: "0.72rem", fontWeight: 700 }}>A</span>
                    <h5 className="text-green-800" style={{ fontSize: "0.85rem", fontWeight: 700 }}>Direto pelo Admin (Recomendado)</h5>
                  </div>
                  <p className="text-green-700" style={{ fontSize: "0.75rem", lineHeight: 1.6 }}>
                    Configure cada pixel individualmente nas abas abaixo. Basta colar o ID de cada plataforma, ativar o toggle e salvar. Mais simples e pratico.
                  </p>
                  <div className="bg-green-100/60 rounded-lg p-3">
                    <p className="text-green-800" style={{ fontSize: "0.72rem", fontWeight: 600 }}>Ideal para:</p>
                    <p className="text-green-700" style={{ fontSize: "0.72rem" }}>Lojas que gerenciam os proprios pixels, sem agencia de marketing</p>
                  </div>
                </div>
                {/* Opcao B */}
                <div className="rounded-xl border-2 border-sky-200 bg-sky-50/50 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="bg-sky-600 text-white rounded-full w-6 h-6 flex items-center justify-center" style={{ fontSize: "0.72rem", fontWeight: 700 }}>B</span>
                    <h5 className="text-sky-800" style={{ fontSize: "0.85rem", fontWeight: 700 }}>Via Google Tag Manager (GTM)</h5>
                  </div>
                  <p className="text-sky-700" style={{ fontSize: "0.75rem", lineHeight: 1.6 }}>
                    Um unico script (GTM) gerencia todos os pixels. Voce configura tudo no painel do GTM em vez de nas abas abaixo. As abas individuais ficam desativadas.
                  </p>
                  <div className="bg-sky-100/60 rounded-lg p-3">
                    <p className="text-sky-800" style={{ fontSize: "0.72rem", fontWeight: 600 }}>Ideal para:</p>
                    <p className="text-sky-700" style={{ fontSize: "0.72rem" }}>Agencias de marketing ou quem precisa trocar pixels com frequencia</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Passo a passo por plataforma */}
            <div>
              <h4 className="text-gray-800 mb-3 flex items-center gap-2" style={{ fontSize: "0.9rem", fontWeight: 700 }}>
                <ArrowRight className="w-4 h-4 text-red-600" />
                Passo a passo por plataforma (Opcao A):
              </h4>
              <div className="space-y-3">
                {/* GA4 */}
                <div className="rounded-lg border border-orange-200 bg-orange-50/50 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <BarChart3 className="w-4 h-4 text-orange-600" />
                    <h5 className="text-orange-800" style={{ fontSize: "0.82rem", fontWeight: 700 }}>1. Google Analytics 4 (GA4)</h5>
                    <span className="text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full ml-auto" style={{ fontSize: "0.65rem", fontWeight: 600 }}>Gratuito</span>
                  </div>
                  <ol className="text-orange-700 space-y-1 list-decimal list-inside" style={{ fontSize: "0.75rem" }}>
                    <li>Acesse <a href="https://analytics.google.com/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 font-medium">analytics.google.com</a> e faca login com sua conta Google</li>
                    <li>Se nao tem conta GA4: clique em <strong>&quot;Comecar a medir&quot;</strong> e crie uma propriedade</li>
                    <li>Va em <strong>Admin</strong> (engrenagem) &rarr; <strong>Fluxos de dados</strong> &rarr; selecione ou crie um fluxo <strong>Web</strong></li>
                    <li>Copie o <strong>ID de Medicao</strong> (formato <code className="bg-orange-100 px-1 rounded">G-XXXXXXXXXX</code>)</li>
                    <li>Cole na aba <strong>&quot;Google Analytics&quot;</strong> acima, ative o toggle e salve</li>
                  </ol>
                  <p className="text-orange-600 mt-2" style={{ fontSize: "0.7rem", fontWeight: 500 }}>
                    O site ja dispara automaticamente: page_view, view_item, add_to_cart, begin_checkout, purchase, search, sign_up, login
                  </p>
                </div>

                {/* Meta Pixel */}
                <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Facebook className="w-4 h-4 text-blue-600" />
                    <h5 className="text-blue-800" style={{ fontSize: "0.82rem", fontWeight: 700 }}>2. Meta Pixel (Facebook/Instagram)</h5>
                    <span className="text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full ml-auto" style={{ fontSize: "0.65rem", fontWeight: 600 }}>Gratuito</span>
                  </div>
                  <ol className="text-blue-700 space-y-1 list-decimal list-inside" style={{ fontSize: "0.75rem" }}>
                    <li>Acesse <a href="https://business.facebook.com/events_manager2" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 font-medium">Meta Events Manager</a></li>
                    <li>Clique em <strong>&quot;Conectar fontes de dados&quot;</strong> &rarr; <strong>Web</strong> &rarr; <strong>Meta Pixel</strong></li>
                    <li>De um nome ao pixel e clique em <strong>&quot;Criar&quot;</strong></li>
                    <li>Escolha <strong>&quot;Instalar codigo manualmente&quot;</strong> (mas NAO precisa colar nenhum codigo no site)</li>
                    <li>Copie apenas o <strong>Pixel ID</strong> (numero de 15-16 digitos, ex: <code className="bg-blue-100 px-1 rounded">123456789012345</code>)</li>
                    <li>Cole na aba <strong>&quot;Meta Pixel&quot;</strong> acima, ative o toggle e salve</li>
                  </ol>
                  <p className="text-blue-600 mt-2" style={{ fontSize: "0.7rem", fontWeight: 500 }}>
                    O site ja dispara: PageView, ViewContent, AddToCart, Search, InitiateCheckout, Purchase, CompleteRegistration, Lead
                  </p>
                </div>

                {/* Google Ads */}
                <div className="rounded-lg border border-green-200 bg-green-50/50 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Megaphone className="w-4 h-4 text-green-600" />
                    <h5 className="text-green-800" style={{ fontSize: "0.82rem", fontWeight: 700 }}>3. Google Ads (Conversoes)</h5>
                    <span className="text-green-600 bg-green-100 px-2 py-0.5 rounded-full ml-auto" style={{ fontSize: "0.65rem", fontWeight: 600 }}>Requer conta Google Ads</span>
                  </div>
                  <ol className="text-green-700 space-y-1 list-decimal list-inside" style={{ fontSize: "0.75rem" }}>
                    <li>Acesse <a href="https://ads.google.com/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 font-medium">ads.google.com</a> e faca login</li>
                    <li>Va em <strong>Ferramentas</strong> &rarr; <strong>Medicao</strong> &rarr; <strong>Conversoes</strong></li>
                    <li>Clique em <strong>&quot;+ Nova acao de conversao&quot;</strong> &rarr; <strong>Site</strong></li>
                    <li>Configure a conversao de <strong>&quot;Compra&quot;</strong></li>
                    <li>Na tag, copie o <strong>Conversion ID</strong> (formato <code className="bg-green-100 px-1 rounded">AW-123456789</code>) e o <strong>Conversion Label</strong></li>
                    <li>Cole ambos na aba <strong>&quot;Google Ads&quot;</strong> acima, ative o toggle e salve</li>
                  </ol>
                  <p className="text-green-600 mt-2" style={{ fontSize: "0.7rem", fontWeight: 500 }}>
                    O site envia automaticamente: valor da compra, moeda (BRL) e ID da transacao a cada purchase
                  </p>
                </div>

                {/* MS Clarity */}
                <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Eye className="w-4 h-4 text-purple-600" />
                    <h5 className="text-purple-800" style={{ fontSize: "0.82rem", fontWeight: 700 }}>4. Microsoft Clarity</h5>
                    <span className="text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full ml-auto" style={{ fontSize: "0.65rem", fontWeight: 600 }}>100% Gratuito</span>
                  </div>
                  <ol className="text-purple-700 space-y-1 list-decimal list-inside" style={{ fontSize: "0.75rem" }}>
                    <li>Acesse <a href="https://clarity.microsoft.com/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 font-medium">clarity.microsoft.com</a> e crie uma conta gratuita</li>
                    <li>Crie um novo projeto com a URL do seu site</li>
                    <li>No painel, va em <strong>Settings</strong> &rarr; <strong>Overview</strong></li>
                    <li>Copie o <strong>Project ID</strong> (ex: <code className="bg-purple-100 px-1 rounded">abc123def</code>)</li>
                    <li>Cole na aba <strong>&quot;MS Clarity&quot;</strong> acima, ative o toggle e salve</li>
                  </ol>
                  <p className="text-purple-600 mt-2" style={{ fontSize: "0.7rem", fontWeight: 500 }}>
                    Voce ganha: heatmaps, gravacoes de sessoes, deteccao de rage clicks — tudo gratis e sem limite de trafego
                  </p>
                </div>

                {/* TikTok */}
                <div className="rounded-lg border border-pink-200 bg-pink-50/50 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Music className="w-4 h-4 text-pink-600" />
                    <h5 className="text-pink-800" style={{ fontSize: "0.82rem", fontWeight: 700 }}>5. TikTok Pixel</h5>
                    <span className="text-pink-600 bg-pink-100 px-2 py-0.5 rounded-full ml-auto" style={{ fontSize: "0.65rem", fontWeight: 600 }}>Requer conta TikTok Ads</span>
                  </div>
                  <ol className="text-pink-700 space-y-1 list-decimal list-inside" style={{ fontSize: "0.75rem" }}>
                    <li>Acesse <a href="https://ads.tiktok.com/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 font-medium">ads.tiktok.com</a> e crie uma conta de anuncios</li>
                    <li>Va em <strong>Assets</strong> &rarr; <strong>Events</strong> &rarr; <strong>Web Events</strong></li>
                    <li>Clique em <strong>&quot;Manage&quot;</strong> &rarr; <strong>&quot;Set Up Web Events&quot;</strong></li>
                    <li>Escolha <strong>TikTok Pixel</strong> &rarr; <strong>&quot;Manually Install Pixel Code&quot;</strong></li>
                    <li>Copie o <strong>Pixel ID</strong> (formato <code className="bg-pink-100 px-1 rounded">CXXXXXXXXXXXXXXXXX</code>)</li>
                    <li>Cole na aba <strong>&quot;TikTok Pixel&quot;</strong> acima, ative o toggle e salve</li>
                  </ol>
                  <p className="text-pink-600 mt-2" style={{ fontSize: "0.7rem", fontWeight: 500 }}>
                    O site ja dispara: PageView, ViewContent, AddToCart, Search, InitiateCheckout, Purchase, CompleteRegistration
                  </p>
                </div>
              </div>
            </div>

            {/* Resumo rapido */}
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
              <h4 className="text-gray-700 mb-3 flex items-center gap-2" style={{ fontSize: "0.85rem", fontWeight: 700 }}>
                <Zap className="w-4 h-4 text-red-600" />
                Resumo rapido — checklist
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full" style={{ fontSize: "0.75rem" }}>
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 text-gray-500 font-semibold">Plataforma</th>
                      <th className="text-left py-2 text-gray-500 font-semibold">O que voce precisa</th>
                      <th className="text-left py-2 text-gray-500 font-semibold">Onde obter</th>
                      <th className="text-center py-2 text-gray-500 font-semibold">Custo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { plat: "GA4", need: "Measurement ID (G-XXXXXXX)", where: "analytics.google.com", cost: "Gratis", costColor: "text-green-600 bg-green-50" },
                      { plat: "Meta Pixel", need: "Pixel ID (numero)", where: "business.facebook.com", cost: "Gratis", costColor: "text-green-600 bg-green-50" },
                      { plat: "Google Ads", need: "Conversion ID + Label", where: "ads.google.com", cost: "Pago", costColor: "text-amber-600 bg-amber-50" },
                      { plat: "MS Clarity", need: "Project ID", where: "clarity.microsoft.com", cost: "Gratis", costColor: "text-green-600 bg-green-50" },
                      { plat: "TikTok", need: "Pixel ID (CXXXXXXX)", where: "ads.tiktok.com", cost: "Pago", costColor: "text-amber-600 bg-amber-50" },
                      { plat: "GTM (opcional)", need: "Container ID (GTM-XXXXXXX)", where: "tagmanager.google.com", cost: "Gratis", costColor: "text-green-600 bg-green-50" },
                    ].map(function (row, i) {
                      return (
                        <tr key={i} className="border-b border-gray-100">
                          <td className="py-2 text-gray-800 font-semibold">{row.plat}</td>
                          <td className="py-2 text-gray-600"><code className="bg-gray-100 px-1.5 py-0.5 rounded" style={{ fontSize: "0.7rem" }}>{row.need}</code></td>
                          <td className="py-2 text-gray-600">{row.where}</td>
                          <td className="py-2 text-center"><span className={"px-2 py-0.5 rounded-full " + row.costColor} style={{ fontSize: "0.68rem", fontWeight: 600 }}>{row.cost}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Dica importante */}
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
              <p className="text-green-700" style={{ fontSize: "0.78rem", lineHeight: 1.5 }}>
                <strong>Dica importante:</strong> Voce nao precisa ativar todos. Comece pelo <strong>GA4</strong> (essencial para ver trafego e conversoes) e pelo <strong>Clarity</strong> (gratis, mostra onde os clientes travam).
                Adicione Meta Pixel e Google Ads apenas quando for rodar anuncios nessas plataformas.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Status cards / tab selector */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {tabs.map(function (tab) {
          return (
            <button
              key={tab.id}
              onClick={function () { setActiveTab(tab.id); }}
              className={"rounded-xl border-2 p-4 transition-all cursor-pointer " + (activeTab === tab.id ? "border-red-300 bg-red-50/50 shadow-sm" : "border-gray-200 bg-white hover:border-gray-300")}
            >
              <div className="flex items-center justify-between mb-2">
                <div className={"rounded-lg p-2 " + tab.color}>
                  <tab.icon className="w-4 h-4" />
                </div>
                {tab.enabled ? (
                  <span className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-0.5 rounded-full" style={{ fontSize: "0.68rem", fontWeight: 600 }}>
                    <CheckCircle2 className="w-3 h-3" />
                    Ativo
                  </span>
                ) : (
                  <span className="text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full" style={{ fontSize: "0.68rem", fontWeight: 600 }}>
                    Inativo
                  </span>
                )}
              </div>
              <p className="text-left text-gray-700" style={{ fontSize: "0.82rem", fontWeight: 600 }}>{tab.label}</p>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">

        {/* ── GTM (Google Tag Manager) ── */}
        {activeTab === "gtm" && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "1rem", fontWeight: 700 }}>
                  <Layers className="w-4 h-4 text-sky-600" />
                  Google Tag Manager (GTM)
                </h3>
                <p className="text-gray-500 mt-1" style={{ fontSize: "0.78rem" }}>
                  Gerencie TODOS os pixels (GA4, Meta, Google Ads, TikTok, Clarity) em um unico lugar, sem mexer no codigo
                </p>
              </div>
              <button
                onClick={function () { setMktConfig({ ...mktConfig, gtmEnabled: !mktConfig.gtmEnabled }); }}
                className="cursor-pointer"
              >
                {mktConfig.gtmEnabled ? (
                  <ToggleRight className="w-10 h-10 text-green-500" />
                ) : (
                  <ToggleLeft className="w-10 h-10 text-gray-300" />
                )}
              </button>
            </div>

            <div>
              <label className="block text-gray-600 mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                Container ID
              </label>
              <input
                type="text"
                value={mktConfig.gtmId}
                onChange={function (e) { setMktConfig({ ...mktConfig, gtmId: e.target.value.toUpperCase().trim().substring(0, 20) }); }}
                placeholder="GTM-XXXXXXX"
                className={"w-full border rounded-lg px-3 py-2.5 font-mono transition-colors focus:outline-none focus:ring-2 " + (
                  mktConfig.gtmId && !mktConfig.gtmId.match(/^GTM-[A-Z0-9]+$/)
                    ? "bg-red-50 border-red-300 text-red-700 focus:ring-red-200"
                    : "bg-white border-gray-200 text-gray-800 focus:ring-sky-200 focus:border-sky-300"
                )}
                style={{ fontSize: "0.9rem" }}
              />
              {mktConfig.gtmId && !mktConfig.gtmId.match(/^GTM-[A-Z0-9]+$/) && (
                <p className="text-red-500 mt-1" style={{ fontSize: "0.72rem" }}>
                  Formato invalido. Use GTM- seguido de letras e numeros (ex: GTM-ABC1234)
                </p>
              )}
            </div>

            {/* What GTM does */}
            <div className="bg-sky-50 border border-sky-200 rounded-lg p-4 space-y-3">
              <h4 className="text-sky-800 flex items-center gap-2" style={{ fontSize: "0.85rem", fontWeight: 700 }}>
                <Info className="w-4 h-4" />
                O que muda quando o GTM esta ativo?
              </h4>
              <ul className="space-y-1.5">
                {[
                  "O site carrega APENAS o script do GTM (1 unico script)",
                  "GA4, Meta Pixel, Google Ads, TikTok e Clarity sao gerenciados pelo GTM",
                  "Adicionar/remover pixels e feito no painel do GTM, sem tocar no codigo",
                  "Eventos de e-commerce (add_to_cart, purchase, etc.) continuam sendo enviados ao dataLayer",
                  "Todos os pixels configurados abaixo serao IGNORADOS — use o painel do GTM",
                  "O consentimento LGPD continua sendo respeitado",
                ].map(function (item, i) {
                  return (
                    <li key={i} className="text-sky-700 flex items-start gap-1.5" style={{ fontSize: "0.75rem" }}>
                      <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" />
                      {item}
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* How to set up */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-amber-800" style={{ fontSize: "0.85rem", fontWeight: 700 }}>Como configurar o GTM</h4>
                  <ol className="text-amber-700 mt-2 space-y-1 list-decimal list-inside" style={{ fontSize: "0.78rem" }}>
                    <li>Acesse <strong>tagmanager.google.com</strong> e crie uma conta/container</li>
                    <li>Copie o <strong>Container ID</strong> (formato GTM-XXXXXXX)</li>
                    <li>Cole acima e ative o toggle</li>
                    <li>No painel do GTM, adicione as tags: GA4, Meta Pixel, Google Ads, TikTok, Clarity</li>
                    <li>Configure os triggers para os eventos do dataLayer (ex: <code className="bg-amber-100 px-1 rounded">add_to_cart</code>, <code className="bg-amber-100 px-1 rounded">purchase</code>)</li>
                    <li>Publique o container no GTM</li>
                  </ol>
                  <a
                    href="https://tagmanager.google.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-amber-600 hover:text-amber-800 mt-2 transition-colors"
                    style={{ fontSize: "0.78rem", fontWeight: 600 }}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Abrir Google Tag Manager
                  </a>
                </div>
              </div>
            </div>

            {mktConfig.gtmEnabled && mktConfig.gtmId && mktConfig.gtmId.match(/^GTM-[A-Z0-9]+$/) && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
                <p className="text-green-800 flex items-center gap-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                  <CheckCircle2 className="w-4 h-4" />
                  GTM ativo! Eventos disponiveis no dataLayer:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {["page_view", "view_item", "add_to_cart", "remove_from_cart", "view_cart", "begin_checkout", "add_shipping_info", "add_payment_info", "purchase", "search", "sign_up", "login", "generate_lead", "view_promotion", "select_promotion"].map(function (evt) {
                    return (
                      <span key={evt} className="text-green-700 bg-green-100/60 px-2.5 py-1 rounded-md text-center" style={{ fontSize: "0.68rem", fontWeight: 500 }}>
                        {evt}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {mktConfig.gtmEnabled && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
                <p className="text-yellow-700" style={{ fontSize: "0.78rem", lineHeight: 1.5 }}>
                  <strong>Modo GTM ativo:</strong> o site carregara apenas o script do GTM. Os IDs configurados nas outras abas (GA4, Meta, Google Ads, TikTok, Clarity) nao serao usados
                  — voce precisa adicionar esses mesmos IDs como Tags dentro do painel do <a href="https://tagmanager.google.com/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Google Tag Manager</a>.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── GA4 ── */}
        {activeTab === "ga4" && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "1rem", fontWeight: 700 }}>
                  <BarChart3 className="w-4 h-4 text-orange-600" />
                  Google Analytics 4 (GA4)
                </h3>
                <p className="text-gray-500 mt-1" style={{ fontSize: "0.78rem" }}>
                  Analise o comportamento dos usuarios: paginas mais visitadas, funil de vendas, origem do trafego e muito mais
                </p>
              </div>
              <button
                onClick={function () { setGa4Config({ ...ga4Config, enabled: !ga4Config.enabled }); }}
                className="cursor-pointer"
              >
                {ga4Config.enabled ? (
                  <ToggleRight className="w-10 h-10 text-green-500" />
                ) : (
                  <ToggleLeft className="w-10 h-10 text-gray-300" />
                )}
              </button>
            </div>

            {/* Status cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className={"rounded-lg border p-3 " + (ga4Config.enabled ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200")}>
                <div className="flex items-center gap-2 mb-0.5">
                  {ga4Config.enabled ? <Activity className="w-3.5 h-3.5 text-green-600" /> : <XCircle className="w-3.5 h-3.5 text-gray-400" />}
                  <span className="text-gray-500" style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase" }}>Status</span>
                </div>
                <p className={ga4Config.enabled ? "text-green-700" : "text-gray-600"} style={{ fontSize: "1rem", fontWeight: 700 }}>
                  {ga4Config.enabled ? "Ativo" : "Inativo"}
                </p>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-3">
                <div className="flex items-center gap-2 mb-0.5">
                  <Globe className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-gray-500" style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase" }}>Measurement ID</span>
                </div>
                <p className="text-gray-800 font-mono" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                  {ga4Config.measurementId || "Nao configurado"}
                </p>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-3">
                <div className="flex items-center gap-2 mb-0.5">
                  <MousePointerClick className="w-3.5 h-3.5 text-purple-500" />
                  <span className="text-gray-500" style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase" }}>Eventos Ativos</span>
                </div>
                <p className="text-gray-800" style={{ fontSize: "1rem", fontWeight: 700 }}>
                  {enabledGA4Events} / {GA4_EVENTS.length}
                </p>
              </div>
            </div>

            {/* Measurement ID input */}
            <div>
              <label className="block text-gray-600 mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                Measurement ID (ID de medicao)
              </label>
              <input
                type="text"
                value={ga4Config.measurementId}
                onChange={function (e) { setGa4Config({ ...ga4Config, measurementId: e.target.value.toUpperCase().trim() }); }}
                placeholder="G-XXXXXXXXXX"
                className={"w-full border rounded-lg px-3 py-2.5 font-mono transition-colors focus:outline-none focus:ring-2 " + (
                  ga4Config.measurementId && !isValidGA4Id
                    ? "bg-red-50 border-red-300 text-red-700 focus:ring-red-200"
                    : "bg-white border-gray-200 text-gray-800 focus:ring-red-200 focus:border-red-300"
                )}
                style={{ fontSize: "0.9rem" }}
              />
              {ga4Config.measurementId && !isValidGA4Id && (
                <p className="text-red-500 mt-1" style={{ fontSize: "0.72rem" }}>
                  Formato invalido. Use G- seguido de letras e numeros (ex: G-ABC123DEF4)
                </p>
              )}
            </div>

            {/* How to get ID */}
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Info className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-orange-800" style={{ fontSize: "0.85rem", fontWeight: 700 }}>Como obter o Measurement ID</h4>
                  <ol className="text-orange-700 mt-2 space-y-1 list-decimal list-inside" style={{ fontSize: "0.78rem" }}>
                    <li>Acesse <strong>Google Analytics</strong> e faca login</li>
                    <li>Va em <strong>Admin</strong> (icone de engrenagem)</li>
                    <li>Em "Propriedade", clique em <strong>Fluxos de dados</strong></li>
                    <li>Selecione ou crie um fluxo <strong>Web</strong></li>
                    <li>Copie o <strong>ID DE MEDICAO</strong> (formato G-XXXXXXXXXX)</li>
                  </ol>
                  <a
                    href="https://analytics.google.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-orange-600 hover:text-orange-800 mt-2 transition-colors"
                    style={{ fontSize: "0.78rem", fontWeight: 600 }}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Abrir Google Analytics
                  </a>
                </div>
              </div>
            </div>

            {/* Events toggles */}
            <div>
              <h4 className="text-gray-700 mb-3 flex items-center gap-2" style={{ fontSize: "0.9rem", fontWeight: 700 }}>
                <MousePointerClick className="w-4 h-4 text-red-600" />
                Eventos E-commerce Rastreados
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {GA4_EVENTS.map(function (event) {
                  var Icon = event.icon;
                  var isActive = ga4Config[event.key] as boolean;
                  return (
                    <button
                      key={event.key}
                      onClick={function () { setGa4Config({ ...ga4Config, [event.key]: !ga4Config[event.key] }); }}
                      className={"flex items-center gap-3 p-3 rounded-lg border transition-all text-left cursor-pointer " + (
                        isActive ? "bg-green-50 border-green-200 hover:bg-green-100" : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                      )}
                    >
                      <div className={"rounded-lg p-1.5 " + (isActive ? "bg-green-100" : "bg-gray-200")}>
                        <Icon className={"w-3.5 h-3.5 " + (isActive ? "text-green-600" : "text-gray-400")} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={isActive ? "text-green-800" : "text-gray-600"} style={{ fontSize: "0.8rem", fontWeight: 600 }}>{event.label}</p>
                        <p className={isActive ? "text-green-600" : "text-gray-400"} style={{ fontSize: "0.68rem" }}>{event.description}</p>
                      </div>
                      <div className="shrink-0">
                        {isActive ? <ToggleRight className="w-7 h-7 text-green-500" /> : <ToggleLeft className="w-7 h-7 text-gray-300" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Test + Snippet tools */}
            {ga4Config.enabled && isValidGA4Id && ga4Config.measurementId && (
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={function () {
                    var snippet = '<!-- Google tag (gtag.js) -->\n<script async src="https://www.googletagmanager.com/gtag/js?id=' + ga4Config.measurementId + '"></script>\n<script>\n  window.dataLayer = window.dataLayer || [];\n  function gtag(){dataLayer.push(arguments);}\n  gtag(\'js\', new Date());\n  gtag(\'config\', \'' + ga4Config.measurementId + '\');\n</script>';
                    handleCopy(snippet, "ga4-snippet");
                  }}
                  className="flex items-center justify-center gap-2 bg-gray-100 text-gray-700 px-4 py-2.5 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
                  style={{ fontSize: "0.82rem", fontWeight: 600 }}
                >
                  {copied === "ga4-snippet" ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  {copied === "ga4-snippet" ? "Copiado!" : "Copiar Snippet gtag.js"}
                </button>
                <button
                  onClick={handleTestGA4}
                  className="flex items-center justify-center gap-2 bg-orange-50 text-orange-700 border border-orange-200 px-4 py-2.5 rounded-lg hover:bg-orange-100 transition-colors cursor-pointer"
                  style={{ fontSize: "0.82rem", fontWeight: 600 }}
                >
                  {testSent ? <Check className="w-4 h-4 text-green-600" /> : <Activity className="w-4 h-4" />}
                  {testSent ? "Evento de teste enviado!" : "Enviar Evento de Teste"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Meta Pixel ── */}
        {activeTab === "meta" && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "1rem", fontWeight: 700 }}>
                  <Facebook className="w-4 h-4 text-blue-600" />
                  Meta Pixel (Facebook/Instagram)
                </h3>
                <p className="text-gray-500 mt-1" style={{ fontSize: "0.78rem" }}>
                  Rastreia conversoes e permite criar publicos para anuncios no Facebook e Instagram
                </p>
              </div>
              <button
                onClick={function () { setMktConfig({ ...mktConfig, metaPixelEnabled: !mktConfig.metaPixelEnabled }); }}
                className="cursor-pointer"
              >
                {mktConfig.metaPixelEnabled ? (
                  <ToggleRight className="w-10 h-10 text-green-500" />
                ) : (
                  <ToggleLeft className="w-10 h-10 text-gray-300" />
                )}
              </button>
            </div>

            <div>
              <label className="block text-gray-600 mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                Pixel ID
              </label>
              <input
                type="text"
                value={mktConfig.metaPixelId}
                onChange={function (e) { setMktConfig({ ...mktConfig, metaPixelId: e.target.value.replace(/\D/g, "").substring(0, 20) }); }}
                placeholder="Ex: 123456789012345"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                style={{ fontSize: "0.88rem" }}
              />
              <p className="text-gray-400 mt-1" style={{ fontSize: "0.72rem" }}>
                Encontre em: Meta Events Manager &rarr; Fontes de Dados &rarr; Seu Pixel &rarr; ID
              </p>
            </div>

            {mktConfig.metaPixelEnabled && mktConfig.metaPixelId && (
              <div className="bg-blue-50 rounded-lg p-4 space-y-2">
                <p className="text-blue-800 flex items-center gap-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                  <CheckCircle2 className="w-4 h-4" />
                  Eventos rastreados automaticamente:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {["PageView", "ViewContent", "AddToCart", "RemoveFromCart", "Search", "InitiateCheckout", "AddPaymentInfo", "Purchase", "CompleteRegistration", "Lead"].map(function (evt) {
                    return (
                      <span key={evt} className="text-blue-700 bg-blue-100/60 px-2.5 py-1 rounded-md" style={{ fontSize: "0.72rem", fontWeight: 500 }}>
                        {evt}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            <a
              href="https://business.facebook.com/events_manager2"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-700 transition-colors"
              style={{ fontSize: "0.82rem", fontWeight: 500 }}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Abrir Meta Events Manager
            </a>
          </div>
        )}

        {/* ── Google Ads ── */}
        {activeTab === "gads" && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "1rem", fontWeight: 700 }}>
                  <Megaphone className="w-4 h-4 text-green-600" />
                  Google Ads Conversion Tracking
                </h3>
                <p className="text-gray-500 mt-1" style={{ fontSize: "0.78rem" }}>
                  Rastreia conversoes de compra para otimizar campanhas no Google Ads (Search, Shopping, Display)
                </p>
              </div>
              <button
                onClick={function () { setMktConfig({ ...mktConfig, googleAdsEnabled: !mktConfig.googleAdsEnabled }); }}
                className="cursor-pointer"
              >
                {mktConfig.googleAdsEnabled ? (
                  <ToggleRight className="w-10 h-10 text-green-500" />
                ) : (
                  <ToggleLeft className="w-10 h-10 text-gray-300" />
                )}
              </button>
            </div>

            <div>
              <label className="block text-gray-600 mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                Conversion ID
              </label>
              <input
                type="text"
                value={mktConfig.googleAdsId}
                onChange={function (e) { setMktConfig({ ...mktConfig, googleAdsId: e.target.value.trim().substring(0, 20) }); }}
                placeholder="Ex: AW-123456789"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-800 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                style={{ fontSize: "0.88rem" }}
              />
              <p className="text-gray-400 mt-1" style={{ fontSize: "0.72rem" }}>
                Google Ads &rarr; Ferramentas &rarr; Conversoes &rarr; Sua Conversao &rarr; Tag &rarr; Conversion ID
              </p>
            </div>

            <div>
              <label className="block text-gray-600 mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                Conversion Label
              </label>
              <input
                type="text"
                value={mktConfig.googleAdsConversionLabel}
                onChange={function (e) { setMktConfig({ ...mktConfig, googleAdsConversionLabel: e.target.value.trim().substring(0, 40) }); }}
                placeholder="Ex: AbCdEfGhIjKlMnO"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-800 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                style={{ fontSize: "0.88rem" }}
              />
              <p className="text-gray-400 mt-1" style={{ fontSize: "0.72rem" }}>
                Este label identifica a acao de conversao especifica (ex: compra concluida)
              </p>
            </div>

            {mktConfig.googleAdsEnabled && mktConfig.googleAdsId && (
              <div className="bg-green-50 rounded-lg p-4">
                <p className="text-green-800 flex items-center gap-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                  <CheckCircle2 className="w-4 h-4" />
                  Conversao rastreada: Compra concluida (purchase)
                </p>
                <p className="text-green-700 mt-1" style={{ fontSize: "0.72rem" }}>
                  Envia valor, moeda e ID da transacao para o Google Ads em cada compra (PIX, Boleto, Cartao, Mercado Pago)
                </p>
              </div>
            )}

            <a
              href="https://ads.google.com/aw/conversions"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-green-600 hover:text-green-700 transition-colors"
              style={{ fontSize: "0.82rem", fontWeight: 500 }}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Abrir Google Ads Conversoes
            </a>
          </div>
        )}

        {/* ── Microsoft Clarity ── */}
        {activeTab === "clarity" && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "1rem", fontWeight: 700 }}>
                  <Eye className="w-4 h-4 text-purple-600" />
                  Microsoft Clarity
                </h3>
                <p className="text-gray-500 mt-1" style={{ fontSize: "0.78rem" }}>
                  Heatmaps e gravacoes de sessoes — 100% gratuito! Veja onde os clientes clicam e onde abandonam
                </p>
              </div>
              <button
                onClick={function () { setMktConfig({ ...mktConfig, clarityEnabled: !mktConfig.clarityEnabled }); }}
                className="cursor-pointer"
              >
                {mktConfig.clarityEnabled ? (
                  <ToggleRight className="w-10 h-10 text-green-500" />
                ) : (
                  <ToggleLeft className="w-10 h-10 text-gray-300" />
                )}
              </button>
            </div>

            <div>
              <label className="block text-gray-600 mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                Project ID
              </label>
              <input
                type="text"
                value={mktConfig.clarityProjectId}
                onChange={function (e) { setMktConfig({ ...mktConfig, clarityProjectId: e.target.value.trim().substring(0, 20) }); }}
                placeholder="Ex: abc123def"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-800 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                style={{ fontSize: "0.88rem" }}
              />
              <p className="text-gray-400 mt-1" style={{ fontSize: "0.72rem" }}>
                Clarity &rarr; Settings &rarr; Overview &rarr; Project ID
              </p>
            </div>

            {mktConfig.clarityEnabled && mktConfig.clarityProjectId && (
              <div className="bg-purple-50 rounded-lg p-4 space-y-2">
                <p className="text-purple-800 flex items-center gap-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                  <CheckCircle2 className="w-4 h-4" />
                  O que voce ganha com o Clarity:
                </p>
                <ul className="space-y-1">
                  {[
                    "Heatmaps — veja onde os clientes mais clicam",
                    "Gravacoes de sessoes — assista como os usuarios navegam",
                    "Insights de frustracao — detecta rage clicks e dead clicks",
                    "Scroll maps — descubra ate onde os clientes rolam a pagina",
                    "100% gratuito, sem limite de trafego",
                  ].map(function (item, i) {
                    return (
                      <li key={i} className="text-purple-700 flex items-start gap-1.5" style={{ fontSize: "0.72rem" }}>
                        <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" />
                        {item}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <a
              href="https://clarity.microsoft.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-purple-600 hover:text-purple-700 transition-colors"
              style={{ fontSize: "0.82rem", fontWeight: 500 }}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Criar conta gratuita no Clarity
            </a>
          </div>
        )}

        {/* ── TikTok Pixel ── */}
        {activeTab === "tiktok" && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "1rem", fontWeight: 700 }}>
                  <Music className="w-4 h-4 text-pink-600" />
                  TikTok Pixel
                </h3>
                <p className="text-gray-500 mt-1" style={{ fontSize: "0.78rem" }}>
                  Rastreia conversoes e permite criar publicos para anuncios no TikTok
                </p>
              </div>
              <button
                onClick={function () { setMktConfig({ ...mktConfig, tiktokPixelEnabled: !mktConfig.tiktokPixelEnabled }); }}
                className="cursor-pointer"
              >
                {mktConfig.tiktokPixelEnabled ? (
                  <ToggleRight className="w-10 h-10 text-green-500" />
                ) : (
                  <ToggleLeft className="w-10 h-10 text-gray-300" />
                )}
              </button>
            </div>

            <div>
              <label className="block text-gray-600 mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                Pixel ID
              </label>
              <input
                type="text"
                value={mktConfig.tiktokPixelId}
                onChange={function (e) { setMktConfig({ ...mktConfig, tiktokPixelId: e.target.value.trim().substring(0, 25) }); }}
                placeholder="Ex: CXXXXXXXXXXXXXXXXX"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-800 focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none"
                style={{ fontSize: "0.88rem" }}
              />
              <p className="text-gray-400 mt-1" style={{ fontSize: "0.72rem" }}>
                Encontre em: TikTok Pixel Manager &rarr; Seu Pixel &rarr; ID
              </p>
            </div>

            {mktConfig.tiktokPixelEnabled && mktConfig.tiktokPixelId && (
              <div className="bg-pink-50 rounded-lg p-4 space-y-2">
                <p className="text-pink-800 flex items-center gap-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                  <CheckCircle2 className="w-4 h-4" />
                  Eventos rastreados automaticamente:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {["PageView", "ViewContent", "AddToCart", "RemoveFromCart", "Search", "InitiateCheckout", "AddPaymentInfo", "Purchase", "CompleteRegistration", "Lead"].map(function (evt) {
                    return (
                      <span key={evt} className="text-pink-700 bg-pink-100/60 px-2.5 py-1 rounded-md" style={{ fontSize: "0.72rem", fontWeight: 500 }}>
                        {evt}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            <a
              href="https://ads.tiktok.com/pixel/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-pink-600 hover:text-pink-700 transition-colors"
              style={{ fontSize: "0.82rem", fontWeight: 500 }}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Abrir TikTok Pixel Manager
            </a>
          </div>
        )}
      </div>

      {/* UTM Tracking info */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3">
        <h3 className="text-amber-800 flex items-center gap-2" style={{ fontSize: "0.95rem", fontWeight: 700 }}>
          <MousePointerClick className="w-4 h-4" />
          UTM Tracking — Ativo Automaticamente
        </h3>
        <p className="text-amber-700" style={{ fontSize: "0.78rem", lineHeight: 1.6 }}>
          O sistema captura automaticamente parametros UTM de todas as URLs de entrada
          (<code className="bg-amber-100 px-1 rounded">utm_source</code>,{" "}
          <code className="bg-amber-100 px-1 rounded">utm_medium</code>,{" "}
          <code className="bg-amber-100 px-1 rounded">utm_campaign</code>,{" "}
          <code className="bg-amber-100 px-1 rounded">gclid</code>,{" "}
          <code className="bg-amber-100 px-1 rounded">fbclid</code>)
          e os vincula aos eventos de compra no GA4, Meta Pixel e Google Ads.
        </p>
        <div className="bg-amber-100/60 rounded-lg p-3">
          <p className="text-amber-800 mb-1" style={{ fontSize: "0.72rem", fontWeight: 600 }}>Exemplo de URL com UTM:</p>
          <div className="flex items-center gap-2">
            <code className="text-amber-900 flex-1 overflow-x-auto" style={{ fontSize: "0.68rem" }}>
              seusite.com/catalogo?utm_source=google&amp;utm_medium=cpc&amp;utm_campaign=pecas_caminhao
            </code>
            <button
              onClick={function () { handleCopy("?utm_source=google&utm_medium=cpc&utm_campaign=pecas_caminhao", "utm"); }}
              className="shrink-0 p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-200 rounded transition-colors cursor-pointer"
            >
              {copied === "utm" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Summary table */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-5">
        <h3 className="text-gray-700 mb-3 flex items-center gap-2" style={{ fontSize: "0.9rem", fontWeight: 700 }}>
          <Globe className="w-4 h-4" />
          Resumo Completo dos Eventos Rastreados
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ fontSize: "0.75rem" }}>
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 text-gray-500 font-semibold">Acao do Usuario</th>
                <th className="text-center py-2 text-gray-500 font-semibold">GA4</th>
                <th className="text-center py-2 text-gray-500 font-semibold">Meta</th>
                <th className="text-center py-2 text-gray-500 font-semibold">Google Ads</th>
                <th className="text-center py-2 text-gray-500 font-semibold">TikTok</th>
                <th className="text-center py-2 text-gray-500 font-semibold">Clarity</th>
              </tr>
            </thead>
            <tbody>
              {[
                { action: "Visita pagina", ga4: "page_view", meta: "PageView", gads: "-", tiktok: "PageView", clarity: "Auto" },
                { action: "Ve lista de produtos", ga4: "view_item_list", meta: "ViewContent", gads: "-", tiktok: "ViewContent", clarity: "Auto" },
                { action: "Ve produto", ga4: "view_item", meta: "ViewContent", gads: "-", tiktok: "ViewContent", clarity: "Auto" },
                { action: "Adiciona ao carrinho", ga4: "add_to_cart", meta: "AddToCart", gads: "-", tiktok: "AddToCart", clarity: "Auto" },
                { action: "Abre carrinho", ga4: "view_cart", meta: "-", gads: "-", tiktok: "-", clarity: "Auto" },
                { action: "Remove do carrinho", ga4: "remove_from_cart", meta: "RemoveFromCart", gads: "-", tiktok: "-", clarity: "Auto" },
                { action: "Busca produto", ga4: "search", meta: "Search", gads: "-", tiktok: "Search", clarity: "Auto" },
                { action: "Inicia checkout", ga4: "begin_checkout", meta: "InitiateCheckout", gads: "-", tiktok: "InitiateCheckout", clarity: "Auto" },
                { action: "Seleciona frete", ga4: "add_shipping_info", meta: "-", gads: "-", tiktok: "-", clarity: "Auto" },
                { action: "Seleciona pagamento", ga4: "add_payment_info", meta: "AddPaymentInfo", gads: "-", tiktok: "AddPaymentInfo", clarity: "Auto" },
                { action: "Compra concluida", ga4: "purchase", meta: "Purchase", gads: "Conversion", tiktok: "CompletePayment", clarity: "Auto" },
                { action: "Faz login", ga4: "login", meta: "-", gads: "-", tiktok: "-", clarity: "Auto" },
                { action: "Cria conta", ga4: "sign_up", meta: "CompleteRegistration", gads: "-", tiktok: "CompleteRegistration", clarity: "Auto" },
                { action: "Envia contato", ga4: "generate_lead", meta: "Lead", gads: "-", tiktok: "SubmitForm", clarity: "Auto" },
                { action: "Ve Super Promo", ga4: "view_promotion", meta: "-", gads: "-", tiktok: "-", clarity: "Auto" },
                { action: "Clica promo", ga4: "select_promotion", meta: "-", gads: "-", tiktok: "-", clarity: "Auto" },
              ].map(function (row, i) {
                return (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2 text-gray-700 font-medium">{row.action}</td>
                    <td className="py-2 text-center"><code className="text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{row.ga4}</code></td>
                    <td className="py-2 text-center">
                      {row.meta === "-" ? <span className="text-gray-300">-</span> : <code className="text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{row.meta}</code>}
                    </td>
                    <td className="py-2 text-center">
                      {row.gads === "-" ? <span className="text-gray-300">-</span> : <code className="text-green-600 bg-green-50 px-1.5 py-0.5 rounded">{row.gads}</code>}
                    </td>
                    <td className="py-2 text-center">
                      {row.tiktok === "-" ? <span className="text-gray-300">-</span> : <code className="text-pink-600 bg-pink-50 px-1.5 py-0.5 rounded">{row.tiktok}</code>}
                    </td>
                    <td className="py-2 text-center"><code className="text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">{row.clarity}</code></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* LGPD info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-start gap-2">
        <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
        <p className="text-blue-700" style={{ fontSize: "0.78rem", lineHeight: 1.5 }}>
          Todos os pixels (incluindo o GTM) respeitam a LGPD — so sao injetados apos o usuario aceitar os cookies de analytics no banner de consentimento.
          Quando o GTM esta ativo, ele substitui o carregamento individual de cada pixel. O Microsoft Clarity nao tem custo algum e funciona com qualquer volume de trafego.
        </p>
      </div>
    </div>
  );
}