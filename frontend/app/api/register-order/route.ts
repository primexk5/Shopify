import { checkoutTerms } from "@/lib/worldz-checkout";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const apiKey = process.env.WORLDZ_API_KEY;
  const apiBase = process.env.WORLDZ_API_BASE;
  const checkoutOrigin = process.env.WORLDZ_CHECKOUT_ORIGIN;
  const merchantId = process.env.WORLDZ_MERCHANT_ID;
  const payout = process.env.WORLDZ_PAYOUT_ACCOUNT_ID;
  if (!apiKey || !apiBase || !checkoutOrigin || !merchantId || !payout) {
    return Response.json({ error: "WorldzPayments checkout is not configured" }, { status: 503 });
  }
  if (req.headers.get("origin") && req.headers.get("origin") !== new URL(req.url).origin) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  }
  let terms;
  try { terms = checkoutTerms(await req.json()); }
  catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid cart" }, { status: 400 });
  }
  try {
    const origin = new URL(checkoutOrigin);
    const api = new URL(apiBase.replace(/\/$/, "") + "/links");
    if (origin.protocol !== "https:" || api.protocol !== "https:" || origin.username || origin.password || api.username || api.password) throw new Error("Invalid Worldz URLs");
    const response = await fetch(api, {
      method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(terms), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      return Response.json({ error: response.status === 401 ? "Worldz merchant API key was rejected" : "WorldzPayments could not create the payment link" }, { status: 502 });
    }
    const result = await response.json();
    if (typeof result.slug !== "string" || !/^[a-zA-Z0-9_-]+$/.test(result.slug) || result.merchantId !== merchantId || result.payoutAccountId !== payout || result.networkId !== "testnet" || result.amount !== terms.amount || result.asset?.type !== "native" || result.asset?.symbol !== "NEAR" || result.asset?.decimals !== 24) throw new Error("Unexpected payment link terms");
    // The hosted checkout connects the payer wallet and claims the actual order.
    return Response.json({ checkoutUrl: new URL(`/pay/${result.slug}`, origin).toString() }, { status: 201 });
  } catch {
    return Response.json({ error: "Unable to start WorldzPayments checkout. Check merchant settings and deployment availability." }, { status: 502 });
  }
}
