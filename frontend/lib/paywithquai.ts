import {
  BrowserProvider,
  Contract,
  JsonRpcProvider,
  formatQuai,
  id,
  parseQuai,
  type Signer,
} from "quais";
import paywithquaiAbi from "./paywithquai.abi.json";
import { config, ZERO_ADDRESS } from "./config";

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    pelagus?: Eip1193Provider;
    quai?: Eip1193Provider & { isBlip?: boolean };
    ethereum?: Eip1193Provider & { providers?: Eip1193Provider[] };
  }
}

export interface DetectedWallet {
  id: string;
  name: string;
  brand: "blip" | "pelagus" | "metamask" | "generic";
  provider: Eip1193Provider;
}

/** Detect the Quai-capable wallets injected in this browser: Blip (window.quai), Pelagus
 *  (window.pelagus) and MetaMask (window.ethereum, Quai network configured). */
export function detectWallets(): DetectedWallet[] {
  if (typeof window === "undefined") return [];
  const wallets: DetectedWallet[] = [];
  if (window.quai) {
    wallets.push({ id: "blip", name: "Blip", brand: "blip", provider: window.quai });
  }
  if (window.pelagus) {
    wallets.push({ id: "pelagus", name: "Pelagus", brand: "pelagus", provider: window.pelagus });
  }
  if (window.ethereum) {
    wallets.push({ id: "metamask", name: "MetaMask", brand: "metamask", provider: window.ethereum });
  }
  return wallets;
}

export function isInsideBlipBrowser(): boolean {
  if (typeof window === "undefined") return false;
  return !!window.quai;
}

export function checkoutPageUrl(merchant: string, orderId: string): string {
  const path = `/checkout/${merchant}/${orderId}`;
  if (typeof window !== "undefined") return `${window.location.origin}${path}`;
  return path;
}

export function blipBrowserLink(pageUrl: string): string {
  return `https://blippay.me/browser?url=${encodeURIComponent(pageUrl)}`;
}

async function getSigner(): Promise<Signer> {
  const wallet = detectWallets()[0];
  if (!wallet) {
    throw new Error("No wallet found. Install Pelagus or open this page in the Blip app.");
  }
  const provider = new BrowserProvider(wallet.provider);
  return provider.getSigner();
}

export async function connectWallet(): Promise<string> {
  const wallet = detectWallets()[0];
  if (!wallet) throw new Error("No wallet found. Install Pelagus or open this page in the Blip app.");
  const provider = new BrowserProvider(wallet.provider);
  const accounts = (await provider.send("eth_requestAccounts", [])) as string[];
  return accounts[0];
}

function getContract(signer?: Signer): Contract {
  return new Contract(config.payWithQuaiAddress, paywithquaiAbi, signer);
}

/** Customer settles a native QUAI order. Returns the tx hash. */
export async function payOrderNative(
  merchant: string,
  orderId: string,
  amount: bigint | string,
): Promise<string> {
  const signer = await getSigner();
  const value = typeof amount === "bigint" ? amount : parseQuai(amount);
  const tx = await getContract(signer).payOrderNative(merchant, orderId, { value });
  const receipt = await tx.wait();
  return receipt.hash;
}

/** Customer settles an ERC-20 order (approve + payOrder). Returns the tx hash. */
export async function payOrder(
  merchant: string,
  orderId: string,
  token: string,
  amount: bigint,
): Promise<string> {
  const signer = await getSigner();
  const contract = getContract(signer);
  await (
    await new Contract(
      token,
      ["function approve(address spender, uint256 amount) returns (bool)"],
      signer
    ).approve(config.payWithQuaiAddress, amount)
  ).wait();
  const tx = await contract.payOrder(merchant, orderId);
  const receipt = await tx.wait();
  return receipt.hash;
}

/** Cryptographically random order id (keccak of ord_ + random bytes). */
export function newOrderId(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return id(`ord_web_${hex}`);
}

export interface OrderStatus {
  merchant: string;
  orderId: string;
  token: string;
  amount: string;
  feeBps: number;
  expiry: string;
  settled: boolean;
  webhook: { status: string; attempts: number } | null;
}

