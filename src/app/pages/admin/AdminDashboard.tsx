import { useEffect, useState } from "react";
import * as api from "../../services/api";
import type { ProdutoDB } from "../../services/api";
import {
  Package,
  Database,
  MessageSquare,
  TrendingUp,
  ArrowUpRight,
  Loader2,
  RefreshCw,
  Hash,
  Eye,
  ShoppingCart,
  AlertTriangle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const monthlySales = [
  { month: "Set", vendas: 42 },
  { month: "Out", vendas: 58 },
  { month: "Nov", vendas: 65 },
  { month: "Dez", vendas: 88 },
  { month: "Jan", vendas: 72 },
  { month: "Fev", vendas: 95 },
];

const recentActivity = [
  { id: 1, type: "order", text: "Novo orcamento #1042 recebido", time: "5 min atras", icon: ShoppingCart },
  { id: 2, type: "product", text: "Catalogo atualizado com novos SKUs", time: "25 min atras", icon: Package },
  { id: 3, type: "message", text: "Nova mensagem de contato recebida", time: "1h atras", icon: MessageSquare },
  { id: 4, type: "order", text: "Orcamento #1041 aprovado", time: "3h atras", icon: ShoppingCart },
  { id: 5, type: "alert", text: "Verificacao de estoque pendente", time: "5h atras", icon: AlertTriangle },
];

export function AdminDashboard() {
  const [totalProdutos, setTotalProdutos] = useState(0);
  const [recentProdutos, setRecentProdutos] = useState<ProdutoDB[]>([]);
  const [messageCount, setMessageCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const [produtosResult, msgs] = await Promise.all([
        api.getProdutosDB(1, 10),
        api.getMessages(),
      ]);
      setTotalProdutos(produtosResult.pagination.total);
      setRecentProdutos(produtosResult.data);
      setMessageCount(msgs.filter((m) => !m.read).length);
    } catch (e) {
      console.error("Error loading dashboard data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Refresh */}
      <div className="flex justify-end">
        <button
          onClick={loadData}
          className="flex items-center gap-1.5 text-gray-500 hover:text-red-600 transition-colors px-3 py-1.5 border border-gray-200 rounded-lg"
          style={{ fontSize: "0.8rem" }}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Atualizar
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="bg-red-100 rounded-lg p-2.5">
              <Database className="w-5 h-5 text-red-600" />
            </div>
            <span
              className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-green-50 text-green-600"
              style={{ fontSize: "0.7rem", fontWeight: 500 }}
            >
              <ArrowUpRight className="w-3 h-3" />
              Supabase
            </span>
          </div>
          <p className="text-gray-800" style={{ fontSize: "1.5rem", fontWeight: 700 }}>
            {totalProdutos}
          </p>
          <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.8rem" }}>
            Pecas na tabela "produtos"
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="bg-blue-100 rounded-lg p-2.5">
              <MessageSquare className="w-5 h-5 text-blue-600" />
            </div>
            {messageCount > 0 && (
              <span
                className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-red-50 text-red-600"
                style={{ fontSize: "0.7rem", fontWeight: 500 }}
              >
                {messageCount} nova{messageCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <p className="text-gray-800" style={{ fontSize: "1.5rem", fontWeight: 700 }}>
            {messageCount}
          </p>
          <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.8rem" }}>
            Mensagens nao lidas
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="bg-green-100 rounded-lg p-2.5">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <span
              className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-green-50 text-green-600"
              style={{ fontSize: "0.7rem", fontWeight: 500 }}
            >
              <ArrowUpRight className="w-3 h-3" />
              +18%
            </span>
          </div>
          <p className="text-gray-800" style={{ fontSize: "1.5rem", fontWeight: 700 }}>
            95
          </p>
          <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.8rem" }}>
            Orcamentos este mes
          </p>
        </div>
      </div>

      {/* Charts + Activity */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Bar Chart */}
        <div className="xl:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-gray-800" style={{ fontSize: "1rem", fontWeight: 600 }}>
                Orcamentos Mensais
              </h3>
              <p className="text-gray-400" style={{ fontSize: "0.8rem" }}>
                Ultimos 6 meses
              </p>
            </div>
            <div className="flex items-center gap-1 bg-green-50 text-green-600 px-2.5 py-1 rounded-full" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
              <TrendingUp className="w-3.5 h-3.5" />
              +18%
            </div>
          </div>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlySales}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    fontSize: "0.8rem",
                  }}
                />
                <Bar dataKey="vendas" fill="#dc2626" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-gray-800" style={{ fontSize: "1rem", fontWeight: 600 }}>
              Atividade Recente
            </h3>
            {messageCount > 0 && (
              <span className="bg-red-600 text-white px-2 py-0.5 rounded-full" style={{ fontSize: "0.7rem" }}>
                {messageCount} msg{messageCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="space-y-2.5">
            {recentActivity.map((item) => (
              <div key={item.id} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                <div
                  className={`rounded-lg p-2 shrink-0 ${
                    item.type === "order"
                      ? "bg-blue-50"
                      : item.type === "message"
                      ? "bg-green-50"
                      : item.type === "alert"
                      ? "bg-amber-50"
                      : "bg-gray-100"
                  }`}
                >
                  <item.icon
                    className={`w-4 h-4 ${
                      item.type === "order"
                        ? "text-blue-600"
                        : item.type === "message"
                        ? "text-green-600"
                        : item.type === "alert"
                        ? "text-amber-600"
                        : "text-gray-600"
                    }`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-700 truncate" style={{ fontSize: "0.85rem" }}>
                    {item.text}
                  </p>
                  <p className="text-gray-400" style={{ fontSize: "0.75rem" }}>
                    {item.time}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Products from DB */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-gray-800" style={{ fontSize: "1rem", fontWeight: 600 }}>
              Ultimas Pecas no Catalogo
            </h3>
            <p className="text-gray-400" style={{ fontSize: "0.8rem" }}>
              Dados em tempo real do Supabase
            </p>
          </div>
          <span className="bg-green-50 text-green-600 px-2.5 py-1 rounded-full flex items-center gap-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
            <Database className="w-3 h-3" />
            Live
          </span>
        </div>
        {recentProdutos.length === 0 ? (
          <div className="text-center py-8">
            <Package className="w-10 h-10 mx-auto text-gray-300 mb-2" />
            <p className="text-gray-400" style={{ fontSize: "0.85rem" }}>Nenhum produto encontrado.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentProdutos.map((produto, i) => (
              <div key={produto.sku} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                    i === 0
                      ? "bg-red-600 text-white"
                      : i === 1
                      ? "bg-red-100 text-red-600"
                      : "bg-gray-100 text-gray-500"
                  }`}
                  style={{ fontSize: "0.75rem", fontWeight: 600 }}
                >
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-700 truncate" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                    {produto.titulo}
                  </p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Hash className="w-3 h-3 text-gray-400" />
                    <span className="text-gray-400 font-mono" style={{ fontSize: "0.75rem" }}>
                      {produto.sku}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => window.open(`/produto/${encodeURIComponent(produto.sku)}`, "_blank")}
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors shrink-0"
                  title="Ver no site"
                >
                  <Eye className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
