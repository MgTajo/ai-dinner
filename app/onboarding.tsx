import { router } from "expo-router";
import { ArrowLeft, ArrowRight, CalendarCheck2, Check, Phone, ShieldCheck, Wallet } from "lucide-react-native";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, TextInput, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Logo, Mark } from "../components/ui/Brand";
import { DishArt } from "../components/ui/DishArt";
import { Bar, Button, Card, Chip, FadeIn, Pill, Segmented, Spinner, Stepper, T, Toggle } from "../components/ui/primitives";
import { color, font, radius, shadow } from "../components/ui/theme";
import { seedHistory } from "../lib/agent/data/history";
import { platforms } from "../lib/agent/data/platforms";
import { allCuisines, cuisineNames, itemById } from "../lib/agent/data/restaurants";
import { allergenNames, money, moneyShort, plural, usdc } from "../lib/agent/format";
import { learnFromHistory } from "../lib/agent/learn";
import { welcome } from "../lib/agent/runner";
import { clockNow } from "../lib/agent/time";
import type { Allergen, Autonomy, Cuisine, DietPattern, PlatformId, Priority, Profile, Weights } from "../lib/agent/types";
import { useStore } from "../lib/store/StoreProvider";
import { DEMO_WALLET, defaultProfile, uid } from "../lib/store/state";

const STEPS = ["Welcome", "About you", "What matters", "Your rules", "Your taste", "Autonomy", "Connect", "Ready"] as const;

interface TradeOff {
  q: string;
  a: { title: string; lines: string[]; favours: Priority };
  b: { title: string; lines: string[]; favours: Priority };
  art?: [string, string];
}

const TRADEOFFS: TradeOff[] = [
  { q: "Same poke bowl from two places. Which do you order?", a: { title: "£11.00", lines: ["Rated 4.2"], favours: "price" }, b: { title: "£15.00", lines: ["Rated 4.8"], favours: "taste" }, art: ["nori-salmon-poke", "nori-salmon-poke"] },
  { q: "It's 19:00 and you're hungry.", a: { title: "Here in 20 min", lines: ["£16 all in"], favours: "speed" }, b: { title: "Here in 45 min", lines: ["£11 all in"], favours: "price" } },
  { q: "A weeknight dinner.", a: { title: "Grilled chicken bowl", lines: ["620 kcal · 42 g protein", "Rated 4.3"], favours: "health" }, b: { title: "Double smash burger", lines: ["1,180 kcal", "Rated 4.8"], favours: "taste" }, art: ["ke-power", "mw-smash"] },
  { q: "Squeezed between two meetings.", a: { title: "Rated 4.3", lines: ["Arrives in 25 min"], favours: "speed" }, b: { title: "Rated 4.8", lines: ["Arrives in 45 min"], favours: "taste" } },
  { q: "Lunch at your desk.", a: { title: "Seared salmon salad", lines: ["£13 · 35 g protein"], favours: "health" }, b: { title: "Halloumi wrap", lines: ["£8.50 · 650 kcal"], favours: "price" }, art: ["gf-salmon-salad", "ml-halloumi-wrap"] },
];

const PRIORITY_LABEL: Record<Priority, string> = { taste: "Taste & quality", health: "Health", price: "Price", speed: "Speed & timing" };

function weightsFrom(answers: (Priority | "none" | undefined)[]): Weights {
  const wins: Record<Priority, number> = { taste: 0, health: 0, price: 0, speed: 0 };
  const seen: Record<Priority, number> = { taste: 0, health: 0, price: 0, speed: 0 };
  TRADEOFFS.forEach((t, i) => {
    seen[t.a.favours] += 1;
    seen[t.b.favours] += 1;
    const a = answers[i];
    if (a === "none") {
      wins[t.a.favours] += 0.5;
      wins[t.b.favours] += 0.5;
    } else if (a) wins[a] += 1;
  });
  const raw = (Object.keys(wins) as Priority[]).map((k) => [k, Math.max(0.08, (wins[k] + 0.5) / (seen[k] + 1))] as const);
  const sum = raw.reduce((n, [, v]) => n + v, 0);
  return Object.fromEntries(raw.map(([k, v]) => [k, Math.round((v / sum) * 100) / 100])) as Weights;
}

