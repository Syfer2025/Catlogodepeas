import React, { useState, useEffect, useCallback, useRef } from "react";
import * as api from "../../services/api";
import type { EmktSubscriber, EmktTemplate, EmktCampaign, EmktSendLog, EmktConfig } from "../../services/api";
import { supabase } from "../../services/supabaseClient";
import { getValidAdminToken } from "./adminAuth";
import {
  Mail,
  Plus,
  Trash2,
  Edit3,
  Send,
  Users,
  FileText,
  BarChart3,
  Settings,
  Loader2,
  RefreshCw,
  Search,
  X,
  Check,
  AlertTriangle,
  Copy,
  Eye,
  Upload,
  Tag,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Inbox,
  Zap,
  TestTube,
  AlertCircle,
} from "lucide-react";

type SubTab = "campaigns" | "subscribers" | "templates" | "history" | "config";

async function getToken(): Promise<string> {
  return await getValidAdminToken() || "";
}

function fmtDate(ts: number | null) {
  if (!ts) return "-";
  try {
    return new Date(ts).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(ts);
  }
}

function StatusBadge({ status }: { status: string }) {
  if (status === "sent")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200" style={{ fontSize: "0.7rem", fontWeight: 600 }}>
        <CheckCircle2 className="w-3 h-3" /> Enviada
      </span>
    );
  if (status === "sending")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200" style={{ fontSize: "0.7rem", fontWeight: 600 }}>
        <Loader2 className="w-3 h-3 animate-spin" /> Enviando
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200" style={{ fontSize: "0.7rem", fontWeight: 600 }}>
      <Edit3 className="w-3 h-3" /> Rascunho
    </span>
  );
}

