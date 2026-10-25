// Must come first: gives @solana/kit the WebCrypto calls React Native lacks.
import "./crypto-polyfill";
import type { Address } from "@solana/kit";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import { decodePaymentResponseHeader, wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { companionUrl } from "../companion";
import { walletSigner } from "./mobileWallet";

// x402 CAIP-2 id for Solana devnet: the same network the companion charges on.
const X402_DEVNET = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
// The app builds the payment itself, so it reads the chain directly. A public RPC: never a key.
const RPC_URL = process.env.EXPO_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
/** Refuse any single payment above this, whatever the server asks for. */
export const MAX_PAYMENT = "$0.10";

export interface WalletPurchase {
  status: number;
  data: unknown;
  /** Set when the payment settled on Solana devnet. */
  transaction: string | null;
  /** Why the companion still answered 402, e.g. the wallet has no devnet USDC yet. */
  error: string | null;
}

/** Buys the companion's /premium-data with the user's own wallet. The wallet asks them to approve it. */
export async function payWithWallet(owner: Address): Promise<WalletPurchase> {
  const client = new x402Client()
    .register(X402_DEVNET, new ExactSvmScheme(walletSigner(owner), { rpcUrl: RPC_URL }))
    .setSpendControls({ maxAmountPerPayment: MAX_PAYMENT });
  const res = await wrapFetchWithPayment(fetch, client)(`${companionUrl()}/premium-data`);
  const receipt = res.headers.get("PAYMENT-RESPONSE");
  const settled = receipt ? decodePaymentResponseHeader(receipt) : null;
  return {
    status: res.status,
    data: await res.json().catch(() => null),
    transaction: settled?.success ? settled.transaction : null,
    error: res.status === 402 ? paymentError(res.headers.get("PAYMENT-REQUIRED")) : null,
  };
}

function paymentError(header: string | null): string {
  if (!header) return "Payment required";
  try {
    const reason = decodePaymentRequiredHeader(header).error ?? "Payment required";
    return /insufficient|simulation_failed/.test(reason)
      ? `${reason} (usually the wallet has no devnet USDC yet: get some at https://faucet.circle.com)`
      : reason;
  } catch {
    return "Payment required (could not decode the PAYMENT-REQUIRED header)";
  }
}
