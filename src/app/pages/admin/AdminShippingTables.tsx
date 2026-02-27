import { useState, useEffect, useCallback, useRef } from "react";
import {
  Upload,
  Loader2,
  Trash2,
  FileSpreadsheet,
  Check,
  AlertTriangle,
  Eye,
  X,
  Table2,
  Info,
  ChevronUp,
} from "lucide-react";
import * as api from "../../services/api";
import { supabase } from "../../services/supabaseClient";
import { getValidAdminToken } from "./adminAuth";

async function getToken(): Promise<string> {
  const token = await getValidAdminToken();
  if (!token) throw new Error("Sessão expirada. Faça login novamente.");
  return token;
}

// ── CSV Parser ──

interface ParsedCSV {
  headers: string[];
  rows: string[][];
  delimiter: string;
}

const COLUMN_ALIASES: Record<string, string[]> = {
  cepInicio: ["cep_inicio", "cepinicio", "cep_de", "cep_inicial", "faixa_inicio", "faixa_cep_inicio", "de", "cep_from", "zip_from", "inicio", "inicial"],
  cepFim: ["cep_fim", "cepfim", "cep_ate", "cep_final", "faixa_fim", "faixa_cep_fim", "ate", "cep_to", "zip_to", "fim", "final"],
  pesoMin: ["peso_min", "pesomin", "peso_de", "weight_min", "peso_minimo", "kg_min", "de_kg"],
  pesoMax: ["peso_max", "pesomax", "peso_ate", "weight_max", "peso_maximo", "kg_max", "ate_kg", "kg"],
  valor: ["valor", "preco", "frete", "price", "value", "vl_frete", "valor_frete", "custo"],
  prazo: ["prazo", "prazo_dias", "dias", "delivery", "days", "delivery_days", "prazo_entrega", "tempo"],
};

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function detectDelimiter(text: string): string {
  const firstLine = text.split("\n")[0] || "";
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  const tabs = (firstLine.match(/\t/g) || []).length;
  if (tabs >= commas && tabs >= semicolons && tabs > 0) return "\t";
  if (semicolons > commas) return ";";
  return ",";
}

function parseCSV(text: string): ParsedCSV {
  // Remove BOM
  const clean = text.replace(/^\uFEFF/, "").trim();
  const delimiter = detectDelimiter(clean);

  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { headers: [], rows: [], delimiter };

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);

  return { headers, rows, delimiter };
}

function autoMapColumns(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const normalized = headers.map(normalizeHeader);

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (let i = 0; i < normalized.length; i++) {
      if (aliases.includes(normalized[i]) || normalized[i] === field.toLowerCase()) {
        map[field] = i;
        break;
      }
    }
  }

  // If cepInicio/cepFim not found, try positional heuristic for 2-column tables
  if (map.cepInicio === undefined && map.cepFim === undefined && headers.length >= 2) {
    // First two numeric-looking columns might be CEP range
    for (let i = 0; i < headers.length; i++) {
      const h = normalized[i];
      if (h.includes("cep") || h.includes("faixa") || h.includes("zip")) {
        if (map.cepInicio === undefined) map.cepInicio = i;
        else if (map.cepFim === undefined) { map.cepFim = i; break; }
      }
    }
  }

  return map;
}

function parseNumber(val: string, decimalSep: string = "."): number {
  if (!val || val.trim() === "") return 0;
  let cleaned = val.trim().replace(/[^\d.,\-]/g, "");
  if (decimalSep === ",") {
    // "1.234,56" → "1234.56"
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  }
  return parseFloat(cleaned) || 0;
}

