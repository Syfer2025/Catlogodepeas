import React, { useState, useEffect, useCallback } from "react";
import {
  Star,
  Check,
  X,
  Trash2,
  Loader2,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  MessageSquare,
  Image as ImageIcon,
  Filter,
  RefreshCw,
  User,
  ChevronDown,
  ChevronUp,
  Search,
} from "lucide-react";
import * as api from "../../services/api";
import type { Review } from "../../services/api";
import { supabase } from "../../services/supabaseClient";
import { getValidAdminToken } from "./adminAuth";
import { toast } from "sonner";

/* ═══════════════════ Star Display ═══════════════════ */
function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(function (i) {
        return (
          <Star
            key={i}
            className={i <= rating ? "text-amber-400" : "text-gray-200"}
            style={{ width: size, height: size }}
            fill={i <= rating ? "#fbbf24" : "#e5e7eb"}
            strokeWidth={0}
          />
        );
      })}
    </span>
  );
}

/* ═══════════════════ Status Badge ═══════════════════ */
function StatusBadge({ status }: { status: string }) {
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full" style={{ fontSize: "0.7rem", fontWeight: 600 }}>
        <Clock className="w-3 h-3" /> Pendente
      </span>
    );
  }
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 bg-green-50 text-green-600 border border-green-200 px-2 py-0.5 rounded-full" style={{ fontSize: "0.7rem", fontWeight: 600 }}>
        <CheckCircle2 className="w-3 h-3" /> Aprovado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full" style={{ fontSize: "0.7rem", fontWeight: 600 }}>
      <XCircle className="w-3 h-3" /> Rejeitado
    </span>
  );
}