const DISLIKES = ["coriander", "mushroom", "olives", "onion", "tomato", "aubergine", "beetroot", "anchovy"];

export default function Onboarding() {
  const store = useStore();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= 980;
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [answers, setAnswers] = useState<(Priority | "none" | undefined)[]>([]);
  const [q, setQ] = useState(0);
  const [weights, setWeights] = useState<Weights | null>(null);
  const [imported, setImported] = useState(true);
  const [funded, setFunded] = useState(true);
  const patch = (p: Partial<Profile>) => setProfile((x) => ({ ...x, ...p }));

  const history = useMemo(() => seedHistory(clockNow(store.state.clock)), [store.state.clock]);

  const finish = () => {
    const now = clockNow(store.get().clock);
    const learned = imported ? learnFromHistory(history, now) : store.get().learned;
    const finalProfile: Profile = { ...profile, weights: weights ?? profile.weights };
    store.update((s) => ({
      ...s,
      onboarded: true,
      profile: finalProfile,
      learned,
      orders: imported ? history : [],
      messages: [],
      wallet: funded
        ? { address: DEMO_WALLET, balanceUsdc: 150, txs: [{ id: uid("tx"), at: now, kind: "deposit", amountUsdc: 150, label: "Added from Phantom", simulated: true }] }
        : { address: DEMO_WALLET, balanceUsdc: 0, txs: [] },
    }));
    welcome(store);
    router.replace("/agent");
  };

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  if (step === 0) return <Welcome onStart={next} wide={wide} />;

  const canContinue = step !== 2 || weights !== null;
  const body = (() => {
    switch (step) {
      case 1:
        return <AboutYou profile={profile} patch={patch} />;
      case 2:
        return (
          <WhatMatters
            q={q}
            answers={answers}
            weights={weights}
            onAnswer={(a) => {
              const nextAnswers = [...answers];
              nextAnswers[q] = a;
              setAnswers(nextAnswers);
              if (q < TRADEOFFS.length - 1) setQ(q + 1);
              else setWeights(weightsFrom(nextAnswers));
            }}
            onBack={() => setQ(Math.max(0, q - 1))}
            onRedo={() => {
              setWeights(null);
              setAnswers([]);
              setQ(0);
            }}
            setWeights={setWeights}
          />
        );
      case 3:
        return <Rules profile={profile} patch={patch} />;
      case 4:
        return <Taste profile={profile} patch={patch} />;
      case 5:
        return <AutonomyStep profile={profile} patch={patch} />;
      case 6:
        return <Connect profile={profile} patch={patch} imported={imported} setImported={setImported} funded={funded} setFunded={setFunded} historyCount={history.length} live={store.state.runtime.payments === "live"} />;
      default:
        return <Building imported={imported} historyCount={history.length} onDone={finish} />;
    }
  })();

  const content = (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: wide ? 56 : 20, paddingTop: wide ? 56 : insets.top + 18, paddingBottom: 40, maxWidth: 720, width: "100%", alignSelf: wide ? "flex-start" : "center", flexGrow: 1 }}>
        {!wide ? (
          <View style={{ gap: 14, marginBottom: 26 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Logo size={20} />
              <T variant="caption">
                {Math.min(step, STEPS.length - 2)} of {STEPS.length - 2}
              </T>
            </View>
            <Bar value={Math.min(step, STEPS.length - 2) / (STEPS.length - 2)} height={3} />
          </View>
        ) : null}
        <FadeIn key={step}>{body}</FadeIn>
      </ScrollView>
      {step < STEPS.length - 1 ? (
        <View style={{ borderTopWidth: 1, borderTopColor: color.line, paddingHorizontal: wide ? 56 : 20, paddingTop: 14, paddingBottom: Math.max(insets.bottom, 14), flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: color.bg }}>
          <Button title="Back" kind="ghost" icon={ArrowLeft} onPress={back} />
          <Button title={step === STEPS.length - 2 ? "Create my agent" : "Continue"} icon={step === STEPS.length - 2 ? Check : ArrowRight} onPress={next} disabled={!canContinue} />
        </View>
      ) : null}
    </View>
  );

  if (!wide) return content;
  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: color.bg }}>
      <View style={{ width: 340, backgroundColor: color.ink, paddingHorizontal: 32, paddingVertical: 36, justifyContent: "space-between" }}>
        <Logo size={24} inverse />
        <View style={{ gap: 4 }}>
          {STEPS.slice(1, -1).map((label, i) => {
            const n = i + 1;
            const state = n < step ? "done" : n === step ? "now" : "next";
            return (
              <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9 }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: state === "next" ? "#4A4741" : "#FFFFFF", backgroundColor: state === "done" ? "#FFFFFF" : "transparent", alignItems: "center", justifyContent: "center" }}>
                  {state === "done" ? <Check size={12} color={color.ink} strokeWidth={2.6} /> : <T style={{ fontFamily: font.medium, fontSize: 11, color: state === "now" ? "#FFFFFF" : "#77736B" }}>{n}</T>}
                </View>
                <T style={{ fontFamily: state === "now" ? font.semibold : font.medium, fontSize: 14, color: state === "next" ? "#8A867E" : "#FFFFFF" }}>{label}</T>
              </View>
            );
          })}
        </View>
        <T style={{ fontFamily: font.regular, fontSize: 13, lineHeight: 19, color: "#A29D95" }}>
          Your rules are never traded off. Everything else, Sous keeps learning from what you order and how you rate it.
        </T>
      </View>
      {content}
    </View>
  );
}

