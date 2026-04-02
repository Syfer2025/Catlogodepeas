/**
 * AdminTransactionalEmails — Preview e envio de teste de todos os emails transacionais
 *
 * Permite ao admin visualizar e testar cada tipo de email que o site envia:
 * confirmacao de pedido, pagamento aprovado, notificacao admin, envio/rastreio,
 * carrinho abandonado, certificado de garantia.
 */
import { useState, useCallback } from "react";
import { Mail, Send, Eye, CheckCircle, AlertTriangle, Loader2, ShoppingCart, CreditCard, Bell, Truck, ShoppingBag, ShieldCheck, RefreshCw } from "lucide-react";
import * as api from "../../services/api";
import { getValidAdminToken } from "./adminAuth";

interface EmailTypeConfig {
  id: api.TransactionalEmailType;
  label: string;
  description: string;
  icon: typeof Mail;
  color: string;
  bgColor: string;
  borderColor: string;
  trigger: string;
}

const EMAIL_TYPES: EmailTypeConfig[] = [
  {
    id: "order_confirmation",
    label: "Confirmacao de Pedido",
    description: "Enviado ao cliente quando o pedido e criado. Inclui itens, endereco, frete e total.",
    icon: ShoppingCart,
    color: "text-red-700",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    trigger: "Automatico: ao criar pedido (PIX, Boleto, MP, Cartao)",
  },
  {
    id: "payment_approved",
    label: "Pagamento Aprovado",
    description: "Enviado ao cliente quando o pagamento e confirmado. Mostra status atualizado e link para acompanhar.",
    icon: CreditCard,
    color: "text-green-700",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
    trigger: "Automatico: webhook PagHiper/MercadoPago confirma pagamento",
  },
  {
    id: "admin_new_order",
    label: "Notificacao Admin (Novo Pedido)",
    description: "Enviado a todos os admins quando um novo pedido e recebido. Mostra dados do cliente e itens.",
    icon: Bell,
    color: "text-blue-700",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    trigger: "Automatico: ao criar pedido (enviado para todos os admins cadastrados)",
  },
  {
    id: "shipping_notification",
    label: "Pedido Enviado / Rastreio",
    description: "Enviado ao cliente quando o pedido e despachado. Inclui codigo de rastreio e link dos Correios.",
    icon: Truck,
    color: "text-indigo-700",
    bgColor: "bg-indigo-50",
    borderColor: "border-indigo-200",
    trigger: "Automatico: ao atualizar status do pedido para 'enviado' com codigo de rastreio",
  },
  {
    id: "abandoned_cart",
    label: "Carrinho Abandonado",
    description: "Enviado ao cliente que adicionou itens ao carrinho mas nao finalizou a compra.",
    icon: ShoppingBag,
    color: "text-amber-700",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
    trigger: "Automatico: WhatsApp Cart Recovery / Email recovery via cron",
  },
  {
    id: "warranty_certificate",
    label: "Certificado de Garantia Estendida",
    description: "Enviado ao cliente quando o pagamento de um pedido com garantia estendida e confirmado.",
    icon: ShieldCheck,
    color: "text-purple-700",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
    trigger: "Automatico: pagamento confirmado de pedido com itens com garantia",
  },
];

