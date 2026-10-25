import { buildCalendar } from "../agent/data/calendar";
import { emptyLearned } from "../agent/learn";
import { dayKey, scenarioClock, type ClockState } from "../agent/time";
import type {
  AutopilotPlan,
  AutopilotRule,
  CalendarEvent,
  CallLine,
  Learned,
  Order,
  PlatformId,
  Profile,
  SearchRequest,
  SearchResult,
} from "../agent/types";

// Everything the app remembers. Persisted to device storage (see StoreProvider), except
// `runtime`, which is re-detected on every start.

export interface TraceItem {
  label: string;
  meta?: string;
  dot?: string;
}

export interface TraceStep {
  id: string;
  label: string;
  detail?: string;
  status: "running" | "done" | "warn";
  ms?: number;
  items?: TraceItem[];
}

export type Block =
  | { type: "trace"; id: string; steps: TraceStep[]; done: boolean; startedAt: number; endedAt?: number; title?: string }
  | { type: "text"; text: string }
  | { type: "options"; id: string; result: SearchResult; chosenOfferId?: string }
  | { type: "proposal"; offerId: string; resultBlockId: string; state: "open" | "accepted" | "declined"; label?: string }
  | { type: "call"; restaurantId: string; phone: string; lines: CallLine[]; state: "dialing" | "talking" | "ended"; seconds?: number }
  | { type: "order"; orderId: string }
  | { type: "feedback"; orderId: string; state: "open" | "done"; rating?: number }
  | { type: "note"; text: string; tone: "learn" | "info" | "warn" }
  | { type: "profile" }
  | { type: "suggestions"; items: string[] };

export interface Message {
  id: string;
  role: "user" | "agent";
  at: number;
  blocks: Block[];
  proactive?: boolean;
}

export interface WalletTx {
  id: string;
  at: number;
  kind: "payment" | "deposit" | "refund";
  amountUsdc: number;
  label: string;
  orderId?: string;
  signature?: string;
  simulated: boolean;
  to?: string;
}

export interface Runtime {
  companion: "checking" | "online" | "offline";
  ai: "model" | "on-device";
  aiLabel?: string;
  payments: "live" | "simulated";
  agentAddress?: string;
  liveBalanceUsdc?: number;
  paymentsReason?: string;
}

export interface Session {
  lastResult?: SearchResult;
  lastRequest?: SearchRequest;
  lastOptionsBlockId?: string;
  pendingOfferId?: string;
  feedbackAsked: string[];
  busy: boolean;
}

export interface AppState {
  version: number;
  onboarded: boolean;
  profile: Profile;
  learned: Learned;
  orders: Order[];
  messages: Message[];
  session: Session;
  wallet: { address: string; balanceUsdc: number; txs: WalletTx[] };
  clock: ClockState;
  calendar: { day: string; events: CalendarEvent[] };
  autopilot: { rules: AutopilotRule[]; plans: AutopilotPlan[] };
  presenter: boolean;
  runtime: Runtime;
}

export const STATE_VERSION = 4;

/** A ready-made profile, so onboarding can be clicked through in a demo. */
export const defaultProfile: Profile = {
  name: "Magnus",
  address: { label: "Home", line: "Mill Road, Cambridge CB1" },
  weights: { taste: 0.34, health: 0.28, price: 0.22, speed: 0.16 },
  diet: "omnivore",
  allergies: ["peanut"],
  dislikes: ["mushroom"],
  goal: "high-protein",
  cuisines: ["japanese", "healthy", "vietnamese", "lebanese"],
  budget: { breakfast: 10, lunch: 14, dinner: 18 },
  mealTimes: { breakfast: "08:00", lunch: "12:30", dinner: "19:00" },
  autonomy: "confirm",
  limits: { perOrder: 25, weekly: 120 },
  calendarConnected: true,
  platformsConnected: ["deliveroo", "ubereats", "justeat"] as PlatformId[],
  phoneOrdering: true,
};

export const defaultRules: AutopilotRule[] = [
  { id: "lunch", enabled: true, bufferMin: 10, window: [11.5, 14.5] },
  { id: "dinner", enabled: true, bufferMin: 10, window: [17, 21] },
];

/** Demo agent wallet used when the companion server can't pay on devnet. */
export const DEMO_WALLET = "8AsfsLZc1VFRurFBUcoZ2RyMTeQ3UBszuLebSL9sfGeN";

export function initialState(realNow = Date.now()): AppState {
  const clock = scenarioClock(realNow);
  return {
    version: STATE_VERSION,
    onboarded: false,
    profile: defaultProfile,
    learned: emptyLearned(),
    orders: [],
    messages: [],
    session: { feedbackAsked: [], busy: false },
    wallet: { address: DEMO_WALLET, balanceUsdc: 0, txs: [] },
    clock,
    calendar: { day: dayKey(clock.anchorScenario), events: buildCalendar(clock.anchorScenario) },
    autopilot: { rules: defaultRules, plans: [] },
    presenter: true,
    runtime: { companion: "checking", ai: "on-device", payments: "simulated" },
  };
}

let counter = 0;
export function uid(prefix = "id"): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}
