// Shared vocabulary of the food agent: what restaurants sell, what the user wants,
// and what the agent finds, orders and pays for.

export type PlatformId = "deliveroo" | "ubereats" | "justeat" | "direct" | "phone";

export type Allergen = "gluten" | "dairy" | "egg" | "peanut" | "tree-nut" | "sesame" | "soy" | "fish" | "shellfish";

export type DietPattern = "omnivore" | "pescatarian" | "vegetarian" | "vegan";

/** What an individual dish is, from a diet point of view. */
export type DishDiet = "meat" | "fish" | "vegetarian" | "vegan";

export type Tag = "healthy" | "high-protein" | "low-carb" | "light" | "comfort" | "spicy" | "vegan" | "vegetarian" | "gluten-free";

export type DishType =
  | "bowl"
  | "salad"
  | "burger"
  | "pizza"
  | "curry"
  | "noodles"
  | "sushi"
  | "wrap"
  | "tacos"
  | "pasta"
  | "sandwich"
  | "soup"
  | "grill"
  | "rice"
  | "bao";

export type Cuisine =
  | "japanese"
  | "healthy"
  | "indian"
  | "taiwanese"
  | "italian"
  | "lebanese"
  | "vietnamese"
  | "mexican"
  | "burgers"
  | "korean"
  | "pizza"
  | "thai"
  | "british";

export type Priority = "taste" | "health" | "price" | "speed";
export type Weights = Record<Priority, number>;

/** How much the agent may do on its own. */
export type Autonomy = "suggest" | "confirm" | "auto";

export type MealSlot = "breakfast" | "lunch" | "dinner";
export type Fulfilment = "delivery" | "collection";

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  /** Price on the restaurant's own menu, in GBP. Marketplaces add a markup. */
  price: number;
  type: DishType;
  diet: DishDiet;
  tags: Tag[];
  allergens: Allergen[];
  /** Notable ingredients, matched against the user's dislikes. */
  contains: string[];
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Colours of the main ingredients, used to draw the dish. */
  palette: string[];
}

export interface Listing {
  platform: PlatformId;
  /** Menu price multiplier on this platform (marketplaces often charge more). */
  markup: number;
  /** Extra minutes this platform usually adds on top of the kitchen and travel time. */
  etaExtra: number;
}

export interface Restaurant {
  id: string;
  name: string;
  cuisine: Cuisine;
  area: string;
  blurb: string;
  rating: number;
  reviews: number;
  priceLevel: 1 | 2 | 3;
  distanceKm: number;
  prepMin: number;
  /** Opening hours as decimal hours, e.g. [11.5, 22]. */
  hours: [number, number];
  listings: Listing[];
  phone?: string;
  /** Brand colour for the restaurant mark. */
  tint: string;
  menu: MenuItem[];
}

export interface Platform {
  id: PlatformId;
  name: string;
  kind: "marketplace" | "direct" | "phone";
  dot: string;
  /** Delivery fee in GBP for a distance in km. */
  deliveryFee: (km: number) => number;
  serviceRate: number;
  serviceMin: number;
  serviceMax: number;
  smallOrder: { under: number; fee: number };
  /** Share of orders that arrive on time; feeds the agent's timing confidence. */
  onTime: number;
  collection: boolean;
  delivery: boolean;
  /** Where USDC for orders on this platform is settled (mock merchant address). */
  settlement: string;
}

// ── What the user asked for ───────────────────────────────────────────────────

export type TimeSpec =
  | { kind: "asap" }
  | { kind: "at"; hhmm: string }
  | { kind: "in"; minutes: number }
  | { kind: "after_last_meeting"; bufferMin?: number };

export type Refinement = "cheaper" | "faster" | "healthier" | "different" | "filling";

export type IntentKind =
  | "order"
  | "confirm"
  | "decline"
  | "select"
  | "refine"
  | "cancel"
  | "status"
  | "profile"
  | "reorder"
  | "autopilot"
  | "help"
  | "thanks"
  | "unknown";

export interface Intent {
  kind: IntentKind;
  meal?: MealSlot;
  dishTypes?: DishType[];
  cuisines?: Cuisine[];
  tags?: Tag[];
  avoidTags?: Tag[];
  /** Ingredients to leave out this time, e.g. "no mushrooms". */
  avoidIngredients?: string[];
  time?: TimeSpec;
  budget?: number;
  partySize?: number;
  fulfilment?: Fulfilment;
  selectIndex?: number;
  refine?: Refinement;
  restaurantId?: string;
  surprise?: boolean;
  /** The words that described the food, for "Matches 'healthy bowl'". */
  phrase?: string;
  source: "on-device" | "model";
}

// ── The user ──────────────────────────────────────────────────────────────────

export interface Profile {
  name: string;
  address: { label: string; line: string };
  weights: Weights;
  diet: DietPattern;
  allergies: Allergen[];
  dislikes: string[];
  goal: "balanced" | "high-protein" | "low-carb" | "light";
  cuisines: Cuisine[];
  budget: Record<MealSlot, number>;
  mealTimes: Record<MealSlot, string>;
  autonomy: Autonomy;
  limits: { perOrder: number; weekly: number };
  calendarConnected: boolean;
  platformsConnected: PlatformId[];
  phoneOrdering: boolean;
}

