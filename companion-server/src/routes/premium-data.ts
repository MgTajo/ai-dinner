import type { Express } from "express";
import { paidRoute } from "../lib/payments/server.js";

const FACTS = [
  "Solana devnet tokens have no monetary value: perfect for testing.",
  "HTTP status 402 'Payment Required' was reserved in 1997 and finally has a use.",
  "x402 lets a program pay for an API call without accounts, cards or API keys.",
];

export default function register(app: Express) {
  // GET /premium-data costs PAID_API_PRICE_USD (default $0.01) in devnet USDC per call.
  // The handler only runs after the payment was verified. Replace it with what you want to sell.
  app.get(
    "/premium-data",
    paidRoute("GET /premium-data", () => ({
      price: `$${process.env.PAID_API_PRICE_USD || "0.01"}`,
      description: "One premium fact",
    })),
    (_req, res) => {
      res.json({
        fact: FACTS[Math.floor(Math.random() * FACTS.length)],
        servedAt: new Date().toISOString(),
      });
    },
  );
}
