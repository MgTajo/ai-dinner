import { feesFor, platforms } from "./data/platforms";
import { cuisineNames, restaurants } from "./data/restaurants";
import { dishTypeNames, hash, money } from "./format";
import { fmtTime, hoursOf, MINUTE } from "./time";
import type {
  DietPattern,
  DishDiet,
  Exclusion,
  ExclusionReason,
  Learned,
  MenuItem,
  Offer,
  Order,
  PlatformId,
  Priority,
  Profile,
  RankedOption,
  Restaurant,
  SearchRequest,
  SearchResult,
} from "./types";

// The decision engine. Order of work, as in the concept:
//  1. Hard constraints first: diet, allergens, dislikes, opening hours, can it arrive in time,
//     is it within budget. Anything that fails is removed, and the reason is counted.
//  2. Every remaining dish is priced on every platform that lists it (markup + fees) and timed.
//     The best platform per dish wins; the others become "also on" comparisons.
//  3. What's left is ranked by the user's priority weights plus what the agent has learned.

const DIET_OK: Record<DietPattern, DishDiet[]> = {
  omnivore: ["meat", "fish", "vegetarian", "vegan"],
  pescatarian: ["fish", "vegetarian", "vegan"],
  vegetarian: ["vegetarian", "vegan"],
  vegan: ["vegan"],
};

/** Tags that are rules when asked for, not preferences. */
const HARD_TAGS = new Set(["vegan", "vegetarian", "gluten-free"]);

export interface SearchContext {
  profile: Profile;
  learned: Learned;
  orders: Order[];
  now: number;
}

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Travel time for a delivery in minutes (bike courier, Cambridge). */
export function travelMinutes(km: number): number {
  return Math.round(8 + km * 6);
}

function offerFor(r: Restaurant, item: MenuItem, platform: PlatformId, markup: number, etaExtra: number, req: SearchRequest, now: number): Offer {
  const delivery = req.fulfilment === "delivery";
  const subtotal = round2(item.price * markup * req.partySize);
  const fees = feesFor(platform, subtotal, r.distanceKm, delivery);
  const travel = delivery ? travelMinutes(r.distanceKm) : 0;
  const lead = r.prepMin + travel + etaExtra + 2; // +2: order acceptance
  const id = `${r.id}:${item.id}:${platform}`;
  let placeAt: number;
  let arriveAt: number;
  if (req.target === null) {
    placeAt = now;
    arriveAt = now + lead * MINUTE;
  } else {
    // Schedule so it lands on time. Real kitchens are never exact: a stable jitter of -3…+1 min.
    const jitter = ((hash(id + req.target) % 5) - 3) * MINUTE;
    const ideal = req.target + jitter;
    placeAt = Math.max(now, ideal - lead * MINUTE);
    arriveAt = placeAt + lead * MINUTE;
  }
  const readyAt = arriveAt - (travel + etaExtra) * MINUTE;
  return {
    id,
    restaurantId: r.id,
    itemId: item.id,
    platform,
    fulfilment: req.fulfilment,
    qty: req.partySize,
    subtotal,
    deliveryFee: fees.deliveryFee,
    serviceFee: fees.serviceFee,
    smallOrderFee: fees.smallOrderFee,
    total: fees.total,
    placeAt,
    readyAt,
    arriveAt,
    minutesOff: req.target === null ? 0 : Math.round((arriveAt - req.target) / MINUTE),
  };
}

function matchesQuery(r: Restaurant, item: MenuItem, req: SearchRequest): boolean {
  if (req.restaurantId && r.id !== req.restaurantId) return false;
  if (req.dishTypes.length && !req.dishTypes.includes(item.type)) return false;
  if (req.cuisines.length && !req.cuisines.includes(r.cuisine)) return false;
  for (const tag of req.tags) if (HARD_TAGS.has(tag) && !item.tags.includes(tag)) return false;
  for (const tag of req.avoidTags) if (item.tags.includes(tag)) return false;
  return true;
}

/** How well a dish fits the soft parts of the request ("healthy", "light", "high protein"). */
function fit(item: MenuItem, req: SearchRequest): number {
  const soft = req.tags.filter((t) => !HARD_TAGS.has(t));
  if (!soft.length) return 1;
  const hits = soft.filter((t) => {
    if (item.tags.includes(t)) return true;
    if (t === "high-protein") return item.protein >= 32;
    if (t === "light") return item.kcal <= 560;
    if (t === "healthy") return item.tags.includes("light") && !item.tags.includes("comfort");
    return false;
  }).length;
  return 0.72 + 0.28 * (hits / soft.length);
}

