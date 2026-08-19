import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const merchant = req.nextUrl.searchParams.get("merchant") ?? config.merchantAddress;

  try {
    const res = await fetch(
      `${config.platformApiBase}/v1/orders/${merchant}/${orderId}`,
      { cache: "no-store", signal: AbortSignal.timeout(10_000) }
    );
    if (res.status === 404) {
      return NextResponse.json(null, { status: 404 });
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: `Platform lookup failed: ${res.status}` },
        { status: 502 }
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("Order status lookup failed:", err);
    return NextResponse.json(
      { error: "Unable to look up order status" },
      { status: 502 }
    );
  }
}