// Pure helpers for scripts/paysh.ts: reading `pay account list` and writing a Pay.sh catalog listing.
// The catalog's rules (field lengths, layout) are in https://github.com/solana-foundation/pay-skills/blob/main/CONTRIBUTING.md

/** Lowercase, URL-safe, single hyphens: what the catalog accepts in a listing's path and name. */
export const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** "fact-service" -> "Fact Service". */
export const titleFromSlug = (name: string) => name.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

/** The devnet wallet address in `pay account list` output, if there is one. */
export function devnetWalletFrom(output: string): string | null {
  return /\[devnet ([1-9A-HJ-NP-Za-km-z]{32,44})\]/.exec(output)?.[1] ?? null;
}

export interface ListingInput {
  /** Becomes the listing's folder and `name:`; slugged. */
  name: string;
  serviceUrl: string;
  priceUsd: number;
  /** The paid route, e.g. "/premium-data". */
  paidPath: string;
  /** How the project is described, e.g. "an agent service". */
  kind: string;
}

/** A PAY.md for the Pay.sh catalog: one paid GET endpoint, priced per request. */
export function listingMarkdown({ name, serviceUrl, priceUsd, paidPath, kind }: ListingInput): string {
  const id = slug(name) || "my-agent";
  const title = titleFromSlug(id);
  return `---
name: ${id}
title: "${title}"
description: "Pay-per-request premium data from ${title}, ${kind} built with Superteam Agent Studio, returning one short JSON fact per paid call."
use_case: "Use when an agent needs a small paid JSON fact from ${title}, or to test an x402 purchase in USDC on Solana end to end."
category: data
service_url: ${serviceUrl}
endpoints:
  - method: GET
    path: ${paidPath.replace(/^\//, "")}
    description: "Return one premium fact as JSON after an x402 payment in USDC on Solana"
    pricing:
      dimensions:
        - direction: usage
          unit: requests
          scale: 1
          tiers:
            - price_usd: ${priceUsd}
---

${title} sells one endpoint, \`GET ${paidPath}\`, for $${priceUsd} per request.
Edit this file to describe what your API really returns before you submit it.
`;
}
