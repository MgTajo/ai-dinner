import { companionJson } from "../companion";

// Asks Gemini through the companion server's POST /api/chat.
// The Gemini key lives in companion-server/.env.local, never in the app.
export async function askGemini(prompt: string): Promise<string> {
  const { text } = await companionJson<{ text: string }>("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  return text;
}