/* ═══════════════════ Review Detail Modal ═══════════════════ */
function ReviewDetailModal({
  review,
  onClose,
  onModerate,
  onDelete,
}: {
  review: Review;
  onClose: () => void;
  onModerate: (action: "approve" | "reject", note: string, imageActions?: Record<string, string>) => void;
  onDelete: () => void;
}) {
  var [note, setNote] = useState("");
  var [imageActions, setImageActions] = useState<Record<string, string>>({});
  var [lightboxImg, setLightboxImg] = useState<string | null>(null);
  var [confirmDelete, setConfirmDelete] = useState(false);

  var date = new Date(review.createdAt);
  var dateStr = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  var toggleImageAction = function (path: string, action: string) {
    setImageActions(function (prev) {
      var next = Object.assign({}, prev);
      if (next[path] === action) {
        delete next[path];
      } else {
        next[path] = action;
      }
      return next;
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={function (e) { e.stopPropagation(); }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h3 className="text-gray-800" style={{ fontSize: "1rem", fontWeight: 700 }}>Detalhes da avaliação</h3>
            <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.72rem" }}>ID: {review.id}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* User Info */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
              <User className="w-5 h-5 text-gray-400" />
            </div>
            <div>
              <p className="text-gray-800" style={{ fontSize: "0.85rem", fontWeight: 600 }}>{review.userName}</p>
              <p className="text-gray-400" style={{ fontSize: "0.72rem" }}>{review.userEmail || "—"}</p>
            </div>
            <div className="ml-auto text-right">
              <StatusBadge status={review.status} />
              <p className="text-gray-400 mt-1" style={{ fontSize: "0.7rem" }}>{dateStr}</p>
            </div>
          </div>

          {/* Product */}
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <span className="text-gray-500" style={{ fontSize: "0.75rem", fontWeight: 500 }}>Produto: </span>
            <span className="text-gray-700 font-mono" style={{ fontSize: "0.8rem", fontWeight: 600 }}>{review.sku}</span>
          </div>

          {/* Rating */}
          <div className="flex items-center gap-2">
            <Stars rating={review.rating} size={20} />
            <span className="text-gray-600" style={{ fontSize: "0.85rem", fontWeight: 600 }}>{review.rating}/5</span>
          </div>

          {/* Title */}
          {review.title && (
            <div>
              <p className="text-gray-500 mb-0.5" style={{ fontSize: "0.72rem", fontWeight: 500 }}>Título</p>
              <p className="text-gray-800" style={{ fontSize: "0.9rem", fontWeight: 600 }}>{review.title}</p>
            </div>
          )}

          {/* Comment */}
          <div>
            <p className="text-gray-500 mb-0.5" style={{ fontSize: "0.72rem", fontWeight: 500 }}>Comentário</p>
            <p className="text-gray-700 leading-relaxed bg-gray-50 rounded-lg px-3 py-2 border border-gray-100" style={{ fontSize: "0.85rem" }}>
              {review.comment || <span className="text-gray-400 italic">Sem comentário</span>}
            </p>
          </div>

          {/* Images with per-image moderation */}
          {review.images && review.images.length > 0 && (
            <div>
              <p className="text-gray-500 mb-2" style={{ fontSize: "0.72rem", fontWeight: 500 }}>
                Imagens ({review.images.length})
              </p>
              <div className="grid grid-cols-3 gap-3">
                {review.images.map(function (img, idx) {
                  var action = imageActions[img.path] || null;
                  return (
                    <div key={img.path || idx} className="relative">
                      <button
                        onClick={function () { setLightboxImg(img.signedUrl); }}
                        className="w-full aspect-square rounded-lg overflow-hidden border-2 border-gray-200 hover:border-blue-300 transition-colors"
                      >
                        <img
                          src={img.signedUrl}
                          alt={"Imagem " + (idx + 1)}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </button>
                      {/* Image status */}
                      <div className="absolute top-1 left-1">
                        <StatusBadge status={img.status} />
                      </div>
                      {/* Per-image actions */}
                      {review.status === "pending" && (
                        <div className="flex gap-1 mt-1">
                          <button
                            type="button"
                            onClick={function () { toggleImageAction(img.path, "approve"); }}
                            className={"flex-1 flex items-center justify-center gap-1 py-1 rounded text-xs font-medium transition-colors " +
                              (action === "approve" ? "bg-green-500 text-white" : "bg-green-50 text-green-600 hover:bg-green-100")}
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={function () { toggleImageAction(img.path, "reject"); }}
                            className={"flex-1 flex items-center justify-center gap-1 py-1 rounded text-xs font-medium transition-colors " +
                              (action === "reject" ? "bg-red-500 text-white" : "bg-red-50 text-red-600 hover:bg-red-100")}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Moderation info */}
          {review.moderatedAt && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              <p className="text-blue-600" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                Moderado por {review.moderatedBy || "admin"} em{" "}
                {new Date(review.moderatedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
              {review.moderationNote && (
                <p className="text-blue-500 mt-1" style={{ fontSize: "0.75rem" }}>Nota: {review.moderationNote}</p>
              )}
            </div>
          )}

          {/* Moderation note input */}
          {review.status === "pending" && (
            <div>
              <label className="text-gray-500 block mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                Nota de moderação (opcional)
              </label>
              <textarea
                value={note}
                onChange={function (e) { setNote(e.target.value); }}
                placeholder="Motivo da aprovação/rejeição..."
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-gray-700 resize-none"
                style={{ fontSize: "0.82rem" }}
              />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
            {review.status === "pending" && (
              <>
                <button
                  onClick={function () { onModerate("approve", note, Object.keys(imageActions).length > 0 ? imageActions : undefined); }}
                  className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white rounded-lg py-2.5 transition-colors"
                  style={{ fontSize: "0.82rem", fontWeight: 600 }}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Aprovar
                </button>
                <button
                  onClick={function () { onModerate("reject", note, Object.keys(imageActions).length > 0 ? imageActions : undefined); }}
                  className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white rounded-lg py-2.5 transition-colors"
                  style={{ fontSize: "0.82rem", fontWeight: 600 }}
                >
                  <XCircle className="w-4 h-4" />
                  Rejeitar
                </button>
              </>
            )}
            {!confirmDelete ? (
              <button
                onClick={function () { setConfirmDelete(true); }}
                className="flex items-center justify-center gap-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg py-2.5 px-4 transition-colors border border-gray-200"
                style={{ fontSize: "0.82rem", fontWeight: 500 }}
              >
                <Trash2 className="w-4 h-4" />
                Excluir
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-red-500" style={{ fontSize: "0.75rem", fontWeight: 600 }}>Confirma?</span>
                <button
                  onClick={onDelete}
                  className="bg-red-600 text-white rounded-lg px-3 py-1.5 hover:bg-red-700"
                  style={{ fontSize: "0.75rem", fontWeight: 600 }}
                >
                  Sim, excluir
                </button>
                <button
                  onClick={function () { setConfirmDelete(false); }}
                  className="text-gray-500 hover:text-gray-700 px-2 py-1.5"
                  style={{ fontSize: "0.75rem" }}
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Image Lightbox */}
      {lightboxImg && (
        <div
          className="fixed inset-0 bg-black/90 z-[999] flex items-center justify-center"
          onClick={function (e) { e.stopPropagation(); setLightboxImg(null); }}
        >
          <button
            onClick={function () { setLightboxImg(null); }}
            className="absolute top-4 right-4 text-white/70 hover:text-white bg-white/10 rounded-full p-2"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={lightboxImg}
            alt="Imagem da avaliação"
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg"
            onClick={function (e) { e.stopPropagation(); }}
          />
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   Admin Reviews Page
   ═══════════════════════════════════════ */
export function AdminReviews() {
  var [reviews, setReviews] = useState<Review[]>([]);
  var [loading, setLoading] = useState(true);
  var [statusFilter, setStatusFilter] = useState("all");
  var [searchTerm, setSearchTerm] = useState("");
  var [selectedReview, setSelectedReview] = useState<Review | null>(null);
  var [acting, setActing] = useState(false);
  var [stats, setStats] = useState<{ pending: number; approved: number; rejected: number; total: number; totalImages: number; pendingImages: number } | null>(null);

  var getToken = async function (): Promise<string | null> {
    return await getValidAdminToken();
  };

  var loadReviews = useCallback(async function () {
    setLoading(true);
    try {
      var token = await getToken();
      if (!token) return;
      var results = await Promise.all([
        api.getAdminReviews(token, statusFilter),
        api.getAdminReviewStats(token),
      ]);
      setReviews(results[0].reviews || []);
      setStats(results[1]);
    } catch (err) {
      console.error("[AdminReviews] Load error:", err);
      toast.error("Erro ao carregar avaliações");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(function () {
    loadReviews();
  }, [loadReviews]);

  var handleModerate = async function (
    reviewId: string,
    action: "approve" | "reject",
    note: string,
    imageActions?: Record<string, string>
  ) {
    setActing(true);
    try {
      var token = await getToken();
      if (!token) return;
      await api.moderateReview(token, reviewId, { action: action, note: note, imageActions: imageActions });
      toast.success(action === "approve" ? "Avaliação aprovada!" : "Avaliação rejeitada.");
      setSelectedReview(null);
      loadReviews();
    } catch (err: any) {
      toast.error(err.message || "Erro ao moderar");
    } finally {
      setActing(false);
    }
  };

  var handleDelete = async function (reviewId: string) {
    setActing(true);
    try {
      var token = await getToken();
      if (!token) return;
      await api.deleteReview(token, reviewId);
      toast.success("Avaliação excluída.");
      setSelectedReview(null);
      loadReviews();
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir");
    } finally {
      setActing(false);
    }
  };

  var handleBulkApprove = async function () {
    var pendingRevs = reviews.filter(function (r) { return r.status === "pending"; });
    if (pendingRevs.length === 0) return;
    if (!confirm("Aprovar todas as " + pendingRevs.length + " avaliações pendentes?")) return;
    setActing(true);
    try {
      var token = await getToken();
      if (!token) return;
      var success = 0;
      for (var i = 0; i < pendingRevs.length; i++) {
        try {
          await api.moderateReview(token, pendingRevs[i].id, { action: "approve" });
          success++;
        } catch (e) {
          console.error("[AdminReviews] Bulk approve error for " + pendingRevs[i].id, e);
        }
      }
      toast.success(success + " avaliações aprovadas!");
      loadReviews();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setActing(false);
    }
  };

  // Filter by search term
  var filteredReviews = reviews.filter(function (r) {
    if (!searchTerm) return true;
    var term = searchTerm.toLowerCase();
    return (
      (r.sku && r.sku.toLowerCase().indexOf(term) >= 0) ||
      (r.userName && r.userName.toLowerCase().indexOf(term) >= 0) ||
      (r.userEmail && r.userEmail.toLowerCase().indexOf(term) >= 0) ||
      (r.title && r.title.toLowerCase().indexOf(term) >= 0) ||
      (r.comment && r.comment.toLowerCase().indexOf(term) >= 0)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-gray-800" style={{ fontSize: "1.3rem", fontWeight: 700 }}>Moderação de Avaliações</h2>
          <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.8rem" }}>
            Gerencie avaliações de produtos e imagens enviadas pelos clientes.
          </p>
        </div>
        <button
          onClick={loadReviews}
          disabled={loading}
          className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-2 rounded-lg transition-colors"
          style={{ fontSize: "0.8rem", fontWeight: 500 }}
        >
          <RefreshCw className={"w-4 h-4" + (loading ? " animate-spin" : "")} />
          Atualizar
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-center">
            <p className="text-amber-600" style={{ fontSize: "1.5rem", fontWeight: 800 }}>{stats.pending}</p>
            <p className="text-amber-500" style={{ fontSize: "0.72rem", fontWeight: 500 }}>Pendentes</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-center">
            <p className="text-green-600" style={{ fontSize: "1.5rem", fontWeight: 800 }}>{stats.approved}</p>
            <p className="text-green-500" style={{ fontSize: "0.72rem", fontWeight: 500 }}>Aprovadas</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-center">
            <p className="text-red-600" style={{ fontSize: "1.5rem", fontWeight: 800 }}>{stats.rejected}</p>
            <p className="text-red-500" style={{ fontSize: "0.72rem", fontWeight: 500 }}>Rejeitadas</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-center">
            <p className="text-blue-600" style={{ fontSize: "1.5rem", fontWeight: 800 }}>{stats.pendingImages}</p>
            <p className="text-blue-500" style={{ fontSize: "0.72rem", fontWeight: 500 }}>Imagens pend.</p>
          </div>
        </div>
      )}

      {/* Filters + Search */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {[
            { value: "all", label: "Todas" },
            { value: "pending", label: "Pendentes" },
            { value: "approved", label: "Aprovadas" },
            { value: "rejected", label: "Rejeitadas" },
          ].map(function (f) {
            return (
              <button
                key={f.value}
                onClick={function () { setStatusFilter(f.value); }}
                className={"px-3 py-1.5 rounded-md transition-colors " +
                  (statusFilter === f.value
                    ? "bg-white text-gray-800 shadow-sm"
                    : "text-gray-500 hover:text-gray-700")}
                style={{ fontSize: "0.78rem", fontWeight: 500 }}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 min-w-[200px] relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={function (e) { setSearchTerm(e.target.value); }}
            placeholder="Buscar por SKU, nome, email..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-gray-700 focus:border-red-300 focus:ring-1 focus:ring-red-200 outline-none"
            style={{ fontSize: "0.82rem" }}
          />
        </div>

        {stats && stats.pending > 0 && (
          <button
            onClick={handleBulkApprove}
            disabled={acting}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
            style={{ fontSize: "0.8rem", fontWeight: 600 }}
          >
            <CheckCircle2 className="w-4 h-4" />
            Aprovar todas ({stats.pending})
          </button>
        )}
      </div>

      {/* Reviews Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-gray-300 animate-spin" />
        </div>
      ) : filteredReviews.length === 0 ? (
        <div className="text-center py-16">
          <MessageSquare className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500" style={{ fontSize: "0.9rem", fontWeight: 500 }}>
            Nenhuma avaliação encontrada
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-gray-500" style={{ fontSize: "0.72rem", fontWeight: 600 }}>Produto</th>
                  <th className="text-left px-4 py-3 text-gray-500" style={{ fontSize: "0.72rem", fontWeight: 600 }}>Usuário</th>
                  <th className="text-center px-4 py-3 text-gray-500" style={{ fontSize: "0.72rem", fontWeight: 600 }}>Nota</th>
                  <th className="text-left px-4 py-3 text-gray-500" style={{ fontSize: "0.72rem", fontWeight: 600 }}>Comentário</th>
                  <th className="text-center px-4 py-3 text-gray-500" style={{ fontSize: "0.72rem", fontWeight: 600 }}>Imagens</th>
                  <th className="text-center px-4 py-3 text-gray-500" style={{ fontSize: "0.72rem", fontWeight: 600 }}>Status</th>
                  <th className="text-center px-4 py-3 text-gray-500" style={{ fontSize: "0.72rem", fontWeight: 600 }}>Data</th>
                  <th className="text-center px-4 py-3 text-gray-500" style={{ fontSize: "0.72rem", fontWeight: 600 }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredReviews.map(function (review) {
                  var date = new Date(review.createdAt);
                  var dateStr = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
                  return (
                    <tr key={review.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono text-gray-700" style={{ fontSize: "0.78rem", fontWeight: 600 }}>{review.sku}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-gray-700 truncate max-w-[120px]" style={{ fontSize: "0.78rem" }}>{review.userName}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Stars rating={review.rating} size={12} />
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-gray-600 truncate max-w-[200px]" style={{ fontSize: "0.78rem" }}>
                          {review.title ? review.title + " — " : ""}{review.comment || "—"}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {review.images && review.images.length > 0 ? (
                          <span className="inline-flex items-center gap-1 text-blue-600" style={{ fontSize: "0.75rem" }}>
                            <ImageIcon className="w-3.5 h-3.5" />
                            {review.images.length}
                          </span>
                        ) : (
                          <span className="text-gray-300" style={{ fontSize: "0.75rem" }}>—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={review.status} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-gray-400" style={{ fontSize: "0.72rem" }}>{dateStr}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={function () { setSelectedReview(review); }}
                            className="text-gray-400 hover:text-blue-600 p-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                            title="Ver detalhes"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {review.status === "pending" && (
                            <>
                              <button
                                onClick={function () { handleModerate(review.id, "approve", ""); }}
                                className="text-gray-400 hover:text-green-600 p-1.5 rounded-lg hover:bg-green-50 transition-colors"
                                title="Aprovar"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={function () { handleModerate(review.id, "reject", ""); }}
                                className="text-gray-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                                title="Rejeitar"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-gray-100">
            {filteredReviews.map(function (review) {
              var date = new Date(review.createdAt);
              var dateStr = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
              return (
                <div key={review.id} className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <span className="font-mono text-gray-700" style={{ fontSize: "0.78rem", fontWeight: 600 }}>{review.sku}</span>
                      <p className="text-gray-500 mt-0.5" style={{ fontSize: "0.72rem" }}>{review.userName}</p>
                    </div>
                    <StatusBadge status={review.status} />
                  </div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Stars rating={review.rating} size={12} />
                    <span className="text-gray-400" style={{ fontSize: "0.7rem" }}>{dateStr}</span>
                  </div>
                  {(review.title || review.comment) && (
                    <p className="text-gray-600 truncate mb-2" style={{ fontSize: "0.78rem" }}>
                      {review.title ? review.title + " — " : ""}{review.comment || ""}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={function () { setSelectedReview(review); }}
                      className="flex items-center gap-1 text-blue-600 hover:bg-blue-50 px-2 py-1 rounded"
                      style={{ fontSize: "0.72rem", fontWeight: 600 }}
                    >
                      <Eye className="w-3.5 h-3.5" /> Detalhes
                    </button>
                    {review.status === "pending" && (
                      <>
                        <button
                          onClick={function () { handleModerate(review.id, "approve", ""); }}
                          className="flex items-center gap-1 text-green-600 hover:bg-green-50 px-2 py-1 rounded"
                          style={{ fontSize: "0.72rem", fontWeight: 600 }}
                        >
                          <Check className="w-3.5 h-3.5" /> Aprovar
                        </button>
                        <button
                          onClick={function () { handleModerate(review.id, "reject", ""); }}
                          className="flex items-center gap-1 text-red-600 hover:bg-red-50 px-2 py-1 rounded"
                          style={{ fontSize: "0.72rem", fontWeight: 600 }}
                        >
                          <X className="w-3.5 h-3.5" /> Rejeitar
                        </button>
                      </>
                    )}
                    {review.images && review.images.length > 0 && (
                      <span className="text-blue-500 flex items-center gap-0.5 ml-auto" style={{ fontSize: "0.7rem" }}>
                        <ImageIcon className="w-3 h-3" /> {review.images.length}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Total count */}
      <p className="text-gray-400 text-right" style={{ fontSize: "0.72rem" }}>
        {filteredReviews.length} avaliação(ões) exibida(s)
      </p>

      {/* Detail Modal */}
      {selectedReview && (
        <ReviewDetailModal
          review={selectedReview}
          onClose={function () { setSelectedReview(null); }}
          onModerate={function (action, note, imageActions) {
            handleModerate(selectedReview.id, action, note, imageActions);
          }}
          onDelete={function () { handleDelete(selectedReview.id); }}
        />
      )}
    </div>
  );
}
