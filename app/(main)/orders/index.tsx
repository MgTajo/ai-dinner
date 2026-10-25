import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { ScrollView, View } from "react-native";
import { StageDot } from "../../../components/agent/OrderCard";
import { PageHeader, useWide } from "../../../components/shell/AppShell";
import { DishArt, PlatformDot } from "../../../components/ui/DishArt";
import { Card, Divider, Pill, SectionHeader, Stars, T, Touchable } from "../../../components/ui/primitives";
import { color } from "../../../components/ui/theme";
import { platforms } from "../../../lib/agent/data/platforms";
import { itemById } from "../../../lib/agent/data/restaurants";
import { money, plural } from "../../../lib/agent/format";
import { isActive, orderStage, stageLabels } from "../../../lib/agent/orders";
import { fmtTime, relativeDay } from "../../../lib/agent/time";
import type { Order } from "../../../lib/agent/types";
import { useNow, useStore } from "../../../lib/store/StoreProvider";

export default function Orders() {
  const { state } = useStore();
  const wide = useWide();
  const now = useNow(5000);
  const orders = [...state.orders].sort((a, b) => b.arriveAt - a.arriveAt);
  const active = orders.filter((o) => o.source !== "history" && isActive(o, now));
  const bySous = orders.filter((o) => o.source !== "history" && !isActive(o, now));
  const imported = orders.filter((o) => o.source === "history");
  const spent = orders.filter((o) => o.source !== "history" && !o.cancelledAt).reduce((n, o) => n + o.total, 0);

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: wide ? 40 : 16, paddingBottom: 60 }}>
      <View style={{ width: "100%", maxWidth: 820, alignSelf: "center", gap: 26 }}>
        <PageHeader title="Orders" subtitle={`${plural(orders.filter((o) => o.source !== "history").length, "order")} by Sous · ${money(spent)} · ${plural(imported.length, "imported order")}`} />
        {active.length ? <Group title="In progress" orders={active} now={now} /> : null}
        {bySous.length ? <Group title="Ordered by Sous" orders={bySous} now={now} /> : null}
        {imported.length ? <Group title="Imported from your delivery accounts" orders={imported} now={now} /> : null}
        {!orders.length ? (
          <Card>
            <T variant="body">No orders yet. Ask Sous for something to eat and it will show up here, with its receipt.</T>
          </Card>
        ) : null}
      </View>
    </ScrollView>
  );
}

function Group({ title, orders, now }: { title: string; orders: Order[]; now: number }) {
  return (
    <View>
      <SectionHeader title={title} />
      <Card padded={false}>
        {orders.map((o, i) => (
          <View key={o.id}>
            {i ? <Divider inset={84} /> : null}
            <Row order={o} now={now} />
          </View>
        ))}
      </Card>
    </View>
  );
}

function Row({ order, now }: { order: Order; now: number }) {
  const { item, restaurant } = itemById(order.itemId);
  const stage = orderStage(order, now);
  const platform = platforms[order.platform];
  return (
    <Touchable radius={0} onPress={() => router.push(`/orders/${order.id}`)}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 12 }}>
        <DishArt item={item} size={52} />
        <View style={{ flex: 1, gap: 3 }}>
          <T variant="subheading" numberOfLines={1}>
            {item.name}
          </T>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <PlatformDot dot={platform.dot} size={6} />
            <T variant="small" numberOfLines={1} style={{ flexShrink: 1 }}>
              {restaurant.name} · {relativeDay(order.arriveAt, now)} {fmtTime(order.arriveAt)}
            </T>
          </View>
        </View>
        <View style={{ alignItems: "flex-end", gap: 5 }}>
          <T variant="num">{money(order.total)}</T>
          {order.source !== "history" && stage !== "delivered" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <StageDot stage={stage} />
              <T variant="caption">{stageLabels[stage]}</T>
            </View>
          ) : order.rating ? (
            <Stars value={order.rating} size={11} />
          ) : order.source !== "history" ? (
            <Pill label="Rate it" tone="accent" />
          ) : (
            <T variant="caption">Not rated</T>
          )}
        </View>
        <ChevronRight size={16} color={color.faint} />
      </View>
    </Touchable>
  );
}