interface Scored {
  offer: Offer;
  parts: Record<Priority, number>;
  score: number;
  r: Restaurant;
  item: MenuItem;
}

function scoreOffer(offer: Offer, r: Restaurant, item: MenuItem, req: SearchRequest, ctx: SearchContext): Scored {
  const { learned, profile, orders, now } = ctx;

  // Taste: public rating + what this user has shown they like.
  const ratingScore = clamp((r.rating - 4.0) / 0.8);
  const itemSignal = learned.item[item.id]?.n ? (learned.item[item.id].rating - 3) / 2 : 0;
  const tagSignal = item.tags.reduce((s, t) => s + (learned.tags[t]?.score ?? 0), 0) / Math.max(1, item.tags.length);
  const affinity =
    (learned.restaurant[r.id]?.score ?? 0) * 0.45 +
    (learned.cuisine[r.cuisine]?.score ?? 0) * 0.3 +
    itemSignal * 0.4 +
    tagSignal * 0.6 +
    (profile.cuisines.includes(r.cuisine) ? 0.15 : 0);
  const taste = clamp(0.4 * ratingScore + 0.6 * (0.5 + affinity / 2));

  // Health, against the user's goal.
  let health = 0.45;
  if (item.tags.includes("healthy")) health += 0.25;
  if (item.tags.includes("light")) health += 0.08;
  if (item.tags.includes("comfort")) health -= 0.3;
  if (profile.goal === "high-protein") health += item.protein >= 35 ? 0.15 : item.protein < 20 ? -0.1 : 0;
  else if (item.protein >= 30) health += 0.06;
  if (profile.goal === "low-carb") health += item.carbs <= 30 ? 0.15 : item.carbs > 80 ? -0.1 : 0;
  if (profile.goal === "light") health += item.kcal <= 550 ? 0.15 : item.kcal > 800 ? -0.15 : 0;
  if (item.kcal >= 450 && item.kcal <= 750) health += 0.07;
  if (item.kcal > 950) health -= 0.15;
  health = clamp(health);

  // Price per person against the budget.
  const perPerson = offer.total / offer.qty;
  const price = clamp(1 - (perPerson - 8) / Math.max(1, req.budget * 1.15 - 8));

  // Speed or timing, discounted by how often this platform has been late for this user.
  let speed: number;
  if (req.target === null) {
    speed = clamp(1 - ((offer.arriveAt - now) / MINUTE - 18) / 35);
  } else {
    const off = offer.minutesOff;
    speed = off > 0 ? clamp(1 - off / 10) : clamp(1 - (-off - 4) / 25);
  }
  const late = learned.platform[offer.platform];
  const lateRate = late && late.n ? late.late / late.n : 0;
  speed = clamp(speed * (0.82 + 0.18 * platforms[offer.platform].onTime) - lateRate * 0.25);

  const parts = { taste, health, price, speed };
  const w = req.weights;
  let score = (w.taste * taste + w.health * health + w.price * price + w.speed * speed) * fit(item, req);

  // Variety: don't serve yesterday's dinner again unless asked.
  const recent = orders.filter((o) => o.itemId === item.id && now - o.arriveAt < 2.5 * 24 * 60 * MINUTE && !o.cancelledAt);
  if (recent.length && !req.restaurantId) score -= 0.035;

  return { offer, parts, score: clamp(score), r, item };
}