export function AdminTransactionalEmails() {
  var [testEmail, setTestEmail] = useState("");
  var [sending, setSending] = useState<Record<string, boolean>>({});
  var [result, setResult] = useState<Record<string, { ok: boolean; message: string }>>({});
  var [previewType, setPreviewType] = useState<api.TransactionalEmailType | null>(null);
  var [previewHtml, setPreviewHtml] = useState("");
  var [previewLoading, setPreviewLoading] = useState(false);

  var handleSendTest = useCallback(async function (type: api.TransactionalEmailType) {
    if (!testEmail || testEmail.indexOf("@") < 1) {
      setResult(function (prev) { return { ...prev, [type]: { ok: false, message: "Informe um email de destino valido." } }; });
      return;
    }
    setSending(function (prev) { return { ...prev, [type]: true }; });
    setResult(function (prev) { var n = { ...prev }; delete n[type]; return n; });
    try {
      var token = await getValidAdminToken();
      if (!token) throw new Error("Sessao expirada. Faca login novamente.");
      var res = await api.sendTransactionalTestEmail(token, type, testEmail);
      setResult(function (prev) { return { ...prev, [type]: { ok: true, message: res.message || "Enviado!" } }; });
    } catch (e: any) {
      setResult(function (prev) { return { ...prev, [type]: { ok: false, message: e.message || "Erro ao enviar." } }; });
    } finally {
      setSending(function (prev) { return { ...prev, [type]: false }; });
    }
  }, [testEmail]);

  var handlePreview = useCallback(async function (type: api.TransactionalEmailType) {
    if (previewType === type) {
      setPreviewType(null);
      return;
    }
    setPreviewType(type);
    setPreviewLoading(true);
    setPreviewHtml("");
    try {
      var token = await getValidAdminToken();
      if (!token) throw new Error("Sessao expirada.");
      var res = await api.previewTransactionalEmail(token, type);
      setPreviewHtml(res.html || "");
    } catch (e: any) {
      setPreviewHtml("<p style='color:red;padding:20px;'>Erro ao carregar preview: " + (e.message || "") + "</p>");
    } finally {
      setPreviewLoading(false);
    }
  }, [previewType]);

  var handleSendAll = useCallback(async function () {
    if (!testEmail || testEmail.indexOf("@") < 1) return;
    for (var i = 0; i < EMAIL_TYPES.length; i++) {
      await handleSendTest(EMAIL_TYPES[i].id);
    }
  }, [testEmail, handleSendTest]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Mail className="w-5 h-5 text-red-600" />
          Emails Transacionais
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Visualize e envie testes de todos os emails automaticos do site. Os emails usam dados fictícios para demonstracao.
        </p>
      </div>

      {/* Email input */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Email de destino para testes
        </label>
        <div className="flex gap-3">
          <input
            type="email"
            placeholder="seu@email.com"
            value={testEmail}
            onChange={function (e) { setTestEmail(e.target.value); }}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
          />
          <button
            onClick={handleSendAll}
            disabled={!testEmail || testEmail.indexOf("@") < 1}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
          >
            <Send className="w-4 h-4" />
            Enviar Todos
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Todos os emails de teste terao [TESTE] no assunto. Os dados (pedido, itens, enderecos) sao fictícios.
        </p>
      </div>

      {/* Email type cards */}
      <div className="space-y-3">
        {EMAIL_TYPES.map(function (et) {
          var Icon = et.icon;
          var isSending = sending[et.id];
          var res = result[et.id];
          var isPreviewOpen = previewType === et.id;
          return (
            <div key={et.id} className={"bg-white rounded-xl border shadow-sm overflow-hidden " + (isPreviewOpen ? "border-gray-300" : "border-gray-200")}>
              <div className="p-4">
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className={"w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 " + et.bgColor}>
                    <Icon className={"w-5 h-5 " + et.color} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900">{et.label}</h3>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{et.description}</p>
                    <div className="flex items-center gap-1 mt-1.5">
                      <RefreshCw className="w-3 h-3 text-gray-400" />
                      <span className="text-[11px] text-gray-400">{et.trigger}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={function () { handlePreview(et.id); }}
                      className={"px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors " + (isPreviewOpen ? "bg-gray-100 border-gray-300 text-gray-700" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50")}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      {isPreviewOpen ? "Fechar" : "Preview"}
                    </button>
                    <button
                      onClick={function () { handleSendTest(et.id); }}
                      disabled={isSending || !testEmail || testEmail.indexOf("@") < 1}
                      className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                    >
                      {isSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      Enviar Teste
                    </button>
                  </div>
                </div>

                {/* Result */}
                {res && (
                  <div className={"mt-3 px-3 py-2 rounded-lg text-xs flex items-center gap-2 " + (res.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>
                    {res.ok ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />}
                    {res.message}
                  </div>
                )}
              </div>

              {/* Preview iframe */}
              {isPreviewOpen && (
                <div className="border-t border-gray-200 bg-gray-50">
                  {previewLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                    </div>
                  ) : (
                    <div className="p-4">
                      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mx-auto" style={{ maxWidth: 640 }}>
                        <iframe
                          srcDoc={previewHtml}
                          title={"Preview: " + et.label}
                          className="w-full border-0"
                          style={{ height: 600 }}
                          sandbox="allow-same-origin"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Info section */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Como funciona</h3>
        <ul className="text-xs text-gray-500 space-y-1.5">
          <li>Os emails transacionais sao enviados automaticamente pelo sistema nos momentos indicados acima.</li>
          <li>Todos usam o SMTP configurado na aba <strong>Email Marketing &gt; Config</strong>.</li>
          <li>A logo do site (configurada em Configuracoes) aparece no topo de cada email.</li>
          <li>Os emails de teste usam dados fictícios (pedido, itens, enderecos) para demonstracao.</li>
          <li>Se o SMTP nao estiver configurado, nenhum email transacional sera enviado pelo sistema.</li>
        </ul>
      </div>
    </div>
  );
}
