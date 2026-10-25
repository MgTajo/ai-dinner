import { orderNumber } from "../format";
import { atTime, DAY, MINUTE } from "../time";
import type { MealSlot, Order, PlatformId } from "../types";
import { feesFor } from "./platforms";
import { itemById } from "./restaurants";

// Order history "imported" from the user's delivery accounts during onboarding. It gives the
// agent something to learn from on day one: a liking for Japanese and fresh bowls, low ratings
// for very spicy dishes, and one late Uber Eats delivery.

interface Past {
  daysAgo: number;
  at: string;
  itemId: string;
  platform: PlatformId;
  rating?: number;
  feedback?: string[];
}

const past: Past[] = [
  { daysAgo: 1, at: "19:05", itemId: "nori-salmon-poke", platform: "deliveroo", rating: 5, feedback: ["Great portion"] },
  { daysAgo: 2, at: "12:40", itemId: "gf-chicken-greens", platform: "direct", rating: 5 },
  { daysAgo: 3, at: "19:30", itemId: "bb-dandan", platform: "ubereats", rating: 2, feedback: ["Too spicy"] },
  { daysAgo: 4, at: "12:35", itemId: "rc-trout", platform: "direct" },
  { daysAgo: 5, at: "20:10", itemId: "f22-margherita", platform: "direct", rating: 4 },
  { daysAgo: 6, at: "18:50", itemId: "pm-beef-pho", platform: "deliveroo", rating: 5 },
  { daysAgo: 8, at: "12:30", itemId: "gf-harvest", platform: "justeat", rating: 4 },
  { daysAgo: 9, at: "19:15", itemId: "mw-smash", platform: "ubereats", rating: 3, feedback: ["Arrived late", "Too heavy"] },
  { daysAgo: 10, at: "19:40", itemId: "nori-teriyaki", platform: "deliveroo" },
  { daysAgo: 12, at: "12:50", itemId: "ke-power", platform: "ubereats", rating: 5 },
  { daysAgo: 13, at: "19:00", itemId: "pf-cacio", platform: "deliveroo" },
  { daysAgo: 15, at: "18:45", itemId: "ml-shawarma", platform: "direct", rating: 5 },
  { daysAgo: 17, at: "12:40", itemId: "gf-chicken-greens", platform: "deliveroo", rating: 5 },
  { daysAgo: 19, at: "19:20", itemId: "sk-bibimbap", platform: "deliveroo", rating: 3, feedback: ["Too spicy"] },
];

export function seedHistory(now: number): Order[] {
  return past.map((p) => {
    const { restaurant, item } = itemById(p.itemId);
    const listing = restaurant.listings.find((l) => l.platform === p.platform) ?? restaurant.listings[0];
    const subtotal = Math.round(item.price * listing.markup * 100) / 100;
    const fees = feesFor(listing.platform, subtotal, restaurant.distanceKm, true);
    const arriveAt = atTime(now - p.daysAgo * DAY, p.at);
    const travel = Math.round(8 + restaurant.distanceKm * 6);
    const meal: MealSlot = Number(p.at.slice(0, 2)) < 16 ? "lunch" : "dinner";
    return {
      id: orderNumber(`${p.itemId}-${p.daysAgo}`),
      restaurantId: restaurant.id,
      itemId: item.id,
      qty: 1,
      platform: listing.platform,
      fulfilment: "delivery",
      subtotal,
      deliveryFee: fees.deliveryFee,
      serviceFee: fees.serviceFee,
      smallOrderFee: fees.smallOrderFee,
      total: fees.total,
      placedAt: arriveAt - (restaurant.prepMin + travel + 6) * MINUTE,
      acceptedAt: arriveAt - (restaurant.prepMin + travel + 4) * MINUTE,
      prepAt: arriveAt - (restaurant.prepMin + travel) * MINUTE,
      pickedUpAt: arriveAt - travel * MINUTE,
      arriveAt,
      rating: p.rating,
      feedback: p.feedback,
      source: "history",
      meal,
    } satisfies Order;
  });
}
