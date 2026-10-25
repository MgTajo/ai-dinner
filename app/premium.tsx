import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Button, ExplorerLink, KeyValue, Meter, Module, Notice, Output, PageHeader, Screen, StripStatus, colors } from "../components/Screen";
import { CompanionError } from "../lib/companion";
import type { PriceCheck } from "../lib/payments/client";
import { buyPremiumData, getSpending, peekPremiumData, type PurchaseResult, type SpendingSnapshot } from "../lib/paidapi/client";

export default function Premium() {
  const [spending, setSpending] = useState<SpendingSnapshot | null>(null);
  const [price, setPrice] = useState<PriceCheck | null>(null);
  const [purchase, setPurchase] = useState<PurchaseResult | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"price" | "buy" | null>(null);

  useEffect(() => {
    getSpending().then(setSpending, () => {});
  }, []);

  // Step 1: call the paid endpoint without paying, to see the 402 and its price.
  async function checkThePrice() {
    setLoading("price");
    setPriceError(null);
    try {
      setPrice(await peekPremiumData());
    } catch (err) {
      setPriceError(messageOf(err));
    } finally {
      setLoading(null);
    }
  }

  // Step 2: ask the companion's agent to pay for it (its devnet key never leaves the server).
  async function letTheAgentPay() {
    setLoading("buy");
    setBuyError(null);
    setPurchase(null);
    try {
      const result = await buyPremiumData();
      setPurchase(result);
      setSpending(result.spending);
    } catch (err) {
      setBuyError(messageOf(err));
      // A refused purchase still reports the budget.
      const body = err instanceof CompanionError ? (err.body as { spending?: SpendingSnapshot } | null) : null;
      if (body?.spending) setSpending(body.spending);
    } finally {
      setLoading(null);
    }
  }

  const option = price?.paymentRequired?.accepts[0];
  const notSetUp = price?.status === 500;
  const paid = purchase?.receipt?.success && purchase.receipt.transaction;

  return (
    <Screen>
      <PageHeader eyebrow="Module · Paid API" title={"Pay per\nrequest."}>
        Your companion server sells /premium-data for a cent of devnet test USDC per call (no real money). It answers
        HTTP 402 with a price until someone pays.
      </PageHeader>

      <Module label="A · Ask for the price" right={<StripStatus tone={price ? "signal" : undefined}>{price ? `HTTP ${price.status}` : "Step 1"}</StripStatus>}>
        <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>Call the paid endpoint without paying and see what comes back.</Text>
        <Button variant="secondary" title={loading === "price" ? "Calling…" : "Call without paying"} onPress={checkThePrice} disabled={loading !== null} />
        {priceError ? <Notice tone="fault">{priceError}</Notice> : null}
        {option ? (
          <KeyValue
            rows={[
              ["Status", `${price?.status} Payment Required`],
              ["Price", `$${price?.priceUsd} USDC`],
              ["Pay to", option.payTo],
              ["Network", option.network],
            ]}
          />
        ) : null}
        {notSetUp ? (
          <Notice>The companion server isn&apos;t set up to charge yet: set PAY_TO_ADDRESS in companion-server/.env.local and restart it.</Notice>
        ) : null}
      </Module>

      <Module label="B · Let the agent pay" right={<StripStatus tone={paid ? "ok" : buyError ? "fault" : undefined}>{paid ? "Paid" : buyError ? "Not paid" : "Step 2"}</StripStatus>}>
        <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>
          The companion&apos;s agent pays with its own devnet wallet, inside its spending limits, then fetches the data.
        </Text>
        <Button title={loading === "buy" ? "Paying…" : "Let the agent pay ▸"} onPress={letTheAgentPay} disabled={loading !== null} />
        {buyError ? <Notice tone="fault">{buyError}</Notice> : null}
        {purchase && !paid ? <Notice tone="fault">{purchase.paymentError ?? `The paid API answered ${purchase.status}.`}</Notice> : null}
        {paid && purchase?.receipt?.transaction ? (
          <>
            <Notice tone="ok">Payment settled on Solana devnet.</Notice>
            <ExplorerLink signature={purchase.receipt.transaction} />
            <Output value={purchase.data} />
          </>
        ) : null}
      </Module>

      {spending ? (
        <Module label="Agent spending limits" right={<StripStatus>{`${spending.payments} ${spending.payments === 1 ? "payment" : "payments"}`}</StripStatus>}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
            <Text style={{ fontSize: 10, color: colors.muted, letterSpacing: 0.4 }}>SPENT OF BUDGET</Text>
            <Text style={{ fontSize: 26, fontWeight: "900", color: colors.ink, letterSpacing: -0.8 }}>
              ${spending.spentUsd}
              <Text style={{ fontSize: 14, color: colors.muted }}> / ${spending.budgetUsd}</Text>
            </Text>
          </View>
          <Meter spent={Number(spending.spentUsd)} total={Number(spending.budgetUsd)} />
          <Text style={{ fontSize: 12.5, lineHeight: 18, color: colors.muted }}>Never more than ${spending.maxPaymentUsd} per payment.</Text>
        </Module>
      ) : null}
    </Screen>
  );
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
