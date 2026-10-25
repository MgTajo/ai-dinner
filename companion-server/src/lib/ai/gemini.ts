import { GoogleGenAI } from "@google/genai";

// GEMINI_API_KEY is read on the server only. Never return it in a response or log it.

const DEFAULT_MODEL = "gemini-flash-latest";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new MissingGeminiKeyError();
  }
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

export class MissingGeminiKeyError extends Error {
  constructor() {
    super("GEMINI_API_KEY is not set. Add it to .env.local and restart `npm run dev`.");
  }
}

export async function askGemini(prompt: string): Promise<string> {
  const response = await getClient().models.generateContent({
    model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
    contents: prompt,
  });
  return response.text ?? "";
}
