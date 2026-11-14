const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");
const { mkdtemp, readdir, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { verifyEvent, storeEvent } = require("../.test-build/worldz-webhook.js");
const { checkoutTerms } = require("../.test-build/worldz-checkout.js");
const settings = { secret: "synthetic-local-secret", merchantId: "merchant-test", payoutAccountId: "merchant.testnet" };
function fixture() {
  return { id: "synthetic-event", type: "payment.confirmed", created: Math.floor(Date.now() / 1000), data: {
    merchantId: settings.merchantId, payoutAccountId: settings.payoutAccountId,
    payerAccountId: "payer.testnet", orderId: "synthetic-order", networkId: "testnet", state: "SETTLED",
    contractId: "router.testnet", transactionHash: "synthetic-transaction", settlementReceiptId: "synthetic-receipt",
    asset: { type: "native", symbol: "NEAR", decimals: 24 }, amount: "1000", fee: "3", net: "997",
  } };
}
function signed(event) {
  const raw = Buffer.from(JSON.stringify(event));
  const signature = "sha256=" + createHmac("sha256", settings.secret).update(raw).digest("hex");
  return { raw, headers: new Headers({ "x-worldz-signature": signature, "x-worldz-event-id": event.id }) };
}
test("verifies the exact bytes; rejects missing/malformed signatures, tampering and absent configuration", () => {
  const event = fixture(); const { raw, headers } = signed(event);
  assert.deepEqual(verifyEvent(raw, headers, settings), event);
  assert.throws(() => verifyEvent(Buffer.concat([raw, Buffer.from(" ")]), headers, settings), { status: 401 });
  for (const signature of ["", "sha256=ab", "sha256=" + "g".repeat(64)]) {
    assert.throws(() => verifyEvent(raw, new Headers({ "x-worldz-signature": signature }), settings), { status: 401 });
  }
  assert.throws(() => verifyEvent(raw, headers, { ...settings, secret: "" }), { status: 503 });
  headers.set("x-worldz-event-id", "other-event");
  assert.throws(() => verifyEvent(raw, headers, settings), { status: 400 });
});
test("rejects signed events with stale timestamps, wrong recipients, network, asset, state or arithmetic", () => {
  for (const mutate of [
    e => e.created -= 301, e => e.created += 301,
    e => e.data.merchantId = "other", e => e.data.payoutAccountId = "other.testnet",
    e => e.data.networkId = "mainnet", e => e.data.state = "OPEN", e => e.type = "other",
    e => e.data.asset.decimals = 18, e => e.data.asset.type = "nep141",
    e => e.data.settlementReceiptId = "", e => e.data.transactionHash = "",
    e => e.data.net = "998", e => e.data.amount = 1000,
    e => e.data.amount = "-1000", e => e.data.amount = (2n ** 128n).toString(),
  ]) {
    const event = fixture(); mutate(event); const { raw, headers } = signed(event);
    assert.throws(() => verifyEvent(raw, headers, settings), { status: 400 });
  }
});
test("durable event storage deduplicates concurrent/restarted retries, handles new timestamps and detects changed payment data", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "worldz-receiver-test-"));
  try {
    const event = fixture(); const { raw } = signed(event);
    const results = await Promise.all(Array.from({ length: 8 }, () => storeEvent(directory, event, raw)));
    assert.equal(results.filter(Boolean).length, 1);
    const retry = { ...event, created: event.created + 60 };
    assert.equal(await storeEvent(directory, retry, signed(retry).raw), false);
    assert.equal((await readdir(directory)).length, 1);
    const changed = structuredClone(event); changed.data.orderId = "other-order";
    await assert.rejects(storeEvent(directory, changed, signed(changed).raw), { status: 409 });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test("checkout derives exact yoctoNEAR totals from the catalog and rejects invalid carts", () => {
  const terms = checkoutTerms({ items: [{ productId: "quai-hoodie", qty: 2 }, { productId: "sticker-pack", qty: 1 }], amount: "1" });
  assert.equal(terms.amount, "70000000000000000000000");
  assert.equal(terms.amountDisplay, "0.07");
  assert.equal(terms.networkId, "testnet");
  assert.equal(terms.multiPay, false);
  for (const body of [null, {}, { items: [] }, { items: [{ productId: "missing", qty: 1 }] },
    ...[0, -1, 1.5, 21, "1"].map(qty => ({ items: [{ productId: "quai-hoodie", qty }] })),
    { items: [{ productId: "quai-hoodie", qty: 1 }, { productId: "quai-hoodie", qty: 2 }] },
  ]) assert.throws(() => checkoutTerms(body));
});
