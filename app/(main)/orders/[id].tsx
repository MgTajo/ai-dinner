import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, ArrowUpRight, PhoneCall, RotateCcw } from "lucide-react-native";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { explorerUrl, OrderCard } from "../../../components/agent/OrderCard";
import { useWide } from "../../../components/shell/AppShell";
import { DishArt } from "../../../components/ui/DishArt";
import { Button, Card, Divider, KeyRow, Pill, SectionHeader, Stars, T } from "../../../components/ui/primitives";
import { color, font } from "../../../components/ui/theme";
import { platforms } from "../../../lib/agent/data/platforms";
import { itemById } from "../../../lib/agent/data/restaurants";
import { allergenNames, money, shortAddress, usdc } from "../../../lib/agent/format";
import { send } from "../../../lib/agent/runner";
import { fmtDay, fmtTime } from "../../../lib/agent/time";
import { useStore } from "../../../lib/store/StoreProvider";

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const wide = useWide();
  const order = store.state.orders.find((o) => o.id === id);
  if (!order) {
    return (
      <View style={{ padding: 40 }}>
        <T variant="body">That order doesn't exist any more.</T>
      </View>
    );
  }
  const { item, restaurant } = itemById(order.itemId);
  const platform = platforms[order.platform];
  const p = order.payment;

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: wide ? 40 : 16, paddingBottom: 60 }}>
      <View style={{ width: "100%", maxWidth: 820, alignSelf: "center", gap: 22, paddingTop: wide ? 24 : 54 }}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.navigate("/orders"))} style={{ alignSelf: "flex-start" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <ArrowLeft size={16} color={color.ink2} />
            <T variant="smallStrong">Orders</T>
          </View>
        </Pressable>

        <View style={{ flexDirection: "row", gap: 18, alignItems: "center" }}>
          <DishArt item={item} size={88} />
          <View style={{ flex: 1, gap: 4 }}>
            <T variant="title">{item.name}</T>
            <T variant="small">
              {restaurant.name} · {restaurant.area} · {fmtDay(order.arriveAt)}
            </T>
            <View style={{ flexDirection: "row", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
              <Pill label={order.id} />
              <Pill label={order.source === "history" ? `Imported from ${platform.name}` : order.source === "autopilot" ? "Autopilot" : "Ordered in chat"} tone={order.source === "history" ? "neutral" : "accent"} />
            </View>
          </View>
        </View>

        {order.source !== "history" ? <OrderCard orderId={order.id} /> : null}

        <View style={{ flexDirection: wide ? "row" : "column", gap: 18, alignItems: "flex-start" }}>
          <Card style={{ flex: 1, width: wide ? undefined : "100%", gap: 2 }}>
            <SectionHeader title="Receipt" />
            <KeyRow label={`${order.qty} × ${item.name}`} value={money(order.subtotal)} />
            {order.deliveryFee ? <KeyRow label="Delivery" value={money(order.deliveryFee)} /> : null}
            {order.serviceFee ? <KeyRow label={`${platform.name} service fee`} value={money(order.serviceFee)} /> : null}
            {order.smallOrderFee ? <KeyRow label="Small order fee" value={money(order.smallOrderFee)} /> : null}
            <Divider style={{ marginVertical: 8 }} />
            <KeyRow label="Total" value={money(order.total)} strong />
            <T variant="caption" style={{ marginTop: 10 }}>
              Ordered via {platform.kind === "marketplace" ? platform.name : platform.kind === "phone" ? `phone (${restaurant.phone})` : `${restaurant.name}'s own website`}. Allergens: {item.allergens.map((a) => allergenNames[a]).join(", ") || "none listed"}.
            </T>
          </Card>

          {p ? (
            <Card style={{ flex: 1, width: wide ? undefined : "100%", gap: 2 }}>
              <SectionHeader title="Payment on Solana" />
              <KeyRow label="Amount" value={usdc(p.amountUsdc)} strong />
              <KeyRow label="Rate" value={`£1 = ${p.rate} USDC`} />
              <KeyRow label="Network" value={p.simulated ? "Devnet (simulated)" : "Devnet"} />
              <KeyRow label="Paid to" value={shortAddress(p.to, 6)} mono />
              <KeyRow label="Memo" value={p.memo} mono />
              <KeyRow label="Signature" value={shortAddress(p.signature ?? "", 8)} mono />
              <KeyRow label="Settled" value={fmtTime(p.at)} />
              {!p.simulated && p.signature ? (
                <Pressable onPress={() => Linking.openURL(explorerUrl(p.signature!))} style={{ marginTop: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <T variant="smallStrong">View on Solana Explorer</T>
                    <ArrowUpRight size={14} color={color.ink2} />
                  </View>
                </Pressable>
              ) : (
                <T variant="caption" style={{ marginTop: 10 }}>
                  Simulated settlement: the companion server wasn't set up to pay on devnet when this was ordered.
                </T>
              )}
            </Card>
          ) : (
            <Card style={{ flex: 1, width: wide ? undefined : "100%" }}>
              <SectionHeader title="Payment" />
              <T variant="small">Paid on {platform.name} before you joined Sous.</T>
            </Card>
          )}
        </View>

        {order.call ? (
          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <PhoneCall size={15} color={color.ink2} />
              <T variant="label">Call transcript · {restaurant.phone}</T>
            </View>
            {order.call.map((l, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 10 }}>
                <T variant="caption" style={{ width: 90, fontFamily: font.medium, color: l.who === "agent" ? color.accentInk : color.ink2 }}>
                  {l.who === "agent" ? "Sous (AI)" : restaurant.name}
                </T>
                <T variant="small" style={{ flex: 1, color: color.ink2 }}>
                  {l.text}
                </T>
              </View>
            ))}
          </Card>
        ) : null}

        <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <View style={{ gap: 6 }}>
            <T variant="label">Your rating</T>
            {order.rating ? <Stars value={order.rating} size={16} /> : <T variant="small">Not rated yet</T>}
            {order.feedback?.length ? <T variant="caption">{order.feedback.join(" · ")}</T> : null}
          </View>
          <Button
            title="Order again"
            icon={RotateCcw}
            kind="secondary"
            size="sm"
            onPress={() => {
              router.navigate("/agent");
              void send(store, `${item.name} from ${restaurant.name}`);
            }}
          />
        </Card>
      </View>
    </ScrollView>
  );
}
