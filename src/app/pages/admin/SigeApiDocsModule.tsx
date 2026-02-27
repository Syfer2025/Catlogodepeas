import { useState, useCallback, useEffect, useRef } from "react";
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  Save,
  Trash2,
  Search,
  FileText,
  Database,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Download,
  Upload,
  BookOpen,
  AlertTriangle,
  FileUp,
  Table,
  Code,
  File,
  RefreshCw,
  Eye,
  EyeOff,
  Layers,
} from "lucide-react";
import * as api from "../../services/api";
import { getValidAdminToken } from "./adminAuth";

// ═══════════════════════════════════════════════════════════
// PDF.js CDN Loader — multi-CDN fallback strategy
// Uses v3.11.174 (last v3 with classic UMD window.pdfjsLib)
// ═══════════════════════════════════════════════════════════

const PDFJS_VERSION = "3.11.174";
const CDN_SOURCES = [
  {
    name: "cdnjs",
    script: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`,
    worker: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`,
  },
  {
    name: "jsdelivr",
    script: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.js`,
    worker: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.js`,
  },
  {
    name: "unpkg",
    script: `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.js`,
    worker: `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.js`,
  },
];

let _pdfjsLoaded = false;
let _pdfjsLoadPromise: Promise<void> | null = null;

function tryLoadScript(src: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.type = "text/javascript";
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      reject(new Error(`Failed: ${src}`));
    };
    document.head.appendChild(script);
  });
}

function loadPdfJs(): Promise<void> {
  if (_pdfjsLoaded && (window as any).pdfjsLib) return Promise.resolve();
  if (_pdfjsLoadPromise) return _pdfjsLoadPromise;

  _pdfjsLoadPromise = (async () => {
    // Already on page?
    if ((window as any).pdfjsLib) {
      _pdfjsLoaded = true;
      return;
    }

    let lastErr: Error | null = null;
    for (const cdn of CDN_SOURCES) {
      try {
        console.log(`[PDF.js] Trying ${cdn.name}...`);
        await tryLoadScript(cdn.script);
        const lib = (window as any).pdfjsLib;
        if (lib) {
          lib.GlobalWorkerOptions.workerSrc = cdn.worker;
          _pdfjsLoaded = true;
          console.log(`[PDF.js] Loaded from ${cdn.name}`);
          return;
        }
        lastErr = new Error(`${cdn.name}: script loaded but pdfjsLib undefined`);
      } catch (e: any) {
        lastErr = e;
        console.warn(`[PDF.js] ${cdn.name} failed:`, e.message);
      }
    }
    // All CDNs failed — reset so user can retry
    _pdfjsLoadPromise = null;
    throw lastErr || new Error("Nenhum CDN conseguiu carregar o pdf.js");
  })();

  return _pdfjsLoadPromise;
}

// ═══════════════════════════════════════════════════════════
// PDF Text Extraction with Table & Code Detection
// ═══════════════════════════════════════════════════════════

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName: string;
}

interface ExtractedPage {
  pageNum: number;
  lines: string[];
  tables: string[][];
  codeBlocks: string[];
}

interface PdfExtractionResult {
  totalPages: number;
  pages: ExtractedPage[];
  fullText: string;
  stats: {
    totalChars: number;
    totalLines: number;
    tablesFound: number;
    codeBlocksFound: number;
  };
}

async function extractPdfContent(arrayBuffer: ArrayBuffer): Promise<PdfExtractionResult> {
  await loadPdfJs();
  const pdfjsLib = (window as any).pdfjsLib;

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;
  const pages: ExtractedPage[] = [];
  let totalTablesFound = 0;
  let totalCodeBlocks = 0;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });

    // Collect all text items with positions
    const items: TextItem[] = textContent.items
      .filter((item: any) => item.str !== undefined)
      .map((item: any) => ({
        str: item.str,
        x: Math.round(item.transform[4] * 100) / 100,
        y: Math.round((viewport.height - item.transform[5]) * 100) / 100,
        width: item.width || 0,
        height: item.height || item.transform[0] || 12,
        fontName: item.fontName || "",
      }));

    // Group items into lines by Y position (tolerance-based clustering)
    const lineGroups = groupIntoLines(items);
    const lines = lineGroups.map((group) => {
      // Sort by X within each line
      group.sort((a, b) => a.x - b.x);
      return group.map((it) => it.str).join("");
    });

    // Detect tables (lines with consistent column separators)
    const tables = detectTables(lineGroups);
    totalTablesFound += tables.length;

    // Detect code blocks (lines with code-like patterns)
    const codeBlocks = detectCodeBlocks(lines);
    totalCodeBlocks += codeBlocks.length;

    pages.push({ pageNum, lines, tables, codeBlocks });
  }

  // Build full text with table and code formatting
  const fullText = buildFormattedText(pages);
  const totalLines = fullText.split("\n").length;

  return {
    totalPages,
    pages,
    fullText,
    stats: {
      totalChars: fullText.length,
      totalLines,
      tablesFound: totalTablesFound,
      codeBlocksFound: totalCodeBlocks,
    },
  };
}