// ── Steps ─────────────────────────────────────────────────────────────────────

function Heading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <View style={{ gap: 10, marginBottom: 28 }}>
      <T variant="label">{eyebrow}</T>
      <T variant="display" style={{ fontSize: 36, lineHeight: 40 }}>
        {title}
      </T>
      {children ? <T variant="body" style={{ maxWidth: 560 }}>{children}</T> : null}
    </View>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 7 }}>
      <T variant="smallStrong">{label}</T>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={color.faint}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{ height: 48, borderRadius: radius.sm, borderWidth: 1, borderColor: focus ? color.ink : color.lineStrong, backgroundColor: color.surface, paddingHorizontal: 14, fontFamily: font.regular, fontSize: 15, color: color.ink, outlineStyle: "none" } as never}
      />
    </View>
  );
}

function Welcome({ onStart, wide }: { onStart: () => void; wide: boolean }) {
  const insets = useSafeAreaInsets();
  const pillars = [
    { title: "Understands", text: "Your taste, your rules and your calendar." },
    { title: "Decides", text: "Compares every platform and explains its pick." },
    { title: "Acts", text: "Orders, calls if it has to, and pays in USDC." },
  ];
  const dishes = ["nori-salmon-poke", "gf-harvest", "f22-margherita", "pm-beef-pho", "sk-bibimbap", "ep-carnitas"];
  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bg }} contentContainerStyle={{ flexGrow: 1, paddingHorizontal: wide ? 72 : 22, paddingTop: wide ? 40 : insets.top + 20, paddingBottom: 40 }}>
      <Logo size={wide ? 26 : 22} />
      <View style={{ flex: 1, flexDirection: wide ? "row" : "column", alignItems: wide ? "center" : "stretch", gap: wide ? 64 : 36, marginTop: wide ? 0 : 40 }}>
        <View style={{ flex: wide ? 1.1 : undefined, gap: 22, maxWidth: 600 }}>
          <FadeIn>
            <T variant="display" style={{ fontSize: wide ? 72 : 48, lineHeight: wide ? 72 : 50, letterSpacing: -1.6 }}>
              Dinner,{"\n"}
              <T variant="display" style={{ fontFamily: font.displayItalic, fontSize: wide ? 72 : 48, lineHeight: wide ? 72 : 50, letterSpacing: -1.6 }}>
                handled.
              </T>
            </T>
          </FadeIn>
          <FadeIn delay={80}>
            <T variant="body" style={{ fontSize: 17, lineHeight: 26, maxWidth: 480 }}>
              Sous is a food agent. Tell it what you feel like, or nothing at all, and it finds, orders and pays for a meal that fits your day.
            </T>
          </FadeIn>
          <FadeIn delay={140} style={{ flexDirection: "row", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <Button title="Set up your agent" icon={ArrowRight} size="lg" onPress={onStart} />
            <T variant="small">Takes about a minute</T>
          </FadeIn>
          <FadeIn delay={200} style={{ flexDirection: wide ? "row" : "column", gap: wide ? 28 : 14, marginTop: 18 }}>
            {pillars.map((p, i) => (
              <View key={p.title} style={{ flex: wide ? 1 : undefined, gap: 4, borderTopWidth: 1, borderTopColor: color.lineStrong, paddingTop: 12 }}>
                <T variant="caption" style={{ fontFamily: font.mono }}>
                  0{i + 1}
                </T>
                <T variant="subheading">{p.title}</T>
                <T variant="small">{p.text}</T>
              </View>
            ))}
          </FadeIn>
        </View>
        <FadeIn delay={120} style={{ flex: wide ? 1 : undefined, alignItems: "center" }}>
          <PreviewCard dishes={dishes} />
        </FadeIn>
      </View>
    </ScrollView>
  );
}

