import { router, usePathname } from "expo-router";
import { CalendarClock, MessageSquareText, Receipt, Settings2, Sparkle, Wallet, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { itemById } from "../../lib/agent/data/restaurants";
import { usdc } from "../../lib/agent/format";
import { fmtTime } from "../../lib/agent/time";
import { useStore } from "../../lib/store/StoreProvider";
import { Avatar, Logo } from "../ui/Brand";
import { T } from "../ui/primitives";
import { color, font, layout, radius } from "../ui/theme";
import { Presenter } from "./Presenter";

interface NavItem {
  href: string;
  label: string;
  short: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { href: "/agent", label: "Agent", short: "Agent", icon: MessageSquareText },
  { href: "/today", label: "Today", short: "Today", icon: CalendarClock },
  { href: "/orders", label: "Orders", short: "Orders", icon: Receipt },
  { href: "/taste", label: "Taste profile", short: "Taste", icon: Sparkle },
  { href: "/wallet", label: "Wallet", short: "Wallet", icon: Wallet },
];

export function useWide() {
  const { width } = useWindowDimensions();
  return width >= layout.wide;
}

export function AppShell({ children }: { children: ReactNode }) {
  const wide = useWide();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  if (wide) {
    return (
      <View style={{ flex: 1, flexDirection: "row", backgroundColor: color.bg }}>
        <Sidebar active={active} />
        <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
        <Presenter />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <View style={{ flex: 1 }}>{children}</View>
      <Presenter compact />
      <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: color.line, backgroundColor: color.surface, paddingBottom: Math.max(insets.bottom, 6), paddingTop: 6 }}>
        {NAV.map((item) => {
          const on = active(item.href);
          const Icon = item.icon;
          return (
            <Pressable key={item.href} style={{ flex: 1, alignItems: "center", gap: 3, paddingVertical: 4 }} onPress={() => router.navigate(item.href as never)} accessibilityRole="tab" accessibilityState={{ selected: on }}>
              <Icon size={21} color={on ? color.ink : color.faint} strokeWidth={on ? 2.1 : 1.8} />
              <Text style={{ fontFamily: on ? font.semibold : font.medium, fontSize: 11, color: on ? color.ink : color.faint }}>{item.short}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Sidebar({ active }: { active: (href: string) => boolean }) {
  const { state } = useStore();
  const plan = state.autopilot.plans.find((p) => p.rule === "dinner" && p.state !== "skipped" && (p.option || p.orderId));
  const ordered = plan?.orderId ? state.orders.find((o) => o.id === plan.orderId) : undefined;
  const dish = ordered ? itemById(ordered.itemId).item.name : plan?.option ? itemById(plan.option.offer.itemId).item.name : undefined;
  const autonomy = { suggest: "Recommends only", confirm: "Asks before ordering", auto: "Orders within your rules" }[state.profile.autonomy];
  return (
    <View style={{ width: 248, borderRightWidth: 1, borderRightColor: color.line, paddingHorizontal: 16, paddingTop: 22, paddingBottom: 16, gap: 22 }}>
      <View style={{ paddingHorizontal: 8 }}>
        <Logo size={24} />
      </View>
      <View style={{ gap: 2 }}>
        {NAV.map((item) => (
          <NavRow key={item.href} item={item} on={active(item.href)} />
        ))}
      </View>

      <View style={{ flex: 1 }} />

      {plan && dish ? (
        <Pressable onPress={() => router.navigate("/today")}>
          <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: color.line, backgroundColor: color.surface, padding: 12, gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: plan.state === "ordered" ? color.green : color.accent }} />
              <T variant="label" style={{ fontSize: 10 }}>
                {plan.state === "ordered" ? "Dinner ordered" : "Dinner autopilot"}
              </T>
            </View>
            <T variant="smallStrong" numberOfLines={1} style={{ color: color.ink }}>
              {dish}
            </T>
            <T variant="caption">
              {ordered ? `Arrives ${fmtTime(ordered.arriveAt)}` : plan.option ? `Arrives ${fmtTime(plan.option.offer.arriveAt)} · decides ${fmtTime(plan.decideAt)}` : ""}
            </T>
          </View>
        </Pressable>
      ) : null}

      <Pressable onPress={() => router.navigate("/settings")}>
        {(s) => (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 8, borderRadius: radius.sm, backgroundColor: (s as { hovered?: boolean }).hovered || active("/settings") ? color.sunken : "transparent" }}>
            <Avatar name={state.profile.name} size={32} />
            <View style={{ flex: 1 }}>
              <T variant="smallStrong" style={{ color: color.ink }} numberOfLines={1}>
                {state.profile.name}
              </T>
              <T variant="caption" numberOfLines={1}>
                {autonomy} · {usdc(state.runtime.payments === "live" && state.runtime.liveBalanceUsdc !== undefined ? state.runtime.liveBalanceUsdc : state.wallet.balanceUsdc)}
              </T>
            </View>
            <Settings2 size={16} color={color.faint} />
          </View>
        )}
      </Pressable>
    </View>
  );
}

function NavRow({ item, on }: { item: NavItem; on: boolean }) {
  const Icon = item.icon;
  return (
    <Pressable onPress={() => router.navigate(item.href as never)} accessibilityRole="link" accessibilityState={{ selected: on }}>
      {(s) => (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 11,
            height: 38,
            paddingHorizontal: 10,
            borderRadius: radius.sm,
            backgroundColor: on ? color.surface : (s as { hovered?: boolean }).hovered ? color.sunken : "transparent",
            borderWidth: 1,
            borderColor: on ? color.line : "transparent",
          }}
        >
          <Icon size={17} color={on ? color.ink : color.muted} strokeWidth={on ? 2.1 : 1.8} />
          <Text style={{ fontFamily: on ? font.semibold : font.medium, fontSize: 14, color: on ? color.ink : color.ink2 }}>{item.label}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Page header used by every main screen. On phones it carries the settings shortcut. */
export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const wide = useWide();
  const { state } = useStore();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: wide ? 28 : insets.top + 14, paddingBottom: 18, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
      <View style={{ flex: 1, gap: 4 }}>
        <T variant="title" style={!wide && { fontSize: 28, lineHeight: 32 }}>
          {title}
        </T>
        {subtitle ? <T variant="small">{subtitle}</T> : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {right}
        {!wide ? (
          <Pressable onPress={() => router.navigate("/settings")} accessibilityLabel="Settings">
            <Avatar name={state.profile.name} size={34} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
