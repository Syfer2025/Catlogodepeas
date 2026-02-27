import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useSearchParams, useNavigate } from "react-router";
import { useCatalogMode } from "../contexts/CatalogModeContext";
import {
  ShoppingCart,
  Package,
  Loader2,
  ArrowLeft,
  Trash2,
  Plus,
  Minus,
  Home,
  CheckCircle2,
  AlertTriangle,
  User,
  MessageCircle,
  FileText,
  CreditCard,
  LogIn,
  QrCode,
  Copy,
  Check,
  Clock,
  ExternalLink,
  Barcode,
  RefreshCw,
  Truck,
  Wallet,
  Ticket,
  X,
} from "lucide-react";
import { useCart } from "../contexts/CartContext";
import { supabase } from "../services/supabaseClient";
import { getValidAccessToken } from "../services/supabaseClient";
import * as api from "../services/api";
import { useGA4 } from "../components/GA4Provider";
import { ShippingCalculator } from "../components/ShippingCalculator";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { ProductImage } from "../components/ProductImage";
import { CheckoutAddressManager } from "../components/CheckoutAddressManager";
import { useAffiliate } from "../contexts/AffiliateContext";

function formatPrice(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9)
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

type CheckoutStep = "review" | "payment" | "processing" | "awaiting" | "success" | "error" | "mp-redirect";
type PaymentMethod = "pix" | "boleto" | "mercadopago" | "cartao_credito";

interface UserProfile {
  name: string;
  email: string;
  phone: string;
  cpf: string;
  address: string;
  city: string;
  state: string;
  cep: string;
}

