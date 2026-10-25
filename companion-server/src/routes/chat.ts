import type { Express } from "express";
import { askGemini, MissingGeminiKeyError } from "../lib/ai/gemini.js";

const MAX_PROMPT_CHARS = 4000;

export default function register(app: Express) {
  // POST /api/chat  { "prompt": "..." }  ->  { "text": "..." }
  app.post("/api/chat", async (req, res) => {
    const body = req.body as { prompt?: unknown } | undefined;
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      res.status(400).json({ error: 'Send JSON like { "prompt": "Hello" }' });
      return;
    }
    if (prompt.length > MAX_PROMPT_CHARS) {
      res.status(400).json({ error: `Prompt is longer than ${MAX_PROMPT_CHARS} characters` });
      return;
    }

    try {
      res.json({ text: await askGemini(prompt) });
    } catch (err) {
      if (err instanceof MissingGeminiKeyError) {
        res.status(500).json({ error: err.message });
        return;
      }
      console.error("Gemini request failed:", err);
      res.status(502).json({ error: "Gemini request failed. Check the server logs." });
    }
  });
}
