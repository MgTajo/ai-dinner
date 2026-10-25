import { address, createSolanaRpc } from "@solana/kit";
import type { Express } from "express";
import { askModelJson, modelLabel, provider } from "../lib/ai/model.js";
import { loadAgentSigner } from "../lib/payments/client.js";
import { USDC_DEVNET_MINT } from "../lib/payments/config.js";
import { payUsdc } from "../lib/payments/transfer.js";
import { usdToMicros } from "../lib/spending/policy.js";
import { SpendingTracker } from "../lib/spending/tracker.js";

// Endpoints for Sous, the food agent app:
//   GET  /api/food/status      what this server can do (Gemini? live devnet payments?)
//   POST /api/food/understand  turns a chat message into a structured food intent (Gemini or local model)
//   POST /api/food/pay         pays a restaurant for a confirmed order in devnet USDC
// The app works without this server (on-device parser, simulated settlement); with it, the
// agent understands free-form requests better and every order settles on Solana devnet.

const RPC = () => createSolanaRpc(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com");

/** Live orders need a funded wallet: below this, the app falls back to simulated settlement. */
const MIN_LIVE_USDC = Number(process.env.FOOD_MIN_LIVE_USDC || 20);

let foodTracker: SpendingTracker | null = null;
function tracker(): SpendingTracker {
  foodTracker ??= new SpendingTracker({
    budgetMicros: usdToMicros(process.env.FOOD_BUDGET_USDC || "300"),
    maxPaymentMicros: usdToMicros(process.env.FOOD_MAX_ORDER_USDC || "60"),
  });
  return foodTracker;
}

function merchantAddress(): string | undefined {
  return process.env.FOOD_MERCHANT_ADDRESS?.trim() || process.env.PAY_TO_ADDRESS?.trim() || undefined;
}

interface PaymentsStatus {
  live: boolean;
  agent?: string;
  balanceUsdc?: number;
  reason?: string;
}

let cached: { at: number; value: PaymentsStatus } | null = null;

async function paymentsStatus(): Promise<PaymentsStatus> {
  if (cached && Date.now() - cached.at < 15_000) return cached.value;
  let value: PaymentsStatus;
  try {
    const signer = await loadAgentSigner();
    const rpc = RPC();
    const [{ value: lamports }, { value: accounts }] = await Promise.all([
      rpc.getBalance(signer.address).send(),
      rpc.getTokenAccountsByOwner(signer.address, { mint: address(USDC_DEVNET_MINT) }, { encoding: "jsonParsed" }).send(),
    ]);
    const info = accounts[0]?.account.data.parsed.info as { tokenAmount: { uiAmountString: string } } | undefined;
    const usdc = info ? Number(info.tokenAmount.uiAmountString) : 0;
    const sol = Number(lamports) / 1e9;
    const merchant = merchantAddress();
    const reason = !merchant
      ? "No merchant address: set PAY_TO_ADDRESS on the companion server."
      : sol < 0.002
        ? "The agent wallet has no devnet SOL for fees yet (faucet.solana.com)."
        : usdc < MIN_LIVE_USDC
          ? `The agent wallet has ${usdc.toFixed(2)} devnet USDC; live orders need at least ${MIN_LIVE_USDC} (faucet.circle.com).`
          : undefined;
    value = { live: !reason, agent: signer.address, balanceUsdc: usdc, reason };
  } catch (err) {
    value = { live: false, reason: err instanceof Error ? err.message : String(err) };
  }
  cached = { at: Date.now(), value };
  return value;
}

const INTENT_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["order", "confirm", "decline", "select", "refine", "cancel", "status", "profile", "reorder", "autopilot", "help", "thanks", "unknown"] },
    meal: { type: "string", enum: ["breakfast", "lunch", "dinner"] },
    dishTypes: { type: "array", items: { type: "string", enum: ["bowl", "salad", "burger", "pizza", "curry", "noodles", "sushi", "wrap", "tacos", "pasta", "sandwich", "soup", "grill", "rice", "bao"] } },
    cuisines: { type: "array", items: { type: "string", enum: ["japanese", "healthy", "indian", "taiwanese", "italian", "lebanese", "vietnamese", "mexican", "burgers", "korean", "pizza", "thai", "british"] } },
    tags: { type: "array", items: { type: "string", enum: ["healthy", "high-protein", "low-carb", "light", "comfort", "spicy", "vegan", "vegetarian", "gluten-free"] } },
    avoidTags: { type: "array", items: { type: "string", enum: ["spicy", "comfort"] } },
    avoidIngredients: { type: "array", items: { type: "string" } },
    time: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["asap", "at", "in", "after_last_meeting"] },
        hhmm: { type: "string", description: "24-hour time, e.g. 18:30, when kind is at" },
        minutes: { type: "number", description: "when kind is in" },
      },
      required: ["kind"],
    },
    budget: { type: "number", description: "Maximum per person in GBP, only if the user said one" },
    partySize: { type: "integer" },
    fulfilment: { type: "string", enum: ["delivery", "collection"] },
    selectIndex: { type: "integer", description: "1-based option number for kind=select" },
    refine: { type: "string", enum: ["cheaper", "faster", "healthier", "different", "filling"] },
    surprise: { type: "boolean" },
  },
  required: ["kind"],
};

