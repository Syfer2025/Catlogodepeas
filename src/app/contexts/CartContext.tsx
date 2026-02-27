import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

export interface CartItem {
  sku: string;
  titulo: string;
  quantidade: number;
  precoUnitario: number | null; // price per unit (may be null if price not available)
  imageUrl: string;
  /** True when item was added with a Super Promo discounted price */
  isPromo?: boolean;
  /** Extended warranty info when user opts in */
  warranty?: {
    planId: string;
    name: string;
    price: number; // calculated price for this warranty
    durationMonths: number;
  } | null;
}

interface CartContextType {
  items: CartItem[];
  totalItems: number;
  totalPrice: number;
  addItem: (item: Omit<CartItem, "quantidade"> & { quantidade?: number }) => void;
  removeItem: (sku: string) => void;
  updateQuantity: (sku: string, quantidade: number) => void;
  clearCart: () => void;
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
}

const CartContext = createContext<CartContextType | null>(null);

const CART_STORAGE_KEY = "carretao_cart";

function loadCart(): CartItem[] {
  try {
    const stored = localStorage.getItem(CART_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [];
}

function saveCart(items: CartItem[]) {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  } catch {}
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(loadCart);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    saveCart(items);
  }, [items]);

  const addItem = useCallback(
    (newItem: Omit<CartItem, "quantidade"> & { quantidade?: number }) => {
      setItems((prev) => {
        const existing = prev.find((i) => i.sku === newItem.sku);
        if (existing) {
          return prev.map((i) =>
            i.sku === newItem.sku
              ? {
                  ...i,
                  quantidade: i.quantidade + (newItem.quantidade || 1),
                  // Always update to latest price and promo flag
                  precoUnitario: newItem.precoUnitario ?? i.precoUnitario,
                  isPromo: newItem.isPromo !== undefined ? newItem.isPromo : i.isPromo,
                  warranty: newItem.warranty !== undefined ? newItem.warranty : i.warranty,
                }
              : i
          );
        }
        return [
          ...prev,
          {
            sku: newItem.sku,
            titulo: newItem.titulo,
            quantidade: newItem.quantidade || 1,
            precoUnitario: newItem.precoUnitario,
            imageUrl: newItem.imageUrl,
            isPromo: newItem.isPromo,
            warranty: newItem.warranty || null,
          },
        ];
      });
      setIsDrawerOpen(true);
    },
    []
  );

  const removeItem = useCallback((sku: string) => {
    setItems((prev) => prev.filter((i) => i.sku !== sku));
  }, []);

  const updateQuantity = useCallback((sku: string, quantidade: number) => {
    if (quantidade <= 0) {
      setItems((prev) => prev.filter((i) => i.sku !== sku));
      return;
    }
    setItems((prev) =>
      prev.map((i) => (i.sku === sku ? { ...i, quantidade } : i))
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const openDrawer = useCallback(() => setIsDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);

  const totalItems = items.reduce((sum, i) => sum + i.quantidade, 0);
  const totalPrice = items.reduce(
    (sum, i) => sum + ((i.precoUnitario || 0) + (i.warranty ? i.warranty.price : 0)) * i.quantidade,
    0
  );

  return (
    <CartContext.Provider
      value={{
        items,
        totalItems,
        totalPrice,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        isDrawerOpen,
        openDrawer,
        closeDrawer,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

const _noop = () => {};

const _fallback: CartContextType = {
  items: [],
  totalItems: 0,
  totalPrice: 0,
  addItem: _noop,
  removeItem: _noop,
  updateQuantity: _noop,
  clearCart: _noop,
  isDrawerOpen: false,
  openDrawer: _noop,
  closeDrawer: _noop,
};

export function useCart() {
  const ctx = useContext(CartContext);
  // Return safe fallback instead of throwing — prevents crashes during hot reload
  // or when components render before CartProvider mounts
  if (!ctx) {
    console.warn("[useCart] Rendered outside CartProvider — using fallback.");
    return _fallback;
  }
  return ctx;
}