function reasonsFor(s: Scored, req: SearchRequest, ctx: SearchContext, alternatives: Offer[]): string[] {
  const { learned, now } = ctx;
  const { r, item, offer, parts } = s;
  const reasons: { text: string; weight: number }[] = [];

  if (req.phrase) reasons.push({ text: `Matches “${req.phrase}”`, weight: 0.5 });

  const known = learned.item[item.id];
  const rAff = learned.restaurant[r.id];
  if (known?.n && known.rating >= 4.5) reasons.push({ text: `You rated it ${Math.round(known.rating)}★ before`, weight: 0.9 });
  else if (rAff && rAff.score > 0.4) reasons.push({ text: `One of your favourite places`, weight: 0.7 });
  else if ((learned.cuisine[r.cuisine]?.score ?? 0) > 0.45) reasons.push({ text: `${cuisineNames[r.cuisine]} is a cuisine you rate highly`, weight: 0.5 });
  else if (r.rating >= 4.6) reasons.push({ text: `${r.rating}★ from ${r.reviews.toLocaleString("en-GB")} reviews`, weight: 0.4 });
  else if (!known && !rAff) reasons.push({ text: `New for you · ${r.rating}★`, weight: 0.3 });

  if (parts.health >= 0.7) reasons.push({ text: `${item.protein} g protein · ${item.kcal} kcal`, weight: parts.health * req.weights.health * 1.4 });

  const cheaper = alternatives.filter((a) => a.total > offer.total).sort((a, b) => a.total - b.total)[0];
  if (cheaper && cheaper.total - offer.total >= 0.5) {
    reasons.push({ text: `${money(cheaper.total - offer.total)} less than on ${platforms[cheaper.platform].name}`, weight: 0.8 });
  } else if (req.budget - offer.total / offer.qty >= 3) {
    reasons.push({ text: `${money(req.budget - offer.total / offer.qty)} under your budget`, weight: parts.price * req.weights.price });
  }

  if (req.target !== null) {
    const off = offer.minutesOff;
    reasons.push({ text: off === 0 ? `Arrives ${fmtTime(offer.arriveAt)}, right on time` : `Arrives ${fmtTime(offer.arriveAt)}`, weight: 0.35 });
  } else {
    reasons.push({ text: `At your door in ${Math.round((offer.arriveAt - now) / MINUTE)} min`, weight: parts.speed * req.weights.speed * 1.5 });
  }

  if (offer.platform === "phone") reasons.push({ text: "Phone orders only, so I'll call them", weight: 0.95 });

  return reasons
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((r) => r.text);
}

const EXCLUSION_ORDER: ExclusionReason[] = ["skipped", "mismatch", "diet", "allergen", "dislike", "closed", "channel", "late", "budget"];

