import { restaurants } from "./data/restaurants";
import type { Cuisine, DishType, Intent, MealSlot, Refinement, Tag, TimeSpec } from "./types";

// On-device language understanding. When the companion server has a Gemini key the agent asks
// Gemini for the same Intent shape (lib/agent/understand.ts); this parser is the fallback and
// is good enough for the requests people actually make to a food agent.

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, couple: 2 };
const ORDINALS: Record<string, number> = { first: 1, "1st": 1, second: 2, "2nd": 2, third: 3, "3rd": 3, last: 3, top: 1 };

const DISH_WORDS: [RegExp, DishType][] = [
  [/\b(bowls?|poke|buddha bowl|grain bowl)\b/, "bowl"],
  [/\bsalads?\b/, "salad"],
  [/\bburgers?\b/, "burger"],
  [/\bpizzas?\b/, "pizza"],
  [/\b(curry|curries|tikka|masala|dal|dhal|korma)\b/, "curry"],
  [/\b(noodles?|ramen|pho|udon|pad thai)\b/, "noodles"],
  [/\b(sushi|nigiri|maki|sashimi)\b/, "sushi"],
  [/\b(wraps?|shawarma|burrito)\b/, "wrap"],
  [/\btacos?\b/, "tacos"],
  [/\b(pasta|spaghetti|carbonara|ragu|ragù|pesto)\b/, "pasta"],
  [/\b(sandwich|sando|sub)\b/, "sandwich"],
  [/\bsoup\b/, "soup"],
  [/\b(steak|grill|bbq|barbecue|kebab|fried chicken)\b/, "grill"],
  [/\b(bao|buns?)\b/, "bao"],
  [/\b(fried rice|biryani|donburi|rice bowl)\b/, "rice"],
];

const CUISINE_WORDS: [RegExp, Cuisine][] = [
  [/\b(japanese|sushi|poke|teriyaki)\b/, "japanese"],
  [/\b(indian|curry|tikka|masala|tandoori|dal)\b/, "indian"],
  [/\b(italian|pasta)\b/, "italian"],
  [/\b(thai|pad thai|green curry)\b/, "thai"],
  [/\b(vietnamese|pho|banh mi)\b/, "vietnamese"],
  [/\b(korean|bibimbap)\b/, "korean"],
  [/\b(mexican|tacos?|burrito)\b/, "mexican"],
  [/\b(lebanese|middle eastern|mezze|shawarma|falafel)\b/, "lebanese"],
  [/\b(taiwanese|chinese|bao)\b/, "taiwanese"],
];

const TAG_WORDS: [RegExp, Tag][] = [
  [/\b(healthy|healthier|clean|nutritious|fresh|wholesome|nourishing)\b/, "healthy"],
  [/\b(light|lighter|not too heavy|small)\b/, "light"],
  [/\b(protein|high[- ]protein|post[- ]workout|gym)\b/, "high-protein"],
  [/\b(low[- ]carb|keto|no carbs?)\b/, "low-carb"],
  [/\b(vegan|plant[- ]based)\b/, "vegan"],
  [/\b(vegetarian|veggie|meat[- ]free|no meat)\b/, "vegetarian"],
  [/\b(gluten[- ]free|coeliac|celiac)\b/, "gluten-free"],
  [/\b(comfort|treat|cheat|indulgent|junk|greasy|hangover|filthy)\b/, "comfort"],
  [/\b(spicy|hot|fiery)\b/, "spicy"],
];

function words(text: string, list: [RegExp, string][]): string[] {
  return [...new Set(list.filter(([re]) => re.test(text)).map(([, v]) => v))];
}

function num(token: string): number | undefined {
  if (/^\d+$/.test(token)) return Number(token);
  return NUMBER_WORDS[token];
}

