import { useState, useEffect } from "react";
import {
  Save,
  Loader2,
  Check,
  BarChart3,
  Eye,
  ShoppingCart,
  CreditCard,
  Search,
  Package,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ToggleLeft,
  ToggleRight,
  Copy,
  Info,
  Globe,
  MousePointerClick,
  Activity,
} from "lucide-react";
import * as api from "../../services/api";
import type { GA4Config } from "../../services/api";

const DEFAULT_CONFIG: GA4Config = {
  measurementId: "",
  enabled: false,
  trackPageViews: true,
  trackAddToCart: true,
  trackCheckout: true,
  trackPurchase: true,
  trackSearch: true,
  trackViewItem: true,
};

interface EventInfo {
  key: keyof GA4Config;
  label: string;
  description: string;
  icon: typeof Eye;
  gaEventName: string;
}

const TRACKED_EVENTS: EventInfo[] = [
  {
    key: "trackPageViews",
    label: "Visualização de Página",
    description: "Rastreia cada página visitada pelo usuário (page_view)",
    icon: Eye,
    gaEventName: "page_view",
  },
  {
    key: "trackViewItem",
    label: "Visualização de Produto",
    description: "Rastreia quando um usuário abre a página de um produto (view_item)",
    icon: Package,
    gaEventName: "view_item",
  },
  {
    key: "trackAddToCart",
    label: "Adicionar ao Carrinho",
    description: "Rastreia quando um produto é adicionado ao carrinho (add_to_cart)",
    icon: ShoppingCart,
    gaEventName: "add_to_cart",
  },
  {
    key: "trackSearch",
    label: "Pesquisa",
    description: "Rastreia buscas realizadas no catálogo (search)",
    icon: Search,
    gaEventName: "search",
  },
  {
    key: "trackCheckout",
    label: "Início do Checkout",
    description: "Rastreia quando o usuário inicia o processo de checkout (begin_checkout)",
    icon: CreditCard,
    gaEventName: "begin_checkout",
  },
  {
    key: "trackPurchase",
    label: "Compra Concluída",
    description: "Rastreia quando um pagamento é confirmado (purchase)",
    icon: CheckCircle2,
    gaEventName: "purchase",
  },
];