function PreviewCard({ dishes }: { dishes: string[] }) {
  const pick = itemById("gf-chicken-greens");
  return (
    <View style={{ width: "100%", maxWidth: 420, gap: 12 }}>
      <View style={{ alignSelf: "flex-end", maxWidth: "80%", backgroundColor: color.ink, borderRadius: 18, borderBottomRightRadius: 6, paddingHorizontal: 14, paddingVertical: 10 }}>
        <T style={{ fontFamily: font.regular, fontSize: 14.5, color: "#FFFFFF" }}>A healthy bowl, right after my last meeting</T>
      </View>
      <Card raised style={{ gap: 14 }}>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <Mark size={20} />
          <T variant="caption">Checked 5 channels · 47 dishes · kept 11</T>
        </View>
        <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
          <DishArt item={pick.item} size={72} />
          <View style={{ flex: 1, gap: 3 }}>
            <T variant="subheading">{pick.item.name}</T>
            <T variant="small">{pick.restaurant.name} · arrives 18:10</T>
            <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
              <Pill label="44 g protein" tone="green" />
              <Pill label="£1.91 less than Just Eat" />
            </View>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {dishes.map((id) => (
            <DishArt key={id} item={itemById(id).item} size={44} rounded={10} />
          ))}
        </View>
      </Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", backgroundColor: color.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: color.line, paddingHorizontal: 12, height: 32, ...shadow.card }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.green }} />
        <T variant="caption" style={{ color: color.ink2 }}>
          Paid 17.78 USDC on Solana · memo sous:SO-4821
        </T>
      </View>
    </View>
  );
}

