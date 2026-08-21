"use client";

import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import {
  blipBrowserLink,
  checkoutPageUrl,
  connectWallet,
  detectWallets,
  fetchOrderStatus,
  formatAmount,
  getOrderOnChain,
  isInsideBlipBrowser,
  isNativeOrder,
  netAmount,
  parseError,
  payOrder,
  payOrderNative,
  type OnChainOrder,
} from "@/lib/paywithquai";
import { ZERO_ADDRESS } from "@/lib/config";

type Params = Promise<{ merchant: string; orderId: string }>;

type Stage =
  | { name: "loading" }
  | { name: "notfound" }
  | { name: "expired" }
  | { name: "settled" }
  | { name: "ready" }
  | { name: "paying"; step: string }
  | { name: "done"; txHash: string; net: string }
  | { name: "error"; message: string };

function isExpired(expiry: bigint): boolean {
  return expiry > 0n && Math.floor(Date.now() / 1000) > Number(expiry);
}

export default function CheckoutPage({ params }: { params: Params }) {
  const [stage, setStage] = useState<Stage>({ name: "loading" });
  const [merchant, setMerchant] = useState("");
  const [orderId, setOrderId] = useState("");
  const [order, setOrder] = useState<OnChainOrder | null>(null);
  const [payTab, setPayTab] = useState<"blip" | "wallet">("wallet");
  const [connected, setConnected] = useState<string | null>(null);
  const [insideBlip, setInsideBlip] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setInsideBlip(isInsideBlipBrowser());
      if (merchant && orderId) {
        setCheckoutUrl(checkoutPageUrl(merchant, orderId));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [merchant, orderId]);

  /** Inside Blip's browser: auto-connect window.quai so pay is one tap. */
  useEffect(() => {
    if (!insideBlip || connected || stage.name !== "ready") return;
    const blip = detectWallets().find((w) => w.brand === "blip");
    if (!blip) return;
    void connectWallet()
      .then(setConnected)
      .catch(() => undefined);
  }, [insideBlip, connected, stage.name]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { merchant: m, orderId: id } = await params;
      if (cancelled) return;
      setMerchant(m);
      setOrderId(id);
      try {
        let o = await getOrderOnChain(m, id);
        if (!o?.exists) {
          const status = await fetchOrderStatus(m, id);
          if (!status) {
            setStage({ name: "notfound" });
            return;
          }
          o = {
            merchant: m,
            settled: status.settled,
            exists: true,
            feeBps: status.feeBps,
            token: status.token,
            amount: BigInt(status.amount),
            expiry: BigInt(status.expiry),
            feeRecipient: ZERO_ADDRESS,
            settledAt: 0n,
            expectedPayer: ZERO_ADDRESS,
            nonce: 0n,
          };
        }
        if (!o) {
          setStage({ name: "notfound" });
          return;
        }
        setOrder(o);
        if (!o.exists) {
          setStage({ name: "notfound" });
        } else if (o.settled) {
          setStage({ name: "settled" });
        } else if (isExpired(o.expiry)) {
          setStage({ name: "expired" });
        } else {
          setStage({ name: "ready" });
        }
      } catch {
        setStage({ name: "error", message: "Could not load this order — try again." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params]);

  const symbol = (o: OnChainOrder) => (isNativeOrder(o) ? "QUAI" : "token");

  const payerAllowed = (o: OnChainOrder) => {
    if (o.expectedPayer === ZERO_ADDRESS) return true;
    return (
      connected !== null &&
      o.expectedPayer.toLowerCase() === connected.toLowerCase()
    );
  };

  const connectAndPay = async () => {
    if (!order) return;
    if (!connected) {
      try {
        setConnected(await connectWallet());
      } catch (err) {
        setStage({ name: "error", message: parseError(err) });
        return;
      }
    }
    if (!payerAllowed(order)) {
      setStage({
        name: "error",
        message: `This order is reserved for ${order.expectedPayer} — your wallet cannot settle it.`,
      });
      return;
    }
    try {
      setStage({ name: "paying", step: "Awaiting wallet approval…" });
      const txHash = isNativeOrder(order)
        ? await payOrderNative(order.merchant, orderId, order.amount)
        : await payOrder(order.merchant, orderId, order.token, order.amount);
      setStage({
        name: "done",
        txHash,
        net: formatAmount(order, netAmount(order)),
      });
    } catch (err: unknown) {
      setStage({ name: "error", message: parseError(err) });
    }
  };

  if (stage.name === "done") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-400/10 text-emerald-300 text-2xl">
          ✓
        </div>
        <p className="mt-6 text-sm text-emerald-300">Payment confirmed</p>
        <h1 className="mt-2 text-3xl font-semibold">{stage.net} QUAI sent</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-zinc-400">
          The merchant receives the payment directly. Your payment is complete
          once the transaction is confirmed on-chain.
        </p>
        <div className="mt-6 space-y-2 rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-left font-mono text-xs text-zinc-500">
          <p className="break-all">
            tx: <span className="text-zinc-100">{stage.txHash}</span>
          </p>
          <p className="break-all">
            order: <span className="text-zinc-100">{orderId.slice(0, 20)}…</span>
          </p>
        </div>
        <Link
          href="/"
          className="mt-6 inline-block w-full rounded-xl bg-amber-400 py-3 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
        >
          Back to shop
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-amber-400">
        ← Back to shop
      </Link>

      <div className="mt-10 rounded-3xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Secure checkout</p>
            <p className="mt-1 text-xs text-zinc-400">
              Pay with Quai — non-custodial
            </p>
          </div>
          <span className="text-amber-400 font-semibold">QuaiShop</span>
        </div>

        <div className="my-7 h-px bg-zinc-800" />

        {stage.name === "loading" && (
          <div className="flex flex-col items-center gap-3 py-12 text-sm text-zinc-400">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-amber-400" />
            Loading order…
          </div>
        )}

        {stage.name === "notfound" && (
          <div className="py-10 text-center">
            <p className="text-sm font-medium">Order not found</p>
            <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-zinc-400">
              No order matches this link — it may not have been registered yet,
              or the address is wrong. Ask the merchant for a fresh payment link.
            </p>
          </div>
        )}

        {stage.name === "expired" && (
          <div className="py-10 text-center">
            <p className="text-sm font-medium">Order expired</p>
            <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-zinc-400">
              This payment link has passed its expiry. Ask the merchant to issue
              a new one.
            </p>
          </div>
        )}

        {stage.name === "settled" && (
          <div className="py-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-400/10 text-emerald-300 text-xl">
              ✓
            </div>
            <p className="mt-4 text-sm font-medium">Already paid</p>
            <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-zinc-400">
              This order was settled. The merchant has been notified via webhook.
            </p>
          </div>
        )}

        {["ready", "paying"].includes(stage.name) && order && (
          <>
            <div className="text-center">
              <p className="text-sm text-zinc-400">Total to pay</p>
              <p className="mt-2 text-5xl font-semibold tracking-tight">
                {formatAmount(order, order.amount)}
              </p>
              <p className="mt-1 text-sm text-amber-400">{symbol(order)}</p>
              {order.feeBps > 0 && (
                <p className="mt-2 text-xs text-zinc-400">
                  includes {(order.feeBps / 100).toFixed(1)}% platform fee ·
                  merchant receives{" "}
                  <span className="text-zinc-100">
                    {formatAmount(order, netAmount(order))} {symbol(order)}
                  </span>
                </p>
              )}
            </div>

            <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
              <p className="text-xs text-zinc-400">Pay to merchant</p>
              <p className="mt-1 break-all font-mono text-xs text-zinc-100">
                {order.merchant}
              </p>
            </div>

            {stage.name === "ready" && (
              <>
                {insideBlip ? (
                  <div className="mt-6 rounded-2xl border border-amber-400/25 bg-zinc-900 p-6">
                    <p className="text-center text-sm font-medium">
                      Pay with Blip
                    </p>
                    <p className="mt-2 text-center text-xs leading-5 text-zinc-400">
                      Confirm in Blip to settle this order on PayWithQuai — the
                      merchant gets the same webhook as a browser wallet payment.
                    </p>
                    <div className="mt-5 space-y-3">
                      {connected ? (
                        <>
                          <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-center">
                            <p className="text-xs text-zinc-400">Paying as</p>
                            <p className="mt-1 break-all font-mono text-xs text-zinc-100">
                              {connected}
                            </p>
                          </div>
                          {!payerAllowed(order) && (
                            <p className="rounded-xl border border-amber-400/20 px-4 py-3 text-center text-xs text-amber-300">
                              This order is reserved for another wallet — you
                              can&apos;t settle it.
                            </p>
                          )}
                          <button
                            onClick={() => void connectAndPay()}
                            disabled={!payerAllowed(order)}
                            className="w-full rounded-xl bg-amber-400 py-3.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
                          >
                            Pay {formatAmount(order, order.amount)}{" "}
                            {symbol(order)}
                          </button>
                        </>
                      ) : (
                        <div className="flex items-center justify-center gap-2 py-4 text-sm text-zinc-400">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-amber-400" />
                          Connecting Blip wallet…
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    {checkoutUrl && (
                      <div className="mt-6 flex flex-col items-center rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
                        <div className="rounded-2xl bg-white p-3">
                          <QRCodeSVG value={checkoutUrl} size={160} />
                        </div>
                        <p className="mt-4 text-sm font-medium">Scan to pay</p>
                        <p className="mt-2 max-w-xs text-center text-xs leading-5 text-zinc-400">
                          Opens this checkout on your phone — pay with Blip
                          (in-app browser) or any browser wallet (Pelagus,
                          MetaMask).
                        </p>
                      </div>
                    )}

                    <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
                      <div className="flex border-b border-zinc-800">
                        {isNativeOrder(order) && (
                          <button
                            onClick={() => setPayTab("blip")}
                            className={`flex flex-1 items-center justify-center gap-2 py-3 text-sm font-medium transition ${
                              payTab === "blip"
                                ? "border-b-2 border-amber-400 text-white"
                                : "text-zinc-400 hover:text-white"
                            }`}
                          >
                            Pay with Blip
                          </button>
                        )}
                        <button
                          onClick={() => setPayTab("wallet")}
                          className={`flex flex-1 items-center justify-center gap-2 py-3 text-sm font-medium transition ${
                            payTab === "wallet" || !isNativeOrder(order)
                              ? "border-b-2 border-amber-400 text-white"
                              : "text-zinc-400 hover:text-white"
                          }`}
                        >
                          Browser Wallet
                        </button>
                      </div>

                      {payTab === "blip" && isNativeOrder(order) && checkoutUrl && (
                        <div className="flex flex-col items-center p-6">
                          <p className="mb-5 text-center text-xs leading-5 text-zinc-400">
                            Opens this checkout inside the Blip app. Tap Pay
                            there to settle the order on-chain — the merchant
                            dashboard updates via webhook, same as wallet connect.
                          </p>
                          <a
                            href={blipBrowserLink(checkoutUrl)}
                            className="w-full rounded-xl bg-amber-400 py-3 text-center text-sm font-semibold text-zinc-950 hover:bg-amber-300"
                          >
                            Open in Blip app
                          </a>
                          <p className="mt-3 text-center text-xs text-zinc-500">
                            Don&apos;t have Blip?{" "}
                            <a
                              href="https://blippay.me"
                              target="_blank"
                              rel="noreferrer"
                              className="text-amber-400 hover:underline"
                            >
                              Download Blip (iOS & Android)
                            </a>
                          </p>
                        </div>
                      )}

                      {payTab === "wallet" && (
                        <div className="p-6">
                          <p className="mb-4 text-center text-xs text-zinc-400">
                            Connect any Quai-compatible browser wallet (Pelagus,
                            Blip in-app browser, or MetaMask).
                          </p>
                          {connected ? (
                            <div className="space-y-3">
                              <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-center">
                                <p className="text-xs text-zinc-400">Paying as</p>
                                <p className="mt-1 break-all font-mono text-xs text-zinc-100">
                                  {connected}
                                </p>
                              </div>
                              {!payerAllowed(order) && (
                                <p className="rounded-xl border border-amber-400/20 px-4 py-3 text-center text-xs text-amber-300">
                                  This order is reserved for another wallet — you
                                  can&apos;t settle it.
                                </p>
                              )}
                              <button
                                onClick={() => void connectAndPay()}
                                disabled={!payerAllowed(order)}
                                className="w-full rounded-xl bg-amber-400 py-3.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
                              >
                                Pay {formatAmount(order, order.amount)}{" "}
                                {symbol(order)}
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => void connectAndPay()}
                              disabled={stage.name !== "ready"}
                              className="w-full rounded-xl bg-amber-400 py-3.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
                            >
                              Connect wallet & pay
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}

                <div className="mt-5 flex items-center justify-center gap-5 text-xs text-zinc-400">
                  <span>Secure</span>
                  <span>Non-custodial</span>
                </div>
              </>
            )}

            {stage.name === "paying" && (
              <div className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 py-3.5 text-sm text-zinc-400">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-amber-400" />
                {stage.step}
              </div>
            )}

          </>
        )}

        {stage.name === "error" && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-950 px-4 py-3 text-sm text-red-300">
            {stage.message}
            <button
              onClick={() => {
                setStage({ name: "loading" });
                void (async () => {
                  try {
                    const o = await getOrderOnChain(merchant, orderId);
                    setOrder(o);
                    setStage({ name: "ready" });
                  } catch {
                    setStage({ name: "error", message: "Could not load this order." });
                  }
                })();
              }}
              className="mt-2 block text-xs text-amber-400 hover:underline"
            >
              Try again
            </button>
          </div>
        )}
      </div>

      <p className="mt-5 text-center text-xs text-zinc-500">
        Checkout powered by PayWithQuai — the merchant registered this order
        on-chain; your payment goes directly to their wallet.
      </p>
    </div>
  );
}