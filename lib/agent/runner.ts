import type { Store } from "../store/StoreProvider";
import { uid, type AppState, type Block, type Message, type TraceItem, type TraceStep, type WalletTx } from "../store/state";
import { payOnDevnet, understand } from "./companion";
import { platforms } from "./data/platforms";
import { itemById, restaurantById } from "./data/restaurants";
import { allergenNames, capitalize, fakeSignature, GBP_USDC, listJoin, money, plural, shortAddress, toUsdc, usdc } from "./format";
import { applyRating, nudgeWeights } from "./learn";
import { activityAfter, canCancel, canReschedule, isActive, lastMeeting, mealEventAt, orderEvent, orderFromOffer, orderStage, shiftOrder } from "./orders";
import { describeExclusion, dishPhrase, search } from "./search";
import { atTime, clockNow, dayKey, fmtTime, hoursOf, MINUTE } from "./time";
import type { AutopilotPlan, CallLine, Intent, MealSlot, Order, Payment, RankedOption, SearchRequest, SearchResult, Weights } from "./types";

// The agent's behaviour, step by step. Each flow writes into the conversation as it goes
// (a visible trace of what it is doing), so the user can watch it work.

type Api = Pick<Store, "get" | "update">;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nowOf = (s: AppState) => clockNow(s.clock);

// ── Conversation plumbing ─────────────────────────────────────────────────────

function addMessage(api: Api, role: Message["role"], blocks: Block[], proactive = false): string {
  const id = uid("msg");
  api.update((s) => ({ ...s, messages: [...s.messages, { id, role, at: nowOf(s), blocks, proactive }] }));
  return id;
}

function patchMessage(api: Api, id: string, fn: (m: Message) => Message) {
  api.update((s) => ({ ...s, messages: s.messages.map((m) => (m.id === id ? fn(m) : m)) }));
}

function pushBlock(api: Api, msgId: string, block: Block) {
  patchMessage(api, msgId, (m) => ({ ...m, blocks: [...m.blocks, block] }));
}

function say(api: Api, msgId: string, text: string) {
  pushBlock(api, msgId, { type: "text", text });
}

function setSession(api: Api, patch: Partial<AppState["session"]>) {
  api.update((s) => ({ ...s, session: { ...s.session, ...patch } }));
}

/** A live, step-by-step account of what the agent is doing. */
class Trace {
  private readonly blockId = uid("trace");
  constructor(
    private readonly api: Api,
    private readonly msgId: string,
    title?: string,
  ) {
    pushBlock(api, msgId, { type: "trace", id: this.blockId, steps: [], done: false, startedAt: Date.now(), title });
  }

  private patch(fn: (steps: TraceStep[]) => TraceStep[], extra: Partial<Extract<Block, { type: "trace" }>> = {}) {
    patchMessage(this.api, this.msgId, (m) => ({
      ...m,
      blocks: m.blocks.map((b) => (b.type === "trace" && b.id === this.blockId ? { ...b, ...extra, steps: fn(b.steps) } : b)),
    }));
  }

  async step(label: string, work: () => Promise<Partial<TraceStep>> | Partial<TraceStep>, minMs = 650): Promise<void> {
    const id = uid("step");
    const started = Date.now();
    this.patch((steps) => [...steps, { id, label, status: "running" }]);
    const [result] = await Promise.all([Promise.resolve().then(work), sleep(minMs)]);
    this.patch((steps) => steps.map((st) => (st.id === id ? { ...st, status: "done", ...result, ms: Date.now() - started } : st)));
  }

  /** A step whose items appear one by one, e.g. each platform being searched. */
  async stepItems(label: string, items: TraceItem[], detail: string, perItemMs = 380): Promise<void> {
    const id = uid("step");
    const started = Date.now();
    this.patch((steps) => [...steps, { id, label, status: "running", items: [] }]);
    for (const item of items) {
      await sleep(perItemMs);
      this.patch((steps) => steps.map((st) => (st.id === id ? { ...st, items: [...(st.items ?? []), item] } : st)));
    }
    await sleep(200);
    this.patch((steps) => steps.map((st) => (st.id === id ? { ...st, status: "done", detail, ms: Date.now() - started } : st)));
  }

  done() {
    this.patch((steps) => steps, { done: true, endedAt: Date.now() });
  }
}

// ── Requests ──────────────────────────────────────────────────────────────────

function inferMeal(at: number): MealSlot {
  const h = hoursOf(at);
  if (h < 10.5) return "breakfast";
  if (h < 15.5) return "lunch";
  return "dinner";
}

function normalise(w: Weights): Weights {
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v / sum])) as Weights;
}

interface Built {
  req: SearchRequest;
  calendarNote?: string;
  timeNote?: string;
}