function AboutYou({ profile, patch }: { profile: Profile; patch: (p: Partial<Profile>) => void }) {
  return (
    <View>
      <Heading eyebrow="Step 1 · About you" title="Who's eating?">
        Sous orders on your behalf, so restaurants and couriers need a name and an address.
      </Heading>
      <View style={{ gap: 18 }}>
        <Field label="First name" value={profile.name} onChange={(name) => patch({ name })} placeholder="Your name" />
        <Field label="Deliver to" value={profile.address.line} onChange={(line) => patch({ address: { ...profile.address, line } })} placeholder="Street and postcode" />
        <View style={{ gap: 7 }}>
          <T variant="smallStrong">Label</T>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {["Home", "Office"].map((l) => (
              <Chip key={l} label={l} selected={profile.address.label === l} onPress={() => patch({ address: { ...profile.address, label: l } })} />
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

function WhatMatters({
  q,
  answers,
  weights,
  onAnswer,
  onBack,
  onRedo,
  setWeights,
}: {
  q: number;
  answers: (Priority | "none" | undefined)[];
  weights: Weights | null;
  onAnswer: (a: Priority | "none") => void;
  onBack: () => void;
  onRedo: () => void;
  setWeights: (w: Weights) => void;
}) {
  if (weights) {
    const keys = (Object.keys(weights) as Priority[]).sort((a, b) => weights[b] - weights[a]);
    const adjust = (k: Priority, pct: number) => {
      const others = keys.filter((x) => x !== k);
      const delta = pct / 100 - weights[k];
      const otherSum = others.reduce((n, x) => n + weights[x], 0) || 1;
      const next = { ...weights, [k]: pct / 100 };
      for (const o of others) next[o] = Math.max(0.05, weights[o] - (delta * weights[o]) / otherSum);
      const sum = Object.values(next).reduce((a, b) => a + b, 0);
      setWeights(Object.fromEntries(Object.entries(next).map(([x, v]) => [x, Math.round((v / sum) * 100) / 100])) as Weights);
    };
    return (
      <View>
        <Heading eyebrow="Step 2 · What matters" title="Here's how you trade off.">
          Worked out from your five answers. Sous ranks every option with these weights, and nudges them when your choices say otherwise. Adjust if it doesn't feel right.
        </Heading>
        <Card style={{ gap: 18 }}>
          {keys.map((k) => (
            <View key={k} style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <T variant="bodyStrong">{PRIORITY_LABEL[k]}</T>
                <Stepper value={Math.round(weights[k] * 100)} min={5} max={70} step={5} format={(v) => `${v}%`} onChange={(v) => adjust(k, v)} />
              </View>
              <Bar value={weights[k] / Math.max(...Object.values(weights))} tone={k === keys[0] ? color.ink : "#6E6A63"} />
            </View>
          ))}
        </Card>
        <Pressable onPress={onRedo} style={{ marginTop: 16, alignSelf: "flex-start" }}>
          <T variant="smallStrong" style={{ textDecorationLine: "underline" }}>
            Answer the questions again
          </T>
        </Pressable>
      </View>
    );
  }
  const t = TRADEOFFS[q];
  const option = (side: "a" | "b") => {
    const o = t[side];
    const art = t.art?.[side === "a" ? 0 : 1];
    const chosen = answers[q] === o.favours;
    return (
      <Pressable key={side} style={{ flex: 1 }} onPress={() => onAnswer(o.favours)}>
        {(s) => (
          <View
            style={[
              { flex: 1, minHeight: 150, borderRadius: radius.lg, borderWidth: 1.5, borderColor: chosen ? color.ink : (s as { hovered?: boolean }).hovered ? color.lineStrong : color.line, backgroundColor: color.surface, padding: 18, gap: 10, justifyContent: "space-between" },
              shadow.card,
              { transform: [{ scale: s.pressed ? 0.985 : 1 }] },
            ]}
          >
            <T variant="caption" style={{ fontFamily: font.mono }}>
              {side.toUpperCase()}
            </T>
            {art ? <DishArt item={itemById(art).item} size={56} /> : null}
            <View style={{ gap: 3 }}>
              <T variant="heading">{o.title}</T>
              {o.lines.map((l) => (
                <T key={l} variant="small">
                  {l}
                </T>
              ))}
            </View>
          </View>
        )}
      </Pressable>
    );
  };
  return (
    <View>
      <Heading eyebrow={`Step 2 · What matters · ${q + 1} of ${TRADEOFFS.length}`} title={t.q}>
        No right answers. Five quick choices tell Sous more than a settings page would.
      </Heading>
      <View style={{ flexDirection: "row", gap: 12 }}>
        {option("a")}
        {option("b")}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 16 }}>
        {q > 0 ? (
          <Pressable onPress={onBack}>
            <T variant="smallStrong">Previous question</T>
          </Pressable>
        ) : (
          <View />
        )}
        <Pressable onPress={() => onAnswer("none")}>
          <T variant="smallStrong" style={{ color: color.muted }}>
            No preference
          </T>
        </Pressable>
      </View>
      <View style={{ flexDirection: "row", gap: 6, marginTop: 24 }}>
        {TRADEOFFS.map((_, i) => (
          <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i < q || answers[i] ? color.ink : color.lineStrong }} />
        ))}
      </View>
    </View>
  );
}

function Rules({ profile, patch }: { profile: Profile; patch: (p: Partial<Profile>) => void }) {
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <View>
      <Heading eyebrow="Step 3 · Your rules" title="What's off the table?">
        These are hard rules: Sous removes anything that breaks them before it starts ranking. Allergen information is confirmed with the restaurant on every order.
      </Heading>
      <View style={{ gap: 26 }}>
        <View style={{ gap: 10 }}>
          <T variant="subheading">Diet</T>
          <Segmented<DietPattern>
            value={profile.diet}
            onChange={(diet) => patch({ diet })}
            options={[
              { value: "omnivore", label: "Everything" },
              { value: "pescatarian", label: "Pescatarian" },
              { value: "vegetarian", label: "Vegetarian" },
              { value: "vegan", label: "Vegan" },
            ]}
          />
        </View>
        <View style={{ gap: 10 }}>
          <T variant="subheading">Allergies</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(Object.keys(allergenNames) as Allergen[]).map((a) => (
              <Chip key={a} label={allergenNames[a]} selected={profile.allergies.includes(a)} onPress={() => patch({ allergies: toggle(profile.allergies, a) })} />
            ))}
          </View>
        </View>
        <View style={{ gap: 10 }}>
          <T variant="subheading">Never send me</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {DISLIKES.map((d) => (
              <Chip key={d} label={d[0].toUpperCase() + d.slice(1)} selected={profile.dislikes.includes(d)} onPress={() => patch({ dislikes: toggle(profile.dislikes, d) })} />
            ))}
          </View>
        </View>
        <View style={{ gap: 10 }}>
          <T variant="subheading">Goal</T>
          <Segmented<Profile["goal"]>
            value={profile.goal}
            onChange={(goal) => patch({ goal })}
            options={[
              { value: "balanced", label: "Balanced" },
              { value: "high-protein", label: "High protein" },
              { value: "low-carb", label: "Low carb" },
              { value: "light", label: "Lighter" },
            ]}
          />
          <T variant="caption">Used to rank options, never as medical advice.</T>
        </View>
      </View>
    </View>
  );
}

