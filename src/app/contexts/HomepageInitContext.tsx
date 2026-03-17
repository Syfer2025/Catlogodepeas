/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * HOMEPAGE INIT CONTEXT — Cache centralizado dos dados da homepage
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * PROBLEMA QUE RESOLVE:
 * A homepage precisa de ~12 tipos de dados (banners, categorias, promo, logo,
 * GA4 config, etc.). Sem este context, seriam 12+ chamadas API separadas.
 * O endpoint GET /homepage-init retorna tudo em 1 chamada.
 *
 * COMO FUNCIONA:
 * 1. Provider monta (no Layout.tsx) → busca GET /homepage-init
 * 2. Resposta e cacheada em modulo (fora do React) com TTL de 5 minutos
 * 3. Qualquer componente usa useHomepageInit() para ler os dados
 * 4. Navegacoes SPA (ex: /produto → /) reutilizam o cache sem re-fetch
 *
 * INVALIDACAO:
 * Quando o admin salva algo (banner, promo, etc.), o frontend chama
 * invalidateHomepageCache(). Isso:
 * - Limpa o cache de modulo (_cachedData = null)
 * - Incrementa _cacheVersion (contador monotono)
 * - Notifica listeners → provider detecta a mudanca e re-fetch
 *
 * O sistema de versao+listeners foi necessario porque o provider nao
 * remonta em navegacoes SPA (Layout permanece montado).
 *
 * RESILIENCIA:
 * - fetchWithContextRetry(): se o primeiro fetch falha (ex: cold start do
 *   edge function que demora >7s), espera 3s e tenta novamente.
 * - Cobertura total: ~15s de tolerancia a cold starts.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import * as api from "../services/api";
import type { HomepageInitData, BannerItem, GA4Config, CategoryNode, SuperPromo, PriceConfig } from "../services/api";

interface HomepageInitContextValue {
  data: HomepageInitData | null;
  loading: boolean;
  error: string | null;
}

const defaultData: HomepageInitContextValue = {
  data: null,
  loading: true,
  error: null,
};

const HomepageInitContext = createContext<HomepageInitContextValue>(defaultData);

export function useHomepageInit(): HomepageInitContextValue {
  return useContext(HomepageInitContext);
}

// Module-level singleton with TTL — cache expires after 5 minutes
// so admin changes (banners, categories, etc.) are picked up on next homepage visit
var CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
var _cachedData: HomepageInitData | null = null;
var _cachedAt: number = 0;
var _fetchPromise: Promise<HomepageInitData> | null = null;

// ── Version counter: incremented when cache is invalidated ──
// The provider subscribes to this so it can re-fetch even without remounting.
var _cacheVersion = 0;
var _cacheListeners: Array<(v: number) => void> = [];

function _notifyListeners(): void {
  for (var i = 0; i < _cacheListeners.length; i++) {
    _cacheListeners[i](_cacheVersion);
  }
}

function _subscribe(listener: (v: number) => void): () => void {
  _cacheListeners.push(listener);
  return function () {
    var idx = _cacheListeners.indexOf(listener);
    if (idx !== -1) _cacheListeners.splice(idx, 1);
  };
}

function _isCacheValid(): boolean {
  return !!_cachedData && (Date.now() - _cachedAt) < CACHE_TTL_MS;
}

/** Call this to force a fresh fetch on the next homepage visit (e.g. after admin changes) */
export function invalidateHomepageCache(): void {
  _cachedData = null;
  _cachedAt = 0;
  _fetchPromise = null;
  _cacheVersion++;
  _notifyListeners();
}

function fetchHomepageInitOnce(): Promise<HomepageInitData> {
  if (_isCacheValid()) return Promise.resolve(_cachedData!);
  if (_fetchPromise) return _fetchPromise;

  // Clear stale cache
  _cachedData = null;
  _cachedAt = 0;

  _fetchPromise = api.getHomepageInit()
    .then(function (data) {
      _cachedData = data;
      _cachedAt = Date.now();
      _fetchPromise = null;
      return data;
    })
    .catch(function (e) {
      _fetchPromise = null; // allow retry on error
      throw e;
    });

  return _fetchPromise;
}

// Extra resilience: if fetchHomepageInitOnce fails (all api.ts retries exhausted),
// wait and retry one more time. This covers edge function cold starts that take
// longer than the api.ts retry window (~7s) — total coverage becomes ~15s.
var CONTEXT_RETRY_DELAY = 3000;

function fetchWithContextRetry(): Promise<HomepageInitData> {
  return fetchHomepageInitOnce().catch(function (firstErr) {
    console.warn("[HomepageInit] First attempt failed, context-level retry in " + CONTEXT_RETRY_DELAY + "ms:", firstErr);
    return new Promise<HomepageInitData>(function (resolve, reject) {
      setTimeout(function () {
        fetchHomepageInitOnce().then(resolve).catch(function (secondErr) {
          console.error("[HomepageInit] Context-level retry also failed:", secondErr);
          reject(secondErr);
        });
      }, CONTEXT_RETRY_DELAY);
    });
  });
}

export function HomepageInitProvider({ children }: { children: ReactNode }) {
  var [data, setData] = useState<HomepageInitData | null>(_isCacheValid() ? _cachedData : null);
  var [loading, setLoading] = useState(!_isCacheValid());
  var [error, setError] = useState<string | null>(null);
  var mounted = useRef(true);
  var lastFetchedVersion = useRef(_cacheVersion);

  // Core fetch logic — extracted so it can be called on mount AND on invalidation
  var doFetch = useCallback(function () {
    if (_isCacheValid()) {
      setData(_cachedData);
      setLoading(false);
      lastFetchedVersion.current = _cacheVersion;
      return;
    }

    setLoading(true);
    var fetchVersion = _cacheVersion;
    fetchWithContextRetry()
      .then(function (result) {
        if (mounted.current) {
          setData(result);
          setLoading(false);
          lastFetchedVersion.current = fetchVersion;
        }
      })
      .catch(function (e) {
        console.error("[HomepageInit] Error after all retries:", e);
        if (mounted.current) {
          setError(String(e));
          setLoading(false);
        }
      });
  }, []);

  // Initial fetch on mount
  useEffect(function () {
    mounted.current = true;
    doFetch();
    return function () { mounted.current = false; };
  }, []);

  // Subscribe to cache invalidation events — re-fetch when version changes
  useEffect(function () {
    var unsub = _subscribe(function (newVersion) {
      if (newVersion > lastFetchedVersion.current && mounted.current) {
        console.log("[HomepageInit] Cache invalidated (v" + newVersion + "), re-fetching...");
        doFetch();
      }
    });
    return unsub;
  }, [doFetch]);

  return (
    <HomepageInitContext.Provider value={{ data, loading, error }}>
      {children}
    </HomepageInitContext.Provider>
  );
}