function groupIntoLines(items: TextItem[]): TextItem[][] {
  if (items.length === 0) return [];

  // Sort by Y (top to bottom), then X
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);

  const lines: TextItem[][] = [];
  let currentLine: TextItem[] = [sorted[0]];
  let currentY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    const yTolerance = Math.max(3, (item.height || 12) * 0.5);
    if (Math.abs(item.y - currentY) <= yTolerance) {
      currentLine.push(item);
    } else {
      lines.push(currentLine);
      currentLine = [item];
      currentY = item.y;
    }
  }
  if (currentLine.length > 0) lines.push(currentLine);

  return lines;
}

function detectTables(lineGroups: TextItem[][]): string[][] {
  const tables: string[][] = [];
  if (lineGroups.length < 2) return tables;

  // Analyze column positions across lines
  let tableStartIdx = -1;
  let lastColCount = 0;

  for (let i = 0; i < lineGroups.length; i++) {
    const group = lineGroups[i];
    if (group.length < 1) continue;

    // Detect columns: items separated by significant gaps (>20px)
    const sorted = [...group].sort((a, b) => a.x - b.x);
    const columns: string[] = [];
    let currentCol = sorted[0].str;

    for (let j = 1; j < sorted.length; j++) {
      const gap = sorted[j].x - (sorted[j - 1].x + sorted[j - 1].width);
      if (gap > 15) {
        columns.push(currentCol.trim());
        currentCol = sorted[j].str;
      } else {
        // Detect if there's a natural space needed
        const spaceGap = sorted[j].x - (sorted[j - 1].x + sorted[j - 1].width);
        if (spaceGap > 2) {
          currentCol += " " + sorted[j].str;
        } else {
          currentCol += sorted[j].str;
        }
      }
    }
    columns.push(currentCol.trim());

    const colCount = columns.length;

    if (colCount >= 2) {
      if (tableStartIdx === -1 || Math.abs(colCount - lastColCount) <= 1) {
        if (tableStartIdx === -1) tableStartIdx = tables.length;
        tables.push(columns);
        lastColCount = colCount;
      } else {
        tableStartIdx = tables.length;
        tables.push(columns);
        lastColCount = colCount;
      }
    }
  }

  return tables;
}

