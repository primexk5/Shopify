import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { config } from "@/lib/config";
import {
  notifyDiscord,
  recordPayment,
  relayToMerchant,
  type WebhookPayload,
} from "@/lib/fulfillment";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const raw = await req.text();
  const header = req.headers.get("X-PayWithQuai-Signature") ?? "";

  if (!config.webhookSecret) {
    console.warn("WEBHOOK_SECRET not set — accepting webhook unverified (dev mode)");
  } else {
    if (!header) return NextResponse.json({}, { status: 401 });
    const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
    const t = Number(parts["t"]);
    const v1 = parts["v1"] ?? "";

    if (!Number.isFinite(t) || Math.abs(Math.floor(Date.now() / 1000) - t) > 300) {
      return NextResponse.json({}, { status: 400 });
    }

    const expected = createHmac("sha256", config.webhookSecret)
      .update(`${t}.${raw}`)
      .digest();
    const received = Buffer.from(v1, "hex");
    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    ) {
      return NextResponse.json({}, { status: 401 });
    }
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(raw) as WebhookPayload;
  } catch {
    return NextResponse.json({}, { status: 400 });
  }

  if (payload.type !== "payment.confirmed") {
    return NextResponse.json({}, { status: 200 });
  }

  const { orderId, net, txHash } = payload.data;
  const key = `${orderId}:${txHash}`;

  // Idempotent: acknowledge duplicates without re-fulfilling.
  const recorded = recordPayment(payload);
  if (recorded) {
    console.log(`Order ${orderId} confirmed — net ${net} (${txHash})`);
    // Fulfill after responding so the relayer gets its 2xx immediately.
    after(async () => {
      try {
        await relayToMerchant(payload, header, key);
      } catch (err) {
        console.error(`Fulfillment relay failed for ${orderId}:`, err);
      }
      try {
        await notifyDiscord(payload);
      } catch (err) {
        console.error(`Discord notify failed for ${orderId}:`, err);
      }
    });
  }

  return NextResponse.json({ ok: true, recorded });
}