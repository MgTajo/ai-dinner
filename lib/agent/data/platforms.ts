import type { Platform, PlatformId } from "../types";

// The places the agent can order from. Fees are illustrative, shaped like the real
// marketplaces' pricing (base + distance delivery fee, percentage service fee with a cap,
// small-order fee), so the agent's cross-platform comparison has something real to compare.

const round = (n: number) => Math.round(n * 100) / 100;

export const platforms: Record<PlatformId, Platform> = {
  deliveroo: {
    id: "deliveroo",
    name: "Deliveroo",
    kind: "marketplace",
    dot: "#1BA9A0",
    deliveryFee: (km) => round(0.99 + km * 0.45),
    serviceRate: 0.1,
    serviceMin: 0.49,
    serviceMax: 2.99,
    smallOrder: { under: 10, fee: 1 },
    onTime: 0.93,
    collection: true,
    delivery: true,
    settlement: "52qCRjyipZHSRLkWkUDCHkq73WLSpFVw5U2XwgYDrabd",
  },
  ubereats: {
    id: "ubereats",
    name: "Uber Eats",
    kind: "marketplace",
    dot: "#2A9D5C",
    deliveryFee: (km) => round(0.49 + km * 0.6),
    serviceRate: 0.15,
    serviceMin: 0.99,
    serviceMax: 3.49,
    smallOrder: { under: 12, fee: 2 },
    onTime: 0.9,
    collection: true,
    delivery: true,
    settlement: "Bd8i8URf6ekj7NRRdRbNGQ8ymuPDm7915va8JZwzEvEq",
  },
  justeat: {
    id: "justeat",
    name: "Just Eat",
    kind: "marketplace",
    dot: "#E97B1C",
    deliveryFee: () => 1.99,
    serviceRate: 0,
    serviceMin: 0.79,
    serviceMax: 0.79,
    smallOrder: { under: 10, fee: 1.5 },
    onTime: 0.87,
    collection: true,
    delivery: true,
    settlement: "BeLZkRYqCKKA47Bo9YNQk7zKKnBDbhp1tqv1KqkTXSUz",
  },
  direct: {
    id: "direct",
    name: "Restaurant site",
    kind: "direct",
    dot: "#3A3732",
    deliveryFee: (km) => (km <= 2 ? 1.5 : 2.5),
    serviceRate: 0,
    serviceMin: 0,
    serviceMax: 0,
    smallOrder: { under: 0, fee: 0 },
    onTime: 0.91,
    collection: true,
    delivery: true,
    settlement: "4pG5Erp1rqvXQ9gzfpVU7faV11TRhkrridmiNcDLnd3N",
  },
  phone: {
    id: "phone",
    name: "Phone order",
    kind: "phone",
    dot: "#3E5FB0",
    deliveryFee: (km) => (km <= 2.5 ? 2 : 3),
    serviceRate: 0,
    serviceMin: 0,
    serviceMax: 0,
    smallOrder: { under: 0, fee: 0 },
    onTime: 0.88,
    collection: true,
    delivery: true,
    settlement: "Cnak2G7DR232JmSbcfQ9Ah81mKTjg7ZfN714MJ3dqAiK",
  },
};

export const marketplaceIds: PlatformId[] = ["deliveroo", "ubereats", "justeat"];

export function platformName(id: PlatformId): string {
  return platforms[id].name;
}

/** Fees for one basket on one platform, in GBP. */
export function feesFor(platformId: PlatformId, subtotal: number, km: number, delivery: boolean) {
  const p = platforms[platformId];
  const deliveryFee = delivery ? p.deliveryFee(km) : 0;
  const serviceFee = p.serviceRate > 0 ? round(Math.min(p.serviceMax, Math.max(p.serviceMin, subtotal * p.serviceRate))) : p.serviceMin;
  const smallOrderFee = subtotal < p.smallOrder.under ? p.smallOrder.fee : 0;
  return { deliveryFee, serviceFee, smallOrderFee, total: round(subtotal + deliveryFee + serviceFee + smallOrderFee) };
}
