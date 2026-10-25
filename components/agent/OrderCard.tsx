import { router } from "expo-router";
import { ArrowUpRight, Check, Phone } from "lucide-react-native";
import { Linking, Pressable, View } from "react-native";
import { platforms } from "../../lib/agent/data/platforms";
import { itemById } from "../../lib/agent/data/restaurants";
import { money, shortAddress, usdc } from "../../lib/agent/format";
import { canCancel, orderStage, stageLabels } from "../../lib/agent/orders";
import { cancelOrder } from "../../lib/agent/runner";
import { fmtRelative, fmtTime } from "../../lib/agent/time";
import type { Order, OrderStage } from "../../lib/agent/types";
import { useNow, useStore } from "../../lib/store/StoreProvider";
import { RestaurantMark } from "../ui/DishArt";
import { Button, Card, Pill, Spinner, T } from "../ui/primitives";
import { color, font, radius } from "../ui/theme";

const DELIVERY_STEPS: { key: OrderStage[]; label: string; at: (o: Order) => number }[] = [
  { key: ["placed", "accepted", "scheduled"], label: "Confirmed", at: (o) => o.acceptedAt },
  { key: ["preparing"], label: "Cooking", at: (o) => o.prepAt },
  { key: ["on-the-way", "ready"], label: "On the way", at: (o) => o.pickedUpAt },
  { key: ["delivered", "collected"], label: "Delivered", at: (o) => o.arriveAt },
];

export function explorerUrl(signature: string) {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

export function PaymentLine({ order }: { order: Order }) {
  const p = order.payment;
  if (!p) return null;
  const live = !p.simulated && p.signature;
  return (
    <Pressable onPress={() => live && Linking.openURL(explorerUrl(p.signature!))} disabled={!live}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.green }} />
        <T variant="small" style={{ color: color.ink2 }}>
          Paid {usdc(p.amountUsdc)} on Solana
        </T>
        <T variant="mono" style={{ fontSize: 11.5, color: color.muted }}>
          {shortAddress(p.signature ?? "", 5)}
        </T>
        {live ? <ArrowUpRight size={13} color={color.muted} /> : <Pill label="devnet · simulated" />}
      </View>
    </Pressable>
  );
}

export function OrderCard({ orderId, compact }: { orderId: string; compact?: boolean }) {
  const store = useStore();
  const now = useNow(1000);
  const order = store.state.orders.find((o) => o.id === orderId);
  if (!order) return null;
  const { item, restaurant } = itemById(order.itemId);
  const stage = orderStage(order, now);
  const done = stage === "delivered" || stage === "collected";
  const current = DELIVERY_STEPS.findIndex((s) => s.key.includes(stage));
  const platform = platforms[order.platform];

  return (
    <Card padded={false}>
      <Pressable onPress={() => router.push(`/orders/${order.id}`)}>
        <View style={{ padding: 16, gap: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <RestaurantMark restaurant={restaurant} size={38} />
            <View style={{ flex: 1, gap: 1 }}>
              <T variant="subheading" numberOfLines={1}>
                {order.qty > 1 ? `${order.qty} × ` : ""}
                {item.name}
              </T>
              <T variant="caption" numberOfLines={1}>
                {restaurant.name} · {platform.kind === "marketplace" ? platform.name : platform.kind === "phone" ? "Ordered by phone" : "Restaurant website"} · {order.id}
              </T>
            </View>
            {stage === "cancelled" ? <Pill label="Cancelled" tone="neutral" /> : done ? <Pill label={stageLabels[stage]} tone="green" icon={Check} /> : <Pill label={stageLabels[stage]} tone="accent" dot />}
          </View>

          {stage !== "cancelled" ? (
            <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
              <View>
                <T variant="caption">{done ? "Delivered" : order.fulfilment === "delivery" ? "Arrives" : "Ready"}</T>
                <T style={{ fontFamily: font.display, fontSize: 34, lineHeight: 38, color: color.ink }}>{fmtTime(order.arriveAt)}</T>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                {order.originalArriveAt && order.originalArriveAt !== order.arriveAt ? <T variant="caption" style={{ textDecorationLine: "line-through" }}>{fmtTime(order.originalArriveAt)}</T> : null}
                <T variant="smallStrong">{done ? fmtRelative(order.arriveAt, now) : fmtRelative(order.arriveAt, now)}</T>
                <T variant="caption">{money(order.total)}</T>
              </View>
            </View>
          ) : null}

          {stage !== "cancelled" ? (
            <View style={{ flexDirection: "row", gap: 4 }}>
              {DELIVERY_STEPS.map((s, i) => {
                const reached = i <= current;
                const live = i === current && !done;
                return (
                  <View key={s.label} style={{ flex: 1, gap: 6 }}>
                    <View style={{ height: 4, borderRadius: 2, backgroundColor: reached ? (done ? color.green : color.ink) : color.sunken, overflow: "hidden" }}>
                      {live ? <View style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 6, backgroundColor: color.accent }} /> : null}
                    </View>
                    {!compact ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        {live ? <Spinner size={9} /> : null}
                        <T variant="caption" style={{ color: reached ? color.ink2 : color.faint, fontFamily: reached ? font.medium : font.regular }} numberOfLines={1}>
                          {s.label}
                        </T>
                      </View>
                    ) : null}
                    {!compact ? (
                      <T variant="caption" style={{ fontFamily: font.mono, fontSize: 10.5, color: color.faint }}>
                        {fmtTime(s.at(order))}
                      </T>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}

          {order.call && !compact ? (
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <Phone size={13} color={color.muted} />
              <T variant="small">Confirmed by phone with {restaurant.name}</T>
            </View>
          ) : null}
          <PaymentLine order={order} />
        </View>
      </Pressable>
      {!compact && canCancel(order, now) && stage !== "cancelled" ? (
        <View style={{ borderTopWidth: 1, borderTopColor: color.line, paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <T variant="caption" style={{ paddingLeft: 4 }}>
            Free cancellation until {fmtTime(order.prepAt)}
          </T>
          <Button title="Cancel order" kind="ghost" size="sm" onPress={() => cancelOrder(store, order.id)} />
        </View>
      ) : null}
    </Card>
  );
}

export function StageDot({ stage }: { stage: OrderStage }) {
  const tone = stage === "cancelled" ? color.faint : stage === "delivered" || stage === "collected" ? color.green : color.accent;
  return <View style={{ width: 7, height: 7, borderRadius: radius.pill, backgroundColor: tone }} />;
}
