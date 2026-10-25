import { orderNumber } from "./format";
import { MINUTE } from "./time";
import type { CalendarEvent, MealSlot, Offer, Order, OrderStage } from "./types";
import { restaurantById } from "./data/restaurants";
import { travelMinutes } from "./search";

// Order lifecycle. Every stage has a timestamp, and the current stage is derived from the
// scenario clock, so fast-forwarding the clock moves orders along naturally.

export function orderFromOffer(offer: Offer, meal: MealSlot, source: Order["source"], now: number): Order {
  const r = restaurantById(offer.restaurantId);
  const travel = offer.fulfilment === "delivery" ? travelMinutes(r.distanceKm) : 0;
  const arriveAt = Math.max(offer.arriveAt, now + (r.prepMin + travel + 2) * MINUTE);
  return {
    id: orderNumber(`${offer.id}-${now}`),
    restaurantId: offer.restaurantId,
    itemId: offer.itemId,
    qty: offer.qty,
    platform: offer.platform,
    fulfilment: offer.fulfilment,
    subtotal: offer.subtotal,
    deliveryFee: offer.deliveryFee,
    serviceFee: offer.serviceFee,
    smallOrderFee: offer.smallOrderFee,
    total: offer.total,
    placedAt: now,
    acceptedAt: now + 1 * MINUTE,
    prepAt: arriveAt - (r.prepMin + travel) * MINUTE,
    pickedUpAt: arriveAt - travel * MINUTE,
    arriveAt,
    source,
    meal,
  };
}

export function orderStage(o: Order, now: number): OrderStage {
  if (o.cancelledAt) return "cancelled";
  if (now >= o.arriveAt) return o.fulfilment === "delivery" ? "delivered" : "collected";
  if (o.fulfilment === "collection" && now >= o.pickedUpAt) return "ready";
  if (now >= o.pickedUpAt) return "on-the-way";
  if (now >= o.prepAt) return "preparing";
  if (now >= o.acceptedAt) return o.prepAt - now > 20 * MINUTE ? "scheduled" : "accepted";
  return "placed";
}

export const stageLabels: Record<OrderStage, string> = {
  scheduled: "Scheduled",
  placed: "Placed",
  accepted: "Accepted",
  preparing: "Being prepared",
  "on-the-way": "On the way",
  ready: "Ready to collect",
  delivered: "Delivered",
  collected: "Collected",
  cancelled: "Cancelled",
};

export function isActive(o: Order, now: number): boolean {
  const s = orderStage(o, now);
  return s !== "delivered" && s !== "collected" && s !== "cancelled";
}

/** Orders can be cancelled until the kitchen starts cooking. */
export function canCancel(o: Order, now: number): boolean {
  return !o.cancelledAt && now < o.prepAt;
}

/** Can the arrival still move? Only before the courier has left. */
export function canReschedule(o: Order, now: number): boolean {
  return !o.cancelledAt && now < o.pickedUpAt - 2 * MINUTE;
}

export function shiftOrder(o: Order, minutes: number, now: number): Order {
  const d = minutes * MINUTE;
  return {
    ...o,
    originalArriveAt: o.originalArriveAt ?? o.arriveAt,
    prepAt: Math.max(now, o.prepAt + d),
    pickedUpAt: o.pickedUpAt + d,
    arriveAt: o.arriveAt + d,
  };
}

// ── Calendar ──────────────────────────────────────────────────────────────────

/** The last meeting of the day that ends inside [fromHour, toHour]. */
export function lastMeeting(events: CalendarEvent[], fromHour = 15, toHour = 21.5): CalendarEvent | undefined {
  return events
    .filter((e) => e.kind === "meeting")
    .filter((e) => {
      const h = new Date(e.end).getHours() + new Date(e.end).getMinutes() / 60;
      return h >= fromHour && h <= toHour;
    })
    .sort((a, b) => b.end - a.end)[0];
}

/** An activity soon after `at` (sport, a run) that makes a lighter meal sensible. */
export function activityAfter(events: CalendarEvent[], at: number, withinMin = 180): CalendarEvent | undefined {
  return events.find((e) => e.active && e.start > at && e.start - at <= withinMin * MINUTE);
}

export function mealEventAt(events: CalendarEvent[], at: number): CalendarEvent | undefined {
  return events.find((e) => e.kind === "meal" && !e.id.startsWith("order-") && e.start - 30 * MINUTE <= at && e.end >= at);
}

export function orderEvent(o: Order, title: string): CalendarEvent {
  return { id: `order-${o.id}`, title, start: o.arriveAt, end: o.arriveAt + 30 * MINUTE, kind: "meal" };
}