function Taste({ profile, patch }: { profile: Profile; patch: (p: Partial<Profile>) => void }) {
  return (
    <View>
      <Heading eyebrow="Step 4 · Your taste" title="What do you love?">
        A starting point. Sous learns the rest from what you order and how you rate it.
      </Heading>
      <View style={{ gap: 26 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {allCuisines.map((c: Cuisine) => (
            <Chip key={c} label={cuisineNames[c]} selected={profile.cuisines.includes(c)} onPress={() => patch({ cuisines: profile.cuisines.includes(c) ? profile.cuisines.filter((x) => x !== c) : [...profile.cuisines, c] })} />
          ))}
        </View>
        <Card style={{ gap: 4 }}>
          <T variant="subheading" style={{ marginBottom: 8 }}>
            Usual budget per person
          </T>
          {(["lunch", "dinner"] as const).map((m) => (
            <View key={m} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 }}>
              <View>
                <T variant="bodyStrong">{m === "lunch" ? "Lunch" : "Dinner"}</T>
                <T variant="caption">Including delivery and fees</T>
              </View>
              <Stepper value={profile.budget[m]} min={8} max={40} onChange={(v) => patch({ budget: { ...profile.budget, [m]: v } })} format={(v) => moneyShort(v)} />
            </View>
          ))}
        </Card>
      </View>
    </View>
  );
}

