import { useState, useEffect } from "react";
import * as api from "../../services/api";
import type { AuditLogEntry } from "../../services/api";
import { supabase } from "../../services/supabaseClient";
import { getValidAdminToken } from "./adminAuth";
import {
  ScrollText,
  LogIn,
  LogOut,
  Settings,
  Shield,
  Trash2,
  Search,
  Filter,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Clock,
  User,
  Monitor,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const ACTION_CONFIG: Record<string, { label: string; icon: typeof LogIn; color: string; bg: string }> = {
  login: { label: "Login", icon: LogIn, color: "text-green-600", bg: "bg-green-50" },
  logout: { label: "Logout", icon: LogOut, color: "text-orange-600", bg: "bg-orange-50" },
  login_failed: { label: "Login Falhou", icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
  password_reset: { label: "Reset Senha", icon: Shield, color: "text-blue-600", bg: "bg-blue-50" },
  password_change: { label: "Senha Alterada", icon: Shield, color: "text-purple-600", bg: "bg-purple-50" },
  config_change: { label: "Config Alterada", icon: Settings, color: "text-indigo-600", bg: "bg-indigo-50" },
  unknown: { label: "Ação", icon: ScrollText, color: "text-gray-600", bg: "bg-gray-100" },
};

function getActionConfig(action: string) {
  return ACTION_CONFIG[action] || ACTION_CONFIG.unknown;
}

function formatTimestamp(ts: number | string) {
  try {
    const d = new Date(typeof ts === "string" ? ts : ts);
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return String(ts);
  }
}

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return mins + " min atras";
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + "h atras";
  const days = Math.floor(hours / 24);
  if (days < 30) return days + "d atras";
  return Math.floor(days / 30) + " mes(es) atras";
}

export function AdminAuditLog() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const getToken = async (): Promise<string | null> => {
    try {
      return await getValidAdminToken();
    } catch {
      return null;
    }
  };

  const loadLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        setError("Sessão expirada. Faça login novamente.");
        return;
      }
      const result = await api.getAuditLogs(token);
      setLogs(result.logs || []);
    } catch (e: any) {
      console.error("Erro ao carregar logs de auditoria:", e);
      setError(e.message || "Erro ao carregar logs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const handleDelete = async (id: string) => {
    try {
      const token = await getToken();
      if (!token) return;
      await api.deleteAuditLog(token, id);
      setLogs((prev) => prev.filter((l) => l.id !== id));
      setDeleteConfirmId(null);
      if (expandedId === id) setExpandedId(null);
    } catch (e: any) {
      console.error("Erro ao deletar log:", e);
    }
  };

  const handleClearAll = async () => {
    setClearing(true);
    try {
      const token = await getToken();
      if (!token) return;
      await api.clearAuditLogs(token);
      setLogs([]);
      setClearConfirm(false);
    } catch (e: any) {
      console.error("Erro ao limpar logs:", e);
    } finally {
      setClearing(false);
    }
  };

  // Unique actions for filter
  const uniqueActions = Array.from(new Set(logs.map((l) => l.action)));

  const filteredLogs = logs.filter((l) => {
    const matchSearch =
      !searchQuery ||
      l.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.details || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchAction = filterAction === "all" || l.action === filterAction;
    return matchSearch && matchAction;
  });

  // Stats
  const totalLogins = logs.filter((l) => l.action === "login").length;
  const totalLogouts = logs.filter((l) => l.action === "logout").length;
  const totalFailed = logs.filter((l) => l.action === "login_failed").length;
  const totalOther = logs.length - totalLogins - totalLogouts - totalFailed;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2
            className="text-gray-800 flex items-center gap-2"
            style={{ fontSize: "1.25rem", fontWeight: 700 }}
          >
            <ScrollText className="w-5 h-5 text-red-600" />
            Log de Alteracoes
          </h2>
          <p className="text-gray-400" style={{ fontSize: "0.85rem" }}>
            {logs.length} registro{logs.length !== 1 ? "s" : ""} de atividade admin
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadLogs}
            className="flex items-center gap-1.5 text-gray-500 hover:text-red-600 border border-gray-200 px-3 py-2 rounded-lg transition-colors"
            style={{ fontSize: "0.8rem" }}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {logs.length > 0 && (
            <button
              onClick={() => setClearConfirm(true)}
              className="flex items-center gap-1.5 text-gray-500 hover:text-red-600 border border-gray-200 px-3 py-2 rounded-lg transition-colors"
              style={{ fontSize: "0.8rem" }}
            >
              <Trash2 className="w-4 h-4" />
              Limpar Tudo
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <p className="text-red-700" style={{ fontSize: "0.85rem" }}>
            {error}
          </p>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="bg-green-50 rounded-lg p-1.5">
              <LogIn className="w-4 h-4 text-green-600" />
            </div>
            <span className="text-gray-400" style={{ fontSize: "0.75rem" }}>
              Logins
            </span>
          </div>
          <p className="text-gray-800" style={{ fontSize: "1.3rem", fontWeight: 700 }}>
            {totalLogins}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="bg-orange-50 rounded-lg p-1.5">
              <LogOut className="w-4 h-4 text-orange-600" />
            </div>
            <span className="text-gray-400" style={{ fontSize: "0.75rem" }}>
              Logouts
            </span>
          </div>
          <p className="text-gray-800" style={{ fontSize: "1.3rem", fontWeight: 700 }}>
            {totalLogouts}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="bg-red-50 rounded-lg p-1.5">
              <AlertTriangle className="w-4 h-4 text-red-600" />
            </div>
            <span className="text-gray-400" style={{ fontSize: "0.75rem" }}>
              Falhas
            </span>
          </div>
          <p className="text-gray-800" style={{ fontSize: "1.3rem", fontWeight: 700 }}>
            {totalFailed}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="bg-indigo-50 rounded-lg p-1.5">
              <Settings className="w-4 h-4 text-indigo-600" />
            </div>
            <span className="text-gray-400" style={{ fontSize: "0.75rem" }}>
              Outros
            </span>
          </div>
          <p className="text-gray-800" style={{ fontSize: "1.3rem", fontWeight: 700 }}>
            {totalOther}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por email, nome ou acao..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all"
              style={{ fontSize: "0.85rem" }}
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-gray-400 shrink-0" />
            <button
              onClick={() => setFilterAction("all")}
              className={`px-3 py-2 rounded-lg transition-colors ${
                filterAction === "all"
                  ? "bg-red-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
              style={{ fontSize: "0.8rem" }}
            >
              Todos
            </button>
            {uniqueActions.map((action) => {
              const cfg = getActionConfig(action);
              return (
                <button
                  key={action}
                  onClick={() => setFilterAction(action)}
                  className={`px-3 py-2 rounded-lg transition-colors ${
                    filterAction === action
                      ? "bg-red-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                  style={{ fontSize: "0.8rem" }}
                >
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Log List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="py-12 text-center">
            <ScrollText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500" style={{ fontSize: "0.9rem" }}>
              {logs.length === 0
                ? "Nenhum registro de atividade ainda"
                : "Nenhum resultado encontrado"}
            </p>
            {logs.length === 0 && (
              <p className="text-gray-400 mt-1" style={{ fontSize: "0.8rem" }}>
                Os logins e logouts serão registrados automaticamente
              </p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredLogs.map((log) => {
              const cfg = getActionConfig(log.action);
              const IconComp = cfg.icon;
              const isExpanded = expandedId === log.id;

              return (
                <div key={log.id} className="group">
                  <div
                    className="flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  >
                    {/* Icon */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${cfg.bg}`}>
                      <IconComp className={`w-5 h-5 ${cfg.color}`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}
                          style={{ fontSize: "0.7rem", fontWeight: 600 }}
                        >
                          {cfg.label}
                        </span>
                        <span className="text-gray-700 truncate" style={{ fontSize: "0.88rem", fontWeight: 500 }}>
                          {log.email || log.userName || "Admin"}
                        </span>
                      </div>
                      {log.details && (
                        <p className="text-gray-500 truncate" style={{ fontSize: "0.8rem" }}>
                          {log.details}
                        </p>
                      )}
                    </div>

                    {/* Time + expand */}
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right hidden sm:block">
                        <p className="text-gray-400" style={{ fontSize: "0.72rem" }}>
                          {timeAgo(log.timestamp)}
                        </p>
                        <p className="text-gray-300" style={{ fontSize: "0.65rem" }}>
                          {formatTimestamp(log.timestamp)}
                        </p>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-4 pb-4 ml-14">
                      <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="flex items-center gap-2">
                            <User className="w-3.5 h-3.5 text-gray-400" />
                            <span className="text-gray-500" style={{ fontSize: "0.78rem" }}>
                              Usuario:
                            </span>
                            <span className="text-gray-700" style={{ fontSize: "0.78rem", fontWeight: 500 }}>
                              {log.userName || "-"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-gray-400" />
                            <span className="text-gray-500" style={{ fontSize: "0.78rem" }}>
                              Data/Hora:
                            </span>
                            <span className="text-gray-700" style={{ fontSize: "0.78rem", fontWeight: 500 }}>
                              {formatTimestamp(log.timestamp)}
                            </span>
                          </div>
                        </div>
                        {log.details && (
                          <div>
                            <span className="text-gray-500" style={{ fontSize: "0.75rem" }}>
                              Detalhes:
                            </span>
                            <p className="text-gray-700 mt-0.5" style={{ fontSize: "0.82rem" }}>
                              {log.details}
                            </p>
                          </div>
                        )}
                        {log.userAgent && (
                          <div className="flex items-start gap-2">
                            <Monitor className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                            <p className="text-gray-400 break-all" style={{ fontSize: "0.7rem" }}>
                              {log.userAgent}
                            </p>
                          </div>
                        )}
                        <div className="flex justify-end pt-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmId(log.id);
                            }}
                            className="flex items-center gap-1.5 text-gray-400 hover:text-red-600 transition-colors px-2 py-1 rounded"
                            style={{ fontSize: "0.78rem" }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Excluir
                          </button>
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

      {/* Delete single confirm modal */}
      {deleteConfirmId && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setDeleteConfirmId(null)}
        >
          <div
            className="bg-white rounded-xl p-6 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-red-50 w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <h3
              className="text-center text-gray-800 mb-2"
              style={{ fontSize: "1.1rem", fontWeight: 600 }}
            >
              Excluir Registro
            </h3>
            <p
              className="text-center text-gray-500 mb-5"
              style={{ fontSize: "0.85rem" }}
            >
              Este registro será removido permanentemente.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                style={{ fontSize: "0.85rem" }}
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                style={{ fontSize: "0.85rem" }}
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear all confirm modal */}
      {clearConfirm && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setClearConfirm(false)}
        >
          <div
            className="bg-white rounded-xl p-6 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-red-50 w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <h3
              className="text-center text-gray-800 mb-2"
              style={{ fontSize: "1.1rem", fontWeight: 600 }}
            >
              Limpar Todos os Logs
            </h3>
            <p
              className="text-center text-gray-500 mb-5"
              style={{ fontSize: "0.85rem" }}
            >
              Todos os {logs.length} registros serão removidos permanentemente.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setClearConfirm(false)}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                style={{ fontSize: "0.85rem" }}
                disabled={clearing}
              >
                Cancelar
              </button>
              <button
                onClick={handleClearAll}
                disabled={clearing}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-red-800 transition-colors flex items-center justify-center gap-2"
                style={{ fontSize: "0.85rem" }}
              >
                {clearing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Limpando...
                  </>
                ) : (
                  "Limpar Tudo"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