function detectCodeBlocks(lines: string[]): string[] {
  const codeBlocks: string[] = [];
  const codePatterns = [
    /^\s*(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\//i,
    /^\s*\{[\s"]/,
    /^\s*\[[\s"{\d]/,
    /^\s*(curl|fetch|axios|http|https:\/\/)/i,
    /^\s*"[a-zA-Z_]+"\s*:/,
    /"(type|format|required|nullable|description|enum|properties|items)"\s*:/,
    /^\s*(if|else|for|while|function|const|let|var|return|import|export)\s/,
    /^\s*\/\/.+/,
    /application\/json/i,
    /Bearer\s+\{/i,
    /Content-Type/i,
    /Authorization/i,
  ];

  let blockStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isCodeLike = codePatterns.some((p) => p.test(line));
    const hasIndent = /^\s{2,}/.test(line);
    const hasBraces = /[{}[\]]/.test(line);

    if (isCodeLike || (blockStart !== -1 && (hasIndent || hasBraces || line.trim() === ""))) {
      if (blockStart === -1) blockStart = i;
    } else {
      if (blockStart !== -1 && i - blockStart >= 2) {
        codeBlocks.push(lines.slice(blockStart, i).join("\n"));
      }
      blockStart = -1;
    }
  }
  // Trailing block
  if (blockStart !== -1 && lines.length - blockStart >= 2) {
    codeBlocks.push(lines.slice(blockStart).join("\n"));
  }

  return codeBlocks;
}

function buildFormattedText(pages: ExtractedPage[]): string {
  const parts: string[] = [];

  for (const page of pages) {
    parts.push(`\n${"=".repeat(60)}`);
    parts.push(`PAGINA ${page.pageNum}`);
    parts.push(`${"=".repeat(60)}\n`);

    // Process lines with table detection
    const tableLines = new Set<number>();
    if (page.tables.length > 0) {
      // Find which raw lines correspond to table rows by matching content
      for (const tableRow of page.tables) {
        const joined = tableRow.join(" ");
        for (let li = 0; li < page.lines.length; li++) {
          // Check if the line contains most of the table row content
          const lineText = page.lines[li].replace(/\s+/g, " ").trim();
          if (lineText && joined.includes(lineText.substring(0, Math.min(20, lineText.length)))) {
            tableLines.add(li);
          }
        }
      }
    }

    // Output tables as formatted blocks
    if (page.tables.length > 0) {
      // Compute column widths
      const maxCols = Math.max(...page.tables.map((r) => r.length));
      const colWidths: number[] = Array(maxCols).fill(0);
      for (const row of page.tables) {
        for (let c = 0; c < row.length; c++) {
          colWidths[c] = Math.max(colWidths[c], (row[c] || "").length);
        }
      }

      // Only format as table if we have at least 3 rows with 2+ columns
      const qualifiedRows = page.tables.filter((r) => r.length >= 2);
      if (qualifiedRows.length >= 3) {
        parts.push("\n--- TABELA DETECTADA ---");
        // Header separator
        const headerSep = colWidths.map((w) => "-".repeat(Math.min(w + 2, 40))).join(" | ");

        for (let ri = 0; ri < page.tables.length; ri++) {
          const row = page.tables[ri];
          const formatted = row.map((cell, ci) => (cell || "").padEnd(Math.min(colWidths[ci], 38))).join(" | ");
          parts.push(formatted);
          if (ri === 0) parts.push(headerSep);
        }
        parts.push("--- FIM TABELA ---\n");
      }
    }

    // Output remaining lines
    for (let li = 0; li < page.lines.length; li++) {
      if (!tableLines.has(li)) {
        parts.push(page.lines[li]);
      }
    }

    // Output detected code blocks
    if (page.codeBlocks.length > 0) {
      for (const block of page.codeBlocks) {
        // Check if block content is already in the lines output
        const blockFirstLine = block.split("\n")[0].trim();
        const alreadyOutput = page.lines.some((l) => l.trim() === blockFirstLine);
        if (!alreadyOutput) {
          parts.push("\n```");
          parts.push(block);
          parts.push("```\n");
        }
      }
    }
  }

  // Clean up: collapse excessive blank lines, trim
  let text = parts.join("\n");
  text = text.replace(/\n{4,}/g, "\n\n\n");
  return text.trim();
}

// ═══════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════

interface Props {
  isConnected: boolean;
}

export function SigeApiDocsModule({ isConnected }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    Array<{ lineNumber: number; context: string }>
  >([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [docMeta, setDocMeta] = useState<{
    found: boolean;
    size: number;
    sections: string[];
    updatedAt: string | null;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [showSections, setShowSections] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // PDF upload
  const [pdfParsing, setPdfParsing] = useState(false);
  const [pdfProgress, setPdfProgress] = useState("");
  const [pdfStats, setPdfStats] = useState<PdfExtractionResult["stats"] | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Second upload/paste area
  const [showExtraInput, setShowExtraInput] = useState(false);
  const [extraPasteText, setExtraPasteText] = useState("");
  const [extraDragOver, setExtraDragOver] = useState(false);
  const [extraPdfParsing, setExtraPdfParsing] = useState(false);
  const [extraPdfProgress, setExtraPdfProgress] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const extraFileInputRef = useRef<HTMLInputElement>(null);

  const getAccessToken = useCallback(async (): Promise<string> => {
    const token = await getValidAdminToken();
    if (!token) throw new Error("Sessão expirada");
    return token;
  }, []);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getAccessToken();
      const data = await api.getApiDocs(token);
      setDocMeta({
        found: data.found,
        size: data.size,
        sections: data.sections,
        updatedAt: data.updatedAt,
      });
      if (data.found && data.content) {
        setContent(data.content);
        setOriginalContent(data.content);
      }
    } catch (e: any) {
      setError(e.message || "Erro ao carregar documentação.");
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (expanded && !docMeta) {
      loadDocs();
    }
  }, [expanded, docMeta, loadDocs]);

  // ─── PDF Processing ───

  const processPdfFile = async (file: File) => {
    setPdfParsing(true);
    setPdfProgress("Carregando PDF.js...");
    setError("");
    setSuccess("");
    setPdfStats(null);

    try {
      setPdfProgress(`Lendo arquivo "${file.name}" (${(file.size / 1024).toFixed(0)} KB)...`);
      const arrayBuffer = await file.arrayBuffer();

      setPdfProgress("Inicializando parser PDF...");
      await loadPdfJs();

      setPdfProgress("Extraindo texto, tabelas e códigos...");
      const result = await extractPdfContent(arrayBuffer);

      setPdfStats(result.stats);
      setPdfProgress("");

      // Ask user how to handle: replace or append
      if (content.trim()) {
        const appendText = `\n\n${"#".repeat(60)}\n# IMPORTADO DE: ${file.name}\n# Data: ${new Date().toLocaleString("pt-BR")}\n# Paginas: ${result.totalPages} | Tabelas: ${result.stats.tablesFound} | Blocos de codigo: ${result.stats.codeBlocksFound}\n${"#".repeat(60)}\n\n${result.fullText}`;
        setContent((prev) => prev + appendText);
      } else {
        const header = `# Documentação importada de: ${file.name}\n# Data: ${new Date().toLocaleString("pt-BR")}\n# Páginas: ${result.totalPages} | Tabelas: ${result.stats.tablesFound} | Blocos de código: ${result.stats.codeBlocksFound}\n\n`;
        setContent(header + result.fullText);
      }

      setSuccess(
        `PDF processado! ${result.totalPages} páginas, ${result.stats.totalLines.toLocaleString("pt-BR")} linhas, ${result.stats.tablesFound} tabelas, ${result.stats.codeBlocksFound} blocos de código extraídos.`
      );
    } catch (e: any) {
      console.error("[PDF] Extraction error:", e);
      setError(`Erro ao processar PDF: ${e.message || e}`);
    } finally {
      setPdfParsing(false);
      setPdfProgress("");
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
    // Reset input so the same file can be selected again
    e.target.value = "";
  };

  const processFile = (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "pdf") {
      processPdfFile(file);
      return;
    }

    // Handle text-based files (JSON, YAML, TXT, MD, etc.)
    if (
      ["txt", "json", "yaml", "yml", "md", "csv", "xml", "html", "htm", "log"].includes(
        ext || ""
      ) ||
      file.type.startsWith("text/") ||
      file.type === "application/json"
    ) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        if (content.trim()) {
          setContent(
            (prev) =>
              prev +
              `\n\n${"#".repeat(60)}\n# IMPORTADO DE: ${file.name}\n${"#".repeat(60)}\n\n${text}`
          );
        } else {
          setContent(text);
        }
        setSuccess(`Arquivo "${file.name}" importado (${(file.size / 1024).toFixed(1)} KB).`);
      };
      reader.onerror = () => setError("Erro ao ler arquivo de texto.");
      reader.readAsText(file, "utf-8");
      return;
    }

    setError(
      `Formato não suportado: .${ext}. Use PDF, TXT, JSON, YAML, MD, CSV ou XML.`
    );
  };

  // Drag & Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  // ─── Other handlers ───

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const token = await getAccessToken();
      const result = await api.saveApiDocs(token, content);
      setSuccess(
        `Salvo! ${result.size.toLocaleString("pt-BR")} caracteres, ${result.sections} seções detectadas.`
      );
      setOriginalContent(content);
      setDocMeta((prev) =>
        prev
          ? { ...prev, found: true, size: result.size, updatedAt: result.updatedAt }
          : prev
      );
      const data = await api.getApiDocs(token);
      setDocMeta({
        found: data.found,
        size: data.size,
        sections: data.sections,
        updatedAt: data.updatedAt,
      });
    } catch (e: any) {
      setError(e.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 5000);
      return;
    }
    setDeleting(true);
    setError("");
    setSuccess("");
    try {
      const token = await getAccessToken();
      await api.deleteApiDocs(token);
      setContent("");
      setOriginalContent("");
      setDocMeta({ found: false, size: 0, sections: [], updatedAt: null });
      setSuccess("Documentação removida.");
      setConfirmDelete(false);
      setPdfStats(null);
    } catch (e: any) {
      setError(e.message || "Erro ao remover.");
    } finally {
      setDeleting(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setError("");
    try {
      const token = await getAccessToken();
      const result = await api.searchApiDocs(token, searchQuery.trim());
      setSearchResults(result.results);
      if (result.total === 0) {
        setSuccess(`Nenhum resultado para "${searchQuery}".`);
      } else {
        setSuccess(`${result.total} resultado(s) para "${searchQuery}".`);
      }
    } catch (e: any) {
      setError(e.message || "Erro na busca.");
    } finally {
      setSearching(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* fallback */
    }
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sige-api-docs.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Extra Input Handlers ───

  const processExtraFile = (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "pdf") {
      processExtraPdf(file);
      return;
    }

    if (
      ["txt", "json", "yaml", "yml", "md", "csv", "xml", "html", "htm", "log"].includes(ext || "") ||
      file.type.startsWith("text/") ||
      file.type === "application/json"
    ) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        const separator = `\n\n${"#".repeat(60)}\n# CONTEÚDO ADICIONAL - IMPORTADO DE: ${file.name}\n# Data: ${new Date().toLocaleString("pt-BR")}\n${"#".repeat(60)}\n\n`;
        setContent((prev) => (prev.trim() ? prev + separator + text : text));
        setSuccess(`Arquivo adicional "${file.name}" adicionado (${(file.size / 1024).toFixed(1)} KB).`);
        setShowExtraInput(false);
      };
      reader.onerror = () => setError("Erro ao ler arquivo de texto.");
      reader.readAsText(file, "utf-8");
      return;
    }

    setError(`Formato não suportado: .${ext}. Use PDF, TXT, JSON, YAML, MD, CSV ou XML.`);
  };

  const processExtraPdf = async (file: File) => {
    setExtraPdfParsing(true);
    setExtraPdfProgress("Carregando PDF.js...");
    setError("");
    setSuccess("");

    try {
      setExtraPdfProgress(`Lendo "${file.name}" (${(file.size / 1024).toFixed(0)} KB)...`);
      const arrayBuffer = await file.arrayBuffer();

      setExtraPdfProgress("Inicializando parser PDF...");
      await loadPdfJs();

      setExtraPdfProgress("Extraindo texto, tabelas e códigos...");
      const result = await extractPdfContent(arrayBuffer);
      setExtraPdfProgress("");

      const separator = `\n\n${"#".repeat(60)}\n# CONTEÚDO ADICIONAL - IMPORTADO DE: ${file.name}\n# Data: ${new Date().toLocaleString("pt-BR")}\n# Páginas: ${result.totalPages} | Tabelas: ${result.stats.tablesFound} | Blocos de código: ${result.stats.codeBlocksFound}\n${"#".repeat(60)}\n\n`;
      setContent((prev) => (prev.trim() ? prev + separator + result.fullText : result.fullText));
      setSuccess(
        `PDF adicional processado! ${result.totalPages} pags, ${result.stats.totalLines.toLocaleString("pt-BR")} linhas extraidas.`
      );
      setShowExtraInput(false);
    } catch (e: any) {
      setError(`Erro ao processar PDF adicional: ${e.message || e}`);
    } finally {
      setExtraPdfParsing(false);
      setExtraPdfProgress("");
    }
  };

  const handleExtraFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processExtraFile(file);
    e.target.value = "";
  };

  const handleExtraPasteAppend = () => {
    if (!extraPasteText.trim()) return;
    const separator = `\n\n${"#".repeat(60)}\n# CONTEÚDO ADICIONAL - COLADO MANUALMENTE\n# Data: ${new Date().toLocaleString("pt-BR")}\n${"#".repeat(60)}\n\n`;
    setContent((prev) => (prev.trim() ? prev + separator + extraPasteText : extraPasteText));
    setSuccess(`Conteúdo adicional colado (${(extraPasteText.length / 1024).toFixed(1)} KB).`);
    setExtraPasteText("");
    setShowExtraInput(false);
  };

  const handleExtraDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setExtraDragOver(true);
  };

  const handleExtraDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setExtraDragOver(false);
  };

  const handleExtraDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setExtraDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processExtraFile(file);
  };

  const hasChanges = content !== originalContent;
  const lineCount = content ? content.split("\n").length : 0;
  const charCount = content.length;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-5 flex items-center gap-3 hover:bg-gray-50/30 transition-colors cursor-pointer"
      >
        <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center shrink-0">
          <BookOpen className="w-5 h-5 text-indigo-600" />
        </div>
        <div className="text-left flex-1">
          <h4
            className="text-gray-900"
            style={{ fontSize: "0.95rem", fontWeight: 700 }}
          >
            Documentação da API SIGE
          </h4>
          <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>
            Upload de PDF ou cole a documentação — suporte a tabelas e códigos
            {docMeta?.found && (
              <span className="ml-1 text-indigo-500">
                — {(docMeta.size / 1024).toFixed(1)} KB salvo
              </span>
            )}
          </p>
        </div>
        <span
          className={`px-2.5 py-1 rounded-full shrink-0 border ${
            docMeta?.found
              ? "bg-green-50 text-green-700 border-green-200"
              : "bg-gray-50 text-gray-500 border-gray-200"
          }`}
          style={{ fontSize: "0.68rem", fontWeight: 600 }}
        >
          {docMeta?.found ? `${docMeta.sections.length} seções` : "Vazio"}
        </span>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4">
          {/* Alerts */}
          {error && (
            <div
              className="flex items-start gap-2 p-3 bg-red-50 text-red-700 rounded-lg border border-red-100"
              style={{ fontSize: "0.78rem" }}
            >
              <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="break-words">{error}</span>
            </div>
          )}
          {success && (
            <div
              className="flex items-start gap-2 p-3 bg-green-50 text-green-700 rounded-lg border border-green-100"
              style={{ fontSize: "0.78rem" }}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          {/* ─── Upload Zone ─── */}
          <div
            className={`relative rounded-xl border-2 border-dashed transition-all ${
              dragOver
                ? "border-indigo-400 bg-indigo-50"
                : "border-gray-200 bg-gray-50/50 hover:border-indigo-300 hover:bg-indigo-50/30"
            } ${pdfParsing ? "pointer-events-none opacity-70" : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.json,.yaml,.yml,.md,.csv,.xml"
              onChange={handleFileSelect}
              className="hidden"
            />

            {pdfParsing ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                <div className="text-center">
                  <p
                    className="text-indigo-700"
                    style={{ fontSize: "0.85rem", fontWeight: 600 }}
                  >
                    Processando PDF...
                  </p>
                  <p className="text-indigo-500 mt-1" style={{ fontSize: "0.75rem" }}>
                    {pdfProgress}
                  </p>
                </div>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-7 flex flex-col items-center gap-3 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 bg-red-100 rounded-xl flex items-center justify-center">
                    <FileUp className="w-5.5 h-5.5 text-red-600" />
                  </div>
                  <div className="w-11 h-11 bg-blue-100 rounded-xl flex items-center justify-center">
                    <FileText className="w-5.5 h-5.5 text-blue-600" />
                  </div>
                  <div className="w-11 h-11 bg-amber-100 rounded-xl flex items-center justify-center">
                    <Code className="w-5.5 h-5.5 text-amber-600" />
                  </div>
                </div>
                <div className="text-center">
                  <p
                    className="text-gray-800"
                    style={{ fontSize: "0.9rem", fontWeight: 700 }}
                  >
                    Arraste um arquivo ou clique para selecionar
                  </p>
                  <p className="text-gray-500 mt-1" style={{ fontSize: "0.75rem" }}>
                    <span className="font-semibold text-red-600">PDF</span> (com
                    extração de tabelas e códigos) |{" "}
                    <span className="font-semibold text-blue-600">
                      TXT, JSON, YAML, MD, CSV, XML
                    </span>
                  </p>
                </div>
              </button>
            )}
          </div>

          {/* PDF Stats */}
          {pdfStats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                {
                  label: "Caracteres",
                  value: pdfStats.totalChars.toLocaleString("pt-BR"),
                  icon: <FileText className="w-3.5 h-3.5" />,
                  color: "text-blue-600 bg-blue-50 border-blue-100",
                },
                {
                  label: "Linhas",
                  value: pdfStats.totalLines.toLocaleString("pt-BR"),
                  icon: <Layers className="w-3.5 h-3.5" />,
                  color: "text-indigo-600 bg-indigo-50 border-indigo-100",
                },
                {
                  label: "Tabelas",
                  value: String(pdfStats.tablesFound),
                  icon: <Table className="w-3.5 h-3.5" />,
                  color: "text-emerald-600 bg-emerald-50 border-emerald-100",
                },
                {
                  label: "Código",
                  value: String(pdfStats.codeBlocksFound),
                  icon: <Code className="w-3.5 h-3.5" />,
                  color: "text-amber-600 bg-amber-50 border-amber-100",
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border ${stat.color}`}
                  style={{ fontSize: "0.75rem" }}
                >
                  {stat.icon}
                  <div>
                    <p style={{ fontWeight: 700 }}>{stat.value}</p>
                    <p style={{ fontSize: "0.65rem", opacity: 0.8 }}>{stat.label}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Sections */}
          {docMeta?.found && docMeta.sections.length > 0 && (
            <div>
              <button
                onClick={() => setShowSections(!showSections)}
                className="flex items-center gap-2 text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
                style={{ fontSize: "0.78rem", fontWeight: 600 }}
              >
                <FileText className="w-3.5 h-3.5" />
                {showSections ? "Ocultar" : "Mostrar"} seções detectadas (
                {docMeta.sections.length})
                {showSections ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
              </button>
              {showSections && (
                <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-100 max-h-48 overflow-y-auto">
                  <div className="space-y-0.5">
                    {docMeta.sections.map((s, i) => (
                      <div
                        key={i}
                        className="text-gray-600 flex items-center gap-2"
                        style={{ fontSize: "0.72rem" }}
                      >
                        <span
                          className="text-gray-400 w-5 text-right shrink-0"
                          style={{ fontSize: "0.65rem" }}
                        >
                          {i + 1}.
                        </span>
                        <span className="truncate">{s}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Search */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
                placeholder="Buscar na documentação... (ex: codRef, /order, POST)"
                className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all"
                style={{ fontSize: "0.82rem" }}
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={searching || !searchQuery.trim() || !docMeta?.found}
              className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer flex items-center gap-1.5 shrink-0"
              style={{ fontSize: "0.82rem", fontWeight: 600 }}
            >
              {searching ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Search className="w-3.5 h-3.5" />
              )}
              Buscar
            </button>
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              <p
                className="text-gray-500"
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Resultados da busca
              </p>
              {searchResults.map((r, i) => (
                <div
                  key={i}
                  className="p-3 bg-gray-50 rounded-lg border border-gray-100"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full"
                      style={{ fontSize: "0.65rem", fontWeight: 600 }}
                    >
                      Linha {r.lineNumber}
                    </span>
                  </div>
                  <pre
                    className="text-gray-700 whitespace-pre-wrap break-words"
                    style={{
                      fontSize: "0.72rem",
                      lineHeight: 1.5,
                      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    }}
                  >
                    {r.context}
                  </pre>
                </div>
              ))}
            </div>
          )}

          {/* Textarea */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label
                className="text-gray-700 flex items-center gap-2"
                style={{ fontSize: "0.82rem", fontWeight: 600 }}
              >
                <Database className="w-4 h-4 text-indigo-500" />
                Conteúdo da Documentação
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                  style={{ fontSize: "0.7rem", fontWeight: 500 }}
                >
                  {showPreview ? (
                    <EyeOff className="w-3 h-3" />
                  ) : (
                    <Eye className="w-3 h-3" />
                  )}
                  {showPreview ? "Editar" : "Preview"}
                </button>
              </label>
              <div
                className="flex items-center gap-3 text-gray-400"
                style={{ fontSize: "0.68rem" }}
              >
                <span>{lineCount.toLocaleString("pt-BR")} linhas</span>
                <span>{(charCount / 1024).toFixed(1)} KB</span>
                {hasChanges && (
                  <span className="flex items-center gap-1 text-amber-600">
                    <AlertTriangle className="w-3 h-3" />
                    Não salvo
                  </span>
                )}
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                <span style={{ fontSize: "0.85rem" }}>
                  Carregando documentação...
                </span>
              </div>
            ) : showPreview ? (
              <div
                className="w-full border border-gray-200 rounded-lg bg-white p-4 overflow-auto"
                style={{
                  minHeight: "400px",
                  maxHeight: "80vh",
                }}
              >
                <pre
                  className="text-gray-800 whitespace-pre-wrap break-words"
                  style={{
                    fontSize: "0.78rem",
                    lineHeight: 1.6,
                    fontFamily:
                      "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
                  }}
                >
                  {content || (
                    <span className="text-gray-400 italic">
                      Nenhum conteúdo carregado
                    </span>
                  )}
                </pre>
              </div>
            ) : (
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  setError("");
                  setSuccess("");
                }}
                placeholder={`Cole aqui a documentação ou faça upload de um PDF...

Formatos aceitos:
  - PDF (extração automática de texto, tabelas e código)
  - TXT, JSON, YAML, MD, CSV, XML

O parser de PDF:
  - Extrai texto de todas as paginas
  - Detecta e formata tabelas automaticamente
  - Identifica blocos de código (endpoints, JSON schemas, etc)
  - Preserva a estrutura e hierarquia do documento`}
                className="w-full border border-gray-200 rounded-lg bg-white p-4 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all resize-y"
                style={{
                  fontSize: "0.78rem",
                  lineHeight: 1.6,
                  fontFamily:
                    "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
                  minHeight: "400px",
                  maxHeight: "80vh",
                }}
                spellCheck={false}
              />
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleSave}
              disabled={saving || !content.trim()}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
              style={{ fontSize: "0.82rem", fontWeight: 600 }}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {saving ? "Salvando..." : "Salvar Documentação"}
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={pdfParsing}
              className="flex items-center gap-2 px-3 py-2.5 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 border border-red-200 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
              style={{ fontSize: "0.78rem", fontWeight: 600 }}
            >
              <FileUp className="w-3.5 h-3.5" />
              Upload PDF
            </button>

            <button
              onClick={handleCopy}
              disabled={!content.trim()}
              className="flex items-center gap-2 px-3 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
              style={{ fontSize: "0.78rem", fontWeight: 500 }}
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-green-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              {copied ? "Copiado!" : "Copiar"}
            </button>

            <button
              onClick={handleDownload}
              disabled={!content.trim()}
              className="flex items-center gap-2 px-3 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
              style={{ fontSize: "0.78rem", fontWeight: 500 }}
            >
              <Download className="w-3.5 h-3.5" />
              Baixar .txt
            </button>

            <button
              onClick={loadDocs}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
              style={{ fontSize: "0.78rem", fontWeight: 500 }}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Recarregar
            </button>

            {docMeta?.found && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg transition-colors cursor-pointer ml-auto ${
                  confirmDelete
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
                }`}
                style={{ fontSize: "0.78rem", fontWeight: 600 }}
              >
                {deleting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                {confirmDelete ? "Confirmar exclusão?" : "Excluir"}
              </button>
            )}
          </div>

          {/* ─── Extra Input: Second Upload / Paste ─── */}
          <div className="rounded-xl border border-teal-200 bg-teal-50/30 overflow-hidden">
            <button
              onClick={() => setShowExtraInput(!showExtraInput)}
              className="w-full px-4 py-3 flex items-center gap-2.5 hover:bg-teal-50/60 transition-colors cursor-pointer"
            >
              <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center shrink-0">
                <Upload className="w-4 h-4 text-teal-700" />
              </div>
              <div className="text-left flex-1">
                <p className="text-teal-800" style={{ fontSize: "0.82rem", fontWeight: 700 }}>
                  Adicionar Conteúdo Extra
                </p>
                <p className="text-teal-600" style={{ fontSize: "0.68rem" }}>
                  Upload de segundo arquivo ou cole texto adicional para acumular na documentação
                </p>
              </div>
              {showExtraInput ? (
                <ChevronDown className="w-4 h-4 text-teal-500 shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-teal-500 shrink-0" />
              )}
            </button>

            {showExtraInput && (
              <div className="px-4 pb-4 space-y-3">
                {/* Extra file upload hidden input */}
                <input
                  ref={extraFileInputRef}
                  type="file"
                  accept=".pdf,.txt,.json,.yaml,.yml,.md,.csv,.xml"
                  onChange={handleExtraFileSelect}
                  className="hidden"
                />

                {/* Extra Upload Zone */}
                <div
                  className={`rounded-lg border-2 border-dashed transition-all ${
                    extraDragOver
                      ? "border-teal-400 bg-teal-100/60"
                      : "border-teal-200 bg-white/60 hover:border-teal-300"
                  } ${extraPdfParsing ? "pointer-events-none opacity-70" : ""}`}
                  onDragOver={handleExtraDragOver}
                  onDragLeave={handleExtraDragLeave}
                  onDrop={handleExtraDrop}
                >
                  {extraPdfParsing ? (
                    <div className="flex items-center justify-center py-5 gap-2">
                      <Loader2 className="w-5 h-5 text-teal-600 animate-spin" />
                      <div>
                        <p className="text-teal-700" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                          Processando PDF adicional...
                        </p>
                        <p className="text-teal-500" style={{ fontSize: "0.7rem" }}>
                          {extraPdfProgress}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => extraFileInputRef.current?.click()}
                      className="w-full py-5 flex items-center justify-center gap-3 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-9 h-9 bg-red-100 rounded-lg flex items-center justify-center">
                          <FileUp className="w-4 h-4 text-red-600" />
                        </div>
                        <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
                          <FileText className="w-4 h-4 text-blue-600" />
                        </div>
                      </div>
                      <div className="text-left">
                        <p className="text-gray-700" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                          Arraste ou clique para upload adicional
                        </p>
                        <p className="text-gray-400" style={{ fontSize: "0.68rem" }}>
                          PDF, TXT, JSON, YAML, MD, CSV, XML — será adicionado ao final
                        </p>
                      </div>
                    </button>
                  )}
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-teal-200" />
                  <span className="text-teal-500" style={{ fontSize: "0.7rem", fontWeight: 600 }}>
                    OU COLE TEXTO
                  </span>
                  <div className="flex-1 h-px bg-teal-200" />
                </div>

                {/* Extra Paste Area */}
                <textarea
                  value={extraPasteText}
                  onChange={(e) => setExtraPasteText(e.target.value)}
                  placeholder="Cole aqui o conteúdo adicional (JSON, endpoints, schemas, notas, etc.)..."
                  className="w-full border border-teal-200 rounded-lg bg-white p-3 focus:ring-2 focus:ring-teal-200 focus:border-teal-400 outline-none transition-all resize-y"
                  style={{
                    fontSize: "0.78rem",
                    lineHeight: 1.5,
                    fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
                    minHeight: "120px",
                    maxHeight: "400px",
                  }}
                  spellCheck={false}
                />

                {/* Extra Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExtraPasteAppend}
                    disabled={!extraPasteText.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                    style={{ fontSize: "0.78rem", fontWeight: 600 }}
                  >
                    <Check className="w-3.5 h-3.5" />
                    Adicionar ao Documento
                  </button>
                  {extraPasteText.trim() && (
                    <span className="text-teal-500" style={{ fontSize: "0.68rem" }}>
                      {(extraPasteText.length / 1024).toFixed(1)} KB a adicionar
                    </span>
                  )}
                  <button
                    onClick={() => {
                      setShowExtraInput(false);
                      setExtraPasteText("");
                    }}
                    className="ml-auto px-3 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                    style={{ fontSize: "0.75rem" }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Info tip */}
          <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100">
            <p className="text-indigo-700" style={{ fontSize: "0.72rem" }}>
              <strong>Dica:</strong> O parser de PDF extrai automaticamente tabelas
              com colunas alinhadas e identifica blocos de código (endpoints REST,
              JSON schemas, etc). Após importar, use a <strong>busca</strong> para
              encontrar qualquer endpoint ou campo da API.
              {content.trim() && (
                <span className="block mt-1 text-indigo-500">
                  Fazer upload de outro arquivo <strong>adiciona</strong> o conteúdo ao
                  final do existente.
                </span>
              )}
            </p>
          </div>

          {/* Last update */}
          {docMeta?.updatedAt && (
            <p className="text-gray-400" style={{ fontSize: "0.68rem" }}>
              Última atualização:{" "}
              {new Date(docMeta.updatedAt).toLocaleString("pt-BR")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}