function buildRequest(intent: Intent, s: AppState, now: number): Built {
  const events = s.calendar.events;
  let target: number | null = null;
  let calendarNote: string | undefined;
  let timeNote: string | undefined;
  const meal = intent.meal ?? inferMeal(intent.time?.kind === "at" ? atTime(now, intent.time.hhmm) : now);
  const time = intent.time ?? (meal === "dinner" && s.profile.calendarConnected && lastMeeting(events) && lastMeeting(events)!.end > now ? { kind: "after_last_meeting" as const } : undefined);

  if (time?.kind === "at") {
    target = atTime(now, time.hhmm);
    if (target < now + 15 * MINUTE) {
      timeNote = `${time.hhmm} is too soon to make, so I'm going for the earliest arrival.`;
      target = null;
    }
  } else if (time?.kind === "in") {
    target = now + time.minutes * MINUTE;
  } else if (time?.kind === "after_last_meeting") {
    const last = lastMeeting(events);
    if (last && last.end > now) {
      target = last.end + (time.bufferMin ?? 10) * MINUTE;
      calendarNote = `${last.title} ends ${fmtTime(last.end)}`;
    } else {
      timeNote = "Your meetings are done for the day, so I'm going for the earliest arrival.";
    }
  } else if (time?.kind === "asap") {
    target = null;
  } else if (!time) {
    const usual = atTime(now, s.profile.mealTimes[meal]);
    target = usual > now + 45 * MINUTE ? usual : null;
  }

  const tags = intent.tags ?? [];
  let weights = { ...s.profile.weights };
  const reasons: string[] = [];
  if (tags.some((t) => ["healthy", "light", "high-protein", "low-carb"].includes(t))) {
    weights.health *= 1.6;
    reasons.push("health counts for more because you asked for it");
  }
  if (intent.budget) weights.price *= 1.4;
  if (target === null) weights.speed *= 1.5;
  const activity = activityAfter(events, target ?? now);
  if (activity && meal !== "breakfast") {
    weights.health *= 1.25;
    calendarNote = [calendarNote, `${activity.title} at ${fmtTime(activity.start)}`].filter(Boolean).join(" · ");
    reasons.push(`you have ${activity.title.toLowerCase()} at ${fmtTime(activity.start)}, so lighter dishes rank higher`);
  }
  weights = normalise(weights);

  const req: SearchRequest = {
    meal,
    target,
    fulfilment: intent.fulfilment ?? "delivery",
    budget: intent.budget ?? s.profile.budget[meal],
    partySize: intent.partySize ?? 1,
    dishTypes: intent.dishTypes ?? [],
    cuisines: intent.cuisines ?? [],
    tags,
    avoidTags: intent.avoidTags ?? [],
    avoidIngredients: intent.avoidIngredients ?? [],
    restaurantId: intent.restaurantId,
    excludeRestaurants: [],
    weights,
    weightNote: reasons.length ? capitalize(listJoin(reasons)) + "." : undefined,
  };
  req.phrase = intent.surprise ? undefined : dishPhrase(req);
  return { req, calendarNote, timeNote };
}

function describeRequest(req: SearchRequest, intent: Intent | undefined): string {
  const parts: string[] = [];
  parts.push(req.phrase ? capitalize(req.phrase) : intent?.surprise ? "Anything good" : "Open to anything");
  parts.push(req.meal);
  parts.push(req.target ? `arrive ${fmtTime(req.target)}` : "as soon as possible");
  if (req.partySize > 1) parts.push(`for ${req.partySize}`);
  parts.push(`≤ ${money(req.budget)} each`);
  if (req.fulfilment === "collection") parts.push("collection");
  if (req.avoidTags.includes("spicy")) parts.push("not spicy");
  return parts.join(" · ");
}

const pct = (n: number) => Math.round(n * 100);

// ── Finding food ──────────────────────────────────────────────────────────────

async function findFood(api: Api, intent: Intent | undefined, built: Built, opts: { msgId?: string; intro?: string } = {}) {
  const s = api.get();
  const now = nowOf(s);
  const { req } = built;
  const msgId = opts.msgId ?? addMessage(api, "agent", []);
  if (opts.intro) say(api, msgId, opts.intro);
  const trace = new Trace(api, msgId);

  await trace.step("Understanding your request", () => ({ detail: describeRequest(req, intent) + (intent?.source === "model" ? ` · understood by ${api.get().runtime.aiLabel ?? "the model"}` : "") }), 650);
  if (built.calendarNote) await trace.step("Checking your calendar", () => ({ detail: built.calendarNote }), 650);

  const result = search(req, { profile: s.profile, learned: s.learned, orders: s.orders, now });
  const platformItems: TraceItem[] = result.perPlatform
    .sort((a, b) => b.restaurants - a.restaurants)
    .map((p) => ({ label: platforms[p.platform].kind === "phone" ? "Phone-only kitchens" : platforms[p.platform].kind === "direct" ? "Restaurant websites" : platforms[p.platform].name, meta: `${plural(p.restaurants, "restaurant")} · ${p.dishes} dishes`, dot: platforms[p.platform].dot }));
  await trace.stepItems(`Searching ${result.perPlatform.length} ordering channels`, platformItems, `${result.scanned.dishes} dishes, ${result.scanned.offers} listings`, 330);

  const removed = result.exclusions.reduce((n, e) => n + e.count, 0);
  await trace.step(
    "Applying your rules",
    () => ({
      detail: `Kept ${result.scanned.dishes - removed} of ${result.scanned.dishes} dishes`,
      items: result.exclusions.map((e) => ({ label: describeExclusion(e, req), meta: e.examples[0] })),
    }),
    700,
  );

  if (!result.options.length) {
    trace.done();
    say(api, msgId, nothingFound(result));
    pushBlock(api, msgId, { type: "suggestions", items: relaxSuggestions(req) });
    setSession(api, { lastResult: result, lastRequest: req, pendingOfferId: undefined });
    return;
  }

  const w = req.weights;
  await trace.step(
    `Ranking ${plural(result.considered, "price")} across ${plural(result.scanned.dishes - removed, "dish", "dishes")}`,
    () => ({ detail: `Taste ${pct(w.taste)} · Health ${pct(w.health)} · Price ${pct(w.price)} · Timing ${pct(w.speed)}` }),
    750,
  );
  const top = result.options[0];
  const cheaper = top.alternatives.filter((a) => a.total > top.offer.total).sort((a, b) => a.total - b.total)[0];
  if (cheaper) {
    const r = restaurantById(top.offer.restaurantId);
    await trace.step("Comparing platforms", () => ({ detail: `${r.name} is ${money(cheaper.total - top.offer.total)} cheaper on ${platforms[top.offer.platform].name} than on ${platforms[cheaper.platform].name}` }), 600);
  }
  trace.done();
  await present(api, msgId, result, built);
}

function nothingFound(result: SearchResult): string {
  const main = [...result.exclusions].sort((a, b) => b.count - a.count).filter((e) => e.reason !== "mismatch")[0];
  if (!main) return "I couldn't find anything matching that nearby. Want to try something broader?";
  return `Nothing fits all your rules this time. The biggest blocker: ${describeExclusion(main, result.request)}. Want me to loosen something?`;
}

function relaxSuggestions(req: SearchRequest): string[] {
  const out = [`Raise my budget to ${money(Math.ceil(req.budget * 1.3))}`];
  if (req.target) out.push("As soon as possible instead");
  if (req.phrase) out.push("Surprise me instead");
  return out;
}

