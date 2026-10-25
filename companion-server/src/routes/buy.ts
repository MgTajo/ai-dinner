import type { Express } from "express";
import { buy, getSpendingTracker } from "../lib/paidapi/buyer.js";

// The service's own agent buys from its own paid endpoint. The URL is fixed (this server,
// on the port it is listening on), never taken from the request, so nobody can make
// your agent pay other sites.

export default function register(app: Express) {
  app.get("/api/buy", (_req, res) => {
    try {
      res.json({ spending: getSpendingTracker().snapshot() });
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  app.post("/api/buy", async (req, res) => {
    const target = `http://127.0.0.1:${req.socket.localPort}/premium-data`;
    try {
      res.json(await buy(target));
    } catch (err) {
      console.error("Purchase failed:", err);
      res.status(400).json({ error: errorMessage(err), spending: safeSnapshot() });
    }
  });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function safeSnapshot() {
  try {
    return getSpendingTracker().snapshot();
  } catch {
    return null;
  }
}
