import { router } from "expo-router";
import { CalendarCheck2, Clock3, MapPin } from "lucide-react-native";
import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { PageHeader, useWide } from "../../components/shell/AppShell";
import { DishArt } from "../../components/ui/DishArt";
import { Button, Card, Divider, Pill, Stepper, T, Toggle } from "../../components/ui/primitives";
import { color, font, radius } from "../../components/ui/theme";
import { itemById } from "../../lib/agent/data/restaurants";
import { money } from "../../lib/agent/format";
import { activityAfter, lastMeeting } from "../../lib/agent/orders";
import { orderPlanNow, setRule, skipPlan } from "../../lib/agent/runner";
import { fmtDay, fmtRelative, fmtTime, HOUR, hoursOf } from "../../lib/agent/time";
import type { AutopilotPlan, CalendarEvent } from "../../lib/agent/types";
import { useNow, useStore } from "../../lib/store/StoreProvider";

const START_H = 8;
const END_H = 22;
const PX_PER_HOUR = 58;

export default function Today() {
  const { state } = useStore();
  const wide = useWide();
  const now = useNow(5000);
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: wide ? 40 : 16, paddingBottom: 60 }}>
      <View style={{ width: "100%", maxWidth: 1100, alignSelf: "center" }}>
        <PageHeader title="Today" subtitle={`${fmtDay(now)} · ${state.profile.calendarConnected ? "Work calendar connected" : "Calendar not connected"}`} />
        <View style={{ flexDirection: wide ? "row" : "column-reverse", gap: 24, alignItems: "flex-start" }}>
          <View style={{ flex: wide ? 1.25 : undefined, width: wide ? undefined : "100%" }}>
            <Timeline now={now} />
          </View>
          <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : "100%", gap: 16 }}>
            <Autopilot now={now} />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function Timeline({ now }: { now: number }) {
  const { state } = useStore();
  // Local clock hours, not ms since midnight: clock-change days aren't 24 hours long.
  const top = (ms: number) => (hoursOf(ms) - START_H) * PX_PER_HOUR;
  const plan = state.autopilot.plans.find((p) => p.rule === "dinner" && p.option && (p.state === "planned" || p.state === "proposed"));
  const events = state.calendar.events;
  const nowTop = top(now);

  return (
    <Card padded={false} style={{ paddingVertical: 12 }}>
      <View style={{ height: (END_H - START_H) * PX_PER_HOUR + 12, marginLeft: 58, marginRight: 14, position: "relative" }}>
        {Array.from({ length: END_H - START_H + 1 }, (_, i) => (
          <View key={i} style={{ position: "absolute", top: i * PX_PER_HOUR, left: -50, right: 0, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <T variant="caption" style={{ width: 40, textAlign: "right", fontFamily: font.mono, fontSize: 10.5, color: color.faint, marginTop: -1 }}>
              {String(START_H + i).padStart(2, "0")}:00
            </T>
            <View style={{ flex: 1, height: 1, backgroundColor: color.line }} />
          </View>
        ))}
        {events.map((e) => (
          <EventBlock key={e.id} e={e} top={top(e.start)} height={Math.max(22, ((e.end - e.start) / HOUR) * PX_PER_HOUR - 3)} past={e.end < now} />
        ))}
        {plan?.option ? (
          <View style={{ position: "absolute", left: 8, right: 0, top: top(plan.option.offer.arriveAt), height: PX_PER_HOUR / 2 - 3, borderRadius: radius.xs, borderWidth: 1.5, borderStyle: "dashed", borderColor: color.accent, backgroundColor: "rgba(208,71,42,0.05)", paddingHorizontal: 10, justifyContent: "center" }}>
            <T variant="caption" style={{ color: color.accentInk, fontFamily: font.semibold }} numberOfLines={1}>
              Planned dinner · {itemById(plan.option.offer.itemId).restaurant.name} · {fmtTime(plan.option.offer.arriveAt)}
            </T>
          </View>
        ) : null}
        {nowTop >= 0 && nowTop <= (END_H - START_H) * PX_PER_HOUR ? (
          <View style={{ position: "absolute", top: nowTop, left: -8, right: 0, flexDirection: "row", alignItems: "center" }} pointerEvents="none">
            <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color.accent }} />
            <View style={{ flex: 1, height: 1.5, backgroundColor: color.accent }} />
          </View>
        ) : null}
      </View>
    </Card>
  );
}

