import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type CartItem = {
  productId: string;
  slug: string;
  title: string;
  price: number;
  imageUrl?: string;
  quantity: number;
  stock?: number;
};

type CartContextValue = {
  items: CartItem[];
  count: number;
  subtotal: number;
  add: (item: Omit<CartItem, "quantity">, qty?: number) => void;
  update: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "nexovira.cart.v1";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch { /* ignore */ }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, hydrated]);

  const value = useMemo<CartContextValue>(() => {
    const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
    const count = items.reduce((s, i) => s + i.quantity, 0);
    return {
      items, count, subtotal,
      add: (item, qty = 1) => setItems((prev) => {
        const existing = prev.find((p) => p.productId === item.productId);
        if (existing) {
          return prev.map((p) => p.productId === item.productId
            ? { ...p, quantity: Math.min((p.stock ?? 999), p.quantity + qty) }
            : p);
        }
        return [...prev, { ...item, quantity: qty }];
      }),
      update: (productId, qty) => setItems((prev) => qty <= 0
        ? prev.filter((p) => p.productId !== productId)
        : prev.map((p) => p.productId === productId ? { ...p, quantity: qty } : p)),
      remove: (productId) => setItems((prev) => prev.filter((p) => p.productId !== productId)),
      clear: () => setItems([]),
    };
  }, [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

export function formatNaira(n: number) {
  return "₦" + Number(n).toLocaleString("en-NG", { maximumFractionDigits: 2 });
}
