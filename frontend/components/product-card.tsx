"use client";

import { useState } from "react";
import type { Product } from "@/lib/products";
import { useCart } from "@/components/cart-context";

export function ProductCard({ product }: { product: Product }) {
  const { add } = useCart();
  const [added, setAdded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/register-order", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: [{ productId: product.id, qty: 1 }] }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to start checkout");
      window.location.assign(result.checkoutUrl);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to start checkout");
    } finally { setBusy(false); }
  };

  const handleAdd = () => {
    add(product.id);
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={product.image}
        alt={product.name}
        className="h-56 w-full object-cover"
        loading="lazy"
      />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h2 className="font-semibold">{product.name}</h2>
        <p className="flex-1 text-sm text-zinc-400">{product.description}</p>
        <div className="flex items-center justify-between">
          <span className="font-mono text-lg text-amber-400">
            {product.price.toFixed(2)} NEAR
          </span>
          <button
            onClick={handleAdd}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              added
                ? "bg-emerald-600 text-white"
                : "bg-amber-400 text-zinc-950 hover:bg-amber-300"
            }`}
          >
            {added ? "Added" : "Add to cart"}
          </button>
        </div>
        <button onClick={() => void pay()} disabled={busy}
          className="mt-2 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-50">
          {busy ? "Opening checkout…" : "Pay with NEAR"}
        </button>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      </div>
    </div>
  );
}