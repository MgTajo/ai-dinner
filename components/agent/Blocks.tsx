import { router } from "expo-router";
import { Check, ChevronDown, ChevronUp, Info, PhoneCall, Sparkles, TriangleAlert } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { platforms } from "../../lib/agent/data/platforms";
import { cuisineNames, itemById, restaurantById } from "../../lib/agent/data/restaurants";
import { allergenNames, money, plural } from "../../lib/agent/format";
import { FEEDBACK, rankedCuisines } from "../../lib/agent/learn";
import { answerProposal, chooseOffer, rateOrder, send } from "../../lib/agent/runner";
import { fmtTime, MINUTE } from "../../lib/agent/time";
import type { Priority, RankedOption } from "../../lib/agent/types";
import type { Block, TraceStep } from "../../lib/store/state";
import { useNow, useStore } from "../../lib/store/StoreProvider";
import { DishArt, PlatformDot, RestaurantMark } from "../ui/DishArt";
import { Bar, Button, Card, Chip, Divider, FadeIn, KeyRow, Pill, RichText, Spinner, Stars, T } from "../ui/primitives";
import { color, font, radius } from "../ui/theme";
import { OrderCard } from "./OrderCard";

// ── Trace ─────────────────────────────────────────────────────────────────────

export function TraceBlock({ block }: { block: Extract<Block, { type: "trace" }> }) {
  const [open, setOpen] = useState(!block.done);
  useEffect(() => {
    if (block.done) {
      const t = setTimeout(() => setOpen(false), 900);
      return () => clearTimeout(t);
    }
    setOpen(true);
  }, [block.done]);
  const seconds = ((block.endedAt ?? Date.now()) - block.startedAt) / 1000;
  const running = block.steps.find((s) => s.status === "running");

  return (
    <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: color.line, backgroundColor: "#FAF9F6", overflow: "hidden" }}>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11 }}>
          {block.done ? <Check size={15} color={color.green} strokeWidth={2.4} /> : <Spinner />}
          <T variant="smallStrong" style={{ flex: 1, color: color.ink }} numberOfLines={1}>
            {block.done ? `Worked for ${seconds.toFixed(1)}s · ${plural(block.steps.length, "step")}` : running?.label ?? "Working"}
          </T>
          {open ? <ChevronUp size={16} color={color.muted} /> : <ChevronDown size={16} color={color.muted} />}
        </View>
      </Pressable>
      {open ? (
        <View style={{ paddingHorizontal: 14, paddingBottom: 12, gap: 2 }}>
          {block.steps.map((s, i) => (
            <TraceRow key={s.id} step={s} last={i === block.steps.length - 1} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function TraceRow({ step, last }: { step: TraceStep; last: boolean }) {
  return (
    <FadeIn>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ alignItems: "center", width: 15 }}>
          <View style={{ height: 18, justifyContent: "center" }}>
            {step.status === "running" ? <Spinner size={11} /> : step.status === "warn" ? <TriangleAlert size={12} color={color.amber} /> : <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.ink2 }} />}
          </View>
          {!last ? <View style={{ flex: 1, width: 1, backgroundColor: color.line }} /> : null}
        </View>
        <View style={{ flex: 1, paddingBottom: last ? 0 : 10, gap: 3 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            <T variant="smallStrong" style={{ color: step.status === "running" ? color.ink : color.ink2, flex: 1 }}>
              {step.label}
            </T>
            {step.ms !== undefined ? (
              <T variant="caption" style={{ fontFamily: font.mono, fontSize: 10.5, color: color.faint }}>
                {(step.ms / 1000).toFixed(1)}s
              </T>
            ) : null}
          </View>
          {step.detail ? <T variant="caption" style={{ color: step.status === "warn" ? color.amber : color.muted }}>{step.detail}</T> : null}
          {step.items?.length ? (
            <View style={{ gap: 4, marginTop: 3 }}>
              {step.items.map((it, i) => (
                <FadeIn key={`${it.label}-${i}`}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    {it.dot ? <PlatformDot dot={it.dot} size={6} /> : <View style={{ width: 6, height: 1, backgroundColor: color.lineStrong }} />}
                    <T variant="caption" style={{ color: color.ink2 }}>
                      {it.label}
                    </T>
                    {it.meta ? (
                      <T variant="caption" style={{ color: color.faint, flexShrink: 1 }} numberOfLines={1}>
                        {it.meta}
                      </T>
                    ) : null}
                  </View>
                </FadeIn>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    </FadeIn>
  );
}

// ── Options ───────────────────────────────────────────────────────────────────

const PART_LABEL: Record<Priority, string> = { taste: "Taste", health: "Health", price: "Price", speed: "Timing" };

export function OptionsBlock({ block, interactive }: { block: Extract<Block, { type: "options" }>; interactive: boolean }) {
  const { state } = useStore();
  const pending = state.session.pendingOfferId;
  return (
    <View style={{ gap: 10 }}>
      {block.result.options.map((o, i) => (
        <OptionCard
          key={o.offer.id}
          option={o}
          rank={i}
          chosen={block.chosenOfferId === o.offer.id}
          dimmed={Boolean(block.chosenOfferId) && block.chosenOfferId !== o.offer.id}
          interactive={interactive && !block.chosenOfferId && !state.session.busy}
          highlighted={pending === o.offer.id}
          target={block.result.request.target}
          weights={block.result.request.weights}
        />
      ))}
    </View>
  );
}

function OptionCard({ option, rank, chosen, dimmed, interactive, highlighted, target, weights }: { option: RankedOption; rank: number; chosen: boolean; dimmed: boolean; interactive: boolean; highlighted: boolean; target: number | null; weights: Record<Priority, number> }) {
  const store = useStore();
  const [open, setOpen] = useState(false);
  const { offer } = option;
  const { item, restaurant } = itemById(offer.itemId);
  const platform = platforms[offer.platform];
  const now = useNow(30_000);
  const eta = target === null ? `${Math.max(1, Math.round((offer.arriveAt - now) / MINUTE))} min` : fmtTime(offer.arriveAt);
  const platformName = platform.kind === "marketplace" ? platform.name : platform.kind === "phone" ? "By phone" : "Restaurant site";

  return (
    <View style={{ opacity: dimmed ? 0.5 : 1 }}>
      <Card padded={false} style={[(chosen || highlighted) && { borderColor: color.ink }]}>
        <View style={{ padding: 14, gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 14 }}>
            <DishArt item={item} size={76} />
            <View style={{ flex: 1, gap: 3 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                {rank === 0 ? <Pill label="Best match" tone="ink" /> : null}
                <T variant="caption" style={{ fontFamily: font.mono, fontSize: 11 }}>
                  {option.score} fit
                </T>
              </View>
              <T variant="heading" numberOfLines={2}>
                {offer.qty > 1 ? `${offer.qty} × ` : ""}
                {item.name}
              </T>
              <T variant="small" numberOfLines={1}>
                {restaurant.name} · {cuisineNames[restaurant.cuisine]} · {restaurant.rating}★
              </T>
            </View>
            <View style={{ alignItems: "flex-end", gap: 2 }}>
              <T variant="num" style={{ fontSize: 17 }}>
                {money(offer.total)}
              </T>
              <T variant="caption">all in</T>
            </View>
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14, rowGap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <PlatformDot dot={platform.dot} />
              <T variant="smallStrong">{platformName}</T>
            </View>
            <T variant="small">
              {target === null ? "At your door in " : "Arrives "}
              <T variant="smallStrong">{eta}</T>
            </T>
            <T variant="small">
              {item.kcal} kcal · {item.protein} g protein
            </T>
          </View>

          <View style={{ gap: 5 }}>
            {option.reasons.map((r) => (
              <View key={r} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                <Check size={13} color={color.green} strokeWidth={2.4} style={{ marginTop: 3 }} />
                <T variant="small" style={{ color: color.ink2, flex: 1 }}>
                  {r}
                </T>
              </View>
            ))}
          </View>

          {open ? (
            <View style={{ gap: 12, paddingTop: 2 }}>
              <Divider />
              <View style={{ gap: 2 }}>
                <T variant="label" style={{ marginBottom: 4 }}>
                  Price on {platformName}
                </T>
                <KeyRow label={`${offer.qty} × ${item.name}`} value={money(offer.subtotal)} />
                {offer.deliveryFee ? <KeyRow label="Delivery" value={money(offer.deliveryFee)} /> : null}
                {offer.serviceFee ? <KeyRow label="Service fee" value={money(offer.serviceFee)} /> : null}
                {offer.smallOrderFee ? <KeyRow label="Small order fee" value={money(offer.smallOrderFee)} /> : null}
                <KeyRow label="Total" value={money(offer.total)} strong />
              </View>
              {option.alternatives.length ? (
                <View style={{ gap: 6 }}>
                  <T variant="label">Same dish elsewhere</T>
                  {option.alternatives.map((a) => (
                    <View key={a.platform} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <PlatformDot dot={platforms[a.platform].dot} />
                      <T variant="small" style={{ flex: 1, color: color.ink2 }}>
                        {platforms[a.platform].name}
                      </T>
                      <T variant="small">{fmtTime(a.arriveAt)}</T>
                      <T variant="smallStrong" style={{ width: 64, textAlign: "right", fontVariant: ["tabular-nums"] }}>
                        {money(a.total)}
                      </T>
                      <T variant="caption" style={{ width: 54, textAlign: "right", color: a.total > offer.total ? color.accentInk : color.green, fontVariant: ["tabular-nums"] }}>
                        {a.total >= offer.total ? "+" : "−"}
                        {money(Math.abs(a.total - offer.total))}
                      </T>
                    </View>
                  ))}
                </View>
              ) : null}
              <View style={{ gap: 7 }}>
                <T variant="label">Why it scored {option.score}</T>
                {(Object.keys(option.parts) as Priority[]).map((k) => (
                  <View key={k} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <T variant="caption" style={{ width: 52 }}>
                      {PART_LABEL[k]}
                    </T>
                    <View style={{ flex: 1 }}>
                      <Bar value={option.parts[k]} height={5} tone={color.ink2} />
                    </View>
                    <T variant="caption" style={{ width: 70, textAlign: "right", fontFamily: font.mono, fontSize: 10.5 }}>
                      {Math.round(option.parts[k] * 100)} × {Math.round(weights[k] * 100)}%
                    </T>
                  </View>
                ))}
              </View>
              <T variant="caption">Allergens: {item.allergens.length ? item.allergens.map((a) => allergenNames[a]).join(", ") : "none listed"}. Confirmed with the restaurant when ordering.</T>
            </View>
          ) : null}
        </View>
        <View style={{ borderTopWidth: 1, borderTopColor: color.line, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 6 }}>
          <Pressable onPress={() => setOpen((o) => !o)} hitSlop={6}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, paddingVertical: 6 }}>
              <T variant="smallStrong">{open ? "Less" : "Prices & reasoning"}</T>
              {open ? <ChevronUp size={14} color={color.ink2} /> : <ChevronDown size={14} color={color.ink2} />}
            </View>
          </Pressable>
          {chosen ? (
            <Pill label="Ordered" tone="green" icon={Check} />
          ) : interactive ? (
            <Button title={offer.platform === "phone" ? `Call & order · ${money(offer.total)}` : `Order · ${money(offer.total)}`} size="sm" kind={rank === 0 ? "primary" : "secondary"} onPress={() => chooseOffer(store, offer.id)} />
          ) : null}
        </View>
      </Card>
    </View>
  );
}

// ── Proposal ──────────────────────────────────────────────────────────────────

export function ProposalBlock({ block }: { block: Extract<Block, { type: "proposal" }> }) {
  const store = useStore();
  const option = findOptionInMessages(store.state.messages, block.offerId);
  if (!option) return null;
  const { item } = itemById(option.offer.itemId);
  if (block.state !== "open") {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {block.state === "accepted" ? <Check size={14} color={color.green} /> : <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.faint }} />}
        <T variant="small">{block.state === "accepted" ? "You approved this order" : "You passed on this one"}</T>
      </View>
    );
  }
  return (
    <View style={{ borderRadius: radius.md, backgroundColor: color.ink, padding: 14, gap: 12 }}>
      <T style={{ fontFamily: font.medium, fontSize: 15, lineHeight: 21, color: "#FFFFFF" }}>
        Order the {item.name.toLowerCase()} for {money(option.offer.total)}?
      </T>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Button title={block.label ?? (option.offer.platform === "phone" ? "Yes, call and order" : "Yes, order it")} kind="accent" onPress={() => answerProposal(store, block.offerId, true)} disabled={store.state.session.busy} />
        <Pressable onPress={() => answerProposal(store, block.offerId, false)} disabled={store.state.session.busy}>
          <View style={{ height: 44, paddingHorizontal: 16, justifyContent: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: "#4A4741" }}>
            <T style={{ fontFamily: font.semibold, fontSize: 15, color: "#E8E4DC" }}>Not now</T>
          </View>
        </Pressable>
      </View>
      <T style={{ fontFamily: font.regular, fontSize: 12, color: "#A29D95" }}>Paid from your agent wallet in USDC. Free cancellation until the kitchen starts.</T>
    </View>
  );
}

function findOptionInMessages(messages: ReturnType<typeof useStore>["state"]["messages"], offerId: string): RankedOption | undefined {
  for (const m of messages) for (const b of m.blocks) if (b.type === "options") {
    const o = b.result.options.find((x) => x.offer.id === offerId);
    if (o) return o;
  }
  return undefined;
}

// ── Phone call ────────────────────────────────────────────────────────────────

export function CallBlock({ block }: { block: Extract<Block, { type: "call" }> }) {
  const r = restaurantById(block.restaurantId);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (block.state !== "talking") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [block.state]);
  const shown = block.state === "ended" ? block.seconds ?? seconds : seconds;
  return (
    <Card padded={false}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: block.state === "ended" ? color.surface : "#FAF9F6" }}>
        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: block.state === "ended" ? color.sunken : color.accent, alignItems: "center", justifyContent: "center" }}>
          <PhoneCall size={17} color={block.state === "ended" ? color.ink2 : "#FFFFFF"} />
        </View>
        <View style={{ flex: 1 }}>
          <T variant="subheading">{block.state === "dialing" ? `Calling ${r.name}…` : block.state === "talking" ? `On the phone with ${r.name}` : `Call with ${r.name}`}</T>
          <T variant="caption">
            {block.phone} · {block.state === "dialing" ? "ringing" : `${Math.floor(shown / 60)}:${String(shown % 60).padStart(2, "0")}`}
            {block.state === "ended" ? " · order confirmed" : ""}
          </T>
        </View>
        {block.state === "talking" ? <Waveform /> : block.state === "ended" ? <Pill label="Confirmed" tone="green" icon={Check} /> : <Spinner />}
      </View>
      {block.lines.length ? (
        <View style={{ borderTopWidth: 1, borderTopColor: color.line, padding: 14, gap: 10 }}>
          {block.lines.map((l, i) => (
            <FadeIn key={i}>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <T variant="caption" style={{ width: 82, fontFamily: font.medium, color: l.who === "agent" ? color.accentInk : color.ink2 }} numberOfLines={1}>
                  {l.who === "agent" ? "Sous (AI)" : r.name}
                </T>
                <T variant="small" style={{ flex: 1, color: color.ink2 }}>
                  {l.text}
                </T>
              </View>
            </FadeIn>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function Waveform() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 160);
    return () => clearInterval(t);
  }, []);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 2, height: 18 }}>
      {Array.from({ length: 7 }, (_, i) => (
        <View key={i} style={{ width: 3, borderRadius: 2, backgroundColor: color.accent, height: 4 + (((tick + i * 3) * 7) % 14) }} />
      ))}
    </View>
  );
}