const SYSTEM = `You read messages sent to Sous, an AI agent that finds, orders and pays for food. Turn each message into the intent JSON.
Kinds: order (wants food), confirm (yes to a pending suggestion), decline (no to it), select (picks option N from a shortlist), refine (cheaper/faster/healthier/different/more filling than the last shortlist), cancel (cancel an order), status (where is my food), profile (what do you know about me), reorder (the usual / same as last time), autopilot (order automatically on a schedule), help, thanks, unknown.
Only fill fields the message actually says. If the message states new food requirements (even with "actually" or "instead"), it is kind order, not refine. "Healthy" goes in tags. "Nothing fried / not heavy" is avoidTags comfort. "For me and a colleague" is partySize 2. "After my last meeting" / "when I'm done with work" is time.kind after_last_meeting. Times are 24-hour; evening times without am/pm are pm. "Not spicy" goes in avoidTags.`;

export default function register(app: Express) {
  app.get("/api/food/status", async (_req, res) => {
    const [label, payments] = await Promise.all([modelLabel(), paymentsStatus()]);
    res.json({ ai: Boolean(label), model: label, payments });
  });

  app.post("/api/food/understand", async (req, res) => {
    const body = req.body as { message?: unknown; now?: unknown; hasOptions?: unknown; hasPending?: unknown } | undefined;
    const message = typeof body?.message === "string" ? body.message.trim().slice(0, 600) : "";
    if (!message) {
      res.status(400).json({ error: 'Send JSON like { "message": "A healthy bowl at 18:30" }' });
      return;
    }
    if (!(await provider())) {
      res.status(503).json({ error: "No AI model is available." });
      return;
    }
    const at = typeof body?.now === "number" ? new Date(body.now) : new Date();
    const context = `Current time: ${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}. ${body?.hasOptions ? "The user has a shortlist on screen." : ""} ${body?.hasPending ? "A suggestion is waiting for a yes or no." : ""}`;
    try {
      const intent = await askModelJson(`${context}\n\nMessage: ${message}`, INTENT_SCHEMA, SYSTEM);
      res.json({ intent });
    } catch (err) {
      console.error("Intent extraction failed:", err);
      res.status(502).json({ error: "The model request failed." });
    }
  });

  app.post("/api/food/pay", async (req, res) => {
    const body = req.body as { orderId?: unknown; amountUsdc?: unknown; platform?: unknown; restaurant?: unknown } | undefined;
    const orderId = typeof body?.orderId === "string" ? body.orderId : "";
    const amountUsdc = Number(body?.amountUsdc);
    if (!/^SO-\d{4}$/.test(orderId) || !(amountUsdc > 0)) {
      res.status(400).json({ error: "Send { orderId: 'SO-1234', amountUsdc: 12.5 }" });
      return;
    }
    const status = await paymentsStatus();
    const to = merchantAddress();
    if (!status.live || !to) {
      res.status(503).json({ error: status.reason ?? "Live payments are not set up." });
      return;
    }
    try {
      const signer = await loadAgentSigner();
      const { signature } = await payUsdc(signer, { to, amountUsdc: Math.round(amountUsdc * 100) / 100, memo: `sous:${orderId}` }, { guard: tracker() });
      cached = null;
      console.log(`[food] ${orderId}: paid ${amountUsdc} USDC to ${to} for ${String(body?.restaurant ?? "")} (${signature})`);
      res.json({ signature, to, amountUsdc });
    } catch (err) {
      console.error("Food payment failed:", err);
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
