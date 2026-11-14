"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { products } from "@/lib/products";
import { useCart } from "@/components/cart-context";

export default function CheckoutCartPage() {
  const { lines, setQty, remove, total } = useCart();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const items = useMemo(
    () =>
      lines
        .map((l) => {
          const product = products.find((p) => p.id === l.productId);
          return product ? { product, qty: l.qty } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    [lines]
  );

  const placeOrder = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/register-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: lines.map((l) => ({ productId: l.productId, qty: l.qty })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create order");
      window.location.assign(data.checkoutUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create order");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-3xl font-bold">Checkout</h1>

      <p className="mb-6 rounded-xl border border-zinc-800 p-4 text-sm text-zinc-400">
        NEAR testnet only. Connect your payer wallet on WorldzPayments after continuing.
      </p>

      {items.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
          <p className="text-zinc-400">Your cart is empty.</p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-lg bg-amber-400 px-4 py-2 text-sm text-zinc-950"
          >
            Browse products
          </Link>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900">
            {items.map(({ product, qty }) => (
              <li key={product.id} className="flex items-center gap-4 p-4">
                <div className="flex-1">
                  <p className="font-medium">{product.name}</p>
                  <p className="text-sm text-zinc-400">
                    {product.price} NEAR each
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setQty(product.id, qty - 1)}
                    className="h-8 w-8 rounded border border-zinc-700"
                  >
                    -
                  </button>
                  <span className="w-6 text-center">{qty}</span>
                  <button
                    onClick={() => setQty(product.id, qty + 1)}
                    className="h-8 w-8 rounded border border-zinc-700"
                  >
                    +
                  </button>
                </div>
                <button
                  onClick={() => remove(product.id)}
                  className="text-sm text-zinc-500 hover:text-red-400"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between text-lg">
            <span>Total</span>
            <span className="font-mono text-amber-400">{total.toFixed(2)} NEAR</span>
          </div>
          <button
            onClick={placeOrder}
            disabled={busy}
            className="mt-6 w-full rounded-lg bg-amber-400 py-3 font-medium text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
          >
            {busy ? "Opening checkout…" : "Pay with NEAR"}
          </button>
          <p className="mt-3 text-center text-xs text-zinc-500">
            Continue to WorldzPayments to approve a native NEAR testnet payment.
            Keep the settled receipt to match with the signed webhook.
          </p>
          {error && <p className="mt-3 text-center text-sm text-red-400">{error}</p>}
        </>
      )}
    </div>
  );
}