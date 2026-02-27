import { useState, useRef, useEffect } from "react";
import { MapPin, Check, X, Loader2, ChevronRight, Navigation } from "lucide-react";

export var CEP_STORAGE_KEY = "carretao_user_cep";
export var CEP_CITY_STORAGE_KEY = "carretao_user_cep_city";

function formatCep(value: string): string {
  var digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return digits.slice(0, 5) + "-" + digits.slice(5);
}

/** Read saved CEP from localStorage */
export function getSavedCep(): string {
  try {
    return localStorage.getItem(CEP_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

/** Read saved city/state from localStorage */
export function getSavedCepCity(): string {
  try {
    return localStorage.getItem(CEP_CITY_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

/** Save CEP to localStorage */
export function saveCep(cep: string, city?: string): void {
  try {
    var digits = cep.replace(/\D/g, "");
    if (digits.length === 8) {
      localStorage.setItem(CEP_STORAGE_KEY, digits);
      if (city) {
        localStorage.setItem(CEP_CITY_STORAGE_KEY, city);
      }
    } else {
      localStorage.removeItem(CEP_STORAGE_KEY);
      localStorage.removeItem(CEP_CITY_STORAGE_KEY);
    }
  } catch {}
}

/** Emits a custom event so other components can listen for CEP changes */
function emitCepChange(digits: string, city: string) {
  try {
    window.dispatchEvent(new CustomEvent("carretao_cep_change", { detail: { cep: digits, city: city } }));
  } catch {}
}

export function HeaderCepInput() {
  var [editing, setEditing] = useState(false);
  var [cepValue, setCepValue] = useState("");
  var [savedCep, setSavedCep] = useState(getSavedCep);
  var [savedCity, setSavedCity] = useState(getSavedCepCity);
  var [lookupLoading, setLookupLoading] = useState(false);
  var [errorMsg, setErrorMsg] = useState("");
  var [justSaved, setJustSaved] = useState(false);
  var inputRef = useRef<HTMLInputElement>(null);
  var containerRef = useRef<HTMLDivElement>(null);
  var [isMobile, setIsMobile] = useState(false);

  // Detect mobile
  useEffect(function () {
    function check() { setIsMobile(window.innerWidth < 768); }
    check();
    window.addEventListener("resize", check);
    return function () { window.removeEventListener("resize", check); };
  }, []);

  // Focus input when opening editor
  useEffect(function () {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  // Close on outside click
  useEffect(function () {
    if (!editing) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setEditing(false);
        setErrorMsg("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return function () { document.removeEventListener("mousedown", handleClick); };
  }, [editing]);

  function openEditor() {
    setCepValue(savedCep ? formatCep(savedCep) : "");
    setErrorMsg("");
    setEditing(true);
  }

  function handleSave() {
    var digits = cepValue.replace(/\D/g, "");
    if (digits.length !== 8) {
      setErrorMsg("CEP inválido");
      return;
    }
    setErrorMsg("");
    setLookupLoading(true);

    fetch("https://viacep.com.br/ws/" + digits + "/json/")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.erro) {
          setErrorMsg("CEP não encontrado");
          setLookupLoading(false);
          return;
        }
        var city = (data.localidade || "") + "/" + (data.uf || "");
        saveCep(digits, city);
        setSavedCep(digits);
        setSavedCity(city);
        emitCepChange(digits, city);
        setEditing(false);
        setLookupLoading(false);
        setJustSaved(true);
        setTimeout(function () { setJustSaved(false); }, 2500);
      })
      .catch(function () {
        saveCep(digits, "");
        setSavedCep(digits);
        setSavedCity("");
        emitCepChange(digits, "");
        setEditing(false);
        setLookupLoading(false);
        setJustSaved(true);
        setTimeout(function () { setJustSaved(false); }, 2500);
      });
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    saveCep("", "");
    setSavedCep("");
    setSavedCity("");
    emitCepChange("", "");
    setEditing(false);
  }

  // ─── Display mode ───
  if (!editing) {
    return (
      <button
        onClick={openEditor}
        className={"group flex items-center gap-1.5 md:gap-2 py-1.5 md:py-2 px-1 cursor-pointer transition-colors"}
        title={savedCep ? "Alterar CEP de entrega" : "Informe seu CEP para estimar frete"}
      >
        <div className={"flex items-center justify-center w-7 h-7 rounded-full transition-colors " +
          (justSaved
            ? "bg-green-100 text-green-600"
            : savedCep
              ? "bg-red-100 text-red-600"
              : "bg-gray-200 text-gray-500 group-hover:bg-red-100 group-hover:text-red-500"
          )
        }>
          {justSaved ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <Navigation className="w-3.5 h-3.5" />
          )}
        </div>

        <div className="text-left leading-none">
          {savedCep ? (
            <>
              <p className="text-gray-700 group-hover:text-red-600 transition-colors" style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                {isMobile ? formatCep(savedCep).slice(0, 5) + "..." : formatCep(savedCep)}
              </p>
              {savedCity && !isMobile ? (
                <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.64rem" }}>
                  {savedCity}
                </p>
              ) : (
                <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.6rem" }}>
                  {isMobile ? (savedCity ? savedCity.split("/")[1] : "CEP") : "Alterar"}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-gray-500 group-hover:text-red-600 transition-colors" style={{ fontSize: isMobile ? "0.68rem" : "0.74rem", fontWeight: 500 }}>
                {isMobile ? "CEP" : "Seu CEP"}
              </p>
              <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.6rem" }}>
                {isMobile ? "Frete" : "Calcule o frete"}
              </p>
            </>
          )}
        </div>

        <ChevronRight className="w-3 h-3 text-gray-300 group-hover:text-red-400 transition-colors hidden md:block" />
      </button>
    );
  }

  // ─── Edit mode (dropdown-style) ───
  return (
    <div ref={containerRef} className="relative">
      {/* Trigger area - keeps consistent position */}
      <div className="flex items-center gap-1.5 md:gap-2 py-1.5 md:py-2 px-1">
        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-red-100 text-red-600">
          <MapPin className="w-3.5 h-3.5" />
        </div>
        <div className="text-left leading-none">
          <p className="text-red-600" style={{ fontSize: isMobile ? "0.68rem" : "0.74rem", fontWeight: 600 }}>
            {isMobile ? "CEP" : "Seu CEP"}
          </p>
        </div>
      </div>

      {/* Dropdown card */}
      <div
        className={"absolute top-full mt-1 bg-white rounded-xl shadow-xl border border-gray-200 p-4 z-50 " +
          (isMobile ? "right-0 w-[260px]" : "right-0 w-[280px]")
        }
        style={{ animation: "fadeSlideDown 0.15s ease-out" }}
      >
        <p className="text-gray-700 mb-3" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
          Informe seu CEP
        </p>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={cepValue}
              onChange={function (e) {
                setCepValue(formatCep(e.target.value));
                setErrorMsg("");
              }}
              onKeyDown={function (e) {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") { setEditing(false); setErrorMsg(""); }
              }}
              placeholder="00000-000"
              maxLength={9}
              className={"w-full pl-9 pr-3 py-2 border rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-red-400 transition-all " +
                (errorMsg ? "border-red-400 bg-red-50/50" : "border-gray-200 bg-gray-50")
              }
              style={{ fontSize: "0.85rem", fontWeight: 500 }}
              disabled={lookupLoading}
            />
          </div>

          <button
            onClick={handleSave}
            disabled={lookupLoading || cepValue.replace(/\D/g, "").length < 8}
            className="shrink-0 px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ fontSize: "0.8rem", fontWeight: 600 }}
          >
            {lookupLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "OK"
            )}
          </button>
        </div>

        {/* Error */}
        {errorMsg && (
          <p className="mt-2 text-red-500" style={{ fontSize: "0.72rem", fontWeight: 500 }}>
            {errorMsg}
          </p>
        )}

        {/* Footer links */}
        <div className="mt-3 flex items-center justify-between">
          <a
            href="https://buscacepinter.correios.com.br/app/endereco/index.php"
            target="_blank"
            rel="noopener noreferrer"
            className="text-red-500 hover:text-red-600 hover:underline transition-colors"
            style={{ fontSize: "0.7rem" }}
          >
            Não sei meu CEP
          </a>

          {savedCep && (
            <button
              onClick={handleClear}
              className="flex items-center gap-1 text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
              style={{ fontSize: "0.7rem" }}
            >
              <X className="w-3 h-3" />
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* Backdrop for mobile */}
      <div
        className="fixed inset-0 z-40 bg-black/10 md:bg-transparent"
        onClick={function () { setEditing(false); setErrorMsg(""); }}
      />

      {/* Keyframe for dropdown animation */}
      <style>{"\n        @keyframes fadeSlideDown {\n          from { opacity: 0; transform: translateY(-4px); }\n          to { opacity: 1; transform: translateY(0); }\n        }\n      "}</style>
    </div>
  );
}