/** Settlement status from the relayer backend (final source of truth). */
export async function fetchOrderStatus(
  merchant: string,
  orderId: string,
): Promise<OrderStatus | null> {
  const res = await fetch(`/api/order-status/${orderId}?merchant=${merchant}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`backend error ${res.status}`);
  return (await res.json()) as OrderStatus;
}

/** On-chain fallback when the backend is unreachable. */
export async function isSettledOnChain(
  merchant: string,
  orderId: string,
): Promise<boolean> {
  const provider = new JsonRpcProvider(config.rpcUrl, undefined, {
    usePathing: true,
  });
  const contract = new Contract(config.payWithQuaiAddress, paywithquaiAbi, provider);
  return (await contract.isSettled(merchant, orderId)) as boolean;
}

export interface OnChainOrder {
  merchant: string;
  settled: boolean;
  exists: boolean;
  feeBps: number;
  token: string;
  amount: bigint;
  expiry: bigint;
  feeRecipient: string;
  settledAt: bigint;
  expectedPayer: string;
  nonce: bigint;
}

/** Raw order read from the contract (authoritative display + expectedPayer). */
export async function getOrderOnChain(
  merchant: string,
  orderId: string,
): Promise<OnChainOrder | null> {
  const provider = new JsonRpcProvider(config.rpcUrl, undefined, {
    usePathing: true,
  });
  const contract = new Contract(config.payWithQuaiAddress, paywithquaiAbi, provider);
  const o = (await contract.getOrder(merchant, orderId)) as Record<string, unknown>;
  return {
    merchant,
    settled: Boolean(o.settled),
    exists: Boolean(o.exists),
    feeBps: Number(o.feeBps as bigint),
    token: o.token as string,
    amount: o.amount as bigint,
    expiry: o.expiry as bigint,
    feeRecipient: o.feeRecipient as string,
    settledAt: o.settledAt as bigint,
    expectedPayer: o.expectedPayer as string,
    nonce: o.nonce as bigint,
  };
}

export interface ConfirmationResult {
  backend: boolean;
  settledOnChain: boolean;
  webhookDelivered: boolean;
}

/** Poll until the relayer confirms the webhook. On-chain settlement alone is not treated as
 *  complete — merchants should fulfill on the signed webhook, not just a chain read. */
export async function waitForConfirmation(
  merchant: string,
  orderId: string,
  onProgress?: (webhookStatus: string | null) => void,
  maxSeconds = 120,
): Promise<ConfirmationResult> {
  const deadline = Date.now() + maxSeconds * 1000;
  let backendOk = false;
  let settledOnChain = false;
  while (Date.now() < deadline) {
    try {
      const order = await fetchOrderStatus(merchant, orderId);
      if (order) {
        onProgress?.(order.webhook?.status ?? null);
        if (order.settled && order.webhook?.status === "delivered") {
          return { backend: true, settledOnChain: true, webhookDelivered: true };
        }
        backendOk = true;
        if (order.settled) settledOnChain = true;
      }
    } catch {
      // backend unreachable — fall back to on-chain reads below
    }
    if (!settledOnChain) {
      try {
        settledOnChain = await isSettledOnChain(merchant, orderId);
      } catch {
        // RPC unreachable — keep polling
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  return { backend: backendOk, settledOnChain, webhookDelivered: false };
}

/** Friendly error messages for the common wallet/contract failures. */
export function parseError(err: unknown): string {
  const message =
    typeof err === "string"
      ? err
      : err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : "";

  const lowerMsg = message.toLowerCase();

  if (
    lowerMsg.includes("user rejected") ||
    lowerMsg.includes("quais-user-denied") ||
    lowerMsg.includes("action_rejected")
  ) {
    return "User rejected the request in the wallet.";
  }
  if (
    lowerMsg.includes("insufficient funds") ||
    lowerMsg.includes("insufficient_funds")
  ) {
    return "Insufficient funds to complete this transaction.";
  }
  if (lowerMsg.includes("orderalready settled") || lowerMsg.includes("OrderAlreadySettled")) {
    return "This order was already paid for.";
  }
  if (lowerMsg.includes("orderexpired") || lowerMsg.includes("OrderExpired")) {
    return "This order has expired. Please place a new order.";
  }
  if (lowerMsg.includes("incorrectnativevalue") || lowerMsg.includes("IncorrectNativeValue")) {
    return "The payment amount didn't match the order. Please try again.";
  }
  if (lowerMsg.includes("wrongpaymentpath") || lowerMsg.includes("WrongPaymentPath")) {
    return "Wrong payment method for this order. Please try again.";
  }
  if (lowerMsg.includes("ordernotfound") || lowerMsg.includes("OrderNotFound")) {
    return "Order not found on-chain. Please place a new order.";
  }
  if (lowerMsg.includes("wrongpayer") || lowerMsg.includes("WrongPayer")) {
    return "This order is reserved for another wallet — you can't settle it.";
  }
  if (lowerMsg.includes("transaction underpriced")) {
    return "Transaction underpriced. Please try with a higher gas price.";
  }
  if (lowerMsg.includes("nonce too low")) {
    return "Transaction nonce too low. Please reset your wallet or try again.";
  }
  if (lowerMsg.includes("network_error") || lowerMsg.includes("disconnected")) {
    return "Network error. Please check your connection to the network.";
  }

  if (message.length > 200) {
    return "Transaction failed due to an unknown error. Please try again.";
  }

  return message || "An unknown error occurred.";
}

export function formatAmount(order: OnChainOrder, amount: bigint): string {
  const isNative = order.token.toLowerCase() === ZERO_ADDRESS.toLowerCase();
  return isNative ? formatQuai(amount) : formatQuai(amount);
}

export function isNativeOrder(order: OnChainOrder): boolean {
  return order.token.toLowerCase() === ZERO_ADDRESS.toLowerCase();
}

export function netAmount(order: OnChainOrder): bigint {
  return order.amount - (order.amount * BigInt(order.feeBps)) / 10000n;
}