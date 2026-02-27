import { useState, useEffect, useCallback } from "react";
import { getValidAdminToken } from "./adminAuth";
import * as api from "../../services/api";
import type { AdminOrder } from "../../services/api";
import {
  ShoppingCart,
  Loader2,
  Search,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  AlertCircle,
  Ban,
  XCircle,
  Package,
  MapPin,
  User,
  Mail,
  FileText,
  CreditCard,
  Zap,
  DollarSign,
  Truck,
  Eye,
  Filter,
  ArrowUpDown,
  Hash,
  Calendar,
  ExternalLink,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";

/* ===================================================
   Helpers
   =================================================== */

async function getToken(): Promise<string> {
  const token = await getValidAdminToken();
  if (!token) throw new Error("Sessão expirada. Faça login novamente.");
  return token;
}

function formatDate(ts: string | number | null | undefined): string {
  if (!ts) return "\u2014";
  const d = typeof ts === "number" ? new Date(ts) : new Date(ts);
  return d.toLocaleString("pt-BR");
}

function formatDateShort(ts: string | number | null | undefined): string {
  if (!ts) return "\u2014";
  const d = typeof ts === "number" ? new Date(ts) : new Date(ts);
  return d.toLocaleDateString("pt-BR");
}

function formatBRL(value: number | null | undefined): string {
  if (value == null) return "\u2014";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

type OrderStatus = "paid" | "awaiting_payment" | "sige_registered" | "cancelled" | string;

const statusConfig: Record<string, { bg: string; text: string; border: string; icon: typeof CheckCircle2; label: string }> = {
  paid: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200", icon: CheckCircle2, label: "Pago" },
  awaiting_payment: { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200", icon: Clock, label: "Aguardando Pagamento" },
  sige_registered: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", icon: FileText, label: "Registrado" },
  cancelled: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", icon: Ban, label: "Cancelado" },
  refunded: { bg: "bg-gray-50", text: "text-gray-600", border: "border-gray-200", icon: XCircle, label: "Reembolsado" },
};

function getStatusConfig(status: string) {
  return statusConfig[status] || { bg: "bg-gray-50", text: "text-gray-600", border: "border-gray-200", icon: AlertCircle, label: status };
}

function StatusBadge({ status }: { status: string }) {
  const s = getStatusConfig(status);
  const Icon = s.icon;
  return (
    <span className={"inline-flex items-center gap-1 px-2.5 py-1 rounded-full " + s.bg + " " + s.text + " border " + s.border} style={{ fontSize: "0.75rem", fontWeight: 600 }}>
      <Icon className="w-3 h-3" />
      {s.label}
    </span>
  );
}

function PaymentMethodBadge({ method }: { method: string | null }) {
  if (!method) return <span className="text-gray-400" style={{ fontSize: "0.75rem" }}>\u2014</span>;
  const map: Record<string, { icon: typeof Zap; color: string; bg: string; label: string }> = {
    pix: { icon: Zap, color: "text-green-700", bg: "bg-green-50", label: "PIX" },
    boleto: { icon: FileText, color: "text-orange-700", bg: "bg-orange-50", label: "Boleto" },
    credit_card: { icon: CreditCard, color: "text-blue-700", bg: "bg-blue-50", label: "Cartão" },
    cartao_credito: { icon: CreditCard, color: "text-orange-700", bg: "bg-orange-50", label: "Cartão Crédito" },
    mercadopago: { icon: CreditCard, color: "text-[#009ee3]", bg: "bg-[#009ee3]/10", label: "Mercado Pago" },
  };
  const m = map[method] || { icon: CreditCard, color: "text-gray-600", bg: "bg-gray-50", label: method };
  const Icon = m.icon;
  return (
    <span className={"inline-flex items-center gap-1 px-2 py-0.5 rounded-full " + m.bg + " " + m.color} style={{ fontSize: "0.72rem", fontWeight: 500 }}>
      <Icon className="w-3 h-3" />
      {m.label}
    </span>
  );
}

/* ===================================================
   Main Component
   =================================================== */

export function AdminOrders() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [sortField, setSortField] = useState<"date" | "total">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const tk = await getToken();
      const data = await api.adminGetOrders(tk);
      setOrders(data.orders || []);
      setTotal(data.total || 0);
    } catch (e: any) {
      console.error("[AdminOrders] Load error:", e);
      setError(e.message || "Erro ao carregar pedidos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleUpdateStatus = async (order: AdminOrder, newStatus: string) => {
    if (!order.createdBy || !order.localOrderId) {
      setError("Pedido sem userId ou localOrderId — não pode ser atualizado.");
      return;
    }
    setUpdatingId(order.localOrderId);
    try {
      const tk = await getToken();
      await api.adminUpdateOrderStatus(tk, {
        userId: order.createdBy,
        localOrderId: order.localOrderId,
        status: newStatus,
      });
      setSuccess("Status atualizado para: " + getStatusConfig(newStatus).label);
      setTimeout(() => setSuccess(""), 3000);
      await loadOrders();
    } catch (e: any) {
      setError(e.message || "Erro ao atualizar status.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRetrySige = async (order: AdminOrder) => {
    if (!order.createdBy || !order.localOrderId) {
      setError("Pedido sem userId ou localOrderId — não pode ser registrado no SIGE.");
      return;
    }
    if (order.sigeOrderId) {
      setError("Pedido já possui SIGE ID: " + order.sigeOrderId);
      return;
    }
    setRetryingId(order.localOrderId);
    setError("");
    try {
      const tk = await getToken();
      const result = await api.adminRetrySigeRegistration(tk, {
        userId: order.createdBy,
        localOrderId: order.localOrderId,
      });
      if (result.success && result.sigeOrderId) {
        setSuccess("Pedido registrado no SIGE com sucesso! ID: #" + result.sigeOrderId);
        setTimeout(() => setSuccess(""), 5000);
        await loadOrders();
      } else {
        setError(result.error || "Erro desconhecido ao registrar no SIGE.");
      }
    } catch (e: any) {
      console.error("[AdminOrders] Retry SIGE error:", e);
      setError(e.message || "Erro ao tentar registrar pedido no SIGE.");
    } finally {
      setRetryingId(null);
    }
  };

  // Filtering
  const filtered = orders.filter((o) => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (paymentFilter !== "all" && o.paymentMethod !== paymentFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (o.orderId || "").toLowerCase().includes(q) ||
        (o.localOrderId || "").toLowerCase().includes(q) ||
        (o.sigeOrderId || "").toLowerCase().includes(q) ||
        (o.userEmail || "").toLowerCase().includes(q) ||
        (o.userName || "").toLowerCase().includes(q) ||
        (o.transactionId || "").toLowerCase().includes(q) ||
        (o.items || []).some((it) => (it.titulo || "").toLowerCase().includes(q) || (it.sku || "").toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Sorting
  const sorted = [...filtered].sort((a, b) => {
    if (sortField === "total") {
      return sortDir === "desc" ? (b.total || 0) - (a.total || 0) : (a.total || 0) - (b.total || 0);
    }
    const da = new Date(a.createdAt || 0).getTime();
    const db = new Date(b.createdAt || 0).getTime();
    return sortDir === "desc" ? db - da : da - db;
  });

  // Stats
  const stats = {
    total: orders.length,
    paid: orders.filter((o) => o.status === "paid").length,
    awaiting: orders.filter((o) => o.status === "awaiting_payment").length,
    cancelled: orders.filter((o) => o.status === "cancelled").length,
    revenue: orders.filter((o) => o.status === "paid").reduce((sum, o) => sum + (o.total || 0), 0),
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "1.25rem", fontWeight: 700 }}>
            <ShoppingCart className="w-5 h-5 text-red-600" />
            Pedidos
          </h2>
          <p className="text-gray-400" style={{ fontSize: "0.85rem" }}>
            Gerencie todos os pedidos da loja
          </p>
        </div>
        <button
          onClick={loadOrders}
          className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-600"
          style={{ fontSize: "0.85rem" }}
        >
          <RefreshCw className="w-4 h-4" />
          Atualizar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total", value: String(stats.total), color: "text-gray-700", bg: "bg-gray-50", icon: ShoppingCart },
          { label: "Pagos", value: String(stats.paid), color: "text-green-700", bg: "bg-green-50", icon: CheckCircle2 },
          { label: "Aguardando", value: String(stats.awaiting), color: "text-yellow-700", bg: "bg-yellow-50", icon: Clock },
          { label: "Cancelados", value: String(stats.cancelled), color: "text-red-700", bg: "bg-red-50", icon: Ban },
          { label: "Receita", value: formatBRL(stats.revenue), color: "text-green-700", bg: "bg-green-50", icon: DollarSign },
        ].map((s) => (
          <div key={s.label} className={"rounded-xl border border-gray-200 p-4 " + s.bg}>
            <div className="flex items-center gap-2 mb-1">
              <s.icon className={"w-4 h-4 " + s.color} />
              <p className="text-gray-500" style={{ fontSize: "0.72rem", fontWeight: 500 }}>{s.label}</p>
            </div>
            <p className={s.color} style={{ fontSize: s.label === "Receita" ? "1.1rem" : "1.5rem", fontWeight: 700 }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Error/Success */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-red-600" style={{ fontSize: "0.82rem" }}>{error}</p>
          <button onClick={() => setError("")} className="ml-auto text-red-400 hover:text-red-600">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
          <p className="text-green-700" style={{ fontSize: "0.82rem" }}>{success}</p>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por ID, email, cliente, produto, SKU..."
              className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all"
              style={{ fontSize: "0.85rem" }}
            />
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="pl-9 pr-8 py-2.5 border border-gray-200 rounded-lg bg-gray-50 outline-none focus:border-red-500 transition-all appearance-none"
                style={{ fontSize: "0.85rem" }}
              >
                <option value="all">Status: Todos</option>
                <option value="paid">Pago</option>
                <option value="awaiting_payment">Aguardando</option>
                <option value="sige_registered">Registrado</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </div>
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50 outline-none focus:border-red-500 transition-all"
              style={{ fontSize: "0.85rem" }}
            >
              <option value="all">Pagamento: Todos</option>
              <option value="pix">PIX</option>
              <option value="boleto">Boleto</option>
              <option value="credit_card">Cartão</option>
              <option value="cartao_credito">Cartão Crédito (SafraPay)</option>
              <option value="mercadopago">Mercado Pago</option>
            </select>
            <button
              onClick={() => {
                setSortDir(sortDir === "desc" ? "asc" : "desc");
              }}
              className="flex items-center gap-1.5 px-3 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-600"
              style={{ fontSize: "0.8rem" }}
              title={"Ordenar por " + (sortField === "date" ? "data" : "valor")}
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              {sortDir === "desc" ? "Recentes" : "Antigos"}
            </button>
          </div>
        </div>
        {(search || statusFilter !== "all" || paymentFilter !== "all") && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
            <p className="text-gray-400" style={{ fontSize: "0.78rem" }}>
              {sorted.length} de {orders.length} pedidos
            </p>
            <button
              onClick={() => { setSearch(""); setStatusFilter("all"); setPaymentFilter("all"); }}
              className="text-red-500 hover:text-red-700 transition-colors"
              style={{ fontSize: "0.78rem", fontWeight: 500 }}
            >
              Limpar filtros
            </button>
          </div>
        )}
      </div>

      {/* Orders List */}
      {sorted.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500" style={{ fontSize: "0.9rem" }}>
            {orders.length === 0
              ? "Nenhum pedido encontrado. Os pedidos aparecerao aqui quando clientes realizarem compras."
              : "Nenhum pedido corresponde aos filtros aplicados."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((order, idx) => {
            const uniqueKey = (order.localOrderId || "") + "-" + (order.orderId || "") + "-" + idx;
            const isExpanded = expandedId === uniqueKey;
            return (
              <div key={uniqueKey} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Row */}
                <div
                  className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : uniqueKey)}
                >
                  {/* Status indicator */}
                  <div className="shrink-0">
                    <div className={"w-9 h-9 rounded-lg flex items-center justify-center " + getStatusConfig(order.status).bg}>
                      {(() => {
                        const Icon = getStatusConfig(order.status).icon;
                        return <Icon className={"w-4 h-4 " + getStatusConfig(order.status).text} />;
                      })()}
                    </div>
                  </div>

                  {/* Order info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-gray-800 font-mono" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                        #{order.localOrderId || order.orderId || "N/A"}
                      </span>
                      {order.sigeOrderId ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200" style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                          <ExternalLink className="w-3 h-3" />
                          SIGE #{order.sigeOrderId}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-50 text-gray-400 border border-gray-200" style={{ fontSize: "0.72rem", fontWeight: 500 }}>
                          <ExternalLink className="w-3 h-3" />
                          SIGE: N/A
                        </span>
                      )}
                      <StatusBadge status={order.status} />
                      <PaymentMethodBadge method={order.paymentMethod} />
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {order.userName || order.userEmail ? (
                        <span className="text-gray-500 truncate" style={{ fontSize: "0.75rem" }}>
                          <User className="w-3 h-3 inline mr-1" />
                          {order.userName || order.userEmail}
                        </span>
                      ) : null}
                      <span className="text-gray-400" style={{ fontSize: "0.75rem" }}>
                        <Calendar className="w-3 h-3 inline mr-1" />
                        {formatDateShort(order.createdAt)}
                      </span>
                      {order.itemCount > 0 && (
                        <span className="text-gray-400" style={{ fontSize: "0.75rem" }}>
                          <Package className="w-3 h-3 inline mr-1" />
                          {order.itemCount} {order.itemCount === 1 ? "item" : "itens"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Total */}
                  <div className="text-right shrink-0">
                    <p className="text-gray-800" style={{ fontSize: "1rem", fontWeight: 700 }}>
                      {formatBRL(order.total)}
                    </p>
                  </div>

                  {/* Expand icon */}
                  <div className="shrink-0 text-gray-400">
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 py-5 bg-gray-50 space-y-5">
                    {/* Order details grid */}
                    <div>
                      <p className="text-gray-600 mb-3" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Detalhes do Pedido</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <DetailField icon={Hash} label="ID Local" value={order.localOrderId || "\u2014"} mono />
                        <DetailField icon={FileText} label="ID SIGE" value={order.sigeOrderId || "Não registrado"} mono />
                        <DetailField icon={Calendar} label="Criado em" value={formatDate(order.createdAt)} />
                        {order.updatedAt && <DetailField icon={Calendar} label="Atualizado em" value={formatDate(order.updatedAt)} />}
                        <DetailField icon={CreditCard} label="Metodo Pagamento" value={order.paymentMethod === "cartao_credito" ? "Cartao de Credito (SafraPay)" : (order.paymentMethod || "\u2014")} />
                        {order.transactionId && <DetailField icon={Hash} label="Transaction ID" value={order.transactionId} mono />}
                        <DetailField icon={DollarSign} label="Total" value={formatBRL(order.total)} highlight />
                        {(order as any).cardBrand && <DetailField icon={CreditCard} label="Bandeira" value={(order as any).cardBrand} />}
                        {(order as any).cardLastFour && <DetailField icon={CreditCard} label="Final do Cartao" value={"**** " + (order as any).cardLastFour} mono />}
                        {(order as any).installments && (order as any).installments > 1 && <DetailField icon={CreditCard} label="Parcelas" value={(order as any).installments + "x"} />}
                        {(order as any).safrapayChargeId && <DetailField icon={Hash} label="SafraPay Charge ID" value={(order as any).safrapayChargeId} mono />}
                      </div>
                    </div>

                    {/* Customer info */}
                    {(order.userName || order.userEmail) && (
                      <div>
                        <p className="text-gray-600 mb-3" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Cliente</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {order.userName && <DetailField icon={User} label="Nome" value={order.userName} />}
                          {order.userEmail && <DetailField icon={Mail} label="Email" value={order.userEmail} />}
                          {order.createdBy && <DetailField icon={Hash} label="User ID" value={order.createdBy} mono small />}
                        </div>
                      </div>
                    )}

                    {/* Shipping address */}
                    {order.shippingAddress && (
                      <div>
                        <p className="text-gray-600 mb-3" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Endereco de Entrega</p>
                        <div className="bg-white rounded-lg border border-gray-200 p-3">
                          <div className="flex items-start gap-2">
                            <MapPin className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                            <div>
                              {order.shippingAddress.name && (
                                <p className="text-gray-800" style={{ fontSize: "0.85rem", fontWeight: 500 }}>{order.shippingAddress.name}</p>
                              )}
                              <p className="text-gray-600" style={{ fontSize: "0.8rem" }}>
                                {order.shippingAddress.address}
                              </p>
                              <p className="text-gray-600" style={{ fontSize: "0.8rem" }}>
                                {order.shippingAddress.city}{order.shippingAddress.state ? " - " + order.shippingAddress.state : ""}
                                {order.shippingAddress.cep ? " | CEP: " + order.shippingAddress.cep : ""}
                              </p>
                              {order.shippingAddress.phone && (
                                <p className="text-gray-500" style={{ fontSize: "0.78rem" }}>Tel: {order.shippingAddress.phone}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Shipping option */}
                    {order.shippingOption && (
                      <div>
                        <p className="text-gray-600 mb-3" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Frete Selecionado</p>
                        <div className="bg-white rounded-lg border border-gray-200 p-3">
                          <div className="flex items-center gap-2">
                            <Truck className="w-4 h-4 text-gray-400 shrink-0" />
                            <div className="flex-1">
                              <p className="text-gray-800" style={{ fontSize: "0.85rem", fontWeight: 500 }}>{order.shippingOption.carrierName}</p>
                              <p className="text-gray-500" style={{ fontSize: "0.78rem" }}>
                                {order.shippingOption.free ? "Frete Gratis" : ("R$ " + (order.shippingOption.price || 0).toFixed(2))}
                                {order.shippingOption.deliveryDays > 0 ? (" | ate " + order.shippingOption.deliveryDays + " dias uteis") : ""}
                              </p>
                            </div>
                          </div>
                          {order.shippingOption.sisfreteQuoteId && (
                            <div className="mt-2 flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded px-2.5 py-1.5">
                              <Hash className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                              <span className="text-blue-700" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                                ID Cotacao SisFrete: <code className="bg-blue-100 px-1 rounded font-mono">{order.shippingOption.sisfreteQuoteId}</code>
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Observacao */}
                    {order.observacao && (
                      <div>
                        <p className="text-gray-600 mb-2" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Observacao</p>
                        <div className="bg-white rounded-lg border border-gray-200 p-3">
                          <p className="text-gray-700" style={{ fontSize: "0.82rem" }}>{order.observacao}</p>
                        </div>
                      </div>
                    )}

                    {/* Items */}
                    {order.items && order.items.length > 0 && (
                      <div>
                        <p className="text-gray-600 mb-3" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                          Itens ({order.items.length})
                        </p>
                        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                          <div className="divide-y divide-gray-100">
                            {order.items.map((item, idx) => (
                              <div key={item.sku + "-" + idx} className="flex items-center gap-3 px-3 py-2.5">
                                {item.imageUrl ? (
                                  <img
                                    src={item.imageUrl}
                                    alt={item.titulo}
                                    className="w-10 h-10 rounded-lg object-cover border border-gray-200 shrink-0"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                                    <Package className="w-4 h-4 text-gray-400" />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-gray-800 truncate" style={{ fontSize: "0.82rem", fontWeight: 500 }}>
                                    {item.titulo}
                                  </p>
                                  <p className="text-gray-400 font-mono" style={{ fontSize: "0.72rem" }}>
                                    SKU: {item.sku}
                                  </p>
                                  {item.warranty && (
                                    <div className="flex items-center gap-1 mt-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md w-fit">
                                      <ShieldCheck className="w-3 h-3" />
                                      <span style={{ fontSize: "0.6rem", fontWeight: 600 }}>
                                        {item.warranty.name} ({item.warranty.durationMonths}m) +{formatBRL(item.warranty.price)}
                                      </span>
                                    </div>
                                  )}
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-gray-700" style={{ fontSize: "0.82rem", fontWeight: 500 }}>
                                    {item.quantidade}x {formatBRL(item.valorUnitario + (item.warranty ? item.warranty.price : 0))}
                                  </p>
                                  <p className="text-gray-500" style={{ fontSize: "0.72rem" }}>
                                    = {formatBRL(item.quantidade * (item.valorUnitario + (item.warranty ? item.warranty.price : 0)))}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="pt-2 border-t border-gray-200">
                      <p className="text-gray-600 mb-3" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Alterar Status</p>
                      <div className="flex flex-wrap gap-2">
                        {["paid", "awaiting_payment", "sige_registered", "cancelled"].map((st) => {
                          const cfg = getStatusConfig(st);
                          const Icon = cfg.icon;
                          const isActive = order.status === st;
                          const isUpdating = updatingId === order.localOrderId;
                          return (
                            <button
                              key={st}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!isActive) handleUpdateStatus(order, st);
                              }}
                              disabled={isActive || isUpdating}
                              className={
                                "flex items-center gap-1.5 px-3 py-2 rounded-lg border transition-colors " +
                                (isActive
                                  ? cfg.bg + " " + cfg.border + " " + cfg.text + " cursor-default"
                                  : "border-gray-200 text-gray-600 hover:bg-gray-100")
                              }
                              style={{ fontSize: "0.78rem", fontWeight: isActive ? 600 : 400 }}
                            >
                              {isUpdating ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Icon className="w-3.5 h-3.5" />
                              )}
                              {cfg.label}
                              {isActive && " (atual)"}
                            </button>
                          );
                        })}
                        {!order.sigeOrderId && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRetrySige(order);
                            }}
                            disabled={retryingId === order.localOrderId}
                            className={
                              "flex items-center gap-1.5 px-3 py-2 rounded-lg border transition-colors " +
                              (retryingId === order.localOrderId
                                ? "bg-indigo-50 border-indigo-200 text-indigo-600 cursor-wait"
                                : "border-indigo-200 text-indigo-600 bg-indigo-50/50 hover:bg-indigo-100")
                            }
                            style={{ fontSize: "0.78rem", fontWeight: 600 }}
                          >
                            {retryingId === order.localOrderId ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="w-3.5 h-3.5" />
                            )}
                            {retryingId === order.localOrderId ? "Registrando..." : "Registrar no SIGE"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ===================================================
   Detail Field Helper
   =================================================== */

function DetailField({
  icon: Icon,
  label,
  value,
  mono = false,
  highlight = false,
  small = false,
}: {
  icon: typeof Hash;
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
  small?: boolean;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3 h-3 text-gray-400" />
        <p className="text-gray-400" style={{ fontSize: "0.7rem", fontWeight: 500 }}>{label}</p>
      </div>
      <p
        className={(highlight ? "text-green-700" : "text-gray-800") + (mono ? " font-mono" : "")}
        style={{ fontSize: small ? "0.72rem" : "0.82rem", fontWeight: highlight ? 700 : 500 }}
      >
        {value}
      </p>
    </div>
  );
}