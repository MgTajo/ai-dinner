import { platforms } from "./data/platforms";
import { cuisineNames, itemById, restaurantById } from "./data/restaurants";
import { money, plural } from "./format";
import { hoursOf } from "./time";
import type { Affinity, Cuisine, Learned, LearningEvent, Order, PlatformId, Priority, Profile, RankedOption, Tag, Weights } from "./types";

// How the agent learns. Three signals:
//  1. Ratings (and quick feedback like "Too spicy") move affinities for the restaurant, the
//     cuisine, the dish and its tags.
//  2. Choices: picking something other than the agent's first suggestion nudges the priority
//     weights toward whatever the chosen option was better at (revealed preference).
//  3. Patterns across the order history become plain-language observations the user can see.

export const FEEDBACK = {
  positive: ["Tasty", "Great portion", "Good value", "Arrived hot"],
  negative: ["Too spicy", "Too heavy", "Small portion", "Arrived late"],
} as const;

export function emptyLearned(): Learned {
  return { cuisine: {}, restaurant: {}, item: {}, tags: {}, platform: {}, events: [], ratings: 0 };
}

function update(a: Affinity | undefined, signal: number, minRate = 0.25): Affinity {
  const prev = a ?? { score: 0, n: 0 };
  const rate = Math.max(minRate, 1 / (prev.n + 1));
  const score = Math.max(-1, Math.min(1, prev.score + rate * (signal - prev.score)));
  return { score: Math.round(score * 1000) / 1000, n: prev.n + 1 };
}

/** Applies one rating. Returns what changed in words, for the chat and the learning log. */
export function applyRating(learned: Learned, order: Order, rating: number, feedback: string[], now: number): { learned: Learned; notes: string[] } {
  const { restaurant, item } = itemById(order.itemId);
  const signal = (rating - 3) / 2;
  const next: Learned = {
    ...learned,
    cuisine: { ...learned.cuisine },
    restaurant: { ...learned.restaurant },
    item: { ...learned.item },
    tags: { ...learned.tags },
    platform: { ...learned.platform },
    ratings: learned.ratings + 1,
  };
  const before = next.restaurant[restaurant.id]?.score ?? 0;
  next.restaurant[restaurant.id] = update(next.restaurant[restaurant.id], signal);
  next.cuisine[restaurant.cuisine] = update(next.cuisine[restaurant.cuisine], signal * 0.8);
  const prevItem = next.item[item.id];
  next.item[item.id] = {
    rating: prevItem ? (prevItem.rating * prevItem.n + rating) / (prevItem.n + 1) : rating,
    n: (prevItem?.n ?? 0) + 1,
    lastAt: order.arriveAt,
  };
  for (const tag of item.tags) next.tags[tag] = update(next.tags[tag], signal * 0.5, 0.15);

  const notes: string[] = [];
  const after = next.restaurant[restaurant.id].score;
  if (after - before > 0.05) notes.push(`${restaurant.name} moves up in your rankings.`);
  if (before - after > 0.05) notes.push(`${restaurant.name} moves down in your rankings.`);

  if (feedback.includes("Too spicy")) {
    next.tags.spicy = update(next.tags.spicy, -1, 0.4);
    notes.push("Spicy dishes now rank lower unless you ask for heat.");
  }
  if (feedback.includes("Too heavy")) {
    next.tags.comfort = update(next.tags.comfort, -0.8, 0.4);
    notes.push("I'll lean lighter on heavy, rich dishes.");
  }
  if (feedback.includes("Small portion")) {
    next.item[item.id] = { ...next.item[item.id], rating: Math.min(next.item[item.id].rating, 3) };
    notes.push(`I'll look for more filling options than the ${item.name.toLowerCase()}.`);
  }
  if (feedback.includes("Arrived late")) {
    const p = next.platform[order.platform] ?? { late: 0, n: 0 };
    next.platform[order.platform] = { late: p.late + 1, n: p.n + 1 };
    notes.push(`Noted the late delivery. ${platforms[order.platform].name} gets less benefit of the doubt on timing.`);
  } else {
    const p = next.platform[order.platform] ?? { late: 0, n: 0 };
    next.platform[order.platform] = { late: p.late, n: p.n + 1 };
  }
  if (feedback.includes("Good value") || feedback.includes("Great portion")) {
    notes.push(`Saved ${item.name.toLowerCase()} as a reliable pick.`);
  }
  if (notes.length === 0) notes.push(rating >= 4 ? `More like the ${item.name.toLowerCase()}, then.` : "Thanks. I'll weigh that next time.");

  next.events = [
    { at: now, kind: "rating" as const, text: `Rated ${item.name} ${rating}★${feedback.length ? ` · ${feedback.join(", ")}` : ""}` },
    ...learned.events,
  ].slice(0, 40);
  return { learned: next, notes };
}

/** Builds the starting profile from imported order history. */
export function learnFromHistory(orders: Order[], now: number): Learned {
  let learned = emptyLearned();
  const rated = orders.filter((o) => o.rating).sort((a, b) => a.arriveAt - b.arriveAt);
  for (const order of rated) learned = applyRating(learned, order, order.rating!, order.feedback ?? [], order.arriveAt).learned;
  for (const order of orders.filter((o) => !o.rating)) {
    const prev = learned.item[order.itemId];
    if (!prev) learned.item[order.itemId] = { rating: 3.5, n: 0, lastAt: order.arriveAt };
    const p = learned.platform[order.platform] ?? { late: 0, n: 0 };
    learned.platform[order.platform] = { ...p, n: p.n + 1 };
  }
  learned.events = [{ at: now, kind: "pattern", text: `Imported ${plural(orders.length, "past order")} and ${plural(rated.length, "rating")}` }];
  return learned;
}

