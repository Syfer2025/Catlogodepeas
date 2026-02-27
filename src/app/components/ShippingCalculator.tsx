import { useState, useCallback, useEffect, useRef } from "react";
import { Truck, Loader2, MapPin, Clock, X, Info, Home } from "lucide-react";
import * as api from "../services/api";
import { supabase } from "../services/supabaseClient";
import { getSavedCep, CEP_STORAGE_KEY } from "./HeaderCepInput";

function formatPrice(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function formatCep(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return digits.slice(0, 5) + "-" + digits.slice(5);
}

const CARRIER_ICONS: Record<string, string> = {
  correios_pac: "\u{1F4E6}",
  correios_sedex: "\u{26A1}",
  transportadora: "\u{1F69A}",
  motoboy: "\u{1F3CD}",
  custom: "\u{1F4E6}",
};

interface ShippingCalculatorProps {
  items: Array<{ sku: string; quantity: number }>;
  totalValue: number;
  /** Compact mode for product detail page */
  compact?: boolean;
  /** Called when an option is selected */
  onSelect?: (option: api.ShippingOption | null) => void;
  /** Currently selected option */
  selectedId?: string | null;
  /** Pre-fill CEP */
  initialCep?: string;
  /** Show quick button to use saved address CEP */
  showSavedAddress?: boolean;
}

export function ShippingCalculator({
  items,
  totalValue,
  compact = false,
  onSelect,
  selectedId,
  initialCep = "",
  showSavedAddress = false,
}: ShippingCalculatorProps) {
  // Priority: explicit initialCep > saved CEP from header
  var effectiveCep = initialCep || getSavedCep();
  const [cep, setCep] = useState(effectiveCep ? formatCep(effectiveCep) : "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<api.ShippingCalcResponse | null>(null);
  const [error, setError] = useState("");
  const [calculated, setCalculated] = useState(false);

  // Saved address quick-fill
  const [savedAddresses, setSavedAddresses] = useState<api.UserAddress[]>([]);
  const [addrLoading, setAddrLoading] = useState(false);
  const [addrLoaded, setAddrLoaded] = useState(false);

  // Sync CEP when initialCep changes (e.g., user selects different address)
  const prevInitialCep = useRef(initialCep);
  useEffect(() => {
    if (initialCep !== prevInitialCep.current) {
      prevInitialCep.current = initialCep;
      if (initialCep) {
        setCep(formatCep(initialCep));
        setResult(null);
        setCalculated(false);
        setError("");
      }
    }
  }, [initialCep]);

  // Listen for CEP changes from header input (custom event)
  useEffect(function () {
    if (initialCep) return; // skip if an explicit initialCep was provided
    function onCepChange(e: Event) {
      var detail = (e as CustomEvent).detail;
      if (detail && detail.cep && !calculated) {
        setCep(formatCep(detail.cep));
      }
    }
    window.addEventListener("carretao_cep_change", onCepChange);
    return function () { window.removeEventListener("carretao_cep_change", onCepChange); };
  }, [initialCep, calculated]);

  // Fetch saved addresses once when showSavedAddress is true
  useEffect(() => {
    if (!showSavedAddress || addrLoaded) return;
    var cancelled = false;

    async function load() {
      try {
        // Small delay to avoid competing with critical product data fetches during cold start
        await new Promise(function (r) { setTimeout(r, 1200); });
        if (cancelled) return;
        setAddrLoading(true);
        var sessionResult = await supabase.auth.getSession();
        var session = sessionResult.data?.session;
        if (!session?.access_token || cancelled) {
          setAddrLoading(false);
          setAddrLoaded(true);
          return;
        }
        var res = await api.getUserAddresses(session.access_token);
        if (!cancelled) {
          setSavedAddresses(res.addresses || []);
        }
      } catch (err) {
        // Non-critical — silently ignore
      } finally {
        if (!cancelled) {
          setAddrLoading(false);
          setAddrLoaded(true);
        }
      }
    }

    load();
    return function () { cancelled = true; };
  }, [showSavedAddress, addrLoaded]);

  const handleCalculate = useCallback(async () => {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) {
      setError("Informe um CEP válido com 8 dígitos.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await api.calculateShipping(digits, items, totalValue);
      if (res._enrichment) {
        console.log("[Frete] Dados SIGE enriquecidos:", res._enrichment, "Peso total:", res.totalWeight, "kg");
      }
      if (res.error) {
        setError(res.error);
      } else {
        setResult(res);
        setCalculated(true);
        if (res.options.length === 0 && res.message) {
          setError(res.message);
        }
      }
    } catch (e: any) {
      console.error("Shipping calc error:", e);
      setError(e.message || "Erro ao calcular frete.");
    } finally {
      setLoading(false);
    }
  }, [cep, items, totalValue]);

  const handleClear = () => {
    setResult(null);
    setCalculated(false);
    setError("");
    onSelect?.(null);
  };

  const handleUseSavedAddress = (addr: api.UserAddress) => {
    var addrCep = (addr.cep || "").replace(/\D/g, "");
    if (addrCep.length === 8) {
      setCep(formatCep(addrCep));
      // Clear previous results
      if (calculated) handleClear();
    }
  };

  // Pick default address for the quick button
  var defaultAddr = savedAddresses.find(function (a) { return a.isDefault; }) || savedAddresses[0] || null;

  return (
    <div className={compact ? "" : "bg-white rounded-xl border border-gray-200 overflow-hidden"}>
      {/* Header */}
      {!compact && (
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <Truck className="w-4 h-4 text-red-600" />
          <span className="text-gray-700" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
            Calcular Frete
          </span>
        </div>
      )}

      <div className={compact ? "" : "p-5"}>
        {/* Quick saved address buttons */}
        {showSavedAddress && !addrLoading && savedAddresses.length > 0 && !calculated && (
          <div className="mb-2.5">
            {savedAddresses.length === 1 && defaultAddr ? (
              <button
                onClick={function () { handleUseSavedAddress(defaultAddr!); }}
                className="w-full flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors text-left cursor-pointer"
                style={{ fontSize: "0.78rem" }}
              >
                <Home className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-blue-700" style={{ fontWeight: 600 }}>
                    {defaultAddr.label || "Meu endereço"}
                  </span>
                  <span className="text-blue-500 ml-1">
                    — CEP {formatCep(defaultAddr.cep)}
                  </span>
                  {defaultAddr.city && (
                    <span className="text-blue-400 ml-1" style={{ fontSize: "0.7rem" }}>
                      ({defaultAddr.city}/{defaultAddr.state})
                    </span>
                  )}
                </div>
                <MapPin className="w-3 h-3 text-blue-400 shrink-0" />
              </button>
            ) : (
              <div className="space-y-1">
                <p className="text-gray-400 flex items-center gap-1" style={{ fontSize: "0.68rem", fontWeight: 600 }}>
                  <Home className="w-3 h-3" />
                  Usar endereço cadastrado:
                </p>
                {savedAddresses.map(function (addr) {
                  return (
                    <button
                      key={addr.id}
                      onClick={function () { handleUseSavedAddress(addr); }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors text-left cursor-pointer"
                      style={{ fontSize: "0.75rem" }}
                    >
                      <MapPin className="w-3 h-3 text-blue-500 shrink-0" />
                      <span className="text-blue-700" style={{ fontWeight: 600 }}>
                        {addr.label || "Endereço"}
                      </span>
                      <span className="text-blue-500">
                        — CEP {formatCep(addr.cep)}
                      </span>
                      {addr.city && (
                        <span className="text-blue-400" style={{ fontSize: "0.65rem" }}>
                          ({addr.city}/{addr.state})
                        </span>
                      )}
                      {addr.isDefault && (
                        <span className="ml-auto text-green-500" style={{ fontSize: "0.6rem", fontWeight: 700 }}>
                          padrão
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* CEP input + button */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={cep}
              onChange={(e) => {
                setCep(formatCep(e.target.value));
                if (calculated) handleClear();
              }}
              onKeyDown={(e) => e.key === "Enter" && handleCalculate()}
              placeholder="00000-000"
              className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300 transition-all"
              style={{ fontSize: "0.88rem" }}
              maxLength={9}
            />
          </div>
          <button
            onClick={handleCalculate}
            disabled={loading || cep.replace(/\D/g, "").length !== 8}
            className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            style={{ fontSize: "0.82rem", fontWeight: 600 }}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Truck className="w-4 h-4" />
            )}
            {loading ? "Calculando..." : "Calcular"}
          </button>
        </div>

        {/* Consultar CEP link */}
        <div className="mt-1.5 flex items-center justify-between">
          <a
            href="https://buscacepinter.correios.com.br/app/endereco/index.php"
            target="_blank"
            rel="noopener noreferrer"
            className="text-red-500 hover:text-red-600 transition-colors"
            style={{ fontSize: "0.72rem" }}
          >
            Não sei meu CEP
          </a>
          {calculated && (
            <button
              onClick={handleClear}
              className="text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1 cursor-pointer"
              style={{ fontSize: "0.72rem" }}
            >
              <X className="w-3 h-3" />
              Limpar
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mt-3 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
            <Info className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-red-600" style={{ fontSize: "0.8rem" }}>
              {error}
            </p>
          </div>
        )}

        {/* Results */}
        {result && result.options.length > 0 && (
          <div className="mt-3 space-y-2">
            {/* Destination info */}
            <div className="flex items-center gap-1.5 text-gray-400" style={{ fontSize: "0.72rem" }}>
              <MapPin className="w-3 h-3" />
              <span>
                {result.destination.localidade} - {result.destination.uf}
              </span>
            </div>

            {/* Options */}
            {result.options.map((opt) => {
              const isSelected = selectedId === opt.carrierId;
              const icon = CARRIER_ICONS[opt.carrierType] || "\u{1F4E6}";

              return (
                <button
                  key={opt.carrierId}
                  onClick={() => onSelect?.(isSelected ? null : opt)}
                  className={"w-full text-left flex items-center gap-3 px-3.5 py-3 rounded-lg border-2 transition-all cursor-pointer " +
                    (isSelected
                      ? "border-red-500 bg-red-50 shadow-sm"
                      : "border-gray-200 bg-white hover:border-red-300 hover:bg-red-50/30"
                    )}
                >
                  <span style={{ fontSize: "1.3rem" }}>{icon}</span>
                  <div className="flex-1 min-w-0">
                    <p
                      className={isSelected ? "text-red-700" : "text-gray-700"}
                      style={{ fontSize: "0.85rem", fontWeight: 600 }}
                    >
                      {opt.carrierName}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {opt.deliveryDays > 0 && (
                        <span className="flex items-center gap-1 text-gray-400" style={{ fontSize: "0.72rem" }}>
                          <Clock className="w-3 h-3" />
                          {opt.deliveryText}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {opt.free ? (
                      <div>
                        <span
                          className="text-green-600"
                          style={{ fontSize: "0.95rem", fontWeight: 800 }}
                        >
                          Grátis
                        </span>
                        {opt.freeReason && (
                          <p className="text-green-500" style={{ fontSize: "0.65rem" }}>
                            {opt.freeReason}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span
                        className={isSelected ? "text-red-600" : "text-gray-800"}
                        style={{ fontSize: "0.95rem", fontWeight: 700 }}
                      >
                        {formatPrice(opt.price)}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}