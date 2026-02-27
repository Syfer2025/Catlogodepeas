import { useState, useEffect, useCallback } from "react";
import {
  MapPin,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Loader2,
  Search,
  Home,
  Building2,
  Star,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from "lucide-react";
import * as api from "../services/api";

interface AddressFormData {
  label: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  isDefault: boolean;
}

const EMPTY_FORM: AddressFormData = {
  label: "",
  cep: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  isDefault: false,
};

const BR_STATES = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
];

const LABEL_OPTIONS = [
  { value: "Casa", icon: Home },
  { value: "Trabalho", icon: Building2 },
  { value: "Outro", icon: MapPin },
];

function formatCepInput(val: string): string {
  const digits = val.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return digits.slice(0, 5) + "-" + digits.slice(5);
}

interface Props {
  accessToken: string;
  selectedAddressId: string | null;
  onSelectAddress: (addr: api.UserAddress | null) => void;
  onAddressesLoaded?: (addresses: api.UserAddress[]) => void;
}

export function CheckoutAddressManager({
  accessToken,
  selectedAddressId,
  onSelectAddress,
  onAddressesLoaded,
}: Props) {
  const [addresses, setAddresses] = useState<api.UserAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AddressFormData>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  // Load addresses
  const loadAddresses = useCallback(async () => {
    try {
      const result = await api.getUserAddresses(accessToken);
      var addrs = result.addresses || [];
      setAddresses(addrs);
      if (onAddressesLoaded) onAddressesLoaded(addrs);

      // Auto-select default or first
      if (addrs.length > 0 && !selectedAddressId) {
        var defAddr = null;
        for (var i = 0; i < addrs.length; i++) {
          if (addrs[i].isDefault) { defAddr = addrs[i]; break; }
        }
        onSelectAddress(defAddr || addrs[0]);
      }

      // If no addresses, auto-open form
      if (addrs.length === 0) {
        setShowForm(true);
      }
    } catch (e) {
      console.error("Load addresses error:", e);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    loadAddresses();
  }, [loadAddresses]);

  // CEP auto-fill via ViaCEP
  const handleCepLookup = useCallback(async (cep: string) => {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setCepLoading(true);
    setCepError(null);
    try {
      const resp = await fetch("https://viacep.com.br/ws/" + digits + "/json/");
      const data = await resp.json();
      if (data.erro) {
        setCepError("CEP não encontrado");
        return;
      }
      setForm(function(prev) {
        return {
          ...prev,
          street: data.logradouro || prev.street,
          neighborhood: data.bairro || prev.neighborhood,
          city: data.localidade || prev.city,
          state: data.uf || prev.state,
          complement: data.complemento || prev.complement,
        };
      });
    } catch {
      setCepError("Erro ao buscar CEP");
    } finally {
      setCepLoading(false);
    }
  }, []);

  const handleCepChange = (val: string) => {
    const formatted = formatCepInput(val);
    setForm(function(prev) { return { ...prev, cep: formatted }; });
    setCepError(null);
    if (formatted.replace(/\D/g, "").length === 8) {
      handleCepLookup(formatted);
    }
  };

  const openNewForm = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, label: "Casa" });
    setShowForm(true);
    setFormError(null);
    setCepError(null);
  };

  const openEditForm = (addr: api.UserAddress) => {
    setEditingId(addr.id);
    setForm({
      label: addr.label,
      cep: formatCepInput(addr.cep),
      street: addr.street,
      number: addr.number,
      complement: addr.complement,
      neighborhood: addr.neighborhood,
      city: addr.city,
      state: addr.state,
      isDefault: addr.isDefault,
    });
    setShowForm(true);
    setFormError(null);
    setCepError(null);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setFormError(null);
    setCepError(null);
  };

  const handleSave = async () => {
    // Validate
    if (!form.street.trim()) {
      setFormError("Informe a rua/logradouro");
      return;
    }
    if (!form.number.trim()) {
      setFormError("Informe o número");
      return;
    }
    if (!form.neighborhood.trim()) {
      setFormError("Informe o bairro");
      return;
    }
    if (!form.city.trim()) {
      setFormError("Informe a cidade");
      return;
    }
    if (!form.state) {
      setFormError("Selecione o estado");
      return;
    }
    if (form.cep.replace(/\D/g, "").length < 8) {
      setFormError("Informe um CEP válido");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      var payload = {
        label: form.label || "Casa",
        street: form.street.trim(),
        number: form.number.trim(),
        complement: form.complement.trim(),
        neighborhood: form.neighborhood.trim(),
        city: form.city.trim(),
        state: form.state,
        cep: form.cep.replace(/\D/g, ""),
        isDefault: form.isDefault || addresses.length === 0,
      };

      var result: any;
      if (editingId) {
        result = await api.updateUserAddress(accessToken, editingId, payload);
      } else {
        result = await api.addUserAddress(accessToken, payload);
      }

      if (result.addresses) {
        setAddresses(result.addresses);
        if (onAddressesLoaded) onAddressesLoaded(result.addresses);
      }

      // Auto-select the saved address
      var savedAddr = result.address;
      if (savedAddr) {
        onSelectAddress(savedAddr);
      }

      setShowForm(false);
      setEditingId(null);
      setForm({ ...EMPTY_FORM });
    } catch (e: any) {
      console.error("Save address error:", e);
      setFormError(e.data?.error || e.message || "Erro ao salvar endereço");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remover este endereço?")) return;
    setDeleting(id);
    try {
      var result = await api.deleteUserAddress(accessToken, id);
      var newAddrs = result.addresses || [];
      setAddresses(newAddrs);
      if (onAddressesLoaded) onAddressesLoaded(newAddrs);

      // If deleted the selected one, select first remaining
      if (selectedAddressId === id) {
        onSelectAddress(newAddrs.length > 0 ? newAddrs[0] : null);
      }

      if (newAddrs.length === 0) {
        setShowForm(true);
      }
    } catch (e: any) {
      console.error("Delete address error:", e);
      alert(e.data?.error || e.message || "Erro ao remover endereço");
    } finally {
      setDeleting(null);
    }
  };

  const formatDisplayAddress = (addr: api.UserAddress): string => {
    var parts = [addr.street];
    if (addr.number) parts[0] = parts[0] + ", " + addr.number;
    if (addr.complement) parts.push(addr.complement);
    if (addr.neighborhood) parts.push(addr.neighborhood);
    return parts.join(" - ");
  };

  const formatDisplayCityState = (addr: api.UserAddress): string => {
    var cepFormatted = addr.cep;
    if (cepFormatted.length === 8) {
      cepFormatted = cepFormatted.slice(0, 5) + "-" + cepFormatted.slice(5);
    }
    return [addr.city, addr.state, cepFormatted].filter(Boolean).join(" - ");
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <MapPin className="w-4 h-4 text-red-600" />
          <span className="text-gray-700" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
            Endereço de Entrega
          </span>
        </div>
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 text-red-500 animate-spin" />
          <span className="ml-2 text-gray-400" style={{ fontSize: "0.82rem" }}>
            Carregando endereços...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-red-600" />
          <span className="text-gray-700" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
            Endereço de Entrega
          </span>
          {addresses.length > 0 && (
            <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full" style={{ fontSize: "0.7rem", fontWeight: 500 }}>
              {addresses.length}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-3">
          {/* Saved addresses */}
          {addresses.length > 0 && !showForm && (
            <div className="space-y-2">
              {addresses.map(function(addr) {
                var isSelected = selectedAddressId === addr.id;
                return (
                  <div
                    key={addr.id}
                    className={
                      "relative rounded-lg border-2 p-3.5 transition-all cursor-pointer " +
                      (isSelected
                        ? "border-red-500 bg-red-50/50 shadow-sm"
                        : "border-gray-200 hover:border-gray-300 bg-white")
                    }
                    onClick={function() {
                      onSelectAddress(addr);
                    }}
                  >
                    <div className="flex items-start gap-3">
                      {/* Radio */}
                      <div className="mt-0.5 shrink-0">
                        <div
                          className={
                            "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors " +
                            (isSelected ? "border-red-500 bg-red-500" : "border-gray-300")
                          }
                        >
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </div>
                      </div>

                      {/* Address info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={isSelected ? "text-red-700" : "text-gray-800"}
                            style={{ fontSize: "0.85rem", fontWeight: 600 }}
                          >
                            {addr.label || "Endereço"}
                          </span>
                          {addr.isDefault && (
                            <span className="inline-flex items-center gap-0.5 bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded" style={{ fontSize: "0.62rem", fontWeight: 600 }}>
                              <Star className="w-2.5 h-2.5" />
                              Padrão
                            </span>
                          )}
                        </div>
                        <p
                          className={isSelected ? "text-red-600" : "text-gray-600"}
                          style={{ fontSize: "0.82rem", lineHeight: 1.4 }}
                        >
                          {formatDisplayAddress(addr)}
                        </p>
                        <p className="text-gray-400" style={{ fontSize: "0.75rem" }}>
                          {formatDisplayCityState(addr)}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={function(e) {
                            e.stopPropagation();
                            openEditForm(addr);
                          }}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                          title="Editar"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {addresses.length > 1 && (
                          <button
                            onClick={function(e) {
                              e.stopPropagation();
                              handleDelete(addr.id);
                            }}
                            disabled={deleting === addr.id}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                            title="Remover"
                          >
                            {deleting === addr.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add button */}
          {!showForm && addresses.length < 10 && (
            <button
              onClick={openNewForm}
              className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-red-400 hover:text-red-600 hover:bg-red-50/30 transition-all cursor-pointer"
              style={{ fontSize: "0.82rem", fontWeight: 600 }}
            >
              <Plus className="w-4 h-4" />
              Adicionar novo endereço
            </button>
          )}

          {/* Address form */}
          {showForm && (
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-gray-700" style={{ fontSize: "0.88rem", fontWeight: 600 }}>
                  {editingId ? "Editar Endereço" : "Novo Endereço"}
                </h4>
                {addresses.length > 0 && (
                  <button
                    onClick={cancelForm}
                    className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Label */}
              <div>
                <label className="block text-gray-500 mb-1.5" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                  Tipo de endereço
                </label>
                <div className="flex gap-2">
                  {LABEL_OPTIONS.map(function(opt) {
                    var isActive = form.label === opt.value;
                    var Icon = opt.icon;
                    return (
                      <button
                        key={opt.value}
                        onClick={function() { setForm(function(p) { return { ...p, label: opt.value }; }); }}
                        className={
                          "flex items-center gap-1.5 px-3 py-2 rounded-lg border transition-all cursor-pointer " +
                          (isActive
                            ? "border-red-500 bg-red-50 text-red-700"
                            : "border-gray-200 bg-white text-gray-600 hover:border-gray-300")
                        }
                        style={{ fontSize: "0.8rem", fontWeight: isActive ? 600 : 400 }}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {opt.value}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* CEP */}
              <div>
                <label className="block text-gray-500 mb-1.5" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                  CEP <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={form.cep}
                    onChange={function(e) { handleCepChange(e.target.value); }}
                    placeholder="00000-000"
                    className={
                      "w-full px-3 py-2.5 border rounded-lg text-gray-800 focus:outline-none focus:ring-2 transition-colors pr-10 " +
                      (cepError
                        ? "border-red-300 bg-red-50 focus:ring-red-200"
                        : "border-gray-200 bg-white focus:ring-red-200 focus:border-red-300")
                    }
                    style={{ fontSize: "0.88rem" }}
                    maxLength={9}
                  />
                  {cepLoading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Loader2 className="w-4 h-4 text-red-500 animate-spin" />
                    </div>
                  )}
                  {!cepLoading && form.cep.replace(/\D/g, "").length === 8 && !cepError && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Search className="w-4 h-4 text-green-500" />
                    </div>
                  )}
                </div>
                {cepError && (
                  <p className="text-red-500 mt-1" style={{ fontSize: "0.72rem" }}>
                    {cepError}
                  </p>
                )}
                <p className="text-gray-400 mt-1" style={{ fontSize: "0.68rem" }}>
                  Digite o CEP para preencher automaticamente
                </p>
              </div>

              {/* Street */}
              <div>
                <label className="block text-gray-500 mb-1.5" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                  Rua / Logradouro <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.street}
                  onChange={function(e) { setForm(function(p) { return { ...p, street: e.target.value }; }); }}
                  placeholder="Ex: Rua das Flores"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300 transition-colors"
                  style={{ fontSize: "0.88rem" }}
                />
              </div>

              {/* Number + Complement */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-500 mb-1.5" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                    Número <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.number}
                    onChange={function(e) { setForm(function(p) { return { ...p, number: e.target.value }; }); }}
                    placeholder="123"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300 transition-colors"
                    style={{ fontSize: "0.88rem" }}
                  />
                </div>
                <div>
                  <label className="block text-gray-500 mb-1.5" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                    Complemento
                  </label>
                  <input
                    type="text"
                    value={form.complement}
                    onChange={function(e) { setForm(function(p) { return { ...p, complement: e.target.value }; }); }}
                    placeholder="Apto 101, Bloco A"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300 transition-colors"
                    style={{ fontSize: "0.88rem" }}
                  />
                </div>
              </div>

              {/* Neighborhood */}
              <div>
                <label className="block text-gray-500 mb-1.5" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                  Bairro <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.neighborhood}
                  onChange={function(e) { setForm(function(p) { return { ...p, neighborhood: e.target.value }; }); }}
                  placeholder="Centro"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300 transition-colors"
                  style={{ fontSize: "0.88rem" }}
                />
              </div>

              {/* City + State */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-gray-500 mb-1.5" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                    Cidade <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={function(e) { setForm(function(p) { return { ...p, city: e.target.value }; }); }}
                    placeholder="Maringá"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300 transition-colors"
                    style={{ fontSize: "0.88rem" }}
                  />
                </div>
                <div>
                  <label className="block text-gray-500 mb-1.5" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                    Estado <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.state}
                    onChange={function(e) { setForm(function(p) { return { ...p, state: e.target.value }; }); }}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300 transition-colors appearance-none cursor-pointer"
                    style={{ fontSize: "0.88rem" }}
                  >
                    <option value="">UF</option>
                    {BR_STATES.map(function(st) {
                      return <option key={st} value={st}>{st}</option>;
                    })}
                  </select>
                </div>
              </div>

              {/* Default checkbox */}
              {addresses.length > 0 && !editingId && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isDefault}
                    onChange={function(e) { setForm(function(p) { return { ...p, isDefault: e.target.checked }; }); }}
                    className="w-4 h-4 accent-red-600 cursor-pointer"
                  />
                  <span className="text-gray-600" style={{ fontSize: "0.8rem" }}>
                    Definir como endereço padrão
                  </span>
                </label>
              )}

              {/* Error */}
              {formError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <p className="text-red-600" style={{ fontSize: "0.78rem" }}>
                    {formError}
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 bg-red-600 text-white py-2.5 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  style={{ fontSize: "0.85rem", fontWeight: 600 }}
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      {editingId ? "Atualizar" : "Salvar Endereço"}
                    </>
                  )}
                </button>
                {addresses.length > 0 && (
                  <button
                    onClick={cancelForm}
                    disabled={saving}
                    className="px-4 py-2.5 bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300 transition-colors cursor-pointer"
                    style={{ fontSize: "0.85rem", fontWeight: 500 }}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          )}

          {/* No addresses warning */}
          {addresses.length === 0 && !showForm && (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-amber-800" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                  Nenhum endereço cadastrado
                </p>
                <p className="text-amber-700 mt-0.5" style={{ fontSize: "0.78rem" }}>
                  Adicione um endereço de entrega para continuar.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}