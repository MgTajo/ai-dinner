import { GoogleGenAI } from "@google/genai";

// GEMINI_API_KEY is read on the server only. Never return it in a response or log it.

const DEFAULT_MODEL = "gemini-flash-latest";

let client: GoogleGenAI | null = null;

export function getGemini(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new MissingGeminiKeyError();
  }
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

export function geminiModel(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

export function hasGeminiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export class MissingGeminiKeyError extends Error {
  constructor() {
    super("GEMINI_API_KEY is not set. Add it to .env.local and restart `npm run dev`.");
  }
}

/** Models to try, in order. Busy (503), rate-limited (429) or retired (404) models fall through. */
function candidates(): string[] {
  return [...new Set([preferred ?? "", process.env.GEMINI_MODEL || DEFAULT_MODEL, "gemini-flash-lite-latest", "gemini-3.8-flash"].filter(Boolean))];
}

/** The last model that answered, tried first for the next few minutes. */
let preferred: string | null = null;
let preferredAt = 0;

const failover = (err: unknown) => /\b(503|429|404)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|NOT_FOUND|high demand|overloaded/i.test(String((err as Error)?.message ?? err));

type GenerateParams = Parameters<GoogleGenAI["models"]["generateContent"]>[0];

/** generateContent with model failover. Use this instead of calling the SDK directly. */
export async function generate(params: Omit<GenerateParams, "model">) {
  if (preferred && Date.now() - preferredAt > 5 * 60_000) preferred = null;
  let lastError: unknown;
  for (const model of candidates()) {
    try {
      const response = await getGemini().models.generateContent({ ...params, model } as GenerateParams);
      preferred = model;
      preferredAt = Date.now();
      return response;
    } catch (err) {
      lastError = err;
      if (!failover(err)) throw err;
    }
  }
  throw lastError;
}

export async function askGemini(prompt: string, systemInstruction?: string): Promise<string> {
  const response = await generate({ contents: prompt, config: systemInstruction ? { systemInstruction } : undefined });
  return response.text ?? "";
}

/**
 * Asks for JSON matching `schema`. Gemini enforces the schema itself where it can; if it rejects
 * the schema (it supports a subset of JSON Schema), the schema goes into the prompt instead.
 */
export async function askGeminiJson<T>(prompt: string, schema: unknown, systemInstruction?: string): Promise<T> {
  try {
    const response = await generate({ contents: prompt, config: { systemInstruction, responseMimeType: "application/json", responseJsonSchema: schema } });
    return JSON.parse(response.text ?? "null") as T;
  } catch (err) {
    if (err instanceof SyntaxError || !/schema|INVALID_ARGUMENT|400/i.test(String((err as Error)?.message))) throw err;
    const response = await generate({
      contents: `${prompt}\n\nAnswer with JSON only, matching this JSON Schema exactly:\n${JSON.stringify(schema)}`,
      config: { systemInstruction, responseMimeType: "application/json" },
    });
    return JSON.parse(response.text ?? "null") as T;
  }
}
