import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { link, mkdir, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";

export interface WorldzEvent {
  id: string;
  type: "payment.confirmed";
  created: number;
  data: {
    merchantId: string; payoutAccountId: string; payerAccountId: string;
    orderId: string; networkId: "testnet"; state: "SETTLED";
    contractId: string; transactionHash: string; settlementReceiptId: string;
    asset: { type: "native"; symbol: "NEAR"; decimals: 24 };
    amount: string; fee: string; net: string;
  };
}

export class WebhookError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function verifyEvent(raw: Buffer, headers: Headers, settings: {
  secret: string; merchantId: string; payoutAccountId: string;
}, now = Date.now()): WorldzEvent {
  if (!settings.secret || !settings.merchantId || !settings.payoutAccountId) {
    throw new WebhookError("Webhook receiver is not configured", 503);
  }
  const signature = headers.get("x-worldz-signature") ?? "";
  if (!/^sha256=[a-f0-9]{64}$/i.test(signature)) throw new WebhookError("Invalid signature", 401);
  const expected = createHmac("sha256", settings.secret).update(raw).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex"))) throw new WebhookError("Invalid signature", 401);
  let event: WorldzEvent;
  try { event = JSON.parse(raw.toString("utf8")); }
  catch { throw new WebhookError("Invalid JSON", 400); }
  if (!event || typeof event !== "object" || !event.data || typeof event.data !== "object") throw new WebhookError("Invalid event envelope", 400);
  const data = event.data;
  if (typeof event.id !== "string" || !event.id || event.id !== headers.get("x-worldz-event-id")) throw new WebhookError("Event ID mismatch", 400);
  if (!Number.isInteger(event.created) || Math.abs(now / 1000 - event.created) > 300) throw new WebhookError("Delivery timestamp is outside five minutes", 400);
  if (event.type !== "payment.confirmed" || data.state !== "SETTLED" || data.networkId !== "testnet") throw new WebhookError("Expected a settled testnet payment", 400);
  if (data.merchantId !== settings.merchantId || data.payoutAccountId !== settings.payoutAccountId) throw new WebhookError("Merchant or payout account mismatch", 400);
  for (const key of ["orderId", "contractId", "payerAccountId", "transactionHash", "settlementReceiptId"] as const) {
    if (typeof data[key] !== "string" || !data[key]) throw new WebhookError(`Missing ${key}`, 400);
  }
  if (data.asset?.type !== "native" || data.asset.symbol !== "NEAR" || data.asset.decimals !== 24) throw new WebhookError("Expected native NEAR", 400);
  for (const value of [data.amount, data.fee, data.net]) {
    if (typeof value !== "string" || !/^\d{1,39}$/.test(value) || BigInt(value) >= 2n ** 128n) throw new WebhookError("Invalid base-unit amount", 400);
  }
  if (BigInt(data.amount) <= 0n || BigInt(data.fee) + BigInt(data.net) !== BigInt(data.amount)) throw new WebhookError("Invalid payment arithmetic", 400);
  return event;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

// Local test ledger on persistent disk. Atomic links deduplicate concurrent retries.
// Never serve this directory or commit its contents.
export async function storeEvent(directory: string, event: WorldzEvent, raw: Buffer): Promise<boolean> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const filename = path.join(directory, `${createHash("sha256").update(event.id).digest("hex")}.json`);
  const temporary = path.join(directory, `.${randomUUID()}.tmp`);
  try {
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(JSON.stringify({ eventId: event.id, acceptedAtUtc: new Date().toISOString(), signatureVerified: true,
        rawBodySha256: createHash("sha256").update(raw).digest("hex"), event }, null, 2) + "\n");
      await handle.sync();
    } finally { await handle.close(); }
    try { await link(temporary, filename); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existing = JSON.parse(await readFile(filename, "utf8"));
      // Retries get a freshly signed created timestamp; payment data must match.
      if (canonical(existing.event.data) !== canonical(event.data) || existing.event.type !== event.type) throw new WebhookError("Event ID reused with different payment data", 409);
      return false;
    }
    const directoryHandle = await open(directory, "r");
    try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
    return true;
  } finally { await unlink(temporary).catch(() => {}); }
}
