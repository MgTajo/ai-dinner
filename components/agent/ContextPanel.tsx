import { router } from "expo-router";
import { ArrowRight } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { itemById } from "../../lib/agent/data/restaurants";
import { money, usdc } from "../../lib/agent/format";
import { isActive } from "../../lib/agent/orders";
import { fmtDay, fmtRelative, fmtTime, MINUTE } from "../../lib/agent/time";
import { useNow, useStore } from "../../lib/store/StoreProvider";
import { DishArt } from "../ui/DishArt";
import { Bar, Card, Pill, T } from "../ui/primitives";
import { color, font } from "../ui/theme";
import { OrderCard } from "./OrderCard";

/** What the agent is working with right now: the day, the next meal, money. Desktop only. */
export function ContextPanel() {
  const { state } = useStore();
  const now = useNow(5000);
  const upcoming = state.calendar.events.filter((e) => e.end > now && !e.id.startsWith("order-")).sort((a, b) => a.start - b.start).slice(0, 4);
  const plan = state.autopilot.plans.find((p) => p.rule === "dinner" && p.option && (p.state === "planned" || p.state === "proposed"));
  const active = state.orders.find((o) => o.source !== "history" && isActive(o, now));
  const weekSpent = state.orders.filter((o) => o.source !== "history" && !o.cancelledAt && now - o.placedAt < 7 * 24 * 60 * MINUTE).reduce((n, o) => n + o.total, 0);
  const balance = state.runtime.payments === "live" && state.runtime.liveBalanceUsdc !== undefined ? state.runtime.liveBalanceUsdc : state.wallet.balanceUsdc;

  return (
    <ScrollView style={{ width: 340, flexGrow: 0, flexShrink: 0, borderLeftWidth: 1, borderLeftColor: color.line }} contentContainerStyle={{ padding: 20, paddingTop: 28, gap: 22 }}>
      <View style={{ gap: 2 }}>
        <T variant="label">{fmtDay(now)}</T>
        <T style={{ fontFamily: font.display, fontSize: 44, lineHeight: 48, color: color.ink }}>{fmtTime(now)}</T>
      </View>

      {active ? (
        <View style={{ gap: 10 }}>
          <T variant="label">On its way</T>
          <OrderCard orderId={active.id} compact />
        </View>
      ) : plan?.option ? (
        <View style={{ gap: 10 }}>
          <T variant="label">Dinner autopilot</T>
          <Pressable onPress={() => router.navigate("/today")}>
            <Card style={{ gap: 12 }}>
              <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                <DishArt item={itemById(plan.option.offer.itemId).item} size={52} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T variant="subheading" numberOfLines={1}>
                    {itemById(plan.option.offer.itemId).item.name}
                  </T>
                  <T variant="caption">
                    {itemById(plan.option.offer.itemId).restaurant.name} · {money(plan.option.offer.total)}
                  </T>
                </View>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <View>
                  <T variant="caption">Arrives</T>
                  <T variant="bodyStrong">{fmtTime(plan.option.offer.arriveAt)}</T>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <T variant="caption">{plan.state === "proposed" ? "Waiting for you" : "Decides"}</T>
                  <T variant="bodyStrong">{plan.state === "proposed" ? "Now" : fmtRelative(plan.decideAt, now)}</T>
                </View>
              </View>
            </Card>
          </Pressable>
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <T variant="label">Coming up</T>
          <Pressable onPress={() => router.navigate("/today")} hitSlop={6}>
            <ArrowRight size={15} color={color.muted} />
          </Pressable>
        </View>
        {upcoming.length ? (
          upcoming.map((e) => (
            <View key={e.id} style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
              <T variant="caption" style={{ width: 40, fontFamily: font.mono, fontSize: 11 }}>
                {fmtTime(e.start)}
              </T>
              <View style={{ width: 3, alignSelf: "stretch", borderRadius: 2, backgroundColor: e.kind === "meeting" ? color.blue : e.active ? color.green : color.lineStrong }} />
              <View style={{ flex: 1 }}>
                <T variant="smallStrong" style={{ color: color.ink }} numberOfLines={1}>
                  {e.title}
                </T>
                <T variant="caption">
                  {fmtTime(e.start)}–{fmtTime(e.end)}
                  {e.where ? ` · ${e.where}` : ""}
                </T>
              </View>
              {e.start <= now ? <Pill label="Now" tone="blue" /> : null}
            </View>
          ))
        ) : (
          <T variant="small">Nothing else today.</T>
        )}
      </View>

      <Pressable onPress={() => router.navigate("/wallet")}>
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <T variant="label">Agent wallet</T>
            <Pill label={state.runtime.payments === "live" ? "Devnet live" : "Devnet"} tone={state.runtime.payments === "live" ? "green" : "neutral"} dot />
          </View>
          <T variant="num" style={{ fontSize: 22, lineHeight: 26 }}>
            {usdc(balance)}
          </T>
          <View style={{ gap: 6 }}>
            <Bar value={weekSpent / state.profile.limits.weekly} height={5} tone={color.ink2} />
            <T variant="caption">
              {money(weekSpent)} of {money(state.profile.limits.weekly)} weekly budget
            </T>
          </View>
        </Card>
      </Pressable>
    </ScrollView>
  );
}
