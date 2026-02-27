import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  Users,
  UserCheck,
  UserX,
  RefreshCw,
  ArrowRightLeft,
  ShoppingCart,
  Plus,
  Trash2,
  Package,
  Hash,
  DollarSign,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  Link2,
  Unlink,
  FileText,
  Send,
  ListOrdered,
  ChevronUp,
} from "lucide-react";
import { getValidAdminToken } from "./adminAuth";
import * as api from "../../services/api";

interface SigeIntegrationModuleProps {
  isConnected: boolean;
}

interface SyncClient {
  id: string;
  email: string;
  name: string;
  phone: string;
  cpf: string;
  address: string;
  city: string;
  state: string;
  cep: string;
  created_at: string;
  sigeSynced: boolean;
  sigeCustomerId: string | null;
  sigeSyncedAt: string | null;
}

interface SaleItem {
  codProduto: string;
  codRef: string;
  quantidade: number;
  valorUnitario: string;
  desconto: string;
  valorFrete: string;
  valorEncargos: string;
  valorSeguro: string;
  ncm: string;
}

type ActiveTab = "sync" | "sale" | "orders";

export function SigeIntegrationModule({ isConnected }: SigeIntegrationModuleProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("sync");

  // ─── Sync state ───
  const [clients, setClients] = useState<SyncClient[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  const [syncError, setSyncError] = useState("");
  const [syncSuccess, setSyncSuccess] = useState("");
  const [syncStats, setSyncStats] = useState({ total: 0, synced: 0 });
  const [filterSync, setFilterSync] = useState<"all" | "synced" | "not-synced">("all");

  // ─── Sale state ───
  const [saleCustomerId, setSaleCustomerId] = useState("");
  const [saleCustomerSearch, setSaleCustomerSearch] = useState("");
  const [saleTipoPedido, setSaleTipoPedido] = useState("704");
  const [saleObservacao, setSaleObservacao] = useState("");
  const [saleObservacaoInterna, setSaleObservacaoInterna] = useState("");
  const [saleCodVendedor, setSaleCodVendedor] = useState("");
  const [saleCodCondPgto, setSaleCodCondPgto] = useState("");
  const [saleCodFilial, setSaleCodFilial] = useState("");
  const [saleCodDeposito, setSaleCodDeposito] = useState("");
  const [saleNomeAux, setSaleNomeAux] = useState("");
  const [saleNumDoctoAux, setSaleNumDoctoAux] = useState("");
  const [saleCodTransportador, setSaleCodTransportador] = useState("");
  const [saleTipoFrete, setSaleTipoFrete] = useState("");
  const [saleCodCarteira, setSaleCodCarteira] = useState("");
  const [saleCodLista, setSaleCodLista] = useState("");
  const [saleCodCategoria, setSaleCodCategoria] = useState("");
  const [saleCodMoeda, setSaleCodMoeda] = useState("");
  const [saleCodAtividade, setSaleCodAtividade] = useState("");
  const [saleDescMensagem1, setSaleDescMensagem1] = useState("");
  const [saleDescMensagem2, setSaleDescMensagem2] = useState("");
  const [saleDescMensagem3, setSaleDescMensagem3] = useState("");
  const [saleDescMensagem4, setSaleDescMensagem4] = useState("");
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);
  const [showItemAdvanced, setShowItemAdvanced] = useState<number | null>(null);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([
    { codProduto: "", codRef: "", quantidade: 1, valorUnitario: "", desconto: "", valorFrete: "", valorEncargos: "", valorSeguro: "", ncm: "" },
  ]);
  const [creatingSale, setCreatingSale] = useState(false);
  const [saleResult, setSaleResult] = useState<any>(null);
  const [saleError, setSaleError] = useState("");

  // ─── Debug state ───
  const [debugRunning, setDebugRunning] = useState(false);
  const [debugResult, setDebugResult] = useState<any>(null);

  // ─── Order Types discovery state ───
  const [orderTypesLoading, setOrderTypesLoading] = useState(false);
  const [orderTypesResult, setOrderTypesResult] = useState<any>(null);
  const [tipoMvTestLoading, setTipoMvTestLoading] = useState(false);
  const [tipoMvTestResult, setTipoMvTestResult] = useState<any>(null);

  // ─── Orders state ───
  const [sales, setSales] = useState<any[]>([]);
  const [loadingSales, setLoadingSales] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  // ─── SIGE Customer Search (for sale form) ───
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  const [showCustomerResults, setShowCustomerResults] = useState(false);

  const getAccessToken = useCallback(async (): Promise<string> => {
    const token = await getValidAdminToken();
    if (!token) throw new Error("Sessão expirada");
    return token;
  }, []);

  // ─── Load sync status ───
  const loadSyncStatus = useCallback(async () => {
    setLoadingClients(true);
    setSyncError("");
    try {
      const token = await getAccessToken();
      const result = await api.sigeSyncCustomerStatus(token);
      setClients(result.clients || []);
      setSyncStats({ total: result.total || 0, synced: result.synced || 0 });
    } catch (e: any) {
      setSyncError(e.message || "Erro ao carregar status de sincronizacao.");
    } finally {
      setLoadingClients(false);
    }
  }, [getAccessToken]);

  // ─── Load sales ───
  const loadSales = useCallback(async () => {
    setLoadingSales(true);
    try {
      const token = await getAccessToken();
      const result = await api.sigeListSales(token);
      setSales(result.sales || []);
    } catch (e: any) {
      console.log("Error loading sales:", e.message);
    } finally {
      setLoadingSales(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (expanded && isConnected) {
      if (activeTab === "sync") loadSyncStatus();
      if (activeTab === "orders") loadSales();
    }
  }, [expanded, isConnected, activeTab, loadSyncStatus, loadSales]);

  // ─── Sync a client to SIGE ───
  const handleSyncClient = async (siteUserId: string) => {
    setSyncingId(siteUserId);
    setSyncError("");
    setSyncSuccess("");
    try {
      const token = await getAccessToken();
      const result = await api.sigeSyncCustomer(token, siteUserId);
      if (result.alreadySynced) {
        setSyncSuccess(`Cliente já estava sincronizado (SIGE ID: ${result.mapping?.sigeCustomerId || "?"})`);
      } else if (result.synced) {
        const note = result.linkedExisting
          ? `Vinculado a cliente existente no SIGE! ID: ${result.mapping?.sigeCustomerId || "?"}`
          : `Sincronizado com sucesso! SIGE ID: ${result.mapping?.sigeCustomerId || "?"}`;
        const extra = result.note ? ` (${result.note})` : "";
        setSyncSuccess(note + extra);
      }
      await loadSyncStatus();
    } catch (e: any) {
      setSyncError(e.message || "Erro ao sincronizar.");
    } finally {
      setSyncingId(null);
    }
  };

  // ─── Unlink a client from SIGE ───
  const handleUnlinkClient = async (siteUserId: string) => {
    if (!confirm("Remover vínculo deste cliente com o SIGE? (não exclui no SIGE)")) return;
    setUnlinkingId(siteUserId);
    setSyncError("");
    setSyncSuccess("");
    try {
      const token = await getAccessToken();
      await api.sigeSyncCustomerRemove(token, siteUserId);
      setSyncSuccess("Vinculo removido.");
      await loadSyncStatus();
    } catch (e: any) {
      setSyncError(e.message || "Erro ao desvincular.");
    } finally {
      setUnlinkingId(null);
    }
  };

  // ─── Search SIGE customer ───
  const handleSearchCustomer = async () => {
    if (!saleCustomerSearch.trim()) return;
    setSearchingCustomer(true);
    setCustomerResults([]);
    try {
      const token = await getAccessToken();
      const result = await api.sigeCustomerSearch(token, {
        nomeCadastro: saleCustomerSearch.trim(),
        limit: "10",
        offset: "1",
      });
      const dados = result?.dados || result?.data || (Array.isArray(result) ? result : []);
      setCustomerResults(Array.isArray(dados) ? dados : [dados].filter(Boolean));
      setShowCustomerResults(true);
    } catch (e: any) {
      console.log("Customer search error:", e.message);
    } finally {
      setSearchingCustomer(false);
    }
  };

  // ─── Add/remove sale items ───
  const addSaleItem = () => {
    setSaleItems([...saleItems, { codProduto: "", codRef: "", quantidade: 1, valorUnitario: "", desconto: "", valorFrete: "", valorEncargos: "", valorSeguro: "", ncm: "" }]);
  };

  const removeSaleItem = (index: number) => {
    if (saleItems.length <= 1) return;
    setSaleItems(saleItems.filter((_, i) => i !== index));
  };

  const updateSaleItem = (index: number, field: keyof SaleItem, value: string | number) => {
    const updated = [...saleItems];
    (updated[index] as any)[field] = value;
    setSaleItems(updated);
  };

  // ─── Create sale ───
  const handleCreateSale = async () => {
    setSaleError("");
    setSaleResult(null);
    if (!saleCustomerId.trim()) {
      setSaleError("Informe o código do cliente no SIGE.");
      return;
    }
    const validItems = saleItems.filter((i) => i.codProduto.trim());
    if (validItems.length === 0) {
      setSaleError("Adicione pelo menos 1 produto.");
      return;
    }

    setCreatingSale(true);
    try {
      const token = await getAccessToken();
      // Build observacao: if any descMensagem is filled, send as object; otherwise send simple string
      let observacaoPayload: api.CreateSalePayload["observacao"] = undefined;
      const hasDescMensagem = saleDescMensagem1.trim() || saleDescMensagem2.trim() || saleDescMensagem3.trim() || saleDescMensagem4.trim();
      if (hasDescMensagem || saleObservacao.trim()) {
        if (hasDescMensagem) {
          observacaoPayload = {
            ...(saleDescMensagem1.trim() ? { descMensagem1: saleDescMensagem1.trim() } : {}),
            ...(saleDescMensagem2.trim() ? { descMensagem2: saleDescMensagem2.trim() } : {}),
            ...(saleDescMensagem3.trim() ? { descMensagem3: saleDescMensagem3.trim() } : {}),
            ...(saleDescMensagem4.trim() ? { descMensagem4: saleDescMensagem4.trim() } : {}),
            ...(saleObservacao.trim() ? { observacao: saleObservacao.trim() } : {}),
          };
        } else {
          observacaoPayload = saleObservacao.trim();
        }
      }

      const payload: api.CreateSalePayload = {
        codCliente: saleCustomerId.trim(),
        items: validItems.map((i) => ({
          codProduto: i.codProduto.trim(),
          codRef: i.codRef?.trim() || undefined,  // Let backend resolve from SIGE references if not explicitly set
          quantidade: Number(i.quantidade) || 1,
          valorUnitario: i.valorUnitario ? Number(i.valorUnitario) : 0,  // REQUIRED by SIGE — backend auto-resolves if 0
          desconto: i.desconto ? Number(i.desconto) : undefined,
          valorFrete: i.valorFrete ? Number(i.valorFrete) : undefined,
          valorEncargos: i.valorEncargos ? Number(i.valorEncargos) : undefined,
          valorSeguro: i.valorSeguro ? Number(i.valorSeguro) : undefined,
          ncm: i.ncm?.trim() || undefined,
        })),
        tipoPedido: saleTipoPedido || "704",
        observacao: observacaoPayload,
        observacaoInterna: saleObservacaoInterna.trim() || undefined,
        codVendedor: saleCodVendedor.trim() || undefined,
        codCondPgto: saleCodCondPgto.trim() || undefined,
        codFilial: saleCodFilial.trim() || undefined,
        codDeposito: saleCodDeposito.trim() || undefined,
        nomeAux: saleNomeAux.trim() || undefined,
        numDoctoAux: saleNumDoctoAux.trim() || undefined,
        codTransportador: saleCodTransportador.trim() || undefined,
        tipoFrete: saleTipoFrete.trim() || undefined,
        codCarteira: saleCodCarteira.trim() || undefined,
        codLista: saleCodLista.trim() || undefined,
        codCategoria: saleCodCategoria.trim() || undefined,
        codMoeda: saleCodMoeda.trim() || undefined,
        codAtividade: saleCodAtividade.trim() || undefined,
      };
      const result = await api.sigeCreateSale(token, payload);
      setSaleResult(result);
      if (result.success) {
        setSaleItems([{ codProduto: "", codRef: "", quantidade: 1, valorUnitario: "", desconto: "", valorFrete: "", valorEncargos: "", valorSeguro: "", ncm: "" }]);
        setSaleObservacao("");
        setSaleObservacaoInterna("");
        setSaleNomeAux("");
        setSaleNumDoctoAux("");
        setSaleDescMensagem1("");
        setSaleDescMensagem2("");
        setSaleDescMensagem3("");
        setSaleDescMensagem4("");
        setSaleCodTransportador("");
        setSaleTipoFrete("");
        setSaleCodCarteira("");
        setSaleCodLista("");
        setSaleCodCategoria("");
        setSaleCodMoeda("");
        setSaleCodAtividade("");
        setShowItemAdvanced(null);
      }
    } catch (e: any) {
      setSaleError(e.message || "Erro ao criar venda.");
      // Extract full error body with steps, sentPayload, orderId, warning for debug display
      if (e.data) {
        setSaleResult({
          success: false,
          orderId: e.data.orderId || null,
          steps: e.data.steps || [],
          sentPayload: e.data.sentPayload || null,
          warning: e.data.warning || null,
          order: e.data.order || null,
        });
      }
    } finally {
      setCreatingSale(false);
    }
  };

  // ─── Debug POST /order ───
  const handleDebugOrder = async () => {
    setDebugRunning(true);
    setDebugResult(null);
    try {
      const token = await getAccessToken();
      const validItems = saleItems.filter((i) => i.codProduto.trim()).map((i) => ({
        codProduto: i.codProduto.trim(),
        qtdeUnd: Number(i.quantidade) || 1,
        valorUnitario: i.valorUnitario ? Number(i.valorUnitario) : undefined,
        valorDesconto: i.desconto ? Number(i.desconto) : undefined,
      }));
      const result = await api.sigeDebugCreateOrder(token, {
        codCliFor: Number(saleCustomerId.trim()),
        codTipoMv: saleTipoPedido || "704",
        items: validItems.length > 0 ? validItems : undefined,
      });
      setDebugResult(result);
    } catch (e: any) {
      setDebugResult({ error: e.message, data: e.data || null });
    } finally {
      setDebugRunning(false);
    }
  };

  // ─── List Order Types (discover codTipoMv) ───
  const handleListOrderTypes = async () => {
    setOrderTypesLoading(true);
    setOrderTypesResult(null);
    try {
      const token = await getAccessToken();
      const result = await api.sigeListOrderTypes(token);
      setOrderTypesResult(result);
    } catch (e: any) {
      setOrderTypesResult({ error: e.message, data: e.data || null });
    } finally {
      setOrderTypesLoading(false);
    }
  };

  // ─── Test codTipoMv values ───
  const handleTestTipoMv = async () => {
    setTipoMvTestLoading(true);
    setTipoMvTestResult(null);
    try {
      const token = await getAccessToken();
      const validItems = saleItems.filter((i) => i.codProduto.trim()).map((i) => ({
        codProduto: i.codProduto.trim(),
        codRef: i.codRef?.trim() || undefined,  // Let backend resolve
        qtdeUnd: Number(i.quantidade) || 1,
        valorUnitario: i.valorUnitario ? Number(i.valorUnitario) : 100,
      }));
      const result = await api.sigeTestOrderTipoMv(token, {
        codCliFor: Number(saleCustomerId.trim()),
        items: validItems.length > 0 ? validItems : undefined,
      });
      setTipoMvTestResult(result);
      // If a working value was found, auto-set it
      if (result.workingValue) {
        setSaleTipoPedido(result.workingValue);
      }
    } catch (e: any) {
      setTipoMvTestResult({ error: e.message, data: e.data || null });
    } finally {
      setTipoMvTestLoading(false);
    }
  };

  // ─── Filter clients ───
  const filteredClients = clients.filter((c) => {
    if (filterSync === "synced") return c.sigeSynced;
    if (filterSync === "not-synced") return !c.sigeSynced;
    return true;
  });

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    try {
      return new Date(dateStr).toLocaleDateString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    } catch { return dateStr; }
  };

  const inputClass = "w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 placeholder-gray-400 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 focus:bg-white transition-all";
  const inputStyle = { fontSize: "0.82rem" } as const;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-red-100 to-orange-100 rounded-lg flex items-center justify-center shrink-0">
            <ArrowRightLeft className="w-5 h-5 text-red-600" />
          </div>
          <div className="text-left">
            <h4 className="text-gray-900" style={{ fontSize: "0.95rem", fontWeight: 700 }}>
              Integração Site + SIGE
            </h4>
            <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>
              Sincronizar clientes, criar vendas e acompanhar pedidos
            </p>
          </div>
          <span className="px-2.5 py-1 bg-red-50 text-red-600 rounded-full" style={{ fontSize: "0.68rem", fontWeight: 700 }}>
            NOVO
          </span>
        </div>
        {expanded ? (
          <ChevronDown className="w-4.5 h-4.5 text-gray-400" />
        ) : (
          <ChevronRight className="w-4.5 h-4.5 text-gray-400" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-gray-100">
          {!isConnected ? (
            <div className="p-6 flex items-center gap-3 bg-amber-50">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
              <p className="text-amber-700" style={{ fontSize: "0.85rem" }}>
                Conecte-se ao SIGE primeiro para usar as funcionalidades de integração.
              </p>
            </div>
          ) : (
            <>
              {/* Tab Bar */}
              <div className="flex border-b border-gray-100 bg-gray-50/50">
                {([
                  { id: "sync" as const, label: "Sync Clientes", icon: Users, count: syncStats.total },
                  { id: "sale" as const, label: "Nova Venda", icon: ShoppingCart },
                  { id: "orders" as const, label: "Vendas Realizadas", icon: ListOrdered, count: sales.length },
                ]).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-5 py-3 transition-colors cursor-pointer border-b-2 ${
                      activeTab === tab.id
                        ? "border-red-500 text-red-700 bg-white"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100/50"
                    }`}
                    style={{ fontSize: "0.82rem", fontWeight: activeTab === tab.id ? 600 : 500 }}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                    {tab.count !== undefined && (
                      <span className={`px-1.5 py-0.5 rounded-full ${
                        activeTab === tab.id ? "bg-red-100 text-red-600" : "bg-gray-200 text-gray-500"
                      }`} style={{ fontSize: "0.65rem", fontWeight: 700 }}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* ═══ TAB 1: Sync Clientes ═══ */}
              {activeTab === "sync" && (
                <div className="p-5 space-y-4">
                  {/* Info banner */}
                  <div className="flex items-start gap-2.5 p-3.5 bg-blue-50 border border-blue-100 rounded-lg">
                    <Link2 className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-blue-800" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                        Sincronizacao de Clientes Site → SIGE
                      </p>
                      <p className="text-blue-600 mt-0.5" style={{ fontSize: "0.75rem" }}>
                        Novos cadastros no site são sincronizados automaticamente. Aqui você pode sincronizar clientes existentes
                        ou re-sincronizar manualmente. A sincronizacao cria o cliente no SIGE com os dados do perfil do site.
                      </p>
                    </div>
                  </div>

                  {/* Stats + Controls */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg">
                        <Users className="w-3.5 h-3.5 text-gray-500" />
                        <span className="text-gray-700" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                          {syncStats.total} clientes
                        </span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-100 rounded-lg">
                        <UserCheck className="w-3.5 h-3.5 text-green-600" />
                        <span className="text-green-700" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                          {syncStats.synced} sincronizados
                        </span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-100 rounded-lg">
                        <UserX className="w-3.5 h-3.5 text-amber-600" />
                        <span className="text-amber-700" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                          {syncStats.total - syncStats.synced} pendentes
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={filterSync}
                        onChange={(e) => setFilterSync(e.target.value as any)}
                        className="px-3 py-1.5 border border-gray-200 rounded-lg bg-white text-gray-700 outline-none cursor-pointer"
                        style={{ fontSize: "0.78rem" }}
                      >
                        <option value="all">Todos</option>
                        <option value="synced">Sincronizados</option>
                        <option value="not-synced">Pendentes</option>
                      </select>
                      <button
                        onClick={loadSyncStatus}
                        disabled={loadingClients}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 cursor-pointer"
                        style={{ fontSize: "0.78rem", fontWeight: 500 }}
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingClients ? "animate-spin" : ""}`} />
                        Atualizar
                      </button>
                    </div>
                  </div>

                  {/* Alerts */}
                  {syncError && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-lg">
                      <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                      <p className="text-red-700" style={{ fontSize: "0.78rem" }}>{syncError}</p>
                    </div>
                  )}
                  {syncSuccess && (
                    <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-100 rounded-lg">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <p className="text-green-700" style={{ fontSize: "0.78rem" }}>{syncSuccess}</p>
                    </div>
                  )}

                  {/* Client list */}
                  {loadingClients ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 text-red-500 animate-spin" />
                    </div>
                  ) : filteredClients.length === 0 ? (
                    <div className="text-center py-8 text-gray-400" style={{ fontSize: "0.85rem" }}>
                      Nenhum cliente encontrado.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredClients.map((client) => (
                        <div
                          key={client.id}
                          className={`border rounded-lg p-3.5 transition-colors ${
                            client.sigeSynced
                              ? "border-green-200 bg-green-50/30"
                              : "border-gray-200 bg-white hover:bg-gray-50/50"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-gray-900 truncate" style={{ fontSize: "0.88rem", fontWeight: 600 }}>
                                  {client.name || "Sem nome"}
                                </p>
                                {client.sigeSynced ? (
                                  <span className="flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full shrink-0"
                                    style={{ fontSize: "0.65rem", fontWeight: 700 }}>
                                    <CheckCircle2 className="w-3 h-3" />
                                    SIGE #{client.sigeCustomerId}
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full shrink-0"
                                    style={{ fontSize: "0.65rem", fontWeight: 700 }}>
                                    <AlertTriangle className="w-3 h-3" />
                                    NAO SINCRONIZADO
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-gray-500" style={{ fontSize: "0.75rem" }}>
                                <span>{client.email}</span>
                                {client.cpf && <span>CPF: {client.cpf}</span>}
                                {client.phone && <span>Tel: {client.phone}</span>}
                              </div>
                              {client.sigeSyncedAt && (
                                <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.68rem" }}>
                                  Sincronizado em: {formatDate(client.sigeSyncedAt)}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {client.sigeSynced ? (
                                <button
                                  onClick={() => handleUnlinkClient(client.id)}
                                  disabled={unlinkingId === client.id}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50 cursor-pointer"
                                  style={{ fontSize: "0.75rem", fontWeight: 500 }}
                                >
                                  {unlinkingId === client.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Unlink className="w-3.5 h-3.5" />
                                  )}
                                  Desvincular
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleSyncClient(client.id)}
                                  disabled={syncingId === client.id}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 cursor-pointer"
                                  style={{ fontSize: "0.75rem", fontWeight: 600 }}
                                >
                                  {syncingId === client.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <ArrowRightLeft className="w-3.5 h-3.5" />
                                  )}
                                  Sincronizar
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ═══ TAB 2: Nova Venda ═══ */}
              {activeTab === "sale" && (
                <div className="p-5 space-y-5">
                  {/* Info banner */}
                  <div className="flex items-start gap-2.5 p-3.5 bg-blue-50 border border-blue-100 rounded-lg">
                    <ShoppingCart className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-blue-800" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                        Criar Venda no SIGE
                      </p>
                      <p className="text-blue-600 mt-0.5" style={{ fontSize: "0.75rem" }}>
                        Cria um pedido no SIGE via{" "}
                        <code className="bg-blue-100 px-1 rounded text-blue-800">POST /order</code>{" "}
                        com cabeçalho + items juntos (campos obrigatórios: codCliFor, codTipoMv, items).
                        Se houver observacao, ela e enviada separadamente via{" "}
                        <code className="bg-blue-100 px-1 rounded text-blue-800">POST /order/{"{id}"}/observation</code>.
                        Use o código do cliente SIGE (codCliFor — pode buscar abaixo).
                      </p>
                    </div>
                  </div>

                  {/* Customer section */}
                  <div className="space-y-3">
                    <h5 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "0.88rem", fontWeight: 600 }}>
                      <Users className="w-4 h-4 text-gray-500" />
                      Cliente
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-gray-600 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                          Cod. Cliente SIGE *
                        </label>
                        <input
                          type="text"
                          value={saleCustomerId}
                          onChange={(e) => setSaleCustomerId(e.target.value)}
                          placeholder="Ex: 123"
                          className={inputClass}
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label className="block text-gray-600 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                          Buscar cliente no SIGE
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={saleCustomerSearch}
                            onChange={(e) => setSaleCustomerSearch(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSearchCustomer()}
                            placeholder="Nome ou CPF..."
                            className={inputClass}
                            style={inputStyle}
                          />
                          <button
                            onClick={handleSearchCustomer}
                            disabled={searchingCustomer || !saleCustomerSearch.trim()}
                            className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors disabled:opacity-50 cursor-pointer shrink-0"
                            style={{ fontSize: "0.78rem" }}
                          >
                            {searchingCustomer ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Customer search results */}
                    {showCustomerResults && customerResults.length > 0 && (
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                          <span className="text-gray-600" style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                            Resultados ({customerResults.length})
                          </span>
                          <button onClick={() => setShowCustomerResults(false)}
                            className="text-gray-400 hover:text-gray-600 cursor-pointer">
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="max-h-48 overflow-y-auto divide-y divide-gray-100">
                          {customerResults.map((cust: any, idx: number) => (
                            <button
                              key={idx}
                              onClick={() => {
                                setSaleCustomerId(String(cust.codCadastro || cust.id || cust.codigo || ""));
                                setShowCustomerResults(false);
                              }}
                              className="w-full px-3 py-2 text-left hover:bg-red-50 transition-colors cursor-pointer"
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-gray-800" style={{ fontSize: "0.82rem", fontWeight: 500 }}>
                                    {cust.nomeCadastro || cust.nome || "?"}
                                  </p>
                                  <p className="text-gray-400" style={{ fontSize: "0.7rem" }}>
                                    {cust.cpfCgc && `CPF/CNPJ: ${cust.cpfCgc}`}
                                    {cust.email && ` | ${cust.email}`}
                                  </p>
                                </div>
                                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded" style={{ fontSize: "0.7rem", fontWeight: 600 }}>
                                  #{cust.codCadastro || cust.id || cust.codigo}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Use synced client shortcut */}
                    {clients.filter((c) => c.sigeSynced).length > 0 && (
                      <div>
                        <label className="block text-gray-500 mb-1" style={{ fontSize: "0.7rem", fontWeight: 500 }}>
                          Ou selecione um cliente já sincronizado:
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {clients.filter((c) => c.sigeSynced).map((c) => (
                            <button
                              key={c.id}
                              onClick={() => setSaleCustomerId(c.sigeCustomerId || "")}
                              className={`px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                                saleCustomerId === c.sigeCustomerId
                                  ? "bg-red-50 border-red-300 text-red-700"
                                  : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                              }`}
                              style={{ fontSize: "0.72rem", fontWeight: 500 }}
                            >
                              {c.name || c.email} (#{c.sigeCustomerId})
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Order config */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-gray-600 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                        Tipo Pedido
                      </label>
                      <select
                        value={saleTipoPedido}
                        onChange={(e) => setSaleTipoPedido(e.target.value)}
                        className={inputClass + " cursor-pointer"}
                        style={inputStyle}
                      >
                        <option value="704">704 - Pedido de Venda Ecommerce (PVE)</option>
                        <option value="700">700 - Pedido de Venda (PVE)</option>
                        <option value="705">705 - Pedido de Venda Cliente Entrega (PVE)</option>
                        <option value="600">600 - Orçamento de Venda (ORV)</option>
                        <option value="900">900 - NF Saida C/ Financeiro (NFL)</option>
                        <option value="714">714 - Pedido de Venda (PVE)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-gray-600 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                        Cod. Vendedor (opcional)
                      </label>
                      <input
                        type="text"
                        value={saleCodVendedor}
                        onChange={(e) => setSaleCodVendedor(e.target.value)}
                        placeholder="Ex: 1"
                        className={inputClass}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label className="block text-gray-600 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                        Observacao (opcional)
                      </label>
                      <input
                        type="text"
                        value={saleObservacao}
                        onChange={(e) => setSaleObservacao(e.target.value)}
                        placeholder="Obs. do pedido..."
                        className={inputClass}
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  {/* Advanced fields toggle */}
                  <button
                    type="button"
                    onClick={() => setShowAdvancedFields(!showAdvancedFields)}
                    className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
                    style={{ fontSize: "0.78rem", fontWeight: 500 }}
                  >
                    {showAdvancedFields ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    Campos Opcionais SIGE (Financeiro, Logistica, Observacoes, Classificacao)
                  </button>

                  {showAdvancedFields && (
                    <div className="space-y-3 p-4 bg-gray-50 border border-gray-100 rounded-lg">
                      {/* Row 1: Financeiro / Logistica */}
                      <p className="text-gray-500" style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Financeiro & Logistica
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-gray-600 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                            Cond. Pagamento
                          </label>
                          <input
                            type="text"
                            value={saleCodCondPgto}
                            onChange={(e) => setSaleCodCondPgto(e.target.value)}
                            placeholder="codCondPgto"
                            className={inputClass}
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label className="block text-gray-600 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                            Cod. Filial
                          </label>
                          <input
                            type="text"
                            value={saleCodFilial}
                            onChange={(e) => setSaleCodFilial(e.target.value)}
                            placeholder="codFilial"
                            className={inputClass}
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label className="block text-gray-600 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                            Cod. Deposito/Local
                          </label>
                          <input
                            type="text"
                            value={saleCodDeposito}
                            onChange={(e) => setSaleCodDeposito(e.target.value)}
                            placeholder="codLocal"
                            className={inputClass}
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label className="block text-gray-600 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                            Cod. Transportador
                          </label>
                          <input
                            type="text"
                            value={saleCodTransportador}
                            onChange={(e) => setSaleCodTransportador(e.target.value)}
                            placeholder="codTransportador1"
                            className={inputClass}
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label className="block text-gray-600 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                            Tipo Frete
                          </label>
                          <select
                            value={saleTipoFrete}
                            onChange={(e) => setSaleTipoFrete(e.target.value)}
                            className={inputClass + " cursor-pointer"}
                            style={inputStyle}
                          >
                            <option value="">-- Nenhum --</option>
                            <option value="C">C - CIF (por conta do emitente)</option>
                            <option value="F">F - FOB (por conta do destinatario)</option>
                            <option value="T">T - Terceiros</option>
                            <option value="S">S - Sem frete</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-gray-600 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                            Cod. Carteira
                          </label>
                          <input
                            type="text"
                            value={saleCodCarteira}
                            onChange={(e) => setSaleCodCarteira(e.target.value)}
                            placeholder="codCarteira"
                            className={inputClass}
                            style={inputStyle}
                          />
                        </div>
                      </div>

                      {/* Row 2: Classificação */}
                      <p className="text-gray-500 mt-2" style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Classificação & Outros
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-gray-600 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                            Cod. Lista Preco
                          </label>
                          <input
                            type="text"
                            value={saleCodLista}
                            onChange={(e) => setSaleCodLista(e.target.value)}
                            placeholder="codLista"
                            className={inputClass}
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label className="block text-gray-600 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                            Cod. Categoria
                          </label>
                          <input
                            type="text"
                            value={saleCodCategoria}
                            onChange={(e) => setSaleCodCategoria(e.target.value)}
                            placeholder="codCategoria"
                            className={inputClass}
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label className="block text-gray-600 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                            Cod. Moeda
                          </label>
                          <input
                            type="text"
                            value={saleCodMoeda}
                            onChange={(e) => setSaleCodMoeda(e.target.value)}
                            placeholder="codMoeda"
                            className={inputClass}
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label className="block text-gray-600 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                            Cod. Atividade
                          </label>
                          <input
                            type="text"
                            value={saleCodAtividade}
                            onChange={(e) => setSaleCodAtividade(e.target.value)}
                            placeholder="codAtividade"
                            className={inputClass}
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label className="block text-gray-600 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                            Nome Auxiliar
                          </label>
                          <input
                            type="text"
                            value={saleNomeAux}
                            onChange={(e) => setSaleNomeAux(e.target.value)}
                            placeholder="nomeAux"
                            className={inputClass}
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label className="block text-gray-600 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                            Num. Documento Aux.
                          </label>
                          <input
                            type="text"
                            value={saleNumDoctoAux}
                            onChange={(e) => setSaleNumDoctoAux(e.target.value)}
                            placeholder="numDoctoAux"
                            className={inputClass}
                            style={inputStyle}
                          />
                        </div>
                      </div>

                      {/* Row 3: Observacoes */}
                      <p className="text-gray-500 mt-2" style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Observacoes (objeto SIGE)
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-gray-600 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                            Obs. Interna (observacaoInterna)
                          </label>
                          <input
                            type="text"
                            value={saleObservacaoInterna}
                            onChange={(e) => setSaleObservacaoInterna(e.target.value)}
                            placeholder="Campo top-level separado do objeto observacao"
                            className={inputClass}
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label className="block text-gray-600 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                            Desc. Mensagem 1
                          </label>
                          <input
                            type="text"
                            value={saleDescMensagem1}
                            onChange={(e) => setSaleDescMensagem1(e.target.value)}
                            placeholder="descMensagem1"
                            className={inputClass}
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label className="block text-gray-600 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                            Desc. Mensagem 2
                          </label>
                          <input
                            type="text"
                            value={saleDescMensagem2}
                            onChange={(e) => setSaleDescMensagem2(e.target.value)}
                            placeholder="descMensagem2"
                            className={inputClass}
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label className="block text-gray-600 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                            Desc. Mensagem 3
                          </label>
                          <input
                            type="text"
                            value={saleDescMensagem3}
                            onChange={(e) => setSaleDescMensagem3(e.target.value)}
                            placeholder="descMensagem3"
                            className={inputClass}
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label className="block text-gray-600 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                            Desc. Mensagem 4
                          </label>
                          <input
                            type="text"
                            value={saleDescMensagem4}
                            onChange={(e) => setSaleDescMensagem4(e.target.value)}
                            placeholder="descMensagem4"
                            className={inputClass}
                            style={inputStyle}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Items */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "0.88rem", fontWeight: 600 }}>
                        <Package className="w-4 h-4 text-gray-500" />
                        Itens do Pedido
                      </h5>
                      <button
                        onClick={addSaleItem}
                        className="flex items-center gap-1 px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors cursor-pointer"
                        style={{ fontSize: "0.75rem", fontWeight: 500 }}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Adicionar Item
                      </button>
                    </div>

                    {/* Items table header */}
                    <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-2 text-gray-400" style={{ fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase" as const }}>
                      <div className="col-span-3">Cod. Produto</div>
                      <div className="col-span-2">Cod. Ref *</div>
                      <div className="col-span-2">Qtde</div>
                      <div className="col-span-2">Valor Unit.</div>
                      <div className="col-span-2">Desc. (%)</div>
                      <div className="col-span-1"></div>
                    </div>

                    {saleItems.map((item, idx) => (
                      <div key={idx} className="space-y-1">
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                          <div className="sm:col-span-3">
                            <label className="sm:hidden block text-gray-500 mb-1" style={{ fontSize: "0.7rem" }}>Cod. Produto</label>
                            <div className="relative">
                              <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                              <input
                                type="text"
                                value={item.codProduto}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setSaleItems((prev) => {
                                    const updated = [...prev];
                                    updated[idx] = { ...updated[idx], codProduto: val };
                                    // Auto-fill codRef if empty or was previously auto-filled
                                    if (!updated[idx].codRef || updated[idx].codRef === prev[idx].codProduto) {
                                      updated[idx].codRef = val;
                                    }
                                    return updated;
                                  });
                                }}
                                placeholder="Codigo SIGE"
                                className={inputClass + " pl-8"}
                                style={inputStyle}
                              />
                            </div>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="sm:hidden block text-gray-500 mb-1" style={{ fontSize: "0.7rem" }}>
                              Cod. Ref <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={item.codRef}
                              onChange={(e) => updateSaleItem(idx, "codRef", e.target.value)}
                              placeholder={item.codProduto || "= codProduto"}
                              className={inputClass}
                              style={inputStyle}
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="sm:hidden block text-gray-500 mb-1" style={{ fontSize: "0.7rem" }}>Quantidade</label>
                            <input
                              type="number"
                              min="1"
                              value={item.quantidade}
                              onChange={(e) => updateSaleItem(idx, "quantidade", Number(e.target.value) || 1)}
                              className={inputClass}
                              style={inputStyle}
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="sm:hidden block text-gray-500 mb-1" style={{ fontSize: "0.7rem" }}>Valor Unitario</label>
                            <div className="relative">
                              <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                              <input
                                type="text"
                                value={item.valorUnitario}
                                onChange={(e) => updateSaleItem(idx, "valorUnitario", e.target.value)}
                                placeholder="Auto"
                                className={inputClass + " pl-8"}
                                style={inputStyle}
                              />
                            </div>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="sm:hidden block text-gray-500 mb-1" style={{ fontSize: "0.7rem" }}>Desconto %</label>
                            <input
                              type="text"
                              value={item.desconto}
                              onChange={(e) => updateSaleItem(idx, "desconto", e.target.value)}
                              placeholder="0"
                              className={inputClass}
                              style={inputStyle}
                            />
                          </div>
                          <div className="sm:col-span-1 flex items-center justify-end gap-0.5">
                            <button
                              onClick={() => setShowItemAdvanced(showItemAdvanced === idx ? null : idx)}
                              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                              title="Campos avancados do item"
                            >
                              {showItemAdvanced === idx ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={() => removeSaleItem(idx)}
                              disabled={saleItems.length <= 1}
                              className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        {showItemAdvanced === idx && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 ml-0 sm:ml-2 p-2.5 bg-blue-50/50 border border-blue-100 rounded-lg">
                            <div>
                              <label className="block text-gray-500 mb-0.5" style={{ fontSize: "0.68rem", fontWeight: 500 }}>Valor Frete</label>
                              <input
                                type="text"
                                value={item.valorFrete}
                                onChange={(e) => updateSaleItem(idx, "valorFrete", e.target.value)}
                                placeholder="0.00"
                                className={inputClass}
                                style={inputStyle}
                              />
                            </div>
                            <div>
                              <label className="block text-gray-500 mb-0.5" style={{ fontSize: "0.68rem", fontWeight: 500 }}>Valor Encargos</label>
                              <input
                                type="text"
                                value={item.valorEncargos}
                                onChange={(e) => updateSaleItem(idx, "valorEncargos", e.target.value)}
                                placeholder="0.00"
                                className={inputClass}
                                style={inputStyle}
                              />
                            </div>
                            <div>
                              <label className="block text-gray-500 mb-0.5" style={{ fontSize: "0.68rem", fontWeight: 500 }}>Valor Seguro</label>
                              <input
                                type="text"
                                value={item.valorSeguro}
                                onChange={(e) => updateSaleItem(idx, "valorSeguro", e.target.value)}
                                placeholder="0.00"
                                className={inputClass}
                                style={inputStyle}
                              />
                            </div>
                            <div>
                              <label className="block text-gray-500 mb-0.5" style={{ fontSize: "0.68rem", fontWeight: 500 }}>NCM</label>
                              <input
                                type="text"
                                value={item.ncm}
                                onChange={(e) => updateSaleItem(idx, "ncm", e.target.value)}
                                placeholder="00000000"
                                className={inputClass}
                                style={inputStyle}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Submit */}
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={handleCreateSale}
                      disabled={creatingSale || !saleCustomerId.trim() || saleItems.every((i) => !i.codProduto.trim())}
                      className="flex items-center gap-2 px-6 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                      style={{ fontSize: "0.88rem", fontWeight: 600 }}
                    >
                      {creatingSale ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      {creatingSale ? "Criando venda..." : "Criar Venda no SIGE"}
                    </button>
                    <button
                      onClick={handleDebugOrder}
                      disabled={debugRunning || !saleCustomerId.trim()}
                      className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                      style={{ fontSize: "0.78rem", fontWeight: 600 }}
                      title="Testa 10 estrategias diferentes de POST /order e mostra detalhes completos (headers, redirects, body)"
                    >
                      {debugRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      {debugRunning ? "Diagnosticando..." : "Debug POST /order"}
                    </button>
                    <button
                      onClick={handleListOrderTypes}
                      disabled={orderTypesLoading}
                      className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                      style={{ fontSize: "0.78rem", fontWeight: 600 }}
                      title="Consulta GET /order-type no SIGE para listar tipos de movimento disponiveis"
                    >
                      {orderTypesLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListOrdered className="w-4 h-4" />}
                      {orderTypesLoading ? "Consultando..." : "Listar Tipos Mov."}
                    </button>
                    <button
                      onClick={handleTestTipoMv}
                      disabled={tipoMvTestLoading || !saleCustomerId.trim()}
                      className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                      style={{ fontSize: "0.78rem", fontWeight: 600 }}
                      title="Testa 10 valores diferentes de codTipoMv (V, PV, VEN, 1, 2, etc.) para descobrir qual funciona"
                    >
                      {tipoMvTestLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Hash className="w-4 h-4" />}
                      {tipoMvTestLoading ? "Testando..." : "Testar codTipoMv"}
                    </button>
                  </div>

                  {/* Order Types result */}
                  {orderTypesResult && (
                    <div className="bg-gray-900 rounded-lg p-4 overflow-auto max-h-[500px]">
                      <p className="text-teal-300 mb-2" style={{ fontSize: "0.82rem", fontWeight: 700 }}>
                        Tipos de Movimento (GET /type-moviment)
                      </p>
                      {orderTypesResult.error && (
                        <p className="text-red-400 mb-2" style={{ fontSize: "0.75rem" }}>Erro: {orderTypesResult.error}</p>
                      )}
                      {orderTypesResult.message && (
                        <p className="text-cyan-400 mb-2" style={{ fontSize: "0.75rem" }}>{orderTypesResult.message}</p>
                      )}
                      {orderTypesResult.types?.length > 0 && (
                        <div className="mb-3">
                          <p className="text-green-400 mb-2" style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                            Clique em um tipo para usa-lo no campo "Tipo Pedido":
                          </p>
                          <div className="space-y-1.5">
                            {orderTypesResult.types.map((t: any, i: number) => (
                              <button
                                key={i}
                                onClick={() => {
                                  if (t.codTipoMv) {
                                    setSaleTipoPedido(t.codTipoMv);
                                  }
                                }}
                                className="w-full flex items-center gap-3 p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors cursor-pointer text-left"
                              >
                                <span className="px-2 py-1 bg-teal-800 text-teal-200 rounded font-mono shrink-0" style={{ fontSize: "0.75rem", fontWeight: 700 }}>
                                  {t.codTipoMv || "?"}
                                </span>
                                <span className="text-gray-300 truncate" style={{ fontSize: "0.72rem" }}>
                                  {t.descricao || "Sem descrição"}
                                </span>
                                {t.codDocto && (
                                  <span className="px-1.5 py-0.5 bg-gray-700 text-gray-400 rounded shrink-0" style={{ fontSize: "0.65rem" }}>
                                    Doc: {t.codDocto}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <details>
                        <summary className="text-gray-400 cursor-pointer hover:text-gray-200" style={{ fontSize: "0.72rem" }}>
                          Resposta completa da API
                        </summary>
                        <pre className="text-gray-400 mt-2" style={{ fontSize: "0.65rem", lineHeight: 1.4 }}>
                          <code>{JSON.stringify(orderTypesResult.rawResponse || orderTypesResult, null, 2)}</code>
                        </pre>
                      </details>
                    </div>
                  )}

                  {/* TipoMv test result */}
                  {tipoMvTestResult && (
                    <div className="bg-gray-900 rounded-lg p-4 overflow-auto max-h-[500px]">
                      <p className="text-amber-300 mb-2" style={{ fontSize: "0.82rem", fontWeight: 700 }}>
                        Teste codTipoMv — brute force
                      </p>
                      {tipoMvTestResult.error && (
                        <p className="text-red-400 mb-2" style={{ fontSize: "0.75rem" }}>Erro: {tipoMvTestResult.error}</p>
                      )}
                      {tipoMvTestResult.workingValue && (
                        <div className="mb-3 p-3 bg-green-900/50 border border-green-700 rounded-lg">
                          <p className="text-green-300" style={{ fontSize: "0.85rem", fontWeight: 700 }}>
                            SUCESSO! codTipoMv = "{tipoMvTestResult.workingValue}" funciona!
                          </p>
                          <p className="text-green-400 mt-1" style={{ fontSize: "0.72rem" }}>
                            Valor já preenchido automaticamente no campo "Tipo Pedido".
                          </p>
                        </div>
                      )}
                      {tipoMvTestResult.message && !tipoMvTestResult.workingValue && (
                        <p className="text-yellow-400 mb-2" style={{ fontSize: "0.75rem" }}>{tipoMvTestResult.message}</p>
                      )}
                      {tipoMvTestResult.summary && (
                        <div className="mb-2">
                          <p className="text-cyan-400 mb-1" style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                            Resumo: {tipoMvTestResult.summary.total} testados, {tipoMvTestResult.summary.tipoNaoEncontrado} com "Tipo não encontrado", {tipoMvTestResult.summary.otherErrors} com outros erros
                          </p>
                        </div>
                      )}
                      {tipoMvTestResult.allResults && (
                        <div className="space-y-1 mb-3">
                          {tipoMvTestResult.allResults.map((r: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <span className={`px-1.5 py-0.5 rounded ${
                                r.ok ? "bg-green-800 text-green-300" : "bg-red-800 text-red-300"
                              }`} style={{ fontSize: "0.65rem", fontWeight: 700 }}>
                                {r.status || "ERR"}
                              </span>
                              <span className="text-amber-300 font-mono" style={{ fontSize: "0.7rem" }}>"{r.codTipoMv}"</span>
                              {r.message && (
                                <span className="text-gray-500 truncate max-w-xs" style={{ fontSize: "0.65rem" }}>{r.message}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {tipoMvTestResult.otherErrorDetails?.length > 0 && (
                        <details>
                          <summary className="text-gray-400 cursor-pointer hover:text-gray-200" style={{ fontSize: "0.72rem" }}>
                            Erros diferentes de "Tipo não encontrado"
                          </summary>
                          <pre className="text-gray-400 mt-2" style={{ fontSize: "0.65rem", lineHeight: 1.4 }}>
                            <code>{JSON.stringify(tipoMvTestResult.otherErrorDetails, null, 2)}</code>
                          </pre>
                        </details>
                      )}
                    </div>
                  )}

                  {/* Debug result */}
                  {debugResult && (
                    <div className="bg-gray-900 rounded-lg p-4 overflow-auto max-h-[600px]">
                      <p className="text-purple-300 mb-2" style={{ fontSize: "0.82rem", fontWeight: 700 }}>
                        Diagnóstico POST /order — 10 tentativas
                      </p>
                      {debugResult.error && (
                        <p className="text-red-400 mb-2" style={{ fontSize: "0.75rem" }}>Erro: {debugResult.error}</p>
                      )}
                      {debugResult.summary && (
                        <div className="mb-3">
                          <p className="text-cyan-400 mb-1" style={{ fontSize: "0.72rem", fontWeight: 600 }}>Resumo:</p>
                          <div className="space-y-1">
                            {debugResult.summary.map((s: any, i: number) => (
                              <div key={i} className="flex items-center gap-2 text-xs">
                                <span className={`px-1.5 py-0.5 rounded ${
                                  s.status >= 200 && s.status < 300 ? "bg-green-800 text-green-300" :
                                  s.status >= 300 && s.status < 400 ? "bg-yellow-800 text-yellow-300" :
                                  "bg-red-800 text-red-300"
                                }`} style={{ fontSize: "0.65rem", fontWeight: 700 }}>
                                  {s.status || "ERR"}
                                </span>
                                <span className="text-gray-300" style={{ fontSize: "0.7rem" }}>{s.label}</span>
                                {s.redirected && (
                                  <span className="text-yellow-400" style={{ fontSize: "0.65rem" }}>REDIRECT!</span>
                                )}
                                {s.msg && (
                                  <span className="text-gray-500 truncate max-w-xs" style={{ fontSize: "0.65rem" }}>{s.msg}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {debugResult.attempts && (
                        <details>
                          <summary className="text-gray-400 cursor-pointer hover:text-gray-200" style={{ fontSize: "0.72rem" }}>
                            Detalhes completos (clique para expandir)
                          </summary>
                          <pre className="text-gray-400 mt-2" style={{ fontSize: "0.65rem", lineHeight: 1.4 }}>
                            <code>{JSON.stringify(debugResult.attempts, null, 2)}</code>
                          </pre>
                        </details>
                      )}
                    </div>
                  )}

                  {/* Sale error */}
                  {saleError && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-lg">
                      <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                      <p className="text-red-700" style={{ fontSize: "0.78rem" }}>{saleError}</p>
                    </div>
                  )}

                  {/* Sale result */}
                  {saleResult && (
                    <div className="space-y-3">
                      {saleResult.success ? (
                        <div className="flex items-start gap-2.5 p-3.5 bg-green-50 border border-green-100 rounded-lg">
                          <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-green-800" style={{ fontSize: "0.88rem", fontWeight: 600 }}>
                              Venda criada com sucesso!
                            </p>
                            <p className="text-green-600 mt-0.5" style={{ fontSize: "0.78rem" }}>
                              Pedido #{saleResult.orderId} criado no SIGE — items com codRef incluidos.
                            </p>
                          </div>
                        </div>
                      ) : saleResult.orderId ? (
                        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-amber-700" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                              Pedido #{saleResult.orderId} criado, mas items falharam.
                            </p>
                            <p className="text-amber-600 mt-0.5" style={{ fontSize: "0.72rem" }}>
                              Use o modulo "Pedidos Items" para adicionar os items manualmente via POST /order-items/{saleResult.orderId}.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-lg">
                          <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                          <p className="text-red-700" style={{ fontSize: "0.78rem" }}>
                            Falha na criacao. Verifique os steps abaixo.
                          </p>
                        </div>
                      )}

                      {/* Warning message */}
                      {saleResult.warning && (
                        <div className="flex items-start gap-2 p-2.5 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <AlertTriangle className="w-3.5 h-3.5 text-yellow-600 mt-0.5 shrink-0" />
                          <p className="text-yellow-700" style={{ fontSize: "0.75rem" }}>{saleResult.warning}</p>
                        </div>
                      )}

                      {/* Steps detail */}
                      {saleResult.steps && (
                        <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto max-h-[600px] overflow-y-auto">
                          <p className="text-green-400 mb-2" style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                            Steps da criação (fluxo multi-step):
                          </p>
                          {saleResult.steps.map((step: any, idx: number) => (
                            <div key={idx} className="flex items-start gap-2 mb-1.5">
                              {step.ok ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" />
                              ) : (
                                <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                              )}
                              <div>
                                <span className="text-gray-300" style={{ fontSize: "0.75rem" }}>
                                  <span className="text-gray-500 font-mono">[{idx + 1}]</span>{" "}
                                  {step.step}
                                  {step.itemCount !== undefined && ` (${step.itemCount} items)`}
                                  {step.confirmedItems !== undefined && ` (${step.confirmedItems} confirmados)`}
                                  {step.note && ` [${step.note}]`}
                                  {" "}— HTTP {step.status}
                                </span>
                              </div>
                            </div>
                          ))}

                          {/* Order header response */}
                          {saleResult.order && (
                            <>
                              <p className="text-blue-400 mt-3 mb-1" style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                                Pedido (cabecalho):
                              </p>
                              <pre className="text-gray-400" style={{ fontSize: "0.7rem", lineHeight: 1.4 }}>
                                <code>{JSON.stringify(saleResult.order, null, 2)}</code>
                              </pre>
                            </>
                          )}

                          {/* Order items response */}
                          {saleResult.orderItems && (
                            <>
                              <p className="text-cyan-400 mt-3 mb-1" style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                                Items do pedido (confirmação):
                              </p>
                              <pre className="text-gray-400" style={{ fontSize: "0.7rem", lineHeight: 1.4 }}>
                                <code>{JSON.stringify(saleResult.orderItems, null, 2)}</code>
                              </pre>
                            </>
                          )}

                          {/* Sent payloads (debug) */}
                          {saleResult.sentPayload && (
                            <>
                              <p className="text-yellow-400 mt-3 mb-1" style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                                Payloads enviados ao SIGE (debug):
                              </p>
                              {saleResult.sentPayload.orderWithItems && (
                                <>
                                  <p className="text-yellow-500/70 mb-0.5" style={{ fontSize: "0.65rem", fontWeight: 600 }}>
                                    Step 1 — POST /order (cabecalho + items):
                                  </p>
                                  <pre className="text-gray-400 mb-2" style={{ fontSize: "0.7rem", lineHeight: 1.4 }}>
                                    <code>{JSON.stringify(saleResult.sentPayload.orderWithItems, null, 2)}</code>
                                  </pre>
                                </>
                              )}
                              {saleResult.sentPayload.observation && (
                                <>
                                  <p className="text-purple-400/80 mb-0.5" style={{ fontSize: "0.65rem", fontWeight: 600 }}>
                                    Step 2 — POST /order/{"{id}"}/observation:
                                  </p>
                                  <pre className="text-gray-400 mb-2" style={{ fontSize: "0.7rem", lineHeight: 1.4 }}>
                                    <code>{JSON.stringify(saleResult.sentPayload.observation, null, 2)}</code>
                                  </pre>
                                </>
                              )}
                              {/* Fallback: show raw if neither key matches */}
                              {!saleResult.sentPayload.orderWithItems && !saleResult.sentPayload.orderHeader && (
                                <pre className="text-gray-400" style={{ fontSize: "0.7rem", lineHeight: 1.4 }}>
                                  <code>{JSON.stringify(saleResult.sentPayload, null, 2)}</code>
                                </pre>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ═══ TAB 3: Vendas Realizadas ═══ */}
              {activeTab === "orders" && (
                <div className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h5 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "0.88rem", fontWeight: 600 }}>
                      <ListOrdered className="w-4 h-4 text-gray-500" />
                      Vendas criadas via integração
                    </h5>
                    <button
                      onClick={loadSales}
                      disabled={loadingSales}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 cursor-pointer"
                      style={{ fontSize: "0.78rem", fontWeight: 500 }}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingSales ? "animate-spin" : ""}`} />
                      Atualizar
                    </button>
                  </div>

                  {loadingSales ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 text-red-500 animate-spin" />
                    </div>
                  ) : sales.length === 0 ? (
                    <div className="text-center py-8">
                      <ShoppingCart className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-400" style={{ fontSize: "0.85rem" }}>
                        Nenhuma venda realizada ainda.
                      </p>
                      <p className="text-gray-300 mt-1" style={{ fontSize: "0.75rem" }}>
                        Use a aba "Nova Venda" para criar um pedido.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {sales.map((sale: any) => (
                        <div key={sale.orderId} className="border border-gray-200 rounded-lg overflow-hidden">
                          <button
                            onClick={() => setExpandedOrder(expandedOrder === sale.orderId ? null : sale.orderId)}
                            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center">
                                <FileText className="w-4 h-4 text-red-500" />
                              </div>
                              <div className="text-left">
                                <p className="text-gray-800" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                                  Pedido #{sale.orderId}
                                </p>
                                <p className="text-gray-400" style={{ fontSize: "0.72rem" }}>
                                  Cliente #{sale.codCliente} | {sale.itemCount} ite{sale.itemCount === 1 ? "m" : "ns"} | {formatDate(sale.createdAt)}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {sale.steps?.every((s: any) => s.ok) ? (
                                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full" style={{ fontSize: "0.65rem", fontWeight: 700 }}>
                                  COMPLETO
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full" style={{ fontSize: "0.65rem", fontWeight: 700 }}>
                                  PARCIAL
                                </span>
                              )}
                              {expandedOrder === sale.orderId ? (
                                <ChevronUp className="w-4 h-4 text-gray-400" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-gray-400" />
                              )}
                            </div>
                          </button>
                          {expandedOrder === sale.orderId && (
                            <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/50">
                              {sale.steps?.map((step: any, idx: number) => (
                                <div key={idx} className="flex items-center gap-2 py-1">
                                  {step.ok ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                                  ) : (
                                    <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                  )}
                                  <span className="text-gray-600" style={{ fontSize: "0.78rem" }}>
                                    {step.step}
                                    {step.product && ` (produto: ${step.product})`}
                                    {step.itemCount !== undefined && ` (${step.itemCount} items)`}
                                    {step.confirmedItems !== undefined && ` (${step.confirmedItems} confirmados)`}
                                    {step.note && ` [${step.note}]`}
                                    {" "}— HTTP {step.status}
                                  </span>
                                </div>
                              ))}
                              {sale.itemsError && (
                                <div className="flex items-center gap-2 py-1 mt-1 px-2 bg-amber-50 border border-amber-100 rounded">
                                  <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                                  <span className="text-amber-700" style={{ fontSize: "0.72rem" }}>
                                    Items: {sale.itemsError}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}