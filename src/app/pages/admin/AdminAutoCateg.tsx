import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Loader2,
  Play,
  CheckCircle2,
  Filter,
  ChevronDown,
  ChevronUp,
  Search,
  ArrowRight,
  FolderTree,
  Zap,
  AlertTriangle,
  BarChart3,
  Check,
  X,
  Download,
  RefreshCw,
  Eye,
  EyeOff,
  Info,
} from "lucide-react";
import * as api from "../../services/api";
import type { CategoryNode } from "../../services/api";
import { supabase } from "../../services/supabaseClient";
import { getValidAdminToken } from "./adminAuth";

// ─── Types ───

interface FlatCategory {
  slug: string;
  name: string;
  fullPath: string;
  keywords: string[];
  depth: number;
  parentSlug: string | null;
}

interface MatchResult {
  sku: string;
  titulo: string;
  currentCategory: string;
  currentCategoryName: string;
  suggestedCategory: string;
  suggestedCategoryName: string;
  suggestedFullPath: string;
  confidence: number;
  matchedKeywords: string[];
  alreadyCorrect: boolean;
  hasAttributes: boolean;
  selected: boolean;
}

type SortField = "confidence" | "sku" | "titulo" | "suggestedCategoryName";
type SortDir = "asc" | "desc";

// ─── Helpers ───

function removeAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeText(str: string): string {
  return removeAccents(str).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function extractWords(str: string): string[] {
  return normalizeText(str).split(" ").filter(function (w) { return w.length > 1; });
}

// Automotive synonym/keyword expansions
var KEYWORD_EXPANSIONS: Record<string, string[]> = {
  motor: ["motor", "bloco", "cabecote", "virabrequim", "biela", "piston", "pistao", "valvula", "comando", "arvore", "cames", "cilindro", "junta", "carter", "coletor", "turbina", "turbo", "intercooler", "radiador", "bomba", "oleo", "arrefecimento"],
  freio: ["freio", "freios", "disco", "pastilha", "lona", "tambor", "pinca", "cilindro", "mestre", "flexivel", "mangote"],
  suspensao: ["suspensao", "amortecedor", "mola", "feixe", "bucha", "batente", "bieleta", "bandeja", "pivo", "terminal", "barra", "estabilizador", "coxim", "rolamento"],
  direcao: ["direcao", "caixa", "hidraulico", "terminal", "barra", "axial", "bomba", "servo", "volante", "coluna"],
  iluminacao: ["iluminacao", "farol", "lanterna", "lampada", "led", "xenon", "soquete", "chicote", "pisca", "sinaleira", "milha"],
  eletrica: ["eletrica", "eletrico", "alternador", "partida", "rele", "fusivel", "chicote", "sensor", "modulo", "central", "bateria", "fio", "cabo", "interruptor", "chave"],
  transmissao: ["transmissao", "cambio", "embreagem", "plato", "disco", "rolamento", "atuador", "caixa", "satelite", "planetaria", "sincronizador", "garfo", "trambulador", "diferencial", "coroa", "pinhao"],
  escapamento: ["escapamento", "silencioso", "catalisador", "cano", "tubo", "flexivel", "descarga", "abracadeira", "anel", "vedacao"],
  carroceria: ["carroceria", "parachoque", "paralama", "porta", "capo", "tampa", "grade", "retrovisor", "espelho", "macaneta", "dobraca", "vidro", "borracha"],
  cabine: ["cabine", "painel", "banco", "tapete", "forro", "revestimento", "console", "porta", "macaneta", "vidro", "elevador"],
  arrefecimento: ["arrefecimento", "radiador", "mangueira", "valvula", "termostatica", "ventoinha", "eletroventilador", "reservatorio", "tampa"],
  combustivel: ["combustivel", "bomba", "bico", "injetor", "filtro", "tanque", "mangueira", "regulador", "pressao", "diesel", "comum", "rail"],
  filtro: ["filtro", "ar", "oleo", "combustivel", "cabine", "separador", "agua", "secador", "elemento"],
  pneu: ["pneu", "roda", "aro", "calota", "camara", "valvula", "parafuso", "porca"],
  acoplamento: ["acoplamento", "cardan", "cruzeta", "flange", "junta", "homocinetica", "semieixo", "tulipa"],
  refrigeracao: ["refrigeracao", "ar condicionado", "compressor", "condensador", "evaporador", "filtro", "secador", "valvula", "expansao", "mangueira"],
};

function flattenCategoryTree(tree: CategoryNode[], parentSlug: string | null = null, parentPath: string = "", depth: number = 0): FlatCategory[] {
  var result: FlatCategory[] = [];
  for (var i = 0; i < tree.length; i++) {
    var node = tree[i];
    var fullPath = parentPath ? parentPath + " > " + node.name : node.name;
    var words = extractWords(node.name);
    var expandedKeywords = words.slice();
    for (var wi = 0; wi < words.length; wi++) {
      var w = words[wi];
      for (var expKey in KEYWORD_EXPANSIONS) {
        if (w === expKey || w === expKey + "s" || expKey.indexOf(w) === 0 || w.indexOf(expKey) === 0) {
          var expWords = KEYWORD_EXPANSIONS[expKey];
          for (var ew = 0; ew < expWords.length; ew++) {
            if (expandedKeywords.indexOf(expWords[ew]) === -1) expandedKeywords.push(expWords[ew]);
          }
        }
      }
    }
    result.push({ slug: node.slug, name: node.name, fullPath, keywords: expandedKeywords, depth, parentSlug });
    if (node.children && node.children.length > 0) {
      var childResults = flattenCategoryTree(node.children, node.slug, fullPath, depth + 1);
      for (var ci = 0; ci < childResults.length; ci++) result.push(childResults[ci]);
    }
  }
  return result;
}

function scoreProduct(productText: string, productWords: string[], category: FlatCategory): { score: number; matched: string[] } {
  var matched: string[] = [];
  for (var ki = 0; ki < category.keywords.length; ki++) {
    if (productText.indexOf(category.keywords[ki]) !== -1) matched.push(category.keywords[ki]);
  }
  if (matched.length === 0) return { score: 0, matched: [] };
  var nameWords = extractWords(category.name);
  var nameMatched = 0;
  for (var ni = 0; ni < nameWords.length; ni++) {
    if (productText.indexOf(nameWords[ni]) !== -1) nameMatched++;
  }
  var nameScore = nameWords.length > 0 ? (nameMatched / nameWords.length) * 100 : 0;
  var expansionBonus = Math.min((matched.length - nameMatched) * 3, 20);
  var depthBonus = Math.min(category.depth * 5, 10);
  var exactBonus = 0;
  for (var ei = 0; ei < nameWords.length; ei++) {
    for (var pi = 0; pi < productWords.length; pi++) {
      if (productWords[pi] === nameWords[ei]) { exactBonus += 8; break; }
    }
  }
  exactBonus = Math.min(exactBonus, 20);
  return { score: Math.min(Math.round(nameScore + expansionBonus + depthBonus + exactBonus), 100), matched };
}

function findCategoryName(tree: CategoryNode[], slug: string): string {
  for (var i = 0; i < tree.length; i++) {
    if (tree[i].slug === slug) return tree[i].name;
    if (tree[i].children) { var f = findCategoryName(tree[i].children!, slug); if (f) return f; }
  }
  return "";
}

// ─── Component ───

export function AdminAutoCateg() {
  var [loading, setLoading] = useState(false);
  var [analyzing, setAnalyzing] = useState(false);
  var [error, setError] = useState("");
  var [progress, setProgress] = useState(0);
  var [totalProducts, setTotalProducts] = useState(0);
  var [processedCount, setProcessedCount] = useState(0);
  var [results, setResults] = useState<MatchResult[]>([]);
  var [confidenceThreshold, setConfidenceThreshold] = useState(50);
  var [applying, setApplying] = useState(false);
  var [applyResult, setApplyResult] = useState<{ applied: number; total: number; errors: string[] } | null>(null);
  var [searchTerm, setSearchTerm] = useState("");
  var [sortField, setSortField] = useState<SortField>("confidence");
  var [sortDir, setSortDir] = useState<SortDir>("desc");
  var [showOnlyNew, setShowOnlyNew] = useState(false);
  var [showOnlyUncategorized, setShowOnlyUncategorized] = useState(false);
  var [selectAll, setSelectAll] = useState(false);
  var [expandedRow, setExpandedRow] = useState<string | null>(null);
  var [statsCollapsed, setStatsCollapsed] = useState(false);
  var cancelRef = useRef(false);
  var [pageSize] = useState(50);
  var [currentPage, setCurrentPage] = useState(1);

  var startAnalysis = useCallback(async function () {
    setLoading(true); setError(""); setResults([]); setProgress(0); setProcessedCount(0); setApplyResult(null); cancelRef.current = false;
    try {
      var accessToken = await getValidAdminToken();
      if (!accessToken) { setError("Sessao expirada. Faca login novamente."); setLoading(false); return; }
      var data = await api.getAutoCategData(accessToken);
      if (!data || !data.products) { setError("Nenhum dado retornado pelo servidor."); setLoading(false); return; }
      setTotalProducts(data.products.length); setLoading(false); setAnalyzing(true);
      var flatCats = flattenCategoryTree(data.categoryTree);
      if (flatCats.length === 0) { setError("Nenhuma categoria encontrada. Cadastre categorias primeiro."); setAnalyzing(false); return; }
      var batchSize = 100;
      var allResults: MatchResult[] = [];
      var products = data.products;
      var metas = data.metas || {};
      var attrs = data.attributes || {};
      var processBatch = function (startIdx: number) {
        return new Promise<void>(function (resolve) {
          setTimeout(function () {
            var endIdx = Math.min(startIdx + batchSize, products.length);
            for (var pi = startIdx; pi < endIdx; pi++) {
              if (cancelRef.current) break;
              var prod = products[pi]; var meta = metas[prod.sku] || {}; var prodAttrs = attrs[prod.sku] || {};
              var textParts = [prod.titulo];
              for (var attrKey in prodAttrs) {
                var attrVal = prodAttrs[attrKey];
                if (Array.isArray(attrVal)) textParts.push(attrVal.join(" "));
                else if (typeof attrVal === "string") textParts.push(attrVal);
              }
              var productText = normalizeText(textParts.join(" "));
              var productWords = productText.split(" ").filter(function (w) { return w.length > 1; });
              var bestScore = 0; var bestCat: FlatCategory | null = null; var bestMatched: string[] = [];
              for (var ci = 0; ci < flatCats.length; ci++) {
                var result = scoreProduct(productText, productWords, flatCats[ci]);
                if (result.score > bestScore) { bestScore = result.score; bestCat = flatCats[ci]; bestMatched = result.matched; }
              }
              var currentCatSlug = meta.category || "";
              var currentCatName = currentCatSlug ? findCategoryName(data.categoryTree, currentCatSlug) || currentCatSlug : "(Sem categoria)";
              allResults.push({
                sku: prod.sku, titulo: prod.titulo, currentCategory: currentCatSlug, currentCategoryName: currentCatName,
                suggestedCategory: bestCat ? bestCat.slug : "", suggestedCategoryName: bestCat ? bestCat.name : "(Nenhuma sugestao)",
                suggestedFullPath: bestCat ? bestCat.fullPath : "", confidence: bestScore, matchedKeywords: bestMatched,
                alreadyCorrect: bestCat ? bestCat.slug === currentCatSlug : false, hasAttributes: Object.keys(prodAttrs).length > 0,
                selected: !(bestCat && bestCat.slug === currentCatSlug) && bestScore >= 50,
              });
            }
            setProcessedCount(endIdx); setProgress(Math.round((endIdx / products.length) * 100)); resolve();
          }, 0);
        });
      };
      for (var bi = 0; bi < products.length; bi += batchSize) { if (cancelRef.current) break; await processBatch(bi); }
      setResults(allResults); setAnalyzing(false);
    } catch (e: any) {
      console.error("Auto-categorize error:", e); setError("Erro ao analisar: " + (e.message || String(e))); setLoading(false); setAnalyzing(false);
    }
  }, []);

  var cancelAnalysis = useCallback(function () { cancelRef.current = true; }, []);

  var applySelected = useCallback(async function () {
    var toApply = results.filter(function (r) { return r.selected && !r.alreadyCorrect && r.confidence >= confidenceThreshold && r.suggestedCategory; });
    if (toApply.length === 0) { setError("Nenhum produto selecionado para aplicar."); return; }
    setApplying(true); setApplyResult(null); setError("");
    try {
      var accessToken = await getValidAdminToken();
      if (!accessToken) { setError("Sessao expirada."); setApplying(false); return; }
      var totalApplied = 0; var totalErrors: string[] = []; var bSize = 100;
      for (var bi = 0; bi < toApply.length; bi += bSize) {
        var batch = toApply.slice(bi, bi + bSize).map(function (r) { return { sku: r.sku, category: r.suggestedCategory }; });
        var res = await api.applyAutoCateg(accessToken, batch);
        totalApplied += res.applied;
        if (res.errors) for (var ei = 0; ei < res.errors.length; ei++) totalErrors.push(res.errors[ei]);
      }
      setApplyResult({ applied: totalApplied, total: toApply.length, errors: totalErrors });
      setResults(function (prev) {
        return prev.map(function (r) {
          if (r.selected && !r.alreadyCorrect && r.confidence >= confidenceThreshold && r.suggestedCategory) {
            return { ...r, currentCategory: r.suggestedCategory, currentCategoryName: r.suggestedCategoryName, alreadyCorrect: true, selected: false };
          }
          return r;
        });
      });
    } catch (e: any) { console.error("Apply error:", e); setError("Erro ao aplicar: " + (e.message || String(e))); }
    setApplying(false);
  }, [results, confidenceThreshold]);

  var toggleSelection = useCallback(function (sku: string) {
    setResults(function (prev) { return prev.map(function (r) { if (r.sku === sku) return { ...r, selected: !r.selected }; return r; }); });
  }, []);

  var handleSelectAll = useCallback(function (checked: boolean) {
    setSelectAll(checked);
    setResults(function (prev) { return prev.map(function (r) { if (r.alreadyCorrect || r.confidence < confidenceThreshold) return r; return { ...r, selected: checked }; }); });
  }, [confidenceThreshold]);

  var filteredResults = useMemo(function () {
    var filtered = results.filter(function (r) {
      if (showOnlyNew && r.alreadyCorrect) return false;
      if (showOnlyUncategorized && r.currentCategory) return false;
      if (r.confidence < confidenceThreshold) return false;
      if (searchTerm) { var t = normalizeText(searchTerm); if (normalizeText(r.sku + " " + r.titulo + " " + r.suggestedCategoryName).indexOf(t) === -1) return false; }
      return true;
    });
    filtered.sort(function (a, b) {
      var aV: any, bV: any;
      if (sortField === "confidence") { aV = a.confidence; bV = b.confidence; }
      else if (sortField === "sku") { aV = a.sku; bV = b.sku; }
      else if (sortField === "titulo") { aV = a.titulo; bV = b.titulo; }
      else { aV = a.suggestedCategoryName; bV = b.suggestedCategoryName; }
      if (typeof aV === "number") return sortDir === "asc" ? aV - bV : bV - aV;
      return sortDir === "asc" ? String(aV).localeCompare(String(bV)) : String(bV).localeCompare(String(aV));
    });
    return filtered;
  }, [results, searchTerm, sortField, sortDir, showOnlyNew, showOnlyUncategorized, confidenceThreshold]);

  var paginatedResults = useMemo(function () {
    return filteredResults.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [filteredResults, currentPage, pageSize]);

  var totalPages = Math.ceil(filteredResults.length / pageSize);

  useEffect(function () { setCurrentPage(1); }, [searchTerm, sortField, sortDir, showOnlyNew, showOnlyUncategorized, confidenceThreshold]);

  var stats = useMemo(function () {
    if (results.length === 0) return null;
    var total = results.length;
    var alreadyCorrect = results.filter(function (r) { return r.alreadyCorrect; }).length;
    var uncategorized = results.filter(function (r) { return !r.currentCategory; }).length;
    var above90 = results.filter(function (r) { return r.confidence >= 90; }).length;
    var above70 = results.filter(function (r) { return r.confidence >= 70; }).length;
    var above50 = results.filter(function (r) { return r.confidence >= 50; }).length;
    var withAttrs = results.filter(function (r) { return r.hasAttributes; }).length;
    var selected = results.filter(function (r) { return r.selected && !r.alreadyCorrect && r.confidence >= confidenceThreshold; }).length;
    return { total, alreadyCorrect, uncategorized, above90, above70, above50, withAttrs, selected };
  }, [results, confidenceThreshold]);

  var toggleSort = function (field: SortField) {
    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir(field === "confidence" ? "desc" : "asc"); }
  };

  var SortIcon = function ({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronDown className="w-3 h-3 text-gray-400" />;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3 text-red-600" /> : <ChevronDown className="w-3 h-3 text-red-600" />;
  };

  var getConfColor = function (s: number) { return s >= 80 ? "text-green-600" : s >= 60 ? "text-yellow-600" : s >= 40 ? "text-orange-500" : "text-red-500"; };
  var getConfBg = function (s: number) { return s >= 80 ? "bg-green-50 border-green-200" : s >= 60 ? "bg-yellow-50 border-yellow-200" : s >= 40 ? "bg-orange-50 border-orange-200" : "bg-red-50 border-red-200"; };

  var exportCSV = function () {
    var header = "SKU;Titulo;Categoria Atual;Categoria Sugerida;Caminho Completo;Confianca;Palavras-chave;Ja Correto\n";
    var rows = filteredResults.map(function (r) {
      return [r.sku, '"' + r.titulo.replace(/"/g, '""') + '"', r.currentCategoryName, r.suggestedCategoryName, r.suggestedFullPath, r.confidence + "%", '"' + r.matchedKeywords.join(", ") + '"', r.alreadyCorrect ? "Sim" : "Nao"].join(";");
    });
    var blob = new Blob(["\uFEFF" + header + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a"); a.href = url; a.download = "auto-categorizacao-" + new Date().toISOString().slice(0, 10) + ".csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-gray-900 flex items-center gap-2" style={{ fontSize: "1.15rem", fontWeight: 700 }}>
            <Zap className="w-5 h-5 text-amber-500" />
            Auto-Categorizacao Inteligente
          </h2>
          <p className="text-gray-500 mt-1" style={{ fontSize: "0.82rem" }}>
            Analisa nome e ficha tecnica de todos os produtos e sugere a categoria mais adequada.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {results.length > 0 && (
            <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors" style={{ fontSize: "0.8rem" }}>
              <Download className="w-4 h-4" /> Exportar CSV
            </button>
          )}
          {analyzing ? (
            <button onClick={cancelAnalysis} className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors" style={{ fontSize: "0.85rem" }}>
              <X className="w-4 h-4" /> Cancelar
            </button>
          ) : (
            <button onClick={startAnalysis} disabled={loading} className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50" style={{ fontSize: "0.85rem" }}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : results.length > 0 ? <RefreshCw className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {loading ? "Carregando dados..." : results.length > 0 ? "Reanalisar" : "Iniciar Analise"}
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-red-700 font-medium" style={{ fontSize: "0.85rem" }}>Erro</p>
            <p className="text-red-600 mt-0.5" style={{ fontSize: "0.82rem" }}>{error}</p>
          </div>
        </div>
      )}

      {/* Progress */}
      {(loading || analyzing) && (
        <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
              <span className="text-gray-700 font-medium" style={{ fontSize: "0.9rem" }}>
                {loading ? "Buscando dados do servidor..." : "Analisando produtos..."}
              </span>
            </div>
            {analyzing && <span className="text-gray-500" style={{ fontSize: "0.85rem" }}>{processedCount.toLocaleString("pt-BR")} / {totalProducts.toLocaleString("pt-BR")}</span>}
          </div>
          {analyzing && (
            <>
              <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                <div className="bg-gradient-to-r from-amber-500 to-amber-400 h-3 rounded-full transition-all duration-300" style={{ width: progress + "%" }} />
              </div>
              <p className="text-gray-400 text-xs mt-2 text-right">{progress}%</p>
            </>
          )}
        </div>
      )}

      {/* Apply Result */}
      {applyResult && (
        <div className={"rounded-xl p-4 flex items-start gap-3 " + (applyResult.errors.length > 0 ? "bg-yellow-50 border border-yellow-200" : "bg-green-50 border border-green-200")}>
          <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-green-700 font-medium" style={{ fontSize: "0.85rem" }}>Categorizacao aplicada: {applyResult.applied} de {applyResult.total} produtos</p>
            {applyResult.errors.length > 0 && (
              <div className="mt-2">
                <p className="text-yellow-700 text-xs font-medium">{applyResult.errors.length} erro(s):</p>
                <ul className="text-yellow-600 text-xs mt-1 space-y-0.5 max-h-20 overflow-y-auto">
                  {applyResult.errors.slice(0, 10).map(function (err, idx) { return <li key={idx}>- {err}</li>; })}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <button onClick={function () { setStatsCollapsed(!statsCollapsed); }} className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-red-600" />
              <span className="text-gray-800 font-semibold" style={{ fontSize: "0.9rem" }}>Resumo da Analise</span>
            </div>
            {statsCollapsed ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
          </button>
          {!statsCollapsed && (
            <div className="px-5 pb-5 pt-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-gray-900">{stats.total.toLocaleString("pt-BR")}</p>
                <p className="text-gray-500 text-xs mt-0.5">Total de Produtos</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-green-600">{stats.alreadyCorrect.toLocaleString("pt-BR")}</p>
                <p className="text-gray-500 text-xs mt-0.5">Ja Corretos</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-amber-600">{stats.uncategorized.toLocaleString("pt-BR")}</p>
                <p className="text-gray-500 text-xs mt-0.5">Sem Categoria</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-600">{stats.withAttrs.toLocaleString("pt-BR")}</p>
                <p className="text-gray-500 text-xs mt-0.5">Com Ficha Tecnica</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-purple-600">{stats.selected.toLocaleString("pt-BR")}</p>
                <p className="text-gray-500 text-xs mt-0.5">Selecionados</p>
              </div>
              <div className="col-span-2 sm:col-span-3 lg:col-span-5 mt-1">
                <p className="text-gray-500 text-xs font-semibold mb-2 uppercase tracking-wider">Distribuicao de Confianca</p>
                <div className="grid grid-cols-4 gap-2">
                  <div className="flex items-center gap-2 bg-green-50 rounded-lg px-3 py-2 border border-green-100">
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                    <span className="text-green-700 text-sm font-semibold">{stats.above90.toLocaleString("pt-BR")}</span>
                    <span className="text-gray-500 text-xs">&ge; 90%</span>
                  </div>
                  <div className="flex items-center gap-2 bg-yellow-50 rounded-lg px-3 py-2 border border-yellow-100">
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                    <span className="text-yellow-700 text-sm font-semibold">{(stats.above70 - stats.above90).toLocaleString("pt-BR")}</span>
                    <span className="text-gray-500 text-xs">70-89%</span>
                  </div>
                  <div className="flex items-center gap-2 bg-orange-50 rounded-lg px-3 py-2 border border-orange-100">
                    <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                    <span className="text-orange-700 text-sm font-semibold">{(stats.above50 - stats.above70).toLocaleString("pt-BR")}</span>
                    <span className="text-gray-500 text-xs">50-69%</span>
                  </div>
                  <div className="flex items-center gap-2 bg-red-50 rounded-lg px-3 py-2 border border-red-100">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    <span className="text-red-700 text-sm font-semibold">{(stats.total - stats.above50).toLocaleString("pt-BR")}</span>
                    <span className="text-gray-500 text-xs">&lt; 50%</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      {results.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
          {/* Threshold Slider */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-gray-700 font-medium flex items-center gap-1.5" style={{ fontSize: "0.85rem" }}>
                <Filter className="w-4 h-4 text-amber-500" /> Confianca Minima para Aplicar
              </label>
              <span className={"text-lg font-bold " + getConfColor(confidenceThreshold)}>{confidenceThreshold}%</span>
            </div>
            <input type="range" min={0} max={100} step={5} value={confidenceThreshold}
              onChange={function (e) { setConfidenceThreshold(parseInt(e.target.value, 10)); }}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-amber-500" />
            <div className="flex justify-between text-xs text-gray-400 mt-1 px-0.5"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input type="text" value={searchTerm} onChange={function (e) { setSearchTerm(e.target.value); }}
                placeholder="Buscar por SKU, nome ou categoria..."
                className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-800 text-sm placeholder-gray-400 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 outline-none" />
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button onClick={function () { setShowOnlyNew(!showOnlyNew); }}
                className={"flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors border " + (showOnlyNew ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-gray-50 border-gray-200 text-gray-500 hover:text-gray-700")}>
                {showOnlyNew ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />} Apenas Novos
              </button>
              <button onClick={function () { setShowOnlyUncategorized(!showOnlyUncategorized); }}
                className={"flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors border " + (showOnlyUncategorized ? "bg-purple-50 border-purple-200 text-purple-700" : "bg-gray-50 border-gray-200 text-gray-500 hover:text-gray-700")}>
                <FolderTree className="w-3.5 h-3.5" /> Sem Categoria
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={selectAll} onChange={function (e) { handleSelectAll(e.target.checked); }}
                  className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500 cursor-pointer accent-amber-500" />
                <span className="text-gray-600 text-sm">Selecionar Todos ({filteredResults.filter(function (r) { return !r.alreadyCorrect; }).length})</span>
              </label>
              <span className="text-gray-300">|</span>
              <span className="text-gray-500 text-sm">{filteredResults.length.toLocaleString("pt-BR")} resultados</span>
            </div>
            <button onClick={applySelected} disabled={applying || !stats || stats.selected === 0}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {applying ? "Aplicando..." : "Aplicar " + (stats ? stats.selected : 0) + " Selecionados"}
            </button>
          </div>
        </div>
      )}

      {/* Results Table */}
      {results.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-3 py-3 text-left w-10">
                    <input type="checkbox" checked={selectAll} onChange={function (e) { handleSelectAll(e.target.checked); }}
                      className="w-3.5 h-3.5 rounded border-gray-300 accent-amber-500 cursor-pointer" />
                  </th>
                  <th className="px-3 py-3 text-left text-gray-500 font-semibold cursor-pointer hover:text-gray-800 select-none" style={{ fontSize: "0.78rem" }}
                    onClick={function () { toggleSort("sku"); }}>
                    <div className="flex items-center gap-1">SKU <SortIcon field="sku" /></div>
                  </th>
                  <th className="px-3 py-3 text-left text-gray-500 font-semibold cursor-pointer hover:text-gray-800 select-none" style={{ fontSize: "0.78rem" }}
                    onClick={function () { toggleSort("titulo"); }}>
                    <div className="flex items-center gap-1">Produto <SortIcon field="titulo" /></div>
                  </th>
                  <th className="px-3 py-3 text-left text-gray-500 font-semibold" style={{ fontSize: "0.78rem" }}>Atual</th>
                  <th className="px-3 py-3 text-left text-gray-500 font-semibold cursor-pointer hover:text-gray-800 select-none" style={{ fontSize: "0.78rem" }}
                    onClick={function () { toggleSort("suggestedCategoryName"); }}>
                    <div className="flex items-center gap-1">Sugestao <SortIcon field="suggestedCategoryName" /></div>
                  </th>
                  <th className="px-3 py-3 text-center text-gray-500 font-semibold cursor-pointer hover:text-gray-800 select-none w-20" style={{ fontSize: "0.78rem" }}
                    onClick={function () { toggleSort("confidence"); }}>
                    <div className="flex items-center gap-1 justify-center">% <SortIcon field="confidence" /></div>
                  </th>
                  <th className="px-3 py-3 text-center text-gray-400 font-semibold w-10"><Info className="w-3.5 h-3.5 inline" /></th>
                </tr>
              </thead>
              <tbody>
                {paginatedResults.flatMap(function (r) {
                  var isExp = expandedRow === r.sku;
                  var rows = [
                    <tr key={r.sku} className={"hover:bg-gray-50 transition-colors" + (isExp ? " bg-gray-50" : "")}>
                        <td className="px-3 py-2.5 border-b border-gray-100">
                          {r.alreadyCorrect ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : (
                            <input type="checkbox" checked={r.selected} onChange={function () { toggleSelection(r.sku); }}
                              className="w-3.5 h-3.5 rounded border-gray-300 accent-amber-500 cursor-pointer" />
                          )}
                        </td>
                        <td className="px-3 py-2.5 border-b border-gray-100">
                          <span className="text-gray-500 font-mono" style={{ fontSize: "0.72rem" }}>{r.sku}</span>
                        </td>
                        <td className="px-3 py-2.5 border-b border-gray-100 max-w-xs">
                          <p className="text-gray-800 truncate" style={{ fontSize: "0.82rem" }} title={r.titulo}>{r.titulo}</p>
                          {r.hasAttributes && (
                            <span className="inline-block mt-0.5 px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded font-medium" style={{ fontSize: "0.6rem" }}>Ficha Tecnica</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 border-b border-gray-100">
                          <span className={r.currentCategory ? "text-gray-500" : "text-gray-400 italic"} style={{ fontSize: "0.78rem" }}>{r.currentCategoryName}</span>
                        </td>
                        <td className="px-3 py-2.5 border-b border-gray-100">
                          {r.alreadyCorrect ? (
                            <span className="text-green-600 flex items-center gap-1" style={{ fontSize: "0.78rem" }}><CheckCircle2 className="w-3 h-3" /> Ja correto</span>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <ArrowRight className="w-3 h-3 text-amber-500 shrink-0" />
                              <span className="text-amber-700 font-medium" style={{ fontSize: "0.78rem" }}>{r.suggestedCategoryName}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 border-b border-gray-100 text-center">
                          <span className={"inline-flex items-center justify-center px-2 py-0.5 rounded-full font-bold border " + getConfBg(r.confidence) + " " + getConfColor(r.confidence)} style={{ fontSize: "0.72rem" }}>
                            {r.confidence}%
                          </span>
                        </td>
                        <td className="px-3 py-2.5 border-b border-gray-100 text-center">
                          <button onClick={function () { setExpandedRow(isExp ? null : r.sku); }} className="text-gray-400 hover:text-gray-700 transition-colors p-1" title="Ver detalhes">
                            {isExp ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </td>
                    </tr>
                  ];
                  if (isExp) {
                    rows.push(
                      <tr key={r.sku + "-detail"}>
                        <td colSpan={7} className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                            <div>
                              <p className="text-gray-500 font-semibold mb-1">Caminho Completo Sugerido</p>
                              <p className="text-gray-700">{r.suggestedFullPath || "-"}</p>
                            </div>
                            <div>
                              <p className="text-gray-500 font-semibold mb-1">Palavras-chave Encontradas</p>
                              <div className="flex flex-wrap gap-1">
                                {r.matchedKeywords.length > 0 ? r.matchedKeywords.map(function (kw, ki) {
                                  return <span key={ki} className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded" style={{ fontSize: "0.68rem" }}>{kw}</span>;
                                }) : <span className="text-gray-400 italic">Nenhuma</span>}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  return rows;
                })}
                {paginatedResults.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Nenhum resultado encontrado com os filtros atuais.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
              <span className="text-gray-500 text-xs">Pagina {currentPage} de {totalPages} ({filteredResults.length.toLocaleString("pt-BR")} resultados)</span>
              <div className="flex items-center gap-1">
                <button onClick={function () { setCurrentPage(1); }} disabled={currentPage === 1}
                  className="px-2 py-1 text-xs text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed">Primeira</button>
                <button onClick={function () { setCurrentPage(Math.max(1, currentPage - 1)); }} disabled={currentPage === 1}
                  className="px-2 py-1 text-xs text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed">Anterior</button>
                {Array.from({ length: Math.min(5, totalPages) }, function (_, i) {
                  var startPage = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
                  var page = startPage + i;
                  if (page > totalPages) return null;
                  return (
                    <button key={page} onClick={function () { setCurrentPage(page); }}
                      className={"px-2.5 py-1 text-xs rounded " + (page === currentPage ? "bg-red-600 text-white" : "text-gray-500 hover:text-gray-900 hover:bg-gray-200")}>
                      {page}
                    </button>
                  );
                })}
                <button onClick={function () { setCurrentPage(Math.min(totalPages, currentPage + 1)); }} disabled={currentPage === totalPages}
                  className="px-2 py-1 text-xs text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed">Proxima</button>
                <button onClick={function () { setCurrentPage(totalPages); }} disabled={currentPage === totalPages}
                  className="px-2 py-1 text-xs text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed">Ultima</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!loading && !analyzing && results.length === 0 && !error && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <FolderTree className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-gray-700 text-lg font-semibold mb-2">Pronto para Analisar</h3>
          <p className="text-gray-500 text-sm max-w-lg mx-auto mb-6">
            Clique em <strong className="text-amber-600">Iniciar Analise</strong> para que o sistema analise o nome e a ficha tecnica de todos os produtos,
            cruzando com as categorias existentes para sugerir a melhor alocacao automaticamente.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-sm">
            <div className="flex items-center gap-2 text-gray-500"><div className="w-3 h-3 rounded-full bg-green-500" /><span>&ge; 80% = Alta confianca</span></div>
            <div className="flex items-center gap-2 text-gray-500"><div className="w-3 h-3 rounded-full bg-yellow-500" /><span>60-79% = Media</span></div>
            <div className="flex items-center gap-2 text-gray-500"><div className="w-3 h-3 rounded-full bg-orange-500" /><span>40-59% = Baixa</span></div>
            <div className="flex items-center gap-2 text-gray-500"><div className="w-3 h-3 rounded-full bg-red-500" /><span>&lt; 40% = Incerta</span></div>
          </div>
        </div>
      )}
    </div>
  );
}