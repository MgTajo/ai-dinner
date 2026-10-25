// Pay.sh (https://pay.sh): pay x402 APIs with the `pay` CLI from the Solana Foundation, and
// draft a listing so other agents can find your API in the Pay.sh catalog.
//   npm run paysh                    -> pays this service's GET /premium-data once, from your Pay.sh wallet
//   npm run paysh -- <url>           -> pays any x402 URL (add --sandbox for Pay.sh's test network)
//   npm run paysh -- wallet          -> shows your Pay.sh devnet wallet and its USDC balance
//   npm run paysh -- listing [team]  -> writes pay-listing/providers/<team>/<name>/PAY.md and checks it
// Needs the `pay` CLI: `brew install pay` or `npm install -g @solana/pay`.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { address, createSolanaRpc } from "@solana/kit";
import { USDC_DEVNET_MINT } from "../src/lib/payments/config.js";
import { devnetWalletFrom, listingMarkdown, slug } from "../src/lib/paysh/listing.js";

try {
  process.loadEnvFile(".env.local");
} catch {
  console.warn("No .env.local found; using environment variables only.");
}

const PAID_PATH = "/premium-data";
const KIND = "an agent service";
const FAUCET = "https://faucet.circle.com";

/** Runs `pay` with these arguments. Returns null (after explaining) when `pay` is not installed. */
function pay(args: string[], options: { cwd?: string; capture?: boolean } = {}) {
  const result = spawnSync("pay", args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error && (result.error as NodeJS.ErrnoException).code === "ENOENT") {
    console.error("The `pay` CLI is not installed. Install it with `brew install pay` or `npm install -g @solana/pay`, then run this again.");
    return null;
  }
  return result;
}

async function usdcBalance(owner: string): Promise<string | null> {
  const rpc = createSolanaRpc(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com");
  const { value } = await rpc
    .getTokenAccountsByOwner(address(owner), { mint: address(USDC_DEVNET_MINT) }, { encoding: "jsonParsed" })
    .send();
  if (value.length === 0) return null;
  return (value[0].account.data.parsed.info as { tokenAmount: { uiAmountString: string } }).tokenAmount.uiAmountString;
}

async function wallet() {
  const result = pay(["account", "list"], { capture: true });
  if (!result) return 1;
  // Pay.sh makes its devnet wallet on your first devnet payment.
  const owner = devnetWalletFrom(`${result.stdout}${result.stderr}`);
  if (!owner) {
    console.log("No Pay.sh devnet wallet yet. `npm run paysh` makes one on its first payment; then run `npm run paysh -- wallet` again.");
    return 0;
  }
  const balance = await usdcBalance(owner);
  console.log(`Pay.sh devnet wallet: ${owner}`);
  console.log(balance === null ? `✗ No devnet USDC yet. Send it some from ${FAUCET} (choose Solana Devnet).` : `✓ ${balance} devnet USDC`);
  return 0;
}

function payOnce(args: string[]) {
  const url = args.find((a) => !a.startsWith("-")) ?? `http://localhost:${process.env.PORT || 3000}${PAID_PATH}`;
  const flags = args.filter((a) => a.startsWith("-"));
  console.log(`Paying ${url} with Pay.sh…`);
  const result = pay([...flags, "curl", "-s", url], { capture: true });
  if (!result) return 1;
  if (result.stdout.trim()) console.log(result.stdout.trim());
  if (result.stderr.trim()) console.error(result.stderr.trim());
  if (`${result.stdout}${result.stderr}`.includes("402 again after payment")) {
    console.log(`\nThe payment was refused. Usually your Pay.sh wallet has no devnet USDC: run \`npm run paysh -- wallet\`, then fund it at ${FAUCET}.`);
    return 1;
  }
  return result.status ?? 1;
}

function listing(team = "your-team") {
  const name = slug(JSON.parse(readFileSync("package.json", "utf8")).name || "") || "my-agent";
  const operator = slug(team) || "your-team";
  const serviceUrl = process.env.PAYSH_SERVICE_URL || "https://your-api.example.com";
  const priceUsd = Number(process.env.PAID_API_PRICE_USD || "0.01");
  const dir = join("pay-listing", "providers", operator, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "PAY.md"), listingMarkdown({ name, serviceUrl, priceUsd, paidPath: PAID_PATH, kind: KIND }));
  console.log(`Wrote ${join(dir, "PAY.md")}`);
  if (serviceUrl.includes("example.com")) console.log("Set PAYSH_SERVICE_URL in .env.local to your deployed https:// address, then run this again.");
  console.log("The public catalog only lists APIs paid on Solana mainnet. Submit it once you deploy for real money: https://github.com/solana-foundation/pay-skills\n");
  const result = pay(["catalog", "check", join("providers", operator, name, "PAY.md"), "--no-probe"], { cwd: "pay-listing" });
  return result?.status ?? 1;
}

const [command, ...rest] = process.argv.slice(2);
if (command === "wallet") process.exitCode = await wallet();
else if (command === "listing") process.exitCode = listing(rest[0]);
else process.exitCode = payOnce(command ? [command, ...rest] : rest);
