import { companionUrl } from "../companion";
import { parseIntent } from "./parse";
import type { Intent } from "./types";

// What the food agent asks the companion server for: a language model (Gemini, or a local open
// model) to understand free-form requests, and the agent wallet (to pay restaurants in devnet
// USDC). Everything has a short timeout and a fallback, so the app also works as a static demo
// with no server at all (e.g. on GitHub Pages).

/**
 * A page served over https can't call a plain-http companion (mixed content, and browsers ask for
 * local-network permission). Without a configured https companion, the hosted app runs standalone.
 */
function unreachableFromHere(url: string): boolean {
  const page = (globalThis as { location?: { protocol?: string } }).location;
  return page?.protocol === "https:" && url.startsWith("http://");
}

export interface FoodStatus {
  ai: boolean;
  /** "Gemini" or e.g. "qwen2.5:7b (local)". */
  model?: string | null;
  payments: { live: boolean; agent?: string; balanceUsdc?: number; reason?: string };
}

async function call<T>(path: string, init: RequestInit | undefined, timeoutMs: number): Promise<T> {
  if (unreachableFromHere(companionUrl())) throw new Error("No https companion configured for this site");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${companionUrl()}${path}`, { ...init, signal: controller.signal });
    const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!res.ok || !body) throw new Error(body?.error ?? `Companion answered ${res.status}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export function foodStatus(): Promise<FoodStatus> {
  return call<FoodStatus>("/api/food/status", undefined, 4000);
}

/** The companion's model when available, otherwise the on-device parser. */
export async function understand(message: string, useModel: boolean, context: { now: number; hasOptions: boolean; hasPending: boolean }): Promise<Intent> {
  const local = parseIntent(message);
  if (!useModel) return local;
  // Short confirmations and picks are unambiguous; no need for a round trip.
  if (["confirm", "decline", "select", "thanks"].includes(local.kind)) return local;
  try {
    const { intent } = await call<{ intent: Omit<Intent, "source"> }>(
      "/api/food/understand",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, ...context }) },
      8000,
    );
    const merged: Intent = { ...local, ...stripEmpty(intent), source: "model" };
    // "Actually, something with more protein for two" is a new request, not a tweak of the last list.
    const hasNewRequirements = Boolean(merged.tags?.length || merged.dishTypes?.length || merged.cuisines?.length || merged.partySize || merged.avoidTags?.length);
    if (merged.kind === "refine" && hasNewRequirements) merged.kind = "order";
    return merged;
  } catch {
    return local;
  }
}

function stripEmpty<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined)) as Partial<T>;
}

export interface PaymentResult {
  signature: string;
  to: string;
  amountUsdc: number;
}

export function payOnDevnet(body: { orderId: string; amountUsdc: number; platform: string; restaurant: string }): Promise<PaymentResult> {
  return call<PaymentResult>("/api/food/pay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, 60_000);
}