function parseTime(text: string): TimeSpec | undefined {
  if (/\b(after|when|once) (my |the )?(last )?(meeting|call|work)s?\b|\bafter work\b|\bend of (my|the) day\b|\bwhen i'?m (done|free)\b/.test(text)) {
    return { kind: "after_last_meeting" };
  }
  if (/\b(now|asap|right away|straight away|as soon as possible|quick(ly)?|fast|starving|hungry now)\b/.test(text)) return { kind: "asap" };
  const inMatch = text.match(/\bin (\d+|an?|half an?) ?(min(ute)?s?|hours?|h)\b/);
  if (inMatch) {
    const n = inMatch[1].startsWith("half") ? 30 : /^an?$/.test(inMatch[1]) ? 1 : Number(inMatch[1]);
    const minutes = inMatch[2].startsWith("h") && !inMatch[1].startsWith("half") ? n * 60 : n;
    return { kind: "in", minutes };
  }
  const hm = text.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*(am|pm)?\b/);
  if (hm) {
    let h = Number(hm[1]);
    if (hm[3] === "pm" && h < 12) h += 12;
    if (hm[3] === "am" && h === 12) h = 0;
    if (!hm[3] && h < 8) h += 12; // "7.30" for dinner means 19:30
    return { kind: "at", hhmm: `${String(h).padStart(2, "0")}:${hm[2]}` };
  }
  const ampm = text.match(/\b(1[0-2]|[1-9])\s*(am|pm)\b/) ?? text.match(/\b(?:at|for|by|around) (1[0-2]|[1-9])(?! ?(?:people|of us|persons|min))\b/);
  if (ampm) {
    let h = Number(ampm[1]);
    const suffix = ampm[2];
    if (suffix === "pm" || (!suffix && h < 11)) h = h === 12 ? 12 : h + 12;
    return { kind: "at", hhmm: `${String(h).padStart(2, "0")}:00` };
  }
  const halfPast = text.match(/\bhalf (?:past )?(\w+)\b/);
  if (halfPast && num(halfPast[1])) {
    const h = num(halfPast[1])!;
    return { kind: "at", hhmm: `${String(h < 11 ? h + 12 : h).padStart(2, "0")}:30` };
  }
  return undefined;
}

function parseMeal(text: string): MealSlot | undefined {
  if (/\b(breakfast|brunch)\b/.test(text)) return "breakfast";
  if (/\blunch\b/.test(text)) return "lunch";
  if (/\b(dinner|supper|tonight|this evening|tea)\b/.test(text)) return "dinner";
  return undefined;
}

const RESTAURANT_ALIASES = restaurants.map((r) => ({ id: r.id, re: new RegExp(`\\b${r.name.toLowerCase().replace(/[’']/g, "'?").replace(/&/g, "(&|and)").replace(/\s+/g, "\\s*")}\\b`) }));

