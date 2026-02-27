import { useState } from "react";
import { Link } from "react-router";
import {
  Home,
  ChevronRight,
  Shield,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Search,
  Copy,
  Check,
  Info,
  FileText,
  User,
  Mail,
  Phone,
  CreditCard,
  Clock,
} from "lucide-react";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import * as api from "../services/api";
import { toast } from "sonner";

var REQUEST_TYPES = [
  { value: "confirmacao", label: "Confirmação de tratamento de dados", desc: "Confirmar se seus dados pessoais são tratados por nós" },
  { value: "acesso", label: "Acesso aos dados", desc: "Solicitar cópia dos seus dados pessoais que possuímos" },
  { value: "correcao", label: "Correção de dados", desc: "Corrigir dados pessoais incompletos, inexatos ou desatualizados" },
  { value: "anonimizacao", label: "Anonimização ou bloqueio", desc: "Anonimizar, bloquear ou eliminar dados desnecessários ou excessivos" },
  { value: "portabilidade", label: "Portabilidade dos dados", desc: "Solicitar a portabilidade dos seus dados a outro fornecedor" },
  { value: "eliminacao", label: "Eliminação dos dados", desc: "Solicitar a eliminação dos dados pessoais tratados com consentimento" },
  { value: "revogacao", label: "Revogação de consentimento", desc: "Revogar o consentimento previamente dado para tratamento de dados" },
  { value: "oposicao", label: "Oposição ao tratamento", desc: "Opor-se ao tratamento realizado com fundamento em interesse legítimo" },
  { value: "informacao_compartilhamento", label: "Informação sobre compartilhamento", desc: "Saber com quais entidades públicas/privadas seus dados são compartilhados" },
];

var STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendente", color: "bg-amber-100 text-amber-800" },
  in_progress: { label: "Em Análise", color: "bg-blue-100 text-blue-800" },
  completed: { label: "Concluído", color: "bg-green-100 text-green-800" },
  rejected: { label: "Indeferido", color: "bg-red-100 text-red-800" },
};

