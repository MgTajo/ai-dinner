import { router } from "expo-router";
import { ChevronRight, Code2, RotateCcw } from "lucide-react-native";
import type { ReactNode } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { PageHeader, useWide } from "../../components/shell/AppShell";
import { Button, Card, Chip, Divider, Pill, Segmented, SectionHeader, Stepper, T, Toggle, Touchable } from "../../components/ui/primitives";
import { color, font, radius } from "../../components/ui/theme";
import { companionUrl } from "../../lib/companion";
import { platforms } from "../../lib/agent/data/platforms";
import { allergenNames, moneyShort } from "../../lib/agent/format";
import type { Allergen, Autonomy, PlatformId, Profile } from "../../lib/agent/types";
import { useStore } from "../../lib/store/StoreProvider";

export default function Settings() {
  const store = useStore();
  const { state, update } = store;
  const wide = useWide();
  const p = state.profile;
  const patch = (x: Partial<Profile>) => update((s) => ({ ...s, profile: { ...s.profile, ...x } }));
  const rt = state.runtime;

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: wide ? 40 : 16, paddingBottom: 60 }}>
      <View style={{ width: "100%", maxWidth: 760, alignSelf: "center", gap: 22 }}>
        <PageHeader title="Settings" />

        <Section title="Agent">
          <Row title="Autonomy" text="How much Sous does without asking">
            <View style={{ width: wide ? 360 : "100%" }}>
              <Segmented<Autonomy>
                value={p.autonomy}
                onChange={(autonomy) => patch({ autonomy })}
                options={[
                  { value: "suggest", label: "Recommend" },
                  { value: "confirm", label: "Ask first" },
                  { value: "auto", label: "Within rules" },
                ]}
              />
            </View>
          </Row>
          <Divider />
          <Row title="Per-order limit" text="Never spends more on one order">
            <Stepper value={p.limits.perOrder} min={10} max={60} step={5} format={(v) => moneyShort(v)} onChange={(v) => patch({ limits: { ...p.limits, perOrder: v } })} />
          </Row>
          <Divider />
          <Row title="Weekly budget" text="Across all orders Sous places">
            <Stepper value={p.limits.weekly} min={40} max={300} step={10} format={(v) => moneyShort(v)} onChange={(v) => patch({ limits: { ...p.limits, weekly: v } })} />
          </Row>
          <Divider />
          <Row title="Dinner budget" text="Per person, all in">
            <Stepper value={p.budget.dinner} min={8} max={40} format={(v) => moneyShort(v)} onChange={(v) => patch({ budget: { ...p.budget, dinner: v } })} />
          </Row>
        </Section>

        <Section title="Rules">
          <View style={{ padding: 16, gap: 10 }}>
            <T variant="bodyStrong">Allergies</T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {(Object.keys(allergenNames) as Allergen[]).map((a) => (
                <Chip key={a} size="sm" label={allergenNames[a]} selected={p.allergies.includes(a)} onPress={() => patch({ allergies: p.allergies.includes(a) ? p.allergies.filter((x) => x !== a) : [...p.allergies, a] })} />
              ))}
            </View>
          </View>
          <Divider />
          <View style={{ padding: 16, gap: 10 }}>
            <T variant="bodyStrong">Diet</T>
            <Segmented
              value={p.diet}
              onChange={(diet) => patch({ diet })}
              options={[
                { value: "omnivore", label: "Everything" },
                { value: "pescatarian", label: "Pescatarian" },
                { value: "vegetarian", label: "Vegetarian" },
                { value: "vegan", label: "Vegan" },
              ]}
            />
          </View>
        </Section>

        <Section title="You">
          <Row title="Name">
            <Input value={p.name} onChange={(name) => patch({ name })} />
          </Row>
          <Divider />
          <Row title="Delivery address">
            <Input value={p.address.line} onChange={(line) => patch({ address: { ...p.address, line } })} wide />
          </Row>
        </Section>

        <Section title="Connections">
          <Row title="Work calendar" text="Free/busy and locations">
            <Toggle value={p.calendarConnected} onChange={(v) => patch({ calendarConnected: v })} label="Work calendar" />
          </Row>
          {(["deliveroo", "ubereats", "justeat"] as PlatformId[]).map((id) => (
            <View key={id}>
              <Divider />
              <Row title={platforms[id].name} text={p.platformsConnected.includes(id) ? "Connected" : "Not connected"}>
                <Toggle value={p.platformsConnected.includes(id)} onChange={() => patch({ platformsConnected: p.platformsConnected.includes(id) ? p.platformsConnected.filter((x) => x !== id) : [...p.platformsConnected, id] })} label={platforms[id].name} />
              </Row>
            </View>
          ))}
          <Divider />
          <Row title="Phone ordering" text="Sous calls places without an app, and always says it's an AI">
            <Toggle value={p.phoneOrdering} onChange={(v) => patch({ phoneOrdering: v })} label="Phone ordering" />
          </Row>
        </Section>

        <Section title="System">
          <Row title="Companion server" text={companionUrl()}>
            <Pill label={rt.companion === "online" ? "Online" : rt.companion === "checking" ? "Checking" : "Offline"} tone={rt.companion === "online" ? "green" : "neutral"} dot />
          </Row>
          <Divider />
          <Row title="Language understanding" text={rt.ai === "model" ? `${rt.aiLabel ?? "A model"}, through the companion server` : "On-device parser (run the companion server with Ollama or a Gemini key for a full model)"}>
            <Pill label={rt.ai === "model" ? rt.aiLabel ?? "Model" : "On-device"} tone={rt.ai === "model" ? "green" : "neutral"} />
          </Row>
          <Divider />
          <Row title="Payments" text={rt.payments === "live" ? "Real devnet USDC transfers from the agent wallet" : rt.paymentsReason ?? "Simulated settlement"}>
            <Pill label={rt.payments === "live" ? "Devnet live" : "Simulated"} tone={rt.payments === "live" ? "green" : "amber"} />
          </Row>
          <Divider />
          <Row title="Presenter controls" text="Scenario clock, fast-forward and calendar events">
            <Toggle value={state.presenter} onChange={(v) => update((s) => ({ ...s, presenter: v }))} label="Presenter controls" />
          </Row>
          <Divider />
          <Touchable radius={0} onPress={() => router.push("/dev")}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16 }}>
              <Code2 size={17} color={color.ink2} />
              <View style={{ flex: 1 }}>
                <T variant="bodyStrong">Developer tools</T>
                <T variant="small">Agent Studio modules, race readiness, x402 payments</T>
              </View>
              <ChevronRight size={16} color={color.faint} />
            </View>
          </Touchable>
        </Section>

        <Button
          title="Reset demo and start onboarding again"
          kind="secondary"
          icon={RotateCcw}
          onPress={() => {
            store.reset();
            router.replace("/onboarding");
          }}
          style={{ alignSelf: "flex-start" }}
        />
      </View>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View>
      <SectionHeader title={title} />
      <Card padded={false}>{children}</Card>
    </View>
  );
}

function Row({ title, text, children }: { title: string; text?: string; children?: ReactNode }) {
  const wide = useWide();
  return (
    <View style={{ flexDirection: wide ? "row" : "column", alignItems: wide ? "center" : "stretch", gap: 12, padding: 16 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="bodyStrong">{title}</T>
        {text ? (
          <T variant="small" numberOfLines={2}>
            {text}
          </T>
        ) : null}
      </View>
      {children ? <View style={{ alignItems: wide ? "flex-end" : "flex-start" }}>{children}</View> : null}
    </View>
  );
}

function Input({ value, onChange, wide }: { value: string; onChange: (v: string) => void; wide?: boolean }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      style={{ height: 40, width: wide ? 300 : 200, borderRadius: radius.sm, borderWidth: 1, borderColor: color.lineStrong, paddingHorizontal: 12, fontFamily: font.regular, fontSize: 14.5, color: color.ink, backgroundColor: color.surface } as never}
    />
  );
}
