import type { Allergen, DishType, Tag } from "./types";

export const CURRENCY = "£";
/** Demo exchange rate the agent uses to settle GBP prices in USDC. */
export const GBP_USDC = 1.27;

export function money(gbp: number): string {
  return `${CURRENCY}${gbp.toFixed(2)}`;
}

/** £12 rather than £12.00 where it reads better (budgets, limits). */
export function moneyShort(gbp: number): string {
  return Number.isInteger(gbp) ? `${CURRENCY}${gbp}` : money(gbp);
}

export function toUsdc(gbp: number): number {
  return Math.round(gbp * GBP_USDC * 100) / 100;
}

export function usdc(amount: number): string {
  return `${amount.toFixed(2)} USDC`;
}

export function shortAddress(address: string, chars = 4): string {
  return address.length > chars * 2 + 1 ? `${address.slice(0, chars)}…${address.slice(-chars)}` : address;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function listJoin(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export const allergenNames: Record<Allergen, string> = {
  gluten: "Gluten",
  dairy: "Dairy",
  egg: "Egg",
  peanut: "Peanuts",
  "tree-nut": "Tree nuts",
  sesame: "Sesame",
  soy: "Soy",
  fish: "Fish",
  shellfish: "Shellfish",
};

export const tagNames: Record<Tag, string> = {
  healthy: "Healthy",
  "high-protein": "High protein",
  "low-carb": "Low carb",
  light: "Light",
  comfort: "Comfort food",
  spicy: "Spicy",
  vegan: "Vegan",
  vegetarian: "Vegetarian",
  "gluten-free": "Gluten-free",
};

export const dishTypeNames: Record<DishType, string> = {
  bowl: "bowl",
  salad: "salad",
  burger: "burger",
  pizza: "pizza",
  curry: "curry",
  noodles: "noodles",
  sushi: "sushi",
  wrap: "wrap",
  tacos: "tacos",
  pasta: "pasta",
  sandwich: "sandwich",
  soup: "soup",
  grill: "grill",
  rice: "rice dish",
  bao: "bao",
};

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Small deterministic hash, for stable "random" variation (ids, jitter, signatures). */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** A base58 string that looks like a Solana signature (88 chars). Used for simulated settlement. */
export function fakeSignature(seed: string): string {
  let state = hash(seed) || 1;
  let out = "";
  for (let i = 0; i < 88; i++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    out += B58[state % 58];
  }
  return out;
}

export function orderNumber(seed: string): string {
  return `SO-${(hash(seed) % 9000) + 1000}`;
}