function EventBlock({ e, top, height, past }: { e: CalendarEvent; top: number; height: number; past: boolean }) {
  const order = e.id.startsWith("order-");
  const palette = order
    ? { bg: color.greenSoft, bar: color.green, fg: color.green }
    : e.kind === "meeting"
      ? { bg: color.blueSoft, bar: color.blue, fg: color.blue }
      : e.kind === "meal"
        ? { bg: color.amberSoft, bar: color.amber, fg: color.amber }
        : e.active
          ? { bg: color.greenSoft, bar: color.green, fg: color.green }
          : { bg: color.sunken, bar: color.lineStrong, fg: color.ink2 };
  return (
    <View style={{ position: "absolute", top: top + 1, left: 8, right: 0, height, borderRadius: radius.xs, backgroundColor: palette.bg, flexDirection: "row", overflow: "hidden", opacity: past ? 0.55 : 1 }}>
      <View style={{ width: 3, backgroundColor: palette.bar }} />
      <View style={{ flex: 1, paddingHorizontal: 10, paddingVertical: height > 30 ? 6 : 2, flexDirection: height > 40 ? "column" : "row", gap: height > 40 ? 1 : 8, alignItems: height > 40 ? "flex-start" : "center" }}>
        <T variant="caption" style={{ fontFamily: font.semibold, color: palette.fg }} numberOfLines={1}>
          {order ? `${e.title} · delivered by Sous` : e.title}
        </T>
        <T variant="caption" style={{ color: palette.fg, opacity: 0.8 }} numberOfLines={1}>
          {fmtTime(e.start)}–{fmtTime(e.end)}
          {e.where ? ` · ${e.where}` : ""}
        </T>
      </View>
    </View>
  );
}

