import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Trash2,
  Search,
  Tag,
  Database,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Eye,
  X,
  Hash,
  ArrowUpFromLine,
  BarChart3,
  ArrowRight,
  ArrowLeft,
  Settings2,
  Table2,
  ToggleLeft,
  ToggleRight,
  FileText,
  Info,
  Columns3,
  ScanSearch,
  ShoppingCart,
  Layers,
} from "lucide-react";
import * as XLSX from "xlsx";
import * as api from "../../services/api";
import { supabase } from "../../services/supabaseClient";
import { getValidAdminToken } from "./adminAuth";

// ═════════════════════════════════════════════
// Types
// ═════════════════════════════════════════════

type Step = "upload" | "analysis" | "importing" | "result" | "browsing";

/** A WooCommerce attribute slot pair (Nome/Valores do atributo N) */
interface WooAttrSlot {
  slotNum: number;
  nameIdx: number;
  valueIdx: number;
  visIdx: number;
  globalIdx: number;
}

/** A unique attribute name discovered across all products */
interface UniqueAttribute {
  name: string;
  productCount: number;
  fillPercent: number;
  uniqueValues: number;
  sampleValues: string[];
  enabled: boolean;
}

/** A product with its pivoted attributes */
interface PivotedProduct {
  sku: string;
  productName: string;
  attributes: Record<string, string>;
}

/** Generic (non-WooCommerce) column stat */
interface GenericColumnStat {
  name: string;
  index: number;
  filledCount: number;
  filledPercent: number;
  uniqueCount: number;
  sampleValues: string[];
  isMultiValue: boolean;
  enabled: boolean;
}

/** Full analysis result */
interface AnalysisResult {
  fileName: string;
  originalFormat: string;
  fileSize: number;
  delimiter: string;
  sheetName: string | null;
  totalRows: number;
  headers: string[];
  totalColumns: number;

  // WooCommerce-specific
  isWooCommerce: boolean;
  wooSlots: WooAttrSlot[];
  uniqueAttributes: UniqueAttribute[];
  pivotedProducts: PivotedProduct[];
  metadataColumns: string[];

  // Generic (non-Woo)
  skuColumnIndex: number;
  genericColumns: GenericColumnStat[];
  allRows: string[][];

  // Shared
  allSkus: string[];
  duplicateSkus: string[];
  discardedRows: number;
}

interface DbMatchResult {
  totalDb: number;
  matched: string[];
  unmatched: string[];
  loading: boolean;
  matchDetails?: {
    exact: number;
    normalized: number;
    aggressive: number;
  };
}

interface AttrItem {
  sku: string;
  attributes: Record<string, string | string[]>;
}

// ═════════════════════════════════════════════
// CSV Parsing — stream-based (handles multi-line quoted fields)
// ═════════════════════════════════════════════

function detectDelimiter(firstLine: string): string {
  // Count delimiters outside quoted fields in the first line
  let inQ = false;
  let semis = 0, commas = 0, tabs = 0;
  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (inQ) continue;
    if (ch === ';') semis++;
    else if (ch === ',') commas++;
    else if (ch === '\t') tabs++;
  }
  if (tabs > semis && tabs > commas) return "\t";
  return semis > commas ? ";" : ",";
}

/**
 * CSV parser for clean SheetJS-produced output (semicolon-delimited, no multi-line).
 * SheetJS handles all the hard work (multi-line HTML, loose quotes, encoding).
 * This just splits the clean result into rows/fields.
 */
function parseCleanCsv(text: string, delimiter: string): { headers: string[]; rows: string[][]; discarded: number } {
  const lines = text.split(/\r?\n/);
  const result: string[][] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const fields: string[] = [];
    let current = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQ = false;
          }
        } else {
          current += ch;
        }
      } else if (ch === '"') {
        inQ = true;
      } else if (ch === delimiter) {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    result.push(fields);
  }

  if (result.length === 0) return { headers: [], rows: [], discarded: 0 };

  const headers = result[0];
  const expectedCols = headers.length;

  const validRows: string[][] = [];
  let discarded = 0;
  for (let r = 1; r < result.length; r++) {
    const row = result[r];
    if (row.length === expectedCols) {
      validRows.push(row);
    } else if (row.length === expectedCols + 1 && row[row.length - 1] === "") {
      validRows.push(row.slice(0, expectedCols));
    } else if (row.length < expectedCols && row.length >= expectedCols - 2) {
      while (row.length < expectedCols) row.push("");
      validRows.push(row);
    } else {
      discarded++;
    }
  }

  return { headers, rows: validRows, discarded };
}

function guessSkuColumn(headers: string[]): number {
  const patterns = [/^sku$/i, /^cod/i, /^codigo/i, /^ref/i, /^part/i];
  for (const p of patterns) {
    const idx = headers.findIndex((h) => p.test(h.trim()));
    if (idx >= 0) return idx;
  }
  return 0;
}

/** Clean WooCommerce attribute name (strip trailing colon, whitespace) */
function cleanAttrName(raw: string): string {
  return raw.trim().replace(/:\s*$/, "").trim();
}

/** Unescape WooCommerce backslash-commas in values */
function unescapeValue(raw: string): string {
  return raw.replace(/\\,/g, ",").trim();
}

// ═════════════════════════════════════════════
// WooCommerce Detection & Pivoting
// ═════════════════════════════════════════════

function detectWooSlots(headers: string[]): WooAttrSlot[] {
  const slots: WooAttrSlot[] = [];
  for (let n = 1; n <= 200; n++) {
    const nameIdx = headers.findIndex((h) => h === `Nome do atributo ${n}`);
    const valueIdx = headers.findIndex((h) => h === `Valores do atributo ${n}`);
    if (nameIdx < 0 || valueIdx < 0) {
      if (n > 5 && slots.length === 0) break;
      continue;
    }
    const visIdx = headers.findIndex((h) => h === `Visibilidade do atributo ${n}`);
    const globalIdx = headers.findIndex((h) => h === `Atributo global ${n}`);
    slots.push({ slotNum: n, nameIdx, valueIdx, visIdx, globalIdx });
  }
  return slots;
}

function pivotWooProducts(
  rows: string[][],
  slots: WooAttrSlot[],
  skuIdx: number,
  nameIdx: number
): { products: PivotedProduct[]; uniqueAttrs: Map<string, { values: Set<string>; count: number }> } {
  const products: PivotedProduct[] = [];
  const uniqueAttrs = new Map<string, { values: Set<string>; count: number }>();

  // Use a Map for O(1) lookup of existing products by SKU
  const skuMap = new Map<string, PivotedProduct>();

  for (const row of rows) {
    const sku = (row[skuIdx] || "").trim();
    if (!sku) continue;

    // Validate SKU: discard obviously invalid values
    // (HTML fragments, very long strings, strings with spaces or special chars)
    if (
      sku.length > 50 ||
      sku.includes("<") ||
      sku.includes(">") ||
      sku.includes("http") ||
      sku.includes("class=") ||
      sku.includes("div ")
    ) continue;

    const productName = nameIdx >= 0 ? (row[nameIdx] || "").trim() : "";
    const attributes: Record<string, string> = {};

    for (const slot of slots) {
      const rawName = (row[slot.nameIdx] || "").trim();
      const rawValue = (row[slot.valueIdx] || "").trim();
      if (!rawName || !rawValue) continue;

      const name = cleanAttrName(rawName);
      const value = unescapeValue(rawValue);
      if (!name) continue;

      attributes[name] = value;

      if (!uniqueAttrs.has(name)) {
        uniqueAttrs.set(name, { values: new Set(), count: 0 });
      }
      const entry = uniqueAttrs.get(name)!;
      entry.count++;
      if (entry.values.size < 30) entry.values.add(value);
    }

    if (Object.keys(attributes).length === 0) continue; // skip rows with no attributes

    // Merge if same SKU already seen (multi-line products)
    const existing = skuMap.get(sku);
    if (existing) {
      Object.assign(existing.attributes, attributes);
      if (!existing.productName && productName) existing.productName = productName;
    } else {
      const product = { sku, productName, attributes };
      skuMap.set(sku, product);
      products.push(product);
    }
  }

  return { products, uniqueAttrs };
}

