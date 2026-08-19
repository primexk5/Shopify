"use client";

import { useState } from "react";
import type { Product } from "@/lib/products";
import { useCart } from "@/components/cart-context";

export function ProductCard({ product }: { product: Product }) {
  const { add } = useCart();
  const [added, setAdded] = useState(false);

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
            {product.price} QUAI
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
      </div>
    </div>
  );
}