function Autopilot({ now }: { now: number }) {
  const store = useStore();
  const { state } = store;
  const dinner = state.autopilot.plans.find((p) => p.rule === "dinner");
  const last = lastMeeting(state.calendar.events);
  const activity = last ? activityAfter(state.calendar.events, last.end) : undefined;
  const lunchRule = state.autopilot.rules.find((r) => r.id === "lunch")!;
  const dinnerRule = state.autopilot.rules.find((r) => r.id === "dinner")!;
  const lunchEvent = state.calendar.events.find((e) => e.kind === "meal" && !e.id.startsWith("order-"));

  return (
    <>
      <Card style={{ gap: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <T variant="label">Tonight</T>
          <PlanState plan={dinner} />
        </View>
        {last ? (
          <View style={{ gap: 8 }}>
            <Reason icon={<CalendarCheck2 size={15} color={color.blue} />} text={`Last meeting: ${last.title}, ends ${fmtTime(last.end)}`} />
            {activity ? <Reason icon={<MapPin size={15} color={color.green} />} text={`${activity.title} at ${fmtTime(activity.start)}, so a lighter meal`} /> : null}
            {dinner?.option ? <Reason icon={<Clock3 size={15} color={color.accent} />} text={dinner.state === "planned" ? `Decides ${fmtRelative(dinner.decideAt, now)}, at ${fmtTime(dinner.decideAt)}, when the kitchen needs the order` : dinner.state === "proposed" ? "Waiting for your go-ahead in the chat" : "Ordered"} /> : null}
          </View>
        ) : (
          <T variant="small">No meetings this evening, so no automatic dinner. Ask Sous whenever you're hungry.</T>
        )}
        {dinner && (dinner.option || dinner.orderId) && dinner.state !== "skipped" ? <PlanCard plan={dinner} /> : null}
        {dinner?.option && (dinner.state === "planned" || dinner.state === "proposed") ? (
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <Button title="Order now" size="sm" onPress={() => orderPlanNow(store, "dinner").then(() => router.navigate("/agent"))} />
            <Button title="Choose something else" size="sm" kind="secondary" onPress={() => router.navigate("/agent")} />
            <Button title="Skip tonight" size="sm" kind="ghost" onPress={() => skipPlan(store, "dinner")} />
          </View>
        ) : null}
      </Card>

      <Card padded={false}>
        <View style={{ padding: 18, paddingBottom: 6 }}>
          <T variant="label">Autopilot rules</T>
        </View>
        <RuleRow
          title="Lunch on busy days"
          text={lunchEvent ? `Skipped today: ${lunchEvent.title} is in your calendar` : "Lands after your last morning meeting"}
          enabled={lunchRule.enabled}
          onToggle={(v) => setRule(store, "lunch", { enabled: v })}
        />
        <Divider inset={18} />
        <RuleRow
          title="Dinner after work"
          text={`Lands ${dinnerRule.bufferMin} min after your last meeting`}
          enabled={dinnerRule.enabled}
          onToggle={(v) => setRule(store, "dinner", { enabled: v })}
          extra={<Stepper value={dinnerRule.bufferMin} min={0} max={45} step={5} format={(v) => `${v} min`} onChange={(v) => setRule(store, "dinner", { bufferMin: v })} />}
        />
        <Divider inset={18} />
        <View style={{ padding: 18, gap: 4 }}>
          <T variant="smallStrong">{state.profile.autonomy === "auto" ? "Orders on its own within your limits" : state.profile.autonomy === "confirm" ? "Asks you before it orders" : "Only recommends"}</T>
          <T variant="caption">
            Per order up to {money(state.profile.limits.perOrder)}, {money(state.profile.limits.weekly)} a week. Change in Settings.
          </T>
        </View>
      </Card>
    </>
  );
}

function Reason({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
      <View style={{ marginTop: 2 }}>{icon}</View>
      <T variant="small" style={{ color: color.ink2, flex: 1 }}>
        {text}
      </T>
    </View>
  );
}

function PlanState({ plan }: { plan?: AutopilotPlan }) {
  if (!plan) return <Pill label="Nothing planned" />;
  switch (plan.state) {
    case "planned":
      return <Pill label="Planned" tone="accent" dot />;
    case "proposed":
      return <Pill label="Needs your OK" tone="amber" dot />;
    case "ordered":
      return <Pill label="Ordered" tone="green" dot />;
    default:
      return <Pill label="Skipped" />;
  }
}

function PlanCard({ plan }: { plan: AutopilotPlan }) {
  const { state } = useStore();
  const order = plan.orderId ? state.orders.find((o) => o.id === plan.orderId) : undefined;
  const itemId = order?.itemId ?? plan.option?.offer.itemId;
  if (!itemId) return null;
  const { item, restaurant } = itemById(itemId);
  const total = order?.total ?? plan.option?.offer.total ?? 0;
  const arriveAt = order?.arriveAt ?? plan.option?.offer.arriveAt ?? plan.target;
  return (
    <View style={{ flexDirection: "row", gap: 14, alignItems: "center", backgroundColor: color.sunken, borderRadius: radius.md, padding: 12 }}>
      <DishArt item={item} size={60} tint={color.surface} />
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="subheading">{item.name}</T>
        <T variant="small">
          {restaurant.name} · {money(total)}
        </T>
        <T variant="caption">{item.kcal} kcal · {item.protein} g protein</T>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <T variant="caption">Arrives</T>
        <T style={{ fontFamily: font.display, fontSize: 26, lineHeight: 30, color: color.ink }}>{fmtTime(arriveAt)}</T>
      </View>
    </View>
  );
}

function RuleRow({ title, text, enabled, onToggle, extra }: { title: string; text: string; enabled: boolean; onToggle: (v: boolean) => void; extra?: ReactNode }) {
  return (
    <View style={{ paddingHorizontal: 18, paddingVertical: 14, gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="bodyStrong">{title}</T>
          <T variant="small">{text}</T>
        </View>
        <Toggle value={enabled} onChange={onToggle} label={title} />
      </View>
      {extra && enabled ? <View style={{ alignSelf: "flex-start" }}>{extra}</View> : null}
    </View>
  );
}

