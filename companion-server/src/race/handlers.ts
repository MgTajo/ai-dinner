// Your race logic. The verifier sends one task at a time; each function below answers one task type.
// Return the output (text, data, toolResults) or throw a TaskError. adapter.ts does the rest:
// checking the verifier token, echoing the nonce and wrapping your answer in the ASRP/1 envelope.
//
// The model is Gemini when a key is set, otherwise a local open model in Ollama (src/lib/ai/model.ts).
// The same agent powers Sous, the food agent: it calls tools, keeps per-session memory and pays on
// Solana devnet within spending limits.
import { arithmeticAnswer } from "../lib/ai/math.js";
import { askModel, askModelJson, provider } from "../lib/ai/model.js";
import { getSpendingTracker } from "../lib/paidapi/buyer.js";
import { loadAgentSigner } from "../lib/payments/client.js";
import { payUsdc, TransferError } from "../lib/payments/transfer.js";
import { runToolAgent, structuredFromRun } from "./agent.js";
import { memory } from "./memory.js";
import { TaskError, type Task, type TaskOutput, type TaskRequest, type TaskType } from "./protocol.js";
import { searchSource, ToolCallError } from "./tools.js";

type Handler = ((task: Task, request: TaskRequest) => Promise<TaskOutput>) & { notImplemented?: boolean };

const inputText = (task: Task): string => (typeof task.input === "string" ? task.input : JSON.stringify(task.input ?? ""));

async function requireModel() {
  if (!(await provider())) throw new TaskError("internal", "No AI model: set GEMINI_API_KEY or run Ollama (`ollama pull qwen2.5:7b`).");
}

function requireInput(task: Task, what: string): string {
  const text = inputText(task).trim();
  if (!text || text === '""' || text === "{}") throw new TaskError("invalid_input", `${what} needs task.input.`);
  return text;
}

// ── respond ───────────────────────────────────────────────────────────────────

const respond: Handler = async (task) => {
  const question = requireInput(task, "respond");
  const exact = arithmeticAnswer(question);
  if (exact !== null) return { text: exact };
  await requireModel();
  const text = await askModel(
    question,
    "Answer the user's question correctly. Put the answer first, exactly and plainly (a number, a name, a short phrase or sentence), then at most one short sentence of explanation if useful. Do the arithmetic carefully.",
  );
  return { text: text.trim() };
};

// ── extract ───────────────────────────────────────────────────────────────────

const extract: Handler = async (task) => {
  if (!task.schema || typeof task.schema !== "object") throw new TaskError("invalid_input", "extract needs task.schema.");
  const text = requireInput(task, "extract");
  await requireModel();
  const data = await askModelJson(
    `Extract the data described by the JSON Schema from this input. Use exactly the values in the input (convert units/types only where the schema requires). Use null for anything the input does not say.\n\nInput:\n${text}`,
    task.schema,
    "You extract structured data precisely. Output JSON only.",
  );
  return { data };
};

// ── use_tools ─────────────────────────────────────────────────────────────────

function validateTools(task: Task) {
  if (!Array.isArray(task.tools) || task.tools.length === 0) throw new TaskError("invalid_input", "use_tools needs task.tools.");
  for (const t of task.tools) {
    if (!t || typeof t.name !== "string" || typeof t.url !== "string") throw new TaskError("invalid_input", "Every tool needs a name and a url.");
  }
  if (!task.challengeToken) throw new TaskError("invalid_input", "use_tools needs task.challengeToken.");
}

const useTools: Handler = async (task) => {
  const goal = requireInput(task, "use_tools");
  validateTools(task);
  await requireModel();
  const run = await runToolAgent(task, {
    system:
      "You are an agent that answers by calling the provided tools. Call the tools needed to get real data (never guess or invent values), call them again for every item the task mentions, then answer from their results. Give the final answer plainly, including the exact values (ids, numbers, totals) you used.",
    prompt: goal,
  });
  if (run.toolResults.length === 0 && run.calls.length === 0) {
    throw new TaskError("internal", "The model answered without calling any tool.");
  }
  const output: TaskOutput = { text: run.text.trim(), toolResults: run.toolResults };
  if (task.schema) output.data = await structuredFromRun(task, run, task.schema);
  return output;
};

// ── answer_from_source ────────────────────────────────────────────────────────