// ── Feedback ──────────────────────────────────────────────────────────────────

export function FeedbackBlock({ block }: { block: Extract<Block, { type: "feedback" }> }) {
  const store = useStore();
  const order = store.state.orders.find((o) => o.id === block.orderId);
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  if (!order) return null;
  const { item } = itemById(order.itemId);
  if (block.state === "done") {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Stars value={block.rating ?? order.rating ?? 0} size={13} />
        <T variant="small">You rated the {item.name.toLowerCase()}</T>
      </View>
    );
  }
  const toggle = (t: string) => setTags((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]));
  return (
    <Card style={{ gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <DishArt item={item} size={48} />
        <View style={{ flex: 1 }}>
          <T variant="subheading">{item.name}</T>
          <T variant="caption">Delivered {fmtTime(order.arriveAt)}</T>
        </View>
      </View>
      <Stars value={rating} size={26} onChange={setRating} />
      {rating ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {[...(rating >= 4 ? FEEDBACK.positive : FEEDBACK.negative), ...(rating >= 4 ? [] : ["Arrived cold"])].map((t) => (
            <Chip key={t} label={t} size="sm" selected={tags.includes(t)} onPress={() => toggle(t)} />
          ))}
        </View>
      ) : null}
      <Button title="Save rating" size="sm" onPress={() => rateOrder(store, order.id, rating, tags)} disabled={!rating} style={{ alignSelf: "flex-start" }} />
    </Card>
  );
}

