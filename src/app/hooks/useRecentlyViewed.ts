import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "carretao_recently_viewed";
const MAX_ITEMS = 10;

export interface RecentlyViewedItem {
  sku: string;
  titulo: string;
  viewedAt: number;
}

function loadItems(): RecentlyViewedItem[] {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    var parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveItems(items: RecentlyViewedItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {}
}

/**
 * Hook to manage recently viewed products.
 * Stores the last 10 viewed products in localStorage.
 */
export function useRecentlyViewed() {
  var [items, setItems] = useState<RecentlyViewedItem[]>(loadItems);

  // Sync across tabs
  useEffect(function () {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) {
        setItems(loadItems());
      }
    }
    window.addEventListener("storage", onStorage);
    return function () { window.removeEventListener("storage", onStorage); };
  }, []);

  var addItem = useCallback(function (sku: string, titulo: string) {
    setItems(function (prev) {
      // Remove existing entry for this SKU
      var filtered = prev.filter(function (item) { return item.sku !== sku; });
      // Add to front
      var next = [{ sku: sku, titulo: titulo, viewedAt: Date.now() }].concat(filtered);
      // Trim to max
      if (next.length > MAX_ITEMS) next = next.slice(0, MAX_ITEMS);
      saveItems(next);
      return next;
    });
  }, []);

  var getItems = useCallback(function (excludeSku?: string): RecentlyViewedItem[] {
    var current = loadItems();
    if (excludeSku) {
      return current.filter(function (item) { return item.sku !== excludeSku; });
    }
    return current;
  }, []);

  var clearAll = useCallback(function () {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    setItems([]);
  }, []);

  return { items: items, addItem: addItem, getItems: getItems, clearAll: clearAll };
}