export function search(req: SearchRequest, ctx: SearchContext): SearchResult {
  const { profile, now } = ctx;
  const excluded = new Map<ExclusionReason, { count: number; examples: string[] }>();
  const exclude = (reason: ExclusionReason, label: string) => {
    const e = excluded.get(reason) ?? { count: 0, examples: [] };
    e.count += 1;
    if (e.examples.length < 3) e.examples.push(label);
    excluded.set(reason, e);
  };

  const perPlatform = new Map<PlatformId, { restaurants: Set<string>; dishes: number }>();
  let dishes = 0;
  let offersScanned = 0;
  const feasibleByDish = new Map<string, Scored[]>();

  for (const r of restaurants) {
    const listings = r.listings.filter((l) => l.platform === "phone" || l.platform === "direct" || profile.platformsConnected.includes(l.platform));
    for (const l of listings) {
      const p = perPlatform.get(l.platform) ?? { restaurants: new Set<string>(), dishes: 0 };
      p.restaurants.add(r.id);
      p.dishes += r.menu.length;
      perPlatform.set(l.platform, p);
    }

    for (const item of r.menu) {
      dishes += 1;
      offersScanned += listings.length;
      const label = `${item.name} · ${r.name}`;
      if (req.excludeRestaurants.includes(r.id)) { exclude("skipped", label); continue; }
      if (!matchesQuery(r, item, req)) { exclude("mismatch", label); continue; }
      if (!DIET_OK[profile.diet].includes(item.diet)) { exclude("diet", label); continue; }
      const allergen = item.allergens.find((a) => profile.allergies.includes(a));
      if (allergen) { exclude("allergen", `${label} (${allergen.replace("-", " ")})`); continue; }
      const disliked = item.contains.find((c) => [...profile.dislikes, ...req.avoidIngredients].some((d) => c.includes(d.toLowerCase())));
      if (disliked) { exclude("dislike", `${label} (${disliked})`); continue; }

      const usable = listings.filter((l) => (req.fulfilment === "delivery" ? platforms[l.platform].delivery : platforms[l.platform].collection));
      const offers = usable.map((l) => offerFor(r, item, l.platform, l.markup, l.etaExtra, req, now));
      // Pre-orders are fine: what matters is that the kitchen is open while it cooks.
      const open = offers.filter((o) => hoursOf(o.readyAt - r.prepMin * MINUTE) >= r.hours[0] && hoursOf(o.readyAt) <= r.hours[1]);
      if (!open.length) { exclude("closed", `${r.name} (${fmtHours(r.hours)})`); continue; }
      const reachable = open.filter((o) => o.platform !== "phone" || profile.phoneOrdering);
      if (!reachable.length) { exclude("channel", `${r.name} (phone only)`); continue; }
      const onTime = reachable.filter((o) => o.minutesOff <= 10);
      if (!onTime.length) { exclude("late", `${label} (earliest ${fmtTime(Math.min(...reachable.map((o) => o.arriveAt)))})`); continue; }
      const affordable = onTime.filter((o) => o.total / o.qty <= req.budget * 1.05);
      if (!affordable.length) { exclude("budget", `${label} (${money(Math.min(...onTime.map((o) => o.total / o.qty)))})`); continue; }

      feasibleByDish.set(`${r.id}:${item.id}`, affordable.map((o) => scoreOffer(o, r, item, req, ctx)));
    }
  }

  // Best platform per dish; the rest are comparisons.
  const best: { scored: Scored; others: Offer[] }[] = [];
  let considered = 0;
  for (const scoredOffers of feasibleByDish.values()) {
    considered += scoredOffers.length;
    const sorted = [...scoredOffers].sort((a, b) => b.score - a.score);
    best.push({ scored: sorted[0], others: sorted.slice(1).map((s) => s.offer) });
  }
  best.sort((a, b) => b.scored.score - a.scored.score);

  // Three options from three different places.
  const options: RankedOption[] = [];
  const seen = new Set<string>();
  for (const b of best) {
    if (seen.has(b.scored.r.id)) continue;
    seen.add(b.scored.r.id);
    options.push({
      offer: b.scored.offer,
      score: Math.round(b.scored.score * 100),
      parts: b.scored.parts,
      reasons: reasonsFor(b.scored, req, ctx, b.others),
      alternatives: b.others.map((o) => ({ platform: o.platform, total: o.total, arriveAt: o.arriveAt })),
    });
    if (options.length === 3) break;
  }
  // One restaurant can still offer a real choice (e.g. "Indian" when only one Indian kitchen is open).
  for (const b of best) {
    if (options.length >= 3) break;
    if (options.some((o) => o.offer.id === b.scored.offer.id)) continue;
    options.push({
      offer: b.scored.offer,
      score: Math.round(b.scored.score * 100),
      parts: b.scored.parts,
      reasons: reasonsFor(b.scored, req, ctx, b.others),
      alternatives: b.others.map((o) => ({ platform: o.platform, total: o.total, arriveAt: o.arriveAt })),
    });
  }

  const exclusions: Exclusion[] = EXCLUSION_ORDER.filter((r) => excluded.has(r)).map((reason) => ({ reason, ...excluded.get(reason)! }));
  return {
    request: req,
    scanned: { platforms: perPlatform.size, restaurants: restaurants.length, dishes, offers: offersScanned },
    perPlatform: [...perPlatform.entries()].map(([platform, p]) => ({ platform, restaurants: p.restaurants.size, dishes: p.dishes })),
    options,
    considered,
    exclusions,
  };
}

function fmtHours([open, close]: [number, number]): string {
  const f = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
  return `${f(open)}–${f(close)}`;
}

export function describeExclusion(e: Exclusion, req: SearchRequest): string {
  const n = e.count;
  switch (e.reason) {
    case "mismatch":
      return `${n} not ${req.phrase ? `a “${req.phrase}”` : "what you asked for"}`;
    case "diet":
      return `${n} don't fit your diet`;
    case "allergen":
      return `${n} contain an allergen you avoid`;
    case "dislike":
      return `${n} contain something you don't like`;
    case "closed":
      return `${n} from places closed at that time`;
    case "channel":
      return `${n} only orderable by phone (phone ordering is off)`;
    case "late":
      return `${n} can't arrive ${req.target ? `by ${fmtTime(req.target)}` : "in time"}`;
    case "budget":
      return `${n} over your ${money(req.budget)} budget`;
    case "skipped":
      return `${n} from places you passed on`;
  }
}

export function dishPhrase(req: Pick<SearchRequest, "tags" | "dishTypes" | "cuisines">): string | undefined {
  const words: string[] = [];
  for (const t of req.tags) words.push(t === "high-protein" ? "high-protein" : t);
  for (const c of req.cuisines) words.push(cuisineNames[c]);
  for (const d of req.dishTypes) words.push(dishTypeNames[d]);
  return words.length ? words.join(" ") : undefined;
}