// ── Notes, profile, suggestions ───────────────────────────────────────────────

export function NoteBlock({ block }: { block: Extract<Block, { type: "note" }> }) {
  const p = {
    learn: { bg: color.greenSoft, fg: color.green, Icon: Sparkles, label: "Learned" },
    info: { bg: color.blueSoft, fg: color.blue, Icon: Info, label: "" },
    warn: { bg: color.amberSoft, fg: color.amber, Icon: TriangleAlert, label: "" },
  }[block.tone];
  return (
    <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start", backgroundColor: p.bg, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10 }}>
      <p.Icon size={15} color={p.fg} style={{ marginTop: 2 }} />
      <T variant="small" style={{ color: p.fg, flex: 1 }}>
        {p.label ? <T variant="small" style={{ fontFamily: font.semibold, color: p.fg }}>{p.label}: </T> : null}
        {block.text}
      </T>
    </View>
  );
}

export function ProfileBlock() {
  const { state } = useStore();
  const w = state.profile.weights;
  const keys = (Object.keys(w) as Priority[]).sort((a, b) => w[b] - w[a]);
  const top = rankedCuisines(state.learned).slice(0, 3);
  return (
    <Card style={{ gap: 16 }}>
      <View style={{ gap: 8 }}>
        <T variant="label">Priorities</T>
        {keys.map((k) => (
          <View key={k} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <T variant="small" style={{ width: 56, color: color.ink2 }}>
              {PART_LABEL[k]}
            </T>
            <View style={{ flex: 1 }}>
              <Bar value={w[k] / w[keys[0]]} height={5} />
            </View>
            <T variant="caption" style={{ width: 34, textAlign: "right", fontFamily: font.mono }}>
              {Math.round(w[k] * 100)}%
            </T>
          </View>
        ))}
      </View>
      <View style={{ gap: 8 }}>
        <T variant="label">Never</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {state.profile.allergies.map((a) => (
            <Pill key={a} label={`${allergenNames[a]} (allergy)`} tone="accent" />
          ))}
          {state.profile.dislikes.map((d) => (
            <Pill key={d} label={d[0].toUpperCase() + d.slice(1)} />
          ))}
          {state.profile.diet !== "omnivore" ? <Pill label={state.profile.diet} /> : null}
        </View>
      </View>
      {top.length ? (
        <View style={{ gap: 8 }}>
          <T variant="label">Favourite cuisines so far</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {top.map(([c]) => (
              <Pill key={c} label={cuisineNames[c]} tone="green" />
            ))}
          </View>
        </View>
      ) : null}
      <Button title="Open taste profile" kind="secondary" size="sm" onPress={() => router.navigate("/taste")} style={{ alignSelf: "flex-start" }} />
    </Card>
  );
}

export function SuggestionsBlock({ items, enabled }: { items: string[]; enabled: boolean }) {
  const store = useStore();
  if (!enabled) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {items.map((s) => (
        <Chip key={s} label={s} size="sm" onPress={() => send(store, s)} />
      ))}
    </View>
  );
}

export function TextBlock({ text }: { text: string }) {
  return <RichText text={text} style={{ fontSize: 15.5, lineHeight: 24, color: color.ink }} />;
}

export function OrderBlock({ orderId }: { orderId: string }) {
  return <OrderCard orderId={orderId} />;
}

export function RestaurantChip({ id }: { id: string }) {
  const r = restaurantById(id);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <RestaurantMark restaurant={r} size={18} />
      <T variant="smallStrong">{r.name}</T>
    </View>
  );
}