async function present(api: Api, msgId: string, result: SearchResult, built: Built) {
  const s = api.get();
  const top = result.options[0];
  const { item, restaurant } = itemById(top.offer.itemId);
  const blockId = uid("opts");
  const lines: string[] = [];
  const count = result.options.length;
  lines.push(`My pick is the **${item.name.toLowerCase()}** from ${restaurant.name}: ${money(top.offer.total)} all in, arriving ${fmtTime(top.offer.arriveAt)}.`);
  if (built.req.weightNote) lines.push(built.req.weightNote);
  if (built.timeNote) lines.push(built.timeNote);
  say(api, msgId, lines.join(" "));
  pushBlock(api, msgId, { type: "options", id: blockId, result });
  setSession(api, { lastResult: result, lastRequest: result.request, lastOptionsBlockId: blockId });

  const autonomy = s.profile.autonomy;
  if (autonomy === "suggest") {
    say(api, msgId, `${count > 1 ? `Those are my top ${count}.` : "That's the best fit."} Tap one when you want me to order it.`);
    setSession(api, { pendingOfferId: undefined });
    return;
  }
  const limitIssue = spendIssue(s, top.offer.total);
  if (autonomy === "auto" && !limitIssue) {
    pushBlock(api, msgId, { type: "note", tone: "info", text: `Ordering automatically: it's within your ${money(s.profile.limits.perOrder)} per-order limit.` });
    await placeOrder(api, top, { source: "chat", meal: result.request.meal });
    return;
  }
  if (autonomy === "auto" && limitIssue) pushBlock(api, msgId, { type: "note", tone: "warn", text: `${limitIssue} So I'm checking with you first.` });
  pushBlock(api, msgId, { type: "proposal", offerId: top.offer.id, resultBlockId: blockId, state: "open" });
  setSession(api, { pendingOfferId: top.offer.id });
}

function weekSpend(s: AppState, now: number): number {
  return s.orders.filter((o) => o.source !== "history" && !o.cancelledAt && now - o.placedAt < 7 * 24 * 60 * MINUTE).reduce((n, o) => n + o.total, 0);
}

/** Why an order of `total` would break the user's spending rules, if it would. */
export function spendIssue(s: AppState, total: number): string | undefined {
  const { perOrder, weekly } = s.profile.limits;
  if (total > perOrder) return `${money(total)} is above your ${money(perOrder)} per-order limit.`;
  const spent = weekSpend(s, nowOf(s));
  if (spent + total > weekly) return `This would take you past your ${money(weekly)} weekly budget (${money(spent)} spent).`;
  return undefined;
}

// ── Ordering and paying ───────────────────────────────────────────────────────

function findOption(s: AppState, offerId: string): RankedOption | undefined {
  for (const m of [...s.messages].reverse()) {
    for (const b of m.blocks) {
      if (b.type === "options") {
        const o = b.result.options.find((x) => x.offer.id === offerId);
        if (o) return o;
      }
    }
  }
  return s.autopilot.plans.find((p) => p.option?.offer.id === offerId)?.option;
}

function callScript(s: AppState, order: Order): CallLine[] {
  const { item, restaurant } = itemById(order.itemId);
  const who = s.profile.name || "my user";
  const allergy = s.profile.allergies.length ? ` ${who} is allergic to ${listJoin(s.profile.allergies.map((a) => allergenNames[a].toLowerCase()))}. Can you confirm the dish is safe?` : "";
  const contains = item.allergens.filter((a) => !s.profile.allergies.includes(a)).slice(0, 1);
  return [
    { who: "agent", text: `Hi, this is Sous, an AI assistant calling on behalf of ${who}. I'd like to place an order for ${order.fulfilment}. Is now a good time?` },
    { who: "venue", text: `${restaurant.name}, yes, go ahead.` },
    { who: "agent", text: `One ${item.name.toLowerCase()}, please, ${order.fulfilment === "delivery" ? `delivered to ${s.profile.address.line}` : "for collection"} at ${fmtTime(order.arriveAt)}.${allergy}` },
    { who: "venue", text: s.profile.allergies.length ? `No ${allergenNames[s.profile.allergies[0]].toLowerCase()} in that one${contains.length ? `, though it does have ${allergenNames[contains[0]].toLowerCase()}` : ""}. ${money(order.total)} with delivery, at your door for ${fmtTime(order.arriveAt)}.` : `That's ${money(order.total)} with delivery, at your door for ${fmtTime(order.arriveAt)}.` },
    { who: "agent", text: `Perfect. I'll pay now through your Solana Pay account, reference ${order.id}.` },
    { who: "venue", text: "Lovely, payment's come through. See you then." },
    { who: "agent", text: "Thank you, goodbye." },
  ];
}

async function settle(api: Api, order: Order): Promise<Payment> {
  const s = api.get();
  const amountUsdc = toUsdc(order.total);
  const { restaurant } = itemById(order.itemId);
  const memo = `sous:${order.id}`;
  const to = platforms[order.platform].settlement;
  if (s.runtime.payments === "live") {
    try {
      const r = await payOnDevnet({ orderId: order.id, amountUsdc, platform: order.platform, restaurant: restaurant.name });
      return { status: "confirmed", network: "solana-devnet", amountUsdc: r.amountUsdc, rate: GBP_USDC, signature: r.signature, simulated: false, to: r.to, memo, at: nowOf(api.get()) };
    } catch (err) {
      return { status: "failed", network: "solana-devnet", amountUsdc, rate: GBP_USDC, simulated: false, to, memo, at: nowOf(api.get()), error: err instanceof Error ? err.message : String(err) };
    }
  }
  await sleep(500);
  if (s.wallet.balanceUsdc < amountUsdc) {
    return { status: "failed", network: "solana-devnet", amountUsdc, rate: GBP_USDC, simulated: true, to, memo, at: nowOf(s), error: `The agent wallet has ${usdc(s.wallet.balanceUsdc)}, which isn't enough.` };
  }
  return { status: "confirmed", network: "solana-devnet", amountUsdc, rate: GBP_USDC, signature: fakeSignature(`${order.id}-${Date.now()}`), simulated: true, to, memo, at: nowOf(s) };
}