// ═════════════════════════════════════════════
// Main Analysis Function
// ═════════════════════════════════════════════

function analyzeFile(
  csvText: string,
  fileName: string,
  originalFormat: string,
  fileSize: number,
  sheetName: string | null
): AnalysisResult {
  // Detect delimiter (SheetJS always outputs ";" but handle other cases too)
  const firstNewline = csvText.indexOf("\n");
  const firstLine = csvText.substring(0, firstNewline > 0 ? firstNewline : csvText.length);
  const delimiter = detectDelimiter(firstLine);
  const delimLabel =
    delimiter === ";" ? "Ponto-e-virgula (;)" : delimiter === "\t" ? "Tab" : "Virgula (,)";

  // Parse the clean CSV (SheetJS already handled multi-line/loose quotes)
  const { headers, rows: allRows, discarded: discardedRows } = parseCleanCsv(csvText, delimiter);
  const skuColumnIndex = guessSkuColumn(headers);

  // Detect WooCommerce pattern
  const wooSlots = detectWooSlots(headers);
  const isWoo = wooSlots.length >= 3;

  let uniqueAttributes: UniqueAttribute[] = [];
  let pivotedProducts: PivotedProduct[] = [];
  let metadataColumns: string[] = [];

  if (isWoo) {
    // Find "Nome" column for product name
    const nameColIdx = headers.findIndex(
      (h) => h.toLowerCase() === "nome" || h.toLowerCase() === "name"
    );

    const { products, uniqueAttrs } = pivotWooProducts(
      allRows,
      wooSlots,
      skuColumnIndex,
      nameColIdx >= 0 ? nameColIdx : -1
    );
    pivotedProducts = products;

    // Build unique attributes list
    const totalProducts = products.length;
    uniqueAttributes = Array.from(uniqueAttrs.entries())
      .map(([name, data]) => ({
        name,
        productCount: data.count,
        fillPercent: totalProducts > 0 ? Math.round((data.count / totalProducts) * 100) : 0,
        uniqueValues: data.values.size,
        sampleValues: Array.from(data.values).slice(0, 5),
        enabled: true,
      }))
      .sort((a, b) => b.productCount - a.productCount);

    // Identify metadata columns (everything that's NOT an attribute slot)
    const attrIndices = new Set<number>();
    wooSlots.forEach((s) => {
      attrIndices.add(s.nameIdx);
      attrIndices.add(s.valueIdx);
      if (s.visIdx >= 0) attrIndices.add(s.visIdx);
      if (s.globalIdx >= 0) attrIndices.add(s.globalIdx);
    });
    metadataColumns = headers.filter((_, i) => i !== skuColumnIndex && !attrIndices.has(i));
  }

  // Generic column stats (used for non-Woo or as fallback)
  const genericColumns: GenericColumnStat[] = isWoo
    ? []
    : headers.map((name, colIdx) => {
        const values = allRows.map((row) => (row[colIdx] || "").trim());
        const filled = values.filter((v) => v.length > 0);
        const uniqueSet = new Set(filled);
        const hasMulti = filled.some(
          (v) => v.includes(",") && !v.match(/^\d+([.,]\d+)?$/)
        );
        return {
          name,
          index: colIdx,
          filledCount: filled.length,
          filledPercent: allRows.length > 0 ? Math.round((filled.length / allRows.length) * 100) : 0,
          uniqueCount: uniqueSet.size,
          sampleValues: Array.from(uniqueSet).slice(0, 5),
          isMultiValue: hasMulti,
          enabled: colIdx !== skuColumnIndex,
        };
      });

  // SKUs
  const skuSource = isWoo ? pivotedProducts.map((p) => p.sku) : allRows.map((r) => (r[skuColumnIndex] || "").trim()).filter(Boolean);
  const allSkus = [...new Set(skuSource)];
  const skuCounts = new Map<string, number>();
  skuSource.forEach((s) => skuCounts.set(s, (skuCounts.get(s) || 0) + 1));
  const duplicateSkus = Array.from(skuCounts.entries())
    .filter(([, c]) => c > 1)
    .map(([s]) => s);

  return {
    fileName,
    originalFormat,
    fileSize,
    delimiter: delimLabel,
    sheetName,
    totalRows: allRows.length,
    headers,
    totalColumns: headers.length,
    isWooCommerce: isWoo,
    wooSlots,
    uniqueAttributes,
    pivotedProducts,
    metadataColumns,
    skuColumnIndex,
    genericColumns,
    allRows,
    allSkus,
    duplicateSkus,
    discardedRows,
  };
}

// ═════════════════════════════════════════════
// Component
// ═════════════════════════════════════════════

