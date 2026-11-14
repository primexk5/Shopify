export async function GET() {
  return Response.json({ error: "This PayWithQuai endpoint has been retired. Use WorldzPayments checkout and /api/webhooks/worldz." }, { status: 410 });
}
