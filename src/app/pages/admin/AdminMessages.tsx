import { useState, useEffect } from "react";
import * as api from "../../services/api";
import type { Message } from "../../services/api";
import {
  MessageSquare, Mail, Phone, Clock, Eye, Trash2, X, Check,
  CheckCheck, Search, Filter, Loader2, RefreshCw,
} from "lucide-react";

interface AdminMessagesProps {
  onUpdate?: () => void;
}

export function AdminMessages({ onUpdate }: AdminMessagesProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "unread" | "read">("all");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const loadMessages = async () => {
    setLoading(true);
    try {
      const msgs = await api.getMessages();
      setMessages(msgs);
    } catch (e) {
      console.error("Error loading messages:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMessages();
  }, []);

  const filteredMessages = messages.filter((m) => {
    const matchSearch =
      !searchQuery ||
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.message.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus =
      filterStatus === "all" ||
      (filterStatus === "unread" && !m.read) ||
      (filterStatus === "read" && m.read);
    return matchSearch && matchStatus;
  });

  const unreadCount = messages.filter((m) => !m.read).length;

  const openMessage = async (msg: Message) => {
    setSelectedMessage(msg);
    if (!msg.read) {
      try {
        await api.updateMessage(msg.id, { read: true });
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, read: true } : m)));
        onUpdate?.();
      } catch (e) {
        console.error("Error marking message as read:", e);
      }
    }
  };

  const toggleRead = async (id: string) => {
    const msg = messages.find((m) => m.id === id);
    if (!msg) return;
    try {
      const updated = await api.updateMessage(id, { read: !msg.read });
      setMessages((prev) => prev.map((m) => (m.id === id ? updated : m)));
      if (selectedMessage?.id === id) {
        setSelectedMessage(updated);
      }
      onUpdate?.();
    } catch (e) {
      console.error("Error toggling read status:", e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteMessage(id);
      setMessages((prev) => prev.filter((m) => m.id !== id));
      if (selectedMessage?.id === id) setSelectedMessage(null);
      setDeleteConfirm(null);
      onUpdate?.();
    } catch (e) {
      console.error("Error deleting message:", e);
    }
  };

  const markAllRead = async () => {
    try {
      const unread = messages.filter((m) => !m.read);
      await Promise.all(unread.map((m) => api.updateMessage(m.id, { read: true })));
      setMessages((prev) => prev.map((m) => ({ ...m, read: true })));
      onUpdate?.();
    } catch (e) {
      console.error("Error marking all as read:", e);
    }
  };

  const subjectColors: Record<string, string> = {
    orcamento: "bg-blue-50 text-blue-600",
    compatibilidade: "bg-purple-50 text-purple-600",
    disponibilidade: "bg-amber-50 text-amber-600",
    troca: "bg-red-50 text-red-600",
    outro: "bg-gray-100 text-gray-600",
  };

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
          <h2 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "1.25rem", fontWeight: 700 }}>
            Mensagens
            {unreadCount > 0 && (
              <span className="bg-red-600 text-white px-2 py-0.5 rounded-full" style={{ fontSize: "0.7rem" }}>
                {unreadCount} nova{unreadCount !== 1 ? "s" : ""}
              </span>
            )}
          </h2>
          <p className="text-gray-400" style={{ fontSize: "0.85rem" }}>
            {messages.length} mensage{messages.length !== 1 ? "ns" : "m"} no Supabase
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadMessages}
            className="flex items-center gap-1.5 text-gray-500 hover:text-red-600 border border-gray-200 px-3 py-2 rounded-lg transition-colors"
            style={{ fontSize: "0.8rem" }}>
            <RefreshCw className="w-4 h-4" />
          </button>
          {unreadCount > 0 && (
            <button onClick={markAllRead}
              className="flex items-center gap-2 border border-gray-300 px-3 py-2 rounded-lg text-gray-600 hover:border-red-300 hover:text-red-600 transition-colors"
              style={{ fontSize: "0.8rem" }}>
              <CheckCheck className="w-4 h-4" /> Marcar todas como lidas
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar mensagens..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all"
              style={{ fontSize: "0.85rem" }} />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            {(["all", "unread", "read"] as const).map((status) => (
              <button key={status} onClick={() => setFilterStatus(status)}
                className={`px-3 py-2 rounded-lg transition-colors ${filterStatus === status ? "bg-red-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                style={{ fontSize: "0.8rem" }}>
                {status === "all" ? "Todas" : status === "unread" ? "Nao lidas" : "Lidas"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Messages List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filteredMessages.length === 0 ? (
          <div className="py-12 text-center">
            <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500" style={{ fontSize: "0.9rem" }}>Nenhuma mensagem encontrada</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredMessages.map((msg) => (
              <div key={msg.id} onClick={() => openMessage(msg)}
                className={`flex items-start gap-4 p-4 cursor-pointer hover:bg-gray-50 transition-colors ${!msg.read ? "bg-red-50/30" : ""}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${!msg.read ? "bg-red-600 text-white" : "bg-gray-200 text-gray-500"}`}
                  style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                  {msg.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`truncate ${!msg.read ? "text-gray-900" : "text-gray-700"}`}
                      style={{ fontSize: "0.9rem", fontWeight: !msg.read ? 600 : 400 }}>
                      {msg.name}
                    </span>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full ${subjectColors[msg.subject] || subjectColors.outro}`}
                      style={{ fontSize: "0.65rem", fontWeight: 500 }}>
                      {msg.subjectLabel}
                    </span>
                  </div>
                  <p className="text-gray-500 truncate" style={{ fontSize: "0.82rem" }}>{msg.message}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-gray-400 hidden sm:block" style={{ fontSize: "0.72rem" }}>{msg.date}</span>
                  {!msg.read && <div className="w-2.5 h-2.5 bg-red-600 rounded-full" />}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Message Detail Modal */}
      {selectedMessage && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={() => setSelectedMessage(null)}>
          <div className="bg-white rounded-xl w-full max-w-xl my-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h3 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "1.05rem", fontWeight: 600 }}>
                <MessageSquare className="w-5 h-5 text-red-600" /> Mensagem
              </h3>
              <button onClick={() => setSelectedMessage(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 bg-red-600 rounded-full flex items-center justify-center text-white" style={{ fontSize: "0.95rem", fontWeight: 600 }}>
                  {selectedMessage.name.charAt(0)}
                </div>
                <div>
                  <p className="text-gray-800" style={{ fontSize: "0.95rem", fontWeight: 600 }}>{selectedMessage.name}</p>
                  <div className="flex flex-wrap items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-gray-400" style={{ fontSize: "0.8rem" }}>
                      <Mail className="w-3.5 h-3.5" />{selectedMessage.email}
                    </span>
                    {selectedMessage.phone && (
                      <span className="flex items-center gap-1 text-gray-400" style={{ fontSize: "0.8rem" }}>
                        <Phone className="w-3.5 h-3.5" />{selectedMessage.phone}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <span className={`px-2.5 py-1 rounded-full ${subjectColors[selectedMessage.subject] || subjectColors.outro}`}
                  style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                  {selectedMessage.subjectLabel}
                </span>
                <span className="flex items-center gap-1 text-gray-400" style={{ fontSize: "0.78rem" }}>
                  <Clock className="w-3.5 h-3.5" />{selectedMessage.date}
                </span>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-gray-700" style={{ fontSize: "0.88rem", lineHeight: 1.7 }}>{selectedMessage.message}</p>
              </div>

              <div className="flex gap-2 pt-2 border-t border-gray-100">
                <a href={`mailto:${selectedMessage.email}`}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                  <Mail className="w-4 h-4" /> Responder por E-mail
                </a>
                <button onClick={() => toggleRead(selectedMessage.id)}
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                  style={{ fontSize: "0.8rem" }}>
                  {selectedMessage.read ? <Eye className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                  {selectedMessage.read ? "Nao lida" : "Lida"}
                </button>
                <button onClick={() => { setSelectedMessage(null); setDeleteConfirm(selectedMessage.id); }}
                  className="flex items-center justify-center p-2.5 border border-gray-300 rounded-lg text-gray-400 hover:text-red-600 hover:border-red-300 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="bg-red-50 w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-center text-gray-800 mb-2" style={{ fontSize: "1.1rem", fontWeight: 600 }}>Excluir Mensagem</h3>
            <p className="text-center text-gray-500 mb-5" style={{ fontSize: "0.85rem" }}>Sera removida permanentemente do Supabase.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors" style={{ fontSize: "0.85rem" }}>Cancelar</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors" style={{ fontSize: "0.85rem" }}>Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