function formatCPF(value: string): string {
  var digits = value.replace(/\D/g, "").substring(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return digits.substring(0, 3) + "." + digits.substring(3);
  if (digits.length <= 9) return digits.substring(0, 3) + "." + digits.substring(3, 6) + "." + digits.substring(6);
  return digits.substring(0, 3) + "." + digits.substring(3, 6) + "." + digits.substring(6, 9) + "-" + digits.substring(9);
}

function formatPhone(value: string): string {
  var digits = value.replace(/\D/g, "").substring(0, 11);
  if (digits.length <= 2) return "(" + digits;
  if (digits.length <= 7) return "(" + digits.substring(0, 2) + ") " + digits.substring(2);
  return "(" + digits.substring(0, 2) + ") " + digits.substring(2, 7) + "-" + digits.substring(7);
}

export function LgpdRightsPage() {
  useDocumentMeta({
    title: "Exercício de Direitos LGPD - Carretão Auto Peças",
    description: "Exerça seus direitos como titular de dados pessoais conforme a Lei Geral de Proteção de Dados (LGPD). Formulário para solicitações de acesso, correção, eliminação e portabilidade de dados.",
    ogTitle: "Exercício de Direitos LGPD - Carretão Auto Peças",
    canonical: window.location.origin + "/exercicio-de-direitos",
  });

  // Form state
  var [fullName, setFullName] = useState("");
  var [email, setEmail] = useState("");
  var [cpf, setCpf] = useState("");
  var [phone, setPhone] = useState("");
  var [requestType, setRequestType] = useState("");
  var [description, setDescription] = useState("");
  var [lgpdConsent, setLgpdConsent] = useState(false);

  var [submitting, setSubmitting] = useState(false);
  var [submitted, setSubmitted] = useState(false);
  var [submittedId, setSubmittedId] = useState("");
  var [error, setError] = useState("");

  // Status check state
  var [statusTab, setStatusTab] = useState<"form" | "status">("form");
  var [statusId, setStatusId] = useState("");
  var [statusEmail, setStatusEmail] = useState("");
  var [statusLoading, setStatusLoading] = useState(false);
  var [statusResult, setStatusResult] = useState<any>(null);
  var [statusError, setStatusError] = useState("");
  var [copied, setCopied] = useState(false);

  var selectedType = REQUEST_TYPES.find(function (t) { return t.value === requestType; });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!fullName.trim() || fullName.trim().length < 3) {
      setError("Informe seu nome completo (mínimo 3 caracteres).");
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Informe um e-mail válido.");
      return;
    }
    if (!requestType) {
      setError("Selecione o tipo de solicitação.");
      return;
    }
    if (!description.trim() || description.trim().length < 10) {
      setError("Descreva sua solicitação com mais detalhes (mínimo 10 caracteres).");
      return;
    }
    if (!lgpdConsent) {
      setError("Você precisa concordar com o tratamento dos dados para enviar a solicitação.");
      return;
    }

    setSubmitting(true);
    try {
      var result = await api.submitLgpdRequest({
        fullName: fullName.trim(),
        email: email.trim(),
        cpf: cpf.replace(/\D/g, "") || undefined,
        phone: phone.replace(/\D/g, "") || undefined,
        requestType: requestType,
        description: description.trim(),
      });
      if (result.ok) {
        setSubmitted(true);
        setSubmittedId(result.requestId);
        toast.success("Solicitação enviada com sucesso!");
      } else {
        setError((result as any).error || "Erro ao enviar solicitação.");
      }
    } catch (err: any) {
      console.error("[LGPD] Submit error:", err);
      setError(err.message || "Erro ao enviar solicitação. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCheckStatus(e: React.FormEvent) {
    e.preventDefault();
    setStatusError("");
    setStatusResult(null);

    if (!statusId.trim() || !statusEmail.trim()) {
      setStatusError("Informe o ID da solicitação e o e-mail.");
      return;
    }

    setStatusLoading(true);
    try {
      var result = await api.checkLgpdRequestStatus(statusId.trim(), statusEmail.trim());
      if (result.ok) {
        setStatusResult(result.request);
      } else {
        setStatusError((result as any).error || "Solicitação não encontrada.");
      }
    } catch (err: any) {
      console.error("[LGPD] Status check error:", err);
      setStatusError(err.message || "Erro ao consultar status.");
    } finally {
      setStatusLoading(false);
    }
  }

  function resetForm() {
    setFullName("");
    setEmail("");
    setCpf("");
    setPhone("");
    setRequestType("");
    setDescription("");
    setLgpdConsent(false);
    setSubmitted(false);
    setSubmittedId("");
    setError("");
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Breadcrumb */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <nav className="flex items-center gap-1.5 text-gray-500" style={{ fontSize: "0.8rem" }}>
            <Link to="/" className="hover:text-red-600 transition-colors flex items-center gap-1">
              <Home className="w-3.5 h-3.5" />
              Início
            </Link>
            <ChevronRight className="w-3 h-3" />
            <Link to="/politica-de-privacidade" className="hover:text-red-600 transition-colors">
              Privacidade
            </Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-gray-900 font-medium">Exercício de Direitos</span>
          </nav>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 lg:py-12">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-red-50 rounded-xl p-3">
            <Shield className="w-7 h-7 text-red-600" />
          </div>
          <div>
            <h1 className="text-gray-900" style={{ fontSize: "1.6rem", fontWeight: 800, lineHeight: 1.2 }}>
              Exercício de Direitos — LGPD
            </h1>
            <p className="text-gray-500" style={{ fontSize: "0.82rem" }}>
              Lei Geral de Proteção de Dados Pessoais (Lei n.º 13.709/2018)
            </p>
          </div>
        </div>

        {/* Intro card */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-8">
          <div className="flex gap-3">
            <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-blue-900" style={{ fontSize: "0.88rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                Seus direitos como titular de dados
              </p>
              <p className="text-blue-800" style={{ fontSize: "0.82rem", lineHeight: 1.6 }}>
                A LGPD garante a você, titular de dados pessoais, uma série de direitos em relação
                ao tratamento das suas informações. Utilize este formulário para exercer qualquer
                um dos direitos previstos no <strong>Art. 18</strong> da Lei. Responderemos sua
                solicitação em até <strong>15 dias úteis</strong>, conforme estabelecido pela legislação.
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1">
          <button
            onClick={function () { setStatusTab("form"); }}
            className={"flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md transition-all " + (statusTab === "form" ? "bg-white text-red-700 shadow-sm font-semibold" : "text-gray-500 hover:text-gray-700")}
            style={{ fontSize: "0.85rem" }}
          >
            <FileText className="w-4 h-4" />
            Nova Solicitação
          </button>
          <button
            onClick={function () { setStatusTab("status"); }}
            className={"flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md transition-all " + (statusTab === "status" ? "bg-white text-red-700 shadow-sm font-semibold" : "text-gray-500 hover:text-gray-700")}
            style={{ fontSize: "0.85rem" }}
          >
            <Search className="w-4 h-4" />
            Consultar Status
          </button>
        </div>

        {statusTab === "form" ? (
          submitted ? (
            /* ─── Success State ─── */
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-gray-900 mb-2" style={{ fontSize: "1.3rem", fontWeight: 700 }}>
                Solicitação Enviada!
              </h2>
              <p className="text-gray-600 mb-4" style={{ fontSize: "0.9rem" }}>
                Sua solicitação foi registrada e será analisada pela nossa equipe.
                Responderemos em até <strong>15 dias úteis</strong>.
              </p>

              {/* Request ID */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6 max-w-md mx-auto">
                <p className="text-gray-500 mb-1" style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Protocolo da Solicitação
                </p>
                <div className="flex items-center justify-center gap-2">
                  <code className="text-red-700 bg-red-50 px-3 py-1 rounded-lg font-mono" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                    {submittedId}
                  </code>
                  <button
                    onClick={function () {
                      navigator.clipboard.writeText(submittedId).catch(function () {});
                      setCopied(true);
                      toast.success("Protocolo copiado!");
                      setTimeout(function () { setCopied(false); }, 2000);
                    }}
                    className="text-gray-400 hover:text-red-600 transition-colors p-1"
                    title="Copiar protocolo"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-gray-400 mt-2" style={{ fontSize: "0.75rem" }}>
                  Guarde este número para acompanhar o andamento da solicitação.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={function () { setStatusTab("status"); setStatusId(submittedId); setStatusEmail(email); }}
                  className="bg-red-600 text-white px-5 py-2.5 rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
                  style={{ fontSize: "0.85rem", fontWeight: 600 }}
                >
                  <Search className="w-4 h-4" />
                  Consultar Status
                </button>
                <button
                  onClick={resetForm}
                  className="bg-gray-100 text-gray-700 px-5 py-2.5 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"
                  style={{ fontSize: "0.85rem", fontWeight: 600 }}
                >
                  <FileText className="w-4 h-4" />
                  Nova Solicitação
                </button>
              </div>
            </div>
          ) : (
            /* ─── Form ─── */
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8">
              <h2 className="text-gray-900 mb-6" style={{ fontSize: "1.15rem", fontWeight: 700 }}>
                Formulário de Solicitação
              </h2>

              {/* Error */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-5 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-red-700" style={{ fontSize: "0.82rem" }}>{error}</p>
                </div>
              )}

              <div className="space-y-5">
                {/* Name + Email */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="flex items-center gap-1.5 text-gray-700 mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                      <User className="w-3.5 h-3.5 text-gray-400" />
                      Nome Completo <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={function (e) { setFullName(e.target.value); }}
                      placeholder="Seu nome completo"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all"
                      style={{ fontSize: "0.88rem" }}
                      maxLength={200}
                      required
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-gray-700 mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                      <Mail className="w-3.5 h-3.5 text-gray-400" />
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={function (e) { setEmail(e.target.value); }}
                      placeholder="seu@email.com"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all"
                      style={{ fontSize: "0.88rem" }}
                      maxLength={200}
                      required
                    />
                  </div>
                </div>

                {/* CPF + Phone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="flex items-center gap-1.5 text-gray-700 mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                      <CreditCard className="w-3.5 h-3.5 text-gray-400" />
                      CPF <span className="text-gray-400 font-normal">(opcional)</span>
                    </label>
                    <input
                      type="text"
                      value={cpf}
                      onChange={function (e) { setCpf(formatCPF(e.target.value)); }}
                      placeholder="000.000.000-00"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all"
                      style={{ fontSize: "0.88rem" }}
                      maxLength={14}
                    />
                    <p className="text-gray-400 mt-1" style={{ fontSize: "0.72rem" }}>
                      Para verificação de identidade
                    </p>
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-gray-700 mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                      <Phone className="w-3.5 h-3.5 text-gray-400" />
                      Telefone <span className="text-gray-400 font-normal">(opcional)</span>
                    </label>
                    <input
                      type="text"
                      value={phone}
                      onChange={function (e) { setPhone(formatPhone(e.target.value)); }}
                      placeholder="(00) 00000-0000"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all"
                      style={{ fontSize: "0.88rem" }}
                      maxLength={15}
                    />
                  </div>
                </div>

                {/* Request Type */}
                <div>
                  <label className="flex items-center gap-1.5 text-gray-700 mb-2" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                    <Shield className="w-3.5 h-3.5 text-gray-400" />
                    Tipo de Solicitação <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {REQUEST_TYPES.map(function (type) {
                      var isSelected = requestType === type.value;
                      return (
                        <button
                          key={type.value}
                          type="button"
                          onClick={function () { setRequestType(type.value); }}
                          className={"flex flex-col text-left border rounded-lg px-3 py-2.5 transition-all " + (isSelected ? "border-red-500 bg-red-50 ring-1 ring-red-300" : "border-gray-200 hover:border-red-300 hover:bg-red-50/30")}
                        >
                          <span className={"font-medium " + (isSelected ? "text-red-700" : "text-gray-800")} style={{ fontSize: "0.82rem" }}>
                            {type.label}
                          </span>
                          <span className="text-gray-400" style={{ fontSize: "0.72rem", lineHeight: 1.4 }}>
                            {type.desc}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="flex items-center gap-1.5 text-gray-700 mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                    <FileText className="w-3.5 h-3.5 text-gray-400" />
                    Descrição da Solicitação <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={function (e) { setDescription(e.target.value); }}
                    placeholder="Descreva detalhadamente sua solicitação. Inclua informações que ajudem a identificar os dados (ex: e-mail de cadastro, número do pedido, etc.)."
                    rows={5}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all resize-none"
                    style={{ fontSize: "0.88rem" }}
                    maxLength={5000}
                  />
                  <div className="flex justify-between mt-1">
                    <p className="text-gray-400" style={{ fontSize: "0.72rem" }}>
                      Mínimo 10 caracteres
                    </p>
                    <p className={"" + (description.length > 4800 ? "text-amber-500" : "text-gray-400")} style={{ fontSize: "0.72rem" }}>
                      {description.length}/5000
                    </p>
                  </div>
                </div>

                {/* Selected type info */}
                {selectedType && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                    <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-amber-800" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                        {selectedType.label}
                      </p>
                      <p className="text-amber-700" style={{ fontSize: "0.75rem" }}>
                        {selectedType.desc}. Prazo legal de resposta: 15 dias úteis.
                      </p>
                    </div>
                  </div>
                )}

                {/* Consent checkbox */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={lgpdConsent}
                      onChange={function (e) { setLgpdConsent(e.target.checked); }}
                      className="mt-0.5 w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                    />
                    <span className="text-gray-700" style={{ fontSize: "0.8rem", lineHeight: 1.5 }}>
                      Declaro que li e concordo com a{" "}
                      <Link to="/politica-de-privacidade" className="text-red-600 hover:underline font-medium" target="_blank">
                        Política de Privacidade
                      </Link>{" "}
                      e autorizo o tratamento dos dados pessoais informados neste formulário exclusivamente
                      para fins de atendimento desta solicitação LGPD, conforme Art. 7, inciso II da Lei 13.709/2018.
                      <span className="text-red-500"> *</span>
                    </span>
                  </label>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-red-600 text-white py-3 rounded-xl hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-sm"
                  style={{ fontSize: "0.92rem", fontWeight: 700 }}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="w-4.5 h-4.5" />
                      Enviar Solicitação
                    </>
                  )}
                </button>
              </div>
            </form>
          )
        ) : (
          /* ─── Status Check Tab ─── */
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8">
            <h2 className="text-gray-900 mb-2" style={{ fontSize: "1.15rem", fontWeight: 700 }}>
              Consultar Status da Solicitação
            </h2>
            <p className="text-gray-500 mb-6" style={{ fontSize: "0.85rem" }}>
              Informe o número de protocolo e o e-mail utilizado na solicitação para verificar o andamento.
            </p>

            <form onSubmit={handleCheckStatus} className="space-y-4">
              {statusError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-red-700" style={{ fontSize: "0.82rem" }}>{statusError}</p>
                </div>
              )}

              <div>
                <label className="text-gray-700 mb-1.5 block" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                  Número de Protocolo
                </label>
                <input
                  type="text"
                  value={statusId}
                  onChange={function (e) { setStatusId(e.target.value); }}
                  placeholder="lgpd_1234567890_abc123"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 font-mono focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all"
                  style={{ fontSize: "0.85rem" }}
                />
              </div>

              <div>
                <label className="text-gray-700 mb-1.5 block" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                  E-mail utilizado na solicitação
                </label>
                <input
                  type="email"
                  value={statusEmail}
                  onChange={function (e) { setStatusEmail(e.target.value); }}
                  placeholder="seu@email.com"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all"
                  style={{ fontSize: "0.85rem" }}
                />
              </div>

              <button
                type="submit"
                disabled={statusLoading}
                className="bg-red-600 text-white px-6 py-2.5 rounded-lg hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                style={{ fontSize: "0.85rem", fontWeight: 600 }}
              >
                {statusLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Consultando...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    Consultar
                  </>
                )}
              </button>
            </form>

            {/* Status Result */}
            {statusResult && (
              <div className="mt-6 bg-gray-50 border border-gray-200 rounded-xl p-5">
                <h3 className="text-gray-900 mb-4" style={{ fontSize: "0.95rem", fontWeight: 700 }}>
                  Resultado da Consulta
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500" style={{ fontSize: "0.82rem" }}>Protocolo:</span>
                    <code className="text-gray-900 font-mono bg-white px-2 py-0.5 rounded border border-gray-200" style={{ fontSize: "0.8rem" }}>
                      {statusResult.id}
                    </code>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500" style={{ fontSize: "0.82rem" }}>Tipo:</span>
                    <span className="text-gray-900" style={{ fontSize: "0.82rem", fontWeight: 500 }}>
                      {(REQUEST_TYPES.find(function (t) { return t.value === statusResult.requestType; }) || {}).label || statusResult.requestType}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500" style={{ fontSize: "0.82rem" }}>Status:</span>
                    <span className={"px-2.5 py-0.5 rounded-full font-medium " + ((STATUS_LABELS[statusResult.status] || {}).color || "bg-gray-100 text-gray-700")} style={{ fontSize: "0.78rem" }}>
                      {(STATUS_LABELS[statusResult.status] || {}).label || statusResult.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500" style={{ fontSize: "0.82rem" }}>Data de Envio:</span>
                    <span className="text-gray-900 flex items-center gap-1" style={{ fontSize: "0.82rem" }}>
                      <Clock className="w-3.5 h-3.5 text-gray-400" />
                      {new Date(statusResult.createdAt).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                  {statusResult.resolvedAt && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500" style={{ fontSize: "0.82rem" }}>Data de Resolução:</span>
                      <span className="text-gray-900 flex items-center gap-1" style={{ fontSize: "0.82rem" }}>
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                        {new Date(statusResult.resolvedAt).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Legal Info */}
        <div className="mt-8 bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8">
          <h2 className="text-gray-900 mb-4" style={{ fontSize: "1.05rem", fontWeight: 700 }}>
            Informações Importantes
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-red-600" />
                <span className="text-gray-800" style={{ fontSize: "0.85rem", fontWeight: 600 }}>Prazo de Resposta</span>
              </div>
              <p className="text-gray-600" style={{ fontSize: "0.8rem", lineHeight: 1.5 }}>
                Conforme o Art. 18, §5º da LGPD, responderemos sua solicitação em até <strong>15 dias úteis</strong> a
                contar do recebimento.
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <User className="w-4 h-4 text-red-600" />
                <span className="text-gray-800" style={{ fontSize: "0.85rem", fontWeight: 600 }}>Verificação de Identidade</span>
              </div>
              <p className="text-gray-600" style={{ fontSize: "0.8rem", lineHeight: 1.5 }}>
                Podemos solicitar informações adicionais para confirmar sua identidade como titular dos dados,
                garantindo a segurança das suas informações.
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-red-600" />
                <span className="text-gray-800" style={{ fontSize: "0.85rem", fontWeight: 600 }}>Encarregado (DPO)</span>
              </div>
              <p className="text-gray-600" style={{ fontSize: "0.8rem", lineHeight: 1.5 }}>
                Em caso de dúvidas, entre em contato com nosso Encarregado de Proteção de Dados pelo e-mail{" "}
                <a href="mailto:privacidade@carretaoautopecas.com.br" className="text-red-600 hover:underline">
                  privacidade@carretaoautopecas.com.br
                </a>
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-red-600" />
                <span className="text-gray-800" style={{ fontSize: "0.85rem", fontWeight: 600 }}>ANPD</span>
              </div>
              <p className="text-gray-600" style={{ fontSize: "0.8rem", lineHeight: 1.5 }}>
                Caso não fique satisfeito com a resposta, você tem o direito de apresentar reclamação perante a{" "}
                <strong>Autoridade Nacional de Proteção de Dados (ANPD)</strong> — <a href="https://www.gov.br/anpd" target="_blank" rel="noopener noreferrer" className="text-red-600 hover:underline">www.gov.br/anpd</a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}