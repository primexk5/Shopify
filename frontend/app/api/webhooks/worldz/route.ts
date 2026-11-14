import path from "node:path";
import { storeEvent, verifyEvent, WebhookError } from "@/lib/worldz-webhook";

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
    const accepted = await storeEvent(process.env.WORLDZ_EVIDENCE_DIR || path.join(process.cwd(), ".worldz-evidence"), event, raw);
    console.info(JSON.stringify({ result: accepted ? "accepted" : "duplicate", signatureVerified: true,
      eventId: event.id, orderId: event.data.orderId, settlementReceiptId: event.data.settlementReceiptId }));
    return Response.json({ result: accepted ? "accepted" : "duplicate", signatureVerified: true, eventId: event.id });
  } catch (error) {
    if (error instanceof WebhookError) return Response.json({ error: error.message }, { status: error.status });
    console.error("Worldz webhook evidence storage failed");
    return Response.json({ error: "Evidence storage unavailable; retry delivery" }, { status: 503 });
  }
}
