export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const config = {
  // Client-safe (NEXT_PUBLIC_*) — read in the browser for on-chain reads and payments.
  payWithQuaiAddress:
    process.env.NEXT_PUBLIC_PAYWITHQUAI_ADDRESS ??
    process.env.PAYWITHQUAI_ADDRESS ??
    "0x0000000000000000000000000000000000000000",
  rpcUrl:
    process.env.NEXT_PUBLIC_RPC_URL ?? "https://orchard.rpc.quai.network",
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 15000),

  // Server-only secrets (never exposed to the browser).
  merchantAddress: process.env.MERCHANT_ADDRESS ?? "",
  backendPrivateKey: process.env.BACKEND_PRIVATE_KEY ?? "",
  webhookSecret: process.env.WEBHOOK_SECRET ?? "",
  platformApiBase: process.env.PLATFORM_API_BASE ?? "https://quai-merchant-three.vercel.app",
  // Where verified payments are forwarded for fulfillment (e.g. Shopify webhook
  // receiver). Empty = accept + record but don't relay.
  merchantFulfillmentUrl: process.env.MERCHANT_FULFILLMENT_URL ?? "",
  // Optional Discord webhook for instant payment alerts.
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL ?? "",
  tokenAddress: process.env.TOKEN_ADDRESS ?? ZERO_ADDRESS,
};

export const QUAI_DECIMALS = 18;
export const QUAI_WEI = 10n ** BigInt(QUAI_DECIMALS);

export function toQuaiUnits(quai: number): bigint {
  return BigInt(Math.round(quai * Number(QUAI_WEI)));
}

export function formatQuai(wei: string | bigint): string {
  const value = BigInt(wei);
  const whole = value / QUAI_WEI;
  const frac = (value % QUAI_WEI).toString().padStart(QUAI_DECIMALS, "0");
  const trimmed = frac.replace(/0+$/, "").slice(0, 4);
  return trimmed ? `${whole}.${trimmed}` : whole.toString();
}