export function parseIntent(raw: string): Intent {
  const text = ` ${raw.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim()} `;
  const base = { source: "on-device" as const };

  if (/^\s*(thanks|thank you|cheers|great|perfect|lovely|nice|ta)[.! ]*$/.test(text)) return { ...base, kind: "thanks" };
  if (/^\s*(yes|yep|yeah|yup|sure|ok|okay|go ahead|do it|order it|book it|sounds good|please do|confirm|let'?s do (it|that)|go for it)\b/.test(text) && text.trim().split(" ").length <= 6) {
    return { ...base, kind: "confirm" };
  }
  if (/^\s*(no|nope|not now|skip( it)?|nah|not tonight|maybe later)[.! ]*$/.test(text)) return { ...base, kind: "decline" };
  if (/\b(cancel|stop the order|call it off)\b/.test(text)) return { ...base, kind: "cancel" };
  if (/\b(where'?s|where is|status|track|how long|eta|is it (here|coming))\b/.test(text) && /\b(order|food|dinner|lunch|it|courier|rider)\b/.test(text)) return { ...base, kind: "status" };
  if (/\b(what do you know|what have you learn(ed|t)|my (taste )?profile|my preferences|what do i like|about me)\b/.test(text)) return { ...base, kind: "profile" };
  if (/\b(help|what can you do|how does this work)\b/.test(text)) return { ...base, kind: "help" };

  const ordinal = text.match(/\b(first|second|third|1st|2nd|3rd|last|top) (one|option|pick)\b|\b(?:option|number|#) ?(\d)\b/);
  if (ordinal && text.trim().split(" ").length <= 7) {
    const idx = ordinal[1] ? ORDINALS[ordinal[1]] : Number(ordinal[3]);
    if (idx) return { ...base, kind: "select", selectIndex: idx };
  }

  let refine: Refinement | undefined;
  if (/\b(cheaper|less expensive|too expensive|lower price|save money)\b/.test(text)) refine = "cheaper";
  else if (/\b(faster|sooner|quicker|earlier)\b/.test(text)) refine = "faster";
  else if (/\b(healthier|lighter)\b/.test(text)) refine = "healthier";
  else if (/\b(more filling|bigger|heartier|more food)\b/.test(text)) refine = "filling";
  else if (/\b(something else|other options?|different|not (that|those|these)|anything else|show me more)\b/.test(text)) refine = "different";
  if (refine && text.trim().split(" ").length <= 8 && !words(text, DISH_WORDS as [RegExp, string][]).length) return { ...base, kind: "refine", refine };

  const time = parseTime(text);
  const dishTypes = words(text, DISH_WORDS as [RegExp, string][]) as DishType[];
  const cuisines = words(text, CUISINE_WORDS as [RegExp, string][]) as Cuisine[];
  const negSpicy = /\b(not (too )?spicy|no spice|mild|not hot)\b/.test(text);
  let tags = words(text, TAG_WORDS as [RegExp, string][]) as Tag[];
  if (negSpicy) tags = tags.filter((t) => t !== "spicy");
  const avoidTags: Tag[] = negSpicy ? ["spicy"] : [];
  if (/\b(nothing|not|no|without) (fried|greasy|heavy|too heavy|junk)\b/.test(text)) {
    avoidTags.push("comfort");
    tags = tags.filter((t) => t !== "comfort");
  }
  const avoidIngredients = [...text.matchAll(/\bno ([a-z]+?)s?\b(?! (spice|meat|carbs?))/g)]
    .map((m) => m[1])
    .filter((w) => !["thanks", "rush", "need", "worries", "problem", "idea", "preference", "meeting", "more", "one", "longer"].includes(w));
  const budgetMatch = text.match(/(?:under|below|less than|max(?:imum)?|up to|budget(?: of)?|no more than|within)\s*£?\s*(\d+(?:\.\d{1,2})?)/) ?? text.match(/£\s*(\d+(?:\.\d{1,2})?)/);
  const partyMatch = text.match(/\bfor (\w+)(?: people| of us| persons)?\b/);
  let partySize: number | undefined;
  if (partyMatch && num(partyMatch[1]) && num(partyMatch[1])! <= 10 && !/\b(for \d+ ?(min|minutes|hours?))\b/.test(text)) partySize = num(partyMatch[1]);
  if (/\bfor (me and|us two|the two of us)\b/.test(text)) partySize = 2;
  const restaurantId = RESTAURANT_ALIASES.find((r) => r.re.test(text))?.id;
  const fulfilment = /\b(pick ?up|collect|collection|on my way|grab it)\b/.test(text) ? ("collection" as const) : undefined;
  const surprise = /\b(surprise me|anything|whatever|you choose|you pick|dealer'?s choice|up to you)\b/.test(text);

  if (/\b(every|each) (day|weekday|evening|night)\b|\bautomatically\b|\bautopilot\b|\balways order\b/.test(text)) {
    return { ...base, kind: "autopilot", meal: parseMeal(text) ?? "dinner", time };
  }
  if (/\b(the usual|usual order|same as (last|yesterday|before)|again|reorder|repeat (my|the) last)\b/.test(text)) {
    return { ...base, kind: "reorder", meal: parseMeal(text), time, restaurantId };
  }

  const meal = parseMeal(text);
  const foodSignal =
    dishTypes.length || cuisines.length || tags.length || restaurantId || surprise || meal || budgetMatch || time ||
    /\b(hungry|order|food|eat|get me|i want|i'?d like|craving|fancy|feed me|find me|something)\b/.test(text);
  if (!foodSignal) return { ...base, kind: refine ? "refine" : "unknown", refine };

  return {
    ...base,
    kind: "order",
    meal,
    dishTypes,
    cuisines: dishTypes.length && cuisines.length === 1 && ["japanese", "indian", "italian", "mexican", "vietnamese", "lebanese", "taiwanese"].includes(cuisines[0]) && implied(dishTypes, cuisines[0]) ? [] : cuisines,
    tags,
    avoidTags,
    avoidIngredients,
    time,
    budget: budgetMatch ? Number(budgetMatch[1]) : undefined,
    partySize,
    fulfilment,
    restaurantId,
    surprise,
  };
}

/** "sushi" implies Japanese, "pho" Vietnamese: keep the dish type, drop the redundant cuisine filter. */
function implied(dishTypes: DishType[], cuisine: Cuisine): boolean {
  const map: Partial<Record<Cuisine, DishType[]>> = {
    japanese: ["sushi"],
    italian: ["pasta", "pizza"],
    mexican: ["tacos", "wrap"],
    vietnamese: ["noodles"],
    indian: ["curry"],
    lebanese: ["wrap", "grill"],
    taiwanese: ["bao"],
  };
  return dishTypes.every((d) => map[cuisine]?.includes(d));
}