// ====================================================
// Campaigns Tab
// ====================================================
function CampaignsPanel() {
  const [campaigns, setCampaigns] = useState<EmktCampaign[]>([]);
  const [templates, setTemplates] = useState<EmktTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editor state
  const [editing, setEditing] = useState<EmktCampaign | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [htmlBody, setHtmlBody] = useState("");
  const [senderName, setSenderName] = useState("Carretão Auto Peças");
  const [senderEmail, setSenderEmail] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [targetTags, setTargetTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  // Send state
  const [sending, setSending] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Test email
  const [testCampaignId, setTestCampaignId] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Confirm send dialog
  const [confirmSendId, setConfirmSendId] = useState<string | null>(null);

  // Preview
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const [cmpRes, tplRes] = await Promise.all([
        api.getEmktCampaigns(token),
        api.getEmktTemplates(token),
      ]);
      setCampaigns(cmpRes.campaigns || []);
      setTemplates(tplRes.templates || []);
    } catch (e: any) {
      setError(e.message || "Erro ao carregar campanhas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setName("");
    setSubject("");
    setHtmlBody("");
    setSenderName("Carretão Auto Peças");
    setSenderEmail("");
    setReplyTo("");
    setTemplateId(null);
    setTargetTags([]);
    setTagInput("");
    setEditing(null);
  };

  const openCreate = () => {
    resetForm();
    setShowEditor(true);
  };

  const openEdit = (c: EmktCampaign) => {
    setEditing(c);
    setName(c.name);
    setSubject(c.subject);
    setHtmlBody(c.htmlBody);
    setSenderName(c.senderName);
    setSenderEmail(c.senderEmail);
    setReplyTo(c.replyTo);
    setTemplateId(c.templateId);
    setTargetTags(c.targetTags || []);
    setShowEditor(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const token = await getToken();
      const data = { name, subject, htmlBody, senderName, senderEmail, replyTo, templateId, targetTags };
      if (editing) {
        await api.updateEmktCampaign(token, editing.id, data);
      } else {
        await api.createEmktCampaign(token, data);
      }
      setShowEditor(false);
      resetForm();
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta campanha?")) return;
    try {
      const token = await getToken();
      await api.deleteEmktCampaign(token, id);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const token = await getToken();
      await api.duplicateEmktCampaign(token, id);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleSend = async (id: string) => {
    setSending(id);
    setSendResult(null);
    try {
      const token = await getToken();
      const res = await api.sendEmktCampaign(token, id);
      setSendResult({
        ok: true,
        message: "Enviada com sucesso! " + res.totalSent + " de " + res.totalRecipients + " emails enviados." +
          (res.totalFailed > 0 ? " " + res.totalFailed + " falharam." : ""),
      });
      await load();
    } catch (e: any) {
      setSendResult({ ok: false, message: e.message || "Erro ao enviar" });
    } finally {
      setSending(null);
      setConfirmSendId(null);
    }
  };

  const handleTestSend = async () => {
    if (!testCampaignId || !testEmail.trim()) return;
    setTestSending(true);
    setTestResult(null);
    try {
      const token = await getToken();
      await api.sendEmktTestEmail(token, testCampaignId, testEmail.trim());
      setTestResult("Email de teste enviado com sucesso!");
    } catch (e: any) {
      setTestResult("Erro: " + (e.message || "Falha ao enviar teste"));
    } finally {
      setTestSending(false);
    }
  };

  const applyTemplate = (tplId: string) => {
    setTemplateId(tplId);
    const tpl = templates.find((t) => t.id === tplId);
    if (tpl) {
      if (!subject.trim()) setSubject(tpl.subject);
      if (!htmlBody.trim()) setHtmlBody(tpl.htmlBody);
    }
  };

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && targetTags.indexOf(t) === -1) {
      setTargetTags([...targetTags, t]);
    }
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    setTargetTags(targetTags.filter((t) => t !== tag));
  };

  if (showEditor) {
    return (
      <div>
        <button
          onClick={() => { setShowEditor(false); resetForm(); }}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4 transition-colors"
          style={{ fontSize: "0.85rem" }}
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para campanhas
        </button>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 bg-gray-50">
            <h3 className="text-gray-900" style={{ fontSize: "1.05rem", fontWeight: 600 }}>
              {editing ? "Editar Campanha" : "Nova Campanha"}
            </h3>
          </div>
          <div className="p-6 space-y-5">
            {/* Name */}
            <div>
              <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Nome da Campanha *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Promoção de Verão 2026"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                style={{ fontSize: "0.85rem" }}
              />
            </div>

            {/* Subject */}
            <div>
              <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Assunto do Email *</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Ex: Descontos imperdíveis em pecas automotivas!"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                style={{ fontSize: "0.85rem" }}
              />
            </div>

            {/* Sender info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Nome do Remetente</label>
                <input
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder="Carretão Auto Peças"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                  style={{ fontSize: "0.85rem" }}
                />
              </div>
              <div>
                <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Email do Remetente</label>
                <input
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                  placeholder="contato@suaempresa.com"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                  style={{ fontSize: "0.85rem" }}
                />
              </div>
              <div>
                <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Responder Para</label>
                <input
                  value={replyTo}
                  onChange={(e) => setReplyTo(e.target.value)}
                  placeholder="contato@suaempresa.com"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                  style={{ fontSize: "0.85rem" }}
                />
              </div>
            </div>

            {/* Template selector */}
            {templates.length > 0 && (
              <div>
                <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Template (opcional)</label>
                <select
                  value={templateId || ""}
                  onChange={(e) => applyTemplate(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                  style={{ fontSize: "0.85rem" }}
                >
                  <option value="">Sem template (HTML personalizado)</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Target tags */}
            <div>
              <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                Tags de Segmentacao
                <span className="text-gray-400 font-normal ml-1">(vazio = todos os assinantes)</span>
              </label>
              <div className="flex gap-2">
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                  placeholder="Digite uma tag e pressione Enter"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                  style={{ fontSize: "0.85rem" }}
                />
                <button onClick={addTag} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              {targetTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {targetTags.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200" style={{ fontSize: "0.7rem" }}>
                      <Tag className="w-3 h-3" />
                      {tag}
                      <button onClick={() => removeTag(tag)} className="hover:text-red-600">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* HTML body */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-gray-700" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                  Conteúdo HTML
                </label>
                <button
                  onClick={() => setPreviewHtml(htmlBody)}
                  className="text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
                  style={{ fontSize: "0.75rem" }}
                >
                  <Eye className="w-3.5 h-3.5" />
                  Pré-visualizar
                </button>
              </div>
              <p className="text-gray-400 mb-2" style={{ fontSize: "0.7rem" }}>
                Use {"{{nome}}"} e {"{{email}}"} para personalizar o conteúdo para cada destinatário.
              </p>
              <textarea
                value={htmlBody}
                onChange={(e) => setHtmlBody(e.target.value)}
                rows={14}
                placeholder={"<html>\n<body>\n  <h1>Ola {{nome}}!</h1>\n  <p>Confira nossas novidades...</p>\n</body>\n</html>"}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 font-mono focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none resize-y"
                style={{ fontSize: "0.8rem" }}
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
              <button
                onClick={() => { setShowEditor(false); resetForm(); }}
                className="px-4 py-2.5 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg transition-colors"
                style={{ fontSize: "0.85rem" }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !name.trim()}
                className="px-6 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white rounded-lg flex items-center gap-2 transition-colors"
                style={{ fontSize: "0.85rem", fontWeight: 600 }}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {editing ? "Salvar Alteracoes" : "Criar Campanha"}
              </button>
            </div>
          </div>
        </div>

        {/* Preview Modal */}
        {previewHtml !== null && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setPreviewHtml(null)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
                <h4 className="text-gray-900" style={{ fontSize: "0.95rem", fontWeight: 600 }}>Pré-visualização</h4>
                <button onClick={() => setPreviewHtml(null)} className="text-gray-400 hover:text-gray-700">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-1">
                <iframe
                  srcDoc={previewHtml || "<p>Conteudo vazio</p>"}
                  className="w-full h-full min-h-[400px] border-0"
                  title="preview"
                  sandbox="allow-same-origin"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-gray-900" style={{ fontSize: "1rem", fontWeight: 600 }}>Campanhas</h3>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <RefreshCw className={"w-4 h-4" + (loading ? " animate-spin" : "")} />
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
            style={{ fontSize: "0.85rem", fontWeight: 600 }}
          >
            <Plus className="w-4 h-4" />
            Nova Campanha
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700" style={{ fontSize: "0.8rem" }}>
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {sendResult && (
        <div className={"mb-4 p-3 border rounded-lg flex items-center gap-2 " + (sendResult.ok ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700")} style={{ fontSize: "0.8rem" }}>
          {sendResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
          {sendResult.message}
          <button onClick={() => setSendResult(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-red-600 animate-spin" />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500" style={{ fontSize: "0.9rem", fontWeight: 500 }}>Nenhuma campanha criada</p>
          <p className="text-gray-400 mt-1" style={{ fontSize: "0.8rem" }}>Crie sua primeira campanha de email marketing</p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <div key={c.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-gray-900 truncate" style={{ fontSize: "0.9rem", fontWeight: 600 }}>{c.name}</h4>
                      <StatusBadge status={c.status} />
                    </div>
                    <p className="text-gray-500 truncate" style={{ fontSize: "0.8rem" }}>
                      {c.subject || "Sem assunto"}
                    </p>
                    <div className="flex items-center gap-4 mt-2">
                      <span className="text-gray-400 flex items-center gap-1" style={{ fontSize: "0.7rem" }}>
                        <Clock className="w-3 h-3" />
                        Criada: {fmtDate(c.createdAt)}
                      </span>
                      {c.sentAt && (
                        <span className="text-green-600 flex items-center gap-1" style={{ fontSize: "0.7rem" }}>
                          <Send className="w-3 h-3" />
                          Enviada: {fmtDate(c.sentAt)}
                        </span>
                      )}
                      {c.totalSent > 0 && (
                        <span className="text-blue-600 flex items-center gap-1" style={{ fontSize: "0.7rem" }}>
                          <Users className="w-3 h-3" />
                          {c.totalSent} enviados
                          {c.totalFailed > 0 && <span className="text-red-500"> / {c.totalFailed} falhas</span>}
                        </span>
                      )}
                    </div>
                    {c.targetTags && c.targetTags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {c.targetTags.map((tag) => (
                          <span key={tag} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100" style={{ fontSize: "0.65rem" }}>
                            <Tag className="w-2.5 h-2.5" />{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {c.status === "draft" && (
                      <>
                        <button
                          onClick={() => setTestCampaignId(c.id)}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Enviar teste"
                        >
                          <TestTube className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setConfirmSendId(c.id)}
                          disabled={sending === c.id}
                          className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="Enviar campanha"
                        >
                          {sending === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </button>
                        <button onClick={() => openEdit(c)} className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title="Editar">
                          <Edit3 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    <button onClick={() => handleDuplicate(c.id)} className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors" title="Duplicar">
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirm Send Dialog */}
      {confirmSendId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setConfirmSendId(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 text-center">
              <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-7 h-7 text-amber-600" />
              </div>
              <h4 className="text-gray-900 mb-2" style={{ fontSize: "1rem", fontWeight: 600 }}>Confirmar Envio</h4>
              <p className="text-gray-500 mb-1" style={{ fontSize: "0.85rem" }}>
                Tem certeza que deseja enviar esta campanha?
              </p>
              <p className="text-gray-400" style={{ fontSize: "0.75rem" }}>
                Esta ação não pode ser desfeita. Os e-mails serão enviados para todos os assinantes ativos{campaigns.find((c) => c.id === confirmSendId)?.targetTags?.length ? " com as tags selecionadas" : ""}.
              </p>
              <div className="flex items-center justify-center gap-3 mt-6">
                <button
                  onClick={() => setConfirmSendId(null)}
                  className="px-5 py-2.5 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                  style={{ fontSize: "0.85rem" }}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleSend(confirmSendId)}
                  disabled={!!sending}
                  className="px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white rounded-lg flex items-center gap-2 transition-colors"
                  style={{ fontSize: "0.85rem", fontWeight: 600 }}
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Sim, Enviar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Test Email Dialog */}
      {testCampaignId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setTestCampaignId(null); setTestResult(null); }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h4 className="text-gray-900" style={{ fontSize: "0.95rem", fontWeight: 600 }}>Enviar Email de Teste</h4>
              <button onClick={() => { setTestCampaignId(null); setTestResult(null); }} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Email de destino</label>
              <input
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                style={{ fontSize: "0.85rem" }}
              />
              {testResult && (
                <p className={"mt-3 " + (testResult.startsWith("Erro") ? "text-red-600" : "text-green-600")} style={{ fontSize: "0.8rem" }}>
                  {testResult}
                </p>
              )}
              <div className="flex justify-end gap-3 mt-5">
                <button onClick={() => { setTestCampaignId(null); setTestResult(null); }} className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50" style={{ fontSize: "0.85rem" }}>
                  Cancelar
                </button>
                <button
                  onClick={handleTestSend}
                  disabled={testSending || !testEmail.trim()}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg flex items-center gap-2 transition-colors"
                  style={{ fontSize: "0.85rem", fontWeight: 600 }}
                >
                  {testSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube className="w-4 h-4" />}
                  Enviar Teste
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ====================================================
// Subscribers Tab
// ====================================================
function SubscribersPanel() {
  const [subs, setSubs] = useState<EmktSubscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addName, setAddName] = useState("");
  const [addTags, setAddTags] = useState("");
  const [adding, setAdding] = useState(false);

  // Import
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await api.getEmktSubscribers(token);
      setSubs(res.subscribers || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!addEmail.trim()) return;
    setAdding(true);
    try {
      const token = await getToken();
      const tags = addTags.trim() ? addTags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean) : [];
      await api.addEmktSubscriber(token, { email: addEmail.trim(), name: addName.trim(), tags });
      setAddEmail("");
      setAddName("");
      setAddTags("");
      setShowAdd(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remover este assinante?")) return;
    try {
      const token = await getToken();
      await api.deleteEmktSubscriber(token, id);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleToggleActive = async (sub: EmktSubscriber) => {
    try {
      const token = await getToken();
      await api.updateEmktSubscriber(token, sub.id, { active: !sub.active });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleImport = async () => {
    if (!importText.trim()) return;
    setImporting(true);
    setImportResult(null);
    try {
      const lines = importText.trim().split("\n").filter(Boolean);
      const subscribers: Array<{ email: string; name?: string; tags?: string[] }> = [];
      for (const line of lines) {
        const parts = line.split(/[;,\t]/).map((p) => p.trim());
        const email = parts[0] || "";
        const name = parts[1] || "";
        const tags = parts[2] ? parts[2].split("|").map((t) => t.trim().toLowerCase()).filter(Boolean) : [];
        if (email && email.indexOf("@") >= 0) {
          subscribers.push({ email, name, tags });
        }
      }
      if (subscribers.length === 0) {
        setImportResult("Nenhum e-mail válido encontrado");
        setImporting(false);
        return;
      }
      const token = await getToken();
      const res = await api.importEmktSubscribers(token, subscribers);
      setImportResult(res.imported + " importados, " + res.skipped + " ignorados (ja existentes)");
      setImportText("");
      await load();
    } catch (e: any) {
      setImportResult("Erro: " + e.message);
    } finally {
      setImporting(false);
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setImportText(text);
    setShowImport(true);
    if (fileRef.current) fileRef.current.value = "";
  };

  const filtered = subs.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return s.email.toLowerCase().indexOf(q) >= 0 || (s.name || "").toLowerCase().indexOf(q) >= 0;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h3 className="text-gray-900" style={{ fontSize: "1rem", fontWeight: 600 }}>
          Assinantes
          <span className="text-gray-400 font-normal ml-2" style={{ fontSize: "0.8rem" }}>({subs.length})</span>
        </h3>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <RefreshCw className={"w-4 h-4" + (loading ? " animate-spin" : "")} />
          </button>
          <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors" style={{ fontSize: "0.8rem" }}>
            <Upload className="w-4 h-4" />
            Importar CSV
            <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileImport} />
          </label>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
            style={{ fontSize: "0.8rem" }}
          >
            <FileText className="w-4 h-4" />
            Colar Lista
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
            style={{ fontSize: "0.85rem", fontWeight: 600 }}
          >
            <Plus className="w-4 h-4" />
            Adicionar
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por email ou nome..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
          style={{ fontSize: "0.85rem" }}
        />
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700" style={{ fontSize: "0.8rem" }}>
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-red-600 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500" style={{ fontSize: "0.9rem", fontWeight: 500 }}>
            {search ? "Nenhum assinante encontrado" : "Nenhum assinante cadastrado"}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-gray-500" style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Email</th>
                  <th className="text-left px-4 py-3 text-gray-500" style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Nome</th>
                  <th className="text-left px-4 py-3 text-gray-500" style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Tags</th>
                  <th className="text-center px-4 py-3 text-gray-500" style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</th>
                  <th className="text-center px-4 py-3 text-gray-500" style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Cadastro</th>
                  <th className="text-center px-4 py-3 text-gray-500" style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-900" style={{ fontSize: "0.82rem" }}>{s.email}</td>
                    <td className="px-4 py-3 text-gray-600" style={{ fontSize: "0.82rem" }}>{s.name || "-"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(s.tags || []).map((tag) => (
                          <span key={tag} className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100" style={{ fontSize: "0.65rem" }}>{tag}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggleActive(s)}
                        className={"px-2 py-0.5 rounded-full border " + (s.active ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-100 text-gray-500 border-gray-200")}
                        style={{ fontSize: "0.7rem", fontWeight: 500 }}
                      >
                        {s.active ? "Ativo" : "Inativo"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-400" style={{ fontSize: "0.75rem" }}>{fmtDate(s.createdAt)}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => handleDelete(s.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Subscriber Dialog */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h4 className="text-gray-900" style={{ fontSize: "0.95rem", fontWeight: 600 }}>Adicionar Assinante</h4>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-gray-700 mb-1" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Email *</label>
                <input value={addEmail} onChange={(e) => setAddEmail(e.target.value)} placeholder="email@exemplo.com" className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-red-500 outline-none" style={{ fontSize: "0.85rem" }} />
              </div>
              <div>
                <label className="block text-gray-700 mb-1" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Nome</label>
                <input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Nome do contato" className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-red-500 outline-none" style={{ fontSize: "0.85rem" }} />
              </div>
              <div>
                <label className="block text-gray-700 mb-1" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Tags</label>
                <input value={addTags} onChange={(e) => setAddTags(e.target.value)} placeholder="cliente, vip (separar com virgula)" className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-red-500 outline-none" style={{ fontSize: "0.85rem" }} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50" style={{ fontSize: "0.85rem" }}>Cancelar</button>
                <button onClick={handleAdd} disabled={adding || !addEmail.trim()} className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white rounded-lg flex items-center gap-2 transition-colors" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                  {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Adicionar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Dialog */}
      {showImport && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setShowImport(false); setImportResult(null); }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h4 className="text-gray-900" style={{ fontSize: "0.95rem", fontWeight: 600 }}>Importar Assinantes</h4>
              <button onClick={() => { setShowImport(false); setImportResult(null); }} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6">
              <p className="text-gray-500 mb-3" style={{ fontSize: "0.8rem" }}>
                Cole a lista de emails no formato: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-red-600">email;nome;tag1|tag2</code>
              </p>
              <p className="text-gray-400 mb-3" style={{ fontSize: "0.72rem" }}>
                Separadores aceitos: virgula, ponto-e-virgula ou tab. Uma linha por contato.
              </p>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={8}
                placeholder={"joao@email.com;Joao Silva;cliente|vip\nmaria@email.com;Maria;newsletter"}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 font-mono focus:ring-2 focus:ring-red-500 outline-none resize-y"
                style={{ fontSize: "0.8rem" }}
              />
              {importResult && (
                <p className={"mt-3 " + (importResult.startsWith("Erro") ? "text-red-600" : "text-green-600")} style={{ fontSize: "0.8rem" }}>
                  {importResult}
                </p>
              )}
              <div className="flex justify-end gap-3 mt-5">
                <button onClick={() => { setShowImport(false); setImportResult(null); }} className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50" style={{ fontSize: "0.85rem" }}>Cancelar</button>
                <button onClick={handleImport} disabled={importing || !importText.trim()} className="px-5 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white rounded-lg flex items-center gap-2 transition-colors" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                  {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Importar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ====================================================
// Templates Tab
// ====================================================
function TemplatesPanel() {
  const [templates, setTemplates] = useState<EmktTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editor
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<EmktTemplate | null>(null);
  const [tplName, setTplName] = useState("");
  const [tplSubject, setTplSubject] = useState("");
  const [tplHtml, setTplHtml] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await api.getEmktTemplates(token);
      setTemplates(res.templates || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setTplName("");
    setTplSubject("");
    setTplHtml("");
    setEditing(null);
  };

  const openCreate = () => {
    resetForm();
    setShowEditor(true);
  };

  const openEdit = (t: EmktTemplate) => {
    setEditing(t);
    setTplName(t.name);
    setTplSubject(t.subject);
    setTplHtml(t.htmlBody);
    setShowEditor(true);
  };

  const handleSave = async () => {
    if (!tplName.trim()) return;
    setSaving(true);
    try {
      const token = await getToken();
      if (editing) {
        await api.updateEmktTemplate(token, editing.id, { name: tplName, subject: tplSubject, htmlBody: tplHtml });
      } else {
        await api.createEmktTemplate(token, { name: tplName, subject: tplSubject, htmlBody: tplHtml });
      }
      setShowEditor(false);
      resetForm();
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este template?")) return;
    try {
      const token = await getToken();
      await api.deleteEmktTemplate(token, id);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (showEditor) {
    return (
      <div>
        <button onClick={() => { setShowEditor(false); resetForm(); }} className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4 transition-colors" style={{ fontSize: "0.85rem" }}>
          <ArrowLeft className="w-4 h-4" /> Voltar para templates
        </button>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 bg-gray-50">
            <h3 className="text-gray-900" style={{ fontSize: "1.05rem", fontWeight: 600 }}>
              {editing ? "Editar Template" : "Novo Template"}
            </h3>
          </div>
          <div className="p-6 space-y-5">
            <div>
              <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Nome do Template *</label>
              <input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Ex: Newsletter Mensal" className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-red-500 outline-none" style={{ fontSize: "0.85rem" }} />
            </div>
            <div>
              <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Assunto Padrão</label>
              <input value={tplSubject} onChange={(e) => setTplSubject(e.target.value)} placeholder="Assunto que será sugerido ao usar este template" className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-red-500 outline-none" style={{ fontSize: "0.85rem" }} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-gray-700" style={{ fontSize: "0.8rem", fontWeight: 600 }}>HTML do Template</label>
                <button onClick={() => setPreviewHtml(tplHtml)} className="text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors" style={{ fontSize: "0.75rem" }}>
                  <Eye className="w-3.5 h-3.5" /> Pré-visualizar
                </button>
              </div>
              <p className="text-gray-400 mb-2" style={{ fontSize: "0.7rem" }}>
                Use {"{{nome}}"} e {"{{email}}"} para personalizacao automatica.
              </p>
              <textarea
                value={tplHtml}
                onChange={(e) => setTplHtml(e.target.value)}
                rows={16}
                placeholder={"<!DOCTYPE html>\n<html>\n<head>\n  <meta charset=\"UTF-8\">\n</head>\n<body style=\"font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;\">\n  <div style=\"background: #dc2626; padding: 20px; text-align: center;\">\n    <h1 style=\"color: white; margin: 0;\">Carretão Auto Peças</h1>\n  </div>\n  <div style=\"padding: 30px;\">\n    <h2>Olá {{nome}}!</h2>\n    <p>Seu conteúdo aqui...</p>\n  </div>\n  <div style=\"background: #f3f4f6; padding: 15px; text-align: center; font-size: 12px; color: #666;\">\n    <p>Carretão Auto Peças - Todos os direitos reservados</p>\n  </div>\n</body>\n</html>"}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 font-mono focus:ring-2 focus:ring-red-500 outline-none resize-y"
                style={{ fontSize: "0.8rem" }}
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
              <button onClick={() => { setShowEditor(false); resetForm(); }} className="px-4 py-2.5 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg transition-colors" style={{ fontSize: "0.85rem" }}>Cancelar</button>
              <button onClick={handleSave} disabled={saving || !tplName.trim()} className="px-6 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white rounded-lg flex items-center gap-2 transition-colors" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {editing ? "Salvar" : "Criar Template"}
              </button>
            </div>
          </div>
        </div>

        {/* Preview Modal */}
        {previewHtml !== null && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setPreviewHtml(null)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
                <h4 className="text-gray-900" style={{ fontSize: "0.95rem", fontWeight: 600 }}>Pré-visualização</h4>
                <button onClick={() => setPreviewHtml(null)} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex-1 overflow-auto p-1">
                <iframe srcDoc={previewHtml || "<p>Vazio</p>"} className="w-full h-full min-h-[400px] border-0" title="preview" sandbox="allow-same-origin" />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-gray-900" style={{ fontSize: "1rem", fontWeight: 600 }}>Templates</h3>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <RefreshCw className={"w-4 h-4" + (loading ? " animate-spin" : "")} />
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
            <Plus className="w-4 h-4" /> Novo Template
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700" style={{ fontSize: "0.8rem" }}>
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-red-600 animate-spin" />
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500" style={{ fontSize: "0.9rem", fontWeight: 500 }}>Nenhum template criado</p>
          <p className="text-gray-400 mt-1" style={{ fontSize: "0.8rem" }}>Crie templates para reutilizar em suas campanhas</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <div key={t.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
              <div className="p-4">
                <h4 className="text-gray-900 truncate mb-1" style={{ fontSize: "0.9rem", fontWeight: 600 }}>{t.name}</h4>
                <p className="text-gray-500 truncate mb-2" style={{ fontSize: "0.8rem" }}>{t.subject || "Sem assunto padrão"}</p>
                <p className="text-gray-400" style={{ fontSize: "0.7rem" }}>Atualizado: {fmtDate(t.updatedAt)}</p>
              </div>
              <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
                <button onClick={() => setPreviewHtml(t.htmlBody)} className="text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors" style={{ fontSize: "0.75rem" }}>
                  <Eye className="w-3.5 h-3.5" /> Visualizar
                </button>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(t)} className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors">
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(t.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview Modal (when not in editor) */}
      {previewHtml !== null && !showEditor && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setPreviewHtml(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <h4 className="text-gray-900" style={{ fontSize: "0.95rem", fontWeight: 600 }}>Pré-visualização</h4>
              <button onClick={() => setPreviewHtml(null)} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-auto p-1">
              <iframe srcDoc={previewHtml || "<p>Vazio</p>"} className="w-full h-full min-h-[400px] border-0" title="preview" sandbox="allow-same-origin" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ====================================================
// History Tab
// ====================================================
function HistoryPanel() {
  const [logs, setLogs] = useState<EmktSendLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await api.getEmktSendLogs(token);
      setLogs(res.logs || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este registro?")) return;
    try {
      const token = await getToken();
      await api.deleteEmktSendLog(token, id);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-gray-900" style={{ fontSize: "1rem", fontWeight: 600 }}>Historico de Envios</h3>
        <button onClick={load} disabled={loading} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
          <RefreshCw className={"w-4 h-4" + (loading ? " animate-spin" : "")} />
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700" style={{ fontSize: "0.8rem" }}>
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-red-600 animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500" style={{ fontSize: "0.9rem", fontWeight: 500 }}>Nenhum envio realizado</p>
          <p className="text-gray-400 mt-1" style={{ fontSize: "0.8rem" }}>Os registros de envio aparecerao aqui</p>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => (
            <div key={log.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h4 className="text-gray-900 truncate" style={{ fontSize: "0.9rem", fontWeight: 600 }}>{log.campaignName}</h4>
                    <p className="text-gray-500 truncate" style={{ fontSize: "0.8rem" }}>{log.subject}</p>
                    <div className="flex items-center gap-4 mt-2 flex-wrap">
                      <span className="text-gray-400 flex items-center gap-1" style={{ fontSize: "0.72rem" }}>
                        <Clock className="w-3 h-3" /> {fmtDate(log.sentAt)}
                      </span>
                      <span className="text-blue-600 flex items-center gap-1" style={{ fontSize: "0.72rem" }}>
                        <Users className="w-3 h-3" /> {log.totalRecipients} destinatarios
                      </span>
                      <span className="text-green-600 flex items-center gap-1" style={{ fontSize: "0.72rem" }}>
                        <CheckCircle2 className="w-3 h-3" /> {log.totalSent} enviados
                      </span>
                      {log.totalFailed > 0 && (
                        <span className="text-red-600 flex items-center gap-1" style={{ fontSize: "0.72rem" }}>
                          <XCircle className="w-3 h-3" /> {log.totalFailed} falhas
                        </span>
                      )}
                    </div>
                    {/* Delivery rate bar */}
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full transition-all"
                          style={{ width: (log.totalRecipients > 0 ? Math.round((log.totalSent / log.totalRecipients) * 100) : 0) + "%" }}
                        />
                      </div>
                      <span className="text-gray-500 shrink-0" style={{ fontSize: "0.7rem", fontWeight: 600 }}>
                        {log.totalRecipients > 0 ? Math.round((log.totalSent / log.totalRecipients) * 100) : 0}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {log.errors && log.errors.length > 0 && (
                      <button
                        onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                        className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                        title="Ver erros"
                      >
                        {expandedId === log.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    )}
                    <button onClick={() => handleDelete(log.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
              {expandedId === log.id && log.errors && log.errors.length > 0 && (
                <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                  <p className="text-red-600 mb-2" style={{ fontSize: "0.75rem", fontWeight: 600 }}>Erros de envio:</p>
                  <div className="bg-red-50 rounded-lg p-3 max-h-40 overflow-y-auto">
                    {log.errors.map((err, idx) => (
                      <p key={idx} className="text-red-700 font-mono" style={{ fontSize: "0.7rem" }}>{err}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ====================================================
// Config Tab
// ====================================================
function ConfigPanel() {
  const [config, setConfig] = useState<EmktConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // SMTP fields
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpSecure, setSmtpSecure] = useState(false);

  // Sender fields
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [replyTo, setReplyTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await api.getEmktConfig(token);
      setConfig(res);
      setSmtpHost(res.smtpHost || "");
      setSmtpPort(res.smtpPort || 587);
      setSmtpUser(res.smtpUser || "");
      setSmtpPass("");
      setSmtpSecure(res.smtpSecure || false);
      setSenderName(res.defaultSenderName || "");
      setSenderEmail(res.defaultSenderEmail || "");
      setReplyTo(res.defaultReplyTo || "");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const token = await getToken();
      const data: any = {
        smtpHost, smtpPort, smtpUser, smtpSecure,
        defaultSenderName: senderName, defaultSenderEmail: senderEmail, defaultReplyTo: replyTo,
      };
      if (smtpPass.trim()) {
        data.smtpPass = smtpPass;
      }
      await api.updateEmktConfig(token, data);
      setSaved(true);
      setSmtpPass("");
      await load();
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTestSmtp = async () => {
    if (!smtpHost.trim() || !smtpUser.trim()) {
      setTestResult({ ok: false, msg: "Preencha pelo menos Host e Usuário para testar." });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const token = await getToken();
      // Use current form values; if password is empty, we need to save first
      var passToUse = smtpPass.trim();
      if (!passToUse && config && config.smtpHasPassword) {
        // Password already saved on server but not shown — save first then test
        setTestResult({ ok: false, msg: "Salve as configurações antes de testar (a senha já salva será usada)." });
        setTesting(false);
        return;
      }
      if (!passToUse) {
        setTestResult({ ok: false, msg: "Informe a senha SMTP para testar a conexao." });
        setTesting(false);
        return;
      }
      const res = await api.testSmtpConnection(token, {
        smtpHost: smtpHost.trim(),
        smtpPort: smtpPort,
        smtpUser: smtpUser.trim(),
        smtpPass: passToUse,
        smtpSecure: smtpSecure,
      });
      setTestResult({ ok: true, msg: res.message || "Conexao bem-sucedida!" });
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message || "Falha na conexão SMTP" });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-red-600 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-gray-900 mb-4" style={{ fontSize: "1rem", fontWeight: 600 }}>Configuracoes</h3>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700" style={{ fontSize: "0.8rem" }}>
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* SMTP Server Configuration */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-5">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center justify-between">
            <h4 className="text-gray-900" style={{ fontSize: "0.9rem", fontWeight: 600 }}>Servidor SMTP</h4>
            <div className={"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold " + (config?.smtpConfigured ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200")}>
              {config?.smtpConfigured ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
              {config?.smtpConfigured ? "Configurado" : "Não configurado"}
            </div>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-gray-500" style={{ fontSize: "0.78rem" }}>
            Configure os dados do seu servidor SMTP para enviar emails. Exemplos: Gmail (smtp.gmail.com:587), Outlook (smtp.office365.com:587), ou seu proprio servidor.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Host SMTP *</label>
              <input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.seuservidor.com" className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-red-500 outline-none" style={{ fontSize: "0.85rem" }} />
            </div>
            <div>
              <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Porta *</label>
              <div className="flex items-center gap-3">
                <input type="number" value={smtpPort} onChange={(e) => setSmtpPort(Number(e.target.value) || 587)} placeholder="587" className="w-28 px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-red-500 outline-none" style={{ fontSize: "0.85rem" }} />
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={smtpSecure} onChange={(e) => setSmtpSecure(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500" />
                    <span className="text-gray-600" style={{ fontSize: "0.8rem" }}>SSL/TLS</span>
                  </label>
                </div>
              </div>
              <p className="text-gray-400 mt-1" style={{ fontSize: "0.68rem" }}>
                Porta 465 = SSL (marque SSL/TLS) | Porta 587 = STARTTLS (desmarque)
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Usuario SMTP *</label>
              <input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="seu@email.com" className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-red-500 outline-none" style={{ fontSize: "0.85rem" }} />
            </div>
            <div>
              <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                Senha SMTP *
                {config?.smtpHasPassword && (
                  <span className="text-green-600 font-normal ml-2" style={{ fontSize: "0.7rem" }}>(salva — deixe vazio para manter)</span>
                )}
              </label>
              <input type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} placeholder={config?.smtpHasPassword ? "••••••••" : "Senha ou App Password"} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-red-500 outline-none" style={{ fontSize: "0.85rem" }} />
              <p className="text-gray-400 mt-1" style={{ fontSize: "0.68rem" }}>
                Para Gmail/Outlook com 2FA, use uma "Senha de App" (App Password).
              </p>
            </div>
          </div>

          {/* Test SMTP button */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleTestSmtp}
              disabled={testing || !smtpHost.trim() || !smtpUser.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg flex items-center gap-2 transition-colors"
              style={{ fontSize: "0.82rem", fontWeight: 600 }}
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Testar Conexao
            </button>
            {testResult && (
              <span className={"flex items-center gap-1 " + (testResult.ok ? "text-green-600" : "text-red-600")} style={{ fontSize: "0.8rem" }}>
                {testResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {testResult.msg}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Default sender settings */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h4 className="text-gray-900" style={{ fontSize: "0.9rem", fontWeight: 600 }}>Configurações Padrão do Remetente</h4>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Nome do Remetente</label>
            <input value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Carretão Auto Peças" className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-red-500 outline-none" style={{ fontSize: "0.85rem" }} />
          </div>
          <div>
            <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Email do Remetente</label>
            <input value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} placeholder="contato@seudominio.com" className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-red-500 outline-none" style={{ fontSize: "0.85rem" }} />
            <p className="text-gray-400 mt-1" style={{ fontSize: "0.7rem" }}>Se vazio, será usado o usuário SMTP como remetente</p>
          </div>
          <div>
            <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Email para Respostas (Reply-To)</label>
            <input value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="contato@suaempresa.com" className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-red-500 outline-none" style={{ fontSize: "0.85rem" }} />
          </div>
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
            {saved && (
              <span className="text-green-600 flex items-center gap-1" style={{ fontSize: "0.8rem" }}>
                <CheckCircle2 className="w-4 h-4" /> Salvo!
              </span>
            )}
            <button onClick={handleSave} disabled={saving} className="px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white rounded-lg flex items-center gap-2 transition-colors" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Salvar Tudo
            </button>
          </div>
        </div>
      </div>

      {/* Variable reference */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mt-5">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h4 className="text-gray-900" style={{ fontSize: "0.9rem", fontWeight: 600 }}>Variaveis de Personalizacao</h4>
        </div>
        <div className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 pr-4 text-gray-500" style={{ fontSize: "0.75rem", fontWeight: 600 }}>Variavel</th>
                  <th className="text-left py-2 text-gray-500" style={{ fontSize: "0.75rem", fontWeight: 600 }}>Descricao</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-50">
                  <td className="py-2 pr-4"><code className="bg-gray-100 px-2 py-0.5 rounded text-red-600" style={{ fontSize: "0.8rem" }}>{"{{nome}}"}</code></td>
                  <td className="py-2 text-gray-600" style={{ fontSize: "0.8rem" }}>Nome do assinante</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4"><code className="bg-gray-100 px-2 py-0.5 rounded text-red-600" style={{ fontSize: "0.8rem" }}>{"{{email}}"}</code></td>
                  <td className="py-2 text-gray-600" style={{ fontSize: "0.8rem" }}>Email do assinante</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ====================================================
// Main Component
// ====================================================
export function AdminEmailMarketing() {
  const [activeTab, setActiveTab] = useState<SubTab>("campaigns");

  const subTabs: { id: SubTab; label: string; icon: typeof Mail }[] = [
    { id: "campaigns", label: "Campanhas", icon: Send },
    { id: "subscribers", label: "Assinantes", icon: Users },
    { id: "templates", label: "Templates", icon: FileText },
    { id: "history", label: "Historico", icon: BarChart3 },
    { id: "config", label: "Configuracoes", icon: Settings },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center">
            <Mail className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-gray-900" style={{ fontSize: "1.2rem", fontWeight: 700 }}>Email Marketing</h2>
            <p className="text-gray-500" style={{ fontSize: "0.8rem" }}>Gerencie campanhas, assinantes e templates</p>
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 mb-5 bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={"flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all whitespace-nowrap " + (
              activeTab === tab.id
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            )}
            style={{ fontSize: "0.82rem", fontWeight: activeTab === tab.id ? 600 : 400 }}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === "campaigns" && <CampaignsPanel />}
      {activeTab === "subscribers" && <SubscribersPanel />}
      {activeTab === "templates" && <TemplatesPanel />}
      {activeTab === "history" && <HistoryPanel />}
      {activeTab === "config" && <ConfigPanel />}
    </div>
  );
}
