import { lazy } from "react";

var CHUNK_RELOAD_MARKER = "__chunk_reload_once__";

/**
 * Wraps React.lazy with automatic retry on dynamic import failures.
 * Handles transient network errors (cold starts, flaky connections)
 * by retrying the import up to `maxRetries` times with exponential backoff.
 */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  maxRetries = 3
): React.LazyExoticComponent<T> {
  return lazy(function () {
    return _retryImport(factory, maxRetries, 0);
  });
}

function _retryImport<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  maxRetries: number,
  attempt: number
): Promise<{ default: T }> {
  return factory().then(function (mod) {
    _clearChunkReloadMarker();
    return mod;
  }).catch(function (err: any) {
    if (attempt >= maxRetries) {
      if (_isDynamicImportFailure(err) && _reloadOnceForChunkError()) {
        return new Promise<{ default: T }>(function () {});
      }
      // All retries exhausted — throw so the error boundary can catch it
      console.error("[lazyWithRetry] All " + (maxRetries + 1) + " attempts failed:", err);
      throw err;
    }
    var delay = 1000 * Math.pow(2, attempt) + Math.random() * 500;
    console.warn("[lazyWithRetry] Import failed (attempt " + (attempt + 1) + "/" + (maxRetries + 1) + "), retrying in " + Math.round(delay) + "ms...", err?.message || err);
    return new Promise<{ default: T }>(function (resolve) {
      setTimeout(function () {
        resolve(_retryImport(factory, maxRetries, attempt + 1));
      }, delay);
    });
  });
}

function _isDynamicImportFailure(err: any): boolean {
  var message = String(err?.message || err || "").toLowerCase();
  var name = String(err?.name || "").toLowerCase();
  return (
    message.includes("failed to fetch dynamically imported module") ||
    message.includes("error loading dynamically imported module") ||
    message.includes("importing a module script failed") ||
    message.includes("chunkloaderror") ||
    name.includes("chunkloaderror")
  );
}

function _reloadOnceForChunkError(): boolean {
  if (typeof window === "undefined") return false;
  try {
    var currentPath = window.location.pathname + window.location.search;
    if (sessionStorage.getItem(CHUNK_RELOAD_MARKER) === currentPath) {
      sessionStorage.removeItem(CHUNK_RELOAD_MARKER);
      return false;
    }
    sessionStorage.setItem(CHUNK_RELOAD_MARKER, currentPath);
  } catch {}
  console.warn("[lazyWithRetry] Dynamic import failed after retries. Reloading page once to refresh stale chunks.");
  window.location.reload();
  return true;
}

function _clearChunkReloadMarker(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_MARKER);
  } catch {}
}
