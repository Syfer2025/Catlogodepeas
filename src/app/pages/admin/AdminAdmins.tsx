import { useState, useEffect } from "react";
import {
  Shield,
  ShieldCheck,
  Crown,
  Plus,
  Trash2,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  X,
  Save,
  ChevronDown,
  ChevronUp,
  Mail,
} from "lucide-react";
import * as api from "../../services/api";
import { supabase } from "../../services/supabaseClient";
import { getValidAdminToken } from "./adminAuth";

interface AdminEntry {
  email: string;
  isMaster: boolean;
  permissions: string[];
}

const TAB_LABELS: Record<string, string> = {
  orders: "Pedidos",
  products: "Produtos",
  categories: "Categorias",
  attributes: "Atributos",
  clients: "Clientes",
  banners: "Banners",
  "super-promo": "Super Promo",
  "api-sige": "API SIGE",
  paghiper: "PagHiper",
  mercadopago: "Mercado Pago",
  shipping: "SisFrete",
  "sisfrete-wt": "SisFrete WT",
  ga4: "Analytics",
  "audit-log": "Log de Alterações",
  settings: "Configurações",
  admins: "Administradores",
};

export function AdminAdmins() {
  const [admins, setAdmins] = useState<AdminEntry[]>([]);
  const [allTabs, setAllTabs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Add admin form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPerms, setNewPerms] = useState<string[]>([]);
  const [addLoading, setAddLoading] = useState(false);

  // Expanded admin (for editing permissions)
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
  const [editPerms, setEditPerms] = useState<string[]>([]);
  const [savingPerms, setSavingPerms] = useState(false);

  // Removing admin
  const [removingEmail, setRemovingEmail] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const getToken = async (): Promise<string | null> => {
    try {
      return await getValidAdminToken();
    } catch {
      return null;
    }
  };

  const loadAdmins = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        setError("Sessão expirada.");
        return;
      }
      const data = await api.getAdminList(token);
      setAdmins(data.admins || []);
      setAllTabs(data.allTabs || []);
    } catch (err: any) {
      setError(err.message || "Erro ao carregar admins.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdmins();
  }, []);

  const handleAddAdmin = async () => {
    if (!newEmail.trim()) return;
    setAddLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Sessão expirada.");
      const permsToSend = newPerms.length > 0 ? newPerms : allTabs.filter(function(t) { return t !== "admins"; });
      await api.manageAdmin(token, "add", newEmail.trim(), permsToSend);
      setSuccess("Admin " + newEmail.trim() + " adicionado com sucesso!");
      setNewEmail("");
      setNewPerms([]);
      setShowAddForm(false);
      await loadAdmins();
    } catch (err: any) {
      setError(err.message || "Erro ao adicionar admin.");
    } finally {
      setAddLoading(false);
    }
  };

  const handleRemoveAdmin = async (email: string) => {
    setRemovingEmail(email);
    setError(null);
    setSuccess(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Sessão expirada.");
      await api.manageAdmin(token, "remove", email);
      setSuccess("Admin " + email + " removido com sucesso.");
      setConfirmRemove(null);
      await loadAdmins();
    } catch (err: any) {
      setError(err.message || "Erro ao remover admin.");
    } finally {
      setRemovingEmail(null);
    }
  };

  const handleSavePermissions = async (email: string) => {
    setSavingPerms(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Sessão expirada.");
      await api.updateAdminPermissions(token, email, editPerms);
      setSuccess("Permissões de " + email + " atualizadas!");
      await loadAdmins();
    } catch (err: any) {
      setError(err.message || "Erro ao salvar permissões.");
    } finally {
      setSavingPerms(false);
    }
  };

  const toggleExpand = (email: string, currentPerms: string[]) => {
    if (expandedEmail === email) {
      setExpandedEmail(null);
    } else {
      setExpandedEmail(email);
      setEditPerms([...currentPerms]);
    }
  };

  const togglePerm = (tab: string, isNew?: boolean) => {
    if (isNew) {
      setNewPerms(function(prev) {
        if (prev.indexOf(tab) >= 0) return prev.filter(function(t) { return t !== tab; });
        return prev.concat([tab]);
      });
    } else {
      setEditPerms(function(prev) {
        if (prev.indexOf(tab) >= 0) return prev.filter(function(t) { return t !== tab; });
        return prev.concat([tab]);
      });
    }
  };

  const selectAllPerms = (isNew?: boolean) => {
    if (isNew) {
      setNewPerms([...allTabs]);
    } else {
      setEditPerms([...allTabs]);
    }
  };

  const clearAllPerms = (isNew?: boolean) => {
    if (isNew) {
      setNewPerms([]);
    } else {
      setEditPerms([]);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
        <span className="ml-3 text-gray-500" style={{ fontSize: "0.9rem" }}>Carregando administradores...</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
            <Shield className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-gray-900" style={{ fontSize: "1.25rem", fontWeight: 700 }}>
              Administradores
            </h2>
            <p className="text-gray-500" style={{ fontSize: "0.8rem" }}>
              Gerencie acessos e permissões do painel
            </p>
          </div>
        </div>
        <button
          onClick={() => { setShowAddForm(!showAddForm); setNewEmail(""); setNewPerms([]); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors"
          style={{ fontSize: "0.85rem", fontWeight: 600 }}
        >
          <Plus className="w-4 h-4" />
          Novo Admin
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-red-700" style={{ fontSize: "0.85rem", fontWeight: 600 }}>Erro</p>
            <p className="text-red-600" style={{ fontSize: "0.8rem" }}>{error}</p>
          </div>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
          <p className="text-green-700" style={{ fontSize: "0.85rem" }}>{success}</p>
          <button onClick={() => setSuccess(null)} className="ml-auto text-green-400 hover:text-green-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Add Admin Form */}
      {showAddForm && (
        <div className="mb-6 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h3 className="text-gray-900 mb-4" style={{ fontSize: "1rem", fontWeight: 600 }}>
            Adicionar Administrador
          </h3>

          <div className="mb-4">
            <label className="block text-gray-700 mb-1.5" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
              Email do novo admin
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="email@exemplo.com"
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none text-gray-900"
                style={{ fontSize: "0.85rem" }}
              />
            </div>
            <p className="text-gray-400 mt-1" style={{ fontSize: "0.7rem" }}>
              O usuário deve ter uma conta cadastrada no sistema
            </p>
          </div>

          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-gray-700" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                Permissões de abas
              </label>
              <div className="flex gap-2">
                <button onClick={() => selectAllPerms(true)} className="text-blue-600 hover:underline" style={{ fontSize: "0.7rem" }}>
                  Marcar todas
                </button>
                <span className="text-gray-300">|</span>
                <button onClick={() => clearAllPerms(true)} className="text-blue-600 hover:underline" style={{ fontSize: "0.7rem" }}>
                  Desmarcar todas
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {allTabs.map(function(tab) {
                var checked = newPerms.indexOf(tab) >= 0;
                return (
                  <label
                    key={tab}
                    className={"flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors " +
                      (checked ? "bg-red-50 border-red-300 text-red-700" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100")}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePerm(tab, true)}
                      className="w-3.5 h-3.5 rounded text-red-600 focus:ring-red-500"
                    />
                    <span style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                      {TAB_LABELS[tab] || tab}
                    </span>
                  </label>
                );
              })}
            </div>
            {newPerms.length === 0 && (
              <p className="text-amber-600 mt-1.5" style={{ fontSize: "0.7rem" }}>
                Se nenhuma aba for selecionada, todas (exceto Admins) serão concedidas por padrão
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleAddAdmin}
              disabled={addLoading || !newEmail.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
              style={{ fontSize: "0.85rem", fontWeight: 600 }}
            >
              {addLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Adicionar
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2.5 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-xl transition-colors"
              style={{ fontSize: "0.85rem" }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Admin List */}
      <div className="space-y-3">
        {admins.map(function(admin) {
          var isExpanded = expandedEmail === admin.email;
          var isRemoving = removingEmail === admin.email;
          var isConfirming = confirmRemove === admin.email;

          return (
            <div
              key={admin.email}
              className={"bg-white border rounded-2xl overflow-hidden shadow-sm transition-all " +
                (admin.isMaster ? "border-amber-300 ring-1 ring-amber-200" : "border-gray-200")}
            >
              {/* Admin Row */}
              <div className="flex items-center gap-4 p-5">
                <div className={"w-10 h-10 rounded-full flex items-center justify-center shrink-0 " +
                  (admin.isMaster ? "bg-amber-100" : "bg-gray-100")}>
                  {admin.isMaster
                    ? <Crown className="w-5 h-5 text-amber-600" />
                    : <ShieldCheck className="w-5 h-5 text-gray-500" />
                  }
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-gray-900 truncate" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                      {admin.email}
                    </p>
                    {admin.isMaster && (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full shrink-0" style={{ fontSize: "0.65rem", fontWeight: 700 }}>
                        MASTER
                      </span>
                    )}
                  </div>
                  <p className="text-gray-400" style={{ fontSize: "0.75rem" }}>
                    {admin.isMaster
                      ? "Acesso total a todas as abas"
                      : admin.permissions.length + " aba(s) liberada(s)"
                    }
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!admin.isMaster && (
                    <>
                      <button
                        onClick={() => toggleExpand(admin.email, admin.permissions)}
                        className="flex items-center gap-1.5 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                        style={{ fontSize: "0.8rem" }}
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        Permissões
                      </button>
                      {isConfirming ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleRemoveAdmin(admin.email)}
                            disabled={isRemoving}
                            className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-red-300 transition-colors"
                            style={{ fontSize: "0.75rem", fontWeight: 600 }}
                          >
                            {isRemoving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirmar"}
                          </button>
                          <button
                            onClick={() => setConfirmRemove(null)}
                            className="px-2 py-2 text-gray-500 hover:text-gray-700"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmRemove(admin.email)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Remover admin"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Expanded Permissions */}
              {isExpanded && !admin.isMaster && (
                <div className="border-t border-gray-100 p-5 bg-gray-50/50">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-gray-700" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                      Abas liberadas para {admin.email}
                    </p>
                    <div className="flex gap-2">
                      <button onClick={() => selectAllPerms()} className="text-blue-600 hover:underline" style={{ fontSize: "0.7rem" }}>
                        Todas
                      </button>
                      <span className="text-gray-300">|</span>
                      <button onClick={() => clearAllPerms()} className="text-blue-600 hover:underline" style={{ fontSize: "0.7rem" }}>
                        Nenhuma
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                    {allTabs.map(function(tab) {
                      var checked = editPerms.indexOf(tab) >= 0;
                      return (
                        <label
                          key={tab}
                          className={"flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors " +
                            (checked ? "bg-red-50 border-red-300 text-red-700" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50")}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePerm(tab)}
                            className="w-3.5 h-3.5 rounded text-red-600 focus:ring-red-500"
                          />
                          <span style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                            {TAB_LABELS[tab] || tab}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleSavePermissions(admin.email)}
                      disabled={savingPerms}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white rounded-xl transition-colors"
                      style={{ fontSize: "0.8rem", fontWeight: 600 }}
                    >
                      {savingPerms ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Salvar Permissões
                    </button>
                    <button
                      onClick={() => setExpandedEmail(null)}
                      className="px-3 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-xl"
                      style={{ fontSize: "0.8rem" }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {admins.length === 0 && !loading && (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
          <Shield className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500" style={{ fontSize: "0.9rem" }}>Nenhum administrador encontrado</p>
        </div>
      )}

      {/* Info Card */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-blue-800" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Como funciona?</p>
        <ul className="mt-1.5 space-y-1 text-blue-700" style={{ fontSize: "0.75rem" }}>
          <li>O <strong>Admin Master</strong> (alexmeira@protonmail.com) tem acesso irrevogável a todas as abas.</li>
          <li>Outros admins podem ter acesso restrito a abas específicas.</li>
          <li>Para adicionar um admin, o email deve pertencer a um usuário já cadastrado.</li>
          <li>Remover um admin revoga imediatamente o acesso ao painel.</li>
        </ul>
      </div>
    </div>
  );
}