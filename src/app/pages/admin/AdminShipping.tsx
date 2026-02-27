import { useState, useEffect, useCallback, useRef } from "react";
import {
  Save,
  Loader2,
  Check,
  Truck,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  MapPin,
  Package,
  AlertTriangle,
  Info,
  ToggleLeft,
  ToggleRight,
  Copy,
  Settings,
  Globe,
  Zap,
  Bike,
  FileSpreadsheet,
  Plug,
  Layers,
  Eye,
  EyeOff,
  Search,
  Braces,
  CheckCircle,
  ArrowRight,
  Upload,
  Play,
  Terminal,
  RotateCcw,
  ChevronUp,
  ExternalLink,
  Scale,
} from "lucide-react";
import * as api from "../../services/api";
import { supabase } from "../../services/supabaseClient";
import { getValidAdminToken } from "./adminAuth";
import { AdminShippingTables } from "./AdminShippingTables";

// Physical field names for highlighting in debug UI
const SIGE_WEIGHT_FIELDS_UI = ["peso", "pesoliquido", "pesobruto", "pesoliq", "peso_liquido", "peso_bruto", "weight", "pesokg", "pesogr", "pesounitario"];
const SIGE_DIM_FIELDS_UI = ["comprimento", "profundidade", "length", "comp", "compriment", "largura", "width", "larg", "altura", "height", "alt"];

async function getToken(): Promise<string> {
  const token = await getValidAdminToken();
  if (!token) throw new Error("Sessão expirada. Faça login novamente.");
  return token;
}

const BRAZILIAN_STATES: { uf: string; name: string; region: string }[] = [
  { uf: "AC", name: "Acre", region: "Norte" },
  { uf: "AL", name: "Alagoas", region: "Nordeste" },
  { uf: "AP", name: "Amapa", region: "Norte" },
  { uf: "AM", name: "Amazonas", region: "Norte" },
  { uf: "BA", name: "Bahia", region: "Nordeste" },
  { uf: "CE", name: "Ceara", region: "Nordeste" },
  { uf: "DF", name: "Distrito Federal", region: "Centro-Oeste" },
  { uf: "ES", name: "Espirito Santo", region: "Sudeste" },
  { uf: "GO", name: "Goias", region: "Centro-Oeste" },
  { uf: "MA", name: "Maranhao", region: "Nordeste" },
  { uf: "MT", name: "Mato Grosso", region: "Centro-Oeste" },
  { uf: "MS", name: "Mato Grosso do Sul", region: "Centro-Oeste" },
  { uf: "MG", name: "Minas Gerais", region: "Sudeste" },
  { uf: "PA", name: "Para", region: "Norte" },
  { uf: "PB", name: "Paraiba", region: "Nordeste" },
  { uf: "PR", name: "Parana", region: "Sul" },
  { uf: "PE", name: "Pernambuco", region: "Nordeste" },
  { uf: "PI", name: "Piaui", region: "Nordeste" },
  { uf: "RJ", name: "Rio de Janeiro", region: "Sudeste" },
  { uf: "RN", name: "Rio Grande do Norte", region: "Nordeste" },
  { uf: "RS", name: "Rio Grande do Sul", region: "Sul" },
  { uf: "RO", name: "Rondonia", region: "Norte" },
  { uf: "RR", name: "Roraima", region: "Norte" },
  { uf: "SC", name: "Santa Catarina", region: "Sul" },
  { uf: "SP", name: "Sao Paulo", region: "Sudeste" },
  { uf: "SE", name: "Sergipe", region: "Nordeste" },
  { uf: "TO", name: "Tocantins", region: "Norte" },
];

const REGIONS = ["Sul", "Sudeste", "Centro-Oeste", "Nordeste", "Norte"];

const CARRIER_TYPES: { value: api.ShippingCarrier["type"]; label: string; icon: typeof Truck }[] = [
  { value: "correios_pac", label: "Correios PAC", icon: Package },
  { value: "correios_sedex", label: "Correios SEDEX", icon: Zap },
  { value: "transportadora", label: "Transportadora", icon: Truck },
  { value: "motoboy", label: "Motoboy", icon: Bike },
  { value: "custom", label: "Personalizado", icon: Settings },
];

const CARRIER_EMOJIS: Record<string, string> = {
  correios_pac: "\u{1F4E6}",
  correios_sedex: "\u{26A1}",
  transportadora: "\u{1F69A}",
  motoboy: "\u{1F3CD}",
  custom: "\u{1F4E6}",
};

