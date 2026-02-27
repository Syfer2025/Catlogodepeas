import { useState, useEffect } from "react";
import React from "react";
import {
  ShoppingCart,
  DollarSign,
  Package,
  Users,
  TrendingUp,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Ticket,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
} from "lucide-react";
import * as api from "../../services/api";
import { getValidAdminToken } from "./adminAuth";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

function formatPrice(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "-";
  try {
    var d = new Date(dateStr);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) +
      " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return dateStr;
  }
}

function statusLabel(status: string): { label: string; color: string } {
  switch (status) {
    case "paid":
    case "approved":
      return { label: "Pago", color: "bg-green-100 text-green-700" };
    case "pending":
      return { label: "Pendente", color: "bg-yellow-100 text-yellow-700" };
    case "processing":
      return { label: "Processando", color: "bg-blue-100 text-blue-700" };
    case "cancelled":
    case "refunded":
      return { label: "Cancelado", color: "bg-red-100 text-red-700" };
    case "completed":
      return { label: "Concluido", color: "bg-emerald-100 text-emerald-700" };
    default:
      return { label: status, color: "bg-gray-100 text-gray-600" };
  }
}

export function AdminDashboard() {
  const [stats, setStats] = useState<api.DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      var token = await getValidAdminToken();
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");
      const data = await api.getDashboardStats(token);
      setStats(data);
    } catch (e: any) {
      console.error("[AdminDashboard] Error:", e);
      setError(e.message || "Erro ao carregar dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
        <span className="ml-3 text-gray-500" style={{ fontSize: "0.9rem" }}>Carregando dashboard...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertTriangle className="w-10 h-10 text-red-400 mb-3" />
        <p className="text-gray-600 mb-4" style={{ fontSize: "0.9rem" }}>{error}</p>
        <button
          onClick={fetchStats}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
          style={{ fontSize: "0.85rem" }}
        >
          <RefreshCw className="w-4 h-4" />
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!stats) return null;

  const statCards = [
    {
      label: "Total de Pedidos",
      value: String(stats.totalOrders),
      icon: ShoppingCart,
      color: "bg-blue-500",
      bgLight: "bg-blue-50",
    },
    {
      label: "Receita Total",
      value: formatPrice(stats.totalRevenue),
      icon: DollarSign,
      color: "bg-green-500",
      bgLight: "bg-green-50",
    },
    {
      label: "Ticket Medio",
      value: formatPrice(stats.avgOrderValue),
      icon: TrendingUp,
      color: "bg-purple-500",
      bgLight: "bg-purple-50",
    },
    {
      label: "Produtos Ativos",
      value: stats.activeProducts + " / " + stats.totalProducts,
      icon: Package,
      color: "bg-orange-500",
      bgLight: "bg-orange-50",
    },
    {
      label: "Clientes",
      value: String(stats.totalClients),
      icon: Users,
      color: "bg-cyan-500",
      bgLight: "bg-cyan-50",
    },
    {
      label: "Cupons",
      value: String(stats.totalCoupons),
      icon: Ticket,
      color: "bg-pink-500",
      bgLight: "bg-pink-50",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-gray-900" style={{ fontSize: "1.4rem", fontWeight: 700 }}>
            Dashboard
          </h2>
          <p className="text-gray-500 mt-0.5" style={{ fontSize: "0.8rem" }}>
            Visao geral do seu negocio
          </p>
        </div>
        <button
          onClick={fetchStats}
          className="px-3 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
          style={{ fontSize: "0.8rem" }}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Atualizar
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-3">
              <div className={"w-10 h-10 rounded-lg flex items-center justify-center " + card.bgLight}>
                <card.icon className={"w-5 h-5 " + card.color.replace("bg-", "text-")} />
              </div>
            </div>
            <p className="text-gray-900 truncate" style={{ fontSize: "1.15rem", fontWeight: 700 }}>
              {card.value}
            </p>
            <p className="text-gray-500 mt-0.5" style={{ fontSize: "0.7rem", fontWeight: 500 }}>
              {card.label}
            </p>
          </div>
        ))}
      </div>

      {/* Status breakdown */}
      {Object.keys(stats.statusCounts).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-gray-900 mb-4" style={{ fontSize: "0.95rem", fontWeight: 600 }}>
            Status dos Pedidos
          </h3>
          <div className="flex flex-wrap gap-3">
            {Object.entries(stats.statusCounts).map(([status, count]) => {
              const sl = statusLabel(status);
              return (
                <div
                  key={status}
                  className={"inline-flex items-center gap-2 px-4 py-2 rounded-lg " + sl.color}
                >
                  <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{count}</span>
                  <span style={{ fontSize: "0.75rem" }}>{sl.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Chart */}
      {stats.chartData && stats.chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-gray-900 mb-4" style={{ fontSize: "0.95rem", fontWeight: 600 }}>
            Vendas nos Ultimos 6 Meses
          </h3>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={stats.chartData} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} tickFormatter={(v) => "R$" + (v / 1000).toFixed(0) + "k"} />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    if (name === "revenue") return [formatPrice(value), "Receita"];
                    return [value, "Pedidos"];
                  }}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Legend
                  formatter={(value) => (value === "orders" ? "Pedidos" : "Receita")}
                  wrapperStyle={{ fontSize: 12 }}
                />
                <Bar yAxisId="left" dataKey="orders" fill="#3b82f6" radius={[4, 4, 0, 0]} name="orders" />
                <Bar yAxisId="right" dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} name="revenue" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Recent Orders */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-gray-900" style={{ fontSize: "0.95rem", fontWeight: 600 }}>
            Pedidos Recentes
          </h3>
          <div className="flex items-center gap-1.5 text-gray-400">
            <Clock className="w-3.5 h-3.5" />
            <span style={{ fontSize: "0.7rem" }}>Ultimos 10</span>
          </div>
        </div>
        {stats.recentOrders.length === 0 ? (
          <p className="text-gray-400 text-center py-8" style={{ fontSize: "0.85rem" }}>
            Nenhum pedido registrado ainda.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-3 text-gray-500" style={{ fontSize: "0.7rem", fontWeight: 600 }}>Pedido</th>
                  <th className="text-left py-2 px-3 text-gray-500" style={{ fontSize: "0.7rem", fontWeight: 600 }}>Cliente</th>
                  <th className="text-left py-2 px-3 text-gray-500" style={{ fontSize: "0.7rem", fontWeight: 600 }}>Total</th>
                  <th className="text-left py-2 px-3 text-gray-500" style={{ fontSize: "0.7rem", fontWeight: 600 }}>Pagamento</th>
                  <th className="text-left py-2 px-3 text-gray-500" style={{ fontSize: "0.7rem", fontWeight: 600 }}>Status</th>
                  <th className="text-left py-2 px-3 text-gray-500" style={{ fontSize: "0.7rem", fontWeight: 600 }}>Data</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentOrders.map((order, idx) => {
                  const sl = statusLabel(order.status);
                  return (
                    <tr key={order.localOrderId + "-" + idx} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="py-2.5 px-3">
                        <span className="text-gray-900" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                          {order.localOrderId.substring(0, 20) || "-"}
                        </span>
                        <br />
                        <span className="text-gray-400" style={{ fontSize: "0.65rem" }}>
                          {order.itemCount} {order.itemCount === 1 ? "item" : "itens"}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-gray-600" style={{ fontSize: "0.8rem" }}>
                        {order.userName || "-"}
                      </td>
                      <td className="py-2.5 px-3 text-gray-900" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                        {formatPrice(order.total)}
                      </td>
                      <td className="py-2.5 px-3 text-gray-600" style={{ fontSize: "0.75rem", textTransform: "uppercase" }}>
                        {order.paymentMethod === "cartao_credito" ? "CARTAO" : (order.paymentMethod || "-")}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={"inline-flex px-2 py-0.5 rounded-full " + sl.color} style={{ fontSize: "0.7rem", fontWeight: 600 }}>
                          {sl.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-gray-500" style={{ fontSize: "0.75rem" }}>
                        {formatDate(order.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}