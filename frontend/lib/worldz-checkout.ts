import { findProduct } from "./products";

export function checkoutTerms(body: unknown) {
  if (!body || typeof body !== "object" || !("items" in body) || !Array.isArray(body.items) || body.items.length === 0 || body.items.length > 30) throw new Error("Choose between 1 and 30 cart items");
  let amount = 0n;
  const names: string[] = [];
  const seen = new Set<string>();
  for (const item of body.items) {
    if (!item || typeof item !== "object" || typeof item.productId !== "string" || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 20 || seen.has(item.productId)) throw new Error("Invalid product or quantity (maximum 20 per product)");
    const product = findProduct(item.productId);
    if (!product) throw new Error("Unknown product");
    seen.add(product.id);
    // Integer hundredths of testnet NEAR; no floating-point conversion.
    amount += BigInt(product.priceHundredths) * 10n ** 22n * BigInt(item.qty);
    names.push(`${item.qty} × ${product.name}`);
  }
  const fraction = (amount % 10n ** 24n).toString().padStart(24, "0").replace(/0+$/, "");
  return { networkId: "testnet", asset: { type: "native", symbol: "NEAR", decimals: 24 },
    amount: amount.toString(), amountDisplay: `${amount / 10n ** 24n}${fraction ? `.${fraction}` : ""}`,
    displayName: names.join(", ").slice(0, 80), expiresAtSeconds: Math.floor(Date.now() / 1000) + 3600,
    multiPay: false, maxRedemptions: 1 };
}
