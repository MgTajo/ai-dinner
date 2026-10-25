// Offline tests for the Pay.sh helpers (no `pay` CLI or network needed).
//   npm run test:paysh
import assert from "node:assert/strict";
import { test } from "node:test";
import { devnetWalletFrom, listingMarkdown, slug, titleFromSlug } from "../src/lib/paysh/listing.js";

const field = (md: string, key: string) => new RegExp(`^${key}: "?(.*?)"?$`, "m").exec(md)?.[1] ?? "";

test("reads the devnet wallet from `pay account list`", () => {
  const out = "devnet:\n● default [devnet 2sQzRvwDikhtMLaicsUEm372c6CNErMQpiZYZEUjuyS4]\nlocalnet:\n● default [localnet B2mWBJMBWzG9bEfbEEv1qohTotpqK5BSUEcmFnjCwMp6]";
  assert.equal(devnetWalletFrom(out), "2sQzRvwDikhtMLaicsUEm372c6CNErMQpiZYZEUjuyS4");
  assert.equal(devnetWalletFrom("localnet:\n● default [localnet B2mWBJMBWzG9bEfbEEv1qohTotpqK5BSUEcmFnjCwMp6]"), null);
});

test("names follow the catalog's lowercase, single-hyphen rule", () => {
  assert.equal(slug("Team Rocket!"), "team-rocket");
  assert.equal(slug("--My__Agent--"), "my-agent");
  assert.equal(titleFromSlug("fact-service"), "Fact Service");
});

test("the listing fits the catalog's field limits", () => {
  const md = listingMarkdown({ name: "A Very Long Project Name For Testing", serviceUrl: "https://api.example.com", priceUsd: 0.01, paidPath: "/premium-data", kind: "an agent service" });
  assert.equal(field(md, "name"), "a-very-long-project-name-for-testing");
  const description = field(md, "description");
  const useCase = field(md, "use_case");
  assert.ok(description.length >= 64 && description.length <= 255, `description is ${description.length} chars`);
  assert.ok(useCase.length >= 32 && useCase.length <= 255, `use_case is ${useCase.length} chars`);
  assert.match(md, /^ {4}path: premium-data$/m);
  assert.match(md, /price_usd: 0\.01$/m);
});