export function AdminGA4() {
  const [config, setConfig] = useState<GA4Config>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [testSent, setTestSent] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getGA4Config();
        if (data && data.measurementId !== undefined) {
          setConfig(data);
        }
      } catch (e) {
        console.error("Error loading GA4 config:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSave = async () => {
    if (config.enabled && !config.measurementId.match(/^G-[A-Z0-9]+$/)) {
      setError("Measurement ID inválido. Deve estar no formato G-XXXXXXXXXX");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await api.updateGA4Config(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(`Erro ao salvar: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleEvent = (key: keyof GA4Config) => {
    setConfig((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCopySnippet = () => {
    const snippet = `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${config.measurementId || "G-XXXXXXXXXX"}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${config.measurementId || "G-XXXXXXXXXX"}');
</script>`;
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTestEvent = () => {
    if (typeof window !== "undefined" && (window as any).gtag && config.measurementId) {
      (window as any).gtag("event", "admin_test_event", {
        event_category: "testing",
        event_label: "GA4 Integration Test",
        value: 1,
      });
      setTestSent(true);
      setTimeout(() => setTestSent(false), 3000);
    } else {
      setError("GA4 não está carregado. Salve as configurações e recarregue a página.");
      setTimeout(() => setError(""), 4000);
    }
  };

  const isValidId = config.measurementId.match(/^G-[A-Z0-9]+$/);
  const enabledEventsCount = TRACKED_EVENTS.filter((e) => config[e.key] as boolean).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-gray-800 flex items-center gap-2.5" style={{ fontSize: "1.35rem", fontWeight: 700 }}>
            <BarChart3 className="w-6 h-6 text-red-600" />
            Google Analytics 4
          </h2>
          <p className="text-gray-500 mt-1" style={{ fontSize: "0.85rem" }}>
            Configure o rastreamento GA4 para monitorar o comportamento dos usuários no site
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-red-600 text-white px-5 py-2.5 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
          style={{ fontSize: "0.88rem", fontWeight: 600 }}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : saved ? (
            <Check className="w-4 h-4" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saving ? "Salvando..." : saved ? "Salvo!" : "Salvar"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start gap-2.5" style={{ fontSize: "0.85rem" }}>
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Status overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={`rounded-xl border p-4 ${config.enabled ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"}`}>
          <div className="flex items-center gap-2 mb-1">
            {config.enabled ? (
              <Activity className="w-4 h-4 text-green-600" />
            ) : (
              <XCircle className="w-4 h-4 text-gray-400" />
            )}
            <span className="text-gray-500" style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Status
            </span>
          </div>
          <p className={`${config.enabled ? "text-green-700" : "text-gray-600"}`} style={{ fontSize: "1.1rem", fontWeight: 700 }}>
            {config.enabled ? "Ativo" : "Inativo"}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Globe className="w-4 h-4 text-blue-500" />
            <span className="text-gray-500" style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Measurement ID
            </span>
          </div>
          <p className="text-gray-800 font-mono" style={{ fontSize: "1rem", fontWeight: 600 }}>
            {config.measurementId || "Não configurado"}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <MousePointerClick className="w-4 h-4 text-purple-500" />
            <span className="text-gray-500" style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Eventos Ativos
            </span>
          </div>
          <p className="text-gray-800" style={{ fontSize: "1.1rem", fontWeight: 700 }}>
            {enabledEventsCount} / {TRACKED_EVENTS.length}
          </p>
        </div>
      </div>

      {/* Main config */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column */}
        <div className="space-y-5">
          {/* Measurement ID */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-gray-800 mb-4 flex items-center gap-2" style={{ fontSize: "0.95rem", fontWeight: 700 }}>
              <Globe className="w-4 h-4 text-red-600" />
              Configuração Principal
            </h3>

            <div className="space-y-4">
              {/* Enable toggle */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-gray-700" style={{ fontSize: "0.88rem", fontWeight: 600 }}>
                    Ativar Google Analytics
                  </p>
                  <p className="text-gray-400" style={{ fontSize: "0.75rem" }}>
                    Habilitar rastreamento no site
                  </p>
                </div>
                <button
                  onClick={() => setConfig((p) => ({ ...p, enabled: !p.enabled }))}
                  className="cursor-pointer transition-colors"
                >
                  {config.enabled ? (
                    <ToggleRight className="w-10 h-10 text-green-500" />
                  ) : (
                    <ToggleLeft className="w-10 h-10 text-gray-300" />
                  )}
                </button>
              </div>

              {/* Measurement ID input */}
              <div>
                <label className="block text-gray-600 mb-1.5" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                  Measurement ID (ID de medição)
                </label>
                <input
                  type="text"
                  value={config.measurementId}
                  onChange={(e) => setConfig((p) => ({ ...p, measurementId: e.target.value.toUpperCase().trim() }))}
                  placeholder="G-XXXXXXXXXX"
                  className={`w-full border rounded-lg px-3 py-2.5 font-mono transition-colors focus:outline-none focus:ring-2 ${
                    config.measurementId && !isValidId
                      ? "bg-red-50 border-red-300 text-red-700 focus:ring-red-200"
                      : "bg-white border-gray-200 text-gray-800 focus:ring-red-200 focus:border-red-300"
                  }`}
                  style={{ fontSize: "0.9rem" }}
                />
                {config.measurementId && !isValidId && (
                  <p className="text-red-500 mt-1" style={{ fontSize: "0.72rem" }}>
                    Formato inválido. Use G- seguido de letras e números (ex: G-ABC123DEF4)
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* How to get ID */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-blue-800" style={{ fontSize: "0.88rem", fontWeight: 700 }}>
                  Como obter o Measurement ID
                </h4>
                <ol className="text-blue-700 mt-2 space-y-1.5 list-decimal list-inside" style={{ fontSize: "0.8rem" }}>
                  <li>Acesse <strong>Google Analytics</strong> e faça login</li>
                  <li>Vá em <strong>Admin</strong> (ícone de engrenagem)</li>
                  <li>Em "Propriedade", clique em <strong>Fluxos de dados</strong></li>
                  <li>Selecione ou crie um fluxo <strong>Web</strong></li>
                  <li>Copie o <strong>ID DE MEDIÇÃO</strong> (formato G-XXXXXXXXXX)</li>
                </ol>
                <a
                  href="https://analytics.google.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-800 mt-3 transition-colors"
                  style={{ fontSize: "0.8rem", fontWeight: 600 }}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Abrir Google Analytics
                </a>
              </div>
            </div>
          </div>

          {/* Snippet & Test */}
          {config.enabled && isValidId && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-gray-800 mb-4 flex items-center gap-2" style={{ fontSize: "0.95rem", fontWeight: 700 }}>
                <Copy className="w-4 h-4 text-red-600" />
                Ferramentas
              </h3>

              <div className="space-y-3">
                <button
                  onClick={handleCopySnippet}
                  className="w-full flex items-center justify-center gap-2 bg-gray-100 text-gray-700 px-4 py-2.5 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
                  style={{ fontSize: "0.82rem", fontWeight: 600 }}
                >
                  {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copiado!" : "Copiar Snippet gtag.js"}
                </button>

                <button
                  onClick={handleTestEvent}
                  className="w-full flex items-center justify-center gap-2 bg-purple-50 text-purple-700 border border-purple-200 px-4 py-2.5 rounded-lg hover:bg-purple-100 transition-colors cursor-pointer"
                  style={{ fontSize: "0.82rem", fontWeight: 600 }}
                >
                  {testSent ? <Check className="w-4 h-4 text-green-600" /> : <Activity className="w-4 h-4" />}
                  {testSent ? "Evento de teste enviado!" : "Enviar Evento de Teste"}
                </button>

                <p className="text-gray-400 text-center" style={{ fontSize: "0.72rem" }}>
                  O evento de teste aparecerá em Tempo Real no GA4 dentro de ~30s
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right column — Events */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-gray-800 mb-1 flex items-center gap-2" style={{ fontSize: "0.95rem", fontWeight: 700 }}>
            <MousePointerClick className="w-4 h-4 text-red-600" />
            Eventos Rastreados
          </h3>
          <p className="text-gray-400 mb-4" style={{ fontSize: "0.78rem" }}>
            Selecione quais eventos de e-commerce serão enviados ao GA4
          </p>

          <div className="space-y-2">
            {TRACKED_EVENTS.map((event) => {
              const Icon = event.icon;
              const isActive = config[event.key] as boolean;
              return (
                <button
                  key={event.key}
                  onClick={() => toggleEvent(event.key)}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-lg border transition-all text-left cursor-pointer ${
                    isActive
                      ? "bg-green-50 border-green-200 hover:bg-green-100"
                      : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  <div className={`rounded-lg p-2 ${isActive ? "bg-green-100" : "bg-gray-200"}`}>
                    <Icon className={`w-4 h-4 ${isActive ? "text-green-600" : "text-gray-400"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`${isActive ? "text-green-800" : "text-gray-600"}`} style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                      {event.label}
                    </p>
                    <p className={`${isActive ? "text-green-600" : "text-gray-400"}`} style={{ fontSize: "0.72rem" }}>
                      {event.description}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {isActive ? (
                      <ToggleRight className="w-8 h-8 text-green-500" />
                    ) : (
                      <ToggleLeft className="w-8 h-8 text-gray-300" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* GA4 event name reference */}
          <div className="mt-5 pt-4 border-t border-gray-100">
            <p className="text-gray-500 mb-2" style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Referência de Eventos GA4
            </p>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {TRACKED_EVENTS.map((event) => (
                  <div key={event.key} className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${config[event.key] ? "bg-green-500" : "bg-gray-300"}`} />
                    <code className="text-gray-600 font-mono" style={{ fontSize: "0.72rem" }}>
                      {event.gaEventName}
                    </code>
                  </div>
                ))}
              </div>
            </div>
            <a
              href="https://developers.google.com/analytics/devguides/collection/ga4/ecommerce"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-gray-400 hover:text-red-600 mt-2 transition-colors"
              style={{ fontSize: "0.72rem" }}
            >
              <ExternalLink className="w-3 h-3" />
              Documentação de eventos e-commerce GA4
            </a>
          </div>
        </div>
      </div>

      {/* Integration code preview */}
      {config.enabled && isValidId && (
        <div className="bg-gray-900 rounded-xl border border-gray-700 p-5 overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-gray-200 flex items-center gap-2" style={{ fontSize: "0.9rem", fontWeight: 700 }}>
              <BarChart3 className="w-4 h-4 text-green-400" />
              Código Injetado Automaticamente
            </h3>
            <span className="text-green-400 bg-green-400/10 px-2.5 py-1 rounded-full" style={{ fontSize: "0.7rem", fontWeight: 600 }}>
              AUTOMÁTICO
            </span>
          </div>
          <pre className="text-green-300 overflow-x-auto" style={{ fontSize: "0.75rem", lineHeight: 1.6 }}>
{`<!-- Injetado pelo sistema no <head> -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${config.measurementId}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${config.measurementId}');
</script>`}
          </pre>
          <p className="text-gray-500 mt-3" style={{ fontSize: "0.72rem" }}>
            Este código é injetado automaticamente em todas as páginas quando a integração está ativa.
            Os eventos selecionados acima são disparados via <code className="text-gray-400">gtag()</code> nos momentos correspondentes.
          </p>
        </div>
      )}
    </div>
  );
}