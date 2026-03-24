import React from "react";
import { Link } from "react-router";
import { Ticket, Copy, Check, Clock, ChevronDown, ChevronUp, ChevronRight, Tag, ShoppingCart, AlertCircle, Scissors, HelpCircle, ShieldCheck, Sparkles, MousePointerClick, BadgePercent, CreditCard, PartyPopper, Info, CircleDot, Home } from "lucide-react";
import * as api from "../services/api";
import type { PublicCoupon } from "../services/api";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { toast } from "sonner";

var useState = React.useState;
var useEffect = React.useEffect;
var useCallback = React.useCallback;
var useRef = React.useRef;

/* ═══════════════════════════════════════
   Countdown
   ═══════════════════════════════════════ */
function calcTimeLeft(expiresAt: string | null) {
  if (!expiresAt) return null;
  var diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
    expired: false,
  };
}

function useCountdown(expiresAt: string | null) {
  var [timeLeft, setTimeLeft] = useState(function () { return calcTimeLeft(expiresAt); });
  useEffect(function () {
    if (!expiresAt) return;
    var timer = setInterval(function () { setTimeLeft(calcTimeLeft(expiresAt)); }, 1000);
    return function () { clearInterval(timer); };
  }, [expiresAt]);
  return timeLeft;
}

