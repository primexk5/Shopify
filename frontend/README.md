# WorldzPayments NEAR test storefront

This existing Next.js storefront now starts native NEAR **testnet** checkout from each product's **Pay with NEAR** button or from the cart. Product prices are 0.01–0.03 testnet NEAR. The hosted WorldzPayments checkout handles the payer wallet, order claim and payment approval. Existing merchandise images remain unchanged.

This repository is a standalone demo storefront. It is not a Shopify-installed app and does not create or fulfil real Shopify orders. A successful test here proves the hosted payment/webhook path only.

## Configure locally

Use Node.js 20.9+ and install with `npm ci`. Copy `.env.example` to `.env.local` and set:

- `WORLDZ_API_BASE`: deployed frontend origin plus `/api/v1`, or backend origin plus `/v1`.
- `WORLDZ_CHECKOUT_ORIGIN`: the hosted WorldzPayments frontend origin, without an API path.
- `WORLDZ_API_KEY`: active merchant API key created in WorldzPayments Settings. This is used server-side to create links.
- `WORLDZ_MERCHANT_ID`: the matching merchant ID from `/api/v1/me`.
- `WORLDZ_PAYOUT_ACCOUNT_ID`: the matching NEAR testnet payout account.
- `WORLDZ_WEBHOOK_SIGNING_SECRET`: **the exact value of `WEBHOOK_SIGNING_SECRET` in the Worldz backend deployment**. An API key, Shopify secret or wallet key cannot replace it.

Keep secrets in `.env.local`; do not paste them into frontend code, chat or recordings. No wallet seed/private key is needed by this app. The payer approves payment in the hosted checkout.

Run `npm run dev`. Expose this storefront through a public HTTPS tunnel, for example `cloudflared tunnel --url http://localhost:3000`. In WorldzPayments Settings save:

```text
https://YOUR-TUNNEL/api/webhooks/worldz
```

Both the storefront and tunnel must stay running. Save the webhook URL **before** starting a new payment. The receiver uses authenticated WorldzPayments backend receipt storage in PostgreSQL. Deploy backend migration `0011_webhook_receiver_receipts.sql` and its new API before this version. No local Vercel disk or extra storage credential is needed.

## Live test

1. Open a product and select **Pay with NEAR** (or use the cart). The server calculates catalog prices and creates a single-use link that expires in one hour.
2. On WorldzPayments, verify testnet, the payout recipient and amount. Connect a funded NEAR testnet payer wallet and approve one small native payment. Wait for verified settlement.
3. The storefront server prints `accepted`, `signatureVerified: true`, event ID, order ID and settlement receipt. It forwards the exact signed bytes to the authenticated Worldz API, which verifies the signature again, matches the finalized event and commits a durable receipt before HTTP 200. Retrieve it with GET /me/webhook-receipts/{eventId}.
4. Match that file's order, transaction, settlement receipt, asset, amount, fee and net against the merchant receipt and genuine NEAR testnet router/explorer evidence. Inspect `/api/v1/me/deliveries` while signed in to WorldzPayments to confirm delivery.
5. Retry the same valid event within five minutes: expect `duplicate` and one durable receipt. A backend retry with a new envelope timestamp is also deduplicated. Changing body bytes without re-signing returns 401. Missing receiver configuration or storage failures return 503 so the sender retries.

The receiver enforces raw-byte HMAC-SHA256, event/header agreement, a five-minute delivery timestamp, merchant/payout binding, native NEAR, testnet, SETTLED, settlement references and balanced amounts. These checks authenticate a backend notification; independently inspect on-chain settlement. It records merchant events and does not associate them with inventory, fulfil orders or synchronize Shopify. After fixing a failed callback, use Retry webhook in WorldzPayments payment details, or authenticated POST /me/deliveries/{eventId}/retry, to requeue the existing event without another payment.

The old PayWithQuai webhook and public payment/status endpoints return 410. Old local checkout URLs return to the new cart. Payment evidence is available through the authenticated merchant receipt API rather than a public debug endpoint. The older local storeEvent helper remains for its synthetic tests; the deployed receiver does not use WORLDZ_EVIDENCE_DIR.

## Checks

```sh
npx tsc --outDir .test-build --module commonjs --target ES2022 --esModuleInterop --skipLibCheck lib/worldz-webhook.ts lib/worldz-checkout.ts
node tests/worldz.test.cjs
npm run build
```

These synthetic tests verify validation, amount calculation, durable duplicate handling and tamper rejection. They do not prove a live payment, sender retry or Shopify integration succeeded.

## Actual Shopify product-page integration

To test Shopify itself, use the WorldzPayments repository's existing Shopify bridge: configure its Shopify app/backend, install it on a Shopify development store, connect that store in WorldzPayments Settings, configure a product/variant's `worldz.payment` metafield and enable the theme app block. Start checkout from that block and verify the paid Shopify order after settlement. Needed: dev-store `.myshopify.com` domain, product/variant, app installation and merchant connection, and server-side Shopify app credentials/encryption key. Follow the WorldzPayments product guide and the supplied verification PDF. A standalone payment-link checkout here does not establish Shopify order synchronization.

The storefront was built using its locked Next.js 16.3.1 dependencies. Synthetic receiver tests cover byte preservation, durable acknowledgements, duplicates, tamper rejection and backend storage failures. Live payment and deployment observations are recorded separately in the WorldzPayments evidence index.
