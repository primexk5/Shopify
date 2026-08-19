"use client";

import Link from "next/link";
import { useCart } from "@/components/cart-context";

export function Nav() {
  const { count } = useCart();

  return (
    <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-semibold">
          Shopify<span className="text-amber-400">.Inc</span>
        </Link>
        <Link
          href="/checkout"
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:border-amber-400"
        >
          Cart ({count})
        </Link>
      </nav>
    </header>
  );
}