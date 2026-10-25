import { router } from "expo-router";
import { ChevronDown, Clock3, FastForward, RotateCcw, TimerReset, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { isActive, lastMeeting, orderStage } from "../../lib/agent/orders";
import { extendMeeting, refreshPlans } from "../../lib/agent/runner";
import { clockNow, fmtTime, MINUTE, setClock } from "../../lib/agent/time";
import { useNow, useStore } from "../../lib/store/StoreProvider";
import { Segmented, T } from "../ui/primitives";
import { color, font, radius, shadow } from "../ui/theme";

// Controls for presenting the demo live: a scenario clock that can be sped up or jumped, and
// calendar events that can be made to run over. Hidden from the product UI behind one small pill.

export function Presenter({ compact }: { compact?: boolean }) {
  const store = useStore();
  const { state, update } = store;
  const now = useNow(1000);
  const [open, setOpen] = useState(false);
  if (!state.presenter || !state.onboarded) return null;

  const jump = (ms: number) => {
    update((s) => ({ ...s, clock: setClock(s.clock, ms) }));
    setTimeout(() => refreshPlans(store), 50);
  };
  const plan = state.autopilot.plans.find((p) => p.state === "planned" && p.option);
  const active = state.orders.find((o) => o.source !== "history" && isActive(o, now));
  const nextStageAt = active ? [active.acceptedAt, active.prepAt, active.pickedUpAt, active.arriveAt].find((t) => t > now + 5000) : undefined;
  const last = lastMeeting(state.calendar.events);

  // On phones it sits above the composer and tab bar so it never covers the send button.
  const pos = compact ? { right: 12, bottom: 150 } : { right: 20, bottom: 20 };

  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} style={{ position: "absolute", ...pos }} accessibilityLabel="Open presenter controls">
        <View style={[{ flexDirection: "row", alignItems: "center", gap: 7, height: 32, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: color.ink }, shadow.raised]}>
          <Clock3 size={13} color="#FFFFFF" strokeWidth={2} />
          <Text style={{ fontFamily: font.monoMedium, fontSize: 12, color: "#FFFFFF", fontVariant: ["tabular-nums"] }}>{fmtTime(now)}</Text>
          {state.clock.speed > 1 ? <Text style={{ fontFamily: font.medium, fontSize: 11, color: "#C9C4BA" }}>{state.clock.speed}×</Text> : null}
        </View>
      </Pressable>
    );
  }

  const action = (label: string, onPress: () => void, Icon = FastForward, disabled = false) => (
    <Pressable onPress={onPress} disabled={disabled}>
      {(s) => (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, paddingHorizontal: 10, borderRadius: radius.sm, backgroundColor: (s as { hovered?: boolean }).hovered ? "#2A2825" : "transparent", opacity: disabled ? 0.4 : 1 }}>
          <Icon size={15} color="#E8E4DC" strokeWidth={1.9} />
          <Text style={{ fontFamily: font.medium, fontSize: 13, color: "#F2EFE9", flex: 1 }}>{label}</Text>
        </View>
      )}
    </Pressable>
  );

  return (
    <View style={[{ position: "absolute", ...pos, width: 290, borderRadius: radius.lg, backgroundColor: color.ink, padding: 14, gap: 10 }, shadow.raised]}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View>
          <T variant="label" style={{ color: "#A39E95", fontSize: 10 }}>
            Presenter · scenario clock
          </T>
          <Text style={{ fontFamily: font.monoMedium, fontSize: 26, color: "#FFFFFF", fontVariant: ["tabular-nums"], marginTop: 2 }}>{fmtTime(now)}</Text>
        </View>
        <Pressable onPress={() => setOpen(false)} hitSlop={8} accessibilityLabel="Close presenter controls">
          <ChevronDown size={18} color="#C9C4BA" />
        </Pressable>
      </View>
      <View style={{ opacity: 0.95 }}>
        <Segmented
          value={String(state.clock.speed)}
          options={[
            { value: "1", label: "1×" },
            { value: "10", label: "10×" },
            { value: "60", label: "60×" },
          ]}
          onChange={(v) => update((s) => ({ ...s, clock: { ...setClock(s.clock, clockNow(s.clock)), speed: Number(v) } }))}
        />
      </View>
      <View>
        {action("+15 minutes", () => jump(now + 15 * MINUTE))}
        {action(plan ? `Jump to autopilot decision (${fmtTime(plan.decideAt)})` : "Jump to autopilot decision", () => plan && jump(plan.decideAt - 15_000), FastForward, !plan)}
        {action(active ? `Next order step (${orderStage(active, now)})` : "Next order step", () => nextStageAt && jump(nextStageAt + 1000), FastForward, !nextStageAt)}
        {action(last ? `${last.title} runs 30 min over` : "Meeting runs over", () => last && extendMeeting(store, last.id, 30), TimerReset, !last)}
        {action("Reset demo", () => {
          store.reset();
          router.replace("/onboarding");
        }, RotateCcw)}
      </View>
      <Pressable onPress={() => update((s) => ({ ...s, presenter: false }))}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center", paddingTop: 2 }}>
          <X size={12} color="#8E897F" />
          <Text style={{ fontFamily: font.regular, fontSize: 11.5, color: "#8E897F" }}>Hide (turn back on in Settings)</Text>
        </View>
      </Pressable>
    </View>
  );
}
