import { products } from "@/lib/products";
import { ProductCard } from "@/components/product-card";

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <section className="mb-10 text-center">
        <h1 className="text-4xl font-bold">Quai Shop</h1>
        <p className="mt-2 text-zinc-400">
          Merch for the people. Pay in QUAI — funds go straight to the merchant
          wallet, nothing is held.
        </p>
      </section>
      <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </section>
    </div>
  );
}