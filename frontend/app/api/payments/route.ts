import { NextResponse } from "next/server";
import { listPayments } from "@/lib/fulfillment";

export const dynamic = "force-dynamic";

/** Debug/dev view of payments this instance has received via webhook.
 *  In-memory only — resets on cold start. Use this to check webhook arrival
 *  latency: receivedAt vs the payment's on-chain timestamp. */
export async function GET() {
  return NextResponse.json({ payments: listPayments() });
}