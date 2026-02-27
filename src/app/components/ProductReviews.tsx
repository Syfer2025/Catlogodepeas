import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Star,
  ThumbsUp,
  Send,
  Camera,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  User,
  ImageIcon,
} from "lucide-react";
import * as api from "../services/api";
import type { Review, ReviewSummary } from "../services/api";
import { supabase } from "../services/supabaseClient";
import { toast } from "sonner";

/* ═══════════════════════════════════════
   Star Rating Display (read-only)
   ═══════════════════════════════════════ */
function StarRating({ rating, size = 16 }: { rating: number; size?: number }) {
  var stars = [];
  for (var i = 1; i <= 5; i++) {
    var fill = rating >= i ? "full" : rating >= i - 0.5 ? "half" : "empty";
    stars.push(
      <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
        {/* Background star (gray) */}
        <Star
          className="absolute inset-0 text-gray-200"
          style={{ width: size, height: size }}
          fill="#e5e7eb"
          strokeWidth={0}
        />
        {/* Foreground star (yellow) */}
        {fill !== "empty" && (
          <span
            className="absolute inset-0 overflow-hidden"
            style={{ width: fill === "half" ? size / 2 : size }}
          >
            <Star
              className="text-amber-400"
              style={{ width: size, height: size }}
              fill="#fbbf24"
              strokeWidth={0}
            />
          </span>
        )}
      </span>
    );
  }
  return <span className="inline-flex items-center gap-0.5">{stars}</span>;
}

/* ═══════════════════════════════════════
   Star Rating Input (interactive)
   ═══════════════════════════════════════ */
function StarRatingInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  var [hover, setHover] = useState(0);
  var labels = ["", "Péssimo", "Ruim", "Regular", "Bom", "Excelente"];

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map(function (star) {
          var active = star <= (hover || value);
          return (
            <button
              key={star}
              type="button"
              onClick={function () { onChange(star); }}
              onMouseEnter={function () { setHover(star); }}
              onMouseLeave={function () { setHover(0); }}
              className="transition-transform hover:scale-110 focus:outline-none"
            >
              <Star
                className={active ? "text-amber-400" : "text-gray-300"}
                style={{ width: 28, height: 28 }}
                fill={active ? "#fbbf24" : "transparent"}
                strokeWidth={active ? 0 : 1.5}
              />
            </button>
          );
        })}
      </div>
      {(hover || value) > 0 && (
        <span className="text-gray-500" style={{ fontSize: "0.8rem", fontWeight: 500 }}>
          {labels[hover || value]}
        </span>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   Rating Distribution Bar
   ═══════════════════════════════════════ */
function RatingBar({ stars, count, total }: { stars: number; count: number; total: number }) {
  var pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-gray-500 shrink-0" style={{ fontSize: "0.7rem", width: 14, textAlign: "right" }}>
        {stars}
      </span>
      <Star className="text-amber-400 shrink-0" style={{ width: 10, height: 10 }} fill="#fbbf24" strokeWidth={0} />
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-amber-400 rounded-full transition-all duration-500"
          style={{ width: pct + "%" }}
        />
      </div>
      <span className="text-gray-400 shrink-0" style={{ fontSize: "0.68rem", width: 20, textAlign: "right" }}>
        {count}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════
   Review Card
   ═══════════════════════════════════════ */
function ReviewCard({ review, onHelpful, isLoggedIn }: { review: Review; onHelpful: (id: string) => void; isLoggedIn: boolean }) {
  var [imgOpen, setImgOpen] = useState<string | null>(null);
  var date = new Date(review.createdAt);
  var dateStr = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div className="border border-gray-200 rounded-lg p-3 sm:p-3.5 bg-white hover:shadow-sm transition-shadow">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-red-50 flex items-center justify-center shrink-0">
            <User className="w-3.5 h-3.5 text-red-500" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-gray-800 truncate" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                {review.userName}
              </p>
              <span className="text-gray-300 shrink-0">·</span>
              <span className="text-gray-400 shrink-0" style={{ fontSize: "0.68rem" }}>{dateStr}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <StarRating rating={review.rating} size={12} />
          {review.verified && (
            <span className="bg-green-50 text-green-600 px-1 py-0.5 rounded flex items-center gap-0.5" style={{ fontSize: "0.58rem", fontWeight: 600 }}>
              <CheckCircle2 className="w-2.5 h-2.5" /> Verificado
            </span>
          )}
        </div>
      </div>

      {/* Title */}
      {review.title && (
        <p className="text-gray-800 mb-0.5" style={{ fontSize: "0.84rem", fontWeight: 600 }}>
          {review.title}
        </p>
      )}

      {/* Comment */}
      {review.comment && (
        <p className="text-gray-600 leading-relaxed mb-2" style={{ fontSize: "0.8rem" }}>
          {review.comment}
        </p>
      )}

      {/* Images */}
      {review.images && review.images.length > 0 && (
        <div className="flex gap-1.5 mb-2 flex-wrap">
          {review.images.map(function (img, idx) {
            return (
              <button
                key={img.path || idx}
                onClick={function () { setImgOpen(img.signedUrl); }}
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-md overflow-hidden border border-gray-200 hover:border-red-300 transition-colors cursor-pointer"
              >
                <img
                  src={img.signedUrl}
                  alt={"Foto " + (idx + 1)}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <button
        onClick={function () { onHelpful(review.id); }}
        className={"flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded cursor-pointer " +
          (isLoggedIn ? "text-gray-400 hover:text-blue-600 hover:bg-blue-50" : "text-gray-300 hover:text-gray-400 hover:bg-gray-50")}
        style={{ fontSize: "0.72rem" }}
        title={isLoggedIn ? "Marcar como útil" : "Faça login para marcar como útil"}
      >
        <ThumbsUp className="w-3 h-3" />
        Útil {review.helpful > 0 ? "(" + review.helpful + ")" : ""}
      </button>

      {/* Image Lightbox */}
      {imgOpen && (
        <div
          className="fixed inset-0 bg-black/80 z-[999] flex items-center justify-center p-4"
          onClick={function () { setImgOpen(null); }}
        >
          <button
            onClick={function () { setImgOpen(null); }}
            className="absolute top-4 right-4 text-white/70 hover:text-white bg-white/10 rounded-full p-2"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={imgOpen}
            alt="Foto da avaliação"
            className="max-w-full max-h-[85vh] object-contain rounded-lg"
            onClick={function (e) { e.stopPropagation(); }}
          />
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   Review Form
   ═══════════════════════════════════════ */
function ReviewForm({
  sku,
  onSubmitted,
}: {
  sku: string;
  onSubmitted: () => void;
}) {
  var [rating, setRating] = useState(0);
  var [title, setTitle] = useState("");
  var [comment, setComment] = useState("");
  var [images, setImages] = useState<File[]>([]);
  var [previews, setPreviews] = useState<string[]>([]);
  var [submitting, setSubmitting] = useState(false);
  var [error, setError] = useState<string | null>(null);
  var fileInputRef = useRef<HTMLInputElement>(null);

  var handleAddImage = useCallback(function (e: React.ChangeEvent<HTMLInputElement>) {
    var files = e.target.files;
    if (!files) return;
    var newFiles: File[] = [];
    var newPreviews: string[] = [];
    for (var i = 0; i < files.length && images.length + newFiles.length < 3; i++) {
      var file = files[i];
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Imagem muito grande (máx. 5MB)");
        continue;
      }
      newFiles.push(file);
      newPreviews.push(URL.createObjectURL(file));
    }
    setImages(function (prev) { return prev.concat(newFiles); });
    setPreviews(function (prev) { return prev.concat(newPreviews); });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [images.length]);

  var removeImage = useCallback(function (idx: number) {
    URL.revokeObjectURL(previews[idx]);
    setImages(function (prev) { return prev.filter(function (_, i) { return i !== idx; }); });
    setPreviews(function (prev) { return prev.filter(function (_, i) { return i !== idx; }); });
  }, [previews]);

  var handleSubmit = async function (e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) {
      setError("Selecione uma nota de 1 a 5 estrelas.");
      return;
    }
    if (!comment.trim()) {
      setError("Escreva um comentário.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      var sessionResult = await supabase.auth.getSession();
      var session = sessionResult.data ? sessionResult.data.session : null;
      if (!session || !session.access_token) {
        setError("Você precisa estar logado para avaliar.");
        setSubmitting(false);
        return;
      }

      // Submit the review
      var result = await api.submitReview(session.access_token, {
        sku: sku,
        rating: rating,
        title: title.trim(),
        comment: comment.trim(),
      });

      if (!result.ok) {
        setError("Erro ao enviar avaliação.");
        setSubmitting(false);
        return;
      }

      // Upload images if any
      if (images.length > 0) {
        for (var i = 0; i < images.length; i++) {
          try {
            await api.uploadReviewImage(result.reviewId, images[i], session.access_token);
          } catch (imgErr: any) {
            console.error("[ReviewForm] Image upload error:", imgErr);
            toast.error("Erro ao enviar imagem " + (i + 1));
          }
        }
      }

      toast.success("Avaliação enviada! Ela será publicada após moderação.");
      setRating(0);
      setTitle("");
      setComment("");
      // Clean up previews
      for (var pi = 0; pi < previews.length; pi++) {
        URL.revokeObjectURL(previews[pi]);
      }
      setImages([]);
      setPreviews([]);
      onSubmitted();
    } catch (err: any) {
      console.error("[ReviewForm] Submit error:", err);
      var msg = err.message || "Erro ao enviar avaliação.";
      if (msg.indexOf("ja avaliou") !== -1 || msg.indexOf("já avaliou") !== -1) {
        toast.info("Você já avaliou este produto.");
        onSubmitted();
        return;
      }
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border border-gray-200 rounded-lg p-3.5 sm:p-4 bg-white">
      <h3 className="text-gray-800 mb-3" style={{ fontSize: "0.95rem", fontWeight: 600 }}>
        Escreva sua avaliação
      </h3>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 px-3 py-1.5 rounded-lg mb-3" style={{ fontSize: "0.78rem" }}>
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Star Rating */}
      <div className="mb-3">
        <label className="text-gray-600 block mb-1" style={{ fontSize: "0.78rem", fontWeight: 500 }}>
          Sua nota *
        </label>
        <StarRatingInput value={rating} onChange={setRating} />
      </div>

      {/* Title */}
      <div className="mb-2.5">
        <label className="text-gray-600 block mb-0.5" style={{ fontSize: "0.78rem", fontWeight: 500 }}>
          Título (opcional)
        </label>
        <input
          type="text"
          value={title}
          onChange={function (e) { setTitle(e.target.value); }}
          placeholder="Resuma sua experiência"
          maxLength={200}
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-gray-800 focus:border-red-300 focus:ring-1 focus:ring-red-200 outline-none transition-colors"
          style={{ fontSize: "0.82rem" }}
          disabled={submitting}
        />
      </div>

      {/* Comment */}
      <div className="mb-2.5">
        <label className="text-gray-600 block mb-0.5" style={{ fontSize: "0.78rem", fontWeight: 500 }}>
          Comentário *
        </label>
        <textarea
          value={comment}
          onChange={function (e) { setComment(e.target.value); }}
          placeholder="Conte o que achou do produto..."
          maxLength={2000}
          rows={3}
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-gray-800 focus:border-red-300 focus:ring-1 focus:ring-red-200 outline-none transition-colors resize-none"
          style={{ fontSize: "0.82rem" }}
          disabled={submitting}
        />
        <span className="text-gray-400 block text-right" style={{ fontSize: "0.65rem" }}>
          {comment.length}/2000
        </span>
      </div>

      {/* Image Upload */}
      <div className="mb-3">
        <label className="text-gray-600 block mb-1" style={{ fontSize: "0.78rem", fontWeight: 500 }}>
          Fotos (opcional, máx. 3)
        </label>
        <div className="flex gap-1.5 flex-wrap items-center">
          {previews.map(function (url, idx) {
            return (
              <div key={idx} className="relative w-13 h-13 rounded-md overflow-hidden border border-gray-200">
                <img src={url} alt={"Foto " + (idx + 1)} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={function () { removeImage(idx); }}
                  className="absolute top-0.5 right-0.5 bg-black/50 text-white rounded-full p-0.5 hover:bg-black/70"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            );
          })}
          {images.length < 3 && (
            <button
              type="button"
              onClick={function () { fileInputRef.current?.click(); }}
              className="w-13 h-13 rounded-md border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:text-red-500 hover:border-red-300 transition-colors"
            >
              <Camera className="w-4 h-4" />
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleAddImage}
          className="hidden"
          multiple
        />
        <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.65rem" }}>
          JPG, PNG, WebP ou GIF. Máx. 5MB cada.
        </p>
      </div>

      {/* Info */}
      <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 mb-3">
        <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
        <p className="text-amber-700" style={{ fontSize: "0.7rem" }}>
          Avaliação analisada antes da publicação. Comentários e imagens passam por moderação.
        </p>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting || rating === 0}
        className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white rounded-lg py-2 transition-colors cursor-pointer"
        style={{ fontSize: "0.82rem", fontWeight: 600 }}
      >
        {submitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Enviando...
          </>
        ) : (
          <>
            <Send className="w-4 h-4" />
            Enviar avaliação
          </>
        )}
      </button>
    </form>
  );
}

/* ═══════════════════════════════════════
   Main ProductReviews Component
   ═══════════════════════════════════════ */
export function ProductReviews({ sku }: { sku: string }) {
  var [reviews, setReviews] = useState<Review[]>([]);
  var [summary, setSummary] = useState<ReviewSummary | null>(null);
  var [loading, setLoading] = useState(true);
  var [isLoggedIn, setIsLoggedIn] = useState(false);
  var [showForm, setShowForm] = useState(false);
  var [expanded, setExpanded] = useState(true);
  var [sortBy, setSortBy] = useState<"recent" | "helpful" | "highest" | "lowest">("recent");
  var [helpedIds, setHelpedIds] = useState<Set<string>>(new Set());
  var [myReview, setMyReview] = useState<{ id: string; rating: number; status: string; createdAt: number } | null>(null);
  var [myReviewChecked, setMyReviewChecked] = useState(false);
  var [hasPurchased, setHasPurchased] = useState(false);

  // Check auth
  useEffect(function () {
    supabase.auth.getSession().then(function (res) {
      var session = res.data ? res.data.session : null;
      var loggedIn = !!(session && session.access_token);
      setIsLoggedIn(loggedIn);
      if (loggedIn && session && session.access_token) {
        // Delay slightly to avoid cold-start contention with product data + review list fetches
        var token = session.access_token;
        setTimeout(function () {
          api.checkMyReview(sku, token)
            .then(function (result) {
              if (result.hasReview && result.review) {
                setMyReview(result.review);
              }
              setHasPurchased(!!result.hasPurchased);
            })
            .catch(function () {})
            .finally(function () { setMyReviewChecked(true); });
        }, 800);
      } else {
        setMyReviewChecked(true);
      }
    });
  }, [sku]);

  // Load reviews + summary
  var loadReviews = useCallback(function () {
    setLoading(true);
    Promise.all([
      api.getProductReviews(sku),
      api.getReviewSummary(sku),
    ])
      .then(function (results) {
        setReviews(results[0].reviews || []);
        setSummary(results[1]);
      })
      .catch(function (err) {
        console.error("[ProductReviews] Load error:", err);
      })
      .finally(function () {
        setLoading(false);
      });
  }, [sku]);

  useEffect(function () {
    loadReviews();
  }, [loadReviews]);

  // Sort reviews
  var sortedReviews = (function () {
    var sorted = reviews.slice();
    if (sortBy === "helpful") {
      sorted.sort(function (a, b) { return b.helpful - a.helpful; });
    } else if (sortBy === "highest") {
      sorted.sort(function (a, b) { return b.rating - a.rating; });
    } else if (sortBy === "lowest") {
      sorted.sort(function (a, b) { return a.rating - b.rating; });
    }
    // default: recent (already sorted from API)
    return sorted;
  })();

  var handleHelpful = function (id: string) {
    if (!isLoggedIn) {
      toast.info("Faça login para marcar avaliações como úteis.", {
        action: {
          label: "Entrar",
          onClick: function () { window.location.href = "/conta"; },
        },
      });
      return;
    }
    if (helpedIds.has(id)) {
      toast.info("Você já marcou esta avaliação como útil.");
      return;
    }
    api.markReviewHelpful(id)
      .then(function (res) {
        if (res.ok) {
          setReviews(function (prev) {
            return prev.map(function (r) {
              if (r.id === id) return Object.assign({}, r, { helpful: res.helpful });
              return r;
            });
          });
          setHelpedIds(function (prev) {
            var next = new Set(prev);
            next.add(id);
            return next;
          });
        }
      })
      .catch(function () {});
  };

  var totalReviews = summary ? summary.totalReviews : 0;
  var avgRating = summary ? summary.averageRating : 0;

  return (
    <div className="mt-6">
      {/* Section Header */}
      <button
        onClick={function () { setExpanded(!expanded); }}
        className="w-full flex items-center justify-between mb-3 group cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <h2 className="text-gray-800" style={{ fontSize: "1.05rem", fontWeight: 700 }}>
            Avaliações
          </h2>
          {totalReviews > 0 && (
            <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded-full" style={{ fontSize: "0.72rem", fontWeight: 600 }}>
              {totalReviews}
            </span>
          )}
          {avgRating > 0 && (
            <span className="flex items-center gap-0.5 text-gray-500" style={{ fontSize: "0.78rem" }}>
              <Star className="w-3.5 h-3.5 text-amber-400" fill="#fbbf24" strokeWidth={0} />
              {avgRating.toFixed(1)}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400 group-hover:text-red-500 transition-colors" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-red-500 transition-colors" />
        )}
      </button>

      {expanded && (
        <div className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-gray-300 animate-spin" />
            </div>
          ) : (
            <>
              {/* Summary + Distribution */}
              {summary && totalReviews > 0 && (
                <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-3 sm:gap-4">
                    {/* Average */}
                    <div className="text-center sm:text-left sm:pr-4 sm:border-r sm:border-gray-100">
                      <p className="text-gray-800" style={{ fontSize: "2rem", fontWeight: 800, lineHeight: 1 }}>
                        {avgRating.toFixed(1)}
                      </p>
                      <StarRating rating={avgRating} size={14} />
                      <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.7rem" }}>
                        {totalReviews} {totalReviews === 1 ? "avaliação" : "avaliações"}
                      </p>
                    </div>
                    {/* Distribution bars */}
                    <div className="space-y-1">
                      {[5, 4, 3, 2, 1].map(function (s) {
                        return (
                          <RatingBar
                            key={s}
                            stars={s}
                            count={summary.distribution[s] || 0}
                            total={totalReviews}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Sort + Write button */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                {totalReviews > 1 && (
                  <select
                    value={sortBy}
                    onChange={function (e) { setSortBy(e.target.value as any); }}
                    className="border border-gray-200 rounded-md px-2.5 py-1 text-gray-600 bg-white"
                    style={{ fontSize: "0.78rem" }}
                  >
                    <option value="recent">Mais recentes</option>
                    <option value="helpful">Mais úteis</option>
                    <option value="highest">Maior nota</option>
                    <option value="lowest">Menor nota</option>
                  </select>
                )}
                {isLoggedIn && !showForm && !myReview && myReviewChecked && (
                  hasPurchased ? (
                    <button
                      onClick={function () { setShowForm(true); }}
                      className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg transition-colors ml-auto cursor-pointer"
                      style={{ fontSize: "0.78rem", fontWeight: 600 }}
                    >
                      <Star className="w-3.5 h-3.5" />
                      Avaliar produto
                    </button>
                  ) : (
                    <span className="flex items-center gap-1.5 text-gray-400 ml-auto" style={{ fontSize: "0.73rem", fontWeight: 500 }}>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Compre para poder avaliar
                    </span>
                  )
                )}
              </div>

              {/* Already reviewed banner */}
              {isLoggedIn && myReview && (
                <div className="flex items-center gap-2.5 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-green-800" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                      Você já avaliou este produto
                    </p>
                    <p className="text-green-600" style={{ fontSize: "0.7rem" }}>
                      {"Nota: " + myReview.rating + "/5 — " + (myReview.status === "approved" ? "Aprovada" : myReview.status === "pending" ? "Aguardando moderação" : "Rejeitada")}
                    </p>
                  </div>
                  <StarRating rating={myReview.rating} size={13} />
                </div>
              )}

              {/* Review Form */}
              {showForm && isLoggedIn && !myReview && (
                <ReviewForm
                  sku={sku}
                  onSubmitted={function () {
                    setShowForm(false);
                    loadReviews();
                    supabase.auth.getSession().then(function (res) {
                      var session = res.data ? res.data.session : null;
                      if (session && session.access_token) {
                        api.checkMyReview(sku, session.access_token)
                          .then(function (result) {
                            if (result.hasReview && result.review) {
                              setMyReview(result.review);
                            }
                          })
                          .catch(function () {});
                      }
                    });
                  }}
                />
              )}

              {/* Not logged in message */}
              {!isLoggedIn && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                  <p className="text-gray-600 mb-1.5" style={{ fontSize: "0.8rem" }}>
                    Faça login para avaliar este produto.
                  </p>
                  <p className="text-gray-400 mb-2" style={{ fontSize: "0.72rem" }}>
                    Somente compradores verificados podem avaliar.
                  </p>
                  <a
                    href="/conta"
                    className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg transition-colors"
                    style={{ fontSize: "0.78rem", fontWeight: 600 }}
                  >
                    <User className="w-3.5 h-3.5" />
                    Entrar
                  </a>
                </div>
              )}

              {/* Review List */}
              {sortedReviews.length > 0 ? (
                <div className="space-y-2">
                  {sortedReviews.map(function (review) {
                    return (
                      <ReviewCard
                        key={review.id}
                        review={review}
                        onHelpful={handleHelpful}
                        isLoggedIn={isLoggedIn}
                      />
                    );
                  })}
                </div>
              ) : (
                !showForm && (
                  <div className="text-center py-6">
                    <Star className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                    <p className="text-gray-500" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                      Nenhuma avaliação ainda
                    </p>
                    <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.78rem" }}>
                      Seja o primeiro a avaliar este produto!
                    </p>
                  </div>
                )
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}