const answerFromSource: Handler = async (task) => {
  const question = requireInput(task, "answer_from_source");
  if (!task.source?.url) throw new TaskError("invalid_input", "answer_from_source needs task.source.");
  await requireModel();
  const search = async (query: string) => {
    try {
      return await searchSource(task, query);
    } catch (err) {
      if (err instanceof ToolCallError) {
        if (/did not answer within/.test(err.message)) throw new TaskError("upstream_timeout", err.message);
        throw new TaskError("upstream_unavailable", err.message);
      }
      throw err;
    }
  };
  const results = [await search(question)];
  const keywords = await askModel(`Give a short keyword search query (max 6 words) for finding the answer to: ${question}\nReply with the query only.`);
  if (keywords.trim() && keywords.trim().toLowerCase() !== question.toLowerCase()) results.push(await search(keywords.trim()));

  const schema = task.schema ?? {
    type: "object",
    properties: { answer: { type: ["string", "null"] }, sourceIds: { type: "array", items: { type: "string" } } },
    required: ["answer", "sourceIds"],
  };
  const data = await askModelJson<{ answer: string | null; sourceIds?: string[] }>(
    `Question: ${question}\n\nSearch results from the knowledge source:\n${JSON.stringify(results, null, 1)}\n\nAnswer only from these documents. Cite the ids of the documents you used in sourceIds. If the documents do not contain the answer, set answer to null and sourceIds to [].`,
    schema,
    "You answer strictly from the given documents and never from outside knowledge.",
  );
  return { text: data?.answer ?? "The source does not answer this.", data };
};

// ── converse ──────────────────────────────────────────────────────────────────

