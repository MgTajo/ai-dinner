import { companionJson } from "../companion";
import { checkPrice, type PriceCheck } from "../payments/client";

// Talks to the paid API example in the companion server.

export interface SpendingSnapshot {
  budgetUsd: string;
  spentUsd: string;
  remainingUsd: string;
  maxPaymentUsd: string;
  payments: number;
}

export interface PurchaseResult {
  status: number;
  paymentError: string | null;
  data: unknown;
  /** Settlement receipt (PAYMENT-RESPONSE). `transaction` can be looked up on https://explorer.solana.com/?cluster=devnet */
  receipt: { success: boolean; transaction?: string; network?: string; payer?: string; errorReason?: string } | null;
  spending: SpendingSnapshot;
}

/** GET /premium-data without paying: shows the 402 and the price. */
export function peekPremiumData(): Promise<PriceCheck> {
  return checkPrice("/premium-data");
}

/** The companion agent's budget. */
export async function getSpending(): Promise<SpendingSnapshot> {
  return (await companionJson<{ spending: SpendingSnapshot }>("/api/buy")).spending;
}

/** Asks the companion's agent to buy /premium-data once. It pays with its own devnet key, within its limits. */
export function buyPremiumData(): Promise<PurchaseResult> {
  return companionJson<PurchaseResult>("/api/buy", { method: "POST" });
}