const PRIORITY_WORDS: Record<Priority, string> = { taste: "taste", health: "health", price: "price", speed: "timing" };

/**
 * Revealed preference: when the user picks something other than the top suggestion, shift a little
 * weight toward the dimension where their choice beat it.
 */
export function nudgeWeights(weights: Weights, chosen: RankedOption, top: RankedOption, now: number): { weights: Weights; note?: string; event?: LearningEvent } {
  if (chosen.offer.id === top.offer.id) return { weights };
  const gains = (Object.keys(weights) as Priority[]).map((k) => [k, chosen.parts[k] - top.parts[k]] as const).sort((a, b) => b[1] - a[1]);
  const [key, gain] = gains[0];
  if (gain < 0.05) return { weights };
  const before = weights[key];
  const raised = { ...weights, [key]: before + 0.04 };
  const sum = Object.values(raised).reduce((a, b) => a + b, 0);
  const next = Object.fromEntries(Object.entries(raised).map(([k, v]) => [k, Math.round((v / sum) * 1000) / 1000])) as Weights;
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const word = PRIORITY_WORDS[key];
  return {
    weights: next,
    note: `You picked this over my first suggestion, so I gave ${word} a little more weight (${pct(before)} → ${pct(next[key])}).`,
    event: { at: now, kind: "choice", text: `Chose ${itemById(chosen.offer.itemId).item.name} over the top pick: ${word} ${pct(before)} → ${pct(next[key])}` },
  };
}

export interface Insight {
  id: string;
  title: string;
  detail: string;
}

/** Plain-language patterns from the order history. */
export function insights(orders: Order[], profile: Profile, learned: Learned): Insight[] {
  const done = orders.filter((o) => !o.cancelledAt);
  const out: Insight[] = [];
  if (done.length < 3) return out;

  // Best-rated cuisine.
  const byCuisine = new Map<Cuisine, number[]>();
  for (const o of done) {
    if (!o.rating) continue;
    const c = restaurantById(o.restaurantId).cuisine;
    byCuisine.set(c, [...(byCuisine.get(c) ?? []), o.rating]);
  }
  const best = [...byCuisine.entries()].filter(([, r]) => r.length >= 2).map(([c, r]) => [c, avg(r), r.length] as const).sort((a, b) => b[1] - a[1])[0];
  if (best) out.push({ id: "best-cuisine", title: `${cuisineNames[best[0]]} is your best-rated cuisine`, detail: `${best[1].toFixed(1)}★ on average across ${plural(best[2], "order")}.` });

  // Spice.
  const spicy = done.filter((o) => o.rating && itemById(o.itemId).item.tags.includes("spicy"));
  if (spicy.length >= 2 && avg(spicy.map((o) => o.rating!)) < 3.3) {
    out.push({ id: "spice", title: "You rate very spicy dishes lower", detail: `${avg(spicy.map((o) => o.rating!)).toFixed(1)}★ on average. I keep the heat mild unless you ask for it.` });
  }

  // Lunch habits.
  const lunches = done.filter((o) => o.meal === "lunch");
  const freshLunches = lunches.filter((o) => ["bowl", "salad", "soup"].includes(itemById(o.itemId).item.type));
  if (lunches.length >= 3 && freshLunches.length / lunches.length >= 0.6) {
    out.push({ id: "lunch", title: "Lunch is usually a bowl or salad", detail: `${freshLunches.length} of your last ${plural(lunches.length, "lunch", "lunches")}. I start lunch searches there.` });
  }

  // Dinner time.
  const dinners = done.filter((o) => o.meal === "dinner");
  if (dinners.length >= 3) {
    const typical = median(dinners.map((o) => hoursOf(o.arriveAt)));
    const h = Math.floor(typical);
    const m = Math.round(((typical - h) * 60) / 5) * 5;
    out.push({ id: "dinner-time", title: `Dinner usually lands around ${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`, detail: "Unless your calendar says otherwise, that's when I aim for." });
  }

  // Spend.
  if (dinners.length >= 3) {
    const spend = avg(dinners.map((o) => o.total / o.qty));
    const diff = profile.budget.dinner - spend;
    out.push({
      id: "spend",
      title: `You spend ${money(spend)} on dinner on average`,
      detail: diff >= 0 ? `${money(diff)} under your ${money(profile.budget.dinner)} budget.` : `${money(-diff)} over your ${money(profile.budget.dinner)} budget.`,
    });
  }

  // Platform reliability.
  const late = (Object.entries(learned.platform) as [PlatformId, { late: number; n: number }][]).filter(([, p]) => p.late > 0).sort((a, b) => b[1].late / b[1].n - a[1].late / a[1].n)[0];
  if (late) {
    out.push({
      id: "late",
      title: `${platforms[late[0]].name} was late ${late[1].late === 1 ? "once" : `${late[1].late} times`}`,
      detail: `Out of ${plural(late[1].n, "order")}. When prices are close, I prefer platforms that have been on time for you.`,
    });
  }

  // Protein.
  const highProtein = done.filter((o) => itemById(o.itemId).item.protein >= 35);
  if (highProtein.length / done.length >= 0.5) {
    out.push({ id: "protein", title: "Most of your meals are high in protein", detail: `${Math.round((highProtein.length / done.length) * 100)}% had 35 g or more.` });
  }
  return out;
}

export function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Cuisines ranked by learned affinity, strongest first. */
export function rankedCuisines(learned: Learned): [Cuisine, Affinity][] {
  return (Object.entries(learned.cuisine) as [Cuisine, Affinity][]).sort((a, b) => b[1].score - a[1].score);
}

export function tagAffinity(learned: Learned, tag: Tag): number {
  return learned.tags[tag]?.score ?? 0;
}
