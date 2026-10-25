import type { LucideIcon } from "lucide-react-native";
import { Check, Star } from "lucide-react-native";
import { useEffect, useRef, type ReactNode } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, Text, View, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from "react-native";
import { color, font, radius, shadow } from "./theme";

// ── Text ──────────────────────────────────────────────────────────────────────

type Variant = "display" | "title" | "heading" | "subheading" | "body" | "bodyStrong" | "small" | "smallStrong" | "caption" | "label" | "mono" | "num";

const variants: Record<Variant, TextStyle> = {
  display: { fontFamily: font.display, fontSize: 40, lineHeight: 44, letterSpacing: -0.6, color: color.ink },
  title: { fontFamily: font.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.3, color: color.ink },
  heading: { fontFamily: font.semibold, fontSize: 17, lineHeight: 23, letterSpacing: -0.2, color: color.ink },
  subheading: { fontFamily: font.semibold, fontSize: 15, lineHeight: 21, color: color.ink },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: color.ink2 },
  bodyStrong: { fontFamily: font.semibold, fontSize: 15, lineHeight: 22, color: color.ink },
  small: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: color.muted },
  smallStrong: { fontFamily: font.medium, fontSize: 13, lineHeight: 18, color: color.ink2 },
  caption: { fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: color.muted },
  label: { fontFamily: font.medium, fontSize: 11, lineHeight: 14, letterSpacing: 0.9, textTransform: "uppercase", color: color.muted },
  mono: { fontFamily: font.mono, fontSize: 12, lineHeight: 17, color: color.ink2 },
  num: { fontFamily: font.semibold, fontSize: 15, lineHeight: 20, color: color.ink, fontVariant: ["tabular-nums"] },
};

export function T({ variant = "body", style, ...rest }: TextProps & { variant?: Variant }) {
  return <Text {...rest} style={[variants[variant], style]} />;
}

// ── Buttons ───────────────────────────────────────────────────────────────────

type ButtonKind = "primary" | "secondary" | "ghost" | "accent";

export function Button({
  title,
  onPress,
  kind = "primary",
  icon: Icon,
  size = "md",
  disabled,
  loading,
  style,
  full,
}: {
  title: string;
  onPress?: () => void;
  kind?: ButtonKind;
  icon?: LucideIcon;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  full?: boolean;
}) {
  const palette = {
    primary: { bg: color.ink, fg: color.white, border: color.ink, hover: "#2C2A26" },
    accent: { bg: color.accent, fg: color.white, border: color.accent, hover: "#B93E23" },
    secondary: { bg: color.surface, fg: color.ink, border: color.lineStrong, hover: color.sunken },
    ghost: { bg: "transparent", fg: color.ink2, border: "transparent", hover: color.sunken },
  }[kind];
  const h = size === "sm" ? 34 : size === "lg" ? 52 : 44;
  const off = disabled || loading;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: off }} disabled={off} onPress={onPress} style={[full && { alignSelf: "stretch" }, style]}>
      {(state) => {
        const hovered = (state as { hovered?: boolean }).hovered;
        return (
          <View
            style={{
              height: h,
              paddingHorizontal: size === "sm" ? 12 : 18,
              borderRadius: radius.sm,
              borderWidth: 1,
              borderColor: off ? color.line : palette.border,
              backgroundColor: off ? color.sunken : hovered || state.pressed ? palette.hover : palette.bg,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transform: [{ scale: state.pressed && !off ? 0.985 : 1 }],
            }}
          >
            {loading ? <ActivityIndicator size="small" color={palette.fg} /> : Icon ? <Icon size={size === "sm" ? 15 : 17} color={off ? color.faint : palette.fg} strokeWidth={1.9} /> : null}
            <Text style={{ fontFamily: font.semibold, fontSize: size === "sm" ? 13 : 15, color: off ? color.faint : palette.fg }} numberOfLines={1}>
              {title}
            </Text>
          </View>
        );
      }}
    </Pressable>
  );
}

