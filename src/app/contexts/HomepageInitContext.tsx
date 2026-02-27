import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
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

function _isCacheValid(): boolean {
  return !!_cachedData && (Date.now() - _cachedAt) < CACHE_TTL_MS;
}

/** Call this to force a fresh fetch on the next homepage visit (e.g. after admin changes) */
export function invalidateHomepageCache(): void {
  _cachedData = null;
  _cachedAt = 0;
  _fetchPromise = null;
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

  useEffect(function () {
    mounted.current = true;

    // Always re-fetch if cache is stale or missing
    if (_isCacheValid()) {
      setData(_cachedData);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchWithContextRetry()
      .then(function (result) {
        if (mounted.current) {
          setData(result);
          setLoading(false);
        }
      })
      .catch(function (e) {
        console.error("[HomepageInit] Error after all retries:", e);
        if (mounted.current) {
          setError(String(e));
          setLoading(false);
        }
      });

    return function () { mounted.current = false; };
  }, []);

  return (
    <HomepageInitContext.Provider value={{ data, loading, error }}>
      {children}
    </HomepageInitContext.Provider>
  );
}