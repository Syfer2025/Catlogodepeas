import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, GripVertical, Eye, EyeOff, Loader2, Save, X, ChevronDown, ChevronUp, HelpCircle, ExternalLink } from "lucide-react";
import * as api from "../../services/api";
import { getValidAdminToken } from "./adminAuth";

var FAQ_CATEGORIES = [
  "Geral",
  "Pagamentos",
  "Frete e Entregas",
  "Garantia",
  "Produtos",
  "Trocas e Devoluções",
  "Conta e Cadastro",
  "Cupons e Promoções",
];

export function AdminFaq() {
  var [items, setItems] = useState<api.FaqItem[]>([]);
  var [loading, setLoading] = useState(true);
  var [saving, setSaving] = useState(false);
  var [error, setError] = useState<string | null>(null);
  var [success, setSuccess] = useState<string | null>(null);

  // Edit/create modal
  var [showModal, setShowModal] = useState(false);
  var [editItem, setEditItem] = useState<api.FaqItem | null>(null);
  var [formQuestion, setFormQuestion] = useState("");
  var [formAnswer, setFormAnswer] = useState("");
  var [formCategory, setFormCategory] = useState("Geral");
  var [formActive, setFormActive] = useState(true);

  // Delete confirm
  var [deleteId, setDeleteId] = useState<string | null>(null);
  var [deleting, setDeleting] = useState(false);

  var fetchItems = useCallback(async function () {
    try {
      setLoading(true);
      var token = await getValidAdminToken();
      if (!token) return;
      var data = await api.getAdminFaq(token);
      setItems(data.items || []);
    } catch (e: any) {
      setError("Erro ao carregar FAQ: " + (e.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(function () {
    fetchItems();
  }, [fetchItems]);

  function openCreate() {
    setEditItem(null);
    setFormQuestion("");
    setFormAnswer("");
    setFormCategory("Geral");
    setFormActive(true);
    setShowModal(true);
  }

  function openEdit(item: api.FaqItem) {
    setEditItem(item);
    setFormQuestion(item.question);
    setFormAnswer(item.answer);
    setFormCategory(item.category);
    setFormActive(item.active);
    setShowModal(true);
  }

  async function handleSave() {
    if (!formQuestion.trim() || !formAnswer.trim()) {
      setError("Pergunta e resposta sao obrigatorias.");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      var token = await getValidAdminToken();
      if (!token) return;

      if (editItem) {
        await api.updateFaq(token, editItem.id, {
          question: formQuestion.trim(),
          answer: formAnswer.trim(),
          category: formCategory,
          active: formActive,
        });
        setSuccess("FAQ atualizado com sucesso!");
      } else {
        await api.createFaq(token, {
          question: formQuestion.trim(),
          answer: formAnswer.trim(),
          category: formCategory,
          active: formActive,
        });
        setSuccess("FAQ criado com sucesso!");
      }
      setShowModal(false);
      fetchItems();
    } catch (e: any) {
      setError("Erro ao salvar: " + (e.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      setDeleting(true);
      var token = await getValidAdminToken();
      if (!token) return;
      await api.deleteFaq(token, deleteId);
      setSuccess("FAQ removido com sucesso!");
      setDeleteId(null);
      fetchItems();
    } catch (e: any) {
      setError("Erro ao deletar: " + (e.message || e));
    } finally {
      setDeleting(false);
    }
  }

  async function handleToggleActive(item: api.FaqItem) {
    try {
      var token = await getValidAdminToken();
      if (!token) return;
      await api.updateFaq(token, item.id, { active: !item.active });
      setItems(function (prev) {
        return prev.map(function (i) {
          return i.id === item.id ? { ...i, active: !i.active } : i;
        });
      });
    } catch (e: any) {
      setError("Erro ao alternar estado: " + (e.message || e));
    }
  }

  async function handleMove(index: number, direction: "up" | "down") {
    var newItems = [...items];
    var swapIdx = direction === "up" ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= newItems.length) return;
    var temp = newItems[index];
    newItems[index] = newItems[swapIdx];
    newItems[swapIdx] = temp;
    setItems(newItems);

    try {
      var token = await getValidAdminToken();
      if (!token) return;
      var ids = newItems.map(function (i) { return i.id; });
      await api.reorderFaq(token, ids);
    } catch (e: any) {
      setError("Erro ao reordenar: " + (e.message || e));
      fetchItems();
    }
  }

  // Auto-dismiss success
  useEffect(function () {
    if (success) {
      var t = setTimeout(function () { setSuccess(null); }, 3000);
      return function () { clearTimeout(t); };
    }
  }, [success]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-blue-400" />
            Perguntas Frequentes (FAQ)
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Gerencie as perguntas e respostas exibidas na pagina publica de FAQ.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/faq"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Ver pagina
          </a>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Nova pergunta
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg text-sm flex items-center justify-between">
          {error}
          <button onClick={function () { setError(null); }} className="text-red-400 hover:text-red-300"><X className="w-4 h-4" /></button>
        </div>
      )}
      {success && (
        <div className="bg-green-900/50 border border-green-700 text-green-200 px-4 py-3 rounded-lg text-sm">
          {success}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          <span className="ml-2 text-gray-400">Carregando...</span>
        </div>
      )}

      {/* Items list */}
      {!loading && items.length === 0 && (
        <div className="text-center py-12 bg-gray-800/50 rounded-xl border border-gray-700">
          <HelpCircle className="w-10 h-10 text-gray-500 mx-auto mb-3" />
          <p className="text-gray-400 mb-3">Nenhuma pergunta cadastrada.</p>
          <button
            onClick={openCreate}
            className="text-blue-400 hover:text-blue-300 text-sm font-medium"
          >
            Criar primeira pergunta
          </button>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="space-y-2">
          {items.map(function (item, index) {
            return (
              <div
                key={item.id}
                className={"bg-gray-800/50 rounded-lg border p-4 " + (item.active ? "border-gray-700" : "border-gray-700/50 opacity-60")}
              >
                <div className="flex items-start gap-3">
                  {/* Reorder */}
                  <div className="flex flex-col items-center gap-0.5 pt-1">
                    <button
                      onClick={function () { handleMove(index, "up"); }}
                      disabled={index === 0}
                      className="p-0.5 text-gray-500 hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Mover para cima"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <GripVertical className="w-4 h-4 text-gray-600" />
                    <button
                      onClick={function () { handleMove(index, "down"); }}
                      disabled={index === items.length - 1}
                      className="p-0.5 text-gray-500 hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Mover para baixo"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-blue-900/50 text-blue-300 border border-blue-800">
                        {item.category}
                      </span>
                      {!item.active && (
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-yellow-900/50 text-yellow-300 border border-yellow-800">
                          Inativo
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-gray-200 text-sm">{item.question}</h3>
                    <p className="text-gray-400 text-xs mt-1 line-clamp-2">{item.answer}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={function () { handleToggleActive(item); }}
                      className={"p-2 rounded-lg transition-colors " + (item.active ? "text-green-400 hover:bg-green-900/30" : "text-gray-500 hover:bg-gray-700")}
                      title={item.active ? "Desativar" : "Ativar"}
                    >
                      {item.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={function () { openEdit(item); }}
                      className="p-2 rounded-lg text-gray-400 hover:text-blue-400 hover:bg-blue-900/30 transition-colors"
                      title="Editar"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={function () { setDeleteId(item.id); }}
                      className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-900/30 transition-colors"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={function () { setShowModal(false); }}>
          <div
            className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-xl max-h-[90vh] overflow-y-auto"
            onClick={function (e) { e.stopPropagation(); }}
          >
            <div className="flex items-center justify-between p-5 border-b border-gray-700">
              <h3 className="text-lg font-bold text-gray-100">
                {editItem ? "Editar Pergunta" : "Nova Pergunta"}
              </h3>
              <button onClick={function () { setShowModal(false); }} className="text-gray-400 hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Categoria</label>
                <select
                  value={formCategory}
                  onChange={function (e) { setFormCategory(e.target.value); }}
                  className="w-full bg-gray-700 border border-gray-600 text-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {FAQ_CATEGORIES.map(function (cat) {
                    return <option key={cat} value={cat}>{cat}</option>;
                  })}
                </select>
              </div>

              {/* Question */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Pergunta *</label>
                <input
                  type="text"
                  value={formQuestion}
                  onChange={function (e) { setFormQuestion(e.target.value); }}
                  placeholder="Ex: Quais formas de pagamento voces aceitam?"
                  className="w-full bg-gray-700 border border-gray-600 text-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  maxLength={500}
                />
              </div>

              {/* Answer */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Resposta *</label>
                <textarea
                  value={formAnswer}
                  onChange={function (e) { setFormAnswer(e.target.value); }}
                  placeholder="Escreva a resposta detalhada..."
                  rows={6}
                  className="w-full bg-gray-700 border border-gray-600 text-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
                  maxLength={5000}
                />
                <p className="text-xs text-gray-500 mt-1">{formAnswer.length}/5000 caracteres</p>
              </div>

              {/* Active */}
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formActive}
                    onChange={function (e) { setFormActive(e.target.checked); }}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-600 peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
                </label>
                <span className="text-sm text-gray-300">Ativo (visivel na pagina publica)</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-700">
              <button
                onClick={function () { setShowModal(false); }}
                className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formQuestion.trim() || !formAnswer.trim()}
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editItem ? "Salvar" : "Criar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={function () { setDeleteId(null); }}>
          <div
            className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-sm p-6"
            onClick={function (e) { e.stopPropagation(); }}
          >
            <h3 className="text-lg font-bold text-gray-100 mb-2">Excluir pergunta?</h3>
            <p className="text-sm text-gray-400 mb-5">Esta acao nao pode ser desfeita.</p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={function () { setDeleteId(null); }}
                className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium disabled:opacity-50"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="bg-gray-800/30 rounded-lg border border-gray-700/50 p-4 text-xs text-gray-500">
        <p><strong className="text-gray-400">Dica:</strong> As perguntas mais frequentes devem ficar no topo. Use as setas para reordenar.
        A pagina publica inclui automaticamente FAQ Schema (JSON-LD) para SEO, ajudando o Google a exibir as perguntas diretamente nos resultados de busca.</p>
      </div>
    </div>
  );
}
