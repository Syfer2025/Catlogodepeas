/**
 * SEARCH AUTOCOMPLETE — Campo de busca com autocomplete, historico e sugestoes.
 * Debounce de 300ms; consulta GET /produtos/autocomplete; mostra resultados com
 * imagem, titulo e SKU. Historico salvo em localStorage (max 5). Versoes: header e mobile.
 * Prefetch: ao selecionar, prefetcha chunk do catalogo e detalhe do produto.
 */
import { useState, useEffect, useRef, useCallback, startTransition, useId } from "react";
import { useNavigate } from "react-router";
import DOMPurify from "dompurify";
import { Search, X, Clock, ChevronRight, Trash2, Loader2, Package, ArrowRight, Hash, Sparkles, CornerDownLeft, Layers, Tag } from "lucide-react";
import "../utils/emptyStateAnimations";
import { prefetchCatalog, prefetchProductDetail } from "../utils/prefetch";
import * as api from "../services/api";
import type { AutocompleteResult } from "../services/api";
import { ProductImage } from "./ProductImage";
import { useGA4 } from "./GA4Provider";
import { useHomepageInit } from "../contexts/HomepageInitContext";

// ── Search History (localStorage) ──
var SEARCH_HISTORY_KEY = "carretao_search_history";
var MAX_HISTORY = 5;
var DISCOVERY_CATEGORY_LIMIT = 4;
var DISCOVERY_BRAND_LIMIT = 5;
var DESKTOP_EXAMPLE_SEARCHES = ["amortecedor", "pastilha de freio", "filtro de oleo", "rolamento"];
var MOBILE_EXAMPLE_SEARCHES = ["filtro", "suspensao", "freio", "rolamento"];