export function IconButton({ icon: Icon, onPress, label, size = 36, tone = "default" }: { icon: LucideIcon; onPress?: () => void; label: string; size?: number; tone?: "default" | "inverse" }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>
      {(state) => {
        const hovered = (state as { hovered?: boolean }).hovered;
        return (
          <View
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: tone === "inverse" ? (hovered || state.pressed ? "#2C2A26" : color.ink) : hovered || state.pressed ? color.sunken : "transparent",
            }}
          >
            <Icon size={18} color={tone === "inverse" ? color.white : color.ink2} strokeWidth={1.9} />
          </View>
        );
      }}
    </Pressable>
  );
}

/** A pressable area with hover/press feedback, for rows and cards. */
export function Touchable({ onPress, children, style, radius: r = radius.md, disabled }: { onPress?: () => void; children: ReactNode; style?: StyleProp<ViewStyle>; radius?: number; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled}>
      {(state) => {
        const hovered = (state as { hovered?: boolean }).hovered;
        return <View style={[{ borderRadius: r, backgroundColor: hovered || state.pressed ? color.sunken : "transparent" }, style]}>{children}</View>;
      }}
    </Pressable>
  );
}

// ── Surfaces ──────────────────────────────────────────────────────────────────

export function Card({ children, style, padded = true, raised }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean; raised?: boolean }) {
  return (
    <View
      style={[
        { backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, overflow: "hidden" },
        raised ? shadow.raised : shadow.card,
        padded && { padding: 18 },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Divider({ style, inset = 0 }: { style?: StyleProp<ViewStyle>; inset?: number }) {
  return <View style={[{ height: 1, backgroundColor: color.line, marginLeft: inset }, style]} />;
}

export function SectionHeader({ title, action, onAction, style }: { title: string; action?: string; onAction?: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }, style]}>
      <T variant="label">{title}</T>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <T variant="smallStrong" style={{ color: color.ink }}>
            {action}
          </T>
        </Pressable>
      ) : null}
    </View>
  );
}

// ── Chips and pills ───────────────────────────────────────────────────────────

export function Chip({ label, selected, onPress, icon: Icon, size = "md" }: { label: string; selected?: boolean; onPress?: () => void; icon?: LucideIcon; size?: "sm" | "md" }) {
  return (
    <Pressable accessibilityRole={onPress ? "button" : undefined} accessibilityState={{ selected }} onPress={onPress} disabled={!onPress}>
      {(state) => {
        const hovered = (state as { hovered?: boolean }).hovered;
        return (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              height: size === "sm" ? 28 : 36,
              paddingHorizontal: size === "sm" ? 10 : 14,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: selected ? color.ink : color.lineStrong,
              backgroundColor: selected ? color.ink : hovered ? color.sunken : color.surface,
            }}
          >
            {selected && !Icon ? <Check size={14} color={color.white} strokeWidth={2.2} /> : null}
            {Icon ? <Icon size={14} color={selected ? color.white : color.ink2} strokeWidth={1.9} /> : null}
            <Text style={{ fontFamily: font.medium, fontSize: size === "sm" ? 12.5 : 14, color: selected ? color.white : color.ink2 }}>{label}</Text>
          </View>
        );
      }}
    </Pressable>
  );
}

type Tone = "neutral" | "accent" | "green" | "amber" | "blue" | "ink";