export function AdminAttributes() {
  const [step, setStep] = useState<Step>("upload");
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File & analysis
  const [csvText, setCsvText] = useState<string>("");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);

  // Woo: attribute toggles
  const [wooAttrEnabled, setWooAttrEnabled] = useState<Record<string, boolean>>({});

  // Generic: column toggles
  const [skuColIdx, setSkuColIdx] = useState(0);
  const [enabledCols, setEnabledCols] = useState<boolean[]>([]);

  // DB match
  const [dbMatch, setDbMatch] = useState<DbMatchResult>({
    totalDb: 0,
    matched: [],
    unmatched: [],
    loading: false,
  });

  // Import
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<api.UploadAttributesResult | null>(null);

  // Preview
  const [previewPage, setPreviewPage] = useState(0);
  const PREVIEW_ROWS = 8;
  const [showMetaCols, setShowMetaCols] = useState(false);

  // Browse
  const [allAttrs, setAllAttrs] = useState<AttrItem[]>([]);
  const [filteredAttrs, setFilteredAttrs] = useState<AttrItem[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseSearch, setBrowseSearch] = useState("");
  const [expandedSku, setExpandedSku] = useState<string | null>(null);

  // Delete
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Existing count
  const [existingCount, setExistingCount] = useState<number | null>(null);
  const [existingLoading, setExistingLoading] = useState(true);

  const loadExistingCount = useCallback(async () => {
    setExistingLoading(true);
    try {
      const data = await api.getAllAttributes();
      setExistingCount(data.total);
    } catch {
      setExistingCount(null);
    } finally {
      setExistingLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExistingCount();
  }, [loadExistingCount]);

  // ─── File handling ───

  const handleFileSelect = async (selectedFile: File) => {
    const supported = /\.(xlsx?|xls|csv|txt)$/i.test(selectedFile.name);
    if (!supported) {
      setUploadError("Formato não suportado. Use CSV, TXT, XLS ou XLSX.");
      return;
    }

    setUploadError(null);
    setUploadResult(null);

    try {
      // Use SheetJS for ALL formats (CSV included) — its parser handles
      // multi-line quoted fields, loose HTML quotes, BOM, encoding, etc.
      const buffer = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", raw: false, codepage: 65001 });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      if (!sheet) {
        setUploadError("O arquivo está vazio ou não foi possível ler.");
        return;
      }

      // Convert to clean semicolon-delimited CSV via SheetJS
      const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ";" });
      if (!csv.trim()) {
        setUploadError("O arquivo está vazio.");
        return;
      }

      const isExcel = /\.(xlsx?|xls)$/i.test(selectedFile.name);
      const originalFormat = isExcel
        ? (selectedFile.name.match(/\.xlsx$/i) ? "XLSX" : "XLS")
        : "CSV";

      setCsvText(csv);
      const result = analyzeFile(csv, selectedFile.name, originalFormat, selectedFile.size, sheetName);
      setAnalysis(result);
      setSkuColIdx(result.skuColumnIndex);
      setEnabledCols(result.genericColumns.map((c) => c.enabled));
      setPreviewPage(0);

      // Init Woo attribute toggles
      if (result.isWooCommerce) {
        const toggles: Record<string, boolean> = {};
        result.uniqueAttributes.forEach((a) => { toggles[a.name] = true; });
        setWooAttrEnabled(toggles);
      }

      setStep("analysis");
      matchAgainstDb(result.allSkus);
    } catch (e: any) {
      console.error("Erro ao processar arquivo:", e);
      setUploadError(`Erro ao ler o arquivo: ${e.message || e}`);
    }
  };

  const matchAgainstDb = async (skus: string[]) => {
    setDbMatch({ totalDb: 0, matched: [], unmatched: [], loading: true });
    try {
      // Use the dedicated server endpoint with multi-level normalized matching
      const result = await api.matchSkus(skus);
      setDbMatch({
        totalDb: result.totalDb,
        matched: result.matched,
        unmatched: result.unmatched,
        loading: false,
        matchDetails: result.matchDetails,
      });
    } catch (e) {
      console.error("matchAgainstDb error:", e);
      setDbMatch({ totalDb: 0, matched: [], unmatched: [], loading: false });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) handleFileSelect(e.dataTransfer.files[0]);
  };

  // ─── Woo toggles ───

  const toggleWooAttr = (name: string) => {
    setWooAttrEnabled((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const enabledWooCount = useMemo(
    () => Object.values(wooAttrEnabled).filter(Boolean).length,
    [wooAttrEnabled]
  );

  // ─── Generic toggles ───

  const handleSkuColumnChange = (newIdx: number) => {
    if (!analysis) return;
    setSkuColIdx(newIdx);
    setEnabledCols((prev) => prev.map((_, i) => i !== newIdx));
    const newSkus = analysis.allRows.map((r) => (r[newIdx] || "").trim()).filter(Boolean);
    matchAgainstDb([...new Set(newSkus)]);
  };

  const toggleColumn = (idx: number) => {
    if (idx === skuColIdx) return;
    setEnabledCols((prev) => prev.map((v, i) => (i === idx ? !v : v)));
  };

  const enabledGenericCount = enabledCols.filter((v, i) => v && i !== skuColIdx).length;

  // ─── Build CSV for upload ───

  const buildCsvForUpload = (): File | null => {
    if (!analysis) return null;

    if (analysis.isWooCommerce) {
      // Build pivoted CSV: SKU;Attr1;Attr2;...
      const enabledNames = analysis.uniqueAttributes
        .filter((a) => wooAttrEnabled[a.name])
        .map((a) => a.name);
      if (enabledNames.length === 0) return null;

      const headerLine = ["SKU", ...enabledNames].join(";");
      const dataLines = analysis.pivotedProducts.map((p) => {
        const vals = enabledNames.map((name) => {
          const v = p.attributes[name] || "";
          // Escape semicolons in values
          return v.includes(";") ? `"${v}"` : v;
        });
        const skuVal = p.sku.includes(";") ? `"${p.sku}"` : p.sku;
        return [skuVal, ...vals].join(";");
      });
      const csvContent = [headerLine, ...dataLines].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv" });
      return new File([blob], "atributos_pivotados.csv", { type: "text/csv" });
    } else {
      // Generic: filter columns
      const activeCols = analysis.headers
        .map((_, i) => i)
        .filter((i) => i === skuColIdx || enabledCols[i]);

      const orderedCols = [skuColIdx, ...activeCols.filter((i) => i !== skuColIdx)];
      const headerLine = orderedCols.map((i) => (i === skuColIdx ? "SKU" : analysis.headers[i]));
      const lines = [headerLine.join(";")];
      analysis.allRows.forEach((row) => {
        const vals = orderedCols.map((i) => {
          const v = row[i] || "";
          return v.includes(";") ? `"${v}"` : v;
        });
        lines.push(vals.join(";"));
      });
      const csvContent = lines.join("\n");
      const blob = new Blob([csvContent], { type: "text/csv" });
      return new File([blob], "atributos.csv", { type: "text/csv" });
    }
  };

  // ─── Import ───

  const handleImport = async () => {
    const fileToUpload = buildCsvForUpload();
    if (!fileToUpload) return;

    setUploading(true);
    setUploadError(null);

    try {
      const token = await getValidAdminToken();
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");

      const result = await api.uploadAttributesCsv(fileToUpload, token);
      setUploadResult(result);
      setStep("result");
      loadExistingCount();
    } catch (e: any) {
      console.error("Upload error:", e);
      setUploadError(e.message || "Erro desconhecido ao fazer upload.");
    } finally {
      setUploading(false);
    }
  };

  // ─── Browse / Delete ───

  const handleBrowse = async () => {
    setBrowseLoading(true);
    setStep("browsing");
    try {
      const data = await api.getAllAttributes();
      setAllAttrs(data.data);
      setFilteredAttrs(data.data);
    } catch (e: any) {
      setUploadError(e.message || "Erro ao carregar atributos.");
    } finally {
      setBrowseLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const token = await getValidAdminToken();
      if (!token) throw new Error("Sessão expirada.");
      await api.deleteAttributesCsv(token);
      setExistingCount(0);
      setShowDeleteConfirm(false);
      resetAll();
    } catch (e: any) {
      setUploadError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const resetAll = () => {
    setCsvText("");
    setAnalysis(null);
    setUploadResult(null);
    setUploadError(null);
    setStep("upload");
    setPreviewPage(0);
    setShowMetaCols(false);
  };

  // Filter browse
  useEffect(() => {
    if (!browseSearch.trim()) {
      setFilteredAttrs(allAttrs);
    } else {
      const q = browseSearch.toLowerCase();
      setFilteredAttrs(
        allAttrs.filter(
          (item) =>
            item.sku.toLowerCase().includes(q) ||
            Object.values(item.attributes).some((v) =>
              Array.isArray(v)
                ? v.some((x) => x.toLowerCase().includes(q))
                : v.toLowerCase().includes(q)
            )
        )
      );
    }
  }, [browseSearch, allAttrs]);

  // Derived
  const wooPreviewRows = analysis?.pivotedProducts.slice(
    previewPage * PREVIEW_ROWS,
    (previewPage + 1) * PREVIEW_ROWS
  );
  const genericPreviewRows = analysis?.allRows.slice(
    previewPage * PREVIEW_ROWS,
    (previewPage + 1) * PREVIEW_ROWS
  );
  const totalPreviewPages = analysis
    ? Math.ceil(
        (analysis.isWooCommerce ? analysis.pivotedProducts.length : analysis.allRows.length) /
          PREVIEW_ROWS
      )
    : 0;

  const attrCount = analysis?.isWooCommerce ? enabledWooCount : enabledGenericCount;

  // ═════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-gray-800" style={{ fontSize: "1.5rem", fontWeight: 700 }}>
            Atributos de Produtos
          </h1>
          <p className="text-gray-500 mt-1" style={{ fontSize: "0.85rem" }}>
            Importe CSV ou planilha Excel. O sistema analisa a estrutura antes de importar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {existingLoading ? (
            <div className="flex items-center gap-1.5 text-gray-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span style={{ fontSize: "0.8rem" }}>Verificando...</span>
            </div>
          ) : existingCount !== null && existingCount > 0 ? (
            <span className="bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5" style={{ fontSize: "0.8rem", fontWeight: 500 }}>
              <Database className="w-3.5 h-3.5" />
              {existingCount} SKUs com atributos
            </span>
          ) : (
            <span className="bg-gray-50 text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5" style={{ fontSize: "0.8rem" }}>
              <Database className="w-3.5 h-3.5" />
              Nenhum arquivo importado
            </span>
          )}
        </div>
      </div>

      {/* Step indicator */}
      {(step === "upload" || step === "analysis" || step === "importing" || step === "result") && (
        <div className="flex items-center gap-2">
          {[
            { key: "upload", label: "1. Selecionar", icon: Upload },
            { key: "analysis", label: "2. Analisar", icon: ScanSearch },
            { key: "result", label: "3. Importar", icon: CheckCircle2 },
          ].map((s, i) => {
            const order = ["upload", "analysis", "importing", "result"];
            const curr = order.indexOf(step);
            const sIdx = s.key === "result" ? 3 : order.indexOf(s.key);
            const isActive = sIdx <= curr;
            const isCurrent = s.key === step || (step === "importing" && s.key === "result");
            return (
              <div key={s.key} className="flex items-center gap-2">
                {i > 0 && <div className={`w-8 h-px ${isActive ? "bg-red-300" : "bg-gray-200"}`} />}
                <div
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors ${
                    isCurrent
                      ? "bg-red-600 text-white"
                      : isActive
                      ? "bg-red-50 text-red-700 border border-red-200"
                      : "bg-gray-50 text-gray-400 border border-gray-200"
                  }`}
                  style={{ fontSize: "0.78rem", fontWeight: 500 }}
                >
                  <s.icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
              </div>
            );
          })}

          <div className="ml-auto flex gap-2">
            {step !== "upload" && (
              <button onClick={resetAll} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-gray-500 border border-gray-200 hover:bg-gray-50" style={{ fontSize: "0.8rem" }}>
                <X className="w-3.5 h-3.5" />
                Cancelar
              </button>
            )}
            {existingCount !== null && existingCount > 0 && (
              <>
                <button
                  onClick={handleBrowse}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                  style={{ fontSize: "0.8rem" }}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Ver Existentes</span>
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-red-600 border border-red-200 hover:bg-red-50"
                  style={{ fontSize: "0.8rem" }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-gray-800" style={{ fontSize: "0.9rem", fontWeight: 600 }}>Confirmar remocao?</p>
              <p className="text-gray-500 mt-1" style={{ fontSize: "0.83rem" }}>
                O arquivo será removido do Storage. Os atributos ficam indisponíveis até novo upload.
              </p>
              <div className="flex gap-3 mt-4">
                <button onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {deleting ? "Removendo..." : "Sim, Remover"}
                </button>
                <button onClick={() => setShowDeleteConfirm(false)} className="bg-white border border-gray-300 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50" style={{ fontSize: "0.85rem" }}>Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {uploadError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-800" style={{ fontSize: "0.85rem", fontWeight: 500 }}>Erro</p>
            <p className="text-red-600 mt-0.5" style={{ fontSize: "0.83rem" }}>{uploadError}</p>
          </div>
          <button onClick={() => setUploadError(null)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ═══════════════════════ STEP 1: UPLOAD ═══════════════════════ */}
      {step === "upload" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-1">
              <FileSpreadsheet className="w-5 h-5 text-red-600" />
              <h2 className="text-gray-800" style={{ fontSize: "1.05rem", fontWeight: 600 }}>Selecione o Arquivo</h2>
            </div>
            <p className="text-gray-500" style={{ fontSize: "0.82rem" }}>
              Envie CSV ou planilha Excel. Suporta exportacoes WooCommerce com atributos dinamicos.
            </p>
          </div>
          <div className="p-5">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
                dragOver ? "border-red-400 bg-red-50" : "border-gray-300 bg-gray-50 hover:border-red-300 hover:bg-red-50/30"
              }`}
            >
              <input ref={fileInputRef} type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); }}
              />
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center">
                  <Upload className="w-7 h-7 text-gray-400" />
                </div>
                <p className="text-gray-600" style={{ fontSize: "0.95rem", fontWeight: 500 }}>Arraste ou clique para selecionar</p>
                <p className="text-gray-400" style={{ fontSize: "0.8rem" }}>Formatos: .csv, .txt, .xls, .xlsx</p>
              </div>
            </div>
          </div>
          <div className="px-5 pb-5">
            <div className="bg-gray-50 rounded-lg p-4 flex items-start gap-3">
              <Info className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
              <p className="text-gray-600" style={{ fontSize: "0.82rem" }}>
                O sistema detecta automaticamente o formato do arquivo, incluindo exportacoes WooCommerce com
                colunas <code className="bg-gray-200 px-1 rounded text-xs">"Nome do atributo N"</code> /
                <code className="bg-gray-200 px-1 rounded text-xs">"Valores do atributo N"</code>,
                pivotando os dados em uma estrutura limpa de SKU + Atributos.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════ STEP 2: ANALYSIS ═══════════════════════ */}
      {step === "analysis" && analysis && (
        <>
          {/* ── File Info ── */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-5 border-b border-gray-100">
              <div className="flex items-center gap-2 mb-1">
                <ScanSearch className="w-5 h-5 text-red-600" />
                <h2 className="text-gray-800" style={{ fontSize: "1.05rem", fontWeight: 600 }}>Analise do Arquivo</h2>
                {analysis.isWooCommerce && (
                  <span className="bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full flex items-center gap-1" style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                    <ShoppingCart className="w-3 h-3" />
                    WooCommerce
                  </span>
                )}
              </div>
              <p className="text-gray-500" style={{ fontSize: "0.82rem" }}>
                {analysis.isWooCommerce
                  ? `Formato WooCommerce detectado com ${analysis.wooSlots.length} slots de atributos. Os dados foram pivotados automaticamente.`
                  : "Revise a estrutura e ajuste o mapeamento antes de importar."
                }
              </p>
            </div>

            {/* Meta grid */}
            <div className="p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {(analysis.isWooCommerce
                ? [
                    { label: "Arquivo", value: analysis.fileName, icon: FileText },
                    { label: "Formato", value: analysis.originalFormat + (analysis.sheetName ? ` (${analysis.sheetName})` : ""), icon: FileSpreadsheet },
                    { label: "Tamanho", value: `${(analysis.fileSize / 1024).toFixed(1)} KB`, icon: Database },
                    { label: "Linhas (raw)", value: String(analysis.totalRows), icon: Table2 },
                    { label: "Produtos", value: String(analysis.pivotedProducts.length), icon: ShoppingCart },
                    { label: "Slots atrib.", value: String(analysis.wooSlots.length), icon: Layers },
                  ]
                : [
                    { label: "Arquivo", value: analysis.fileName, icon: FileText },
                    { label: "Formato", value: analysis.originalFormat + (analysis.sheetName ? ` (${analysis.sheetName})` : ""), icon: FileSpreadsheet },
                    { label: "Tamanho", value: `${(analysis.fileSize / 1024).toFixed(1)} KB`, icon: Database },
                    { label: "Delimitador", value: analysis.delimiter, icon: Columns3 },
                    { label: "Linhas", value: String(analysis.totalRows), icon: Table2 },
                    { label: "Colunas", value: String(analysis.totalColumns), icon: BarChart3 },
                  ]
              ).map((item) => (
                <div key={item.label} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <item.icon className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-gray-500" style={{ fontSize: "0.68rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em" }}>{item.label}</span>
                  </div>
                  <p className="text-gray-800 truncate" style={{ fontSize: "0.85rem", fontWeight: 600 }} title={item.value}>{item.value}</p>
                </div>
              ))}
            </div>

            {/* SKUs summary */}
            <div className="px-5 pb-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                  <p className="text-blue-800" style={{ fontSize: "1.5rem", fontWeight: 700 }}>{analysis.allSkus.length}</p>
                  <p className="text-blue-600" style={{ fontSize: "0.78rem" }}>
                    {analysis.isWooCommerce ? "Produtos no arquivo" : "SKUs únicos"}
                  </p>
                </div>
                <div className={`rounded-lg p-4 text-center border ${dbMatch.loading ? "bg-gray-50 border-gray-200" : "bg-green-50 border-green-200"}`}>
                  {dbMatch.loading ? (
                    <div className="flex items-center justify-center gap-2 py-2">
                      <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                      <span className="text-gray-500" style={{ fontSize: "0.82rem" }}>Verificando banco...</span>
                    </div>
                  ) : (
                    <>
                      <p className="text-green-700" style={{ fontSize: "1.5rem", fontWeight: 700 }}>{dbMatch.matched.length}</p>
                      <p className="text-green-600" style={{ fontSize: "0.78rem" }}>Encontrados no banco ({dbMatch.totalDb} produtos)</p>
                      {dbMatch.matchDetails && (dbMatch.matchDetails.normalized > 0 || dbMatch.matchDetails.aggressive > 0) && (
                        <div className="mt-1.5 flex flex-wrap justify-center gap-1">
                          {dbMatch.matchDetails.exact > 0 && (
                            <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded" style={{ fontSize: "0.65rem" }}>{dbMatch.matchDetails.exact} exato</span>
                          )}
                          {dbMatch.matchDetails.normalized > 0 && (
                            <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded" style={{ fontSize: "0.65rem" }}>{dbMatch.matchDetails.normalized} normalizado</span>
                          )}
                          {dbMatch.matchDetails.aggressive > 0 && (
                            <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded" style={{ fontSize: "0.65rem" }}>{dbMatch.matchDetails.aggressive} flexivel</span>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className={`rounded-lg p-4 text-center border ${dbMatch.loading ? "bg-gray-50 border-gray-200" : dbMatch.unmatched.length > 0 ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-200"}`}>
                  {dbMatch.loading ? (
                    <div className="flex items-center justify-center gap-2 py-2">
                      <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                      <span className="text-gray-500" style={{ fontSize: "0.82rem" }}>...</span>
                    </div>
                  ) : (
                    <>
                      <p className={dbMatch.unmatched.length > 0 ? "text-amber-700" : "text-gray-600"} style={{ fontSize: "1.5rem", fontWeight: 700 }}>{dbMatch.unmatched.length}</p>
                      <p className={dbMatch.unmatched.length > 0 ? "text-amber-600" : "text-gray-500"} style={{ fontSize: "0.78rem" }}>Sem correspondencia</p>
                    </>
                  )}
                </div>
              </div>

              {analysis.duplicateSkus.length > 0 && (
                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-amber-800" style={{ fontSize: "0.83rem", fontWeight: 500 }}>{analysis.duplicateSkus.length} SKU(s) duplicado(s) — serão mesclados automaticamente</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {analysis.duplicateSkus.slice(0, 15).map((s, si) => (
                        <span key={`dup-${si}`} className="bg-white text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-mono" style={{ fontSize: "0.72rem" }}>{s}</span>
                      ))}
                      {analysis.duplicateSkus.length > 15 && <span className="text-amber-500" style={{ fontSize: "0.72rem" }}>+{analysis.duplicateSkus.length - 15}</span>}
                    </div>
                  </div>
                </div>
              )}

              {!dbMatch.loading && dbMatch.unmatched.length > 0 && (
                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-amber-800" style={{ fontSize: "0.83rem", fontWeight: 500 }}>SKUs não encontrados no banco (serão importados mesmo assim):</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {dbMatch.unmatched.slice(0, 25).map((s, si) => (
                        <span key={`unm-${si}`} className="bg-white text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-mono" style={{ fontSize: "0.72rem" }}>{s}</span>
                      ))}
                      {dbMatch.unmatched.length > 25 && <span className="text-amber-500" style={{ fontSize: "0.72rem" }}>+{dbMatch.unmatched.length - 25}</span>}
                    </div>
                  </div>
                </div>
              )}

              {/* Discarded rows warning */}
              {analysis.discardedRows > 0 && (
                <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 flex items-start gap-2">
                  <Info className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                  <p className="text-gray-500" style={{ fontSize: "0.82rem" }}>
                    <span style={{ fontWeight: 500 }}>{analysis.discardedRows} linha(s) descartada(s)</span> por conter HTML malformado
                    (colunas desalinhadas). Isso e normal em exportacoes WooCommerce com descricoes ricas.
                  </p>
                </div>
              )}

              {/* WooCommerce: metadata columns disclosure */}
              {analysis.isWooCommerce && analysis.metadataColumns.length > 0 && (
                <div className="mt-3">
                  <button
                    onClick={() => setShowMetaCols(!showMetaCols)}
                    className="flex items-center gap-2 text-gray-500 hover:text-gray-700 transition-colors"
                    style={{ fontSize: "0.8rem" }}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>{analysis.metadataColumns.length} colunas de metadados WooCommerce ignoradas</span>
                    {showMetaCols ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  {showMetaCols && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {analysis.metadataColumns.map((col, ci) => (
                        <span key={`meta-${ci}`} className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded" style={{ fontSize: "0.7rem" }}>{col}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── ATTRIBUTE MAPPING ── */}
          {analysis.isWooCommerce ? (
            /* ── WooCommerce: Unique Attribute Names ── */
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-5 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Settings2 className="w-5 h-5 text-red-600" />
                    <h2 className="text-gray-800" style={{ fontSize: "1.05rem", fontWeight: 600 }}>Atributos Detectados</h2>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-400" style={{ fontSize: "0.78rem" }}>{enabledWooCount} de {analysis.uniqueAttributes.length} selecionados</span>
                    <button
                      onClick={() => {
                        const allOn = Object.values(wooAttrEnabled).every(Boolean);
                        const newState: Record<string, boolean> = {};
                        analysis.uniqueAttributes.forEach((a) => { newState[a.name] = !allOn; });
                        setWooAttrEnabled(newState);
                      }}
                      className="text-gray-500 hover:text-red-600 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                      style={{ fontSize: "0.75rem" }}
                    >
                      {Object.values(wooAttrEnabled).every(Boolean) ? "Desmarcar todos" : "Marcar todos"}
                    </button>
                  </div>
                </div>
                <p className="text-gray-500 mt-1" style={{ fontSize: "0.82rem" }}>
                  Estes {analysis.uniqueAttributes.length} nomes de atributos foram extraidos das colunas WooCommerce "Nome do atributo N".
                  Desative os que não deseja importar.
                </p>
              </div>

              <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
                {analysis.uniqueAttributes.map((attr, attrIdx) => {
                  const isOn = wooAttrEnabled[attr.name] ?? true;
                  const fillColor =
                    attr.fillPercent >= 80 ? "text-green-600 bg-green-50"
                    : attr.fillPercent >= 50 ? "text-amber-600 bg-amber-50"
                    : "text-red-500 bg-red-50";

                  return (
                    <div key={`wattr-${attrIdx}`} className={`px-5 py-3 transition-colors ${isOn ? "bg-white hover:bg-gray-50/50" : "bg-gray-50/80"}`}>
                      <div className="flex items-center gap-4">
                        <button onClick={() => toggleWooAttr(attr.name)} className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-200 transition-colors">
                          {isOn ? <ToggleRight className="w-5 h-5 text-green-600" /> : <ToggleLeft className="w-5 h-5 text-gray-300" />}
                        </button>

                        <div className="min-w-[140px]">
                          <p className={`${isOn ? "text-gray-800" : "text-gray-400"}`} style={{ fontSize: "0.88rem", fontWeight: 600 }}>{attr.name}</p>
                        </div>

                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 shrink-0">
                            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${attr.fillPercent >= 80 ? "bg-green-500" : attr.fillPercent >= 50 ? "bg-amber-500" : "bg-red-400"}`} style={{ width: `${attr.fillPercent}%` }} />
                            </div>
                            <span className={`px-1.5 py-0.5 rounded ${fillColor}`} style={{ fontSize: "0.7rem", fontWeight: 600 }}>{attr.fillPercent}%</span>
                          </div>

                          <span className="text-gray-400 shrink-0 hidden sm:inline" style={{ fontSize: "0.75rem" }}>
                            {attr.productCount} produto{attr.productCount !== 1 && "s"}
                          </span>

                          <span className="text-gray-400 shrink-0 hidden md:inline" style={{ fontSize: "0.75rem" }}>
                            {attr.uniqueValues} valor{attr.uniqueValues !== 1 && "es"} único{attr.uniqueValues !== 1 && "s"}
                          </span>

                          <div className="flex gap-1 overflow-hidden min-w-0 hidden lg:flex">
                            {attr.sampleValues.slice(0, 3).map((v, vi) => (
                              <span key={vi} className={`px-1.5 py-0.5 rounded truncate max-w-[120px] ${isOn ? "bg-gray-100 text-gray-600" : "bg-gray-100 text-gray-300"}`} style={{ fontSize: "0.7rem" }} title={v}>{v}</span>
                            ))}
                            {attr.uniqueValues > 3 && <span className="text-gray-400" style={{ fontSize: "0.7rem" }}>+{attr.uniqueValues - 3}</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* ── Generic: Column Mapping ── */
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-5 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Settings2 className="w-5 h-5 text-red-600" />
                    <h2 className="text-gray-800" style={{ fontSize: "1.05rem", fontWeight: 600 }}>Mapeamento de Colunas</h2>
                  </div>
                  <span className="text-gray-400" style={{ fontSize: "0.78rem" }}>{enabledGenericCount} atributo(s)</span>
                </div>
              </div>
              <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
                {analysis.genericColumns.map((col, idx) => {
                  const isSku = idx === skuColIdx;
                  const isEnabled = enabledCols[idx];
                  const fillColor =
                    col.filledPercent >= 80 ? "text-green-600 bg-green-50"
                    : col.filledPercent >= 50 ? "text-amber-600 bg-amber-50"
                    : "text-red-500 bg-red-50";

                  return (
                    <div key={idx} className={`px-5 py-3 transition-colors ${isSku ? "bg-red-50/60" : isEnabled ? "bg-white hover:bg-gray-50/50" : "bg-gray-50/80"}`}>
                      <div className="flex items-center gap-4">
                        <div className="shrink-0 w-8">
                          {isSku ? (
                            <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center"><Hash className="w-4 h-4 text-white" /></div>
                          ) : (
                            <button onClick={() => toggleColumn(idx)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-200">
                              {isEnabled ? <ToggleRight className="w-5 h-5 text-green-600" /> : <ToggleLeft className="w-5 h-5 text-gray-300" />}
                            </button>
                          )}
                        </div>
                        <div className="min-w-[120px]">
                          <p className={`${isSku ? "text-red-700" : isEnabled ? "text-gray-800" : "text-gray-400"}`} style={{ fontSize: "0.88rem", fontWeight: 600 }}>{col.name}</p>
                          {isSku && <span className="text-red-500" style={{ fontSize: "0.7rem", fontWeight: 500 }}>COLUNA SKU</span>}
                          {!isSku && (
                            <button onClick={() => handleSkuColumnChange(idx)} className="text-gray-400 hover:text-red-600" style={{ fontSize: "0.7rem" }}>Usar como SKU</button>
                          )}
                        </div>
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 shrink-0">
                            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${col.filledPercent >= 80 ? "bg-green-500" : col.filledPercent >= 50 ? "bg-amber-500" : "bg-red-400"}`} style={{ width: `${col.filledPercent}%` }} />
                            </div>
                            <span className={`px-1.5 py-0.5 rounded ${fillColor}`} style={{ fontSize: "0.7rem", fontWeight: 600 }}>{col.filledPercent}%</span>
                          </div>
                          <span className="text-gray-400 shrink-0 hidden sm:inline" style={{ fontSize: "0.75rem" }}>{col.uniqueCount} único{col.uniqueCount !== 1 && "s"}</span>
                          {col.isMultiValue && !isSku && (
                            <span className="bg-purple-50 text-purple-600 border border-purple-100 px-1.5 py-0.5 rounded shrink-0 hidden md:inline" style={{ fontSize: "0.68rem", fontWeight: 500 }}>Multi-valor</span>
                          )}
                          <div className="flex gap-1 overflow-hidden min-w-0 hidden lg:flex">
                            {col.sampleValues.slice(0, 3).map((v, vi) => (
                              <span key={vi} className={`px-1.5 py-0.5 rounded truncate max-w-[100px] ${isEnabled || isSku ? "bg-gray-100 text-gray-600" : "bg-gray-100 text-gray-300"}`} style={{ fontSize: "0.7rem" }} title={v}>{v}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── DATA PREVIEW ── */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Table2 className="w-5 h-5 text-red-600" />
                <h2 className="text-gray-800" style={{ fontSize: "1.05rem", fontWeight: 600 }}>
                  {analysis.isWooCommerce ? "Preview dos Dados Pivotados" : "Preview dos Dados"}
                </h2>
                <span className="text-gray-400" style={{ fontSize: "0.78rem" }}>
                  {analysis.isWooCommerce ? `${analysis.pivotedProducts.length} produtos` : `${analysis.totalRows} linhas`}
                </span>
              </div>
              {totalPreviewPages > 1 && (
                <div className="flex items-center gap-2">
                  <button onClick={() => setPreviewPage((p) => Math.max(0, p - 1))} disabled={previewPage === 0} className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 rounded hover:bg-gray-100">
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <span className="text-gray-500" style={{ fontSize: "0.78rem" }}>{previewPage + 1}/{totalPreviewPages}</span>
                  <button onClick={() => setPreviewPage((p) => Math.min(totalPreviewPages - 1, p + 1))} disabled={previewPage >= totalPreviewPages - 1} className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 rounded hover:bg-gray-100">
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {analysis.isWooCommerce ? (
              /* Woo: Pivoted preview — each product as accordion */
              <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
                {wooPreviewRows?.map((product, idx) => {
                  const enabledAttrs = Object.entries(product.attributes).filter(([name]) => wooAttrEnabled[name]);
                  const isExpanded = expandedSku === product.sku;
                  return (
                    <div key={product.sku + "-" + idx}>
                      <div
                        className="px-5 py-3 flex items-center justify-between hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => setExpandedSku(isExpanded ? null : product.sku)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Hash className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span className="font-mono text-red-700 shrink-0" style={{ fontSize: "0.85rem", fontWeight: 600 }}>{product.sku}</span>
                          {product.productName && (
                            <span className="text-gray-500 truncate" style={{ fontSize: "0.8rem" }}>{product.productName}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 shrink-0" style={{ fontSize: "0.73rem" }}>{enabledAttrs.length} atrib.</span>
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="bg-gray-50 px-5 py-3 border-t border-gray-100">
                          <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                            {enabledAttrs.length === 0 ? (
                              <div className="px-3 py-3 text-center text-gray-400" style={{ fontSize: "0.82rem" }}>Nenhum atributo ativo para este produto</div>
                            ) : (
                              enabledAttrs.map(([key, value], i) => (
                                <div key={`ea-${i}`} className={`grid grid-cols-[180px_1fr] ${i % 2 === 0 ? "bg-white" : "bg-gray-50/60"} ${i < enabledAttrs.length - 1 ? "border-b border-gray-100" : ""}`}>
                                  <div className="px-3 py-2 text-gray-500 border-r border-gray-100" style={{ fontSize: "0.8rem", fontWeight: 500 }}>{key}</div>
                                  <div className="px-3 py-2 text-gray-800" style={{ fontSize: "0.83rem" }}>{value}</div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Generic: table preview */
              <div className="overflow-x-auto">
                <table className="w-full text-left" style={{ fontSize: "0.78rem" }}>
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-3 py-2 text-gray-400 border-b border-gray-200 w-10" style={{ fontWeight: 500 }}>#</th>
                      {analysis.headers.map((h, i) => {
                        const isSku = i === skuColIdx;
                        const isEnabled = enabledCols[i];
                        return (
                          <th key={i} className={`px-3 py-2 whitespace-nowrap border-b border-gray-200 ${isSku ? "bg-red-50 text-red-700" : isEnabled ? "text-gray-600" : "text-gray-300"}`} style={{ fontWeight: 600 }}>
                            {isSku && <Hash className="w-3 h-3 inline mr-1" />}{h}
                            {!isEnabled && !isSku && <span className="ml-1 text-gray-300" style={{ fontSize: "0.65rem" }}>OFF</span>}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {genericPreviewRows?.map((row, ri) => (
                      <tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-gray-50/60"}>
                        <td className="px-3 py-2 text-gray-300 border-b border-gray-100" style={{ fontSize: "0.72rem" }}>{previewPage * PREVIEW_ROWS + ri + 1}</td>
                        {row.map((cell, ci) => {
                          const isSku = ci === skuColIdx;
                          const isEnabled = enabledCols[ci];
                          return (
                            <td key={ci} className={`px-3 py-2 border-b border-gray-100 max-w-[180px] truncate ${isSku ? "font-mono text-red-700 bg-red-50/40" : isEnabled ? "text-gray-700" : "text-gray-300"}`}>
                              {cell || <span className="text-gray-200">—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Import action ── */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-gray-800" style={{ fontSize: "0.95rem", fontWeight: 600 }}>Pronto para importar?</p>
                <p className="text-gray-500 mt-0.5" style={{ fontSize: "0.82rem" }}>
                  {analysis.isWooCommerce
                    ? `${analysis.pivotedProducts.length} produtos com ${enabledWooCount} atributo(s) serão convertidos em CSV limpo e enviados`
                    : `${analysis.allSkus.length} SKUs com ${enabledGenericCount} atributo(s)`
                  }
                  {!dbMatch.loading && dbMatch.matched.length > 0 && (
                    <span className="text-green-600"> — {dbMatch.matched.length} de {dbMatch.totalDb} encontrados no banco</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={resetAll} className="px-4 py-2.5 bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg" style={{ fontSize: "0.85rem" }}>
                  <ArrowLeft className="w-4 h-4 inline mr-1.5" />Voltar
                </button>
                <button
                  onClick={handleImport}
                  disabled={uploading || attrCount === 0}
                  className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-2 disabled:opacity-50"
                  style={{ fontSize: "0.9rem", fontWeight: 600 }}
                >
                  {uploading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Importando...</>
                  ) : (
                    <><Upload className="w-4 h-4" />Confirmar Importacao</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══════════════════════ STEP 3: RESULT ═══════════════════════ */}
      {step === "result" && uploadResult && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-5 border-b border-gray-100 bg-green-50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-green-800" style={{ fontSize: "1rem", fontWeight: 600 }}>Importacao concluida!</p>
                <p className="text-green-600 mt-0.5" style={{ fontSize: "0.83rem" }}>{uploadResult.message}</p>
              </div>
            </div>
          </div>

          <div className="p-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-gray-800" style={{ fontSize: "1.5rem", fontWeight: 700 }}>{uploadResult.totalCsv}</p>
                <p className="text-gray-500" style={{ fontSize: "0.78rem" }}>SKUs no Arquivo</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-gray-800" style={{ fontSize: "1.5rem", fontWeight: 700 }}>{uploadResult.totalDb}</p>
                <p className="text-gray-500" style={{ fontSize: "0.78rem" }}>Produtos no Banco</p>
              </div>
              <div className="bg-green-50 rounded-lg p-4 text-center border border-green-200">
                <p className="text-green-700" style={{ fontSize: "1.5rem", fontWeight: 700 }}>{uploadResult.matched}</p>
                <p className="text-green-600" style={{ fontSize: "0.78rem" }}>Vinculados</p>
              </div>
              <div className={`rounded-lg p-4 text-center border ${uploadResult.unmatched > 0 ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-200"}`}>
                <p className={uploadResult.unmatched > 0 ? "text-amber-700" : "text-gray-800"} style={{ fontSize: "1.5rem", fontWeight: 700 }}>{uploadResult.unmatched}</p>
                <p className={uploadResult.unmatched > 0 ? "text-amber-600" : "text-gray-500"} style={{ fontSize: "0.78rem" }}>Sem Correspondencia</p>
              </div>
            </div>

            {uploadResult.columns.length > 0 && (
              <div className="mb-5">
                <p className="text-gray-600 mb-2" style={{ fontSize: "0.85rem", fontWeight: 500 }}>Colunas importadas:</p>
                <div className="flex flex-wrap gap-1.5">
                  {uploadResult.columns.map((col, ci) => (
                    <span key={`col-${ci}`} className="bg-red-50 text-red-700 border border-red-100 px-2.5 py-1 rounded-lg flex items-center gap-1" style={{ fontSize: "0.78rem" }}>
                      <Tag className="w-3 h-3" />{col}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {uploadResult.preview.length > 0 && (
              <div className="mb-5">
                <p className="text-gray-600 mb-2" style={{ fontSize: "0.85rem", fontWeight: 500 }}>Exemplo dos dados:</p>
                <div className="space-y-2">
                  {uploadResult.preview.map((item) => (
                    <div key={item.sku} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 px-4 py-2.5 flex items-center justify-between cursor-pointer hover:bg-gray-100" onClick={() => setExpandedSku(expandedSku === item.sku ? null : item.sku)}>
                        <div className="flex items-center gap-2">
                          <Hash className="w-3.5 h-3.5 text-gray-400" />
                          <span className="font-mono text-red-700" style={{ fontSize: "0.83rem", fontWeight: 600 }}>{item.sku}</span>
                          <span className="text-gray-400" style={{ fontSize: "0.75rem" }}>({Object.keys(item.attributes).length} atributos)</span>
                        </div>
                        {expandedSku === item.sku ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </div>
                      {expandedSku === item.sku && (
                        <div className="px-4 py-2 border-t border-gray-100">
                          {Object.entries(item.attributes).map(([key, value], ai) => (
                            <div key={`pattr-${ai}`} className="flex py-1.5 border-b border-gray-50 last:border-0">
                              <span className="text-gray-500 w-[160px] shrink-0" style={{ fontSize: "0.8rem" }}>{key}</span>
                              <span className="text-gray-800" style={{ fontSize: "0.8rem" }}>{Array.isArray(value) ? value.join(", ") : value}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {uploadResult.unmatched > 0 && uploadResult.unmatchedSkus.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-5">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-amber-800" style={{ fontSize: "0.85rem", fontWeight: 500 }}>SKUs não encontrados ({uploadResult.unmatched}):</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {uploadResult.unmatchedSkus.slice(0, 50).map((sku, si) => (
                        <span key={`rsku-${si}`} className="bg-white text-amber-700 border border-amber-200 px-2 py-0.5 rounded font-mono" style={{ fontSize: "0.73rem" }}>{sku}</span>
                      ))}
                      {uploadResult.unmatched > 50 && <span className="text-amber-600" style={{ fontSize: "0.73rem" }}>+{uploadResult.unmatched - 50}</span>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-5 border-t border-gray-100">
              <button onClick={resetAll} className="px-4 py-2.5 bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg flex items-center gap-2" style={{ fontSize: "0.85rem" }}>
                <ArrowUpFromLine className="w-4 h-4" />Novo Upload
              </button>
              <button onClick={handleBrowse} className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-2" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                <Eye className="w-4 h-4" />Ver Atributos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════ BROWSING ═══════════════════════ */}
      {step === "browsing" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-red-600" />
                <h2 className="text-gray-800" style={{ fontSize: "1.05rem", fontWeight: 600 }}>Atributos Cadastrados</h2>
                {!browseLoading && (
                  <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full" style={{ fontSize: "0.72rem", fontWeight: 500 }}>
                    {filteredAttrs.length}{filteredAttrs.length !== allAttrs.length && ` / ${allAttrs.length}`}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={browseSearch}
                    onChange={(e) => setBrowseSearch(e.target.value)}
                    placeholder="Buscar SKU ou atributo..."
                    className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-gray-700 bg-gray-50 focus:bg-white focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-100 w-[240px]"
                    style={{ fontSize: "0.83rem" }}
                  />
                </div>
                <button onClick={handleBrowse} className="p-2 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded-lg" title="Recarregar"><RefreshCw className="w-4 h-4" /></button>
                <button onClick={resetAll} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg" title="Voltar"><ArrowLeft className="w-4 h-4" /></button>
              </div>
            </div>
          </div>

          {browseLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <Loader2 className="w-8 h-8 text-red-600 animate-spin mx-auto mb-3" />
                <p className="text-gray-500" style={{ fontSize: "0.85rem" }}>Carregando atributos...</p>
              </div>
            </div>
          ) : filteredAttrs.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <Tag className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-500" style={{ fontSize: "0.9rem", fontWeight: 500 }}>
                  {browseSearch ? "Nenhum resultado" : "Nenhum atributo cadastrado"}
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
              {filteredAttrs.slice(0, 100).map((item) => (
                <div key={item.sku}>
                  <div className="px-5 py-3 flex items-center justify-between hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedSku(expandedSku === item.sku ? null : item.sku)}>
                    <div className="flex items-center gap-3 min-w-0">
                      <Hash className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span className="font-mono text-red-700 truncate" style={{ fontSize: "0.85rem", fontWeight: 600 }}>{item.sku}</span>
                      <span className="text-gray-400 shrink-0" style={{ fontSize: "0.75rem" }}>{Object.keys(item.attributes).length} atributos</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="hidden sm:flex gap-1 max-w-[300px] overflow-hidden">
                        {Object.keys(item.attributes).slice(0, 3).map((key, ki) => (
                          <span key={`bk-${ki}`} className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded whitespace-nowrap" style={{ fontSize: "0.7rem" }}>{key}</span>
                        ))}
                        {Object.keys(item.attributes).length > 3 && <span className="text-gray-400" style={{ fontSize: "0.7rem" }}>+{Object.keys(item.attributes).length - 3}</span>}
                      </div>
                      {expandedSku === item.sku ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
                    </div>
                  </div>
                  {expandedSku === item.sku && (
                    <div className="bg-gray-50 px-5 py-3 border-t border-gray-100">
                      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                        {Object.entries(item.attributes).map(([key, value], idx) => (
                          <div key={`battr-${idx}`} className={`grid grid-cols-[160px_1fr] ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/60"} ${idx < Object.keys(item.attributes).length - 1 ? "border-b border-gray-100" : ""}`}>
                            <div className="px-3 py-2 text-gray-500 border-r border-gray-100" style={{ fontSize: "0.8rem", fontWeight: 500 }}>{key}</div>
                            <div className="px-3 py-2">
                              {Array.isArray(value) ? (
                                <div className="flex flex-wrap gap-1">
                                  {value.map((v, vi) => (
                                    <span key={vi} className="bg-red-50 text-red-700 border border-red-100 px-2 py-0.5 rounded" style={{ fontSize: "0.78rem" }}>{v}</span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-gray-800" style={{ fontSize: "0.83rem" }}>{value}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {filteredAttrs.length > 100 && (
                <div className="px-5 py-3 text-center">
                  <span className="text-gray-400" style={{ fontSize: "0.8rem" }}>Exibindo 100 de {filteredAttrs.length}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