function AutonomyStep({ profile, patch }: { profile: Profile; patch: (p: Partial<Profile>) => void }) {
  const modes: { value: Autonomy; title: string; text: string }[] = [
    { value: "suggest", title: "Recommend only", text: "Sous shortlists and explains. You place every order." },
    { value: "confirm", title: "Ask before ordering", text: "Sous lines up the order and waits for your yes." },
    { value: "auto", title: "Order within my rules", text: "Sous orders on its own while it stays inside your limits, and tells you after." },
  ];
  return (
    <View>
      <Heading eyebrow="Step 5 · Autonomy" title="How much should Sous do on its own?">
        You can change this any time. Every payment is checked against your limits first, whatever you pick.
      </Heading>
      <View style={{ gap: 10 }}>
        {modes.map((m) => {
          const on = profile.autonomy === m.value;
          return (
            <Pressable key={m.value} onPress={() => patch({ autonomy: m.value })}>
              <View style={[{ flexDirection: "row", gap: 14, alignItems: "center", padding: 16, borderRadius: radius.lg, borderWidth: 1.5, borderColor: on ? color.ink : color.line, backgroundColor: color.surface }, shadow.card]}>
                <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: on ? color.ink : color.lineStrong, alignItems: "center", justifyContent: "center" }}>
                  {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color.ink }} /> : null}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <T variant="bodyStrong">{m.title}</T>
                  <T variant="small">{m.text}</T>
                </View>
                {m.value === "confirm" ? <Pill label="Recommended" /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      <Card style={{ gap: 4, marginTop: 18 }}>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <ShieldCheck size={17} color={color.green} />
          <T variant="subheading">Spending limits</T>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 }}>
          <T variant="bodyStrong">Per order</T>
          <Stepper value={profile.limits.perOrder} min={10} max={60} step={5} onChange={(v) => patch({ limits: { ...profile.limits, perOrder: v } })} format={(v) => moneyShort(v)} />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 }}>
          <T variant="bodyStrong">Per week</T>
          <Stepper value={profile.limits.weekly} min={40} max={300} step={10} onChange={(v) => patch({ limits: { ...profile.limits, weekly: v } })} format={(v) => moneyShort(v)} />
        </View>
      </Card>
    </View>
  );
}

function ConnectRow({ icon, title, text, right }: { icon: ReactNode; title: string; text: string; right: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 }}>
      <View style={{ width: 40, height: 40, borderRadius: radius.sm, backgroundColor: color.sunken, alignItems: "center", justifyContent: "center" }}>{icon}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="bodyStrong">{title}</T>
        <T variant="small">{text}</T>
      </View>
      {right}
    </View>
  );
}