export interface Affinity {
  /** -1 (dislikes) … 1 (loves). */
  score: number;
  /** How many signals it is based on. */
  n: number;
}

export interface LearningEvent {
  at: number;
  text: string;
  kind: "rating" | "choice" | "pattern" | "setting";
}

export interface Learned {
  cuisine: Partial<Record<Cuisine, Affinity>>;
  restaurant: Record<string, Affinity>;
  item: Record<string, { rating: number; n: number; lastAt: number }>;
  tags: Partial<Record<Tag, Affinity>>;
  /** Late deliveries per platform. */
  platform: Partial<Record<PlatformId, { late: number; n: number }>>;
  events: LearningEvent[];
  ratings: number;
}

// ── What the agent finds ──────────────────────────────────────────────────────

export interface Offer {
  id: string;
  restaurantId: string;
  itemId: string;
  platform: PlatformId;
  fulfilment: Fulfilment;
  qty: number;
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  smallOrderFee: number;
  total: number;
  /** When the agent must place the order, when it is ready and when it arrives (ms). */
  placeAt: number;
  readyAt: number;
  arriveAt: number;
  /** Minutes away from the requested time (negative = early). 0 for "as soon as possible". */
  minutesOff: number;
}

export interface Alternative {
  platform: PlatformId;
  total: number;
  arriveAt: number;
}

export interface RankedOption {
  offer: Offer;
  /** 0–100. */
  score: number;
  parts: Record<Priority, number>;
  reasons: string[];
  alternatives: Alternative[];
}

export type ExclusionReason = "closed" | "diet" | "allergen" | "dislike" | "mismatch" | "late" | "budget" | "skipped" | "channel";

export interface Exclusion {
  reason: ExclusionReason;
  count: number;
  examples: string[];
}

export interface SearchRequest {
  meal: MealSlot;
  /** Target arrival time in ms, or null for as soon as possible. */
  target: number | null;
  fulfilment: Fulfilment;
  /** Per person, GBP. */
  budget: number;
  partySize: number;
  dishTypes: DishType[];
  cuisines: Cuisine[];
  tags: Tag[];
  avoidTags: Tag[];
  avoidIngredients: string[];
  restaurantId?: string;
  excludeRestaurants: string[];
  weights: Weights;
  phrase?: string;
  /** Why the weights differ from the profile this time, shown to the user. */
  weightNote?: string;
}

export interface SearchResult {
  request: SearchRequest;
  scanned: { platforms: number; restaurants: number; dishes: number; offers: number };
  perPlatform: { platform: PlatformId; restaurants: number; dishes: number }[];
  options: RankedOption[];
  considered: number;
  exclusions: Exclusion[];
}

// ── Orders and payments ───────────────────────────────────────────────────────

export interface Payment {
  status: "confirmed" | "failed";
  network: "solana-devnet";
  amountUsdc: number;
  rate: number;
  signature?: string;
  /** True when no real devnet transaction was sent (demo mode). */
  simulated: boolean;
  to: string;
  memo: string;
  at: number;
  error?: string;
}

export interface CallLine {
  who: "agent" | "venue";
  text: string;
}

export type OrderStage = "scheduled" | "placed" | "accepted" | "preparing" | "on-the-way" | "ready" | "delivered" | "collected" | "cancelled";

export interface Order {
  id: string;
  restaurantId: string;
  itemId: string;
  qty: number;
  platform: PlatformId;
  fulfilment: Fulfilment;
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  smallOrderFee: number;
  total: number;
  placedAt: number;
  acceptedAt: number;
  prepAt: number;
  pickedUpAt: number;
  arriveAt: number;
  /** Original arrival before any reschedule. */
  originalArriveAt?: number;
  cancelledAt?: number;
  payment?: Payment;
  call?: CallLine[];
  rating?: number;
  feedback?: string[];
  source: "chat" | "autopilot" | "history";
  meal: MealSlot;
  note?: string;
}

// ── Calendar and autopilot ────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  title: string;
  start: number;
  end: number;
  kind: "meeting" | "focus" | "meal" | "personal";
  where?: string;
  /** Activities that make a lighter meal sensible beforehand. */
  active?: boolean;
}

export interface AutopilotRule {
  id: "lunch" | "dinner";
  enabled: boolean;
  bufferMin: number;
  /** Window the meal must land in, decimal hours. */
  window: [number, number];
}

export interface AutopilotPlan {
  rule: AutopilotRule["id"];
  day: string;
  /** End of the last meeting the plan is anchored to. */
  anchorEventId: string;
  anchorEnd: number;
  target: number;
  decideAt: number;
  option?: RankedOption;
  state: "planned" | "proposed" | "ordered" | "skipped";
  orderId?: string;
  messageId?: string;
}