export function Pill({ label, tone = "neutral", dot, icon: Icon }: { label: string; tone?: Tone; dot?: string | boolean; icon?: LucideIcon }) {
  const p = {
    neutral: [color.sunken, color.ink2],
    accent: [color.accentSoft, color.accentInk],
    green: [color.greenSoft, color.green],
    amber: [color.amberSoft, color.amber],
    blue: [color.blueSoft, color.blue],
    ink: [color.ink, color.white],
  }[tone];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", height: 22, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: p[0] }}>
      {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: typeof dot === "string" ? dot : p[1] }} /> : null}
      {Icon ? <Icon size={12} color={p[1]} strokeWidth={2} /> : null}
      <Text style={{ fontFamily: font.medium, fontSize: 11.5, color: p[1] }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// ── Controls ──────────────────────────────────────────────────────────────────

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label?: string }) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: value ? 1 : 0, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  }, [value, anim]);
  return (
    <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value }} onPress={() => onChange(!value)} hitSlop={6}>
      <Animated.View
        style={{
          width: 40,
          height: 24,
          borderRadius: 12,
          padding: 3,
          backgroundColor: anim.interpolate({ inputRange: [0, 1], outputRange: [color.lineStrong, color.green] }),
        }}
      >
        <Animated.View
          style={{
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: color.white,
            transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 16] }) }],
            boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
          }}
        />
      </Animated.View>
    </Pressable>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={{ flexDirection: "row", backgroundColor: color.sunken, borderRadius: radius.sm, padding: 3, gap: 3 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={{ flex: 1 }} accessibilityRole="button" accessibilityState={{ selected: active }}>
            <View style={[{ height: 34, borderRadius: radius.sm - 3, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 }, active && { backgroundColor: color.surface, ...shadow.card }]}>
              <Text style={{ fontFamily: active ? font.semibold : font.medium, fontSize: 13, color: active ? color.ink : color.muted }} numberOfLines={1}>
                {o.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Stepper({ value, onChange, min, max, step = 1, format = String }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; format?: (v: number) => string }) {
  const btn = (label: string, next: number, disabled: boolean) => (
    <Pressable onPress={() => onChange(next)} disabled={disabled} accessibilityRole="button" accessibilityLabel={label === "−" ? "Decrease" : "Increase"}>
      <View style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: color.lineStrong, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.35 : 1 }}>
        <Text style={{ fontFamily: font.medium, fontSize: 17, color: color.ink, marginTop: -1 }}>{label}</Text>
      </View>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      {btn("−", Math.max(min, value - step), value <= min)}
      <T variant="num" style={{ minWidth: 48, textAlign: "center" }}>
        {format(value)}
      </T>
      {btn("+", Math.min(max, value + step), value >= max)}
    </View>
  );
}

export function Stars({ value, size = 14, onChange }: { value: number; size?: number; onChange?: (v: number) => void }) {
  return (
    <View style={{ flexDirection: "row", gap: onChange ? 8 : 2 }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = i <= Math.round(value);
        const star = <Star size={size} color={filled ? color.ink : color.lineStrong} fill={filled ? color.ink : "transparent"} strokeWidth={1.6} />;
        return onChange ? (
          <Pressable key={i} onPress={() => onChange(i)} hitSlop={4} accessibilityRole="button" accessibilityLabel={`${i} stars`}>
            {star}
          </Pressable>
        ) : (
          <View key={i}>{star}</View>
        );
      })}
    </View>
  );
}

/** Horizontal bar, 0–1. */
export function Bar({ value, tone = color.ink, height = 6, track = color.sunken }: { value: number; tone?: string; height?: number; track?: string }) {
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: "hidden" }}>
      <View style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, height, borderRadius: height / 2, backgroundColor: tone }} />
    </View>
  );
}

/** A small spinning ring for "working" states. */
export function Spinner({ size = 14, tone = color.accent }: { size?: number; tone?: string }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin]);
  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1.8,
        borderColor: tone,
        borderTopColor: "transparent",
        transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }],
      }}
    />
  );
}

/** Fades and lifts its children in once, on mount. */
export function FadeIn({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 260, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v, delay]);
  return <Animated.View style={[{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }, style]}>{children}</Animated.View>;
}

/** Renders **bold** spans inside a sentence. */
export function RichText({ text, variant = "body", style }: { text: string; variant?: Variant; style?: StyleProp<TextStyle> }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <T variant={variant} style={style}>
      {parts.map((p, i) =>
        p.startsWith("**") ? (
          <Text key={i} style={{ fontFamily: font.semibold, color: color.ink }}>
            {p.slice(2, -2)}
          </Text>
        ) : (
          p
        ),
      )}
    </T>
  );
}

export function KeyRow({ label, value, strong, mono }: { label: string; value: string; strong?: boolean; mono?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12, paddingVertical: 4 }}>
      <T variant={strong ? "bodyStrong" : "small"} style={!strong && { color: color.muted }}>
        {label}
      </T>
      <T variant={mono ? "mono" : strong ? "num" : "small"} style={[!mono && { fontVariant: ["tabular-nums"], color: strong ? color.ink : color.ink2 }]} selectable>
        {value}
      </T>
    </View>
  );
}
