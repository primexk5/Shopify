"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import { products } from "@/lib/products";

export interface CartLine {
  productId: string;
  qty: number;
}

interface CartContextValue {
  lines: CartLine[];
  add: (productId: string) => void;
  remove: (productId: string) => void;
  setQty: (productId: string, qty: number) => void;
  clear: () => void;
  count: number;
  total: number;
}

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = "quai-shop-cart";

let cache: CartLine[] = [];
const listeners = new Set<() => void>();

function getSnapshot(): CartLine[] {
  return cache;
}

function emit() {
  listeners.forEach((listener) => listener());
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

function loadFromStorage() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CartLine[];
      if (Array.isArray(parsed)) cache = parsed;
    }
  } catch {
    // ignore corrupt cart
  }
}

if (typeof window !== "undefined") {
  loadFromStorage();
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getSnapshot,
    getSnapshot
  );

  const value: CartContextValue = {
    lines: cache,
    add: (productId) => {
      const existing = cache.find((l) => l.productId === productId);
      cache = existing
        ? cache.map((l) =>
            l.productId === productId ? { ...l, qty: l.qty + 1 } : l
          )
        : [...cache, { productId, qty: 1 }];
      persist();
      emit();
    },
    remove: (productId) => {
      cache = cache.filter((l) => l.productId !== productId);
      persist();
      emit();
    },
    setQty: (productId, qty) => {
      if (qty <= 0) {
        cache = cache.filter((l) => l.productId !== productId);
      } else {
        cache = cache.map((l) =>
          l.productId === productId ? { ...l, qty } : l
        );
      }
      persist();
      emit();
    },
    clear: () => {
      cache = [];
      persist();
      emit();
    },
    count: cache.reduce((acc, l) => acc + l.qty, 0),
    total: cache.reduce((acc, l) => {
      const product = products.find((p) => p.id === l.productId);
      return acc + (product?.price ?? 0) * l.qty;
    }, 0),
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}