const converse: Handler = async (task) => {
  const message = requireInput(task, "converse");
  if (!task.sessionId) throw new TaskError("invalid_input", "converse needs task.sessionId.");
  await requireModel();
  const history = await memory.history(task.sessionId);
  const transcript = history.map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.text}`).join("\n");
  const text = (
    await askModel(
      `${transcript ? `Conversation so far:\n${transcript}\n\n` : ""}User: ${message}\nAssistant:`,
      "You are a helpful assistant in a multi-turn conversation. Remember everything the user told you earlier in this conversation and use it when asked. If something was never mentioned in this conversation, say you don't know it. Answer briefly and exactly.",
    )
  ).trim();
  await memory.append(task.sessionId, { role: "user", text: message }, { role: "assistant", text });
  return { text };
};

// ── run_workflow ──────────────────────────────────────────────────────────────

const ADDRESS = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/;

interface PaymentAsk {
  to: string;
  amountUsdc: number;
  memo?: string;
}

/** "Pay 0.01 devnet USDC to <address> with the memo …" (or the same as fields of an object). */
export function parsePayment(input: Task["input"]): PaymentAsk | null {
  if (input && typeof input === "object") {
    const o = input as Record<string, unknown>;
    const to = [o.to, o.address, o.recipient, o.payTo].find((v) => typeof v === "string") as string | undefined;
    const amount = Number(o.amountUsdc ?? o.amount ?? o.usdc);
    if (to && amount > 0) return { to, amountUsdc: amount, memo: typeof o.memo === "string" ? o.memo : undefined };
    for (const v of Object.values(o)) if (typeof v === "string" && /\bpay\b/i.test(v)) return parsePayment(v);
    return null;
  }
  const text = String(input ?? "");
  if (!/\b(pay|send|transfer)\b/i.test(text) || !/usdc/i.test(text)) return null;
  const amount = text.match(/(\d+(?:\.\d+)?)\s*(?:devnet\s+)?USDC/i) ?? text.match(/\$\s*(\d+(?:\.\d+)?)/);
  const to = text.match(/\bto\s+([1-9A-HJ-NP-Za-km-z]{32,44})\b/)?.[1] ?? text.match(ADDRESS)?.[0];
  const memoMatch =
    text.match(/memo\s*(?:[:=]|of|is)?\s*["“'`]([^"”'`]+)["”'`]/i) ??
    text.match(/memo\s*(?:[:=]|of|is)?\s*([^\s"“”'`]+)/i);
  if (!amount || !to) return null;
  return { to, amountUsdc: Number(amount[1]), memo: memoMatch?.[1]?.replace(/[.,;]+$/, "") };
}

async function payOnChain(task: Task, ask: PaymentAsk): Promise<TaskOutput> {
  const max = task.limits?.maxSpendUsd;
  if (max !== undefined && ask.amountUsdc > max) throw new TaskError("limit_exceeded", `Paying ${ask.amountUsdc} USDC would exceed maxSpendUsd ${max}.`);
  try {
    const signer = await loadAgentSigner();
    const { signature } = await payUsdc(signer, ask, { guard: getSpendingTracker() });
    return {
      text: `Paid ${ask.amountUsdc} devnet USDC to ${ask.to}${ask.memo ? ` with memo "${ask.memo}"` : ""}. Signature ${signature}.`,
      data: { signature },
    };
  } catch (err) {
    if (err instanceof TransferError && /spending limits/.test(err.message)) throw new TaskError("limit_exceeded", err.message);
    throw new TaskError("internal", err instanceof Error ? err.message : String(err));
  }
}

const NUMERIC_TOTAL = ["total", "totalUsd", "total_usd", "amountUsd", "amount_usd", "amount", "price", "cost", "totalPrice", "total_price"];

function findTotal(value: unknown): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const o = value as Record<string, unknown>;
  for (const k of NUMERIC_TOTAL) if (typeof o[k] === "number") return o[k] as number;
  for (const v of Object.values(o)) {
    const nested = findTotal(v);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

const runWorkflow: Handler = async (task) => {
  const payment = parsePayment(task.input);
  if (payment) return payOnChain(task, payment);

  const goal = requireInput(task, "run_workflow");
  if (!Array.isArray(task.tools) || task.tools.length === 0) {
    if (await provider()) {
      const asked = await askModelJson<{ to: string | null; amountUsdc: number | null; memo: string | null }>(
        `Does this instruction ask to pay or transfer USDC? If so extract the recipient address, amount and memo exactly.\n\n${goal}`,
        { type: "object", properties: { to: { type: ["string", "null"] }, amountUsdc: { type: ["number", "null"] }, memo: { type: ["string", "null"] } }, required: ["to", "amountUsdc", "memo"] },
      );
      if (asked?.to && asked.amountUsdc) return payOnChain(task, { to: asked.to, amountUsdc: asked.amountUsdc, memo: asked.memo ?? undefined });
    }
    throw new TaskError("invalid_input", "run_workflow needs task.tools or a payment instruction.");
  }
  validateTools(task);
  await requireModel();

  const maxSpend = task.limits?.maxSpendUsd;
  let committed = 0;
  const quotes = new Map<string, number>();
  const run = await runToolAgent(task, {
    system: [
      "You are an autonomous purchasing agent. Work through the goal with the tools, in order: check inventory first, then create a quote, then place the order for what the quote covers.",
      "Never invent ids, prices or stock levels: use only tool results. Only order items that are in stock.",
      maxSpend !== undefined ? `Hard limit: total spend across all orders must never exceed $${maxSpend}. If an order would exceed it, order less or skip it and say why.` : "",
      "When done, summarise every order you placed with its id and total.",
    ].join(" "),
    prompt: goal,
    guard: (tool, input, current) => {
      const last = current.calls[current.calls.length - 1];
      if (/quote/i.test(last?.tool ?? "") && last.result !== undefined) {
        const quoteId = JSON.stringify(last.result).match(/"(?:quoteId|quote_id|id)"\s*:\s*"([^"]+)"/)?.[1];
        const total = findTotal(last.result);
        if (quoteId && total !== undefined) quotes.set(quoteId, total);
      }
      if (/place|order|buy|purchase|checkout/i.test(tool.name) && !/quote|inventory|check/i.test(tool.name) && maxSpend !== undefined) {
        const quoteId = Object.values(input).find((v) => typeof v === "string" && quotes.has(v)) as string | undefined;
        const cost = quoteId ? quotes.get(quoteId)! : findTotal(input) ?? 0;
        if (committed + cost > maxSpend + 1e-9) return `Refused: this order costs $${cost}, and with $${committed} already spent it would exceed the $${maxSpend} limit.`;
        committed += cost;
      }
      return undefined;
    },
  });

  const schema = task.schema ?? {
    type: "object",
    properties: {
      orders: { type: "array", items: { type: "object", properties: { orderId: { type: "string" }, item: { type: "string" }, quantity: { type: "number" }, total: { type: "number" } } } },
    },
    required: ["orders"],
  };
  const data = await structuredFromRun(task, run, schema);
  return { text: run.text.trim(), data, toolResults: run.toolResults };
};

export const handlers: Record<TaskType, Handler> = {
  respond,
  extract,
  use_tools: useTools,
  answer_from_source: answerFromSource,
  converse,
  run_workflow: runWorkflow,
};
