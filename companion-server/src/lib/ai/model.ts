// The agent's language model, whichever is available: Gemini when GEMINI_API_KEY is set,
// otherwise an open model running locally in Ollama (no key needed). Everything else in the
// server talks to the model through this file.
import { askGemini, askGeminiJson, hasGeminiKey } from "./gemini.js";

const OLLAMA_URL = () => (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
export const ollamaModel = () => process.env.OLLAMA_MODEL || "qwen2.5:7b";

export interface ToolDecl {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: { function: { name: string; arguments: Record<string, unknown> } }[] }
  | { role: "tool"; content: string; tool_name: string };

let ollamaCheck: { at: number; ok: boolean } | null = null;

/** True when Ollama is running and has the model pulled (checked at most every 20 s). */
export async function ollamaReady(): Promise<boolean> {
  if (ollamaCheck && Date.now() - ollamaCheck.at < 20_000) return ollamaCheck.ok;
  let ok = false;
  try {
    const res = await fetch(`${OLLAMA_URL()}/api/tags`, { signal: AbortSignal.timeout(1500) });
    const body = (await res.json()) as { models?: { name: string }[] };
    ok = Boolean(body.models?.some((m) => m.name === ollamaModel() || m.name.startsWith(`${ollamaModel()}:`)));
  } catch {
    ok = false;
  }
  ollamaCheck = { at: Date.now(), ok };
  return ok;
}

export type Provider = "gemini" | "ollama";

export async function provider(): Promise<Provider | null> {
  if (hasGeminiKey()) return "gemini";
  return (await ollamaReady()) ? "ollama" : null;
}

export async function modelLabel(): Promise<string | null> {
  const p = await provider();
  return p === "gemini" ? "Gemini" : p === "ollama" ? `${ollamaModel()} (local)` : null;
}

export class NoModelError extends Error {
  constructor() {
    super("No AI model available: set GEMINI_API_KEY, or run Ollama with the model pulled (`ollama pull qwen2.5:7b`).");
  }
}

async function ollamaChat(body: Record<string, unknown>, timeoutMs = 90_000): Promise<{ content: string; tool_calls?: { function: { name: string; arguments: Record<string, unknown> | string } }[] }> {
  const res = await fetch(`${OLLAMA_URL()}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: ollamaModel(), stream: false, keep_alive: "24h", options: { temperature: 0, num_ctx: 8192 }, ...body }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Ollama answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { message: { content: string; tool_calls?: { function: { name: string; arguments: Record<string, unknown> | string } }[] } };
  return json.message;
}

export async function askModel(prompt: string, system?: string): Promise<string> {
  const p = await provider();
  if (p === "gemini") return askGemini(prompt, system);
  if (p === "ollama") {
    const messages = [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: prompt }];
    return (await ollamaChat({ messages })).content;
  }
  throw new NoModelError();
}

export async function askModelJson<T>(prompt: string, schema: unknown, system?: string): Promise<T> {
  const p = await provider();
  if (p === "gemini") return askGeminiJson<T>(prompt, schema, system);
  if (p === "ollama") {
    const messages = [
      { role: "system", content: `${system ?? "You produce JSON."} Answer with JSON only, matching this JSON Schema: ${JSON.stringify(schema)}` },
      { role: "user", content: prompt },
    ];
    const { content } = await ollamaChat({ messages, format: schema });
    return JSON.parse(content) as T;
  }
  throw new NoModelError();
}

/** One step of a tool-using conversation on the local model. */
export async function ollamaToolStep(messages: ChatMessage[], tools: ToolDecl[]): Promise<{ text: string; calls: ToolCall[]; assistant: ChatMessage }> {
  const message = await ollamaChat({ messages, tools: tools.map((t) => ({ type: "function", function: t })) });
  const calls = (message.tool_calls ?? []).map((c) => ({
    name: c.function.name,
    args: typeof c.function.arguments === "string" ? (JSON.parse(c.function.arguments || "{}") as Record<string, unknown>) : c.function.arguments ?? {},
  }));
  return {
    text: message.content ?? "",
    calls,
    assistant: { role: "assistant", content: message.content ?? "", tool_calls: calls.map((c) => ({ function: { name: c.name, arguments: c.args } })) },
  };
}
