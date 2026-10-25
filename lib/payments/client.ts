import { companionFetch } from "../companion";

// The app side of x402. The app never signs payments and never holds a wallet key:
// paying happens in the companion server. Here we only read what an endpoint costs.

/** One way to pay, as listed in a 402 response's PAYMENT-REQUIRED header (x402 V2). */
export interface PaymentOption {
  scheme: string;
  /** CAIP-2 network id. Solana devnet is solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1. */
  network: string;
  /** Price in the token's smallest unit. USDC has 6 decimals, so "10000" is $0.01. */
  amount: string;
  /** Token mint address. */
  asset: string;
  /** Address the payment goes to. */
  payTo: string;
  maxTimeoutSeconds?: number;
  extra?: Record<string, unknown>;
}

export interface PaymentRequired {
  x402Version: number;
  error?: string;
  resource?: { url: string; description?: string; mimeType?: string };
  accepts: PaymentOption[];
}

export interface PriceCheck {
  status: number;
  /** Set when the endpoint asked for payment (status 402). */
  paymentRequired: PaymentRequired | null;
  /** The first payment option in dollars, e.g. "0.01", assuming a 6-decimal token like USDC. */
  priceUsd: string | null;
  body: unknown;
}

/** Calls a companion endpoint without paying, to see what it costs. */
export async function checkPrice(path: string): Promise<PriceCheck> {
  const res = await companionFetch(path);
  const paymentRequired = decodePaymentRequired(res.headers.get("PAYMENT-REQUIRED"));
  const amount = paymentRequired?.accepts[0]?.amount;
  return {
    status: res.status,
    paymentRequired,
    priceUsd: amount ? formatUsdc(amount) : null,
    body: await res.json().catch(() => null),
  };
}

/** The PAYMENT-REQUIRED header is base64-encoded JSON. */
export function decodePaymentRequired(header: string | null): PaymentRequired | null {
  if (!header) return null;
  try {
    return JSON.parse(atob(header)) as PaymentRequired;
  } catch {
    return null;
  }
}

function formatUsdc(atomic: string): string {
  return String(Number(atomic) / 1_000_000);
}
