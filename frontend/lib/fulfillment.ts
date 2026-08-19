import { config, formatQuai } from "./config";

export interface WebhookPayload {
  id: string;
  type: string;
  data: {
    merchantId: string;
    merchant: string;
    orderId: string;
    payer: string;
    token: string;
    amount: string;
    feeBps: number;
    fee: string;
    net: string;
    txHash: string;
    blockNumber: number;
    timestamp: number;
    nonce: number;
  };
}

export interface RecordedPayment {
  key: string;
  orderId: string;
  txHash: string;
  payer: string;
  amount: string;
  net: string;
  blockNumber: number;
  receivedAt: number;
  relayStatus: "pending" | "sent" | "failed" | "skipped";
}

const PAYMENTS = new Map<string, RecordedPayment>();
const MAX_PAYMENTS = 100;

/** Idempotent ledger of confirmed payments. In-memory only (serverless instance);
 *  durable persistence needs a store like Vercel KV — see MERCHANT_FULFILLMENT_URL
 *  for the durable outbound path. Returns true when this payment is new. */
export function recordPayment(payload: WebhookPayload): boolean {
  const key = `${payload.data.orderId}:${payload.data.txHash}`;
  if (PAYMENTS.has(key)) return false;
  const entry: RecordedPayment = {
    key,
    orderId: payload.data.orderId,
    txHash: payload.data.txHash,
    payer: payload.data.payer,
    amount: payload.data.amount,
    net: payload.data.net,
    blockNumber: payload.data.blockNumber,
    receivedAt: Date.now(),
    relayStatus: "pending",
  };
  PAYMENTS.set(key, entry);
  while (PAYMENTS.size > MAX_PAYMENTS) {
    PAYMENTS.delete(PAYMENTS.keys().next().value as string);
  }
  return true;
}

export function markRelay(key: string, status: RecordedPayment["relayStatus"]): void {
  const entry = PAYMENTS.get(key);
  if (entry) entry.relayStatus = status;
}

export function listPayments(): RecordedPayment[] {
  return [...PAYMENTS.values()].sort((a, b) => b.receivedAt - a.receivedAt);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Forward the verified payment to the merchant's fulfillment backend (e.g. a
 *  Shopify order-fulfillment webhook receiver). Replays the original signature
 *  header so the receiver can re-verify the payload itself. */
export async function relayToMerchant(
  payload: WebhookPayload,
  signatureHeader: string,
  key: string,
): Promise<void> {
  const url = config.merchantFulfillmentUrl;
  if (!url) {
    markRelay(key, "skipped");
    return;
  }
  let lastErr: unknown;
  for (const delay of [0, 1000, 3000]) {
    if (delay > 0) await sleep(delay);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-paywithquai-signature": signatureHeader,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8_000),
      });
      if (res.ok) {
        markRelay(key, "sent");
        return;
      }
      lastErr = new Error(`merchant fulfillment returned ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
  }
  markRelay(key, "failed");
  throw lastErr;
}

/** Instant merchant alert on every confirmed payment. Optional — set DISCORD_WEBHOOK_URL. */
export async function notifyDiscord(payload: WebhookPayload): Promise<void> {
  const url = config.discordWebhookUrl;
  if (!url) return;
  const { data } = payload;
  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      embeds: [
        {
          title: "Payment confirmed",
          color: 0x2ecc71,
          fields: [
            { name: "Order", value: data.orderId.slice(0, 20) + "…", inline: false },
            {
              name: "Net received",
              value: `${formatQuai(data.net)} QUAI`,
              inline: true,
            },
            { name: "Amount paid", value: `${formatQuai(data.amount)} QUAI`, inline: true },
            { name: "Payer", value: data.payer, inline: false },
            { name: "Transaction", value: data.txHash, inline: false },
          ],
          timestamp: new Date(data.timestamp * 1000).toISOString(),
        },
      ],
    }),
    signal: AbortSignal.timeout(8_000),
  });
}