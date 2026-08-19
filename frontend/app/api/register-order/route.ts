import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { Contract, JsonRpcProvider, Wallet, id } from "quais";
import { config, toQuaiUnits } from "@/lib/config";
import paywithquaiAbi from "@/lib/paywithquai.abi.json";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: {
    items?: { productId: string; qty: number }[];
    payer?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const items = body.items ?? [];
  if (items.length === 0) {
    return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
  }

  const payer = body.payer?.trim().toLowerCase() ?? "";
  if (payer && !/^0x[0-9a-f]{40}$/.test(payer)) {
    return NextResponse.json({ error: "Invalid payer address" }, { status: 400 });
  }

  const { products } = await import("@/lib/products");
  let total = 0n;
  for (const item of items) {
    const product = products.find((p) => p.id === item.productId);
    if (!product) {
      return NextResponse.json({ error: `Unknown product: ${item.productId}` }, { status: 400 });
    }
    const qty = Math.max(1, Math.floor(item.qty ?? 1));
    total += toQuaiUnits(product.price) * BigInt(qty);
  }

  // Cryptographically random order id — the checkout reads it back on-chain.
  const orderId = id(`ord_web_${randomBytes(24).toString("hex")}`);
  const expiry = 0n;

  let txHash: string | null = null;
  let registered = false;

  if (config.backendPrivateKey) {
    try {
      const provider = new JsonRpcProvider(config.rpcUrl, undefined, {
        usePathing: true,
      });
      const wallet = new Wallet(config.backendPrivateKey, provider);
      const pay = new Contract(config.payWithQuaiAddress, paywithquaiAbi, wallet);

      const tx = payer
        ? await pay.registerOrderWithPayer(
            orderId,
            config.tokenAddress,
            total,
            expiry,
            payer
          )
        : await pay.registerOrder(
            orderId,
            config.tokenAddress,
            total,
            expiry
          );
      await tx.wait();
      txHash = tx.hash;
      registered = true;
    } catch (err) {
      console.error("Failed to register order on-chain:", err);
    }
  }

  const checkoutUrl = `${req.nextUrl.origin}/checkout/${config.merchantAddress}/${orderId}`;

  return NextResponse.json({
    orderId,
    amount: total.toString(),
    token: config.tokenAddress,
    payer: payer || null,
    registered,
    txHash,
    checkoutUrl,
  });
}