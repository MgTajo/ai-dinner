import { ArrowUp } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CallBlock, FeedbackBlock, NoteBlock, OptionsBlock, OrderBlock, ProfileBlock, ProposalBlock, SuggestionsBlock, TextBlock, TraceBlock } from "../../components/agent/Blocks";
import { ContextPanel } from "../../components/agent/ContextPanel";
import { useWide } from "../../components/shell/AppShell";
import { Avatar, Mark } from "../../components/ui/Brand";
import { Chip, FadeIn, Pill, Spinner, T } from "../../components/ui/primitives";
import { color, font, layout, radius, shadow } from "../../components/ui/theme";
import { send } from "../../lib/agent/runner";
import { fmtTime, greeting } from "../../lib/agent/time";
import type { Block, Message } from "../../lib/store/state";
import { useNow, useStore } from "../../lib/store/StoreProvider";

const STARTERS = ["A healthy bowl at 18:30", "Dinner right after my last meeting", "Indian tonight, not too spicy", "Surprise me under £15"];

export default function AgentScreen() {
  const store = useStore();
  const { state } = store;
  const wide = useWide();
  const { width } = useWindowDimensions();
  const showPanel = width >= layout.xwide;
  const scroll = useRef<ScrollView>(null);
  const messages = state.messages;
  const lastAgentId = [...messages].reverse().find((m) => m.role === "agent")?.id;

  return (
    <View style={{ flex: 1, flexDirection: "row" }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Header />
        <ScrollView
          ref={scroll}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: wide ? 32 : 16, paddingTop: 8, paddingBottom: 28 }}
          onContentSizeChange={() => {
            scroll.current?.scrollToEnd({ animated: true });
            setTimeout(() => scroll.current?.scrollToEnd({ animated: false }), 350);
          }}
        >
          <View style={{ width: "100%", maxWidth: layout.content, alignSelf: "center", gap: 26 }}>
            {messages.length === 0 ? <Empty /> : null}
            {messages.map((m) => (
              <MessageView key={m.id} message={m} latest={m.id === lastAgentId} />
            ))}
            {state.session.busy && messages[messages.length - 1]?.role === "user" ? <Thinking /> : null}
          </View>
        </ScrollView>
        <Composer bottomInset={wide ? 16 : 10} />
      </KeyboardAvoidingView>
      {showPanel ? <ContextPanel /> : null}
    </View>
  );
}

function Header() {
  const { state } = useStore();
  const wide = useWide();
  const insets = useSafeAreaInsets();
  const brain = state.runtime.ai === "model" ? state.runtime.aiLabel ?? "Model" : "On-device";
  return (
    <View style={{ paddingTop: wide ? 18 : insets.top + 8, paddingBottom: 12, paddingHorizontal: wide ? 32 : 16, borderBottomWidth: 1, borderBottomColor: color.line, backgroundColor: color.bg }}>
      <View style={{ width: "100%", maxWidth: layout.content, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Mark size={30} />
        <View style={{ flex: 1 }}>
          <T variant="subheading">Sous</T>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: state.session.busy ? color.accent : color.green }} />
            <T variant="caption">
              {state.session.busy ? "Working" : "Ready"} · {brain} · {state.profile.autonomy === "auto" ? "orders within your rules" : state.profile.autonomy === "confirm" ? "asks before ordering" : "recommends only"}
            </T>
          </View>
        </View>
        {!wide ? <Avatar name={state.profile.name} size={32} /> : null}
      </View>
    </View>
  );
}

function Empty() {
  const { state } = useStore();
  const now = useNow(60_000);
  return (
    <View style={{ paddingTop: 48, gap: 10 }}>
      <T variant="display">
        {greeting(now)}, {state.profile.name}.
      </T>
      <T variant="body">What are you in the mood for? I'll check every platform and time it around your day.</T>
    </View>
  );
}

function Thinking() {
  return (
    <FadeIn style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Spinner />
      <T variant="small">Reading your message</T>
    </FadeIn>
  );
}

