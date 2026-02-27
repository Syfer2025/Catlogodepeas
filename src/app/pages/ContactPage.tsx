import { useState } from "react";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { Link } from "react-router";
import {
  Home,
  Phone,
  Mail,
  MapPin,
  Clock,
  Send,
  MessageSquare,
  Loader2,
  MessageCircle,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import * as api from "../services/api";

const subjectLabels: Record<string, string> = {
  orcamento: "Solicitar Orçamento",
  disponibilidade: "Consultar Disponibilidade",
  compatibilidade: "Compatibilidade de Peça",
  troca: "Troca ou Devolução",
  outro: "Outro Assunto",
};

const CONTACT_INFO = [
  {
    icon: Phone,
    title: "Telefone",
    lines: ["0800 643 1170", "(44) 3123-3000"],
    color: "text-blue-600",
    bg: "bg-blue-50",
    borderHover: "hover:border-blue-200",
  },
  {
    icon: Mail,
    title: "E-mail",
    lines: ["contato@carretaoautopecas.com.br", "vendas@carretaoautopecas.com.br"],
    color: "text-purple-600",
    bg: "bg-purple-50",
    borderHover: "hover:border-purple-200",
  },
  {
    icon: MapPin,
    title: "Endereço",
    lines: ["Av. Colômbia, 5765", "Zona 05 - Maringá, PR", "CEP: 87015-200"],
    color: "text-red-600",
    bg: "bg-red-50",
    borderHover: "hover:border-red-200",
  },
  {
    icon: Clock,
    title: "Horário",
    lines: ["Seg a Sex: 8h - 18h", "Sábado: 8h - 13h", "Domingo: Fechado"],
    color: "text-amber-600",
    bg: "bg-amber-50",
    borderHover: "hover:border-amber-200",
  },
];

export function ContactPage() {

  useDocumentMeta({
    title: "Fale Conosco - Carretão Auto Peças",
    description: "Entre em contato com a Carretão Auto Peças. Televendas 0800 643 1170. Tire dúvidas, solicite orçamentos ou consulte disponibilidade de peças.",
    ogTitle: "Fale Conosco - Carretão Auto Peças",
    canonical: window.location.origin + "/contato",
  });

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      await api.createMessage({
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        subject: formData.subject,
        subjectLabel: subjectLabels[formData.subject] || formData.subject,
        message: formData.message,
      } as any);
      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        setFormData({ name: "", email: "", phone: "", subject: "", message: "" });
      }, 4000);
    } catch (err) {
      console.error("Error sending message to Supabase:", err);
      alert("Erro ao enviar mensagem. Tente novamente.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Breadcrumb */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <nav className="flex items-center gap-2 text-gray-400" style={{ fontSize: "0.8rem" }}>
            <Link to="/" className="flex items-center gap-1 hover:text-red-600 transition-colors">
              <Home className="w-3.5 h-3.5" />
              Início
            </Link>
            <span>/</span>
            <span className="text-gray-700">Contato</span>
          </nav>
        </div>
      </div>

      {/* Header */}
      <div className="relative bg-gray-900 py-14 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-900 to-red-900/30" />
        <div className="absolute top-10 right-[20%] w-64 h-64 bg-red-600/8 rounded-full blur-3xl" />
        <div className="relative max-w-7xl mx-auto px-4 text-center">
          <h1 className="text-white mb-3" style={{ fontSize: "2.2rem", fontWeight: 800, letterSpacing: "-0.02em" }}>
            Fale <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-red-500">Conosco</span>
          </h1>
          <p className="text-gray-400 max-w-lg mx-auto" style={{ fontSize: "0.95rem", lineHeight: 1.6 }}>
            Estamos prontos para ajudar você a encontrar as peças certas para seu veículo.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-10">
        {/* WhatsApp Banner */}
        <a
          href="https://wa.me/5544997330202"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-4 bg-green-50 hover:bg-green-100 border border-green-200 rounded-xl px-5 py-4 mb-8 transition-all group"
        >
          <div className="bg-green-500 rounded-full p-2.5 shrink-0 group-hover:scale-105 transition-transform shadow-md shadow-green-200">
            <MessageCircle className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-green-800" style={{ fontSize: "0.95rem", fontWeight: 700 }}>
              Prefere atendimento rápido? Fale pelo WhatsApp!
            </p>
            <p className="text-green-600" style={{ fontSize: "0.82rem" }}>
              (44) 99733-0202 — Resposta em poucos minutos
            </p>
          </div>
          <span
            className="hidden sm:flex items-center gap-1 text-green-600 group-hover:translate-x-1 transition-transform"
            style={{ fontSize: "0.85rem", fontWeight: 600 }}
          >
            Iniciar conversa
            <ArrowRight className="w-4 h-4" />
          </span>
        </a>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Contact Info Cards */}
          <div className="space-y-4">
            {CONTACT_INFO.map((item) => (
              <div
                key={item.title}
                className={`bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4 ${item.borderHover} transition-all hover:shadow-sm`}
              >
                <div className={`${item.bg} rounded-xl p-3 shrink-0`}>
                  <item.icon className={`w-5 h-5 ${item.color}`} />
                </div>
                <div>
                  <h3 className="text-gray-800 mb-1.5" style={{ fontSize: "0.95rem", fontWeight: 700 }}>
                    {item.title}
                  </h3>
                  {item.lines.map((line) => (
                    <p key={line} className="text-gray-500" style={{ fontSize: "0.85rem", lineHeight: 1.6 }}>
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Contact Form */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl border border-gray-200 p-6 lg:p-8">
              <div className="flex items-center gap-2 mb-6">
                <div className="bg-red-50 rounded-lg p-2">
                  <MessageSquare className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h2 className="text-gray-800" style={{ fontSize: "1.15rem", fontWeight: 700 }}>
                    Envie sua Mensagem
                  </h2>
                  <p className="text-gray-400" style={{ fontSize: "0.75rem" }}>
                    Responderemos em até 24 horas úteis
                  </p>
                </div>
              </div>

              {submitted ? (
                <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
                  <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 className="w-8 h-8 text-green-600" />
                  </div>
                  <h3 className="text-green-800 mb-2" style={{ fontSize: "1.1rem", fontWeight: 700 }}>
                    Mensagem enviada com sucesso!
                  </h3>
                  <p className="text-green-600" style={{ fontSize: "0.9rem" }}>
                    Responderemos em até 24 horas úteis.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Honeypot — hidden from humans */}
                  <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", top: "-9999px", opacity: 0, height: 0, overflow: "hidden" }}>
                    <label htmlFor="fax_number_contact">Fax</label>
                    <input type="text" id="fax_number_contact" name="fax_number" tabIndex={-1} autoComplete="off" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-gray-600 mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                        Nome completo *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 bg-gray-50 focus:bg-white focus:border-red-400 focus:ring-2 focus:ring-red-100 outline-none transition-all"
                        placeholder="Seu nome"
                        style={{ fontSize: "0.9rem" }}
                      />
                    </div>
                    <div>
                      <label className="block text-gray-600 mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                        E-mail *
                      </label>
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 bg-gray-50 focus:bg-white focus:border-red-400 focus:ring-2 focus:ring-red-100 outline-none transition-all"
                        placeholder="seu@email.com"
                        style={{ fontSize: "0.9rem" }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-gray-600 mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                        Telefone
                      </label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 bg-gray-50 focus:bg-white focus:border-red-400 focus:ring-2 focus:ring-red-100 outline-none transition-all"
                        placeholder="(11) 99999-9999"
                        style={{ fontSize: "0.9rem" }}
                      />
                    </div>
                    <div>
                      <label className="block text-gray-600 mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                        Assunto *
                      </label>
                      <select
                        required
                        value={formData.subject}
                        onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 bg-gray-50 focus:bg-white focus:border-red-400 focus:ring-2 focus:ring-red-100 outline-none transition-all"
                        style={{ fontSize: "0.9rem" }}
                      >
                        <option value="">Selecione...</option>
                        <option value="orcamento">Solicitar Orçamento</option>
                        <option value="disponibilidade">Consultar Disponibilidade</option>
                        <option value="compatibilidade">Compatibilidade de Peça</option>
                        <option value="troca">Troca ou Devolução</option>
                        <option value="outro">Outro Assunto</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-gray-600 mb-1.5" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                      Mensagem *
                    </label>
                    <textarea
                      required
                      rows={5}
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 bg-gray-50 focus:bg-white focus:border-red-400 focus:ring-2 focus:ring-red-100 outline-none transition-all resize-none"
                      placeholder="Descreva sua dúvida, informando modelo do veículo, ano e peça desejada..."
                      style={{ fontSize: "0.9rem" }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={sending}
                    className="w-full sm:w-auto bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white px-8 py-3 rounded-xl flex items-center justify-center gap-2 transition-all hover:shadow-lg hover:shadow-red-200 active:scale-[0.98]"
                    style={{ fontWeight: 700 }}
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {sending ? "Enviando..." : "Enviar Mensagem"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}