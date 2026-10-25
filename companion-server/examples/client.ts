// Example buyer: pays for a x402-protected URL using AGENT_PRIVATE_KEY from .env.local,
// within the spending limits (AGENT_BUDGET_USD, MAX_PAYMENT_USD).
//   npm run pay                                         -> buys http://localhost:3000/premium-data
//   npm run pay -- http://localhost:3000/premium-data 3 -> buys 3 times (watch the budget)
import { buy } from "../src/lib/paidapi/buyer.js";

try {
  process.loadEnvFile(".env.local");
} catch {
  console.warn("No .env.local found; using environment variables only.");
}

const url = process.argv[2] ?? `http://localhost:${process.env.PORT || 3000}/premium-data`;
const times = Number(process.argv[3] ?? 1);

for (let i = 1; i <= times; i++) {
  try {
    const result = await buy(url);
    console.log(`#${i} status ${result.status}`);
    if (result.paymentError) console.log("  payment rejected:", result.paymentError);
    console.log("  data:", result.data);
    if (result.receipt) console.log("  receipt:", result.receipt);
    console.log("  spending:", result.spending);
  } catch (err) {
    console.error(`#${i} refused/failed:`, err instanceof Error ? err.message : err);
    process.exitCode = 1;
    break;
  }
}