function MessageView({ message, latest }: { message: Message; latest: boolean }) {
  if (message.role === "user") {
    const text = message.blocks.find((b) => b.type === "text");
    return (
      <FadeIn style={{ alignItems: "flex-end" }}>
        <View style={{ maxWidth: "82%", backgroundColor: color.ink, borderRadius: 18, borderBottomRightRadius: 6, paddingHorizontal: 15, paddingVertical: 10 }}>
          <T style={{ fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: "#FFFFFF" }}>{text?.type === "text" ? text.text : ""}</T>
        </View>
      </FadeIn>
    );
  }
  return (
    <FadeIn style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Mark size={18} />
        <T variant="caption" style={{ fontFamily: font.semibold, color: color.ink2 }}>
          Sous
        </T>
        <T variant="caption" style={{ color: color.faint }}>
          {fmtTime(message.at)}
        </T>
        {message.proactive ? <Pill label="Proactive" tone="accent" /> : null}
      </View>
      {message.blocks.map((b, i) => (
        <BlockView key={i} block={b} latest={latest} />
      ))}
    </FadeIn>
  );
}

function BlockView({ block, latest }: { block: Block; latest: boolean }) {
  const { state } = useStore();
  switch (block.type) {
    case "text":
      return <TextBlock text={block.text} />;
    case "trace":
      return <TraceBlock block={block} />;
    case "options":
      return <OptionsBlock block={block} interactive={block.id === state.session.lastOptionsBlockId} />;
    case "proposal":
      return <ProposalBlock block={block} />;
    case "call":
      return <CallBlock block={block} />;
    case "order":
      return <OrderBlock orderId={block.orderId} />;
    case "feedback":
      return <FeedbackBlock block={block} />;
    case "note":
      return <NoteBlock block={block} />;
    case "profile":
      return <ProfileBlock />;
    case "suggestions":
      return <SuggestionsBlock items={block.items} enabled={latest && !state.session.busy} />;
  }
}

function Composer({ bottomInset }: { bottomInset: number }) {
  const store = useStore();
  const wide = useWide();
  const [text, setText] = useState("");
  const [focus, setFocus] = useState(false);
  const busy = store.state.session.busy;
  const input = useRef<TextInput>(null);
  const submit = () => {
    if (!text.trim() || busy) return;
    void send(store, text);
    setText("");
  };
  useEffect(() => {
    if (!busy && wide) input.current?.focus();
  }, [busy, wide]);
  const showStarters = !busy && store.state.messages.length === 0;

  return (
    <View style={{ paddingHorizontal: wide ? 32 : 12, paddingTop: 10, paddingBottom: bottomInset, backgroundColor: color.bg }}>
      <View style={{ width: "100%", maxWidth: layout.content, alignSelf: "center", gap: 10 }}>
        {showStarters ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {STARTERS.map((s) => (
              <Chip key={s} label={s} size="sm" onPress={() => send(store, s)} />
            ))}
          </ScrollView>
        ) : null}
        <View style={[{ flexDirection: "row", alignItems: "flex-end", gap: 8, borderRadius: radius.lg, borderWidth: 1, borderColor: focus ? color.ink : color.lineStrong, backgroundColor: color.surface, paddingLeft: 16, paddingRight: 6, paddingVertical: 6 }, shadow.card]}>
          <TextInput
            ref={input}
            value={text}
            onChangeText={setText}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            placeholder={busy ? "Sous is working on it…" : "What are you in the mood for?"}
            placeholderTextColor={color.faint}
            editable={!busy}
            multiline
            onKeyPress={(e) => {
              const ne = e.nativeEvent as { key: string; shiftKey?: boolean };
              if (Platform.OS === "web" && ne.key === "Enter" && !ne.shiftKey) {
                (e as unknown as { preventDefault: () => void }).preventDefault();
                submit();
              }
            }}
            onSubmitEditing={submit}
            blurOnSubmit={false}
            style={{ flex: 1, minHeight: 38, maxHeight: 120, paddingTop: 9, paddingBottom: 9, fontFamily: font.regular, fontSize: 15.5, lineHeight: 21, color: color.ink, outlineStyle: "none" } as never}
          />
          <Pressable onPress={submit} disabled={!text.trim() || busy} accessibilityRole="button" accessibilityLabel="Send">
            <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: text.trim() && !busy ? color.ink : color.sunken }}>
              {busy ? <Spinner /> : <ArrowUp size={18} color={text.trim() ? "#FFFFFF" : color.faint} strokeWidth={2.2} />}
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
