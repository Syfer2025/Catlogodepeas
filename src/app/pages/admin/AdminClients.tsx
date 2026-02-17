import { useState, useEffect } from "react";
import {
  Users,
  Search,
  Loader2,
  RefreshCw,
  Mail,
  Phone,
  MapPin,
  CreditCard,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Calendar,
  Clock,
  Download,
  X,
  User,
  Shield,
} from "lucide-react";
import * as api from "../../services/api";
import type { ClientProfile } from "../../services/api";
import { supabase } from "../../services/supabaseClient";

// Helpers
function formatCpf(cpf: string): string {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

function formatCep(cep: string): string {
  const d = cep.replace(/\D/g, "");
  if (d.length === 8) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return cep;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

type SortField = "name" | "email" | "created_at" | "last_sign_in";
type SortDir = "asc" | "desc";

export function AdminClients() {
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadClients = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("Sessao expirada. Faca login novamente.");
        return;
      }
      const result = await api.getAdminClients(session.access_token);
      setClients(result.clients || []);
    } catch (err: any) {
      console.error("Error loading clients:", err);
      setError(err.message || "Erro ao carregar clientes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClients();
  }, []);

  // Filtering
  const filtered = clients.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (c.name || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.phone || "").includes(q) ||
      (c.cpf || "").includes(q.replace(/\D/g, "")) ||
      (c.city || "").toLowerCase().includes(q) ||
      (c.state || "").toLowerCase().includes(q)
    );
  });

  // Sorting
  const sorted = [...filtered].sort((a, b) => {
    let va: string | number = "";
    let vb: string | number = "";

    switch (sortField) {
      case "name":
        va = (a.name || "").toLowerCase();
        vb = (b.name || "").toLowerCase();
        break;
      case "email":
        va = (a.email || "").toLowerCase();
        vb = (b.email || "").toLowerCase();
        break;
      case "created_at":
        va = new Date(a.created_at || 0).getTime();
        vb = new Date(b.created_at || 0).getTime();
        break;
      case "last_sign_in":
        va = a.last_sign_in ? new Date(a.last_sign_in).getTime() : 0;
        vb = b.last_sign_in ? new Date(b.last_sign_in).getTime() : 0;
        break;
    }

    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir(field === "name" || field === "email" ? "asc" : "desc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronDown className="w-3 h-3 text-gray-300" />;
    return sortDir === "asc" ? (
      <ChevronUp className="w-3 h-3 text-red-600" />
    ) : (
      <ChevronDown className="w-3 h-3 text-red-600" />
    );
  };

  // Export CSV
  const exportCsv = () => {
    const header = "Nome,Email,Telefone,CPF,Cidade,Estado,CEP,Endereco,Cadastro,Email Confirmado,Ultimo Acesso\n";
    const rows = sorted.map((c) =>
      [
        `"${(c.name || "").replace(/"/g, '""')}"`,
        c.email,
        c.phone ? formatPhone(c.phone) : "",
        c.cpf ? formatCpf(c.cpf) : "",
        c.city || "",
        c.state || "",
        c.cep ? formatCep(c.cep) : "",
        `"${(c.address || "").replace(/"/g, '""')}"`,
        formatDateShort(c.created_at),
        c.email_confirmed ? "Sim" : "Nao",
        c.last_sign_in ? formatDate(c.last_sign_in) : "Nunca",
      ].join(",")
    ).join("\n");

    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `clientes_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Counts
  const confirmedCount = clients.filter((c) => c.email_confirmed).length;
  const activeCount = clients.filter((c) => c.last_sign_in).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-gray-900 flex items-center gap-2" style={{ fontSize: "1.3rem", fontWeight: 700 }}>
            <Users className="w-6 h-6 text-red-600" />
            Clientes Cadastrados
          </h2>
          <p className="text-gray-500 mt-1" style={{ fontSize: "0.85rem" }}>
            {clients.length} cliente{clients.length !== 1 ? "s" : ""} registrado{clients.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            disabled={sorted.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-gray-600 hover:text-green-700 hover:border-green-300 hover:bg-green-50 transition-colors disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
            style={{ fontSize: "0.8rem", fontWeight: 500 }}
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </button>
          <button
            onClick={loadClients}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-gray-600 hover:text-red-600 hover:border-red-200 transition-colors cursor-pointer"
            style={{ fontSize: "0.8rem", fontWeight: 500 }}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Atualizar
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 rounded-lg p-2.5">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-gray-800" style={{ fontSize: "1.3rem", fontWeight: 700 }}>
                {clients.length}
              </p>
              <p className="text-gray-400" style={{ fontSize: "0.78rem" }}>
                Total de Clientes
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="bg-green-100 rounded-lg p-2.5">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-gray-800" style={{ fontSize: "1.3rem", fontWeight: 700 }}>
                {confirmedCount}
              </p>
              <p className="text-gray-400" style={{ fontSize: "0.78rem" }}>
                Email Confirmado
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="bg-purple-100 rounded-lg p-2.5">
              <Shield className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-gray-800" style={{ fontSize: "1.3rem", fontWeight: 700 }}>
                {activeCount}
              </p>
              <p className="text-gray-400" style={{ fontSize: "0.78rem" }}>
                Ja Fizeram Login
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-red-700" style={{ fontSize: "0.85rem" }}>{error}</p>
        </div>
      )}

      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, email, telefone, CPF, cidade..."
            className="w-full pl-11 pr-10 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 placeholder-gray-400 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 focus:bg-white transition-all"
            style={{ fontSize: "0.9rem" }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {search && (
          <p className="text-gray-400 mt-2" style={{ fontSize: "0.78rem" }}>
            {sorted.length} resultado{sorted.length !== 1 ? "s" : ""} encontrado{sorted.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* Table */}
      {sorted.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500" style={{ fontSize: "0.95rem", fontWeight: 600 }}>
            {search ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
          </p>
          <p className="text-gray-400 mt-1" style={{ fontSize: "0.8rem" }}>
            {search
              ? "Tente buscar com outros termos."
              : "Os clientes aparecerao aqui quando se cadastrarem no site."}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden lg:block bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                      <button
                        onClick={() => toggleSort("name")}
                        className="flex items-center gap-1 text-gray-600 hover:text-red-600 cursor-pointer"
                      >
                        Cliente <SortIcon field="name" />
                      </button>
                    </th>
                    <th className="text-left px-4 py-3" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                      <button
                        onClick={() => toggleSort("email")}
                        className="flex items-center gap-1 text-gray-600 hover:text-red-600 cursor-pointer"
                      >
                        Email <SortIcon field="email" />
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 text-gray-600" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                      Telefone
                    </th>
                    <th className="text-left px-4 py-3 text-gray-600" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                      CPF
                    </th>
                    <th className="text-left px-4 py-3 text-gray-600" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                      Cidade/UF
                    </th>
                    <th className="text-left px-4 py-3" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                      <button
                        onClick={() => toggleSort("created_at")}
                        className="flex items-center gap-1 text-gray-600 hover:text-red-600 cursor-pointer"
                      >
                        Cadastro <SortIcon field="created_at" />
                      </button>
                    </th>
                    <th className="text-center px-4 py-3 text-gray-600" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sorted.map((client) => (
                    <tr
                      key={client.id}
                      className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                      onClick={() => setExpandedId(expandedId === client.id ? null : client.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                            <User className="w-4 h-4 text-red-600" />
                          </div>
                          <span className="text-gray-800 truncate max-w-[180px]" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                            {client.name || "Sem nome"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-gray-600 truncate max-w-[200px] block" style={{ fontSize: "0.83rem" }}>
                          {client.email}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-gray-600" style={{ fontSize: "0.83rem" }}>
                          {client.phone ? formatPhone(client.phone) : "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-gray-600 font-mono" style={{ fontSize: "0.8rem" }}>
                          {client.cpf ? formatCpf(client.cpf) : "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-gray-600" style={{ fontSize: "0.83rem" }}>
                          {client.city && client.state
                            ? `${client.city}/${client.state}`
                            : client.city || client.state || "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-gray-500" style={{ fontSize: "0.8rem" }}>
                          {formatDateShort(client.created_at)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {client.email_confirmed ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 rounded-full" style={{ fontSize: "0.7rem", fontWeight: 500 }}>
                            <CheckCircle2 className="w-3 h-3" />
                            Ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full" style={{ fontSize: "0.7rem", fontWeight: 500 }}>
                            <Clock className="w-3 h-3" />
                            Pendente
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden space-y-3">
            {sorted.map((client) => {
              const isExpanded = expandedId === client.id;
              return (
                <div
                  key={client.id}
                  className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                >
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : client.id)}
                    className="w-full flex items-center gap-3 p-4 cursor-pointer"
                  >
                    <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                      <User className="w-5 h-5 text-red-600" />
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-gray-800 truncate" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                        {client.name || "Sem nome"}
                      </p>
                      <p className="text-gray-500 truncate" style={{ fontSize: "0.78rem" }}>
                        {client.email}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {client.email_confirmed ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 rounded-full" style={{ fontSize: "0.68rem", fontWeight: 500 }}>
                          <CheckCircle2 className="w-3 h-3" />
                          Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full" style={{ fontSize: "0.68rem", fontWeight: 500 }}>
                          <Clock className="w-3 h-3" />
                          Pendente
                        </span>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-100 px-4 py-4 space-y-3 bg-gray-50/50">
                      <DetailRow icon={Mail} label="Email" value={client.email} />
                      <DetailRow icon={Phone} label="Telefone" value={client.phone ? formatPhone(client.phone) : "-"} />
                      <DetailRow icon={CreditCard} label="CPF" value={client.cpf ? formatCpf(client.cpf) : "-"} mono />
                      <DetailRow
                        icon={MapPin}
                        label="Endereco"
                        value={
                          [client.address, client.city && client.state ? `${client.city}/${client.state}` : client.city || client.state, client.cep ? `CEP: ${formatCep(client.cep)}` : ""]
                            .filter(Boolean)
                            .join(", ") || "-"
                        }
                      />
                      <DetailRow icon={Calendar} label="Cadastro" value={formatDate(client.created_at)} />
                      <DetailRow icon={Clock} label="Ultimo acesso" value={client.last_sign_in ? formatDate(client.last_sign_in) : "Nunca"} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop Expanded Detail (shown below table when a row is clicked) */}
          {expandedId && (
            <div className="hidden lg:block">
              <ExpandedClientDetail
                client={sorted.find((c) => c.id === expandedId)!}
                onClose={() => setExpandedId(null)}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-gray-400" style={{ fontSize: "0.7rem", fontWeight: 500 }}>
          {label}
        </p>
        <p
          className={`text-gray-700 break-all ${mono ? "font-mono" : ""}`}
          style={{ fontSize: "0.83rem" }}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function ExpandedClientDetail({
  client,
  onClose,
}: {
  client: ClientProfile;
  onClose: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
            <User className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="text-gray-900" style={{ fontSize: "1rem", fontWeight: 600 }}>
              {client.name || "Sem nome"}
            </h3>
            <p className="text-gray-500" style={{ fontSize: "0.8rem" }}>
              ID: {client.id.slice(0, 8)}...
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Contact */}
        <div className="space-y-3">
          <p className="text-gray-600 border-b border-gray-100 pb-1.5" style={{ fontSize: "0.78rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Contato
          </p>
          <DetailRow icon={Mail} label="Email" value={client.email} />
          <DetailRow icon={Phone} label="Telefone" value={client.phone ? formatPhone(client.phone) : "Nao informado"} />
        </div>

        {/* Documents */}
        <div className="space-y-3">
          <p className="text-gray-600 border-b border-gray-100 pb-1.5" style={{ fontSize: "0.78rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Documentos
          </p>
          <DetailRow icon={CreditCard} label="CPF" value={client.cpf ? formatCpf(client.cpf) : "Nao informado"} mono />
        </div>

        {/* Address */}
        <div className="space-y-3">
          <p className="text-gray-600 border-b border-gray-100 pb-1.5" style={{ fontSize: "0.78rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Endereco
          </p>
          <DetailRow icon={MapPin} label="Endereco" value={client.address || "Nao informado"} />
          <DetailRow
            icon={MapPin}
            label="Cidade/UF"
            value={
              client.city && client.state
                ? `${client.city} / ${client.state}`
                : client.city || client.state || "Nao informado"
            }
          />
          {client.cep && (
            <DetailRow icon={MapPin} label="CEP" value={formatCep(client.cep)} mono />
          )}
        </div>

        {/* Account */}
        <div className="space-y-3 sm:col-span-2 lg:col-span-3">
          <p className="text-gray-600 border-b border-gray-100 pb-1.5" style={{ fontSize: "0.78rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Conta
          </p>
          <div className="flex flex-wrap gap-6">
            <DetailRow icon={Calendar} label="Data do Cadastro" value={formatDate(client.created_at)} />
            <DetailRow icon={Clock} label="Ultimo Acesso" value={client.last_sign_in ? formatDate(client.last_sign_in) : "Nunca acessou"} />
            <div className="flex items-start gap-3">
              {client.email_confirmed ? (
                <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              )}
              <div>
                <p className="text-gray-400" style={{ fontSize: "0.7rem", fontWeight: 500 }}>
                  Email Confirmado
                </p>
                <p
                  className={client.email_confirmed ? "text-green-700" : "text-amber-700"}
                  style={{ fontSize: "0.83rem" }}
                >
                  {client.email_confirmed ? "Sim - conta ativa" : "Nao - pendente de confirmacao"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