function formatCep(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function makeDefaultRule(): api.ShippingStateRule {
  return { basePrice: 0, pricePerKg: 0, pricePerItem: 0, deliveryDays: 0 };
}

function newCarrier(type: api.ShippingCarrier["type"]): api.ShippingCarrier {
  const label = CARRIER_TYPES.find((t) => t.value === type)?.label || "Nova Transportadora";
  return {
    id: `carrier_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: label,
    type,
    enabled: true,
    additionalDays: 0,
    freeAbove: null,
    stateRules: {},
    regionRules: {},
    defaultRule: makeDefaultRule(),
  };
}

// ═══════════════════════════════════════════════
// ── JSON ANALYZER TYPES & LOGIC ───────────────
// ═══════════════════════════════════════════════

interface FieldInfo {
  path: string;
  key: string;
  type: string; // "string" | "number" | "boolean" | "object" | "array" | "null"
  sampleValue: any;
  depth: number;
  /** Auto-detected role */
  detectedRole?: "carrierName" | "price" | "deliveryDays" | "carrierId" | "error" | null;
  confidence: number; // 0-1
}

interface ArrayCandidate {
  path: string;
  length: number;
  sampleItem: any;
  fields: FieldInfo[];
  score: number; // higher = more likely the options array
}

interface JsonAnalysisResult {
  rootType: string;
  arrays: ArrayCandidate[];
  bestArray: ArrayCandidate | null;
  suggestedMapping: api.ShippingFieldMapping | null;
  previewOptions: Array<{ carrierName: string; price: number; deliveryDays: number; carrierId: string }>;
}

// Patterns for auto-detecting field roles
const ROLE_PATTERNS: Record<string, { patterns: RegExp[]; type: string }> = {
  carrierName: {
    patterns: [
      /^(carrier_?name|nome|name|servico|service|descri|description|company|transportadora|carrier|label|titulo)$/i,
      /(nome|name|descri|servic|carrier|company|transp|titulo)/i,
    ],
    type: "string",
  },
  price: {
    patterns: [
      /^(price|preco|valor|value|custo|cost|custom_?price|shipping_?price|vl_?frete|frete|amount|total)$/i,
      /(price|preco|valor|custo|cost|frete|amount)/i,
    ],
    type: "number",
  },
  deliveryDays: {
    patterns: [
      /^(delivery_?days|delivery_?time|prazo|dias|days|tempo|lead_?time|custom_?delivery)$/i,
      /(delivery|prazo|dias|days|tempo|lead_?time)/i,
    ],
    type: "number",
  },
  carrierId: {
    patterns: [
      /^(carrier_?id|id|code|codigo|service_?code|cod)$/i,
      /(^id$|carrier_?id|code|codigo)/i,
    ],
    type: "any",
  },
  error: {
    patterns: [
      /^(error|erro|err|has_?error|msg_?erro)$/i,
    ],
    type: "any",
  },
};

function getValueAtPath(obj: any, path: string): any {
  if (!path) return obj;
  let cur = obj;
  for (const seg of path.split(".")) {
    if (cur && typeof cur === "object") cur = cur[seg];
    else return undefined;
  }
  return cur;
}

function detectFieldRole(key: string, value: any): { role: string | null; confidence: number } {
  const keyLower = key.toLowerCase().replace(/[^a-z0-9]/g, "_");
  for (const [role, info] of Object.entries(ROLE_PATTERNS)) {
    for (let i = 0; i < info.patterns.length; i++) {
      if (info.patterns[i].test(keyLower)) {
        // Check type compatibility
        const typeOk =
          info.type === "any" ||
          (info.type === "number" && (typeof value === "number" || !isNaN(parseFloat(value)))) ||
          (info.type === "string" && typeof value === "string");
        if (typeOk || i === 0) {
          return { role, confidence: i === 0 ? 0.95 : 0.6 };
        }
      }
    }
  }
  return { role: null, confidence: 0 };
}

function findArrays(data: any, parentPath: string = "", depth: number = 0): ArrayCandidate[] {
  const results: ArrayCandidate[] = [];
  if (depth > 5) return results;

  if (Array.isArray(data) && data.length > 0) {
    // Check if array items are objects
    const objects = data.filter((item) => item && typeof item === "object" && !Array.isArray(item));
    if (objects.length > 0) {
      const sampleItem = objects[0];
      const fields: FieldInfo[] = [];

      for (const [key, value] of Object.entries(sampleItem)) {
        const { role, confidence } = detectFieldRole(key, value);
        fields.push({
          path: parentPath ? `${parentPath}.${key}` : key,
          key,
          type: value === null ? "null" : Array.isArray(value) ? "array" : typeof value,
          sampleValue: value,
          depth: depth + 1,
          detectedRole: role as any,
          confidence,
        });
      }

      // Score: how many shipping-relevant fields were detected
      const detectedRoles = fields.filter((f) => f.detectedRole).map((f) => f.detectedRole!);
      const uniqueRoles = new Set(detectedRoles);
      const hasPrice = uniqueRoles.has("price");
      const hasName = uniqueRoles.has("carrierName");
      const score = uniqueRoles.size * 2 + (hasPrice ? 3 : 0) + (hasName ? 2 : 0) + (objects.length > 1 ? 1 : 0);

      results.push({
        path: parentPath,
        length: objects.length,
        sampleItem,
        fields,
        score,
      });
    }
  }

  // Recurse into object properties
  if (data && typeof data === "object" && !Array.isArray(data)) {
    for (const [key, value] of Object.entries(data)) {
      const newPath = parentPath ? `${parentPath}.${key}` : key;
      results.push(...findArrays(value, newPath, depth + 1));
    }
  }
  // Also recurse into arrays to find nested arrays
  if (Array.isArray(data)) {
    for (const item of data.slice(0, 3)) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        for (const [key, value] of Object.entries(item)) {
          const newPath = parentPath ? `${parentPath}[].${key}` : `[].${key}`;
          if (Array.isArray(value)) {
            results.push(...findArrays(value, newPath, depth + 1));
          }
        }
      }
    }
  }

  return results;
}

function analyzeJsonData(data: any): JsonAnalysisResult {
  const rootType = data === null ? "null" : Array.isArray(data) ? "array" : typeof data;
  const arrays = findArrays(data);

  // Sort by score descending
  arrays.sort((a, b) => b.score - a.score);
  const bestArray = arrays.length > 0 ? arrays[0] : null;

  let suggestedMapping: api.ShippingFieldMapping | null = null;
  let previewOptions: JsonAnalysisResult["previewOptions"] = [];

  if (bestArray) {
    // Build mapping from detected roles
    const mapping: api.ShippingFieldMapping = {
      optionsPath: bestArray.path,
      carrierName: "",
      price: "",
      deliveryDays: "",
    };

    for (const field of bestArray.fields) {
      if (field.detectedRole === "carrierName" && !mapping.carrierName) mapping.carrierName = field.key;
      if (field.detectedRole === "price" && !mapping.price) mapping.price = field.key;
      if (field.detectedRole === "deliveryDays" && !mapping.deliveryDays) mapping.deliveryDays = field.key;
      if (field.detectedRole === "carrierId" && !mapping.carrierId) mapping.carrierId = field.key;
      if (field.detectedRole === "error" && !mapping.errorField) mapping.errorField = field.key;
    }

    suggestedMapping = mapping;

    // Build preview
    const optionsArray = bestArray.path ? getValueAtPath(data, bestArray.path) : data;
    if (Array.isArray(optionsArray)) {
      previewOptions = optionsArray.slice(0, 10).map((item: any) => ({
        carrierName: mapping.carrierName ? String(item[mapping.carrierName] || "—") : "—",
        price: mapping.price ? parseFloat(String(item[mapping.price])) || 0 : 0,
        deliveryDays: mapping.deliveryDays ? parseInt(String(item[mapping.deliveryDays])) || 0 : 0,
        carrierId: mapping.carrierId ? String(item[mapping.carrierId] || "—") : "—",
      }));
    }
  }

  return { rootType, arrays, bestArray, suggestedMapping, previewOptions };
}

export function AdminShipping() {
  const [config, setConfig] = useState<api.ShippingConfig>({
    originCep: "",
    originCity: "",
    originState: "",
    freeShippingMinValue: null,
    defaultWeight: 1,
    carriers: [],
    calcMode: "manual",
    apiConfig: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [expandedCarrier, setExpandedCarrier] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<Record<string, string>>({});
  const [cepLooking, setCepLooking] = useState(false);
  const [addingType, setAddingType] = useState(false);
  const [activeTab, setActiveTab] = useState<"general" | "manual" | "tables" | "api">("general");
  const [showApiToken, setShowApiToken] = useState(false);

  // JSON Analyzer state
  const [jsonInput, setJsonInput] = useState("");
  const [jsonAnalysis, setJsonAnalysis] = useState<JsonAnalysisResult | null>(null);
  const [jsonError, setJsonError] = useState("");
  const [showAnalyzer, setShowAnalyzer] = useState(false);
  const [jsonDragging, setJsonDragging] = useState(false);
  const jsonFileRef = useRef<HTMLInputElement>(null);

  // API Test state
  const [testCep, setTestCep] = useState("");
  const [testWeight, setTestWeight] = useState("");
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<api.ShippingTestResult | null>(null);
  const [testError, setTestError] = useState("");
  const [showRawResponse, setShowRawResponse] = useState(false);
  const [showRequestPayload, setShowRequestPayload] = useState(false);

  // Physical data debug state
  const [debugSku, setDebugSku] = useState("");
  const [debugRunning, setDebugRunning] = useState(false);
  const [debugResult, setDebugResult] = useState<any>(null);
  const [debugError, setDebugError] = useState("");

  // Handle JSON file (from input or drop)
  const handleJsonFile = useCallback((file: File) => {
    if (!file) return;
    const validTypes = ["application/json", "text/plain", ""];
    const isJsonExt = file.name.toLowerCase().endsWith(".json") || file.name.toLowerCase().endsWith(".txt");
    if (!validTypes.includes(file.type) && !isJsonExt) {
      setJsonError("Formato invalido. Envie um arquivo .json ou .txt");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setJsonError("Arquivo muito grande (max 5MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (text) {
        setJsonInput(text);
        setJsonError("");
        setJsonAnalysis(null);
        // Auto-analyze after loading the file
        try {
          const data = JSON.parse(text);
          const result = analyzeJsonData(data);
          setJsonAnalysis(result);
          if (!result.bestArray) {
            setJsonError("Nenhum array de opções de frete encontrado no JSON. Verifique se a resposta contém uma lista de opções.");
          }
        } catch (e: any) {
          setJsonError(`JSON inválido: ${e.message}`);
        }
      }
    };
    reader.onerror = () => setJsonError("Erro ao ler o arquivo.");
    reader.readAsText(file);
  }, []);

  // Load config
  useEffect(() => {
    setLoading(true);
    getToken()
      .then((token) => api.getShippingConfig(token))
      .then((c) => setConfig(c))
      .catch((e) => {
        console.error("Load shipping config error:", e);
        setError("Erro ao carregar configuração de frete.");
      })
      .finally(() => setLoading(false));
  }, []);

  // Save config
  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const token = await getToken();
      const updated = await api.saveShippingConfig(token, config);
      setConfig(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      console.error("Save shipping config error:", e);
      setError(e.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }, [config]);

  // Origin CEP lookup
  const lookupOriginCep = useCallback(async () => {
    const digits = config.originCep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setCepLooking(true);
    try {
      const info = await api.lookupCep(digits);
      if (info && !info.error) {
        setConfig((prev) => ({
          ...prev,
          originCity: info.localidade,
          originState: info.uf,
        }));
      }
    } catch (e) {
      console.error("CEP lookup error:", e);
    } finally {
      setCepLooking(false);
    }
  }, [config.originCep]);

  // Add carrier
  const addCarrier = (type: api.ShippingCarrier["type"]) => {
    const c = newCarrier(type);
    setConfig((prev) => ({ ...prev, carriers: [...prev.carriers, c] }));
    setExpandedCarrier(c.id);
    setAddingType(false);
  };

  // Remove carrier
  const removeCarrier = (id: string) => {
    setConfig((prev) => ({
      ...prev,
      carriers: prev.carriers.filter((c) => c.id !== id),
    }));
    if (expandedCarrier === id) setExpandedCarrier(null);
  };

  // Update carrier
  const updateCarrier = (id: string, patch: Partial<api.ShippingCarrier>) => {
    setConfig((prev) => ({
      ...prev,
      carriers: prev.carriers.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  };

  // Apply region template to a carrier
  const applyRegionTemplate = (carrierId: string, region: string, rule: api.ShippingStateRule) => {
    const states = BRAZILIAN_STATES.filter((s) => s.region === region).map((s) => s.uf);
    setConfig((prev) => ({
      ...prev,
      carriers: prev.carriers.map((c) => {
        if (c.id !== carrierId) return c;
        const newRules = { ...c.stateRules };
        states.forEach((uf) => {
          newRules[uf] = { ...rule };
        });
        return { ...c, stateRules: newRules };
      }),
    }));
  };

  // Copy rule to all states
  const copyRuleToAll = (carrierId: string, rule: api.ShippingStateRule) => {
    setConfig((prev) => ({
      ...prev,
      carriers: prev.carriers.map((c) => {
        if (c.id !== carrierId) return c;
        const newRules: Record<string, api.ShippingStateRule> = {};
        BRAZILIAN_STATES.forEach((s) => {
          newRules[s.uf] = { ...rule };
        });
        return { ...c, stateRules: newRules };
      }),
    }));
  };

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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-gray-800" style={{ fontSize: "1.3rem", fontWeight: 700 }}>
            Configuração de Frete
          </h2>
          <p className="text-gray-400 mt-1" style={{ fontSize: "0.82rem" }}>
            Configure o calculo de frete: manual, tabela CSV ou API externa.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg transition-colors cursor-pointer ${
            saved
              ? "bg-green-100 text-green-700"
              : "bg-red-600 text-white hover:bg-red-700"
          } disabled:opacity-50`}
          style={{ fontSize: "0.88rem", fontWeight: 600 }}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : saved ? (
            <Check className="w-4 h-4" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saving ? "Salvando..." : saved ? "Salvo!" : "Salvar"}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-red-600" style={{ fontSize: "0.82rem" }}>
            {error}
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {[
          { id: "general" as const, label: "Geral", icon: Settings },
          { id: "manual" as const, label: "Manual", icon: Truck },
          { id: "tables" as const, label: "Tabelas CSV", icon: FileSpreadsheet },
          { id: "api" as const, label: "API Externa", icon: Plug },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === tab.id
                ? "bg-white text-red-600 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
            style={{ fontSize: "0.85rem", fontWeight: activeTab === tab.id ? 600 : 400 }}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══ GENERAL TAB ═══ */}
      {activeTab === "general" && (
        <>
      {/* Calc Mode Selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-gray-700 mb-3 flex items-center gap-2" style={{ fontSize: "1rem", fontWeight: 600 }}>
          <Layers className="w-4 h-4 text-red-600" />
          Modo de Calculo
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { value: "manual" as const, label: "Manual", desc: "Regras por estado/regiao", icon: Truck, color: "blue" },
            { value: "table" as const, label: "Tabela CSV", desc: "Faixas de CEP importadas", icon: FileSpreadsheet, color: "green" },
            { value: "hybrid" as const, label: "Hibrido", desc: "Tabela + Manual (fallback)", icon: Layers, color: "purple" },
            { value: "api" as const, label: "API Externa", desc: "Melhor Envio, Frenet, etc", icon: Plug, color: "orange" },
          ].map((mode) => {
            const isActive = (config.calcMode || "manual") === mode.value;
            const colorMap: Record<string, { border: string; bg: string; text: string; icon: string }> = {
              blue:   { border: "border-blue-500", bg: "bg-blue-50", text: "text-blue-700", icon: "text-blue-600" },
              green:  { border: "border-green-500", bg: "bg-green-50", text: "text-green-700", icon: "text-green-600" },
              purple: { border: "border-purple-500", bg: "bg-purple-50", text: "text-purple-700", icon: "text-purple-600" },
              orange: { border: "border-orange-500", bg: "bg-orange-50", text: "text-orange-700", icon: "text-orange-600" },
            };
            const c = colorMap[mode.color];
            return (
              <button
                key={mode.value}
                onClick={() => setConfig((prev) => ({ ...prev, calcMode: mode.value }))}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all cursor-pointer ${
                  isActive ? `${c.border} ${c.bg} shadow-md` : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <mode.icon className={`w-6 h-6 ${isActive ? c.icon : "text-gray-400"}`} />
                <span className={isActive ? c.text : "text-gray-600"} style={{ fontSize: "0.88rem", fontWeight: 700 }}>
                  {mode.label}
                </span>
                <span className={isActive ? c.text : "text-gray-400"} style={{ fontSize: "0.72rem" }}>
                  {mode.desc}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-gray-400 mt-3" style={{ fontSize: "0.72rem" }}>
          {(config.calcMode || "manual") === "manual" && "O frete é calculado com base nas regras manuais por estado/região que você configurar na aba 'Manual'."}
          {config.calcMode === "table" && "O frete e calculado consultando as tabelas CSV importadas. Importe na aba 'Tabelas CSV'."}
          {config.calcMode === "hybrid" && "Primeiro busca nas tabelas CSV. Se não encontrar, usa as regras manuais como fallback."}
          {config.calcMode === "api" && "O frete e cotado em tempo real via API externa (Melhor Envio, Frenet ou custom). Configure na aba 'API Externa'."}
        </p>
      </div>

      {/* General Settings */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-gray-700 mb-4 flex items-center gap-2" style={{ fontSize: "1rem", fontWeight: 600 }}>
          <Settings className="w-4 h-4 text-red-600" />
          Configurações Gerais
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Origin CEP */}
          <div>
            <label className="block text-gray-500 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
              CEP de Origem (loja)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={formatCep(config.originCep)}
                onChange={(e) =>
                  setConfig((p) => ({ ...p, originCep: e.target.value.replace(/\D/g, "") }))
                }
                onBlur={() => {
                  if (config.originCep.length === 8 && !config.originCity) lookupOriginCep();
                }}
                placeholder="00000-000"
                className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-200"
                style={{ fontSize: "0.88rem" }}
                maxLength={9}
              />
              <button
                onClick={lookupOriginCep}
                disabled={cepLooking || config.originCep.length !== 8}
                className="shrink-0 px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 cursor-pointer"
                style={{ fontSize: "0.78rem" }}
              >
                {cepLooking ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
              </button>
            </div>
            {config.originCity && (
              <p className="text-gray-400 mt-1" style={{ fontSize: "0.72rem" }}>
                {config.originCity} - {config.originState}
              </p>
            )}
          </div>

          {/* Default Weight */}
          <div>
            <label className="block text-gray-500 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
              Peso padrão por item (kg)
            </label>
            <input
              type="number"
              value={config.defaultWeight}
              onChange={(e) =>
                setConfig((p) => ({ ...p, defaultWeight: parseFloat(e.target.value) || 0 }))
              }
              min={0}
              step={0.1}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-200"
              style={{ fontSize: "0.88rem" }}
            />
            <p className="text-gray-400 mt-1" style={{ fontSize: "0.72rem" }}>
              Usado quando o produto não tem peso específico.
            </p>
          </div>

          {/* Free Shipping Min */}
          <div>
            <label className="block text-gray-500 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
              Frete gratis acima de (R$)
            </label>
            <input
              type="number"
              value={config.freeShippingMinValue ?? ""}
              onChange={(e) =>
                setConfig((p) => ({
                  ...p,
                  freeShippingMinValue: e.target.value ? parseFloat(e.target.value) : null,
                }))
              }
              min={0}
              step={10}
              placeholder="Desativado"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-200"
              style={{ fontSize: "0.88rem" }}
            />
            <p className="text-gray-400 mt-1" style={{ fontSize: "0.72rem" }}>
              Deixe vazio para desativar frete gratis global.
            </p>
          </div>
        </div>
      </div>
        </>
      )}

      {/* ═══ MANUAL TAB ═══ */}
      {activeTab === "manual" && (
        <>
      {/* Carriers */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-gray-700 flex items-center gap-2" style={{ fontSize: "1rem", fontWeight: 600 }}>
            <Truck className="w-4 h-4 text-red-600" />
            Transportadoras ({config.carriers.length})
          </h3>
          <div className="relative">
            <button
              onClick={() => setAddingType(!addingType)}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors cursor-pointer"
              style={{ fontSize: "0.82rem", fontWeight: 600 }}
            >
              <Plus className="w-4 h-4" />
              Adicionar
            </button>
            {addingType && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-20 w-56 overflow-hidden">
                {CARRIER_TYPES.map((ct) => (
                  <button
                    key={ct.value}
                    onClick={() => addCarrier(ct.value)}
                    className="w-full text-left flex items-center gap-2.5 px-4 py-3 hover:bg-red-50 transition-colors cursor-pointer"
                    style={{ fontSize: "0.85rem" }}
                  >
                    <span style={{ fontSize: "1.1rem" }}>{CARRIER_EMOJIS[ct.value]}</span>
                    <span className="text-gray-700" style={{ fontWeight: 500 }}>
                      {ct.label}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Overlay to close dropdown */}
        {addingType && (
          <div className="fixed inset-0 z-10" onClick={() => setAddingType(false)} />
        )}

        {config.carriers.length === 0 && (
          <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-8 text-center">
            <Truck className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500" style={{ fontSize: "0.9rem", fontWeight: 500 }}>
              Nenhuma transportadora configurada
            </p>
            <p className="text-gray-400 mt-1" style={{ fontSize: "0.78rem" }}>
              Adicione Correios, transportadoras ou motoboy para calcular frete automaticamente.
            </p>
          </div>
        )}

        {config.carriers.map((carrier) => {
          const isExpanded = expandedCarrier === carrier.id;
          const emoji = CARRIER_EMOJIS[carrier.type] || "\u{1F4E6}";

          return (
            <div
              key={carrier.id}
              className={`bg-white rounded-xl border transition-all ${
                isExpanded ? "border-red-300 shadow-md" : "border-gray-200"
              }`}
            >
              {/* Carrier header */}
              <div
                className="flex items-center gap-3 px-5 py-4 cursor-pointer"
                onClick={() => setExpandedCarrier(isExpanded ? null : carrier.id)}
              >
                <span style={{ fontSize: "1.3rem" }}>{emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-700 truncate" style={{ fontSize: "0.95rem", fontWeight: 600 }}>
                    {carrier.name}
                  </p>
                  <p className="text-gray-400" style={{ fontSize: "0.72rem" }}>
                    {CARRIER_TYPES.find((t) => t.value === carrier.type)?.label} &middot;{" "}
                    {Object.keys(carrier.stateRules || {}).length} estados configurados
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    updateCarrier(carrier.id, { enabled: !carrier.enabled });
                  }}
                  className="cursor-pointer"
                  title={carrier.enabled ? "Desativar" : "Ativar"}
                >
                  {carrier.enabled ? (
                    <ToggleRight className="w-7 h-7 text-green-500" />
                  ) : (
                    <ToggleLeft className="w-7 h-7 text-gray-300" />
                  )}
                </button>
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                )}
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div className="border-t border-gray-100 p-5 space-y-5">
                  {/* Basic settings */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-gray-500 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                        Nome
                      </label>
                      <input
                        type="text"
                        value={carrier.name}
                        onChange={(e) => updateCarrier(carrier.id, { name: e.target.value })}
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-200"
                        style={{ fontSize: "0.88rem" }}
                      />
                    </div>
                    <div>
                      <label className="block text-gray-500 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                        Dias adicionais (manuseio)
                      </label>
                      <input
                        type="number"
                        value={carrier.additionalDays}
                        onChange={(e) =>
                          updateCarrier(carrier.id, {
                            additionalDays: parseInt(e.target.value) || 0,
                          })
                        }
                        min={0}
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-200"
                        style={{ fontSize: "0.88rem" }}
                      />
                    </div>
                    <div>
                      <label className="block text-gray-500 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                        Frete gratis acima de (R$)
                      </label>
                      <input
                        type="number"
                        value={carrier.freeAbove ?? ""}
                        onChange={(e) =>
                          updateCarrier(carrier.id, {
                            freeAbove: e.target.value ? parseFloat(e.target.value) : null,
                          })
                        }
                        min={0}
                        step={10}
                        placeholder="Usar global"
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-200"
                        style={{ fontSize: "0.88rem" }}
                      />
                    </div>
                  </div>

                  {/* Default rule */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Globe className="w-4 h-4 text-blue-600" />
                      <span className="text-blue-700" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                        Regra Padrão (fallback)
                      </span>
                      <Info className="w-3.5 h-3.5 text-blue-400" />
                    </div>
                    <p className="text-blue-600 mb-3" style={{ fontSize: "0.72rem" }}>
                      Usada quando não há regra específica para o estado ou região de destino.
                    </p>
                    <RuleEditor
                      rule={carrier.defaultRule || makeDefaultRule()}
                      onChange={(rule) => updateCarrier(carrier.id, { defaultRule: rule })}
                    />
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => copyRuleToAll(carrier.id, carrier.defaultRule || makeDefaultRule())}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors cursor-pointer"
                        style={{ fontSize: "0.75rem", fontWeight: 500 }}
                      >
                        <Copy className="w-3 h-3" />
                        Copiar para todos os estados
                      </button>
                    </div>
                  </div>

                  {/* Region-based rules */}
                  <div>
                    <h4 className="text-gray-600 mb-3 flex items-center gap-2" style={{ fontSize: "0.88rem", fontWeight: 600 }}>
                      <MapPin className="w-4 h-4 text-red-600" />
                      Regras por Regiao
                    </h4>
                    <p className="text-gray-400 mb-3" style={{ fontSize: "0.72rem" }}>
                      Configure preços por região e aplique para todos os estados da região, ou configure individualmente por estado.
                    </p>

                    <div className="space-y-2">
                      {REGIONS.map((region) => {
                        const regionStates = BRAZILIAN_STATES.filter((s) => s.region === region);
                        const sectionKey = `${carrier.id}_${region}`;
                        const isRegionExpanded = expandedSection[sectionKey] === "open";
                        const regionRule = (carrier.regionRules || {})[region];
                        const configuredStates = regionStates.filter(
                          (s) => (carrier.stateRules || {})[s.uf]
                        ).length;

                        return (
                          <div
                            key={region}
                            className={`border rounded-lg transition-all ${
                              isRegionExpanded ? "border-red-200 bg-red-50/30" : "border-gray-200"
                            }`}
                          >
                            <div
                              className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                              onClick={() =>
                                setExpandedSection((prev) => ({
                                  ...prev,
                                  [sectionKey]: isRegionExpanded ? "" : "open",
                                }))
                              }
                            >
                              {isRegionExpanded ? (
                                <ChevronDown className="w-4 h-4 text-gray-400" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-gray-400" />
                              )}
                              <span className="text-gray-700 flex-1" style={{ fontSize: "0.88rem", fontWeight: 600 }}>
                                {region}
                              </span>
                              <span className="text-gray-400" style={{ fontSize: "0.72rem" }}>
                                {configuredStates}/{regionStates.length} estados
                              </span>
                            </div>

                            {isRegionExpanded && (
                              <div className="border-t border-gray-100 p-4 space-y-4">
                                {/* Region-wide rule */}
                                <div className="bg-white rounded-lg border border-gray-200 p-3">
                                  <p className="text-gray-500 mb-2" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                                    Aplicar para toda região {region}:
                                  </p>
                                  <RuleEditor
                                    rule={regionRule || makeDefaultRule()}
                                    onChange={(rule) => {
                                      updateCarrier(carrier.id, {
                                        regionRules: { ...(carrier.regionRules || {}), [region]: rule },
                                      });
                                    }}
                                  />
                                  <button
                                    onClick={() =>
                                      applyRegionTemplate(
                                        carrier.id,
                                        region,
                                        regionRule || makeDefaultRule()
                                      )
                                    }
                                    className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors cursor-pointer"
                                    style={{ fontSize: "0.75rem", fontWeight: 500 }}
                                  >
                                    <Copy className="w-3 h-3" />
                                    Aplicar para {regionStates.length} estados
                                  </button>
                                </div>

                                {/* Per-state rules */}
                                <div className="space-y-2">
                                  {regionStates.map((state) => {
                                    const stateRule = (carrier.stateRules || {})[state.uf];
                                    return (
                                      <div key={state.uf} className="bg-white rounded-lg border border-gray-100 p-3">
                                        <div className="flex items-center justify-between mb-2">
                                          <span className="text-gray-600" style={{ fontSize: "0.82rem", fontWeight: 500 }}>
                                            <span className="font-bold">{state.uf}</span> - {state.name}
                                          </span>
                                          {stateRule && (
                                            <button
                                              onClick={() => {
                                                const rules = { ...(carrier.stateRules || {}) };
                                                delete rules[state.uf];
                                                updateCarrier(carrier.id, { stateRules: rules });
                                              }}
                                              className="text-gray-300 hover:text-red-500 cursor-pointer"
                                              title="Remover regra"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          )}
                                        </div>
                                        <RuleEditor
                                          rule={stateRule || makeDefaultRule()}
                                          onChange={(rule) => {
                                            updateCarrier(carrier.id, {
                                              stateRules: { ...(carrier.stateRules || {}), [state.uf]: rule },
                                            });
                                          }}
                                          compact
                                        />
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Delete carrier */}
                  <div className="pt-3 border-t border-gray-100 flex justify-end">
                    <button
                      onClick={() => {
                        if (confirm(`Remover transportadora "${carrier.name}"?`)) {
                          removeCarrier(carrier.id);
                        }
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      style={{ fontSize: "0.82rem", fontWeight: 500 }}
                    >
                      <Trash2 className="w-4 h-4" />
                      Remover Transportadora
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Help */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
        <h4 className="text-amber-800 mb-2 flex items-center gap-2" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
          <Info className="w-4 h-4" />
          Como funciona o calculo
        </h4>
        <ul className="text-amber-700 space-y-1.5" style={{ fontSize: "0.78rem" }}>
          <li>
            1. O cliente informa o <b>CEP de destino</b> e o sistema consulta o estado via ViaCEP.
          </li>
          <li>
            2. Para cada transportadora ativa, o sistema busca uma <b>regra por estado</b>, depois por <b>região</b>, depois o <b>fallback padrão</b>.
          </li>
          <li>
            3. O preço é: <code className="bg-amber-100 px-1 rounded">Preço Base + (Preço/kg x peso total) + (Preço/item extra x itens-1)</code>
          </li>
          <li>
            4. Os <b>dias de manuseio</b> sao somados aos dias de entrega da regra.
          </li>
          <li>
            5. Se o valor do pedido superar o limite de <b>frete gratis</b>, o frete sai gratuito.
          </li>
        </ul>
      </div>
        </>
      )}

      {/* ═══ TABLES TAB ═══ */}
      {activeTab === "tables" && (
        <AdminShippingTables />
      )}

      {/* ═══ API TAB ═══ */}
      {activeTab === "api" && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-gray-700 mb-4 flex items-center gap-2" style={{ fontSize: "1rem", fontWeight: 600 }}>
              <Plug className="w-4 h-4 text-red-600" />
              Configuração da API Externa
            </h3>

            <div className="space-y-4">
              {/* Provider */}
              <div>
                <label className="block text-gray-500 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                  Provedor
                </label>
                <select
                  value={config.apiConfig?.provider || "melhor_envio"}
                  onChange={(e) => {
                    const prov = e.target.value as api.ShippingApiConfig["provider"];
                    setConfig((prev) => ({
                      ...prev,
                      apiConfig: {
                        ...prev.apiConfig,
                        provider: prov,
                        apiUrl: prov === "sisfrete"
                          ? "https://cotar.sisfrete.com.br/cotacao/Integracao.php"
                          : (prev.apiConfig?.apiUrl || ""),
                        apiToken: prev.apiConfig?.apiToken || "",
                        enabled: prev.apiConfig?.enabled ?? false,
                      },
                    }));
                  }}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-200 cursor-pointer"
                  style={{ fontSize: "0.88rem" }}
                >
                  <option value="melhor_envio">Melhor Envio</option>
                  <option value="frenet">Frenet</option>
                  <option value="sisfrete">SisFrete</option>
                  <option value="custom">API Personalizada</option>
                </select>
              </div>

              {/* SisFrete mode selector + info */}
              {config.apiConfig?.provider === "sisfrete" && (
                <div className="space-y-2.5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Modo de Cotacao</label>
                    <select
                      value={config.apiConfig?.sisfreteMode || "json"}
                      onChange={(e) => {
                        var mode = e.target.value as "json" | "xml_ws";
                        setConfig(function (prev) {
                          return {
                            ...prev,
                            apiConfig: {
                              ...prev.apiConfig,
                              sisfreteMode: mode,
                              provider: prev.apiConfig?.provider || "sisfrete",
                              apiUrl: prev.apiConfig?.apiUrl || "https://cotar.sisfrete.com.br/cotacao/Integracao.php",
                              apiToken: prev.apiConfig?.apiToken || "",
                              enabled: prev.apiConfig?.enabled ?? false,
                            },
                          };
                        });
                      }}
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-200 cursor-pointer"
                      style={{ fontSize: "0.85rem" }}
                    >
                      <option value="json">REST JSON (POST) — padrao, fallback automatico para XML</option>
                      <option value="xml_ws">Web Service XML (GET) — protocolo classico</option>
                    </select>
                    <p className="text-xs text-gray-400 mt-1">
                      No modo JSON, se o POST falhar ou retornar 0 resultados, o sistema tenta automaticamente o Web Service XML como fallback.
                    </p>
                  </div>
                  <div className={
                    "rounded-lg px-3 py-2.5 border " +
                    ((config.apiConfig?.sisfreteMode || "json") === "json"
                      ? "bg-green-50 border-green-200"
                      : "bg-blue-50 border-blue-200")
                  }>
                    <p className={(config.apiConfig?.sisfreteMode || "json") === "json" ? "text-green-700" : "text-blue-700"} style={{ fontSize: "0.78rem" }}>
                      <b>URL:</b>{" "}
                      <code className={
                        "px-1.5 py-0.5 rounded text-xs " +
                        ((config.apiConfig?.sisfreteMode || "json") === "json"
                          ? "bg-green-100 text-green-800"
                          : "bg-blue-100 text-blue-800")
                      }>
                        {config.apiConfig?.apiUrl || "https://cotar.sisfrete.com.br/cotacao/Integracao.php"}
                      </code>
                    </p>
                    <p className={((config.apiConfig?.sisfreteMode || "json") === "json" ? "text-green-600" : "text-blue-600") + " mt-1"} style={{ fontSize: "0.72rem" }}>
                      {(config.apiConfig?.sisfreteMode || "json") === "json"
                        ? "Metodo: POST | Token no header | Resposta JSON | Fallback XML automatico"
                        : "Metodo: GET | Token na query string | Resposta XML | Produtos via parametro prods (dims em metros)"
                      }
                    </p>
                  </div>
                </div>
              )}

              {/* API URL + HTTP Method (only for custom) */}
              {config.apiConfig?.provider === "custom" && (
                <>
                  <div>
                    <label className="block text-gray-500 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                      URL da API
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={config.apiConfig?.httpMethod || "POST"}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            apiConfig: { ...prev.apiConfig!, httpMethod: e.target.value as "GET" | "POST" },
                          }))
                        }
                        className="w-24 shrink-0 bg-gray-50 border border-gray-200 rounded-lg px-2 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-200 cursor-pointer font-mono"
                        style={{ fontSize: "0.85rem" }}
                      >
                        <option value="GET">GET</option>
                        <option value="POST">POST</option>
                      </select>
                      <input
                        type="url"
                        value={config.apiConfig?.apiUrl || ""}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            apiConfig: { ...prev.apiConfig!, apiUrl: e.target.value },
                          }))
                        }
                        placeholder="https://api.seuservico.com/frete/cotacao"
                        className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-200"
                        style={{ fontSize: "0.88rem" }}
                      />
                    </div>
                    <p className="text-gray-400 mt-1" style={{ fontSize: "0.72rem" }}>
                      {config.apiConfig?.httpMethod === "GET"
                        ? "GET: parâmetros serão enviados como query string (?originCep=...&destCep=...)"
                        : "POST: parâmetros serão enviados como JSON no body da requisição"}
                    </p>
                  </div>

                  {/* Request Body Template */}
                  <div>
                    <label className="block text-gray-500 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                      Template do Body / Parametros{" "}
                      <span className="text-gray-400 font-normal">(opcional)</span>
                    </label>
                    <textarea
                      value={config.apiConfig?.requestBodyTemplate || ""}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          apiConfig: { ...prev.apiConfig!, requestBodyTemplate: e.target.value },
                        }))
                      }
                      placeholder={`{\n  "cepOrigem": "{{originCep}}",\n  "cepDestino": "{{destCep}}",\n  "peso": {{weight}}\n}`}
                      rows={5}
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-200 font-mono"
                      style={{ fontSize: "0.78rem" }}
                    />
                    <p className="text-gray-400 mt-1" style={{ fontSize: "0.72rem" }}>
                      Use <code className="bg-gray-100 px-1 rounded text-gray-600">{`{{originCep}}`}</code>,{" "}
                      <code className="bg-gray-100 px-1 rounded text-gray-600">{`{{destCep}}`}</code>,{" "}
                      <code className="bg-gray-100 px-1 rounded text-gray-600">{`{{weight}}`}</code> como variaveis.
                      Se vazio, usará o payload padrão.
                      {config.apiConfig?.httpMethod === "GET" && " Para GET, as chaves do JSON serão convertidas em query params."}
                    </p>
                  </div>
                </>
              )}

              {/* API Token */}
              <div>
                <label className="block text-gray-500 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                  Token / Chave da API
                </label>
                <div className="flex gap-2">
                  <input
                    type={showApiToken ? "text" : "password"}
                    value={config.apiConfig?.apiToken || ""}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        apiConfig: {
                          ...prev.apiConfig,
                          provider: prev.apiConfig?.provider || "melhor_envio",
                          apiUrl: prev.apiConfig?.apiUrl || "",
                          apiToken: e.target.value,
                          enabled: prev.apiConfig?.enabled ?? false,
                        },
                      }))
                    }
                    placeholder="Seu token de acesso"
                    className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-200"
                    style={{ fontSize: "0.88rem" }}
                  />
                  <button
                    onClick={() => setShowApiToken(!showApiToken)}
                    className="shrink-0 px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
                  >
                    {showApiToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Enable toggle */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() =>
                    setConfig((prev) => ({
                      ...prev,
                      apiConfig: {
                        ...prev.apiConfig,
                        provider: prev.apiConfig?.provider || "melhor_envio",
                        apiUrl: prev.apiConfig?.apiUrl || "",
                        apiToken: prev.apiConfig?.apiToken || "",
                        enabled: !(prev.apiConfig?.enabled ?? false),
                      },
                    }))
                  }
                  className="cursor-pointer"
                >
                  {config.apiConfig?.enabled ? (
                    <ToggleRight className="w-8 h-8 text-green-500" />
                  ) : (
                    <ToggleLeft className="w-8 h-8 text-gray-300" />
                  )}
                </button>
                <span className="text-gray-600" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                  {config.apiConfig?.enabled ? "API ativa" : "API desativada"}
                </span>
              </div>
            </div>
          </div>

          {/* Provider-specific docs */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
            <h4 className="text-blue-800 mb-2 flex items-center gap-2" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
              <Info className="w-4 h-4" />
              {config.apiConfig?.provider === "melhor_envio"
                ? "Como configurar o Melhor Envio"
                : config.apiConfig?.provider === "frenet"
                ? "Como configurar o Frenet"
                : config.apiConfig?.provider === "sisfrete"
                ? "Como configurar o SisFrete"
                : "Como configurar API personalizada"}
            </h4>
            <ul className="text-blue-700 space-y-1.5" style={{ fontSize: "0.78rem" }}>
              {(config.apiConfig?.provider || "melhor_envio") === "melhor_envio" && (
                <>
                  <li>1. Crie uma conta em <a href="https://melhorenvio.com.br" target="_blank" rel="noopener noreferrer" className="underline font-semibold">melhorenvio.com.br</a></li>
                  <li>2. Acesse <b>Configurações &gt; Integração &gt; Tokens</b></li>
                  <li>3. Gere um token de acesso e cole no campo acima</li>
                  <li>4. Configure o <b>CEP de Origem</b> na aba Geral</li>
                  <li>5. O Melhor Envio retornará cotações dos Correios e transportadoras parceiras</li>
                </>
              )}
              {config.apiConfig?.provider === "frenet" && (
                <>
                  <li>1. Crie uma conta em <a href="https://www.frenet.com.br" target="_blank" rel="noopener noreferrer" className="underline font-semibold">frenet.com.br</a></li>
                  <li>2. Acesse o painel e gere uma <b>chave de acesso (token)</b></li>
                  <li>3. Cole no campo acima e ative a integração</li>
                  <li>4. O Frenet retornará cotações de múltiplas transportadoras</li>
                </>
              )}
              {config.apiConfig?.provider === "sisfrete" && (
                <>
                  <li>1. Acesse o painel do <a href="https://sisfrete.com.br" target="_blank" rel="noopener noreferrer" className="underline font-semibold">SisFrete</a> e copie o <b>Token de Cotacao</b> (menu Interligacao &gt; Calculos)</li>
                  <li>2. Cole o token no campo <b>Token / Chave da API</b> acima</li>
                  <li>3. Configure o <b>CEP de Origem</b> na aba Geral (obrigatorio para o SisFrete)</li>
                  <li>4. URL: <code className="bg-blue-100 px-1 rounded">https://cotar.sisfrete.com.br/cotacao/Integracao.php</code></li>
                  <li>5. <b>Modo JSON (padrao):</b> envia POST com JSON, token no header. Se falhar, tenta XML automaticamente</li>
                  <li>6. <b>Modo XML (Web Service):</b> envia GET com parametros na URL, resposta XML. Dimensoes em metros, produtos separados por /</li>
                  <li>7. O SisFrete retornara cotacoes com transportadoras configuradas na sua conta (transportadora, servico, valor, prazo min/max)</li>
                  <li className="text-blue-500 italic">Nota: a API Webtracking (<code className="bg-blue-100 px-1 rounded">api3.sisfrete.com.br</code>) e para rastreamento — use a aba "SisFrete WT" no menu lateral</li>
                </>
              )}
              {config.apiConfig?.provider === "custom" && (
                <>
                  <li>1. Informe a <b>URL completa da API</b> (inclua o path/endpoint, ex: <code className="bg-blue-100 px-1 rounded">/api/v1/cotacao</code>)</li>
                  <li>2. Selecione o <b>metodo HTTP</b> (GET ou POST) conforme exigido pela API</li>
                  <li>3. Opcionalmente, crie um <b>template de body</b> com variaveis <code className="bg-blue-100 px-1 rounded">{`{{originCep}}`}</code>, <code className="bg-blue-100 px-1 rounded">{`{{destCep}}`}</code>, <code className="bg-blue-100 px-1 rounded">{`{{weight}}`}</code></li>
                  <li>4. Para <b>GET</b>, os parâmetros do JSON serão convertidos automaticamente em query string</li>
                  <li>5. Use o <b>Analisador de JSON</b> abaixo para mapear os campos da resposta</li>
                  <li>6. O token (se informado) será enviado no header <code className="bg-blue-100 px-1 rounded">Authorization: Bearer TOKEN</code></li>
                </>
              )}
            </ul>
          </div>

          {/* ═══ JSON ANALYZER ═══ */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <button
              onClick={() => setShowAnalyzer(!showAnalyzer)}
              className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <Braces className="w-5 h-5 text-purple-600" />
              <div className="flex-1 text-left">
                <p className="text-gray-700" style={{ fontSize: "0.95rem", fontWeight: 600 }}>
                  Analisador de JSON da API
                </p>
                <p className="text-gray-400" style={{ fontSize: "0.72rem" }}>
                  Cole a resposta JSON da sua API para analisar a estrutura e mapear campos automaticamente.
                </p>
              </div>
              {config.apiConfig?.fieldMapping ? (
                <span className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded-lg" style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                  <CheckCircle className="w-3.5 h-3.5" />
                  Mapeado
                </span>
              ) : null}
              {showAnalyzer ? (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-400" />
              )}
            </button>

            {showAnalyzer && (
              <div className="border-t border-gray-100 p-5 space-y-4">
                {/* JSON Input + Upload */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-gray-500" style={{ fontSize: "0.78rem", fontWeight: 500 }}>
                      Cole o JSON ou envie um arquivo .json:
                    </label>
                    <button
                      type="button"
                      onClick={() => jsonFileRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors cursor-pointer"
                      style={{ fontSize: "0.75rem", fontWeight: 600 }}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Upload .json
                    </button>
                    <input
                      ref={jsonFileRef}
                      type="file"
                      accept=".json,.txt,application/json,text/plain"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleJsonFile(file);
                        e.target.value = "";
                      }}
                    />
                  </div>

                  <div
                    className={`relative rounded-lg transition-all ${
                      jsonDragging
                        ? "ring-2 ring-purple-400 ring-offset-2"
                        : ""
                    }`}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setJsonDragging(true); }}
                    onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setJsonDragging(true); }}
                    onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setJsonDragging(false); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setJsonDragging(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleJsonFile(file);
                    }}
                  >
                    {jsonDragging && (
                      <div className="absolute inset-0 bg-purple-600/10 backdrop-blur-[1px] rounded-lg z-10 flex items-center justify-center pointer-events-none">
                        <div className="bg-white rounded-xl px-6 py-4 shadow-lg flex items-center gap-3">
                          <Upload className="w-6 h-6 text-purple-600" />
                          <span className="text-purple-700" style={{ fontSize: "0.9rem", fontWeight: 600 }}>Solte o arquivo .json aqui</span>
                        </div>
                      </div>
                    )}
                    <textarea
                      value={jsonInput}
                      onChange={(e) => {
                        setJsonInput(e.target.value);
                        setJsonError("");
                        setJsonAnalysis(null);
                      }}
                      placeholder={`Cole o JSON aqui ou arraste um arquivo .json...\n\nExemplo:\n{\n  "options": [\n    { "name": "PAC", "price": 25.90, "delivery_days": 5 },\n    { "name": "SEDEX", "price": 45.00, "delivery_days": 2 }\n  ]\n}`}
                      className="w-full bg-gray-900 text-green-400 border border-gray-700 rounded-lg px-4 py-3 font-mono focus:outline-none focus:ring-2 focus:ring-purple-300 resize-y"
                      style={{ fontSize: "0.8rem", minHeight: "180px", lineHeight: 1.5 }}
                      spellCheck={false}
                    />
                  </div>

                  {jsonInput && (
                    <p className="text-gray-400 mt-1" style={{ fontSize: "0.68rem" }}>
                      {jsonInput.length.toLocaleString("pt-BR")} caracteres
                    </p>
                  )}
                </div>

                {jsonError && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-red-600" style={{ fontSize: "0.78rem" }}>{jsonError}</p>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      setJsonError("");
                      if (!jsonInput.trim()) {
                        setJsonError("Cole o JSON antes de analisar.");
                        return;
                      }
                      try {
                        const data = JSON.parse(jsonInput);
                        const result = analyzeJsonData(data);
                        setJsonAnalysis(result);
                        if (!result.bestArray) {
                          setJsonError("Nenhum array de opções de frete encontrado no JSON. Verifique se a resposta contém uma lista de opções.");
                        }
                      } catch (e: any) {
                        setJsonError(`JSON inválido: ${e.message}`);
                        setJsonAnalysis(null);
                      }
                    }}
                    disabled={!jsonInput.trim()}
                    className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 cursor-pointer"
                    style={{ fontSize: "0.88rem", fontWeight: 600 }}
                  >
                    <Search className="w-4 h-4" />
                    Analisar JSON
                  </button>
                  {jsonInput.trim() && (
                    <button
                      onClick={() => {
                        setJsonInput("");
                        setJsonAnalysis(null);
                        setJsonError("");
                      }}
                      className="text-gray-400 hover:text-gray-600 cursor-pointer"
                      style={{ fontSize: "0.82rem" }}
                    >
                      Limpar
                    </button>
                  )}
                </div>

                {/* Analysis Results */}
                {jsonAnalysis && jsonAnalysis.bestArray && (
                  <div className="space-y-4 pt-2">
                    {/* Structure overview */}
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                      <h4 className="text-purple-800 mb-2 flex items-center gap-2" style={{ fontSize: "0.88rem", fontWeight: 600 }}>
                        <CheckCircle className="w-4 h-4" />
                        Estrutura Detectada
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-white rounded-lg p-2.5 border border-purple-100">
                          <p className="text-purple-500" style={{ fontSize: "0.68rem", fontWeight: 500 }}>Tipo Raiz</p>
                          <p className="text-purple-800 font-mono" style={{ fontSize: "0.85rem", fontWeight: 700 }}>{jsonAnalysis.rootType}</p>
                        </div>
                        <div className="bg-white rounded-lg p-2.5 border border-purple-100">
                          <p className="text-purple-500" style={{ fontSize: "0.68rem", fontWeight: 500 }}>Caminho do Array</p>
                          <p className="text-purple-800 font-mono truncate" style={{ fontSize: "0.85rem", fontWeight: 700 }}>{jsonAnalysis.bestArray.path || "(raiz)"}</p>
                        </div>
                        <div className="bg-white rounded-lg p-2.5 border border-purple-100">
                          <p className="text-purple-500" style={{ fontSize: "0.68rem", fontWeight: 500 }}>Itens no Array</p>
                          <p className="text-purple-800 font-mono" style={{ fontSize: "0.85rem", fontWeight: 700 }}>{jsonAnalysis.bestArray.length}</p>
                        </div>
                        <div className="bg-white rounded-lg p-2.5 border border-purple-100">
                          <p className="text-purple-500" style={{ fontSize: "0.68rem", fontWeight: 500 }}>Campos Detectados</p>
                          <p className="text-purple-800 font-mono" style={{ fontSize: "0.85rem", fontWeight: 700 }}>{jsonAnalysis.bestArray.fields.length}</p>
                        </div>
                      </div>

                      {jsonAnalysis.arrays.length > 1 && (
                        <p className="text-purple-600 mt-2" style={{ fontSize: "0.72rem" }}>
                          {jsonAnalysis.arrays.length} arrays encontrados. O mais provavel foi selecionado automaticamente.
                        </p>
                      )}
                    </div>

                    {/* Field mapping table */}
                    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                        <h4 className="text-gray-700 flex items-center gap-2" style={{ fontSize: "0.88rem", fontWeight: 600 }}>
                          <ArrowRight className="w-4 h-4 text-purple-600" />
                          Campos do JSON
                        </h4>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full" style={{ fontSize: "0.82rem" }}>
                          <thead>
                            <tr className="bg-gray-50">
                              <th className="text-left px-4 py-2 text-gray-500 font-medium">Campo</th>
                              <th className="text-left px-4 py-2 text-gray-500 font-medium">Tipo</th>
                              <th className="text-left px-4 py-2 text-gray-500 font-medium">Exemplo</th>
                              <th className="text-left px-4 py-2 text-gray-500 font-medium">Mapeado para</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {jsonAnalysis.bestArray.fields.map((field) => {
                              const roleLabels: Record<string, { label: string; color: string }> = {
                                carrierName: { label: "Nome da Transportadora", color: "text-blue-700 bg-blue-50 border-blue-200" },
                                price: { label: "Preco do Frete", color: "text-green-700 bg-green-50 border-green-200" },
                                deliveryDays: { label: "Prazo (dias)", color: "text-orange-700 bg-orange-50 border-orange-200" },
                                carrierId: { label: "ID / Codigo", color: "text-gray-700 bg-gray-100 border-gray-200" },
                                error: { label: "Campo de Erro", color: "text-red-700 bg-red-50 border-red-200" },
                              };
                              const roleInfo = field.detectedRole ? roleLabels[field.detectedRole] : null;
                              const sampleStr = field.type === "object" ? "{...}" : field.type === "array" ? "[...]" : JSON.stringify(field.sampleValue);

                              return (
                                <tr key={field.key} className={field.detectedRole ? "bg-green-50/30" : ""}>
                                  <td className="px-4 py-2 text-gray-800 font-mono font-semibold">{field.key}</td>
                                  <td className="px-4 py-2">
                                    <span className="text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded" style={{ fontSize: "0.72rem" }}>{field.type}</span>
                                  </td>
                                  <td className="px-4 py-2 text-gray-500 font-mono truncate max-w-[200px]" title={sampleStr}>
                                    {sampleStr?.length > 40 ? sampleStr.slice(0, 40) + "..." : sampleStr}
                                  </td>
                                  <td className="px-4 py-2">
                                    {roleInfo ? (
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border ${roleInfo.color}`} style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                                        <CheckCircle className="w-3 h-3" />
                                        {roleInfo.label}
                                      </span>
                                    ) : (
                                      <span className="text-gray-300" style={{ fontSize: "0.72rem" }}>—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Manual mapping overrides */}
                    {jsonAnalysis.suggestedMapping && (
                      <div className="bg-white border border-gray-200 rounded-lg p-4">
                        <h4 className="text-gray-700 mb-3 flex items-center gap-2" style={{ fontSize: "0.88rem", fontWeight: 600 }}>
                          <Settings className="w-4 h-4 text-purple-600" />
                          Ajustar Mapeamento
                        </h4>
                        <p className="text-gray-400 mb-3" style={{ fontSize: "0.72rem" }}>
                          Ajuste os campos caso a detecção automática não tenha sido precisa:
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {([
                            { key: "carrierName" as const, label: "Nome da Transportadora *" },
                            { key: "price" as const, label: "Preco do Frete *" },
                            { key: "deliveryDays" as const, label: "Prazo de Entrega *" },
                            { key: "carrierId" as const, label: "ID / Código (opcional)" },
                            { key: "errorField" as const, label: "Campo de Erro (opcional)" },
                          ]).map((mapping) => (
                            <div key={mapping.key}>
                              <label className="block text-gray-500 mb-0.5" style={{ fontSize: "0.68rem", fontWeight: 500 }}>
                                {mapping.label}
                              </label>
                              <select
                                value={(jsonAnalysis.suggestedMapping as any)?.[mapping.key] || ""}
                                onChange={(e) => {
                                  const newMapping = { ...jsonAnalysis.suggestedMapping! };
                                  (newMapping as any)[mapping.key] = e.target.value || undefined;
                                  // Re-compute preview
                                  try {
                                    const parsedData = JSON.parse(jsonInput);
                                    const optionsArray = newMapping.optionsPath
                                      ? getValueAtPath(parsedData, newMapping.optionsPath)
                                      : parsedData;
                                    const preview = Array.isArray(optionsArray) ? optionsArray.slice(0, 10).map((item: any) => ({
                                      carrierName: newMapping.carrierName ? String(item[newMapping.carrierName] || "—") : "—",
                                      price: newMapping.price ? parseFloat(String(item[newMapping.price])) || 0 : 0,
                                      deliveryDays: newMapping.deliveryDays ? parseInt(String(item[newMapping.deliveryDays])) || 0 : 0,
                                      carrierId: newMapping.carrierId ? String(item[newMapping.carrierId] || "—") : "—",
                                    })) : [];
                                    setJsonAnalysis((prev) => prev ? { ...prev, suggestedMapping: newMapping, previewOptions: preview } : prev);
                                  } catch { /* ignore */ }
                                }}
                                className="w-full bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-purple-200 cursor-pointer"
                                style={{ fontSize: "0.82rem" }}
                              >
                                <option value="">-- Não mapear --</option>
                                {jsonAnalysis.bestArray!.fields.map((f) => (
                                  <option key={f.key} value={f.key}>{f.key} ({f.type})</option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Preview of parsed options */}
                    {jsonAnalysis.previewOptions.length > 0 && (
                      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                          <h4 className="text-gray-700 flex items-center gap-2" style={{ fontSize: "0.88rem", fontWeight: 600 }}>
                            <Eye className="w-4 h-4 text-purple-600" />
                            Preview: como os dados serão interpretados
                          </h4>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full" style={{ fontSize: "0.82rem" }}>
                            <thead>
                              <tr className="bg-gray-50">
                                <th className="text-left px-4 py-2 text-gray-500 font-medium">ID</th>
                                <th className="text-left px-4 py-2 text-gray-500 font-medium">Transportadora</th>
                                <th className="text-left px-4 py-2 text-gray-500 font-medium">Preco</th>
                                <th className="text-left px-4 py-2 text-gray-500 font-medium">Prazo</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {jsonAnalysis.previewOptions.map((opt, i) => (
                                <tr key={i} className="hover:bg-gray-50">
                                  <td className="px-4 py-2 text-gray-500 font-mono">{opt.carrierId}</td>
                                  <td className="px-4 py-2 text-gray-800 font-semibold">{opt.carrierName}</td>
                                  <td className="px-4 py-2 text-green-700 font-semibold">
                                    {opt.price > 0 ? `R$ ${opt.price.toFixed(2).replace(".", ",")}` : "—"}
                                  </td>
                                  <td className="px-4 py-2 text-gray-600">
                                    {opt.deliveryDays > 0 ? `${opt.deliveryDays} dias` : "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Apply mapping button */}
                    {jsonAnalysis.suggestedMapping && (
                      <div className="flex items-center gap-3 pt-1">
                        <button
                          onClick={() => {
                            const mapping = jsonAnalysis.suggestedMapping!;
                            setConfig((prev) => ({
                              ...prev,
                              apiConfig: {
                                provider: prev.apiConfig?.provider || "custom",
                                apiUrl: prev.apiConfig?.apiUrl || "",
                                apiToken: prev.apiConfig?.apiToken || "",
                                enabled: prev.apiConfig?.enabled ?? false,
                                fieldMapping: mapping,
                                sampleJson: jsonInput.slice(0, 5000),
                              },
                            }));
                            setShowAnalyzer(false);
                          }}
                          className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors cursor-pointer"
                          style={{ fontSize: "0.88rem", fontWeight: 600 }}
                        >
                          <CheckCircle className="w-4 h-4" />
                          Aplicar Mapeamento
                        </button>
                        <p className="text-gray-400" style={{ fontSize: "0.72rem" }}>
                          O mapeamento será salvo junto com a config ao clicar em "Salvar".
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Show current mapping if exists */}
                {!jsonAnalysis && config.apiConfig?.fieldMapping && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h4 className="text-green-800 mb-2 flex items-center gap-2" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                      <CheckCircle className="w-4 h-4" />
                      Mapeamento Atual
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" style={{ fontSize: "0.78rem" }}>
                      {config.apiConfig.fieldMapping.optionsPath && (
                        <div>
                          <span className="text-green-600">Caminho:</span>{" "}
                          <code className="bg-green-100 px-1 rounded text-green-800">{config.apiConfig.fieldMapping.optionsPath}</code>
                        </div>
                      )}
                      {config.apiConfig.fieldMapping.carrierName && (
                        <div>
                          <span className="text-green-600">Nome:</span>{" "}
                          <code className="bg-green-100 px-1 rounded text-green-800">{config.apiConfig.fieldMapping.carrierName}</code>
                        </div>
                      )}
                      {config.apiConfig.fieldMapping.price && (
                        <div>
                          <span className="text-green-600">Preco:</span>{" "}
                          <code className="bg-green-100 px-1 rounded text-green-800">{config.apiConfig.fieldMapping.price}</code>
                        </div>
                      )}
                      {config.apiConfig.fieldMapping.deliveryDays && (
                        <div>
                          <span className="text-green-600">Prazo:</span>{" "}
                          <code className="bg-green-100 px-1 rounded text-green-800">{config.apiConfig.fieldMapping.deliveryDays}</code>
                        </div>
                      )}
                      {config.apiConfig.fieldMapping.carrierId && (
                        <div>
                          <span className="text-green-600">ID:</span>{" "}
                          <code className="bg-green-100 px-1 rounded text-green-800">{config.apiConfig.fieldMapping.carrierId}</code>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setConfig((prev) => ({
                          ...prev,
                          apiConfig: {
                            ...prev.apiConfig!,
                            fieldMapping: undefined,
                            sampleJson: undefined,
                          },
                        }));
                      }}
                      className="mt-3 text-red-500 hover:text-red-700 cursor-pointer"
                      style={{ fontSize: "0.75rem", fontWeight: 500 }}
                    >
                      Remover mapeamento
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ═══════════════════════════════════════ */}
          {/* ── PRODUCT WEIGHT/DIMENSIONS DEBUG ─── */}
          {/* ═══════════════════════════════════════ */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-cyan-50">
              <h3 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "1rem", fontWeight: 700 }}>
                <Scale className="w-5 h-5 text-blue-600" />
                Diagnostico: Peso e Dimensoes (SIGE)
              </h3>
              <p className="text-gray-500 mt-0.5" style={{ fontSize: "0.75rem" }}>
                Consulta o SIGE para verificar se o produto possui peso, largura, altura e comprimento cadastrados.
                Esses dados sao usados automaticamente no calculo de frete.
              </p>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-gray-500 mb-1" style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                    SKU do Produto *
                  </label>
                  <input
                    type="text"
                    value={debugSku}
                    onChange={(e) => setDebugSku(e.target.value.trim())}
                    onKeyDown={(e) => e.key === "Enter" && debugSku && !debugRunning && (async () => {
                      setDebugRunning(true); setDebugError(""); setDebugResult(null);
                      try {
                        const t = await getToken();
                        const r = await api.debugProductPhysical(t, debugSku);
                        setDebugResult(r);
                      } catch (err: any) { setDebugError(err.message || String(err)); }
                      finally { setDebugRunning(false); }
                    })()}
                    placeholder="Ex: 103716-347"
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-gray-800 font-mono focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                    style={{ fontSize: "0.95rem", fontWeight: 600 }}
                  />
                </div>
                <button
                  disabled={!debugSku || debugRunning}
                  onClick={async () => {
                    setDebugRunning(true); setDebugError(""); setDebugResult(null);
                    try {
                      const t = await getToken();
                      const r = await api.debugProductPhysical(t, debugSku);
                      setDebugResult(r);
                    } catch (err: any) { setDebugError(err.message || String(err)); }
                    finally { setDebugRunning(false); }
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none transition-colors cursor-pointer"
                  style={{ fontSize: "0.88rem", fontWeight: 600 }}
                >
                  {debugRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  {debugRunning ? "Buscando..." : "Consultar SIGE"}
                </button>
              </div>

              {debugError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-600" style={{ fontSize: "0.82rem" }}>{debugError}</p>
                </div>
              )}

              {debugResult && (
                <div className="space-y-3">
                  {/* Extracted physical data */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="text-blue-800 mb-3 flex items-center gap-2" style={{ fontSize: "0.88rem", fontWeight: 700 }}>
                      <Scale className="w-4 h-4" />
                      Dados Fisicos Extraidos
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                      {[
                        { label: "Peso (kg)", value: debugResult.physicalDataExtracted?.weight, key: "weight" },
                        { label: "Comprimento (cm)", value: debugResult.physicalDataExtracted?.length, key: "length" },
                        { label: "Largura (cm)", value: debugResult.physicalDataExtracted?.width, key: "width" },
                        { label: "Altura (cm)", value: debugResult.physicalDataExtracted?.height, key: "height" },
                        { label: "Preco (R$)", value: debugResult.physicalDataExtracted?.price, key: "price" },
                      ].map((f) => (
                        <div key={f.key} className="bg-white rounded-lg px-3 py-2 border border-blue-100">
                          <p className="text-blue-500 mb-0.5" style={{ fontSize: "0.65rem", fontWeight: 500 }}>{f.label}</p>
                          <p className={f.value > 0 ? "text-blue-800" : "text-gray-400"} style={{ fontSize: "1.1rem", fontWeight: 700 }}>
                            {f.value > 0 ? f.value : "—"}
                          </p>
                        </div>
                      ))}
                    </div>
                    <p className="text-blue-500 mt-2" style={{ fontSize: "0.68rem" }}>
                      Fonte: <strong>{debugResult.physicalDataExtracted?._source || "?"}</strong>
                      {debugResult.physicalDataExtracted?._source === "default" && " (SIGE não retornou dados — usando valores padrão)"}
                      {debugResult.physicalDataExtracted?._source === "sige" && " (dados reais do SIGE)"}
                    </p>
                  </div>

                  {/* Raw fields found */}
                  {debugResult.physicalDataExtracted?._rawFields && Object.keys(debugResult.physicalDataExtracted._rawFields).length > 0 && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <h4 className="text-green-800 mb-2" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                        Campos de peso/dimensao encontrados no SIGE:
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(debugResult.physicalDataExtracted._rawFields).map(([k, v]) => (
                          <span key={k} className="bg-green-100 text-green-800 px-2 py-1 rounded font-mono" style={{ fontSize: "0.75rem" }}>
                            {k} = {String(v)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {debugResult.physicalDataExtracted?._rawFields && Object.keys(debugResult.physicalDataExtracted._rawFields).length === 0 && debugResult.physicalDataExtracted?._source === "sige" && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                      <p className="text-yellow-700" style={{ fontSize: "0.78rem" }}>
                        <AlertTriangle className="w-4 h-4 inline mr-1" />
                        O SIGE retornou o produto, mas <strong>nenhum campo de peso/dimensão</strong> foi encontrado. O frete será calculado com valores padrão.
                      </p>
                    </div>
                  )}

                  {/* All field names */}
                  {debugResult.allFieldNames && debugResult.allFieldNames.length > 0 && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <h4 className="text-gray-700 mb-2" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                        Todos os campos retornados pelo SIGE ({debugResult.allFieldNames.length}):
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {debugResult.allFieldNames.map((f: string) => {
                          var isPhysical = [...SIGE_WEIGHT_FIELDS_UI, ...SIGE_DIM_FIELDS_UI].includes(f.toLowerCase());
                          return (
                            <span key={f} className={"px-2 py-0.5 rounded font-mono " + (isPhysical ? "bg-green-100 text-green-800 ring-1 ring-green-300" : "bg-gray-100 text-gray-600")} style={{ fontSize: "0.68rem" }}>
                              {f}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {!debugResult.rawProduct && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-red-600" style={{ fontSize: "0.78rem" }}>
                        <AlertTriangle className="w-4 h-4 inline mr-1" />
                        Produto não encontrado no SIGE com SKU "{debugResult.sku}".
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ═══════════════════════════════════════ */}
          {/* ── API TEST PANEL ──────────────────── */}
          {/* ═══════════════════════════════════════ */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-amber-50 to-orange-50">
              <h3 className="text-gray-800 flex items-center gap-2" style={{ fontSize: "1rem", fontWeight: 700 }}>
                <Terminal className="w-5 h-5 text-orange-600" />
                Testar API Externa
              </h3>
              <p className="text-gray-500 mt-0.5" style={{ fontSize: "0.75rem" }}>
                Executa uma chamada real a API configurada e mostra cada etapa do processo com detalhes de debug.
              </p>
            </div>

            <div className="p-5 space-y-4">
              {/* Test inputs */}
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-gray-500 mb-1" style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                    CEP de Destino *
                  </label>
                  <input
                    type="text"
                    value={testCep}
                    onChange={(e) => setTestCep(formatCep(e.target.value))}
                    placeholder="01001-000"
                    maxLength={9}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-gray-800 font-mono focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400"
                    style={{ fontSize: "0.95rem", fontWeight: 600 }}
                  />
                </div>
                <div className="w-[120px]">
                  <label className="block text-gray-500 mb-1" style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                    Peso (kg)
                  </label>
                  <input
                    type="number"
                    value={testWeight}
                    onChange={(e) => setTestWeight(e.target.value)}
                    placeholder={String(config.defaultWeight || 1)}
                    min={0.1}
                    step={0.5}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400"
                    style={{ fontSize: "0.95rem" }}
                  />
                </div>
                <button
                  onClick={async () => {
                    const cepDigits = testCep.replace(/\D/g, "");
                    if (cepDigits.length !== 8) {
                      setTestError("Informe um CEP válido com 8 dígitos.");
                      return;
                    }
                    setTestRunning(true);
                    setTestError("");
                    setTestResult(null);
                    setShowRawResponse(false);
                    setShowRequestPayload(false);
                    try {
                      const token = await getToken();
                      const w = testWeight ? parseFloat(testWeight) : undefined;
                      const result = await api.testShippingApi(token, cepDigits, w);
                      setTestResult(result);
                    } catch (e: any) {
                      console.error("API test error:", e);
                      setTestError(e.message || "Erro ao executar teste.");
                    } finally {
                      setTestRunning(false);
                    }
                  }}
                  disabled={testRunning || testCep.replace(/\D/g, "").length !== 8}
                  className="flex items-center gap-2 px-6 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
                  style={{ fontSize: "0.9rem", fontWeight: 700 }}
                >
                  {testRunning ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  {testRunning ? "Testando..." : "Executar Teste"}
                </button>
                {testResult && (
                  <button
                    onClick={() => { setTestResult(null); setTestError(""); }}
                    className="text-gray-400 hover:text-gray-600 cursor-pointer p-2"
                    title="Limpar resultado"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
              </div>

              {testError && !testResult && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-red-600" style={{ fontSize: "0.82rem" }}>{testError}</p>
                </div>
              )}

              {/* Test Results */}
              {testResult && (
                <div className="space-y-4 pt-1">
                  {/* Overall status banner */}
                  <div className={`rounded-lg px-4 py-3 flex items-center gap-3 ${
                    testResult.ok
                      ? "bg-green-50 border border-green-200"
                      : "bg-red-50 border border-red-200"
                  }`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      testResult.ok ? "bg-green-100" : "bg-red-100"
                    }`}>
                      {testResult.ok ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-red-600" />
                      )}
                    </div>
                    <div>
                      <p className={`font-bold ${testResult.ok ? "text-green-800" : "text-red-800"}`} style={{ fontSize: "0.95rem" }}>
                        {testResult.ok
                          ? `Sucesso! ${testResult.parsedOptions.length} opcao(oes) de frete retornada(s)`
                          : "Falha — nenhuma opção de frete válida retornada"}
                      </p>
                      {testResult.timing && (
                        <p className="text-gray-500" style={{ fontSize: "0.72rem" }}>
                          Tempo total: {testResult.timing.totalMs}ms
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Steps pipeline */}
                  <div className="bg-gray-900 rounded-xl overflow-hidden">
                    <div className="px-4 py-2.5 bg-gray-800 flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-300" style={{ fontSize: "0.8rem", fontWeight: 600 }}>Pipeline de Execucao</span>
                      <span className="ml-auto text-gray-500" style={{ fontSize: "0.68rem" }}>
                        {testResult.steps.filter(s => s.status === "ok").length}/{testResult.steps.length} OK
                      </span>
                    </div>
                    <div className="p-3 space-y-1">
                      {testResult.steps.map((step, i) => {
                        const statusIcon = step.status === "ok" ? "text-green-400" : step.status === "warn" ? "text-yellow-400" : "text-red-400";
                        const statusSymbol = step.status === "ok" ? "\u2713" : step.status === "warn" ? "\u26A0" : "\u2717";
                        return (
                          <div key={i} className="flex items-start gap-2 font-mono" style={{ fontSize: "0.76rem" }}>
                            <span className={`${statusIcon} shrink-0 w-4 text-center`} style={{ fontWeight: 700 }}>{statusSymbol}</span>
                            <span className="text-gray-400 shrink-0 min-w-[130px]">{step.step}</span>
                            <span className={`${
                              step.status === "ok" ? "text-green-300" : step.status === "warn" ? "text-yellow-300" : "text-red-300"
                            } break-all`}>
                              {step.detail}
                            </span>
                            {step.ms !== undefined && (
                              <span className="text-gray-600 shrink-0 ml-auto">{step.ms}ms</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Parsed Options Table */}
                  {testResult.parsedOptions.length > 0 && (
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      <div className="px-4 py-3 bg-green-50 border-b border-green-100 flex items-center gap-2">
                        <Truck className="w-4 h-4 text-green-600" />
                        <span className="text-green-800" style={{ fontSize: "0.88rem", fontWeight: 700 }}>
                          Opções de Frete Parseadas ({testResult.parsedOptions.length})
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full" style={{ fontSize: "0.82rem" }}>
                          <thead>
                            <tr className="bg-gray-50 text-gray-500">
                              <th className="text-left px-4 py-2.5 font-medium">ID</th>
                              <th className="text-left px-4 py-2.5 font-medium">Transportadora</th>
                              <th className="text-right px-4 py-2.5 font-medium">Preco</th>
                              <th className="text-right px-4 py-2.5 font-medium">Prazo</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {testResult.parsedOptions.map((opt, i) => (
                              <tr key={i} className="hover:bg-green-50/40">
                                <td className="px-4 py-2.5 text-gray-400 font-mono" style={{ fontSize: "0.72rem" }}>{opt.carrierId}</td>
                                <td className="px-4 py-2.5 text-gray-800 font-semibold">{opt.carrierName}</td>
                                <td className="px-4 py-2.5 text-right text-green-700 font-bold">
                                  R$ {opt.price.toFixed(2).replace(".", ",")}
                                </td>
                                <td className="px-4 py-2.5 text-right text-gray-600">
                                  {opt.deliveryDays > 0 ? `${opt.deliveryDays} dias` : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Parse Errors */}
                  {testResult.parseErrors && testResult.parseErrors.length > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl overflow-hidden">
                      <div className="px-4 py-3 bg-yellow-100 border-b border-yellow-200 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-yellow-600" />
                        <span className="text-yellow-800" style={{ fontSize: "0.85rem", fontWeight: 700 }}>
                          Itens Filtrados / Erros ({testResult.parseErrors.length})
                        </span>
                      </div>
                      <div className="p-3 space-y-1 font-mono" style={{ fontSize: "0.72rem" }}>
                        {testResult.parseErrors.map((err, i) => (
                          <p key={i} className="text-yellow-700 break-all">{err}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Expandable: Request Payload */}
                  {(testResult.requestPayload || (testResult as any).requestUrl) && (
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <button
                        onClick={() => setShowRequestPayload(!showRequestPayload)}
                        className="w-full px-4 py-3 bg-gray-50 flex items-center gap-2 hover:bg-gray-100 transition-colors cursor-pointer"
                      >
                        {showRequestPayload ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                        <ExternalLink className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-600" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                          {(testResult as any).requestMethod || "POST"} Request
                        </span>
                        {(testResult as any).requestMethod === "GET" && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-mono">GET</span>
                        )}
                      </button>
                      {showRequestPayload && (
                        <div className="p-3 bg-gray-900 space-y-2">
                          {(testResult as any).requestUrl && (
                            <div>
                              <p className="text-gray-400 mb-1" style={{ fontSize: "0.68rem" }}>URL:</p>
                              <pre className="text-cyan-400 font-mono overflow-x-auto whitespace-pre-wrap break-all" style={{ fontSize: "0.72rem" }}>
                                {(testResult as any).requestUrl}
                              </pre>
                            </div>
                          )}
                          {testResult.requestPayload && (
                            <div>
                              <p className="text-gray-400 mb-1" style={{ fontSize: "0.68rem" }}>Body:</p>
                              <pre className="text-green-400 font-mono overflow-x-auto whitespace-pre-wrap break-all" style={{ fontSize: "0.72rem" }}>
                                {JSON.stringify(testResult.requestPayload, null, 2)}
                              </pre>
                            </div>
                          )}
                          {!(testResult.requestPayload) && (testResult as any).requestMethod === "GET" && (
                            <p className="text-gray-500 italic" style={{ fontSize: "0.72rem" }}>
                              Requisicao GET - sem body (parametros na query string acima)
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Expandable: Raw Response */}
                  {testResult.rawResponse && (
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <button
                        onClick={() => setShowRawResponse(!showRawResponse)}
                        className="w-full px-4 py-3 bg-gray-50 flex items-center gap-2 hover:bg-gray-100 transition-colors cursor-pointer"
                      >
                        {showRawResponse ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                        <Braces className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-600" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                          Resposta Raw da API
                        </span>
                        {testResult.rawResponse?._truncated && (
                          <span className="text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded" style={{ fontSize: "0.65rem" }}>
                            Truncado ({(testResult.rawResponse._size / 1024).toFixed(0)}KB)
                          </span>
                        )}
                      </button>
                      {showRawResponse && (
                        <div className="p-3 bg-gray-900 relative">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(JSON.stringify(testResult.rawResponse, null, 2));
                            }}
                            className="absolute top-2 right-2 text-gray-500 hover:text-gray-300 cursor-pointer p-1.5 bg-gray-800 rounded"
                            title="Copiar JSON"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <pre className="text-green-400 font-mono overflow-x-auto whitespace-pre-wrap break-all max-h-[400px] overflow-y-auto" style={{ fontSize: "0.72rem" }}>
                            {JSON.stringify(testResult.rawResponse, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Raw text fallback when JSON parse failed */}
                  {testResult.rawText && !testResult.rawResponse && (
                    <div className="border border-red-200 rounded-xl overflow-hidden">
                      <div className="px-4 py-3 bg-red-50 border-b border-red-100 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                        <span className="text-red-700" style={{ fontSize: "0.82rem", fontWeight: 600 }}>Resposta Raw (nao-JSON)</span>
                      </div>
                      <div className="p-3 bg-gray-900">
                        <pre className="text-red-400 font-mono overflow-x-auto whitespace-pre-wrap break-all max-h-[300px] overflow-y-auto" style={{ fontSize: "0.72rem" }}>
                          {testResult.rawText}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* Field mapping used */}
                  {testResult.fieldMapping && (
                    <div className="bg-purple-50 border border-purple-200 rounded-lg px-4 py-3">
                      <p className="text-purple-700 mb-1" style={{ fontSize: "0.72rem", fontWeight: 600 }}>Mapeamento utilizado neste teste:</p>
                      <div className="flex flex-wrap gap-2" style={{ fontSize: "0.72rem" }}>
                        {testResult.fieldMapping.optionsPath && (
                          <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-mono">
                            path: {testResult.fieldMapping.optionsPath}
                          </span>
                        )}
                        <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-mono">
                          nome: {testResult.fieldMapping.carrierName || "—"}
                        </span>
                        <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded font-mono">
                          preco: {testResult.fieldMapping.price || "—"}
                        </span>
                        <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded font-mono">
                          prazo: {testResult.fieldMapping.deliveryDays || "—"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Rule Editor subcomponent ───

function RuleEditor({
  rule,
  onChange,
  compact = false,
}: {
  rule: api.ShippingStateRule;
  onChange: (rule: api.ShippingStateRule) => void;
  compact?: boolean;
}) {
  const update = (field: keyof api.ShippingStateRule, value: number) => {
    onChange({ ...rule, [field]: value });
  };

  const gridClass = compact ? "grid grid-cols-2 sm:grid-cols-4 gap-2" : "grid grid-cols-2 md:grid-cols-4 gap-3";

  return (
    <div className={gridClass}>
      <div>
        <label className="block text-gray-400 mb-0.5" style={{ fontSize: "0.68rem", fontWeight: 500 }}>
          Preço Base (R$)
        </label>
        <input
          type="number"
          value={rule.basePrice || ""}
          onChange={(e) => update("basePrice", parseFloat(e.target.value) || 0)}
          min={0}
          step={0.5}
          placeholder="0.00"
          className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-gray-800 focus:outline-none focus:ring-1 focus:ring-red-200"
          style={{ fontSize: "0.82rem" }}
        />
      </div>
      <div>
        <label className="block text-gray-400 mb-0.5" style={{ fontSize: "0.68rem", fontWeight: 500 }}>
          R$/kg
        </label>
        <input
          type="number"
          value={rule.pricePerKg || ""}
          onChange={(e) => update("pricePerKg", parseFloat(e.target.value) || 0)}
          min={0}
          step={0.5}
          placeholder="0.00"
          className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-gray-800 focus:outline-none focus:ring-1 focus:ring-red-200"
          style={{ fontSize: "0.82rem" }}
        />
      </div>
      <div>
        <label className="block text-gray-400 mb-0.5" style={{ fontSize: "0.68rem", fontWeight: 500 }}>
          R$/item extra
        </label>
        <input
          type="number"
          value={rule.pricePerItem || ""}
          onChange={(e) => update("pricePerItem", parseFloat(e.target.value) || 0)}
          min={0}
          step={0.5}
          placeholder="0.00"
          className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-gray-800 focus:outline-none focus:ring-1 focus:ring-red-200"
          style={{ fontSize: "0.82rem" }}
        />
      </div>
      <div>
        <label className="block text-gray-400 mb-0.5" style={{ fontSize: "0.68rem", fontWeight: 500 }}>
          Prazo (dias uteis)
        </label>
        <input
          type="number"
          value={rule.deliveryDays || ""}
          onChange={(e) => update("deliveryDays", parseInt(e.target.value) || 0)}
          min={0}
          placeholder="0"
          className="w-full bg-white border border-gray-200 rounded px-2 py-1.5 text-gray-800 focus:outline-none focus:ring-1 focus:ring-red-200"
          style={{ fontSize: "0.82rem" }}
        />
      </div>
    </div>
  );
}