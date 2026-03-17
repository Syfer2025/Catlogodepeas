import { lazy } from "react";

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
  return factory().catch(function (err: any) {
    if (attempt >= maxRetries) {
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