function dedupeStrings(values: string[]): string[] {
  var seen = new Set<string>();
  var out: string[] = [];
  for (var i = 0; i < values.length; i++) {
    var value = (values[i] || "").trim();
    var key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function getSearchHistory(): string[] {
  try {
    var raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    if (!raw) return [];
    var parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(function (s: any) { return typeof s === "string" && s.trim().length > 0; });
  } catch { return []; }
}

function saveSearchHistory(term: string): void {
  try {
    var history = getSearchHistory().filter(function (s) { return s !== term; });
    history.unshift(term);
    if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
  } catch {}
}

function clearSearchHistory(): void {
  try { localStorage.removeItem(SEARCH_HISTORY_KEY); } catch {}
}

interface SearchAutocompleteProps {
  variant?: "header" | "mobile";
  onSelect?: () => void;
  placeholder?: string;
}

export function SearchAutocomplete({
  variant = "header",
  onSelect,
  placeholder = "Buscar peças por nome ou código...",
}: SearchAutocompleteProps) {
  const isMobileVariant = variant === "mobile";
  const resolvedPlaceholder = placeholder || (isMobileVariant ? "Peça, marca ou código..." : "Buscar peças por nome, marca ou código...");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AutocompleteResult[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [hasSearched, setHasSearched] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<string[]>([]);

  const { trackEvent } = useGA4();
  const { data: initData } = useHomepageInit();
  const navigate = useNavigate();
  const inputId = useId();
  const dropdownId = inputId + "-dropdown";
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressHistoryRef = useRef(false);
  const lastTrackedNoResultRef = useRef("");

  const popularCategories = (initData?.homepageCategories || []).slice(0, DISCOVERY_CATEGORY_LIMIT);
  const popularBrands = dedupeStrings(
    (initData?.brands || [])
      .slice()
      .sort(function (a, b) { return (b.products?.length || 0) - (a.products?.length || 0); })
      .map(function (brand) { return brand.name || ""; })
  ).slice(0, DISCOVERY_BRAND_LIMIT);
  const exampleTerms = isMobileVariant ? MOBILE_EXAMPLE_SEARCHES : DESKTOP_EXAMPLE_SEARCHES;

  const closeDropdown = useCallback(function () {
    setIsOpen(false);
    setShowHistory(false);
    setActiveIndex(-1);
  }, []);

  const openDiscovery = useCallback(function (focusInput = false) {
    var history = getSearchHistory();
    setHistoryItems(history);
    setShowHistory(true);
    setResults([]);
    setTotalMatches(0);
    setHasSearched(false);
    setActiveIndex(-1);
    setIsOpen(true);
    if (focusInput) inputRef.current?.focus();
  }, []);

  const trackAutocompleteEvent = useCallback(function (eventName: string, params?: Record<string, any>) {
    trackEvent(eventName, {
      search_surface: variant,
      ...(params || {}),
    });
  }, [trackEvent, variant]);

  const resetAfterNavigation = useCallback(function () {
    setQuery("");
    setIsOpen(false);
    setShowHistory(false);
    setResults([]);
    setTotalMatches(0);
    setHasSearched(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
    onSelect?.();
  }, [onSelect]);

  const goToCatalog = useCallback(function (termOverride?: string, options?: { source?: string; categoriaSlug?: string }) {
    var term = (termOverride !== undefined ? termOverride : query).trim();
    var categoriaSlug = options?.categoriaSlug || "";

    if (!term && !categoriaSlug) return;

    if (term.length >= 2) saveSearchHistory(term);
    if (options?.source) {
      trackAutocompleteEvent("autocomplete_select", {
        source: options.source,
        search_term: term || undefined,
        category_slug: categoriaSlug || undefined,
      });
    }

    suppressHistoryRef.current = true;
    startTransition(function () {
      var params = new URLSearchParams();
      if (term) params.set("busca", term);
      if (categoriaSlug) params.set("categoria", categoriaSlug);
      navigate("/catalogo" + (params.toString() ? "?" + params.toString() : ""));
    });
    resetAfterNavigation();
  }, [navigate, query, resetAfterNavigation, trackAutocompleteEvent]);

  const goToProduct = useCallback(function (sku: string, source = "autocomplete_result") {
    var term = query.trim();
    var selectedItem = results.find(function (item) { return item.sku === sku; }) || null;

    if (term.length >= 2) saveSearchHistory(term);
    trackAutocompleteEvent("autocomplete_select", {
      source: source,
      search_term: term || undefined,
      item_id: sku,
      item_name: selectedItem?.titulo || undefined,
    });
    trackAutocompleteEvent("select_item", {
      item_list_id: "header_autocomplete",
      item_list_name: "Busca do topo",
      items: [{ item_id: sku, item_name: selectedItem?.titulo || sku }],
    });

    suppressHistoryRef.current = true;
    startTransition(function () { navigate("/produto/" + encodeURIComponent(sku)); });
    resetAfterNavigation();
  }, [navigate, query, resetAfterNavigation, results, trackAutocompleteEvent]);

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    var trimmedQuery = q.trim();

    if (trimmedQuery.length < 2) {
      abortControllerRef.current = null;
      setResults([]);
      setTotalMatches(0);
      setHasSearched(false);
      setLoading(false);

      if (trimmedQuery.length === 0 && !suppressHistoryRef.current && document.activeElement === inputRef.current) {
        openDiscovery(false);
      } else {
        suppressHistoryRef.current = false;
        closeDropdown();
      }
      return;
    }

    setShowHistory(false);

    var controller = new AbortController();
    abortControllerRef.current = controller;
    setLoading(true);

    try {
      const data = await api.autocomplete(trimmedQuery, isMobileVariant ? 6 : 8, {
        signal: controller.signal,
      });

      if (abortControllerRef.current !== controller || controller.signal.aborted) {
        return;
      }

      setResults(data.results);
      setTotalMatches(data.totalMatches);
      setIsOpen(true);
      setHasSearched(true);
      setActiveIndex(-1);

      if (data.results.length === 0) {
        var zeroResultKey = variant + "::" + trimmedQuery.toLowerCase();
        if (lastTrackedNoResultRef.current !== zeroResultKey) {
          lastTrackedNoResultRef.current = zeroResultKey;
          trackAutocompleteEvent("autocomplete_no_result", {
            search_term: trimmedQuery,
          });
        }
      } else {
        lastTrackedNoResultRef.current = "";
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("Autocomplete error:", err);
        if (abortControllerRef.current === controller) {
          setResults([]);
          setTotalMatches(0);
          setHasSearched(true);
          setIsOpen(true);
        }
      }
    } finally {
      if (abortControllerRef.current === controller) {
        setLoading(false);
      }
    }
  }, [closeDropdown, isMobileVariant, openDiscovery, trackAutocompleteEvent, variant]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  // Close on click/touch outside
  useEffect(() => {
    const handleClose = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    };
    document.addEventListener("mousedown", handleClose);
    document.addEventListener("touchstart", handleClose as EventListener);
    return () => {
      document.removeEventListener("mousedown", handleClose);
      document.removeEventListener("touchstart", handleClose as EventListener);
    };
  }, [closeDropdown]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "Enter") {
        e.preventDefault();
        goToCatalog(undefined, { source: "submit_closed" });
      }
      return;
    }

    // When showing history, handle navigation within history items
    if (query.trim().length === 0 && showHistory && historyItems.length > 0 && results.length === 0) {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex(function (prev) { return (prev + 1) % historyItems.length; });
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex(function (prev) { return (prev - 1 + historyItems.length) % historyItems.length; });
          break;
        case "Enter":
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < historyItems.length) {
            goToCatalog(historyItems[activeIndex], { source: "recent_search" });
          }
          break;
        case "Escape":
          closeDropdown();
          inputRef.current?.blur();
          break;
      }
      return;
    }

    const totalItems = results.length + (results.length > 0 ? 1 : 0); // +1 for "ver todos"

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % totalItems);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + totalItems) % totalItems);
        break;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < results.length) {
          goToProduct(results[activeIndex].sku);
        } else {
          goToCatalog(undefined, { source: "view_all" });
        }
        break;
      case "Escape":
        closeDropdown();
        inputRef.current?.blur();
        break;
    }
  };

  const handleFocus = () => {
    prefetchCatalog();
    if (suppressHistoryRef.current) {
      suppressHistoryRef.current = false;
      return;
    }
    if (results.length > 0 && query.trim().length >= 2) {
      setIsOpen(true);
    } else if (query.trim().length < 2) {
      openDiscovery(false);
    }
  };

  const clearQuery = () => {
    suppressHistoryRef.current = false;
    setQuery("");
    openDiscovery(true);
  };

  // Highlight matching text — uses DOMPurify to sanitize the final HTML
  // before injection via dangerouslySetInnerHTML. Only <mark> with the
  // specific class is allowed; all other tags are stripped.
  const highlightMatch = (text: string, q: string): string => {
    const safeText = DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    if (!q.trim()) return safeText;
    const norm = q
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const textNorm = safeText
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    let raw: string;
    const idx = textNorm.indexOf(norm);
    if (idx === -1) {
      // Try each word
      const words = norm.split(/\s+/).filter((w) => w.length >= 2);
      raw = safeText;
      for (const word of words) {
        const wordIdx = raw
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .indexOf(word);
        if (wordIdx !== -1) {
          const before = raw.slice(0, wordIdx);
          const match = raw.slice(wordIdx, wordIdx + word.length);
          const after = raw.slice(wordIdx + word.length);
          raw = `${before}<mark>${match}</mark>${after}`;
          break;
        }
      }
    } else {
      const before = safeText.slice(0, idx);
      const match = safeText.slice(idx, idx + norm.length);
      const after = safeText.slice(idx + norm.length);
      raw = `${before}<mark>${match}</mark>${after}`;
    }

    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: ["mark"],
      ALLOWED_ATTR: ["class"],
    });
  };

  const matchLabel = (type: AutocompleteResult["matchType"]) => {
    switch (type) {
      case "exact":
        return null;
      case "sku":
        return { text: "SKU", color: "bg-blue-50 text-blue-600" };
      case "similar":
        return { text: "Similar", color: "bg-amber-50 text-amber-600" };
      case "fuzzy":
        return { text: "Sugestão", color: "bg-purple-50 text-purple-600" };
    }
  };

  /** Thumbnail with fallback to Package icon */
  function ResultThumb({ sku, isActive }: { sku: string; isActive: boolean }) {
    return (
      <ProductImage
        sku={sku}
        alt=""
        className={"w-10 h-10 rounded-lg object-contain shrink-0 border p-0.5 " +
          (isActive ? "border-red-200 bg-red-50" : "border-gray-200 bg-white")}
        fallback={
          <div
            className={"w-10 h-10 rounded-lg flex items-center justify-center shrink-0 " +
              (isActive ? "bg-red-100" : "bg-gray-100")}
          >
            <Package
              className={"w-4.5 h-4.5 " + (isActive ? "text-red-500" : "text-gray-400")}
            />
          </div>
        }
      />
    );
  }

  const discoveryPanel = (
    <div>
      {showHistory && historyItems.length > 0 && (
        <div>
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <span className="text-gray-400 flex items-center gap-1.5" style={{ fontSize: "0.75rem" }}>
              <Clock className="w-3 h-3" />
              Buscas recentes
            </span>
            <button
              type="button"
              onClick={function () {
                clearSearchHistory();
                setHistoryItems([]);
                setShowHistory(false);
              }}
              className="text-gray-400 hover:text-red-600 transition-colors flex items-center gap-1"
              style={{ fontSize: "0.7rem", fontWeight: 500 }}
            >
              <Trash2 className="w-3 h-3" />
              Limpar
            </button>
          </div>
          {historyItems.map(function (term, idx) {
            return (
              <button
                key={term + "-" + idx}
                type="button"
                onClick={function () { goToCatalog(term, { source: "recent_search" }); }}
                onMouseEnter={function () { setActiveIndex(idx); }}
                className={"w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors border-b border-gray-50 " +
                  (activeIndex === idx ? "bg-red-50" : "hover:bg-gray-50")}
              >
                <Clock className={"w-4 h-4 shrink-0 " + (activeIndex === idx ? "text-red-400" : "text-gray-300")} />
                <span className={"flex-1 truncate " + (activeIndex === idx ? "text-red-700" : "text-gray-700")} style={{ fontSize: "0.85rem" }}>
                  {term}
                </span>
                <ChevronRight className={"w-3.5 h-3.5 shrink-0 " + (activeIndex === idx ? "text-red-400" : "text-gray-300")} />
              </button>
            );
          })}
        </div>
      )}

      <div className={historyItems.length > 0 ? "border-t border-gray-100" : ""}>
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-1.5 text-gray-400" style={{ fontSize: "0.75rem" }}>
          <Sparkles className="w-3 h-3" />
          Buscas rápidas
        </div>
        <div className="px-4 py-3 flex flex-wrap gap-2">
          {exampleTerms.map(function (term) {
            return (
              <button
                key={term}
                type="button"
                onClick={function () { goToCatalog(term, { source: "quick_search" }); }}
                className={"rounded-full border border-gray-200 bg-white text-gray-700 hover:border-red-300 hover:text-red-700 transition-colors " +
                  (isMobileVariant ? "px-3.5 py-2" : "px-3 py-1.5")}
                style={{ fontSize: isMobileVariant ? "0.82rem" : "0.76rem", fontWeight: 600 }}
              >
                {term}
              </button>
            );
          })}
        </div>
      </div>

      {popularCategories.length > 0 && (
        <div className="border-t border-gray-100">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-1.5 text-gray-400" style={{ fontSize: "0.75rem" }}>
            <Layers className="w-3 h-3" />
            Categorias rápidas
          </div>
          <div className="px-4 py-3 flex flex-wrap gap-2">
            {popularCategories.map(function (item) {
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={function () {
                    goToCatalog(undefined, { source: "quick_category", categoriaSlug: item.categorySlug });
                  }}
                  className={"rounded-full border border-red-100 bg-red-50 text-red-700 hover:bg-red-100 transition-colors " +
                    (isMobileVariant ? "px-3.5 py-2" : "px-3 py-1.5")}
                  style={{ fontSize: isMobileVariant ? "0.82rem" : "0.76rem", fontWeight: 600 }}
                >
                  {item.categoryName || item.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {popularBrands.length > 0 && (
        <div className="border-t border-gray-100">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-1.5 text-gray-400" style={{ fontSize: "0.75rem" }}>
            <Tag className="w-3 h-3" />
            Marcas em alta
          </div>
          <div className="px-4 py-3 flex flex-wrap gap-2">
            {popularBrands.map(function (brand) {
              return (
                <button
                  key={brand}
                  type="button"
                  onClick={function () { goToCatalog(brand, { source: "quick_brand" }); }}
                  className={"rounded-full border border-gray-200 bg-white text-gray-700 hover:border-red-300 hover:text-red-700 transition-colors " +
                    (isMobileVariant ? "px-3.5 py-2" : "px-3 py-1.5")}
                  style={{ fontSize: isMobileVariant ? "0.82rem" : "0.76rem", fontWeight: 600 }}
                >
                  {brand}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div ref={containerRef} className="relative w-full" role="search">
      {/* Input */}
      <div
        className={`flex w-full border overflow-hidden transition-all ${
          isOpen
            ? isMobileVariant
              ? "border-red-400 ring-2 ring-red-100 rounded-2xl"
              : "border-red-400 ring-2 ring-red-100 rounded-t-lg rounded-b-none"
            : isMobileVariant
              ? "border-gray-300 rounded-2xl focus-within:ring-2 focus-within:ring-red-500 focus-within:border-red-500"
              : "border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-red-500 focus-within:border-red-500"
        }`}
      >
        <div className="flex-1 relative">
          <Search className={"absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none " + (isMobileVariant ? "w-4.5 h-4.5" : "w-4 h-4")} aria-hidden="true" />
          <label htmlFor={inputId} className="sr-only">Buscar peças por nome, marca ou código</label>
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            placeholder={resolvedPlaceholder}
            className={"w-full pl-10 pr-9 outline-none bg-gray-50 " + (isMobileVariant ? "py-3 text-[0.95rem]" : "py-2.5")}
            style={{ fontSize: isMobileVariant ? "0.95rem" : "0.9rem" }}
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={isOpen}
            aria-autocomplete="list"
            aria-controls={isOpen ? dropdownId : undefined}
            aria-label="Buscar peças"
          />
          {query && (
            <button
              type="button"
              onClick={clearQuery}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 rounded transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={function () { goToCatalog(undefined, { source: "submit_button" }); }}
          className={"bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition-colors shrink-0 " +
            (isMobileVariant ? "px-4 gap-1.5 min-w-[92px]" : "px-5")}
          aria-label="Buscar"
        >
          {loading ? (
            <Loader2 className="w-4.5 h-4.5 animate-spin" />
          ) : (
            <>
              <Search className="w-4.5 h-4.5" />
              {isMobileVariant && <span style={{ fontSize: "0.84rem", fontWeight: 700 }}>Buscar</span>}
            </>
          )}
        </button>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div
          id={dropdownId}
          className={"absolute top-full left-0 right-0 bg-white z-[100] overflow-hidden overflow-y-auto border " +
            (isMobileVariant
              ? "mt-2 rounded-2xl border-gray-200 shadow-[0_18px_54px_-20px_rgba(0,0,0,0.35)] max-h-[70vh]"
              : "border-t-0 border-red-400 rounded-b-lg shadow-xl max-h-[420px]")}
        >
          {query.trim().length === 0 && !loading ? (
            discoveryPanel
          ) : loading && results.length === 0 ? (
            <div className="flex items-center gap-3 px-4 py-5 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin text-red-500" />
              <span style={{ fontSize: "0.85rem" }}>Buscando peças...</span>
            </div>
          ) : results.length === 0 && hasSearched ? (
            <div className="px-4 py-7 text-center flex flex-col items-center">
              <div className="relative mb-3">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-gray-50 to-red-50 flex items-center justify-center">
                  <Search
                    className="w-7 h-7 text-gray-300"
                    style={{ animation: "es-shake 1.5s ease-in-out both" }}
                  />
                </div>
                <Sparkles
                  className="w-3 h-3 text-red-300 absolute -top-0.5 -right-0.5"
                  style={{ animation: "es-twinkle 2s ease-in-out infinite" }}
                />
              </div>
              <p className="text-gray-600 mb-0.5" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                Nenhum resultado
              </p>
              <p className="text-gray-400 mb-3 max-w-[220px]" style={{ fontSize: "0.78rem", lineHeight: 1.4 }}>
                {"Nenhuma peça encontrada para \"" + query + "\". Tente por marca, categoria ou SKU."}
              </p>
              <button
                type="button"
                onClick={function () { goToCatalog(undefined, { source: "no_result_view_all" }); }}
                className="text-red-600 hover:text-red-700 transition-colors flex items-center gap-1.5 mx-auto bg-red-50 hover:bg-red-100 px-4 py-2 rounded-lg"
                style={{ fontSize: "0.8rem", fontWeight: 600 }}
              >
                Buscar no catálogo completo
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <>
              {/* Results header */}
              {results.length > 0 && (
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-gray-400 flex items-center gap-1.5" style={{ fontSize: "0.75rem" }}>
                    <Sparkles className="w-3 h-3" />
                    {totalMatches} resultado{totalMatches !== 1 ? "s" : ""} encontrado{totalMatches !== 1 ? "s" : ""}
                  </span>
                  <span className="text-gray-400 hidden sm:flex items-center gap-1" style={{ fontSize: "0.7rem" }}>
                    <CornerDownLeft className="w-3 h-3" />
                    Enter para buscar
                  </span>
                </div>
              )}

              {/* Result items */}
              {results.map((item, idx) => {
                const label = matchLabel(item.matchType);
                return (
                  <button
                    key={item.sku}
                    type="button"
                    onClick={() => goToProduct(item.sku)}
                    onMouseEnter={() => { setActiveIndex(idx); prefetchProductDetail(); }}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors border-b border-gray-50 last:border-b-0 ${
                      activeIndex === idx
                        ? "bg-red-50"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <ResultThumb sku={item.sku} isActive={activeIndex === idx} />
                    <div className="flex-1 min-w-0">
                      <p
                        className={`truncate ${
                          activeIndex === idx ? "text-red-700" : "text-gray-800"
                        }`}
                        style={{ fontSize: "0.85rem", fontWeight: 500 }}
                        dangerouslySetInnerHTML={{
                          __html: highlightMatch(item.titulo, query)
                            .replace(
                              /<mark>/g,
                              '<mark class="bg-yellow-100 text-yellow-800 rounded-sm px-0.5 font-semibold" style="font-size:inherit">'
                            ),
                        }}
                      />
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="flex items-center gap-1 text-gray-400">
                          <Hash className="w-3 h-3" />
                          <span className="font-mono" style={{ fontSize: "0.72rem" }}>
                            {item.sku}
                          </span>
                        </span>
                        {label && (
                          <span
                            className={`px-1.5 py-0.5 rounded ${label.color}`}
                            style={{ fontSize: "0.6rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}
                          >
                            {label.text}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight
                      className={`w-4 h-4 shrink-0 ${
                        activeIndex === idx ? "text-red-400" : "text-gray-300"
                      }`}
                    />
                  </button>
                );
              })}

              {/* "Ver todos" footer */}
              {results.length > 0 && (
                <button
                  type="button"
                  onClick={function () { goToCatalog(undefined, { source: "view_all" }); }}
                  onMouseEnter={() => setActiveIndex(results.length)}
                  className={`w-full px-4 py-3 flex items-center justify-center gap-2 transition-colors ${
                    activeIndex === results.length
                      ? "bg-red-600 text-white"
                      : "bg-gray-50 text-red-600 hover:bg-red-50"
                  }`}
                  style={{ fontSize: "0.85rem", fontWeight: 600 }}
                >
                  <Search className="w-4 h-4" />
                  Ver todos os resultados para "{query}"
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}