function TimeBlock({ value, label, urgent }: { value: number; label: string; urgent: boolean }) {
  return (
    <div
      className={
        "flex items-center justify-center gap-0.5 px-2 py-1 rounded-md " +
        (urgent ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-800")
      }
      style={{ fontSize: "0.8rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", minWidth: "32px" }}
    >
      {String(value).padStart(2, "0")}
      <span className="text-[0.6rem] font-medium opacity-50">{label}</span>
    </div>
  );
}

function CountdownTimer({ expiresAt }: { expiresAt: string | null }) {
  var timeLeft = useCountdown(expiresAt);
  if (!timeLeft) {
    return (
      <div className="flex items-center gap-1.5 text-emerald-600" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
        <Clock className="w-3.5 h-3.5" />
        Sem prazo de validade
      </div>
    );
  }
  if (timeLeft.expired) {
    return (
      <div className="flex items-center gap-1.5 text-red-500" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
        <AlertCircle className="w-3.5 h-3.5" />
        Cupom expirado
      </div>
    );
  }
  var isUrgent = timeLeft.days === 0 && timeLeft.hours < 12;
  return (
    <div className={"flex items-center gap-2 " + (isUrgent ? "text-red-600" : "text-gray-700")}>
      <Clock className={"w-3.5 h-3.5 " + (isUrgent ? "animate-pulse" : "")} />
      <div className="flex items-center gap-1">
        {timeLeft.days > 0 && <TimeBlock value={timeLeft.days} label="d" urgent={isUrgent} />}
        <TimeBlock value={timeLeft.hours} label="h" urgent={isUrgent} />
        <span className="text-gray-300 font-bold" style={{ fontSize: "0.7rem" }}>:</span>
        <TimeBlock value={timeLeft.minutes} label="m" urgent={isUrgent} />
        <span className="text-gray-300 font-bold" style={{ fontSize: "0.7rem" }}>:</span>
        <TimeBlock value={timeLeft.seconds} label="s" urgent={isUrgent} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   Coupon Card (premium ticket design)
   ═══════════════════════════════════════ */
function CouponCard({ coupon, index }: { coupon: PublicCoupon; index: number }) {
  var [copied, setCopied] = useState(false);
  var [justCopied, setJustCopied] = useState(false);
  var [showConditions, setShowConditions] = useState(false);
  var conditionsRef = useRef<HTMLDivElement>(null);

  var handleCopy = useCallback(function () {
    // Fallback copy method for sandboxed/iframe environments
    function fallbackCopy(text: string) {
      var textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "-9999px";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        document.execCommand("copy");
      } catch (_e) { /* ignore */ }
      document.body.removeChild(textarea);
    }

    function onSuccess() {
      setCopied(true);
      setJustCopied(true);
      toast.success("Cupom \"" + coupon.code + "\" copiado!", {
        description: "Cole no campo de cupom durante o checkout.",
        duration: 3000,
      });
      setTimeout(function () { setCopied(false); }, 2500);
      setTimeout(function () { setJustCopied(false); }, 600);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(coupon.code).then(onSuccess).catch(function () {
        // Clipboard API failed — try fallback
        fallbackCopy(coupon.code);
        onSuccess();
      });
    } else {
      fallbackCopy(coupon.code);
      onSuccess();
    }
  }, [coupon.code]);

  var isPerc = coupon.discountType === "percentage";
  var isUrgent = false;
  if (coupon.expiresAt) {
    var diff = new Date(coupon.expiresAt).getTime() - Date.now();
    isUrgent = diff > 0 && diff < 12 * 60 * 60 * 1000;
  }

  // Build dynamic conditions list
  var conditions: string[] = [];
  if (isPerc) {
    conditions.push("Desconto de " + coupon.discountValue + "% aplicado sobre o valor total dos produtos no carrinho.");
  } else {
    conditions.push("Desconto fixo de R$ " + coupon.discountValue.toFixed(2).replace(".", ",") + " aplicado sobre o valor total dos produtos.");
  }
  if (coupon.minOrderValue > 0) {
    conditions.push("Válido apenas para pedidos com valor mínimo de R$ " + coupon.minOrderValue.toFixed(2).replace(".", ",") + ".");
  }
  if (coupon.singleUsePerCpf) {
    conditions.push("Utilização limitada a uma única vez por CPF/CNPJ.");
  }
  if (coupon.expiresAt) {
    var expDate = new Date(coupon.expiresAt);
    conditions.push("Válido até " + expDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) + " às " + expDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) + ".");
  } else {
    conditions.push("Sem prazo de validade definido. Sujeito a encerramento sem aviso prévio.");
  }
  // Standard conditions
  conditions.push("Não cumulativo com outros cupons. Apenas 1 cupom por pedido.");
  conditions.push("Não cumulativo com descontos à vista (Pix, Boleto ou Cartão de Crédito).");
  conditions.push("O desconto é aplicado somente sobre o valor dos produtos, não sobre o frete.");
  conditions.push("Válido exclusivamente para compras realizadas no site.");

  return (
    <div
      className="coupon-card-entrance"
      style={{ animationDelay: (index * 80) + "ms" }}
    >
      <div
        className={
          "relative bg-white rounded-2xl overflow-hidden group transition-all duration-300 " +
          (isUrgent
            ? "ring-2 ring-red-400/60 ring-offset-2 shadow-lg shadow-red-100/50 hover:shadow-xl hover:shadow-red-100/60"
            : "border border-gray-100/80 shadow-sm hover:shadow-lg hover:shadow-gray-200/50 hover:-translate-y-0.5")
        }
      >
        {/* Urgent pulsing glow */}
        {isUrgent && (
          <div className="absolute inset-0 rounded-2xl animate-pulse" style={{
            boxShadow: "inset 0 0 0 1px rgba(239,68,68,0.1)",
            pointerEvents: "none",
          }} />
        )}

        <div className="flex">
          {/* Left colored section */}
          <div className={
            "relative flex flex-col items-center justify-center px-6 py-6 min-w-[120px] " +
            (isPerc
              ? "bg-gradient-to-br from-red-500 via-red-600 to-red-700"
              : "bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600")
          }>
            {/* Subtle pattern overlay */}
            <div className="absolute inset-0 opacity-[0.07]" style={{
              backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(255,255,255,1) 8px, rgba(255,255,255,1) 9px)",
            }} />

            {/* Scissors icon */}
            <div className="absolute -right-2.5 top-4 text-white/30">
              <Scissors className="w-4 h-4 rotate-90" />
            </div>

            {/* Discount value */}
            <div className="relative text-white text-center">
              {isPerc ? (
                <>
                  <div style={{ fontSize: "2.5rem", fontWeight: 900, lineHeight: 1, textShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
                    {coupon.discountValue}%
                  </div>
                  <div className="mt-1 tracking-widest" style={{ fontSize: "0.7rem", fontWeight: 800 }}>
                    OFF
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: "0.65rem", fontWeight: 600, opacity: 0.7 }}>R$</div>
                  <div style={{ fontSize: "2.2rem", fontWeight: 900, lineHeight: 1, textShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
                    {coupon.discountValue.toFixed(0)}
                  </div>
                  <div className="mt-1 tracking-widest" style={{ fontSize: "0.7rem", fontWeight: 800 }}>
                    OFF
                  </div>
                </>
              )}
            </div>

            <div className="w-8 h-px bg-white/20 my-2.5" />
            <Tag className="w-4 h-4 text-white/40" />
          </div>

          {/* Serrated edge */}
          <div className="relative w-0 flex-shrink-0">
            <div className="absolute -top-3 -left-3 w-6 h-6 bg-gray-50 rounded-full" style={{ zIndex: 2 }} />
            <div className="absolute -bottom-3 -left-3 w-6 h-6 bg-gray-50 rounded-full" style={{ zIndex: 2 }} />
            <div className="absolute top-4 bottom-4 left-0 border-l-2 border-dashed border-gray-200/80" style={{ zIndex: 1 }} />
          </div>

          {/* Right content */}
          <div className="flex-1 flex flex-col p-5 pl-6">
            <div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-gray-900" style={{ fontSize: "1rem", fontWeight: 700, lineHeight: 1.3 }}>
                    {isPerc
                      ? coupon.discountValue + "% de desconto"
                      : "R$ " + coupon.discountValue.toFixed(2).replace(".", ",") + " de desconto"}
                  </h3>
                  {coupon.description && (
                    <p className="text-gray-500 mt-1" style={{ fontSize: "0.84rem", lineHeight: 1.5 }}>
                      {coupon.description}
                    </p>
                  )}
                </div>
                {isUrgent && (
                  <span className="shrink-0 bg-red-50 text-red-600 px-2.5 py-1 rounded-full animate-pulse flex items-center gap-1" style={{ fontSize: "0.65rem", fontWeight: 700 }}>
                    <Clock className="w-3 h-3" />
                    ACABA EM BREVE!
                  </span>
                )}
              </div>

              {/* Info chips */}
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {coupon.minOrderValue > 0 && (
                  <span className="inline-flex items-center gap-1 bg-gray-50 text-gray-500 px-2 py-0.5 rounded-full" style={{ fontSize: "0.72rem", fontWeight: 500 }}>
                    <ShoppingCart className="w-3 h-3" />
                    Min. R$ {coupon.minOrderValue.toFixed(0)}
                  </span>
                )}
                {coupon.singleUsePerCpf && (
                  <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full" style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                    <ShieldCheck className="w-3 h-3" />
                    Uso único por CPF
                  </span>
                )}
              </div>
            </div>

            {/* Bottom: code + countdown */}
            <div className="mt-4 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <button
                onClick={handleCopy}
                className={
                  "relative flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed transition-all duration-300 cursor-pointer overflow-hidden " +
                  (copied
                    ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                    : "border-gray-200 bg-gray-50/80 hover:border-red-400 hover:bg-red-50 text-gray-800 hover:text-red-700")
                }
                style={{ transform: justCopied ? "scale(0.97)" : "scale(1)", transition: "transform 150ms ease" }}
              >
                {justCopied && (
                  <div className="absolute inset-0 bg-emerald-200/40 animate-ping rounded-xl" style={{ animationDuration: "500ms", animationIterationCount: 1 }} />
                )}
                <code className="relative" style={{ fontSize: "0.88rem", fontWeight: 800, letterSpacing: "0.08em" }}>
                  {coupon.code}
                </code>
                {copied ? (
                  <Check className="w-4 h-4 text-emerald-600 relative" />
                ) : (
                  <Copy className="w-3.5 h-3.5 opacity-40 group-hover:opacity-80 relative transition-opacity" />
                )}
                <span className="relative" style={{ fontSize: "0.7rem", fontWeight: 500, opacity: 0.6 }}>
                  {copied ? "Copiado!" : "Copiar"}
                </span>
              </button>
              <CountdownTimer expiresAt={coupon.expiresAt} />
            </div>

            {/* Conditions toggle */}
            <div className="mt-3 border-t border-gray-100 pt-3">
              <button
                onClick={function () { setShowConditions(!showConditions); }}
                className="flex items-center gap-1.5 text-gray-400 hover:text-red-600 transition-colors cursor-pointer"
                style={{ fontSize: "0.75rem", fontWeight: 600 }}
              >
                <Info className="w-3.5 h-3.5" />
                Condições de uso
                <ChevronDown
                  className="w-3 h-3 transition-transform duration-200"
                  style={{ transform: showConditions ? "rotate(180deg)" : "rotate(0deg)" }}
                />
              </button>

              <div
                ref={conditionsRef}
                className="overflow-hidden transition-all duration-300"
                style={{
                  maxHeight: showConditions ? (conditionsRef.current ? conditionsRef.current.scrollHeight + 8 + "px" : "400px") : "0px",
                  opacity: showConditions ? 1 : 0,
                }}
              >
                <ul className="mt-2.5 space-y-1.5">
                  {conditions.map(function (cond, i) {
                    return (
                      <li key={i} className="flex items-start gap-2 text-gray-500" style={{ fontSize: "0.74rem", lineHeight: 1.5 }}>
                        <CircleDot className="w-3 h-3 text-gray-300 shrink-0 mt-0.5" />
                        <span>{cond}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   How-to Steps
   ═══════════════════════════════════════ */
var HOW_TO_STEPS = [
  {
    icon: MousePointerClick,
    title: "Copie o código",
    desc: "Clique no botão \"Copiar\" ao lado do cupom desejado",
    color: "text-red-600",
    bg: "bg-red-50",
  },
  {
    icon: ShoppingCart,
    title: "Adicione ao carrinho",
    desc: "Escolha seus produtos e vá para o checkout",
    color: "text-amber-600",
    bg: "bg-amber-50",
  },
  {
    icon: BadgePercent,
    title: "Aplique o cupom",
    desc: "Cole o código no campo \"Inserir cupom\" na tela de pagamento",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
  },
  {
    icon: PartyPopper,
    title: "Aproveite!",
    desc: "O desconto será aplicado automaticamente no valor do pedido",
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
];

/* ═══════════════════════════════════════
   FAQ
   ═══════════════════════════════════════ */
var FAQ_ITEMS = [
  {
    q: "Como aplicar o cupom de desconto?",
    a: "A opção de inserir seu cupom de desconto aparece disponível na etapa de pagamento no site. É só clicar em \"Inserir cupom\" e logo em seguida adicionar o código na caixa que aparecer.",
  },
  {
    q: "Posso usar dois cupons ao mesmo tempo?",
    a: "Não, somente um cupom pode ser aplicado por pedido pois não são cumulativos.",
  },
  {
    q: "Posso usar o mesmo cupom mais de uma vez?",
    a: "Os cupons têm validade de utilização de uma vez por CPF. Uma vez que o cupom já foi utilizado, não será possível utilizá-lo novamente, somente em um novo CPF.",
  },
  {
    q: "O cupom é válido para todas as formas de pagamento?",
    a: "Sim, o cupom é válido para todas as formas de pagamento, exceto para descontos à vista no Pix, no Boleto e no cartão de crédito. Esses descontos não são cumulativos com o cupom. Para aproveitar os descontos especiais (10% no Pix e no Boleto, ou 5% no cartão de crédito), o cupom deve ser removido.",
  },
  {
    q: "Posso utilizar um cupom e ainda ter frete grátis?",
    a: "Claro que pode! Aqui na Carretão Auto Peças você pode usar um cupom e ainda desfrutar do frete grátis (quando houver). Mas atenção, o desconto se aplica apenas ao valor do produto e não para tornar o frete menor.",
  },
  {
    q: "O cupom tem uma data de validade?",
    a: "Sim. Alguns cupons funcionam somente por um dia, por exemplo. Fique de olho nas regras de uso e no relógio de cada cupom e aproveite ao máximo!",
  },
  {
    q: "O cupom de desconto pode ser aplicado no valor do frete?",
    a: "Não. O cupom de desconto age diminuindo o valor total do produto ou produtos, o frete não é alterado.",
  },
  {
    q: "Meu cupom não está funcionando, o que faço?",
    a: "Para garantir que seu cupom seja aceito, certifique-se de que a grafia esteja correta, copiando e colando-o exatamente como apresentado, respeitando as letras maiúsculas e minúsculas. Não se esqueça também de verificar a data de validade do cupom.",
  },
  {
    q: "Posso usar o cupom do site nas lojas físicas?",
    a: "Não. Os cupons disponíveis no site da Carretão Auto Peças não são válidos para compras nas lojas físicas.",
  },
];

function FaqItem({ item, isOpen, onToggle }: { item: typeof FAQ_ITEMS[0]; isOpen: boolean; onToggle: () => void }) {
  var contentRef = useRef<HTMLDivElement>(null);
  return (
    <div className={
      "border rounded-xl overflow-hidden transition-all duration-300 " +
      (isOpen ? "border-red-200 bg-white shadow-sm shadow-red-50" : "border-gray-100 bg-white hover:border-gray-200")
    }>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left cursor-pointer group"
      >
        <div className="flex items-center gap-3">
          <div className={
            "w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors " +
            (isOpen ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-400 group-hover:bg-red-50 group-hover:text-red-400")
          }>
            <HelpCircle className="w-3.5 h-3.5" />
          </div>
          <span className={"transition-colors " + (isOpen ? "text-red-700" : "text-gray-800")} style={{ fontSize: "0.88rem", fontWeight: 600 }}>
            {item.q}
          </span>
        </div>
        <div className={
          "w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all " +
          (isOpen ? "bg-red-100 rotate-0" : "bg-gray-50 rotate-0")
        }>
          {isOpen
            ? <ChevronUp className="w-3.5 h-3.5 text-red-500" />
            : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          }
        </div>
      </button>
      <div
        ref={contentRef}
        className="overflow-hidden transition-all duration-300"
        style={{
          maxHeight: isOpen ? (contentRef.current ? contentRef.current.scrollHeight + 20 + "px" : "300px") : "0px",
          opacity: isOpen ? 1 : 0,
        }}
      >
        <div className="px-5 pb-4 pl-14 text-gray-600 leading-relaxed" style={{ fontSize: "0.84rem" }}>
          {item.a}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   Main Page
   ═══════════════════════════════════════ */
export function CouponsPage() {
  useDocumentMeta({
    title: "Cupons de Desconto | Carretão Auto Peças",
    description: "Confira os cupons de desconto ativos da Carretão Auto Peças. Economize na compra de peças para caminhões.",
  });

  var [coupons, setCoupons] = useState<PublicCoupon[]>([]);
  var [loading, setLoading] = useState(true);
  var [error, setError] = useState("");
  var [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(function () {
    api.getPublicCoupons()
      .then(function (res) { setCoupons(res.coupons || []); })
      .catch(function (err) {
        console.error("[CouponsPage] Error loading coupons:", err);
        setError("Erro ao carregar cupons. Tente novamente.");
      })
      .finally(function () { setLoading(false); });
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Keyframes */}
      <style>{`
        @keyframes couponCardIn {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .coupon-card-entrance {
          animation: couponCardIn 400ms cubic-bezier(0.16,1,0.3,1) both;
        }
        @keyframes floatTicket {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50%      { transform: translateY(-8px) rotate(5deg); }
        }
        @keyframes heroShimmer {
          0%   { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes stepIn {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .step-entrance {
          animation: stepIn 500ms cubic-bezier(0.16,1,0.3,1) both;
        }
      `}</style>

      {/* Hero */}
      <section className="relative overflow-hidden" style={{
        background: "linear-gradient(135deg, #b91c1c 0%, #dc2626 40%, #ef4444 100%)",
      }}>
        {/* Animated pattern */}
        <div className="absolute inset-0 opacity-[0.06]" style={{
          backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 20px, rgba(255,255,255,1) 20px, rgba(255,255,255,1) 21px)",
        }} />

        {/* Floating ticket decorations */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[
            { left: "8%", top: "15%", size: 28, delay: "0s", dur: "4s", opacity: 0.08, rot: -15 },
            { left: "85%", top: "20%", size: 36, delay: "1s", dur: "5s", opacity: 0.06, rot: 20 },
            { left: "20%", top: "70%", size: 22, delay: "2s", dur: "3.5s", opacity: 0.07, rot: -30 },
            { left: "70%", top: "75%", size: 30, delay: "0.5s", dur: "4.5s", opacity: 0.05, rot: 10 },
            { left: "50%", top: "10%", size: 20, delay: "1.5s", dur: "3s", opacity: 0.06, rot: 45 },
            { left: "92%", top: "60%", size: 24, delay: "2.5s", dur: "4s", opacity: 0.07, rot: -20 },
          ].map(function (t, i) {
            return (
              <Ticket
                key={i}
                className="absolute text-white"
                style={{
                  left: t.left,
                  top: t.top,
                  width: t.size,
                  height: t.size,
                  opacity: t.opacity,
                  transform: "rotate(" + t.rot + "deg)",
                  animation: "floatTicket " + t.dur + " ease-in-out infinite",
                  animationDelay: t.delay,
                }}
              />
            );
          })}
        </div>

        {/* Shimmer bar at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-1" style={{
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)",
          backgroundSize: "200% 100%",
          animation: "heroShimmer 3s ease-in-out infinite",
        }} />

        <div className="relative max-w-4xl mx-auto px-4 py-8 md:py-10">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 mb-5 text-white/60" style={{ fontSize: "0.78rem" }}>
            <Link to="/" className="hover:text-white transition-colors flex items-center gap-1">
              <Home className="w-3.5 h-3.5" />
              Início
            </Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-white/90 font-semibold">Cupons de Desconto</span>
          </nav>

          <div className="flex items-center gap-5">
            {/* Icon badge */}
            <div className="hidden sm:flex items-center justify-center bg-white/15 rounded-xl border border-white/10 shrink-0"
              style={{ width: 56, height: 56 }}
            >
              <Ticket className="w-7 h-7 text-white drop-shadow-lg" />
            </div>

            <div className="flex-1 min-w-0">
              <h1 className="text-white" style={{ fontSize: "clamp(1.3rem, 3vw, 1.7rem)", fontWeight: 800, letterSpacing: "-0.01em" }}>
                Cupons de Desconto
              </h1>
              <p className="text-white/75 mt-0.5" style={{ fontSize: "0.88rem", lineHeight: 1.5 }}>
                Aproveite nossos cupons exclusivos e economize nas suas compras!
              </p>
            </div>

            {!loading && coupons.length > 0 && (
              <div className="hidden sm:flex items-center gap-2 bg-white/15 px-4 py-2 rounded-full text-white border border-white/10 shrink-0" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                <Sparkles className="w-3.5 h-3.5" />
                {coupons.length} {coupons.length === 1 ? "cupom ativo" : "cupons ativos"}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Coupons List */}
      <section className="max-w-5xl mx-auto px-4 py-10">
        {loading ? (
          <div className="grid grid-cols-1 gap-4">
            {[1, 2, 3].map(function (i) {
              return (
                <div key={i} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="flex">
                    <div className="w-[120px] bg-gray-200 animate-pulse" style={{ minHeight: 160 }} />
                    <div className="flex-1 p-5 space-y-3">
                      <div className="h-5 bg-gray-200 rounded-lg w-1/3 animate-pulse" />
                      <div className="h-4 bg-gray-100 rounded-lg w-2/3 animate-pulse" />
                      <div className="h-3 bg-gray-100 rounded-lg w-1/4 animate-pulse" />
                      <div className="flex gap-3 mt-4">
                        <div className="h-11 bg-gray-100 rounded-xl w-44 animate-pulse" />
                        <div className="h-8 bg-gray-50 rounded-lg w-36 animate-pulse" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-red-400" />
            </div>
            <p className="text-gray-600 mb-1" style={{ fontSize: "1rem", fontWeight: 600 }}>Ops! Algo deu errado</p>
            <p className="text-gray-400 mb-6" style={{ fontSize: "0.88rem" }}>{error}</p>
            <button
              onClick={function () { window.location.reload(); }}
              className="px-6 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors cursor-pointer"
              style={{ fontSize: "0.88rem", fontWeight: 600 }}
            >
              Tentar Novamente
            </button>
          </div>
        ) : coupons.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <Ticket className="w-10 h-10 text-gray-300" />
            </div>
            <h2 className="text-gray-700 mb-2" style={{ fontSize: "1.15rem", fontWeight: 700 }}>
              Nenhum cupom disponível no momento
            </h2>
            <p className="text-gray-400 mb-8 max-w-md mx-auto" style={{ fontSize: "0.9rem", lineHeight: 1.6 }}>
              Fique de olho! Novos cupons podem aparecer a qualquer momento. Siga nossas redes sociais para não perder nenhuma oferta.
            </p>
            <Link
              to="/"
              className="inline-flex items-center gap-2 bg-red-600 text-white px-7 py-3 rounded-xl hover:bg-red-700 transition-colors shadow-sm shadow-red-200"
              style={{ fontSize: "0.92rem", fontWeight: 600 }}
            >
              <ShoppingCart className="w-4 h-4" />
              Continuar Comprando
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {coupons.map(function (coupon, idx) {
              return <CouponCard key={coupon.code} coupon={coupon} index={idx} />;
            })}
          </div>
        )}
      </section>

      {/* How to Use Section */}
      <section className="max-w-5xl mx-auto px-4 pb-12 pt-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                <CreditCard className="w-4 h-4 text-red-600" />
              </div>
              <div>
                <h2 className="text-gray-900" style={{ fontSize: "1.1rem", fontWeight: 700 }}>
                  Como usar seu cupom
                </h2>
                <p className="text-gray-400" style={{ fontSize: "0.78rem" }}>
                  É rápido e fácil! Siga os passos abaixo
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-gray-100">
            {HOW_TO_STEPS.map(function (step, idx) {
              var Icon = step.icon;
              return (
                <div
                  key={idx}
                  className="step-entrance bg-white p-5 relative group"
                  style={{ animationDelay: (idx * 100) + "ms" }}
                >
                  {/* Step number */}
                  <div className="absolute top-4 right-4 text-gray-200" style={{ fontSize: "2rem", fontWeight: 900, lineHeight: 1 }}>
                    {idx + 1}
                  </div>

                  <div className={"w-10 h-10 rounded-xl flex items-center justify-center mb-3 " + step.bg}>
                    <Icon className={"w-5 h-5 " + step.color} />
                  </div>
                  <h3 className="text-gray-800 mb-1" style={{ fontSize: "0.9rem", fontWeight: 700 }}>
                    {step.title}
                  </h3>
                  <p className="text-gray-500" style={{ fontSize: "0.78rem", lineHeight: 1.5 }}>
                    {step.desc}
                  </p>

                  {/* Arrow connector (hidden on last + mobile) */}
                  {idx < 3 && (
                    <div className="hidden lg:flex absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-6 h-6 bg-white border border-gray-200 rounded-full items-center justify-center">
                      <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="max-w-3xl mx-auto px-4 pb-16 pt-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-red-50 text-red-600 px-4 py-1.5 rounded-full mb-3" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
            <HelpCircle className="w-3.5 h-3.5" />
            FAQ
          </div>
          <h2 className="text-gray-900" style={{ fontSize: "1.4rem", fontWeight: 800 }}>
            Dúvidas Frequentes
          </h2>
          <p className="text-gray-400 mt-1" style={{ fontSize: "0.88rem" }}>
            Tudo sobre nossos cupons de desconto
          </p>
        </div>

        <div className="space-y-2">
          {FAQ_ITEMS.map(function (item, idx) {
            return (
              <FaqItem
                key={idx}
                item={item}
                isOpen={openFaq === idx}
                onToggle={function () { setOpenFaq(openFaq === idx ? null : idx); }}
              />
            );
          })}
        </div>
      </section>

      {/* CTA Bottom */}
      <section className="bg-gradient-to-r from-red-600 to-red-700">
        <div className="max-w-5xl mx-auto px-4 py-10 text-center">
          <h2 className="text-white mb-2" style={{ fontSize: "1.3rem", fontWeight: 800 }}>
            Não encontrou o que procura?
          </h2>
          <p className="text-red-200 mb-6" style={{ fontSize: "0.9rem" }}>
            Confira nossas promoções e ofertas especiais
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-2 bg-white text-red-600 px-6 py-3 rounded-xl hover:bg-red-50 transition-colors shadow-sm"
              style={{ fontSize: "0.9rem", fontWeight: 600 }}
            >
              <ShoppingCart className="w-4 h-4" />
              Ver Produtos
            </Link>
            <Link
              to="/catalogo"
              className="inline-flex items-center gap-2 bg-red-500/30 text-white border border-white/20 px-6 py-3 rounded-xl hover:bg-red-500/40 transition-colors"
              style={{ fontSize: "0.9rem", fontWeight: 600 }}
            >
              <Sparkles className="w-4 h-4" />
              Super Promo
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}