import type { Address } from "@solana/kit";
import { useState } from "react";
import { Text } from "react-native";
import { Button, ExplorerLink, KeyValue, Module, Notice, Output, PageHeader, Screen, StripStatus, colors } from "../components/Screen";
import { connectWallet, disconnectWallet } from "../lib/wallet/mobileWallet";
import { MAX_PAYMENT, payWithWallet, type WalletPurchase } from "../lib/wallet/pay";

export default function Wallet() {
  const [owner, setOwner] = useState<Address | null>(null);
  const [purchase, setPurchase] = useState<WalletPurchase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"connect" | "pay" | null>(null);

  async function run(kind: "connect" | "pay", action: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(walletMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const connect = () => run("connect", async () => setOwner(await connectWallet()));
  const pay = () =>
    run("pay", async () => {
      setPurchase(null);
      if (owner) setPurchase(await payWithWallet(owner));
    });
  const disconnect = () =>
    run("connect", async () => {
      setOwner(null);
      setPurchase(null);
      await disconnectWallet();
    });

  return (
    <Screen>
      <PageHeader eyebrow="Module · Wallet Connection" title={"Pay with\nyour wallet."}>
        Connect a Solana wallet app on this phone and pay the companion&apos;s /premium-data from it. The wallet shows
        every payment and you approve it there. Devnet test USDC only, no real money.
      </PageHeader>

      <Module label="A · Connect" right={<StripStatus tone={owner ? "ok" : undefined}>{owner ? "Connected" : "Step 1"}</StripStatus>}>
        {owner ? (
          <>
            <KeyValue rows={[["Your address", owner], ["Network", "Solana devnet"]]} />
            <Button variant="secondary" title="Disconnect" onPress={disconnect} disabled={busy !== null} />
          </>
        ) : (
          <>
            <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>
              Your wallet app opens and asks whether to connect. Switch it to devnet first.
            </Text>
            <Button title={busy === "connect" ? "Waiting for your wallet…" : "Connect wallet"} onPress={connect} disabled={busy !== null} />
          </>
        )}
      </Module>

      <Module
        label="B · Pay"
        right={<StripStatus tone={purchase?.transaction ? "ok" : purchase?.error ? "fault" : undefined}>{purchase?.transaction ? "Paid" : purchase?.error ? "Not paid" : "Step 2"}</StripStatus>}
      >
        <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>
          Max {MAX_PAYMENT} per payment. Your wallet needs devnet USDC from faucet.circle.com.
        </Text>
        <Button title={busy === "pay" ? "Approve in your wallet…" : "Buy premium data ▸"} onPress={pay} disabled={!owner || busy !== null} />
        {purchase?.transaction ? (
          <>
            <Notice tone="ok">Paid from your wallet and settled on Solana devnet.</Notice>
            <ExplorerLink signature={purchase.transaction} />
            <Output value={purchase.data} />
          </>
        ) : null}
        {purchase && !purchase.transaction ? <Notice tone="fault">{purchase.error ?? `The paid API answered ${purchase.status}.`}</Notice> : null}
      </Module>

      {error ? <Notice tone="fault">{error}</Notice> : null}
    </Screen>
  );
}

function walletMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/ERROR_WALLET_NOT_FOUND|no installed wallet/i.test(message)) {
    return "No Solana wallet app found on this phone. Install one that supports Mobile Wallet Adapter (Phantom, Solflare or Backpack), then try again.";
  }
  if (/declined|ERROR_AUTHORIZATION_FAILED|NOT_SIGNED|cancel/i.test(message)) return "You declined in the wallet. Nothing was paid.";
  return message;
}