function Connect({
  profile,
  patch,
  imported,
  setImported,
  funded,
  setFunded,
  historyCount,
  live,
}: {
  profile: Profile;
  patch: (p: Partial<Profile>) => void;
  imported: boolean;
  setImported: (v: boolean) => void;
  funded: boolean;
  setFunded: (v: boolean) => void;
  historyCount: number;
  live: boolean;
}) {
  const togglePlatform = (id: PlatformId) => patch({ platformsConnected: profile.platformsConnected.includes(id) ? profile.platformsConnected.filter((p) => p !== id) : [...profile.platformsConnected, id] });
  return (
    <View>
      <Heading eyebrow="Step 6 · Connect" title="Give Sous what it needs to act.">
        Read-only calendar access, your delivery accounts and a wallet with a budget. You can disconnect any of them later.
      </Heading>
      <Card padded={false} style={{ paddingHorizontal: 18 }}>
        <ConnectRow
          icon={<CalendarCheck2 size={19} color={color.blue} />}
          title="Work calendar"
          text={profile.calendarConnected ? "Connected · free/busy and locations only" : "Lets Sous time meals around meetings"}
          right={<Toggle value={profile.calendarConnected} onChange={(v) => patch({ calendarConnected: v })} label="Calendar" />}
        />
      </Card>
      <T variant="label" style={{ marginTop: 22, marginBottom: 10 }}>
        Delivery accounts
      </T>
      <Card padded={false} style={{ paddingHorizontal: 18 }}>
        {(["deliveroo", "ubereats", "justeat"] as PlatformId[]).map((id, i) => (
          <View key={id} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: color.line }}>
            <ConnectRow
              icon={<View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: platforms[id].dot }} />}
              title={platforms[id].name}
              text={profile.platformsConnected.includes(id) ? "Connected" : "Not connected"}
              right={<Toggle value={profile.platformsConnected.includes(id)} onChange={() => togglePlatform(id)} label={platforms[id].name} />}
            />
          </View>
        ))}
        <View style={{ borderTopWidth: 1, borderTopColor: color.line, paddingVertical: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <T variant="bodyStrong">Import order history</T>
            <T variant="small">Found {plural(historyCount, "order")} from the last three weeks. Sous learns from them on day one.</T>
          </View>
          <Toggle value={imported} onChange={setImported} label="Import order history" />
        </View>
      </Card>
      <Card padded={false} style={{ paddingHorizontal: 18, marginTop: 14 }}>
        <ConnectRow
          icon={<Phone size={18} color={color.ink2} />}
          title="Phone ordering"
          text="For places with no app. Sous always says it's an AI and confirms the order out loud."
          right={<Toggle value={profile.phoneOrdering} onChange={(v) => patch({ phoneOrdering: v })} label="Phone ordering" />}
        />
      </Card>
      <T variant="label" style={{ marginTop: 22, marginBottom: 10 }}>
        Agent wallet
      </T>
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
          <View style={{ width: 40, height: 40, borderRadius: radius.sm, backgroundColor: color.ink, alignItems: "center", justifyContent: "center" }}>
            <Wallet size={18} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T variant="bodyStrong">Solana · USDC</T>
            <T variant="small">{live ? "Live on devnet: the companion server's agent wallet pays restaurants directly." : "Sous pays restaurants from this wallet, never more than your limits allow."}</T>
          </View>
        </View>
        {live ? (
          <Pill label="Devnet wallet connected" tone="green" dot />
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: color.sunken, borderRadius: radius.sm, padding: 12 }}>
            <View>
              <T variant="smallStrong">Add {usdc(150)} from Phantom</T>
              <T variant="caption">About {money(150 / 1.27)} of meals</T>
            </View>
            <Toggle value={funded} onChange={setFunded} label="Fund wallet" />
          </View>
        )}
      </Card>
    </View>
  );
}

function Building({ imported, historyCount, onDone }: { imported: boolean; historyCount: number; onDone: () => void }) {
  const steps = [
    imported ? `Reading ${historyCount} past orders` : "Setting up your profile",
    "Learning what you like",
    "Checking today's calendar",
    "Planning dinner around it",
  ];
  const [done, setDone] = useState(0);
  useEffect(() => {
    if (done >= steps.length) {
      const t = setTimeout(onDone, 500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setDone((d) => d + 1), 750);
    return () => clearTimeout(t);
  }, [done, steps.length, onDone]);
  return (
    <View style={{ paddingTop: 40, gap: 28 }}>
      <Mark size={44} />
      <T variant="display" style={{ fontSize: 36, lineHeight: 40 }}>
        Getting to know you.
      </T>
      <View style={{ gap: 14 }}>
        {steps.map((label, i) => (
          <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 12, opacity: i <= done ? 1 : 0.35 }}>
            <View style={{ width: 18, alignItems: "center" }}>{i < done ? <Check size={16} color={color.green} strokeWidth={2.4} /> : i === done ? <Spinner /> : <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.lineStrong }} />}</View>
            <T variant="body" style={{ color: i <= done ? color.ink : color.muted }}>
              {label}
            </T>
          </View>
        ))}
      </View>
    </View>
  );
}
