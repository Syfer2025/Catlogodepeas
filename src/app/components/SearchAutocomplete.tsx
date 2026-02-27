import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import { Search, X, Clock, ChevronRight, Trash2, Loader2, Package, ArrowRight, Hash, Sparkles, CornerDownLeft } from "lucide-react";
import * as api from "../services/api";
import { ProductImage } from "./ProductImage";
import type { AutocompleteResult } from "../services/api";
import { prefetchProductDetail } from "../utils/prefetch";
import "../utils/emptyStateAnimations";

// ── Search History (localStorage) ──
var SEARCH_HISTORY_KEY = "carretao_search_history";
var MAX_HISTORY = 5;

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
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AutocompleteResult[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [hasSearched, setHasSearched] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<string[]>([]);

  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressHistoryRef = useRef(false);

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (q.trim().length < 2) {
      setResults([]);
      setTotalMatches(0);
      setHasSearched(false);
      setLoading(false);
      // Show history when query is too short but has history
      if (q.trim().length === 0 && !suppressHistoryRef.current) {
        var hist = getSearchHistory();
        if (hist.length > 0 && document.activeElement === inputRef.current) {
          setHistoryItems(hist);
          setShowHistory(true);
          setIsOpen(true);
        } else {
          setIsOpen(false);
          setShowHistory(false);
        }
      } else {
        suppressHistoryRef.current = false;
        setIsOpen(false);
        setShowHistory(false);
      }
      return;
    }

    setShowHistory(false);

    setLoading(true);
    abortControllerRef.current = new AbortController();

    try {
      const data = await api.autocomplete(q.trim(), 8);
      setResults(data.results);
      setTotalMatches(data.totalMatches);
      setIsOpen(true);
      setHasSearched(true);
      setActiveIndex(-1);
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("Autocomplete error:", err);
        setResults([]);
        setTotalMatches(0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowHistory(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const goToProduct = (sku: string) => {
    if (query.trim().length >= 2) saveSearchHistory(query.trim());
    suppressHistoryRef.current = true;
    navigate("/produto/" + encodeURIComponent(sku));
    setQuery("");
    setIsOpen(false);
    setShowHistory(false);
    setResults([]);
    inputRef.current?.blur();
    onSelect?.();
  };

  const goToCatalog = () => {
    if (query.trim()) {
      saveSearchHistory(query.trim());
      suppressHistoryRef.current = true;
      navigate("/catalogo?busca=" + encodeURIComponent(query.trim()));
      setQuery("");
      setIsOpen(false);
      setShowHistory(false);
      setResults([]);
      inputRef.current?.blur();
      onSelect?.();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "Enter") {
        e.preventDefault();
        goToCatalog();
      }
      return;
    }

    // When showing history, handle navigation within history items
    if (showHistory && historyItems.length > 0 && results.length === 0) {
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
            setQuery(historyItems[activeIndex]);
            setShowHistory(false);
          }
          break;
        case "Escape":
          setIsOpen(false);
          setShowHistory(false);
          setActiveIndex(-1);
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
          goToCatalog();
        }
        break;
      case "Escape":
        setIsOpen(false);
        setShowHistory(false);
        setActiveIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  const handleFocus = () => {
    if (suppressHistoryRef.current) {
      suppressHistoryRef.current = false;
      return;
    }
    if (results.length > 0 && query.trim().length >= 2) {
      setIsOpen(true);
    } else if (query.trim().length < 2) {
      // Show recent searches when input is focused but empty
      var history = getSearchHistory();
      if (history.length > 0) {
        setHistoryItems(history);
        setShowHistory(true);
        setIsOpen(true);
      }
    }
  };

  const clearQuery = () => {
    setQuery("");
    setResults([]);
    setIsOpen(false);
    setShowHistory(false);
    setHasSearched(false);
    suppressHistoryRef.current = true;
    inputRef.current?.focus();
  };

  // Highlight matching text
  const highlightMatch = (text: string, q: string) => {
    // Escape HTML entities to prevent XSS via product titles
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const safeText = esc(text);
    if (!q.trim()) return safeText;
    const norm = q
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const textNorm = safeText
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    const idx = textNorm.indexOf(norm);
    if (idx === -1) {
      // Try each word
      const words = norm.split(/\s+/).filter((w) => w.length >= 2);
      let result = safeText;
      for (const word of words) {
        const wordIdx = result
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .indexOf(word);
        if (wordIdx !== -1) {
          const before = result.slice(0, wordIdx);
          const match = result.slice(wordIdx, wordIdx + word.length);
          const after = result.slice(wordIdx + word.length);
          result = `${before}<mark>${match}</mark>${after}`;
        }
      }
      return result;
    }

    const before = safeText.slice(0, idx);
    const match = safeText.slice(idx, idx + norm.length);
    const after = safeText.slice(idx + norm.length);
    return `${before}<mark>${match}</mark>${after}`;
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

  return (
    <div ref={containerRef} className="relative w-full" role="search">
      {/* Input */}
      <div
        className={`flex w-full border rounded-lg overflow-hidden transition-all ${
          isOpen
            ? "border-red-400 ring-2 ring-red-100 rounded-b-none"
            : "border-gray-300 focus-within:ring-2 focus-within:ring-red-500 focus-within:border-red-500"
        }`}
      >
        <div className="flex-1 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" aria-hidden="true" />
          <label htmlFor="search-autocomplete" className="sr-only">Buscar peças por nome ou código</label>
          <input
            ref={inputRef}
            id="search-autocomplete"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            placeholder={placeholder}
            className="w-full pl-10 pr-9 py-2.5 outline-none bg-gray-50"
            style={{ fontSize: "0.9rem" }}
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={isOpen}
            aria-autocomplete="list"
            aria-label="Buscar peças"
          />
          {query && (
            <button
              onClick={clearQuery}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 rounded transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={goToCatalog}
          className="bg-red-600 hover:bg-red-700 text-white px-5 flex items-center justify-center transition-colors shrink-0"
          aria-label="Buscar"
        >
          {loading ? (
            <Loader2 className="w-4.5 h-4.5 animate-spin" />
          ) : (
            <Search className="w-4.5 h-4.5" />
          )}
        </button>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 bg-white border border-t-0 border-red-400 rounded-b-lg shadow-xl z-[100] overflow-hidden max-h-[420px] overflow-y-auto">
          {/* Recent searches (shown when query is empty) */}
          {showHistory && historyItems.length > 0 && !hasSearched && results.length === 0 && !loading ? (
            <div>
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <span className="text-gray-400 flex items-center gap-1.5" style={{ fontSize: "0.75rem" }}>
                  <Clock className="w-3 h-3" />
                  Buscas recentes
                </span>
                <button
                  onClick={function () {
                    clearSearchHistory();
                    setHistoryItems([]);
                    setShowHistory(false);
                    setIsOpen(false);
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
                    onClick={function () {
                      setQuery(term);
                      setShowHistory(false);
                    }}
                    onMouseEnter={function () { setActiveIndex(idx); }}
                    className={"w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors border-b border-gray-50 last:border-b-0 " +
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
                {"Nenhuma peça encontrada para \"" + query + "\""}
              </p>
              <button
                onClick={goToCatalog}
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
                  onClick={goToCatalog}
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