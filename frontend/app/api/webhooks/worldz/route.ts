import { verifyEvent, WebhookError } from "@/lib/worldz-webhook";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const raw = Buffer.from(await req.arrayBuffer());
    if (raw.length > 128 * 1024) return Response.json({ error: "Body too large" }, { status: 413 });
    const event = verifyEvent(raw, req.headers, {
      secret: process.env.WORLDZ_WEBHOOK_SIGNING_SECRET ?? "",
      merchantId: process.env.WORLDZ_MERCHANT_ID ?? "",
      payoutAccountId: process.env.WORLDZ_PAYOUT_ACCOUNT_ID ?? "",
    });
    const base = process.env.WORLDZ_API_BASE;
    const key = process.env.WORLDZ_API_KEY;
    if (!base || !key) throw new WebhookError("Durable receipt storage is not configured", 503);
    const endpoint = new URL(base.replace(/\/$/, "") + "/me/webhook-receipts");
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password) throw new WebhookError("Invalid receipt storage URL", 503);
    // Preserve the original sender bytes/signature. The backend verifies them
    // again, matches its finalized merchant event and deduplicates in PostgreSQL.
    const response = await fetch(endpoint, {
      method: "POST", redirect: "error", cache: "no-store",
      headers: { "content-type": "application/json", Authorization: `Bearer ${key}`,
        "x-worldz-signature": req.headers.get("x-worldz-signature") ?? "",
        "x-worldz-event-id": event.id },
      body: new Uint8Array(raw), signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      console.error("Durable webhook receipt rejected", { status: response.status, eventId: event.id });
      throw new WebhookError("Durable receipt storage rejected the event; retry delivery", 503);
    }
    const receipt = await response.json();
    if (receipt.eventId !== event.id || receipt.signatureVerified !== true || !["accepted", "duplicate"].includes(receipt.result)) {
      throw new WebhookError("Invalid receipt storage response", 503);
    }
    console.info(JSON.stringify({ ...receipt, orderId: event.data.orderId, settlementReceiptId: event.data.settlementReceiptId }));
    return Response.json(receipt);
  } catch (error) {
    if (error instanceof WebhookError) return Response.json({ error: error.message }, { status: error.status });
    console.error("Worldz webhook durable receipt storage failed");
    return Response.json({ error: "Evidence storage unavailable; retry delivery" }, { status: 503 });
  }
}
