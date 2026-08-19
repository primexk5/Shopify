import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "@/lib/config";

export const runtime = "nodejs";

interface WebhookPayload {
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

const FULFILLED: Record<string, string> = {};

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
  if (!FULFILLED[key]) {
    FULFILLED[key] = net;
    console.log(`Order ${orderId} confirmed — net ${net} (${txHash})`);
  }

  return NextResponse.json({ ok: true });
}