export async function placeOrder(api: Api, option: RankedOption, ctx: { source: Order["source"]; meal: MealSlot; msgId?: string; plan?: AutopilotPlan["rule"] }): Promise<Order | undefined> {
  const s = api.get();
  const now = nowOf(s);
  const { item, restaurant } = itemById(option.offer.itemId);
  const platform = platforms[option.offer.platform];
  const msgId = ctx.msgId ?? addMessage(api, "agent", [], ctx.source === "autopilot");
  const trace = new Trace(api, msgId);
  let order = orderFromOffer(option.offer, ctx.meal, ctx.source, now);

  if (option.offer.platform === "phone") {
    const phone = restaurant.phone ?? "";
    const lines = callScript(s, order);
    const blockIndex = api.get().messages.find((m) => m.id === msgId)!.blocks.length;
    await trace.step(`Calling ${restaurant.name}`, async () => {
      pushBlock(api, msgId, { type: "call", restaurantId: restaurant.id, phone, lines: [], state: "dialing" });
      const patchCall = (fn: (b: Extract<Block, { type: "call" }>) => Extract<Block, { type: "call" }>) =>
        patchMessage(api, msgId, (m) => ({ ...m, blocks: m.blocks.map((b, i) => (i === blockIndex && b.type === "call" ? fn(b) : b)) }));
      await sleep(1400);
      patchCall((b) => ({ ...b, state: "talking" }));
      for (const line of lines) {
        await sleep(line.who === "agent" ? 1500 : 1200);
        patchCall((b) => ({ ...b, lines: [...b.lines, line] }));
      }
      await sleep(500);
      patchCall((b) => ({ ...b, state: "ended", seconds: 68 }));
      return { detail: `Confirmed by phone · ${phone}` };
    }, 600);
    order = { ...order, call: lines };
  } else {
    await trace.step(`Placing the order on ${platform.kind === "direct" ? `${restaurant.name}'s website` : platform.name}`, () => ({ detail: `${order.id} · ${order.qty} × ${item.name}` }), 900);
  }

  const scheduled = order.prepAt - now > 20 * MINUTE;
  await trace.step(`${restaurant.name} accepted`, () => ({ detail: scheduled ? `Kitchen starts ${fmtTime(order.prepAt)} · arrives ${fmtTime(order.arriveAt)}` : `Arrives ${fmtTime(order.arriveAt)}` }), 700);

  let payment: Payment | undefined;
  await trace.step(
    `Paying ${usdc(toUsdc(order.total))} on Solana`,
    async () => {
      payment = await settle(api, order);
      if (payment.status !== "confirmed") return { status: "warn", detail: payment.error };
      return { detail: `${payment.simulated ? "Devnet (simulated)" : "Devnet"} · ${shortAddress(payment.signature!, 6)} · memo ${payment.memo}` };
    },
    900,
  );

  if (!payment || payment.status !== "confirmed") {
    trace.done();
    say(api, msgId, `The payment didn't go through, so I've told ${restaurant.name} to hold the order. Nothing was charged. ${payment?.error ?? ""}`.trim());
    pushBlock(api, msgId, { type: "suggestions", items: ["Try the payment again", "Show my wallet"] });
    return undefined;
  }

  order = { ...order, payment };
  const tx: WalletTx = {
    id: uid("tx"),
    at: payment.at,
    kind: "payment",
    amountUsdc: payment.amountUsdc,
    label: `${restaurant.name} · ${platform.kind === "marketplace" ? platform.name : platform.kind === "phone" ? "Phone order" : "Direct"}`,
    orderId: order.id,
    signature: payment.signature,
    simulated: payment.simulated,
    to: payment.to,
  };
  const mealTitle = `${capitalize(ctx.meal)} · ${restaurant.name}`;
  api.update((st) => ({
    ...st,
    orders: [order, ...st.orders],
    wallet: { ...st.wallet, balanceUsdc: payment!.simulated ? Math.round((st.wallet.balanceUsdc - payment!.amountUsdc) * 100) / 100 : st.wallet.balanceUsdc, txs: [tx, ...st.wallet.txs] },
    calendar: { ...st.calendar, events: [...st.calendar.events.filter((e) => e.id !== `order-${order.id}`), orderEvent(order, mealTitle)] },
    session: { ...st.session, pendingOfferId: undefined },
    // Whether it came from the autopilot or the chat, today's plan for this meal is now covered.
    autopilot: { ...st.autopilot, plans: st.autopilot.plans.map((p) => (p.rule === (ctx.plan ?? ctx.meal) && p.state !== "ordered" ? { ...p, state: "ordered", orderId: order.id } : p)) },
  }));
  await trace.step("Added to your calendar", () => ({ detail: `${mealTitle} · ${fmtTime(order.arriveAt)}` }), 450);
  trace.done();

  say(api, msgId, `Done. Your ${item.name.toLowerCase()} ${order.fulfilment === "delivery" ? "arrives" : "is ready to collect"} at **${fmtTime(order.arriveAt)}**. Paid ${usdc(payment.amountUsdc)} (${money(order.total)}).`);
  pushBlock(api, msgId, { type: "order", orderId: order.id });
  return order;
}

/** The user tapped an option (or said "the second one"). */
export async function chooseOffer(api: Api, offerId: string) {
  const s = api.get();
  if (s.session.busy) return;
  const option = findOption(s, offerId);
  if (!option) return;
  setSession(api, { busy: true });
  try {
    api.update((st) => ({
      ...st,
      messages: st.messages.map((m) => ({
        ...m,
        blocks: m.blocks.map((b) => {
          if (b.type === "options" && b.result.options.some((o) => o.offer.id === offerId)) return { ...b, chosenOfferId: offerId };
          if (b.type === "proposal" && b.state === "open") return { ...b, state: b.offerId === offerId ? "accepted" : "declined" };
          return b;
        }),
      })),
    }));
    const { item } = itemById(option.offer.itemId);
    addMessage(api, "user", [{ type: "text", text: `Order the ${item.name.toLowerCase()}` }]);

    const msgId = addMessage(api, "agent", []);
    const result = st(api).session.lastResult;
    const top = result?.options[0];
    if (top && top.offer.id !== option.offer.id && result?.options.some((o) => o.offer.id === offerId)) {
      const nudge = nudgeWeights(s.profile.weights, option, top, nowOf(s));
      if (nudge.note) {
        api.update((x) => ({ ...x, profile: { ...x.profile, weights: nudge.weights }, learned: { ...x.learned, events: [nudge.event!, ...x.learned.events].slice(0, 40) } }));
        pushBlock(api, msgId, { type: "note", tone: "learn", text: nudge.note });
      }
    }
    await placeOrder(api, option, { source: "chat", meal: result?.request.meal ?? inferMeal(nowOf(s)), msgId });
  } finally {
    setSession(api, { busy: false });
  }
}

const st = (api: Api) => api.get();

export async function answerProposal(api: Api, offerId: string, accept: boolean) {
  if (accept) return chooseOffer(api, offerId);
  api.update((s) => ({
    ...s,
    session: { ...s.session, pendingOfferId: undefined },
    messages: s.messages.map((m) => ({ ...m, blocks: m.blocks.map((b) => (b.type === "proposal" && b.offerId === offerId ? { ...b, state: "declined" } : b)) })),
    autopilot: { ...s.autopilot, plans: s.autopilot.plans.map((p) => (p.option?.offer.id === offerId && p.state === "proposed" ? { ...p, state: "skipped" } : p)) },
  }));
  addMessage(api, "user", [{ type: "text", text: "Not now" }]);
  addMessage(api, "agent", [
    { type: "text", text: "No problem, I'll hold off. Tell me what you'd rather have, or pick one of the options above." },
    { type: "suggestions", items: ["Something cheaper", "Show me something different", "As soon as possible"] },
  ]);
}

export function cancelOrder(api: Api, orderId: string) {
  const s = api.get();
  const now = nowOf(s);
  const order = s.orders.find((o) => o.id === orderId);
  if (!order) return;
  const { restaurant } = itemById(order.itemId);
  if (!canCancel(order, now)) {
    addMessage(api, "agent", [{ type: "text", text: `${restaurant.name} has already started cooking, so it can't be cancelled any more.` }]);
    return;
  }
  const refund: WalletTx | undefined = order.payment
    ? { id: uid("tx"), at: now, kind: "refund", amountUsdc: order.payment.amountUsdc, label: `Refund · ${restaurant.name}`, orderId, simulated: order.payment.simulated, signature: order.payment.simulated ? fakeSignature(`refund-${orderId}`) : undefined }
    : undefined;
  api.update((x) => ({
    ...x,
    orders: x.orders.map((o) => (o.id === orderId ? { ...o, cancelledAt: now } : o)),
    calendar: { ...x.calendar, events: x.calendar.events.filter((e) => e.id !== `order-${orderId}`) },
    wallet: refund ? { ...x.wallet, balanceUsdc: refund.simulated ? Math.round((x.wallet.balanceUsdc + refund.amountUsdc) * 100) / 100 : x.wallet.balanceUsdc, txs: [refund, ...x.wallet.txs] } : x.wallet,
    autopilot: { ...x.autopilot, plans: x.autopilot.plans.map((p) => (p.orderId === orderId ? { ...p, state: "skipped" } : p)) },
  }));
  addMessage(api, "agent", [
    {
      type: "text",
      text: refund
        ? refund.simulated
          ? `Cancelled with ${restaurant.name}. ${usdc(refund.amountUsdc)} is back in your agent wallet.`
          : `Cancelled with ${restaurant.name}. I've asked ${platforms[order.platform].name} to refund ${usdc(refund.amountUsdc)} to the agent wallet.`
        : `Cancelled with ${restaurant.name}.`,
    },
  ]);
}

export function rateOrder(api: Api, orderId: string, rating: number, feedback: string[]) {
  const s = api.get();
  const now = nowOf(s);
  const order = s.orders.find((o) => o.id === orderId);
  if (!order) return;
  const { learned, notes } = applyRating(s.learned, order, rating, feedback, now);
  api.update((x) => ({
    ...x,
    learned,
    orders: x.orders.map((o) => (o.id === orderId ? { ...o, rating, feedback } : o)),
    messages: x.messages.map((m) => ({ ...m, blocks: m.blocks.map((b) => (b.type === "feedback" && b.orderId === orderId ? { ...b, state: "done", rating } : b)) })),
  }));
  addMessage(api, "agent", [
    { type: "text", text: rating >= 4 ? "Thanks, noted." : "Thanks for telling me. Noted." },
    { type: "note", tone: "learn", text: notes.join(" ") },
  ]);
}

// ── Talking ───────────────────────────────────────────────────────────────────

export async function send(api: Api, text: string) {
  const trimmed = text.trim();
  if (!trimmed || api.get().session.busy) return;
  addMessage(api, "user", [{ type: "text", text: trimmed }]);
  setSession(api, { busy: true });
  try {
    const s = api.get();
    const intent = await understand(trimmed, s.runtime.ai === "model", { now: nowOf(s), hasOptions: Boolean(s.session.lastResult), hasPending: Boolean(s.session.pendingOfferId) });
    await route(api, intent);
  } catch (err) {
    addMessage(api, "agent", [{ type: "text", text: `Something went wrong on my side: ${err instanceof Error ? err.message : String(err)}` }]);
  } finally {
    setSession(api, { busy: false });
  }
}

async function route(api: Api, intent: Intent) {
  const s = api.get();
  const now = nowOf(s);
  switch (intent.kind) {
    case "order":
      return findFood(api, intent, buildRequest(intent, s, now));

    case "confirm":
      if (s.session.pendingOfferId) {
        setSession(api, { busy: false });
        return chooseOffer(api, s.session.pendingOfferId);
      }
      addMessage(api, "agent", [{ type: "text", text: "There's nothing waiting for a yes right now. What would you like to eat?" }]);
      return;

    case "decline":
      if (s.session.pendingOfferId) {
        setSession(api, { busy: false });
        return answerProposal(api, s.session.pendingOfferId, false);
      }
      addMessage(api, "agent", [{ type: "text", text: "Okay. I'm here when you're hungry." }]);
      return;

    case "select": {
      const option = s.session.lastResult?.options[(intent.selectIndex ?? 1) - 1];
      if (!option) {
        addMessage(api, "agent", [{ type: "text", text: "I don't have that option. Ask me for food first and I'll show you a shortlist." }]);
        return;
      }
      setSession(api, { busy: false });
      return chooseOffer(api, option.offer.id);
    }

    case "refine": {
      const last = s.session.lastRequest;
      if (!last) return findFood(api, intent, buildRequest({ ...intent, kind: "order" }, s, now));
      const req: SearchRequest = { ...last, weights: { ...last.weights }, excludeRestaurants: [...last.excludeRestaurants] };
      let intro = "";
      switch (intent.refine) {
        case "cheaper":
          req.weights.price *= 2;
          req.budget = Math.max(9, Math.round(Math.min(last.budget, (s.session.lastResult?.options[0]?.offer.total ?? last.budget) - 1)));
          intro = `Looking for something under ${money(req.budget)}.`;
          break;
        case "faster":
          req.target = null;
          req.weights.speed *= 2;
          intro = "Going for the fastest arrival instead.";
          break;
        case "healthier":
          req.tags = [...new Set([...req.tags, "healthy" as const])];
          req.weights.health *= 1.8;
          intro = "Leaning healthier.";
          break;
        case "filling":
          req.weights.taste *= 1.4;
          req.tags = req.tags.filter((t) => t !== "light");
          intro = "Going for something more filling.";
          break;
        default:
          req.excludeRestaurants = [...req.excludeRestaurants, ...(s.session.lastResult?.options.map((o) => o.offer.restaurantId) ?? [])];
          intro = "Here's a different set.";
      }
      req.weights = normalise(req.weights);
      req.phrase = dishPhrase(req);
      return findFood(api, undefined, { req }, { intro });
    }

    case "cancel": {
      const active = s.orders.find((o) => o.source !== "history" && isActive(o, now));
      if (active) return cancelOrder(api, active.id);
      addMessage(api, "agent", [{ type: "text", text: "You don't have an order in progress." }]);
      return;
    }

    case "status": {
      const active = s.orders.find((o) => o.source !== "history" && isActive(o, now));
      if (!active) {
        addMessage(api, "agent", [{ type: "text", text: "Nothing on its way right now. Want me to find you something?" }]);
        return;
      }
      const { restaurant } = itemById(active.itemId);
      addMessage(api, "agent", [
        { type: "text", text: `${restaurant.name}: ${statusLine(active, now)}` },
        { type: "order", orderId: active.id },
      ]);
      return;
    }

    case "profile":
      addMessage(api, "agent", [
        { type: "text", text: `Here's what I go on. Your rules are fixed; the rest I keep adjusting from your ratings and choices (${plural(s.learned.ratings, "rating")} so far).` },
        { type: "profile" },
      ]);
      return;

    case "reorder": {
      const past = s.orders.filter((o) => o.rating && o.rating >= 4 && !o.cancelledAt && (!intent.meal || o.meal === intent.meal) && (!intent.restaurantId || o.restaurantId === intent.restaurantId));
      const counts = new Map<string, { order: Order; score: number }>();
      for (const o of past) {
        const prev = counts.get(o.itemId);
        counts.set(o.itemId, { order: o, score: (prev?.score ?? 0) + o.rating! });
      }
      const fav = [...counts.values()].sort((a, b) => b.score - a.score)[0]?.order;
      if (!fav) return findFood(api, intent, buildRequest({ ...intent, kind: "order" }, s, now));
      const { item, restaurant } = itemById(fav.itemId);
      const built = buildRequest({ ...intent, kind: "order", restaurantId: fav.restaurantId, dishTypes: [item.type] }, s, now);
      built.req.phrase = `${item.name.toLowerCase()} from ${restaurant.name}`;
      return findFood(api, intent, built, { intro: `Your usual: the ${item.name.toLowerCase()} from ${restaurant.name}. Checking it's available and the best way to order it.` });
    }

    case "autopilot": {
      const meal = intent.meal === "lunch" ? "lunch" : "dinner";
      api.update((x) => ({ ...x, autopilot: { ...x.autopilot, rules: x.autopilot.rules.map((r) => (r.id === meal ? { ...r, enabled: true } : r)), plans: x.autopilot.plans.filter((p) => p.rule !== meal || p.state === "ordered") } }));
      const mode = s.profile.autonomy === "auto" ? `order automatically within your ${money(s.profile.limits.perOrder)} limit` : "check with you before ordering";
      addMessage(api, "agent", [
        { type: "text", text: `Done. Every day with meetings, I'll time ${meal} to land 10 minutes after your last one and ${mode}. You can change this under Today.` },
        { type: "note", tone: "info", text: `${capitalize(meal)} autopilot is on.` },
      ]);
      return;
    }

    case "help":
      addMessage(api, "agent", [
        { type: "text", text: "Tell me what you fancy and when, in your own words. I check every platform, rule out anything that breaks your diet, allergies or budget, time it around your calendar, order it (by phone if that's the only way) and pay from your agent wallet." },
        { type: "suggestions", items: ["A healthy bowl at 18:30", "Dinner right after my last meeting", "Surprise me under £15", "What do you know about me?"] },
      ]);
      return;

    case "thanks":
      addMessage(api, "agent", [{ type: "text", text: "Enjoy your meal." }]);
      return;

    default:
      addMessage(api, "agent", [
        { type: "text", text: "I'm best at food. Tell me what you'd like and when, and I'll handle the rest." },
        { type: "suggestions", items: ["A healthy bowl at 18:30", "Something quick", "The usual"] },
      ]);
  }
}

export function statusLine(o: Order, now: number): string {
  const stage = orderStage(o, now);
  switch (stage) {
    case "scheduled":
      return `scheduled. The kitchen starts at ${fmtTime(o.prepAt)} and it arrives at ${fmtTime(o.arriveAt)}.`;
    case "placed":
    case "accepted":
      return `confirmed, arriving at ${fmtTime(o.arriveAt)}.`;
    case "preparing":
      return `being prepared now, arriving at ${fmtTime(o.arriveAt)}.`;
    case "on-the-way":
      return `the courier is on the way, arriving at ${fmtTime(o.arriveAt)}.`;
    case "ready":
      return "ready to collect.";
    case "delivered":
    case "collected":
      return `delivered at ${fmtTime(o.arriveAt)}.`;
    case "cancelled":
      return "cancelled.";
  }
}

// ── Autopilot ─────────────────────────────────────────────────────────────────

/** Plans today's meal for a rule: when the last meeting ends, what to order and when to decide. */
export function planMeal(s: AppState, ruleId: AutopilotPlan["rule"], now: number): AutopilotPlan | undefined {
  const rule = s.autopilot.rules.find((r) => r.id === ruleId);
  if (!rule?.enabled || !s.profile.calendarConnected) return undefined;
  const last = lastMeeting(s.calendar.events, rule.window[0] - 1.5, rule.window[1] - 0.25);
  if (!last) return undefined;
  const target = last.end + rule.bufferMin * MINUTE;
  const base = { rule: ruleId, day: s.calendar.day, anchorEventId: last.id, anchorEnd: last.end, target } as const;
  const already = s.orders.find((o) => o.source !== "history" && !o.cancelledAt && o.meal === ruleId && dayKey(o.arriveAt) === s.calendar.day);
  if (already) return { ...base, decideAt: target, state: "ordered", orderId: already.id };
  if (hoursOf(target) < rule.window[0] || hoursOf(target) > rule.window[1]) return undefined;
  if (mealEventAt(s.calendar.events, target)) return { ...base, decideAt: target, state: "skipped" };
  if (target < now + 20 * MINUTE) return undefined;
  const intent: Intent = { kind: "order", meal: ruleId, time: { kind: "at", hhmm: fmtTime(target) }, source: "on-device" };
  const built = buildRequest(intent, s, now);
  const result = search(built.req, { profile: s.profile, learned: s.learned, orders: s.orders, now });
  const option = result.options[0];
  if (!option) return undefined;
  const decideAt = Math.max(now, option.offer.placeAt - 4 * MINUTE);
  return { ...base, decideAt, option, state: "planned" };
}

export function refreshPlans(api: Api) {
  const s = api.get();
  const now = nowOf(s);
  const plans = s.autopilot.rules.map((r) => {
    const existing = s.autopilot.plans.find((p) => p.rule === r.id && p.day === s.calendar.day);
    if (existing && existing.state !== "planned") return existing;
    if (existing && existing.state === "planned") {
      const anchor = s.calendar.events.find((e) => e.id === existing.anchorEventId);
      if (anchor && anchor.end === existing.anchorEnd) return existing;
    }
    return planMeal(s, r.id, now);
  });
  api.update((x) => ({ ...x, autopilot: { ...x.autopilot, plans: plans.filter((p): p is AutopilotPlan => Boolean(p)) } }));
}

/** Called every few seconds: acts on plans whose decision time has come, and asks for ratings. */
export async function autopilotTick(api: Api) {
  const s = api.get();
  if (!s.onboarded || s.session.busy) return;
  const now = nowOf(s);

  const due = s.autopilot.plans.find((p) => p.state === "planned" && p.option && now >= p.decideAt);
  if (due?.option) {
    setSession(api, { busy: true });
    try {
      await actOnPlan(api, due);
    } finally {
      setSession(api, { busy: false });
    }
    return;
  }

  const delivered = s.orders.find((o) => o.source !== "history" && !o.rating && !o.cancelledAt && now >= o.arriveAt + 15 * MINUTE && !s.session.feedbackAsked.includes(o.id));
  if (delivered) {
    const { item } = itemById(delivered.itemId);
    api.update((x) => ({ ...x, session: { ...x.session, feedbackAsked: [...x.session.feedbackAsked, delivered.id] } }));
    addMessage(api, "agent", [
      { type: "text", text: `How was the ${item.name.toLowerCase()}? A quick rating helps me get the next one right.` },
      { type: "feedback", orderId: delivered.id, state: "open" },
    ], true);
  }
}

async function actOnPlan(api: Api, plan: AutopilotPlan) {
  const s = api.get();
  const option = plan.option!;
  const { item, restaurant } = itemById(option.offer.itemId);
  const anchor = s.calendar.events.find((e) => e.id === plan.anchorEventId);
  const activity = activityAfter(s.calendar.events, plan.target);
  const context = `${anchor ? `${anchor.title} ends at ${fmtTime(plan.anchorEnd)}` : "Your last meeting ends soon"}${activity ? `, and you have ${activity.title.toLowerCase()} at ${fmtTime(activity.start)}` : ""}.`;
  const limitIssue = spendIssue(s, option.offer.total);
  const msgId = addMessage(api, "agent", [], true);

  if (s.profile.autonomy === "auto" && !limitIssue) {
    say(api, msgId, `${context} Ordering ${plan.rule} now so it lands at ${fmtTime(option.offer.arriveAt)}: the **${item.name.toLowerCase()}** from ${restaurant.name}.`);
    await placeOrder(api, option, { source: "autopilot", meal: plan.rule, msgId, plan: plan.rule });
    return;
  }
  const blockId = uid("opts");
  const result: SearchResult = {
    request: buildRequest({ kind: "order", meal: plan.rule, time: { kind: "at", hhmm: fmtTime(plan.target) }, source: "on-device" }, s, nowOf(s)).req,
    scanned: { platforms: 0, restaurants: 0, dishes: 0, offers: 0 },
    perPlatform: [],
    options: [option],
    considered: 1,
    exclusions: [],
  };
  say(api, msgId, `${context} I've lined up the **${item.name.toLowerCase()}** from ${restaurant.name} to arrive at ${fmtTime(option.offer.arriveAt)}. I need to order in the next few minutes to make that time.`);
  if (limitIssue) pushBlock(api, msgId, { type: "note", tone: "warn", text: limitIssue });
  pushBlock(api, msgId, { type: "options", id: blockId, result });
  pushBlock(api, msgId, { type: "proposal", offerId: option.offer.id, resultBlockId: blockId, state: "open", label: `Order for ${fmtTime(option.offer.arriveAt)}` });
  api.update((x) => ({
    ...x,
    session: { ...x.session, pendingOfferId: option.offer.id, lastResult: result, lastRequest: result.request, lastOptionsBlockId: blockId },
    autopilot: { ...x.autopilot, plans: x.autopilot.plans.map((p) => (p.rule === plan.rule ? { ...p, state: "proposed", messageId: msgId } : p)) },
  }));
}

/** Presenter action: a meeting runs over. The agent moves dinner with it. */
export function extendMeeting(api: Api, eventId: string, minutes: number) {
  const s = api.get();
  const now = nowOf(s);
  const event = s.calendar.events.find((e) => e.id === eventId);
  if (!event) return;
  api.update((x) => ({ ...x, calendar: { ...x.calendar, events: x.calendar.events.map((e) => (e.id === eventId ? { ...e, end: e.end + minutes * MINUTE } : e)) } }));
  const plan = s.autopilot.plans.find((p) => p.anchorEventId === eventId);
  if (!plan) return;
  const newEnd = event.end + minutes * MINUTE;

  if (plan.state === "ordered" && plan.orderId) {
    const order = s.orders.find((o) => o.id === plan.orderId);
    if (!order) return;
    const { restaurant } = itemById(order.itemId);
    if (!canReschedule(order, now)) {
      addMessage(api, "agent", [{ type: "text", text: `${event.title} now runs until ${fmtTime(newEnd)}. Your food has already left ${restaurant.name}, so I can't move it. I've asked the courier to leave it at reception.` }], true);
      return;
    }
    const moved = shiftOrder(order, minutes, now);
    api.update((x) => ({
      ...x,
      orders: x.orders.map((o) => (o.id === order.id ? moved : o)),
      calendar: { ...x.calendar, events: x.calendar.events.map((e) => (e.id === `order-${order.id}` ? { ...e, start: moved.arriveAt, end: moved.arriveAt + 30 * MINUTE } : e)) },
      autopilot: { ...x.autopilot, plans: x.autopilot.plans.map((p) => (p.rule === plan.rule ? { ...p, anchorEnd: newEnd, target: p.target + minutes * MINUTE } : p)) },
    }));
    addMessage(api, "agent", [
      { type: "text", text: `${event.title} was extended to ${fmtTime(newEnd)}. I asked ${restaurant.name} to push your order back by ${minutes} minutes and they confirmed: it now arrives at **${fmtTime(moved.arriveAt)}**.` },
      { type: "order", orderId: order.id },
    ], true);
    return;
  }

  if (plan.state === "planned" || plan.state === "proposed") {
    api.update((x) => ({ ...x, autopilot: { ...x.autopilot, plans: x.autopilot.plans.filter((p) => p.rule !== plan.rule) } }));
    refreshPlans(api);
    const next = api.get().autopilot.plans.find((p) => p.rule === plan.rule);
    const text = next?.option
      ? `${event.title} now runs until ${fmtTime(newEnd)}, so I've moved ${plan.rule} to ${fmtTime(next.option.offer.arriveAt)}. I'll decide at ${fmtTime(next.decideAt)}.`
      : `${event.title} now runs until ${fmtTime(newEnd)}. I'll re-plan ${plan.rule} around it.`;
    addMessage(api, "agent", [{ type: "text", text }], true);
  }
}

/** First message after onboarding. */
export function welcome(api: Api) {
  refreshPlans(api);
  const s = api.get();
  const plan = s.autopilot.plans.find((p) => p.rule === "dinner" && p.state === "planned");
  const last = lastMeeting(s.calendar.events);
  const activity = last ? activityAfter(s.calendar.events, last.end) : undefined;
  const lines: string[] = [`You're all set, ${s.profile.name}.`];
  if (plan?.option && last) {
    const { item, restaurant } = itemById(plan.option.offer.itemId);
    lines.push(
      `I've looked at your calendar: ${last.title} ends at ${fmtTime(last.end)}${activity ? ` and you've got ${activity.title.toLowerCase()} at ${fmtTime(activity.start)}` : ""}. I've pencilled in the ${item.name.toLowerCase()} from ${restaurant.name} to arrive at ${fmtTime(plan.option.offer.arriveAt)}${activity ? ", light enough before the game" : ""}, and I'll check with you at ${fmtTime(plan.decideAt)} before ordering.`,
    );
  } else {
    lines.push("Tell me what you fancy and when, and I'll take it from there.");
  }
  addMessage(api, "agent", [
    { type: "text", text: lines.join(" ") },
    { type: "suggestions", items: ["A healthy bowl at 18:30", "Indian tonight, not too spicy", "Surprise me under £15", "What do you know about me?"] },
  ]);
}

/** "Order now" on a planned meal, from the Today screen. */
export async function orderPlanNow(api: Api, rule: AutopilotPlan["rule"]) {
  const s = api.get();
  const plan = s.autopilot.plans.find((p) => p.rule === rule);
  if (!plan?.option || s.session.busy) return;
  setSession(api, { busy: true });
  try {
    const { item } = itemById(plan.option.offer.itemId);
    addMessage(api, "user", [{ type: "text", text: `Order the planned ${rule} now: ${item.name.toLowerCase()}` }]);
    await placeOrder(api, plan.option, { source: "autopilot", meal: rule, plan: rule });
  } finally {
    setSession(api, { busy: false });
  }
}

export function skipPlan(api: Api, rule: AutopilotPlan["rule"]) {
  api.update((s) => ({ ...s, autopilot: { ...s.autopilot, plans: s.autopilot.plans.map((p) => (p.rule === rule ? { ...p, state: "skipped" } : p)) } }));
  addMessage(api, "agent", [{ type: "text", text: `Okay, no ${rule} order tonight. Ask me any time if you change your mind.` }]);
}

export function setRule(api: Api, rule: AutopilotPlan["rule"], patch: Partial<{ enabled: boolean; bufferMin: number }>) {
  api.update((s) => ({
    ...s,
    autopilot: {
      rules: s.autopilot.rules.map((r) => (r.id === rule ? { ...r, ...patch } : r)),
      plans: s.autopilot.plans.filter((p) => p.rule !== rule || p.state === "ordered"),
    },
  }));
  refreshPlans(api);
}