export function CheckoutPage() {
  const { catalogMode } = useCatalogMode();
  const { items, totalItems, totalPrice, removeItem, updateQuantity, clearCart } = useCart();
  const { trackEvent } = useGA4();
  const { affiliateCode, clearAffiliateCode } = useAffiliate();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useDocumentMeta({
    title: "Checkout - Carretão Auto Peças",
    description: "Finalize sua compra na Carretão Auto Peças. Pagamento via PIX, Boleto ou Mercado Pago.",
  });

  // Auth
  const [userId, setUserId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // User profile
  const [profile, setProfile] = useState<UserProfile>({
    name: "", email: "", phone: "", cpf: "",
    address: "", city: "", state: "", cep: "",
  });
  const [profileLoading, setProfileLoading] = useState(false);

  // Checkout
  const [step, setStep] = useState<CheckoutStep>("review");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [observacao, setObservacao] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [errorDetail, setErrorDetail] = useState("");

  // Personal data inline edit
  const [nameEdit, setNameEdit] = useState("");
  const [cpfEdit, setCpfEdit] = useState("");
  const [phoneEdit, setPhoneEdit] = useState("");

  // LGPD terms acceptance
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // Order result
  const [orderId, setOrderId] = useState<string | null>(null);
  const [sigeOrderId, setSigeOrderId] = useState<string | null>(null);

  // Payment result
  const [pixData, setPixData] = useState<api.PixCreateResponse | null>(null);
  const [boletoData, setBoletoData] = useState<api.BoletoCreateResponse | null>(null);
  const [txId, setTxId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<string>("pending");
  const [paymentStatusLabel, setPaymentStatusLabel] = useState("Pendente");
  const [copied, setCopied] = useState(false);

  // Polling
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Shipping
  const [selectedShipping, setSelectedShipping] = useState<api.ShippingOption | null>(null);
  const shippingPrice = selectedShipping?.price ?? 0;

  // Address
  const [selectedAddress, setSelectedAddress] = useState<api.UserAddress | null>(null);

  // Coupon
  const [couponCode, setCouponCode] = useState("");
  const [couponValidating, setCouponValidating] = useState(false);
  const [couponApplied, setCouponApplied] = useState<{
    code: string;
    discountType: "percentage" | "fixed";
    discountValue: number;
    discountAmount: number;
    description?: string;
  } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  const couponDiscount = couponApplied?.discountAmount ?? 0;
  const totalWithShipping = totalPrice + shippingPrice - couponDiscount;

  // Mercado Pago
  const [mpEnabled, setMpEnabled] = useState(false);
  const [mpSandbox, setMpSandbox] = useState(false);
  const [mpReturnHandled, setMpReturnHandled] = useState(false);

  // SafraPay (Credit Card)
  const [spEnabled, setSpEnabled] = useState(false);
  const [spConfig, setSpConfig] = useState<api.SafrapayPublicConfig | null>(null);
  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [cardExpMonth, setCardExpMonth] = useState("");
  const [cardExpYear, setCardExpYear] = useState("");
  const [cardInstallments, setCardInstallments] = useState(1);
  const [cardBrand, setCardBrand] = useState<string | null>(null);

  // ═══════ STOCK VALIDATION LAYER 3: Checkout entry validation ═══════
  const [stockValidation, setStockValidation] = useState<{
    loading: boolean;
    checked: boolean;
    issues: Array<{
      sku: string;
      titulo: string;
      requested: number;
      available: number | null;
      outOfStock: boolean;
      insufficientQty: boolean;
    }>;
  }>({ loading: false, checked: false, issues: [] });

  // ─── Auth check (with automatic session refresh) ───
  useEffect(() => {
    getValidAccessToken().then((freshToken) => {
      if (freshToken) {
        supabase.auth.getSession().then(({ data }) => {
          if (data.session?.user) {
            setUserId(data.session.user.id);
          }
          setAccessToken(freshToken);
          setAuthLoading(false);
        });
      } else {
        setAuthLoading(false);
      }
    });
  }, []);

  // ─── Load profile when authenticated ───
  useEffect(() => {
    if (!accessToken) return;
    setProfileLoading(true);
    api.userMe(accessToken)
      .then((me) => {
        setProfile({
          name: me.name || "",
          email: me.email || "",
          phone: me.phone || "",
          cpf: me.cpf || "",
          address: me.address || "",
          city: me.city || "",
          state: me.state || "",
          cep: me.cep || "",
        });
        setNameEdit(me.name || "");
        setCpfEdit(me.cpf ? formatCpf(me.cpf) : "");
        setPhoneEdit(me.phone ? formatPhone(me.phone) : "");
      })
      .catch((e) => {
        console.warn("Profile load error:", e);
      })
      .finally(() => setProfileLoading(false));
  }, [accessToken]);

  // ─── Check if Mercado Pago is enabled ───
  useEffect(() => {
    api.checkMPEnabled()
      .then((res) => {
        setMpEnabled(res.enabled);
        setMpSandbox(res.sandbox);
      })
      .catch(() => setMpEnabled(false));
  }, []);

  // ─── Check if SafraPay (credit card) is enabled ───
  useEffect(() => {
    api.safrapayPublicConfig()
      .then((res) => {
        setSpEnabled(res.enabled);
        setSpConfig(res);
      })
      .catch(() => setSpEnabled(false));
  }, []);

  // ─── Card brand detection ───
  useEffect(() => {
    const digits = cardNumber.replace(/\D/g, "");
    if (digits.length >= 4) {
      if (digits.startsWith("4")) setCardBrand("visa");
      else if (/^5[1-5]/.test(digits) || /^2[2-7]/.test(digits)) setCardBrand("mastercard");
      else if (digits.startsWith("34") || digits.startsWith("37")) setCardBrand("amex");
      else if (/^(636|438|504|451|5067|4576|4011|506)/.test(digits)) setCardBrand("elo");
      else setCardBrand(null);
    } else {
      setCardBrand(null);
    }
  }, [cardNumber]);

  // ─── LAYER 3: Validate stock for all cart items on checkout entry ───
  useEffect(() => {
    if (items.length === 0) return;
    if (stockValidation.checked) return; // Only check once on entry
    setStockValidation(function (prev) { return { ...prev, loading: true }; });

    var skus = items.map(function (i) { return i.sku; });
    api.getProductBalances(skus, { force: true })
      .then(function (res) {
        var issues: typeof stockValidation.issues = [];
        var balanceMap: Record<string, any> = {};
        for (var bi = 0; bi < (res.results || []).length; bi++) {
          var b = res.results[bi];
          balanceMap[b.sku] = b;
        }
        for (var ci = 0; ci < items.length; ci++) {
          var item = items[ci];
          var bal = balanceMap[item.sku];
          if (!bal) continue; // No balance data — skip
          var available = bal.found ? (bal.disponivel ?? bal.quantidade ?? 0) : null;
          var outOfStk = bal.found && available !== null && available <= 0;
          var insufficientQty = bal.found && available !== null && available > 0 && item.quantidade > available;
          if (outOfStk || insufficientQty) {
            issues.push({
              sku: item.sku,
              titulo: item.titulo,
              requested: item.quantidade,
              available: available,
              outOfStock: outOfStk,
              insufficientQty: insufficientQty,
            });
          }
        }
        console.log("[Checkout] Layer 3 stock validation: " + skus.length + " items checked, " + issues.length + " issues found");
        setStockValidation({ loading: false, checked: true, issues: issues });
      })
      .catch(function (e) {
        console.warn("[Checkout] Layer 3 stock validation failed (non-blocking):", e);
        setStockValidation({ loading: false, checked: true, issues: [] });
      });
  }, [items.length]); // Re-check when item count changes

  // ─── Handle Mercado Pago return URL ───
  useEffect(() => {
    const collectionStatus = searchParams.get("collection_status");
    const collectionId = searchParams.get("collection_id");
    const extRef = searchParams.get("external_reference");
    const prefId = searchParams.get("preference_id");

    if (!collectionStatus && !collectionId) return;
    if (mpReturnHandled) return;
    setMpReturnHandled(true);

    // Restore order ID from MP external_reference
    if (extRef) setOrderId(extRef);

    if (collectionStatus === "approved") {
      setStep("success");
      setPaymentMethod("mercadopago");
      clearCart();
      trackEvent("purchase", {
        transaction_id: collectionId || extRef || "",
        currency: "BRL",
        value: totalPrice,
        payment_type: "mercadopago",
      });
      // NOTE: "paid" status is set by MercadoPago webhook (server-side verified).
      // User endpoint blocks "paid" for security. Save transactionId only.
      if (accessToken && extRef && collectionId) {
        api.updateOrderStatus(accessToken, extRef, "awaiting_payment", collectionId).catch(e =>
          console.error("MP return: update transactionId error (non-fatal):", e)
        );
      }
    } else if (collectionStatus === "pending" || collectionStatus === "in_process") {
      setStep("awaiting");
      setPaymentMethod("mercadopago");
      setPaymentStatusLabel("Processando no Mercado Pago");
      if (collectionId) {
        setTxId(collectionId);
        // Start polling MP payment status
        startMPPolling(collectionId, extRef || null);
      }
    } else if (collectionStatus === "rejected" || collectionStatus === "null") {
      setStep("error");
      setPaymentMethod("mercadopago");
      setErrorMessage("Pagamento não foi aprovado pelo Mercado Pago.");
      setErrorDetail("Você pode tentar novamente com outro método de pagamento.");
    }

    // Clean URL params
    navigate("/checkout", { replace: true });
  }, [searchParams, mpReturnHandled, clearCart, trackEvent, totalPrice, navigate]);

  // ─── Cleanup polling ───
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Effective personal data (from edited fields or profile fallback)
  const effectiveName = nameEdit.trim() || profile.name.trim();
  const effectiveCpf = cpfEdit.replace(/\D/g, "") || profile.cpf.replace(/\D/g, "");
  const effectivePhone = phoneEdit.replace(/\D/g, "") || profile.phone.replace(/\D/g, "");

  // Validations
  const nameValid = effectiveName.length >= 2;
  const cpfValid = effectiveCpf.length === 11;
  const phoneValid = effectivePhone.length >= 10;

  // Address validation — uses the new address picker
  const addressComplete = selectedAddress != null &&
    selectedAddress.street.trim().length > 0 &&
    selectedAddress.city.trim().length > 0 &&
    selectedAddress.state.trim().length > 0 &&
    selectedAddress.cep.replace(/\D/g, "").length >= 8;

  // Can proceed to payment? Name, CPF, phone AND address must be filled
  const personalDataComplete = nameValid && cpfValid && phoneValid;
  const hasStockIssues = stockValidation.checked && stockValidation.issues.length > 0;
  const canProceed = items.length > 0 && totalPrice > 0 && addressComplete && personalDataComplete && !hasStockIssues;
  const cardFieldsValid = paymentMethod !== "cartao_credito" || (
    cardNumber.replace(/\D/g, "").length >= 13 &&
    cardCvv.length >= 3 &&
    cardName.length >= 3 &&
    !!cardExpMonth &&
    !!cardExpYear
  );
  const canSubmitPayment = canProceed && acceptedTerms && cardFieldsValid;

  // ─── Generate unique order ID ───
  const generateOrderId = useCallback(() => {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `CAR-${ts}-${rand}`;
  }, []);

  // ─── Validate coupon ───
  const handleValidateCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) return;
    setCouponValidating(true);
    setCouponError(null);
    try {
      const result = await api.validateCoupon(code, totalPrice);
      if (result.valid) {
        setCouponApplied({
          code: result.code || code,
          discountType: result.discountType || "percentage",
          discountValue: result.discountValue || 0,
          discountAmount: result.discountAmount || 0,
          description: result.description,
        });
        setCouponError(null);
        trackEvent("select_promotion", {
          promotion_name: code,
          discount: result.discountAmount,
        });
      } else {
        setCouponApplied(null);
        setCouponError(result.error || "Cupom inválido");
      }
    } catch (e: any) {
      console.error("[Checkout] Coupon validation error:", e);
      setCouponApplied(null);
      setCouponError(e.message || "Erro ao validar cupom");
    } finally {
      setCouponValidating(false);
    }
  };

  const handleRemoveCoupon = () => {
    setCouponApplied(null);
    setCouponCode("");
    setCouponError(null);
  };

  // ─── Affiliate tracking helper ───
  const trackAffiliateSale = async (orderId: string, total: number, email: string, token: string) => {
    if (!affiliateCode) return;
    try {
      var result = await api.affiliateTrackSale(token, {
        affiliateCode: affiliateCode,
        orderId: orderId,
        orderTotal: total,
        buyerEmail: email,
      });
      if (result.ok) {
        console.log("[Affiliate] Sale tracked for code=" + affiliateCode + " order=" + orderId);
        clearAffiliateCode();
      }
    } catch (e) {
      console.warn("[Affiliate] Track sale error (non-fatal):", e);
    }
  };

  // ─── Handle order + payment ───
  const handleSubmit = async () => {
    if (!accessToken || !canSubmitPayment) return;
    setSubmitting(true);
    setErrorMessage("");
    setErrorDetail("");
    setStep("processing");

    try {
      // 0a. Stock validation — LAYER 3B: force-refresh ALL items before creating order
      //     Checks both out-of-stock AND insufficient qty vs cart quantity
      try {
        const skus = items.map((i) => i.sku);
        const balances = await api.getProductBalances(skus, { force: true });
        const outOfStockItems: string[] = [];
        const insufficientItems: string[] = [];
        for (const b of (balances.results || [])) {
          var bAvail = b.found ? (b.disponivel ?? b.quantidade ?? 0) : null;
          if (b.found && bAvail !== null && bAvail <= 0) {
            const item = items.find((i) => i.sku === b.sku);
            outOfStockItems.push(item ? item.titulo : b.sku);
          } else if (b.found && bAvail !== null && bAvail > 0) {
            const item = items.find((i) => i.sku === b.sku);
            if (item && item.quantidade > bAvail) {
              insufficientItems.push((item.titulo || "Produto") + " (pedido: " + item.quantidade + ", disponível: " + bAvail + ")");
            }
          }
        }
        if (outOfStockItems.length > 0) {
          setErrorMessage("Alguns itens não estão mais disponíveis");
          setErrorDetail("Itens indisponíveis: " + outOfStockItems.join(", ") + ". Remova-os do carrinho para continuar.");
          setStep("error");
          setSubmitting(false);
          return;
        }
        if (insufficientItems.length > 0) {
          setErrorMessage("Quantidade indisponível para alguns itens");
          setErrorDetail("Ajuste a quantidade dos itens: " + insufficientItems.join(", ") + ".");
          setStep("error");
          setSubmitting(false);
          return;
        }
      } catch (stockErr) {
        console.warn("[Checkout] Stock validation failed (non-blocking):", stockErr);
        // Non-blocking — if the balance check fails, let the order proceed
        // The SIGE order confirmation will catch stock issues server-side
      }

      // 0b. Ensure user profile is saved to KV (required for SIGE sync)
      //     Build full address from selectedAddress for backward compat
      var fullAddrStr = selectedAddress ? selectedAddress.street : profile.address;
      if (selectedAddress && selectedAddress.number) fullAddrStr = fullAddrStr + ", " + selectedAddress.number;
      if (selectedAddress && selectedAddress.complement) fullAddrStr = fullAddrStr + " - " + selectedAddress.complement;
      if (selectedAddress && selectedAddress.neighborhood) fullAddrStr = fullAddrStr + ", " + selectedAddress.neighborhood;
      try {
        await api.userUpdateProfile(accessToken, {
          name: effectiveName,
          phone: effectivePhone,
          cpf: effectiveCpf,
          address: fullAddrStr,
          city: selectedAddress ? selectedAddress.city : profile.city,
          state: selectedAddress ? selectedAddress.state : profile.state,
          cep: selectedAddress ? selectedAddress.cep : profile.cep,
        });
        console.log("Profile saved to KV before SIGE sync");
      } catch (profileErr: any) {
        console.error("Failed to save profile to KV:", profileErr);
        // Continue anyway — sync may still work if profile existed
      }

      // 1. SIGE customer sync
      //    First check if user already has a mapping, then sync if needed
      let sigeCustomerId: string | null = null;
      try {
        const myMapping = await api.sigeMyMapping(accessToken);
        if (myMapping.found && myMapping.sigeCustomerId) {
          sigeCustomerId = myMapping.sigeCustomerId;
          console.log("SIGE mapping found:", sigeCustomerId);
        }
      } catch (e) {
        console.log("SIGE my-mapping check failed (non-fatal):", e);
      }

      if (!sigeCustomerId && userId) {
        try {
          const syncResult = await api.sigeSyncCustomer(accessToken, userId);
          console.log("SIGE sync result:", JSON.stringify(syncResult));
          // sigeCustomerId lives inside mapping.sigeCustomerId
          sigeCustomerId =
            syncResult.mapping?.sigeCustomerId ||
            syncResult.sigeCustomerId ||
            null;
        } catch (e: any) {
          console.error("Customer sync failed:", e);
        }
      }

      if (!sigeCustomerId) {
        setErrorMessage("Não foi possível vincular seu cadastro ao SIGE.");
        setErrorDetail("Verifique se seu perfil está completo (nome, CPF, etc) em Minha Conta.");
        setStep("error");
        setSubmitting(false);
        return;
      }

      // 2. Create SIGE order
      const salePayload: api.CreateSalePayload = {
        codCliente: sigeCustomerId,
        items: items.map((item) => ({
          codProduto: item.sku,
          quantidade: item.quantidade,
          // valorUnitario is REQUIRED by SIGE API — always send it.
          // Use nullish coalescing (??) so a price of 0 is preserved;
          // only null/undefined falls back to 0 (backend will fetch real price from SIGE).
          valorUnitario: item.precoUnitario ?? 0,
          // Product name and image for order history display in user panel
          titulo: item.titulo,
          imageUrl: item.imageUrl,
          // NOTE: codRef is NOT sent here — the backend resolves it automatically
          // by fetching the product's references from SIGE API.
          // Sending codRef = codProduto was WRONG (SIGE concatenates them for lookup).
        })),
        tipoPedido: "704",
        observacao: observacao.trim() || `Pedido via site - ${effectiveName}`,
      };

      let saleResult: any = null;
      try {
        saleResult = await api.sigeCreateSale(accessToken, salePayload);
        if (saleResult?.orderId) {
          setSigeOrderId(saleResult.orderId);
        }
      } catch (e: any) {
        console.error("SIGE create sale error:", e);
        // Continue with PagHiper even if SIGE fails — payment is primary
      }

      // 3. Create PagHiper charge
      const localOrderId = saleResult?.orderId
        ? `SIGE-${saleResult.orderId}`
        : generateOrderId();
      setOrderId(localOrderId);

      const paghiperItems: Array<{ description: string; quantity: number; item_id: string; price_cents: number }> = [];
      for (var pi = 0; pi < items.length; pi++) {
        var _item = items[pi];
        var _unitCents = Math.round((_item.precoUnitario || 0) * 100);
        paghiperItems.push({
          description: _item.titulo.substring(0, 100),
          quantity: _item.quantidade,
          item_id: _item.sku || String(pi + 1),
          price_cents: _unitCents,
        });
        // Add warranty as a separate line item for PagHiper
        if (_item.warranty && _item.warranty.price > 0) {
          paghiperItems.push({
            description: ("Garantia: " + _item.warranty.name + " - " + _item.titulo).substring(0, 100),
            quantity: _item.quantidade,
            item_id: "GAR-" + _item.sku,
            price_cents: Math.round(_item.warranty.price * 100),
          });
        }
      }

      // Add shipping as a line item if selected
      if (selectedShipping && selectedShipping.price > 0) {
        paghiperItems.push({
          description: `Frete - ${selectedShipping.carrierName}`,
          quantity: 1,
          item_id: "FRETE",
          price_cents: Math.round(selectedShipping.price * 100),
        });
      }

      // Coupon discount — use PagHiper's discount_cents field (not a negative line item,
      // which PagHiper rejects). The discount is applied at the charge level.
      var discountCentsForPayment = 0;
      if (couponApplied && couponDiscount > 0) {
        discountCentsForPayment = Math.round(couponDiscount * 100);
      }

      // Helper: build order items for save (includes warranty info)
      const orderItems = items.map((item) => ({
        sku: item.sku,
        titulo: item.titulo,
        imageUrl: item.imageUrl,
        quantidade: item.quantidade,
        valorUnitario: item.precoUnitario ?? 0,
        warranty: item.warranty ? {
          planId: item.warranty.planId,
          name: item.warranty.name,
          price: item.warranty.price,
          durationMonths: item.warranty.durationMonths,
        } : null,
      }));
      const orderShippingAddr = {
        name: effectiveName,
        address: fullAddrStr,
        city: selectedAddress ? selectedAddress.city : profile.city,
        state: selectedAddress ? selectedAddress.state : profile.state,
        cep: selectedAddress ? selectedAddress.cep : profile.cep,
        phone: effectivePhone,
        neighborhood: selectedAddress ? selectedAddress.neighborhood : "",
        number: selectedAddress ? selectedAddress.number : "",
        complement: selectedAddress ? selectedAddress.complement : "",
      };
      const orderShippingOpt = selectedShipping ? {
        carrierId: selectedShipping.carrierId,
        carrierName: selectedShipping.carrierName,
        carrierType: selectedShipping.carrierType,
        price: selectedShipping.price,
        deliveryDays: selectedShipping.deliveryDays,
        free: selectedShipping.free,
        sisfreteQuoteId: selectedShipping.sisfreteQuoteId || undefined,
      } : undefined;
      console.log("[Checkout] selectedShipping full:", JSON.stringify(selectedShipping));
      console.log("[Checkout] orderShippingOpt:", JSON.stringify(orderShippingOpt));
      const orderCouponInfo = couponApplied ? {
        code: couponApplied.code,
        discountType: couponApplied.discountType,
        discountValue: couponApplied.discountValue,
        discountAmount: couponApplied.discountAmount,
      } : undefined;

      // Increment coupon usage if applied
      if (couponApplied) {
        try {
          await api.useCoupon(couponApplied.code);
          console.log("Coupon used:", couponApplied.code);
        } catch (e) {
          console.error("Coupon use error (non-fatal):", e);
        }
      }

      if (paymentMethod === "pix") {
        const pixPayload: api.PixCreatePayload = {
          order_id: localOrderId,
          payer_email: profile.email,
          payer_name: effectiveName,
          payer_cpf_cnpj: effectiveCpf,
          payer_phone: effectivePhone || undefined,
          days_due_date: "1",
          items: paghiperItems,
          discount_cents: discountCentsForPayment > 0 ? discountCentsForPayment : undefined,
        };

        const pixResult = await api.createPixCharge(pixPayload);
        if (pixResult.error) {
          throw new Error(pixResult.error);
        }
        setPixData(pixResult);
        setTxId(pixResult.transaction_id);
        setStep("awaiting");
        startPolling(pixResult.transaction_id, "pix", localOrderId, accessToken);

        try {
          await api.saveUserOrder(accessToken, {
            localOrderId,
            sigeOrderId: saleResult?.orderId || null,
            items: orderItems,
            total: totalWithShipping,
            paymentMethod: "pix",
            transactionId: pixResult.transaction_id,
            observacao: observacao.trim() || undefined,
            shippingAddress: orderShippingAddr,
            shippingOption: orderShippingOpt,
            coupon: orderCouponInfo,
          } as any);
          trackAffiliateSale(localOrderId, totalWithShipping, profile.email, accessToken);
        } catch (e) {
          console.error("Save user order error (non-fatal):", e);
        }
      } else if (paymentMethod === "boleto") {
        const boletoPayload: api.BoletoCreatePayload = {
          order_id: localOrderId,
          payer_email: profile.email,
          payer_name: effectiveName,
          payer_cpf_cnpj: effectiveCpf,
          payer_phone: effectivePhone || undefined,
          payer_street: fullAddrStr || undefined,
          payer_city: (selectedAddress ? selectedAddress.city : profile.city) || undefined,
          payer_state: (selectedAddress ? selectedAddress.state : profile.state) || undefined,
          payer_zip_code: (selectedAddress ? selectedAddress.cep : profile.cep?.replace(/\D/g, "")) || undefined,
          days_due_date: "3",
          items: paghiperItems,
          discount_cents: discountCentsForPayment > 0 ? discountCentsForPayment : undefined,
        };

        const boletoResult = await api.createBoletoCharge(boletoPayload);
        if (boletoResult.error) {
          throw new Error(boletoResult.error);
        }
        setBoletoData(boletoResult);
        setTxId(boletoResult.transaction_id);
        setStep("awaiting");
        startPolling(boletoResult.transaction_id, "boleto", localOrderId, accessToken);

        try {
          await api.saveUserOrder(accessToken, {
            localOrderId,
            sigeOrderId: saleResult?.orderId || null,
            items: orderItems,
            total: totalWithShipping,
            paymentMethod: "boleto",
            transactionId: boletoResult.transaction_id,
            observacao: observacao.trim() || undefined,
            shippingAddress: orderShippingAddr,
            shippingOption: orderShippingOpt,
            coupon: orderCouponInfo,
          } as any);
          trackAffiliateSale(localOrderId, totalWithShipping, profile.email, accessToken);
        } catch (e) {
          console.error("Save user order error (non-fatal):", e);
        }
      } else if (paymentMethod === "mercadopago") {
        // 3b. Create Mercado Pago preference (Checkout Pro)
        const baseUrl = window.location.origin;
        // Build MP items — if coupon is applied, distribute discount proportionally
        let mpItems: Array<{ item_id: string; description: string; quantity: number; unit_price: number }> = [];
        for (var mi = 0; mi < items.length; mi++) {
          var _mItem = items[mi];
          mpItems.push({
            item_id: _mItem.sku || String(mi + 1),
            description: _mItem.titulo.substring(0, 256),
            quantity: _mItem.quantidade,
            unit_price: _mItem.precoUnitario || 0,
          });
          // Add warranty as a separate MP item
          if (_mItem.warranty && _mItem.warranty.price > 0) {
            mpItems.push({
              item_id: "GAR-" + _mItem.sku,
              description: ("Garantia: " + _mItem.warranty.name + " - " + _mItem.titulo).substring(0, 256),
              quantity: _mItem.quantidade,
              unit_price: _mItem.warranty.price,
            });
          }
        }
        if (couponApplied && couponDiscount > 0 && totalPrice > 0) {
          const ratio = 1 - couponDiscount / totalPrice;
          mpItems = mpItems.map((it) => ({
            ...it,
            unit_price: Math.round(it.unit_price * ratio * 100) / 100,
          }));
        }
        const mpPayload: api.MPCreatePreferencePayload = {
          order_id: localOrderId,
          payer_email: profile.email,
          payer_name: effectiveName,
          items: mpItems,
          shipping_cost: shippingPrice > 0 ? shippingPrice : undefined,
          back_urls: {
            success: baseUrl + "/checkout",
            failure: baseUrl + "/checkout",
            pending: baseUrl + "/checkout",
          },
        };

        const mpResult = await api.createMPPreference(mpPayload);
        if (mpResult.error || !mpResult.success) {
          throw new Error(mpResult.error || mpResult.detail || "Erro ao criar preferência no Mercado Pago.");
        }

        // Save order BEFORE redirect (user will leave the page)
        try {
          await api.saveUserOrder(accessToken, {
            localOrderId,
            sigeOrderId: saleResult?.orderId || null,
            items: orderItems,
            total: totalWithShipping,
            paymentMethod: "mercadopago",
            transactionId: mpResult.preferenceId,
            observacao: observacao.trim() || undefined,
            shippingAddress: orderShippingAddr,
            shippingOption: orderShippingOpt,
            coupon: orderCouponInfo,
          } as any);
          trackAffiliateSale(localOrderId, totalWithShipping, profile.email, accessToken);
        } catch (e) {
          console.error("Save user order error (non-fatal):", e);
        }

        // GA4: track begin payment
        trackEvent("add_payment_info", {
          currency: "BRL",
          value: totalWithShipping,
          payment_type: "mercadopago",
        });

        // Redirect to Mercado Pago checkout
        setStep("mp-redirect");
        const redirectUrl = mpSandbox ? mpResult.sandboxInitPoint : mpResult.initPoint;
        if (redirectUrl) {
          window.location.href = redirectUrl;
        } else {
          throw new Error("URL de checkout do Mercado Pago não disponível.");
        }
        return; // Don't set submitting=false, page will redirect
      } else if (paymentMethod === "cartao_credito") {
        // ─── SafraPay Credit Card ───
        const cardDigits = cardNumber.replace(/\D/g, "");
        if (!cardDigits || cardDigits.length < 13) throw new Error("Número do cartão inválido.");
        if (!cardCvv || cardCvv.length < 3) throw new Error("CVV inválido.");
        if (!cardName) throw new Error("Nome do titular obrigatório.");
        if (!cardExpMonth || !cardExpYear) throw new Error("Validade do cartão obrigatória.");

        const chargeResult = await api.safrapayCharge(accessToken, {
          cardNumber: cardDigits,
          cvv: cardCvv,
          cardholderName: cardName,
          cardholderDocument: effectiveCpf.replace(/\D/g, ""),
          expirationMonth: Number(cardExpMonth),
          expirationYear: Number(cardExpYear),
          amount: Math.round(totalWithShipping * 100), // reais → centavos
          installmentNumber: cardInstallments,
          installmentType: cardInstallments > 1 ? 1 : 0, // 1=Merchant (sem juros)
          customerName: effectiveName,
          customerEmail: profile.email,
          customerPhone: effectivePhone.replace(/\D/g, ""),
          merchantChargeId: localOrderId,
        });

        if (!chargeResult.success || !chargeResult.transaction?.isApproved) {
          throw new Error(chargeResult.error || "Pagamento com cartão não aprovado. Verifique os dados e tente novamente.");
        }

        // Save order with credit card info
        try {
          await api.saveUserOrder(accessToken, {
            localOrderId,
            sigeOrderId: saleResult?.orderId || null,
            items: orderItems,
            total: totalWithShipping,
            paymentMethod: "cartao_credito",
            transactionId: chargeResult.chargeId || chargeResult.transaction?.transactionId || null,
            observacao: observacao.trim() || undefined,
            shippingAddress: orderShippingAddr,
            shippingOption: orderShippingOpt,
            coupon: orderCouponInfo,
            safrapayChargeId: chargeResult.chargeId,
            safrapayNsu: chargeResult.nsu,
            cardBrand: chargeResult.transaction?.brandName,
            cardLastFour: chargeResult.transaction?.cardNumber?.slice(-4),
            installments: cardInstallments,
          } as any);
          trackAffiliateSale(localOrderId, totalWithShipping, profile.email, accessToken);
        } catch (e) {
          console.error("Save user order error (non-fatal):", e);
        }

        // NOTE: Credit card orders are saved with initialStatus="paid" by save-order.
        // The user endpoint blocks "paid" status for security — webhooks are authoritative.
        // This transactionId update is still useful for linking the charge ID.
        try {
          await api.updateOrderStatus(accessToken, localOrderId, "awaiting_payment", chargeResult.chargeId || "");
        } catch (e) {
          console.error("Update order transactionId error (non-fatal):", e);
        }

        // GA4: track purchase
        trackEvent("purchase", {
          transaction_id: chargeResult.chargeId || localOrderId,
          currency: "BRL",
          value: totalWithShipping,
          shipping: shippingPrice,
          payment_type: "cartao_credito",
          items: items.map((i) => ({
            item_id: i.sku,
            item_name: i.titulo,
            quantity: i.quantidade,
            price: i.precoUnitario ?? 0,
          })),
        });

        clearCart();
        setStep("success");
      }
    } catch (e: any) {
      console.error("Checkout submission error:", e);
      setErrorMessage(e.data?.error || e.message || "Erro ao processar pedido.");
      setErrorDetail("Tente novamente ou entre em contato pelo WhatsApp.");
      setStep("error");
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Polling for payment status ───
  const startPolling = useCallback((transactionId: string, method: PaymentMethod, pollOrderId?: string, pollAccessToken?: string) => {
    if (pollRef.current) clearInterval(pollRef.current);

    const checkStatus = async () => {
      try {
        const statusFn = method === "pix" ? api.getPixStatus : api.getBoletoStatus;
        const result = await statusFn(transactionId);
        setPaymentStatus(result.status);
        setPaymentStatusLabel(result.status_label || result.status);

        if (result.status === "paid" || result.status === "completed") {
          if (pollRef.current) clearInterval(pollRef.current);
          setStep("success");
          // GA4: track purchase
          trackEvent("purchase", {
            transaction_id: transactionId,
            currency: "BRL",
            value: totalWithShipping,
            shipping: shippingPrice,
            payment_type: method,
            items: items.map((i) => ({
              item_id: i.sku,
              item_name: i.titulo,
              quantity: i.quantidade,
              price: i.precoUnitario ?? 0,
            })),
          });
          clearCart();
          // NOTE: "paid" status is set by PagHiper/MP webhook (server-side verified).
          // User endpoint blocks "paid" for security — just update transactionId.
          if (pollAccessToken && pollOrderId) {
            api.updateOrderStatus(pollAccessToken, pollOrderId, "awaiting_payment", transactionId).catch(e =>
              console.error("Update order transactionId error (non-fatal):", e)
            );
          }
        } else if (result.status === "canceled" || result.status === "refunded") {
          if (pollRef.current) clearInterval(pollRef.current);
          setErrorMessage("Pagamento cancelado ou estornado.");
          setErrorDetail("");
          setStep("error");
          // Update order status to cancelled
          if (pollAccessToken && pollOrderId) {
            api.updateOrderStatus(pollAccessToken, pollOrderId, "cancelled", transactionId).catch(e =>
              console.error("Update order status error (non-fatal):", e)
            );
          }
        }
      } catch (e) {
        console.error("Status poll error:", e);
      }
    };

    // First check immediately, then every 5 seconds
    checkStatus();
    pollRef.current = setInterval(checkStatus, 5000);
  }, [clearCart, trackEvent, totalPrice, totalWithShipping, shippingPrice, items]);

  // ─── Polling for Mercado Pago payment status ───
  const startMPPolling = useCallback((paymentId: string, extRef: string | null) => {
    if (pollRef.current) clearInterval(pollRef.current);

    const checkMPStatus = async () => {
      try {
        const result = await api.getMPPaymentStatus(paymentId);
        setPaymentStatus(result.status);
        const statusLabels: Record<string, string> = {
          approved: "Aprovado",
          pending: "Pendente",
          in_process: "Em processamento",
          rejected: "Rejeitado",
          cancelled: "Cancelado",
          refunded: "Reembolsado",
        };
        setPaymentStatusLabel(statusLabels[result.status] || result.status);

        if (result.status === "approved") {
          if (pollRef.current) clearInterval(pollRef.current);
          setStep("success");
          trackEvent("purchase", {
            transaction_id: paymentId,
            currency: "BRL",
            value: result.transaction_amount || totalWithShipping,
            payment_type: "mercadopago",
          });
          clearCart();
          // NOTE: "paid" status is set by MercadoPago webhook (server-side verified).
          // User endpoint blocks "paid" for security — just link transactionId.
          if (accessToken && extRef && paymentId) {
            api.updateOrderStatus(accessToken, extRef, "awaiting_payment", String(paymentId)).catch(e =>
              console.error("MP polling: update transactionId error (non-fatal):", e)
            );
          }
        } else if (result.status === "rejected" || result.status === "cancelled" || result.status === "refunded") {
          if (pollRef.current) clearInterval(pollRef.current);
          setErrorMessage("Pagamento " + (statusLabels[result.status] || result.status) + ".");
          setErrorDetail(result.status_detail || "");
          setStep("error");
        }
      } catch (e) {
        console.error("MP Status poll error:", e);
      }
    };

    checkMPStatus();
    pollRef.current = setInterval(checkMPStatus, 8000); // Poll every 8s for MP
  }, [clearCart, trackEvent, totalWithShipping]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ─── Catalog Mode: block checkout ───
  if (catalogMode) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Breadcrumb label="Checkout" />
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-amber-100 rounded-full mb-6">
            <ShoppingCart className="w-10 h-10 text-amber-600" />
          </div>
          <h1 className="text-gray-900 mb-3" style={{ fontSize: "1.5rem", fontWeight: 800 }}>
            Compras indisponiveis
          </h1>
          <p className="text-gray-500 mb-6" style={{ fontSize: "0.95rem", lineHeight: 1.6 }}>
            No momento o site esta operando em modo catalogo.
            Para realizar compras, entre em contato pelo nosso televendas.
          </p>
          <div className="bg-white border border-gray-200 rounded-xl p-5 inline-block mb-6">
            <p className="text-gray-600 mb-1" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
              Televendas:
            </p>
            <a href="tel:08006431170" className="text-red-600 hover:text-red-700 transition-colors" style={{ fontSize: "1.3rem", fontWeight: 700 }}>
              0800 643 1170
            </a>
          </div>
          <div>
            <Link to="/catalogo" className="inline-flex items-center gap-2 bg-red-600 text-white px-6 py-3 rounded-xl hover:bg-red-700 transition-colors" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
              <ArrowLeft className="w-4 h-4" />
              Voltar ao Catalogo
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ─── Loading ───
  if (authLoading || profileLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-red-600 animate-spin mx-auto mb-3" />
          <p className="text-gray-500" style={{ fontSize: "0.88rem" }}>
            Carregando...
          </p>
        </div>
      </div>
    );
  }

  // ─── Not logged in ───
  if (!userId || !accessToken) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Breadcrumb label="Checkout" />
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
          <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
            <div className="bg-red-50 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
              <LogIn className="w-7 h-7 text-red-600" />
            </div>
            <h2 className="text-gray-800 mb-2" style={{ fontSize: "1.3rem", fontWeight: 700 }}>
              Faça login para continuar
            </h2>
            <p className="text-gray-500 mb-6" style={{ fontSize: "0.9rem" }}>
              Você precisa estar logado para finalizar seu pedido.
            </p>
            <Link
              to="/conta"
              className="inline-flex items-center gap-2 bg-red-600 text-white px-8 py-3 rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
              style={{ fontSize: "0.95rem", fontWeight: 700 }}
            >
              <User className="w-4 h-4" />
              Entrar ou Cadastrar
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ─── Empty cart (not on success/awaiting) ───
  if (items.length === 0 && step !== "success" && step !== "awaiting") {
    return (
      <div className="min-h-screen bg-gray-50">
        <Breadcrumb label="Checkout" />
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
          <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
            <div className="bg-gray-100 rounded-full p-6 w-20 h-20 mx-auto mb-4 flex items-center justify-center">
              <Package className="w-10 h-10 text-gray-300" />
            </div>
            <h2 className="text-gray-800 mb-2" style={{ fontSize: "1.3rem", fontWeight: 700 }}>
              Seu carrinho está vazio
            </h2>
            <p className="text-gray-500 mb-6" style={{ fontSize: "0.9rem" }}>
              Adicione peças ao carrinho antes de finalizar.
            </p>
            <Link
              to="/catalogo"
              className="inline-flex items-center gap-2 bg-red-600 text-white px-8 py-3 rounded-xl hover:bg-red-700 transition-colors"
              style={{ fontSize: "0.95rem", fontWeight: 700 }}
            >
              Ver Catálogo
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ─── Processing ───
  if (step === "processing" || step === "mp-redirect") {
    return (
      <div className="min-h-screen bg-gray-50">
        <Breadcrumb label={step === "mp-redirect" ? "Redirecionando..." : "Processando..."} />
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
          <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
            {step === "mp-redirect" ? (
              <div className="bg-blue-50 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Wallet className="w-8 h-8 text-blue-600" />
              </div>
            ) : (
              <Loader2 className="w-12 h-12 text-red-600 animate-spin mx-auto mb-4" />
            )}
            <h2 className="text-gray-800 mb-2" style={{ fontSize: "1.3rem", fontWeight: 700 }}>
              {step === "mp-redirect" ? "Redirecionando para Mercado Pago" : "Processando Pedido"}
            </h2>
            <p className="text-gray-500" style={{ fontSize: "0.9rem" }}>
              {step === "mp-redirect"
                ? "Você será redirecionado para o checkout seguro do Mercado Pago..."
                : "Registrando seu pedido e gerando cobrança..."}
            </p>
            {step === "mp-redirect" && (
              <Loader2 className="w-6 h-6 text-blue-500 animate-spin mx-auto mt-4" />
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Awaiting payment (PIX or Boleto) ───
  if (step === "awaiting") {
    return (
      <div className="min-h-screen bg-gray-50">
        <Breadcrumb label="Pagamento" />
        <div className="max-w-lg mx-auto px-4 py-8">
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            {/* Header */}
            <div className={`px-6 py-5 ${
              paymentMethod === "pix"
                ? "bg-gradient-to-r from-teal-500 to-teal-600"
                : paymentMethod === "mercadopago"
                ? "bg-gradient-to-r from-blue-400 to-sky-500"
                : paymentMethod === "cartao_credito"
                ? "bg-gradient-to-r from-orange-500 to-orange-600"
                : "bg-gradient-to-r from-blue-500 to-blue-600"
            }`}>
              <div className="flex items-center gap-3">
                <div className="bg-white/20 rounded-full p-2">
                  {paymentMethod === "pix" ? (
                    <QrCode className="w-6 h-6 text-white" />
                  ) : paymentMethod === "mercadopago" ? (
                    <Wallet className="w-6 h-6 text-white" />
                  ) : paymentMethod === "cartao_credito" ? (
                    <CreditCard className="w-6 h-6 text-white" />
                  ) : (
                    <Barcode className="w-6 h-6 text-white" />
                  )}
                </div>
                <div>
                  <h2 className="text-white" style={{ fontSize: "1.2rem", fontWeight: 700 }}>
                    {paymentMethod === "pix"
                      ? "Pagamento via PIX"
                      : paymentMethod === "mercadopago"
                      ? "Pagamento via Mercado Pago"
                      : paymentMethod === "cartao_credito"
                      ? "Pagamento via Cartão de Crédito"
                      : "Pagamento via Boleto"}
                  </h2>
                  <p className="text-white/80" style={{ fontSize: "0.78rem" }}>
                    Pedido {orderId}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Status indicator */}
              <div className="flex items-center gap-3 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
                <div className="relative">
                  <Clock className="w-5 h-5 text-yellow-600" />
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-yellow-500 rounded-full animate-pulse" />
                </div>
                <div>
                  <p className="text-yellow-800" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                    Aguardando Pagamento
                  </p>
                  <p className="text-yellow-600" style={{ fontSize: "0.72rem" }}>
                    Status: {paymentStatusLabel}
                  </p>
                </div>
              </div>

              {/* Value */}
              <div className="text-center">
                <p className="text-gray-400 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                  Valor a Pagar
                </p>
                <p className="text-gray-900" style={{ fontSize: "1.8rem", fontWeight: 800 }}>
                  {formatPrice(totalWithShipping)}
                </p>
                {shippingPrice > 0 && (
                  <p className="text-gray-400" style={{ fontSize: "0.72rem" }}>
                    (inclui frete de {formatPrice(shippingPrice)})
                  </p>
                )}
                {couponApplied && couponDiscount > 0 && (
                  <p className="text-green-600" style={{ fontSize: "0.72rem" }}>
                    (cupom {couponApplied.code}: -{formatPrice(couponDiscount)})
                  </p>
                )}
              </div>

              {/* PIX details */}
              {paymentMethod === "pix" && pixData && (
                <>
                  {/* QR Code */}
                  {pixData.qr_code_base64 && (
                    <div className="flex flex-col items-center">
                      <div className="bg-white border-2 border-gray-200 rounded-xl p-3 mb-3">
                        <img
                          src={`data:image/png;base64,${pixData.qr_code_base64}`}
                          alt="QR Code PIX"
                          className="w-48 h-48"
                        />
                      </div>
                      <p className="text-gray-400" style={{ fontSize: "0.75rem" }}>
                        Escaneie o QR Code com seu app do banco
                      </p>
                    </div>
                  )}

                  {/* PIX Copia e Cola */}
                  {pixData.emv && (
                    <div>
                      <p className="text-gray-600 mb-2" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                        PIX Copia e Cola:
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          readOnly
                          value={pixData.emv}
                          className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-600 font-mono truncate"
                          style={{ fontSize: "0.72rem" }}
                        />
                        <button
                          onClick={() => handleCopy(pixData.emv!)}
                          className={`shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-lg transition-colors cursor-pointer ${
                            copied
                              ? "bg-green-100 text-green-700"
                              : "bg-teal-600 text-white hover:bg-teal-700"
                          }`}
                          style={{ fontSize: "0.82rem", fontWeight: 600 }}
                        >
                          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          {copied ? "Copiado!" : "Copiar"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Open PIX URL */}
                  {pixData.pix_url && (
                    <a
                      href={pixData.pix_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 bg-teal-50 text-teal-700 border border-teal-200 px-4 py-2.5 rounded-lg hover:bg-teal-100 transition-colors"
                      style={{ fontSize: "0.85rem", fontWeight: 600 }}
                    >
                      <ExternalLink className="w-4 h-4" />
                      Abrir Link de Pagamento
                    </a>
                  )}
                </>
              )}

              {/* Boleto details */}
              {paymentMethod === "boleto" && boletoData && (
                <>
                  {/* Digitable line */}
                  {boletoData.bank_slip?.digitable_line && (
                    <div>
                      <p className="text-gray-600 mb-2" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                        Linha Digitavel:
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          readOnly
                          value={boletoData.bank_slip.digitable_line}
                          className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-600 font-mono truncate"
                          style={{ fontSize: "0.72rem" }}
                        />
                        <button
                          onClick={() => handleCopy(boletoData.bank_slip.digitable_line!)}
                          className={`shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-lg transition-colors cursor-pointer ${
                            copied
                              ? "bg-green-100 text-green-700"
                              : "bg-blue-600 text-white hover:bg-blue-700"
                          }`}
                          style={{ fontSize: "0.82rem", fontWeight: 600 }}
                        >
                          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          {copied ? "Copiado!" : "Copiar"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Boleto links */}
                  <div className="flex flex-col gap-2">
                    {boletoData.bank_slip?.url_slip && (
                      <a
                        href={boletoData.bank_slip.url_slip}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 transition-colors"
                        style={{ fontSize: "0.85rem", fontWeight: 600 }}
                      >
                        <ExternalLink className="w-4 h-4" />
                        Visualizar Boleto
                      </a>
                    )}
                    {boletoData.bank_slip?.url_slip_pdf && (
                      <a
                        href={boletoData.bank_slip.url_slip_pdf}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 bg-gray-100 text-gray-700 px-4 py-2.5 rounded-lg hover:bg-gray-200 transition-colors"
                        style={{ fontSize: "0.85rem", fontWeight: 600 }}
                      >
                        <FileText className="w-4 h-4" />
                        Baixar PDF
                      </a>
                    )}
                  </div>

                  {/* Due date */}
                  {boletoData.due_date && (
                    <p className="text-center text-gray-500" style={{ fontSize: "0.78rem" }}>
                      Vencimento: {boletoData.due_date}
                    </p>
                  )}
                </>
              )}

              {/* Mercado Pago awaiting details */}
              {paymentMethod === "mercadopago" && (
                <div className="flex flex-col items-center gap-3">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center w-full">
                    <Wallet className="w-10 h-10 text-blue-500 mx-auto mb-3" />
                    <p className="text-blue-800" style={{ fontSize: "0.88rem", fontWeight: 600 }}>
                      Pagamento em processamento
                    </p>
                    <p className="text-blue-600 mt-1" style={{ fontSize: "0.78rem" }}>
                      Seu pagamento está sendo processado pelo Mercado Pago. Você será notificado quando for confirmado.
                    </p>
                  </div>
                </div>
              )}

              {/* Info */}
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="text-gray-500" style={{ fontSize: "0.78rem" }}>
                  {paymentMethod === "pix"
                    ? "O pagamento via PIX é confirmado automaticamente em segundos. Esta página será atualizada quando o pagamento for detectado."
                    : paymentMethod === "mercadopago"
                    ? "O Mercado Pago está processando seu pagamento. Quando confirmado, esta página será atualizada automaticamente."
                    : paymentMethod === "cartao_credito"
                    ? "Seu pagamento com cartão está sendo processado. Aguarde a confirmação."
                    : "O boleto pode levar até 3 dias úteis para ser compensado. Acompanhe o status por esta página."}
                </p>
              </div>

              {/* Manual refresh */}
              <button
                onClick={() => {
                  if (paymentMethod === "mercadopago" && txId) {
                    startMPPolling(txId, orderId);
                  } else if (txId) {
                    startPolling(txId, paymentMethod);
                  }
                }}
                className="w-full flex items-center justify-center gap-2 text-gray-400 hover:text-gray-600 py-2 transition-colors cursor-pointer"
                style={{ fontSize: "0.8rem" }}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Verificar pagamento
              </button>

              {/* WhatsApp */}
              <a
                href={`https://wa.me/5544997330202?text=${encodeURIComponent(
                  `Olá! Fiz um pedido pelo site.\nPedido: ${orderId}\nMétodo: ${paymentMethod === "pix" ? "PIX" : paymentMethod === "mercadopago" ? "Mercado Pago" : "Boleto"}\nNome: ${effectiveName}\nEmail: ${profile.email}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 bg-green-50 text-green-700 border border-green-200 px-4 py-2.5 rounded-lg hover:bg-green-100 transition-colors"
                style={{ fontSize: "0.82rem", fontWeight: 600 }}
              >
                <MessageCircle className="w-4 h-4" />
                Duvidas? Fale no WhatsApp
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Success ───
  if (step === "success") {
    return (
      <div className="min-h-screen bg-gray-50">
        <Breadcrumb label="Pedido Confirmado" />
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
          <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
            <div className="bg-green-50 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-gray-800 mb-2" style={{ fontSize: "1.4rem", fontWeight: 700 }}>
              Pagamento Confirmado!
            </h2>
            <p className="text-gray-500 mb-4" style={{ fontSize: "0.9rem" }}>
              Seu pagamento foi recebido com sucesso.
            </p>
            {orderId && (
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-6">
                <p className="text-gray-400 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                  Número do Pedido
                </p>
                <p className="text-gray-800 font-mono" style={{ fontSize: "1.2rem", fontWeight: 700 }}>
                  {orderId}
                </p>
                {sigeOrderId && (
                  <p className="text-gray-400 mt-1" style={{ fontSize: "0.7rem" }}>
                    SIGE: #{sigeOrderId}
                  </p>
                )}
              </div>
            )}
            {selectedShipping ? (
              <div className="text-gray-400 mb-6" style={{ fontSize: "0.82rem" }}>
                <p className="flex items-center justify-center gap-1.5">
                  <Truck className="w-4 h-4" />
                  Envio via <strong className="text-gray-600">{selectedShipping.carrierName}</strong>
                  {selectedShipping.deliveryDays > 0 && (
                    <span> — {selectedShipping.deliveryText}</span>
                  )}
                </p>
              </div>
            ) : (
              <p className="text-gray-400 mb-6" style={{ fontSize: "0.82rem" }}>
                Em breve nossa equipe entrara em contato para combinar a entrega.
              </p>
            )}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href={`https://wa.me/5544997330202?text=${encodeURIComponent(
                  `Olá! Meu pagamento foi confirmado.\nPedido: ${orderId}${sigeOrderId ? `\nSIGE: #${sigeOrderId}` : ""}\nNome: ${effectiveName}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 bg-green-600 text-white px-5 py-2.5 rounded-lg hover:bg-green-700 transition-colors"
                style={{ fontSize: "0.88rem", fontWeight: 600 }}
              >
                <MessageCircle className="w-4 h-4" />
                Falar no WhatsApp
              </a>
              <Link
                to="/catalogo"
                className="flex items-center justify-center gap-2 bg-gray-100 text-gray-700 px-5 py-2.5 rounded-lg hover:bg-gray-200 transition-colors"
                style={{ fontSize: "0.88rem", fontWeight: 600 }}
              >
                Continuar Comprando
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Error ───
  if (step === "error") {
    return (
      <div className="min-h-screen bg-gray-50">
        <Breadcrumb label="Erro" />
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
          <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
            <div className="bg-red-50 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-gray-800 mb-2" style={{ fontSize: "1.3rem", fontWeight: 700 }}>
              Erro ao Processar Pedido
            </h2>
            <p className="text-gray-500 mb-2" style={{ fontSize: "0.9rem" }}>
              {errorMessage}
            </p>
            {errorDetail && (
              <p className="text-gray-400 mb-4" style={{ fontSize: "0.82rem" }}>
                {errorDetail}
              </p>
            )}
            <div className="flex flex-col gap-3">
              <button
                onClick={() => { setStep("payment"); setErrorMessage(""); }}
                className="flex items-center justify-center gap-2 bg-red-600 text-white px-6 py-2.5 rounded-lg hover:bg-red-700 transition-colors cursor-pointer"
                style={{ fontSize: "0.9rem", fontWeight: 600 }}
              >
                <ArrowLeft className="w-4 h-4" />
                Tentar Novamente
              </button>
              <a
                href={`https://wa.me/5544997330202?text=${encodeURIComponent(
                  `Olá! Tive um problema ao finalizar meu pedido.\n\nErro: ${errorMessage}\n\nNome: ${effectiveName}\nEmail: ${profile.email}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 text-green-700 bg-green-50 px-6 py-2.5 rounded-lg hover:bg-green-100 transition-colors"
                style={{ fontSize: "0.88rem", fontWeight: 600 }}
              >
                <MessageCircle className="w-4 h-4" />
                Pedir Ajuda via WhatsApp
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main: Review + Payment steps ───
  return (
    <div className="min-h-screen bg-gray-50">
      <Breadcrumb label="Checkout" />

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-red-50 rounded-full p-2.5">
            <ShoppingCart className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h1 className="text-gray-800" style={{ fontSize: "1.5rem", fontWeight: 700 }}>
              {step === "review" ? "Revisar Pedido" : "Pagamento"}
            </h1>
            <p className="text-gray-400" style={{ fontSize: "0.85rem" }}>
              {step === "review" ? "Revise os itens do seu carrinho" : "Escolha a forma de pagamento"}
            </p>
          </div>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-2 mb-8">
          {[
            { key: "review" as const, label: "Revisar", icon: ShoppingCart },
            { key: "payment" as const, label: "Pagamento", icon: CreditCard },
          ].map((s, idx) => (
            <div key={s.key} className="flex items-center gap-2">
              {idx > 0 && (
                <div className={`w-6 sm:w-10 h-px ${step === "payment" ? "bg-red-400" : "bg-gray-200"}`} />
              )}
              <button
                onClick={() => {
                  if (s.key === "review" && step === "payment") setStep("review");
                }}
                disabled={s.key === "payment" && step === "review"}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors ${
                  step === s.key
                    ? "bg-red-600 text-white"
                    : step === "payment" && s.key === "review"
                    ? "bg-red-100 text-red-600 cursor-pointer"
                    : "bg-gray-100 text-gray-400"
                } disabled:cursor-default`}
                style={{ fontSize: "0.78rem", fontWeight: 600 }}
              >
                <s.icon className="w-3.5 h-3.5" />
                {s.label}
              </button>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-4">
            {/* ─── REVIEW ─── */}
            {step === "review" && (
              <>
                {/* ═══════ LAYER 3: Stock validation alerts ═══════ */}
                {stockValidation.loading && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
                    <Loader2 className="w-5 h-5 text-amber-600 animate-spin flex-shrink-0" />
                    <div>
                      <p className="text-amber-800" style={{ fontSize: "0.88rem", fontWeight: 600 }}>Verificando disponibilidade dos itens...</p>
                      <p className="text-amber-600" style={{ fontSize: "0.75rem" }}>Aguarde um momento, estamos confirmando a disponibilidade.</p>
                    </div>
                  </div>
                )}
                {stockValidation.checked && stockValidation.issues.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
                      <p className="text-red-800" style={{ fontSize: "0.88rem", fontWeight: 700 }}>
                        Alguns itens precisam de atenção
                      </p>
                    </div>
                    <div className="space-y-2">
                      {stockValidation.issues.map(function (issue) {
                        return (
                          <div key={issue.sku} className="bg-white rounded-lg border border-red-100 p-3 flex items-start gap-3">
                            <div className={"w-2 h-2 rounded-full mt-1.5 flex-shrink-0 " + (issue.outOfStock ? "bg-red-500" : "bg-amber-500")} />
                            <div className="flex-1 min-w-0">
                              <p className="text-gray-800 truncate" style={{ fontSize: "0.82rem", fontWeight: 600 }}>{issue.titulo}</p>
                              {issue.outOfStock ? (
                                <p className="text-red-600 mt-1" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                                  Este produto não está mais disponível — remova para continuar
                                </p>
                              ) : issue.insufficientQty ? (
                                <p className="text-amber-600 mt-1" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                                  Quantidade solicitada: {issue.requested} un. — disponível: {issue.available} un.
                                </p>
                              ) : null}
                            </div>
                            {issue.outOfStock && (
                              <button
                                onClick={function () { removeItem(issue.sku); setStockValidation(function (prev) { return { ...prev, issues: prev.issues.filter(function (i) { return i.sku !== issue.sku; }) }; }); }}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-lg transition-colors flex-shrink-0 cursor-pointer"
                                title="Remover do carrinho"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                            {issue.insufficientQty && issue.available !== null && issue.available > 0 && (
                              <button
                                onClick={function () { updateQuantity(issue.sku, issue.available!); setStockValidation(function (prev) { return { ...prev, issues: prev.issues.filter(function (i) { return i.sku !== issue.sku; }) }; }); }}
                                className="text-amber-600 hover:text-amber-800 hover:bg-amber-50 px-2.5 py-1 rounded-lg transition-colors flex-shrink-0 cursor-pointer whitespace-nowrap"
                                style={{ fontSize: "0.72rem", fontWeight: 600 }}
                                title={"Ajustar para " + issue.available + " un."}
                              >
                                Ajustar p/ {issue.available}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <button
                      onClick={function () {
                        setStockValidation({ loading: true, checked: false, issues: [] });
                        var skus = items.map(function (i) { return i.sku; });
                        api.getProductBalances(skus, { force: true })
                          .then(function (res) {
                            var newIssues: typeof stockValidation.issues = [];
                            var balanceMap: Record<string, any> = {};
                            for (var bi = 0; bi < (res.results || []).length; bi++) {
                              var b = res.results[bi];
                              balanceMap[b.sku] = b;
                            }
                            for (var ci = 0; ci < items.length; ci++) {
                              var itm = items[ci];
                              var bal = balanceMap[itm.sku];
                              if (!bal) continue;
                              var avail = bal.found ? (bal.disponivel ?? bal.quantidade ?? 0) : null;
                              var oos = bal.found && avail !== null && avail <= 0;
                              var insuf = bal.found && avail !== null && avail > 0 && itm.quantidade > avail;
                              if (oos || insuf) {
                                newIssues.push({ sku: itm.sku, titulo: itm.titulo, requested: itm.quantidade, available: avail, outOfStock: oos, insufficientQty: insuf });
                              }
                            }
                            setStockValidation({ loading: false, checked: true, issues: newIssues });
                          })
                          .catch(function () { setStockValidation({ loading: false, checked: true, issues: [] }); });
                      }}
                      className="flex items-center gap-1.5 text-red-600 hover:text-red-800 cursor-pointer"
                      style={{ fontSize: "0.78rem", fontWeight: 600 }}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Verificar novamente
                    </button>
                  </div>
                )}
                {stockValidation.checked && stockValidation.issues.length === 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-3">
                    <CheckCircle2 className="w-4.5 h-4.5 text-green-600 flex-shrink-0" />
                    <p className="text-green-700" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                      Todos os itens estão disponíveis
                    </p>
                  </div>
                )}

                {/* Items */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                    <Package className="w-4 h-4 text-red-600" />
                    <span className="text-gray-700" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                      Itens do Pedido ({totalItems})
                    </span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {items.map((item) => (
                      <CheckoutItemRow
                        key={item.sku}
                        item={item}
                        onRemove={() => removeItem(item.sku)}
                        onUpdateQty={(qty) => updateQuantity(item.sku, qty)}
                      />
                    ))}
                  </div>
                </div>

                {/* Dados Pessoais */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <User className="w-4 h-4 text-red-600" />
                    <span className="text-gray-700" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                      Dados Pessoais
                    </span>
                  </div>

                  <div className="space-y-3">
                    {/* Name */}
                    <div>
                      <label className="block text-gray-500 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                        Nome completo <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={nameEdit}
                        onChange={(e) => setNameEdit(e.target.value)}
                        placeholder="Seu nome completo"
                        className={`w-full border rounded-lg px-3 py-2.5 transition-colors focus:outline-none focus:ring-2 ${
                          nameEdit && !nameValid
                            ? "bg-red-50 border-red-300 text-red-700 focus:ring-red-200"
                            : "bg-white border-gray-200 text-gray-800 focus:ring-red-200 focus:border-red-300"
                        }`}
                        style={{ fontSize: "0.88rem" }}
                      />
                      {nameEdit.length > 0 && !nameValid && (
                        <p className="text-red-500 mt-1" style={{ fontSize: "0.72rem" }}>
                          Informe seu nome completo
                        </p>
                      )}
                    </div>

                    {/* CPF */}
                    <div>
                      <label className="block text-gray-500 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                        CPF / CNPJ <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={cpfEdit}
                        onChange={(e) => setCpfEdit(formatCpf(e.target.value))}
                        placeholder="000.000.000-00"
                        className={`w-full border rounded-lg px-3 py-2.5 transition-colors focus:outline-none focus:ring-2 ${
                          cpfEdit && !cpfValid
                            ? "bg-red-50 border-red-300 text-red-700 focus:ring-red-200"
                            : "bg-white border-gray-200 text-gray-800 focus:ring-red-200 focus:border-red-300"
                        }`}
                        style={{ fontSize: "0.88rem" }}
                      />
                      {cpfEdit && !cpfValid && (
                        <p className="text-red-500 mt-1" style={{ fontSize: "0.72rem" }}>
                          CPF deve ter 11 digitos
                        </p>
                      )}
                    </div>

                    {/* Phone */}
                    <div>
                      <label className="block text-gray-500 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                        Telefone / WhatsApp <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={phoneEdit}
                        onChange={(e) => setPhoneEdit(formatPhone(e.target.value))}
                        placeholder="(44) 99999-9999"
                        className={`w-full border rounded-lg px-3 py-2.5 transition-colors focus:outline-none focus:ring-2 ${
                          phoneEdit && !phoneValid
                            ? "bg-red-50 border-red-300 text-red-700 focus:ring-red-200"
                            : "bg-white border-gray-200 text-gray-800 focus:ring-red-200 focus:border-red-300"
                        }`}
                        style={{ fontSize: "0.88rem" }}
                      />
                      {phoneEdit && !phoneValid && (
                        <p className="text-red-500 mt-1" style={{ fontSize: "0.72rem" }}>
                          Informe um telefone válido com DDD
                        </p>
                      )}
                    </div>

                    {/* Email (read-only) */}
                    <div>
                      <label className="block text-gray-500 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                        E-mail
                      </label>
                      <input
                        type="text"
                        readOnly
                        value={profile.email}
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-500 cursor-default"
                        style={{ fontSize: "0.88rem" }}
                      />
                    </div>
                  </div>
                </div>

                {/* Observacao */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="w-4 h-4 text-red-600" />
                    <span className="text-gray-700" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                      Observacoes (opcional)
                    </span>
                  </div>
                  <textarea
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    rows={3}
                    placeholder="Ex: Preciso com urgencia, entregar na parte da manha..."
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300 resize-none transition-all"
                    style={{ fontSize: "0.88rem" }}
                  />
                </div>

                {/* Address Manager — inline in checkout */}
                {accessToken && (
                  <CheckoutAddressManager
                    accessToken={accessToken}
                    selectedAddressId={selectedAddress?.id || null}
                    onSelectAddress={setSelectedAddress}
                  />
                )}

                {/* Shipping Calculator */}
                {items.length > 0 && (
                  <ShippingCalculator
                    items={items.map((i) => ({ sku: i.sku, quantity: i.quantidade }))}
                    totalValue={totalPrice}
                    onSelect={setSelectedShipping}
                    selectedId={selectedShipping?.carrierId || null}
                    initialCep={selectedAddress?.cep || profile.cep?.replace(/\D/g, "") || ""}
                  />
                )}

                {/* Price warning */}
                {totalPrice <= 0 && items.length > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-yellow-800" style={{ fontSize: "0.88rem", fontWeight: 600 }}>
                        Preços indisponíveis
                      </p>
                      <p className="text-yellow-700 mt-1" style={{ fontSize: "0.82rem" }}>
                        Alguns itens não possuem preço definido. Para gerar a cobrança via PagHiper, todos os itens precisam ter preço. Entre em contato pelo WhatsApp para finalizar.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ─── PAYMENT ─── */}
            {step === "payment" && (
              <>
                {/* Payment method selection */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <CreditCard className="w-4 h-4 text-red-600" />
                    <span className="text-gray-700" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                      Forma de Pagamento
                    </span>
                  </div>

                  <div className={`grid gap-3 ${(mpEnabled && spEnabled) ? "grid-cols-2 sm:grid-cols-4" : (mpEnabled || spEnabled) ? "grid-cols-3" : "grid-cols-2"}`}>
                    {/* PIX */}
                    <button
                      onClick={() => setPaymentMethod("pix")}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all cursor-pointer ${
                        paymentMethod === "pix"
                          ? "border-teal-500 bg-teal-50 shadow-md"
                          : "border-gray-200 bg-white hover:border-teal-300 hover:bg-teal-50/50"
                      }`}
                    >
                      <div className={`rounded-full p-3 ${paymentMethod === "pix" ? "bg-teal-100" : "bg-gray-100"}`}>
                        <QrCode className={`w-6 h-6 ${paymentMethod === "pix" ? "text-teal-600" : "text-gray-400"}`} />
                      </div>
                      <span
                        className={paymentMethod === "pix" ? "text-teal-700" : "text-gray-600"}
                        style={{ fontSize: "0.9rem", fontWeight: 700 }}
                      >
                        PIX
                      </span>
                      <span
                        className={paymentMethod === "pix" ? "text-teal-600" : "text-gray-400"}
                        style={{ fontSize: "0.72rem" }}
                      >
                        Aprovação instantânea
                      </span>
                    </button>

                    {/* Boleto */}
                    <button
                      onClick={() => setPaymentMethod("boleto")}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all cursor-pointer ${
                        paymentMethod === "boleto"
                          ? "border-blue-500 bg-blue-50 shadow-md"
                          : "border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/50"
                      }`}
                    >
                      <div className={`rounded-full p-3 ${paymentMethod === "boleto" ? "bg-blue-100" : "bg-gray-100"}`}>
                        <Barcode className={`w-6 h-6 ${paymentMethod === "boleto" ? "text-blue-600" : "text-gray-400"}`} />
                      </div>
                      <span
                        className={paymentMethod === "boleto" ? "text-blue-700" : "text-gray-600"}
                        style={{ fontSize: "0.9rem", fontWeight: 700 }}
                      >
                        Boleto
                      </span>
                      <span
                        className={paymentMethod === "boleto" ? "text-blue-600" : "text-gray-400"}
                        style={{ fontSize: "0.72rem" }}
                      >
                        Até 3 dias úteis
                      </span>
                    </button>

                    {/* Mercado Pago */}
                    {mpEnabled && (
                      <button
                        onClick={() => setPaymentMethod("mercadopago")}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all cursor-pointer ${
                          paymentMethod === "mercadopago"
                            ? "border-sky-500 bg-sky-50 shadow-md"
                            : "border-gray-200 bg-white hover:border-sky-300 hover:bg-sky-50/50"
                        }`}
                      >
                        <div className={`rounded-full p-3 ${paymentMethod === "mercadopago" ? "bg-sky-100" : "bg-gray-100"}`}>
                          <Wallet className={`w-6 h-6 ${paymentMethod === "mercadopago" ? "text-sky-600" : "text-gray-400"}`} />
                        </div>
                        <span
                          className={paymentMethod === "mercadopago" ? "text-sky-700" : "text-gray-600"}
                          style={{ fontSize: "0.9rem", fontWeight: 700 }}
                        >
                          Mercado Pago
                        </span>
                        <span
                          className={paymentMethod === "mercadopago" ? "text-sky-600" : "text-gray-400"}
                          style={{ fontSize: "0.72rem" }}
                        >
                          {mpSandbox ? "Sandbox (teste)" : "Cartão, saldo e mais"}
                        </span>
                      </button>
                    )}

                    {/* Cartão de Crédito (SafraPay) */}
                    {spEnabled && (
                      <button
                        onClick={() => setPaymentMethod("cartao_credito")}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all cursor-pointer ${
                          paymentMethod === "cartao_credito"
                            ? "border-orange-500 bg-orange-50 shadow-md"
                            : "border-gray-200 bg-white hover:border-orange-300 hover:bg-orange-50/50"
                        }`}
                      >
                        <div className={`rounded-full p-3 ${paymentMethod === "cartao_credito" ? "bg-orange-100" : "bg-gray-100"}`}>
                          <CreditCard className={`w-6 h-6 ${paymentMethod === "cartao_credito" ? "text-orange-600" : "text-gray-400"}`} />
                        </div>
                        <span
                          className={paymentMethod === "cartao_credito" ? "text-orange-700" : "text-gray-600"}
                          style={{ fontSize: "0.9rem", fontWeight: 700 }}
                        >
                          Cartão
                        </span>
                        <span
                          className={paymentMethod === "cartao_credito" ? "text-orange-600" : "text-gray-400"}
                          style={{ fontSize: "0.72rem" }}
                        >
                          {spConfig?.sandbox ? "Sandbox (teste)" : "Até " + (spConfig?.maxInstallments || 12) + "x"}
                        </span>
                      </button>
                    )}
                  </div>

                  {/* Credit Card Form — shown when cartao_credito is selected */}
                  {paymentMethod === "cartao_credito" && (
                    <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
                      {/* Card Number */}
                      <div>
                        <label className="text-gray-600 block mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>Número do Cartão</label>
                        <div className="relative">
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={19}
                            value={cardNumber}
                            onChange={(e) => {
                              const v = e.target.value.replace(/\D/g, "").slice(0, 16);
                              const formatted = v.replace(/(.{4})/g, "$1 ").trim();
                              setCardNumber(formatted);
                            }}
                            placeholder="0000 0000 0000 0000"
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300 transition-all pr-16"
                            style={{ fontSize: "0.95rem", letterSpacing: "0.05em" }}
                          />
                          {cardBrand && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                                cardBrand === "visa" ? "bg-blue-100 text-blue-700" :
                                cardBrand === "mastercard" ? "bg-red-100 text-red-700" :
                                cardBrand === "amex" ? "bg-indigo-100 text-indigo-700" :
                                cardBrand === "elo" ? "bg-yellow-100 text-yellow-700" :
                                "bg-gray-100 text-gray-700"
                              }`}>
                                {cardBrand === "visa" ? "VISA" : cardBrand === "mastercard" ? "MC" : cardBrand === "amex" ? "AMEX" : cardBrand === "elo" ? "ELO" : ""}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Card Holder Name */}
                      <div>
                        <label className="text-gray-600 block mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>Nome no Cartão</label>
                        <input
                          type="text"
                          value={cardName}
                          onChange={(e) => setCardName(e.target.value.toUpperCase())}
                          placeholder="NOME COMO ESTÁ NO CARTÃO"
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300 transition-all uppercase"
                          style={{ fontSize: "0.9rem" }}
                        />
                      </div>

                      {/* Expiry + CVV row */}
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="text-gray-600 block mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>Mês</label>
                          <select
                            value={cardExpMonth}
                            onChange={(e) => setCardExpMonth(e.target.value)}
                            className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300 transition-all"
                            style={{ fontSize: "0.9rem" }}
                          >
                            <option value="">MM</option>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                              <option key={m} value={String(m)}>{String(m).padStart(2, "0")}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-gray-600 block mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>Ano</label>
                          <select
                            value={cardExpYear}
                            onChange={(e) => setCardExpYear(e.target.value)}
                            className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300 transition-all"
                            style={{ fontSize: "0.9rem" }}
                          >
                            <option value="">AAAA</option>
                            {Array.from({ length: 12 }, (_, i) => new Date().getFullYear() + i).map((y) => (
                              <option key={y} value={String(y)}>{y}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-gray-600 block mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>CVV</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={4}
                            value={cardCvv}
                            onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                            placeholder="123"
                            className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300 transition-all text-center"
                            style={{ fontSize: "0.9rem" }}
                          />
                        </div>
                      </div>

                      {/* Installments */}
                      {totalWithShipping > 0 && (
                        <div>
                          <label className="text-gray-600 block mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>Parcelas</label>
                          <select
                            value={cardInstallments}
                            onChange={(e) => setCardInstallments(Number(e.target.value))}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300 transition-all"
                            style={{ fontSize: "0.9rem" }}
                          >
                            {Array.from({ length: spConfig?.maxInstallments || 12 }, (_, i) => i + 1)
                              .filter((n) => {
                                const minVal = (spConfig?.minInstallmentValue || 500) / 100;
                                return totalWithShipping / n >= minVal;
                              })
                              .map((n) => (
                                <option key={n} value={n}>
                                  {n === 1
                                    ? `1x de ${formatPrice(totalWithShipping)} (à vista)`
                                    : `${n}x de ${formatPrice(totalWithShipping / n)} sem juros`}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}

                      {spConfig?.sandbox && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                          <p className="text-yellow-700" style={{ fontSize: "0.75rem" }}>
                            <strong>Modo Sandbox:</strong> Use cartão de teste. Visa: 4111 1111 1111 1111 | MC: 5491 6702 1409 5346 | CVV: 123 | Validade futura.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Payer data — compact summary */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <User className="w-4 h-4 text-red-600" />
                    <span className="text-gray-700" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                      Dados do Pagador
                    </span>
                  </div>
                  <div className="bg-gray-50 rounded-lg border border-gray-100 px-4 py-3 space-y-1">
                    <p className="text-gray-800" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                      {effectiveName}
                    </p>
                    <p className="text-gray-500" style={{ fontSize: "0.78rem" }}>
                      {profile.email}
                    </p>
                    <p className="text-gray-500" style={{ fontSize: "0.78rem" }}>
                      CPF: {formatCpf(effectiveCpf)} | Tel: {formatPhone(effectivePhone)}
                    </p>
                    <button
                      onClick={() => setStep("review")}
                      className="text-red-500 hover:text-red-600 mt-1 transition-colors cursor-pointer"
                      style={{ fontSize: "0.75rem", fontWeight: 500 }}
                    >
                      Alterar dados
                    </button>
                  </div>
                </div>

                {/* Shipping address section — compact summary in payment step */}
                {selectedAddress && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Home className="w-4 h-4 text-red-600" />
                      <span className="text-gray-700" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                        Endereço de Entrega
                      </span>
                    </div>
                    <div className="bg-gray-50 rounded-lg border border-gray-100 px-4 py-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-gray-800" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                          {selectedAddress.label || "Endereço"}
                        </span>
                      </div>
                      <p className="text-gray-700" style={{ fontSize: "0.82rem", lineHeight: 1.4 }}>
                        {selectedAddress.street}
                        {selectedAddress.number ? ", " + selectedAddress.number : ""}
                        {selectedAddress.complement ? " - " + selectedAddress.complement : ""}
                      </p>
                      {selectedAddress.neighborhood && (
                        <p className="text-gray-500" style={{ fontSize: "0.78rem" }}>
                          {selectedAddress.neighborhood}
                        </p>
                      )}
                      <p className="text-gray-500" style={{ fontSize: "0.78rem" }}>
                        {[
                          selectedAddress.city,
                          selectedAddress.state,
                          selectedAddress.cep.replace(/(\d{5})(\d{3})/, "$1-$2"),
                        ].filter(Boolean).join(" - ")}
                      </p>
                      <button
                        onClick={() => setStep("review")}
                        className="text-red-500 hover:text-red-600 mt-2 transition-colors cursor-pointer"
                        style={{ fontSize: "0.75rem", fontWeight: 500 }}
                      >
                        Alterar endereco
                      </button>
                    </div>
                  </div>
                )}

                {/* Items summary */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                    <Package className="w-4 h-4 text-red-600" />
                    <span className="text-gray-700" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                      Itens ({totalItems})
                    </span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {items.map((item) => (
                      <div key={item.sku} className="flex items-center justify-between px-5 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-700 truncate" style={{ fontSize: "0.85rem" }}>
                            {item.titulo}
                          </p>
                          <p className="text-gray-400" style={{ fontSize: "0.72rem" }}>
                            {item.quantidade}x {item.precoUnitario ? formatPrice(item.precoUnitario + (item.warranty ? item.warranty.price : 0)) : "s/ preço"}
                            {item.warranty ? " (c/ garantia)" : ""}
                          </p>
                        </div>
                        <span className="text-gray-800 shrink-0 ml-3" style={{ fontSize: "0.88rem", fontWeight: 600 }}>
                          {item.precoUnitario ? formatPrice((item.precoUnitario + (item.warranty ? item.warranty.price : 0)) * item.quantidade) : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Shipping summary in payment step */}
                {selectedShipping && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Truck className="w-4 h-4 text-red-600" />
                      <span className="text-gray-700" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                        Frete Selecionado
                      </span>
                    </div>
                    <div className="bg-gray-50 rounded-lg border border-gray-100 px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-gray-800" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                          {selectedShipping.carrierName}
                        </p>
                        {selectedShipping.deliveryDays > 0 && (
                          <p className="text-gray-400" style={{ fontSize: "0.75rem" }}>
                            {selectedShipping.deliveryText}
                          </p>
                        )}
                      </div>
                      <span
                        className={selectedShipping.free ? "text-green-600" : "text-gray-800"}
                        style={{ fontSize: "0.95rem", fontWeight: 700 }}
                      >
                        {selectedShipping.free ? "Grátis" : formatPrice(selectedShipping.price)}
                      </span>
                    </div>
                    <button
                      onClick={() => setStep("review")}
                      className="text-red-500 hover:text-red-600 mt-2 transition-colors cursor-pointer"
                      style={{ fontSize: "0.75rem", fontWeight: 500 }}
                    >
                      Alterar frete
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ─── Sidebar ─── */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl border border-gray-200 p-5 lg:sticky lg:top-[130px]">
              <h3 className="text-gray-800 mb-4" style={{ fontSize: "1rem", fontWeight: 700 }}>
                Resumo
              </h3>

              <div className="space-y-3 mb-5">
                <div className="flex justify-between text-gray-500" style={{ fontSize: "0.85rem" }}>
                  <span>Itens ({totalItems})</span>
                  <span>{totalPrice > 0 ? formatPrice(totalPrice) : "—"}</span>
                </div>
                <div className="flex justify-between text-gray-500" style={{ fontSize: "0.85rem" }}>
                  <span>Frete</span>
                  {selectedShipping ? (
                    selectedShipping.free ? (
                      <span className="text-green-600 font-semibold">Gratis</span>
                    ) : (
                      <span>{formatPrice(selectedShipping.price)}</span>
                    )
                  ) : (
                    <span className="text-gray-400 italic">Calcule abaixo</span>
                  )}
                </div>
                {selectedShipping && selectedShipping.deliveryDays > 0 && (
                  <div className="flex items-center gap-1.5 text-gray-400" style={{ fontSize: "0.72rem" }}>
                    <Truck className="w-3 h-3" />
                    <span>{selectedShipping.carrierName} - {selectedShipping.deliveryText}</span>
                  </div>
                )}
                {couponApplied && (
                  <div className="flex justify-between items-center text-green-600" style={{ fontSize: "0.85rem" }}>
                    <div className="flex items-center gap-1.5">
                      <Ticket className="w-3.5 h-3.5" />
                      <span style={{ fontWeight: 500 }}>
                        Cupom {couponApplied.code}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span style={{ fontWeight: 600 }}>
                        -{formatPrice(couponDiscount)}
                      </span>
                      <button
                        onClick={handleRemoveCoupon}
                        className="text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                        title="Remover cupom"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
                <div className="border-t border-gray-100 pt-3 flex justify-between">
                  <span className="text-gray-700" style={{ fontSize: "0.95rem", fontWeight: 600 }}>Total</span>
                  <span className="text-red-600" style={{ fontSize: "1.2rem", fontWeight: 800 }}>
                    {totalPrice > 0 ? formatPrice(totalWithShipping) : "Sob consulta"}
                  </span>
                </div>
              </div>

              {/* ─── Coupon input ─── */}
              <div className="mb-5">
                <div className="flex items-center gap-1.5 mb-2">
                  <Ticket className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-gray-600" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                    Cupom de desconto
                  </span>
                </div>
                {couponApplied ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                      <div>
                        <span className="text-green-700 font-mono" style={{ fontSize: "0.82rem", fontWeight: 700 }}>
                          {couponApplied.code}
                        </span>
                        <p className="text-green-600" style={{ fontSize: "0.7rem" }}>
                          {couponApplied.discountType === "percentage"
                            ? couponApplied.discountValue + "% de desconto"
                            : formatPrice(couponApplied.discountValue) + " de desconto"}
                          {couponApplied.description ? " — " + couponApplied.description : ""}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleRemoveCoupon}
                      className="text-green-400 hover:text-red-500 transition-colors cursor-pointer p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={couponCode}
                      onChange={(e) => {
                        setCouponCode(e.target.value.toUpperCase());
                        setCouponError(null);
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter") handleValidateCoupon(); }}
                      placeholder="CODIGO"
                      className={`flex-1 px-3 py-2 border rounded-lg font-mono text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300 transition-colors ${
                        couponError ? "border-red-300 bg-red-50" : "border-gray-200"
                      }`}
                      style={{ fontSize: "0.82rem", fontWeight: 600 }}
                      maxLength={30}
                    />
                    <button
                      onClick={handleValidateCoupon}
                      disabled={!couponCode.trim() || couponValidating}
                      className="px-3 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0 flex items-center gap-1.5"
                      style={{ fontSize: "0.78rem", fontWeight: 600 }}
                    >
                      {couponValidating ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        "Aplicar"
                      )}
                    </button>
                  </div>
                )}
                {couponError && (
                  <p className="text-red-500 mt-1.5 flex items-center gap-1" style={{ fontSize: "0.72rem" }}>
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    {couponError}
                  </p>
                )}
              </div>

              {step === "review" && (
                <>
                  <button
                    onClick={() => {
                      setStep("payment");
                      trackEvent("begin_checkout", {
                        currency: "BRL",
                        value: totalWithShipping,
                        shipping: shippingPrice,
                        items: items.map((i) => ({
                          item_id: i.sku,
                          item_name: i.titulo,
                          quantity: i.quantidade,
                          price: i.precoUnitario ?? 0,
                        })),
                      });
                    }}
                    disabled={!canProceed}
                    className="w-full flex items-center justify-center gap-2 bg-red-600 text-white px-6 py-3 rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer shadow-lg shadow-red-200"
                    style={{ fontSize: "0.95rem", fontWeight: 700 }}
                  >
                    <CreditCard className="w-4 h-4" />
                    Ir para Pagamento
                  </button>
                  {!canProceed && items.length > 0 && totalPrice > 0 && (
                    <div className="mt-2 space-y-1 text-center">
                      {!nameValid && (
                        <p className="text-amber-600" style={{ fontSize: "0.75rem" }}>
                          Preencha seu nome completo
                        </p>
                      )}
                      {!cpfValid && (
                        <p className="text-amber-600" style={{ fontSize: "0.75rem" }}>
                          Informe um CPF válido
                        </p>
                      )}
                      {!phoneValid && (
                        <p className="text-amber-600" style={{ fontSize: "0.75rem" }}>
                          Informe seu telefone com DDD
                        </p>
                      )}
                      {!addressComplete && (
                        <p className="text-amber-600" style={{ fontSize: "0.75rem" }}>
                          Adicione um endereço de entrega
                        </p>
                      )}
                      {hasStockIssues && (
                        <p className="text-red-600" style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                          Resolva os problemas de estoque acima antes de continuar
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}

              {step === "payment" && (
                <div className="space-y-2">
                  {/* LGPD — Terms acceptance */}
                  <label className="flex items-start gap-2.5 p-3 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors cursor-pointer bg-gray-50/50">
                    <input
                      type="checkbox"
                      checked={acceptedTerms}
                      onChange={(e) => setAcceptedTerms(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-red-600 cursor-pointer shrink-0"
                    />
                    <span className="text-gray-600" style={{ fontSize: "0.75rem", lineHeight: 1.5 }}>
                      Li e concordo com os{" "}
                      <a href="/termos-de-uso" target="_blank" rel="noopener noreferrer" className="text-red-600 hover:text-red-700 underline underline-offset-2 font-medium">
                        Termos de Uso
                      </a>{" "}
                      e a{" "}
                      <a href="/politica-de-privacidade" target="_blank" rel="noopener noreferrer" className="text-red-600 hover:text-red-700 underline underline-offset-2 font-medium">
                        Política de Privacidade
                      </a>
                      .
                    </span>
                  </label>
                  <button
                    onClick={handleSubmit}
                    disabled={!canSubmitPayment || submitting}
                    className={`w-full flex items-center justify-center gap-2 text-white px-6 py-3 rounded-xl transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer shadow-lg ${
                      paymentMethod === "pix"
                        ? "bg-teal-600 hover:bg-teal-700 shadow-teal-200"
                        : paymentMethod === "mercadopago"
                        ? "bg-sky-500 hover:bg-sky-600 shadow-sky-200"
                        : paymentMethod === "cartao_credito"
                        ? "bg-orange-600 hover:bg-orange-700 shadow-orange-200"
                        : "bg-blue-600 hover:bg-blue-700 shadow-blue-200"
                    }`}
                    style={{ fontSize: "0.95rem", fontWeight: 700 }}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Processando...
                      </>
                    ) : paymentMethod === "pix" ? (
                      <>
                        <QrCode className="w-4 h-4" />
                        Gerar PIX
                      </>
                    ) : paymentMethod === "mercadopago" ? (
                      <>
                        <Wallet className="w-4 h-4" />
                        Pagar com Mercado Pago
                      </>
                    ) : paymentMethod === "cartao_credito" ? (
                      <>
                        <CreditCard className="w-4 h-4" />
                        Pagar com Cartão
                      </>
                    ) : (
                      <>
                        <Barcode className="w-4 h-4" />
                        Gerar Boleto
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setStep("review")}
                    className="w-full flex items-center justify-center gap-2 text-gray-500 hover:text-gray-700 py-2 transition-colors cursor-pointer"
                    style={{ fontSize: "0.82rem" }}
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Voltar
                  </button>
                </div>
              )}

              {/* Validation hints */}
              {step === "payment" && !acceptedTerms && (
                <p className="text-amber-600 mt-3 text-center" style={{ fontSize: "0.75rem" }}>
                  Aceite os termos para finalizar
                </p>
              )}

              {/* Logged in as */}
              <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-2">
                <div className="bg-red-100 rounded-full p-1.5">
                  <User className="w-3 h-3 text-red-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-gray-600 truncate" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                    {effectiveName || profile.email}
                  </p>
                  <p className="text-gray-400 truncate" style={{ fontSize: "0.68rem" }}>
                    {profile.email}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Breadcrumb helper ───
function Breadcrumb({ label }: { label: string }) {
  return (
    <div className="bg-white border-b border-gray-200">
      <div className="max-w-4xl mx-auto px-4 py-3">
        <nav className="flex items-center gap-2 text-gray-400" style={{ fontSize: "0.8rem" }}>
          <Link to="/" className="flex items-center gap-1 hover:text-red-600 transition-colors">
            <Home className="w-3.5 h-3.5" />
            Inicio
          </Link>
          <span>/</span>
          <Link to="/catalogo" className="hover:text-red-600 transition-colors">
            Catálogo
          </Link>
          <span>/</span>
          <span className="text-gray-600">{label}</span>
        </nav>
      </div>
    </div>
  );
}

// ─── Checkout item row ───
function CheckoutItemRow({
  item,
  onRemove,
  onUpdateQty,
}: {
  item: {
    sku: string;
    titulo: string;
    quantidade: number;
    precoUnitario: number | null;
    imageUrl: string;
    warranty?: { planId: string; name: string; price: number; durationMonths: number } | null;
  };
  onRemove: () => void;
  onUpdateQty: (qty: number) => void;
}) {
  return (
    <div className="flex gap-4 p-4 sm:p-5">
      {/* Image */}
      <div className="w-20 h-20 bg-white rounded-lg border border-gray-200 overflow-hidden shrink-0 flex items-center justify-center">
        <ProductImage
          sku={item.sku}
          alt={item.titulo}
          className="w-full h-full object-contain p-2"
          fallback={<Package className="w-8 h-8 text-gray-300" />}
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <Link
          to={`/produto/${encodeURIComponent(item.sku)}`}
          className="text-gray-700 hover:text-red-600 transition-colors line-clamp-2 block"
          style={{ fontSize: "0.9rem", fontWeight: 500, lineHeight: 1.4 }}
        >
          {item.titulo}
        </Link>
        <p className="text-gray-400 font-mono mt-0.5" style={{ fontSize: "0.72rem" }}>
          SKU: {item.sku}
        </p>
        {item.warranty && (
          <div className="flex items-center gap-1 mt-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md w-fit">
            <span style={{ fontSize: "0.65rem", fontWeight: 600 }}>
              Garantia: {item.warranty.name} (+{formatPrice(item.warranty.price)})
            </span>
          </div>
        )}

        <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
          {/* Quantity */}
          <div className="flex items-center gap-0 bg-gray-100 rounded-lg">
            <button
              onClick={() => onUpdateQty(item.quantidade - 1)}
              className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-red-600 hover:bg-gray-200 rounded-l-lg transition-colors cursor-pointer"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <input
              type="number"
              value={item.quantidade}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val > 0) onUpdateQty(val);
              }}
              className="w-12 text-center text-gray-800 bg-transparent border-0 focus:outline-none"
              style={{ fontSize: "0.88rem", fontWeight: 600 }}
              min={1}
            />
            <button
              onClick={() => onUpdateQty(item.quantidade + 1)}
              className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-red-600 hover:bg-gray-200 rounded-r-lg transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Price */}
          <div className="text-right">
            {item.precoUnitario ? (
              <>
                <p className="text-red-600" style={{ fontSize: "1rem", fontWeight: 700 }}>
                  {formatPrice((item.precoUnitario + (item.warranty ? item.warranty.price : 0)) * item.quantidade)}
                </p>
                {(item.quantidade > 1 || item.warranty) && (
                  <p className="text-gray-400" style={{ fontSize: "0.72rem" }}>
                    {formatPrice(item.precoUnitario + (item.warranty ? item.warranty.price : 0))} / un.
                  </p>
                )}
              </>
            ) : (
              <p className="text-gray-400 italic" style={{ fontSize: "0.85rem" }}>
                Sob consulta
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Remove */}
      <button
        onClick={onRemove}
        className="self-start p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0 cursor-pointer"
        title="Remover item"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}