function formatCep(cep: string): string {
  const d = cep.replace(/\D/g, "").padStart(8, "0").slice(0, 8);
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

// ── Component ──

export function AdminShippingTables() {
  const [tables, setTables] = useState<api.ShippingTableMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Upload state
  const [showUpload, setShowUpload] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadCarrier, setUploadCarrier] = useState("");
  const [uploadCarrierType, setUploadCarrierType] = useState("transportadora");
  const [parsed, setParsed] = useState<ParsedCSV | null>(null);
  const [columnMap, setColumnMap] = useState<Record<string, number>>({});
  const [decimalSep, setDecimalSep] = useState(".");
  const [uploading, setUploading] = useState(false);
  const [previewRows, setPreviewRows] = useState<api.ShippingTableRow[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Preview existing table
  const [previewTableId, setPreviewTableId] = useState<string | null>(null);
  const [previewTable, setPreviewTable] = useState<api.ShippingTableFull | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Deleting
  const [deleting, setDeleting] = useState<string | null>(null);

  // Load tables
  const loadTables = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await api.getShippingTables(token);
      setTables(res.tables || []);
    } catch (e: any) {
      console.error("Error loading freight tables:", e);
      setError(e.message || "Erro ao carregar tabelas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  // Handle file selection
  const handleFile = useCallback((file: File) => {
    setError("");
    setSuccess("");

    const isCSV = file.name.endsWith(".csv") || file.name.endsWith(".txt") || file.type === "text/csv";
    if (!isCSV) {
      setError("Formato não suportado. Use arquivos .csv ou .txt");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) {
        setError("Arquivo vazio.");
        return;
      }

      const result = parseCSV(text);
      if (result.headers.length < 2) {
        setError("Arquivo invalido. Verifique se tem cabecalho e pelo menos 2 colunas.");
        return;
      }
      if (result.rows.length === 0) {
        setError("Nenhuma linha de dados encontrada no arquivo.");
        return;
      }

      setParsed(result);
      const map = autoMapColumns(result.headers);
      setColumnMap(map);

      // Auto-detect decimal separator
      if (result.delimiter === ";") {
        setDecimalSep(",");
      }

      // Auto-fill name from filename
      if (!uploadName) {
        setUploadName(file.name.replace(/\.(csv|txt|xlsx?)$/i, ""));
      }

      setShowUpload(true);
    };
    reader.readAsText(file, "UTF-8");
  }, [uploadName]);

  // Build preview from mapping
  useEffect(() => {
    if (!parsed || columnMap.cepInicio === undefined || columnMap.cepFim === undefined) {
      setPreviewRows([]);
      return;
    }

    const rows: api.ShippingTableRow[] = [];
    for (const row of parsed.rows.slice(0, 500)) {
      const cepInicio = row[columnMap.cepInicio]?.replace(/\D/g, "") || "";
      const cepFim = row[columnMap.cepFim]?.replace(/\D/g, "") || "";
      if (!cepInicio || !cepFim) continue;

      rows.push({
        cepInicio,
        cepFim,
        pesoMin: columnMap.pesoMin !== undefined ? parseNumber(row[columnMap.pesoMin], decimalSep) : 0,
        pesoMax: columnMap.pesoMax !== undefined ? parseNumber(row[columnMap.pesoMax], decimalSep) : 9999,
        valor: columnMap.valor !== undefined ? parseNumber(row[columnMap.valor], decimalSep) : 0,
        prazo: columnMap.prazo !== undefined ? parseInt(row[columnMap.prazo]) || 0 : 0,
      });
    }
    setPreviewRows(rows);
  }, [parsed, columnMap, decimalSep]);

  // Upload table
  const handleUpload = useCallback(async () => {
    if (!parsed) return;
    if (!uploadName.trim()) {
      setError("Informe um nome para a tabela.");
      return;
    }

    setUploading(true);
    setError("");
    try {
      // Build all rows (not just preview)
      const allRows: api.ShippingTableRow[] = [];
      for (const row of parsed.rows) {
        const cepInicio = row[columnMap.cepInicio]?.replace(/\D/g, "") || "";
        const cepFim = row[columnMap.cepFim]?.replace(/\D/g, "") || "";
        if (!cepInicio || !cepFim) continue;

        allRows.push({
          cepInicio,
          cepFim,
          pesoMin: columnMap.pesoMin !== undefined ? parseNumber(row[columnMap.pesoMin], decimalSep) : 0,
          pesoMax: columnMap.pesoMax !== undefined ? parseNumber(row[columnMap.pesoMax], decimalSep) : 9999,
          valor: columnMap.valor !== undefined ? parseNumber(row[columnMap.valor], decimalSep) : 0,
          prazo: columnMap.prazo !== undefined ? parseInt(row[columnMap.prazo]) || 0 : 0,
        });
      }

      if (allRows.length === 0) {
        setError("Nenhuma linha valida para importar. Verifique o mapeamento de colunas.");
        return;
      }

      const token = await getToken();
      await api.uploadShippingTable(token, {
        name: uploadName.trim(),
        carrierName: uploadCarrier.trim() || uploadName.trim(),
        carrierType: uploadCarrierType,
        rows: allRows,
      });

      setSuccess(`Tabela "${uploadName}" importada com ${allRows.length} linhas!`);
      setShowUpload(false);
      setParsed(null);
      setColumnMap({});
      setUploadName("");
      setUploadCarrier("");
      if (fileRef.current) fileRef.current.value = "";

      await loadTables();
      setTimeout(() => setSuccess(""), 4000);
    } catch (e: any) {
      console.error("Upload error:", e);
      setError(e.message || "Erro ao importar tabela.");
    } finally {
      setUploading(false);
    }
  }, [parsed, columnMap, decimalSep, uploadName, uploadCarrier, uploadCarrierType, loadTables]);

  // Delete table
  const handleDelete = useCallback(async (tableId: string) => {
    if (!confirm("Excluir esta tabela de frete?")) return;
    setDeleting(tableId);
    try {
      const token = await getToken();
      await api.deleteShippingTable(token, tableId);
      setTables((prev) => prev.filter((t) => t.id !== tableId));
      setSuccess("Tabela excluida.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e: any) {
      setError(e.message || "Erro ao excluir tabela.");
    } finally {
      setDeleting(null);
    }
  }, []);

  // Preview existing table
  const handlePreview = useCallback(async (tableId: string) => {
    if (previewTableId === tableId) {
      setPreviewTableId(null);
      setPreviewTable(null);
      return;
    }
    setPreviewTableId(tableId);
    setLoadingPreview(true);
    try {
      const token = await getToken();
      const table = await api.getShippingTable(token, tableId);
      setPreviewTable(table);
    } catch (e: any) {
      console.error("Preview error:", e);
      setError(e.message || "Erro ao carregar tabela.");
      setPreviewTableId(null);
    } finally {
      setLoadingPreview(false);
    }
  }, [previewTableId]);

  // Drag & drop handlers
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const fieldOptions = [
    { key: "cepInicio", label: "CEP Inicio *", required: true },
    { key: "cepFim", label: "CEP Fim *", required: true },
    { key: "pesoMin", label: "Peso Min (kg)" },
    { key: "pesoMax", label: "Peso Max (kg)" },
    { key: "valor", label: "Valor (R$) *", required: true },
    { key: "prazo", label: "Prazo (dias)" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-red-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Messages */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-red-600" style={{ fontSize: "0.82rem" }}>{error}</p>
          <button onClick={() => setError("")} className="ml-auto cursor-pointer text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <Check className="w-4 h-4 text-green-600" />
          <p className="text-green-700" style={{ fontSize: "0.82rem" }}>{success}</p>
        </div>
      )}

      {/* Upload area */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
          dragOver
            ? "border-red-400 bg-red-50"
            : "border-gray-300 bg-gray-50 hover:border-red-300 hover:bg-red-50/30"
        }`}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <Upload className={`w-8 h-8 mx-auto mb-2 ${dragOver ? "text-red-500" : "text-gray-400"}`} />
        <p className="text-gray-600" style={{ fontSize: "0.88rem", fontWeight: 600 }}>
          Arraste um arquivo CSV aqui ou clique para selecionar
        </p>
        <p className="text-gray-400 mt-1" style={{ fontSize: "0.75rem" }}>
          Formato: cep_inicio, cep_fim, peso_min, peso_max, valor, prazo
        </p>
      </div>

      {/* Upload configuration panel */}
      {showUpload && parsed && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-red-600" />
              <span className="text-gray-700" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                Configurar Importacao
              </span>
              <span className="text-gray-400" style={{ fontSize: "0.72rem" }}>
                ({parsed.rows.length} linhas, {parsed.headers.length} colunas, separador: {parsed.delimiter === "\t" ? "TAB" : `"${parsed.delimiter}"`})
              </span>
            </div>
            <button
              onClick={() => { setShowUpload(false); setParsed(null); }}
              className="text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* Name & Carrier */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-gray-500 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                  Nome da Tabela *
                </label>
                <input
                  type="text"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  placeholder="Ex: Jadlog 2024"
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-200"
                  style={{ fontSize: "0.85rem" }}
                />
              </div>
              <div>
                <label className="block text-gray-500 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                  Transportadora
                </label>
                <input
                  type="text"
                  value={uploadCarrier}
                  onChange={(e) => setUploadCarrier(e.target.value)}
                  placeholder="Ex: Jadlog"
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-200"
                  style={{ fontSize: "0.85rem" }}
                />
              </div>
              <div>
                <label className="block text-gray-500 mb-1" style={{ fontSize: "0.75rem", fontWeight: 500 }}>
                  Separador Decimal
                </label>
                <select
                  value={decimalSep}
                  onChange={(e) => setDecimalSep(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-200 cursor-pointer"
                  style={{ fontSize: "0.85rem" }}
                >
                  <option value=".">Ponto (1234.56)</option>
                  <option value=",">Virgula (1234,56)</option>
                </select>
              </div>
            </div>

            {/* Column Mapping */}
            <div>
              <h4 className="text-gray-600 mb-2 flex items-center gap-2" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                <Table2 className="w-4 h-4" />
                Mapeamento de Colunas
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                {fieldOptions.map((field) => (
                  <div key={field.key}>
                    <label className="block text-gray-400 mb-0.5" style={{ fontSize: "0.68rem", fontWeight: 500 }}>
                      {field.label}
                    </label>
                    <select
                      value={columnMap[field.key] ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setColumnMap((prev) => {
                          const next = { ...prev };
                          if (val === "") delete next[field.key];
                          else next[field.key] = parseInt(val);
                          return next;
                        });
                      }}
                      className={`w-full border rounded px-2 py-1.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-red-200 cursor-pointer ${
                        field.required && columnMap[field.key] === undefined
                          ? "bg-red-50 border-red-300"
                          : "bg-white border-gray-200"
                      }`}
                      style={{ fontSize: "0.78rem" }}
                    >
                      <option value="">-- Ignorar --</option>
                      {parsed.headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h} (col {i + 1})
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Preview table */}
            {previewRows.length > 0 && (
              <div>
                <h4 className="text-gray-600 mb-2 flex items-center gap-2" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                  <Eye className="w-4 h-4" />
                  Pré-visualização ({previewRows.length} linhas válidas{parsed.rows.length > 500 ? ` de ${parsed.rows.length}` : ""})
                </h4>
                <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-60 overflow-y-auto">
                  <table className="w-full text-left" style={{ fontSize: "0.78rem" }}>
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-gray-500 font-medium">CEP Inicio</th>
                        <th className="px-3 py-2 text-gray-500 font-medium">CEP Fim</th>
                        <th className="px-3 py-2 text-gray-500 font-medium">Peso Min</th>
                        <th className="px-3 py-2 text-gray-500 font-medium">Peso Max</th>
                        <th className="px-3 py-2 text-gray-500 font-medium">Valor</th>
                        <th className="px-3 py-2 text-gray-500 font-medium">Prazo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {previewRows.slice(0, 20).map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-1.5 text-gray-700 font-mono">{formatCep(row.cepInicio)}</td>
                          <td className="px-3 py-1.5 text-gray-700 font-mono">{formatCep(row.cepFim)}</td>
                          <td className="px-3 py-1.5 text-gray-600">{row.pesoMin} kg</td>
                          <td className="px-3 py-1.5 text-gray-600">{row.pesoMax >= 9999 ? "Sem limite" : `${row.pesoMax} kg`}</td>
                          <td className="px-3 py-1.5 text-gray-800 font-medium">
                            R$ {row.valor.toFixed(2).replace(".", ",")}
                          </td>
                          <td className="px-3 py-1.5 text-gray-600">{row.prazo > 0 ? `${row.prazo} dias` : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {previewRows.length > 20 && (
                    <p className="text-center text-gray-400 py-2" style={{ fontSize: "0.72rem" }}>
                      ... mais {previewRows.length - 20} linhas
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Validation warnings */}
            {columnMap.cepInicio === undefined && (
              <div className="flex items-center gap-2 text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span style={{ fontSize: "0.78rem" }}>Mapeie a coluna "CEP Inicio" para continuar.</span>
              </div>
            )}
            {columnMap.cepFim === undefined && (
              <div className="flex items-center gap-2 text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span style={{ fontSize: "0.78rem" }}>Mapeie a coluna "CEP Fim" para continuar.</span>
              </div>
            )}

            {/* Import button */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => { setShowUpload(false); setParsed(null); }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors cursor-pointer"
                style={{ fontSize: "0.85rem" }}
              >
                Cancelar
              </button>
              <button
                onClick={handleUpload}
                disabled={
                  uploading ||
                  !uploadName.trim() ||
                  columnMap.cepInicio === undefined ||
                  columnMap.cepFim === undefined ||
                  previewRows.length === 0
                }
                className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                style={{ fontSize: "0.88rem", fontWeight: 600 }}
              >
                {uploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {uploading ? "Importando..." : `Importar ${previewRows.length} linhas`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Existing tables */}
      <div>
        <h4 className="text-gray-600 mb-3 flex items-center gap-2" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
          <FileSpreadsheet className="w-4 h-4 text-red-600" />
          Tabelas Importadas ({tables.length})
        </h4>

        {tables.length === 0 ? (
          <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-8 text-center">
            <Table2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500" style={{ fontSize: "0.88rem", fontWeight: 500 }}>
              Nenhuma tabela de frete importada
            </p>
            <p className="text-gray-400 mt-1" style={{ fontSize: "0.78rem" }}>
              Importe um arquivo CSV com faixas de CEP, peso e valores de frete.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {tables.map((table) => (
              <div key={table.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3">
                  <span style={{ fontSize: "1.2rem" }}>{"\u{1F4CA}"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-700 truncate" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                      {table.name}
                    </p>
                    <p className="text-gray-400" style={{ fontSize: "0.72rem" }}>
                      {table.carrierName} &middot; {table.rowCount} faixas &middot;{" "}
                      {new Date(table.createdAt).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <button
                    onClick={() => handlePreview(table.id)}
                    className="flex items-center gap-1 px-3 py-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                    style={{ fontSize: "0.78rem" }}
                  >
                    {previewTableId === table.id ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                    {previewTableId === table.id ? "Fechar" : "Ver"}
                  </button>
                  <button
                    onClick={() => handleDelete(table.id)}
                    disabled={deleting === table.id}
                    className="flex items-center gap-1 px-3 py-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                    style={{ fontSize: "0.78rem" }}
                  >
                    {deleting === table.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                    Excluir
                  </button>
                </div>

                {/* Preview existing table */}
                {previewTableId === table.id && (
                  <div className="border-t border-gray-100 px-5 py-3">
                    {loadingPreview ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="w-5 h-5 text-red-600 animate-spin" />
                      </div>
                    ) : previewTable ? (
                      <div className="overflow-x-auto max-h-60 overflow-y-auto border border-gray-200 rounded-lg">
                        <table className="w-full text-left" style={{ fontSize: "0.78rem" }}>
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="px-3 py-2 text-gray-500 font-medium">#</th>
                              <th className="px-3 py-2 text-gray-500 font-medium">CEP Inicio</th>
                              <th className="px-3 py-2 text-gray-500 font-medium">CEP Fim</th>
                              <th className="px-3 py-2 text-gray-500 font-medium">Peso Min</th>
                              <th className="px-3 py-2 text-gray-500 font-medium">Peso Max</th>
                              <th className="px-3 py-2 text-gray-500 font-medium">Valor</th>
                              <th className="px-3 py-2 text-gray-500 font-medium">Prazo</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {previewTable.rows.slice(0, 50).map((row, i) => (
                              <tr key={i} className="hover:bg-gray-50">
                                <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                                <td className="px-3 py-1.5 text-gray-700 font-mono">{formatCep(row.cepInicio)}</td>
                                <td className="px-3 py-1.5 text-gray-700 font-mono">{formatCep(row.cepFim)}</td>
                                <td className="px-3 py-1.5 text-gray-600">{row.pesoMin} kg</td>
                                <td className="px-3 py-1.5 text-gray-600">{row.pesoMax >= 9999 ? "Sem limite" : `${row.pesoMax} kg`}</td>
                                <td className="px-3 py-1.5 text-gray-800 font-medium">
                                  R$ {(row.valor || 0).toFixed(2).replace(".", ",")}
                                </td>
                                <td className="px-3 py-1.5 text-gray-600">{row.prazo > 0 ? `${row.prazo} dias` : "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {previewTable.rows.length > 50 && (
                          <p className="text-center text-gray-400 py-2" style={{ fontSize: "0.72rem" }}>
                            Mostrando 50 de {previewTable.rows.length} linhas
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Help text */}
      <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div style={{ fontSize: "0.78rem" }} className="text-blue-700">
          <p className="font-semibold mb-1">Formato do CSV</p>
          <p className="text-blue-600">
            O arquivo deve ter um cabecalho na primeira linha. Colunas suportadas:
          </p>
          <ul className="list-disc ml-4 mt-1 space-y-0.5 text-blue-600">
            <li><strong>cep_inicio, cep_fim</strong> (obrigatorio) - Faixa de CEP de destino</li>
            <li><strong>valor</strong> (obrigatorio) - Valor do frete em R$</li>
            <li><strong>prazo</strong> - Prazo de entrega em dias uteis</li>
            <li><strong>peso_min, peso_max</strong> - Faixa de peso em kg (opcional)</li>
          </ul>
          <p className="mt-2 text-blue-500">
            Exemplo: <code className="bg-blue-100 px-1 rounded">cep_inicio;cep_fim;valor;prazo</code>
          </p>
        </div>
      </div>
    </div>
  );
}