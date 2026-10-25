import { ArrowDownLeft, ArrowUpRight, Copy, Plus, RotateCcw } from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { explorerUrl } from "../../components/agent/OrderCard";
import { PageHeader, useWide } from "../../components/shell/AppShell";
import { Bar, Button, Card, Divider, Pill, SectionHeader, T } from "../../components/ui/primitives";
import { color, font, radius } from "../../components/ui/theme";
import { GBP_USDC, money, shortAddress, usdc } from "../../lib/agent/format";
import { fmtTime, MINUTE, relativeDay } from "../../lib/agent/time";
import { uid } from "../../lib/store/state";
import { useNow, useStore } from "../../lib/store/StoreProvider";

export default function WalletScreen() {
  const { state, update } = useStore();
  const wide = useWide();
  const now = useNow(10_000);
  const [copied, setCopied] = useState(false);
  const live = state.runtime.payments === "live";
  const address = live && state.runtime.agentAddress ? state.runtime.agentAddress : state.wallet.address;
  const balance = live && state.runtime.liveBalanceUsdc !== undefined ? state.runtime.liveBalanceUsdc : state.wallet.balanceUsdc;
  const weekSpent = state.orders.filter((o) => o.source !== "history" && !o.cancelledAt && now - o.placedAt < 7 * 24 * 60 * MINUTE).reduce((n, o) => n + o.total, 0);
  const txs = state.wallet.txs;

  const copy = async () => {
    // Clipboard is only wired up on the web; on a phone the address is selectable instead.
    const clipboard = (globalThis as { navigator?: { clipboard?: { writeText: (t: string) => Promise<void> } } }).navigator?.clipboard;
    await clipboard?.writeText(address).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const topUp = () =>
    update((s) => ({
      ...s,
      wallet: { ...s.wallet, balanceUsdc: Math.round((s.wallet.balanceUsdc + 100) * 100) / 100, txs: [{ id: uid("tx"), at: now, kind: "deposit", amountUsdc: 100, label: "Added from Phantom", simulated: true }, ...s.wallet.txs] },
    }));

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: wide ? 40 : 16, paddingBottom: 60 }}>
      <View style={{ width: "100%", maxWidth: 1000, alignSelf: "center" }}>
        <PageHeader title="Wallet" subtitle="Sous pays restaurants directly from this wallet, in USDC on Solana." />
        <View style={{ flexDirection: wide ? "row" : "column", gap: 18, alignItems: "flex-start" }}>
          <View style={{ flex: 1.2, width: wide ? undefined : "100%", gap: 18 }}>
            <View style={{ backgroundColor: color.ink, borderRadius: radius.xl, padding: 24, gap: 22 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <T variant="label" style={{ color: "#A29D95" }}>
                  Agent wallet · Solana
                </T>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#2A2825", borderRadius: radius.pill, paddingHorizontal: 10, height: 24 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: live ? "#5BD08F" : "#E3B341" }} />
                  <T style={{ fontFamily: font.medium, fontSize: 11.5, color: "#E8E4DC" }}>{live ? "Devnet · live" : "Devnet · simulated"}</T>
                </View>
              </View>
              <View style={{ gap: 4 }}>
                <T style={{ fontFamily: font.display, fontSize: 52, lineHeight: 56, color: "#FFFFFF", letterSpacing: -1 }}>
                  {balance.toFixed(2)}
                  <T style={{ fontFamily: font.medium, fontSize: 18, color: "#A29D95" }}> USDC</T>
                </T>
                <T style={{ fontFamily: font.regular, fontSize: 13, color: "#A29D95" }}>≈ {money(balance / GBP_USDC)} of meals</T>
              </View>
              <Pressable onPress={copy}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <T style={{ fontFamily: font.mono, fontSize: 12.5, color: "#D9D4CB" }} selectable>
                    {shortAddress(address, 8)}
                  </T>
                  <Copy size={13} color="#A29D95" />
                  {copied ? <T style={{ fontFamily: font.medium, fontSize: 12, color: "#5BD08F" }}>Copied</T> : null}
                </View>
              </Pressable>
              {!live ? (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable onPress={topUp}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 14, borderRadius: radius.sm, backgroundColor: "#FFFFFF" }}>
                      <Plus size={15} color={color.ink} />
                      <T style={{ fontFamily: font.semibold, fontSize: 13.5, color: color.ink }}>Add 100 USDC</T>
                    </View>
                  </Pressable>
                </View>
              ) : (
                <Pressable onPress={() => Linking.openURL(`https://explorer.solana.com/address/${address}?cluster=devnet`)}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <T style={{ fontFamily: font.semibold, fontSize: 13.5, color: "#FFFFFF" }}>View on Solana Explorer</T>
                    <ArrowUpRight size={14} color="#FFFFFF" />
                  </View>
                </Pressable>
              )}
            </View>

            {!live ? (
              <View style={{ backgroundColor: color.amberSoft, borderRadius: radius.md, padding: 14, gap: 4 }}>
                <T variant="smallStrong" style={{ color: color.amber }}>
                  Demo settlement
                </T>
                <T variant="small" style={{ color: color.amber }}>
                  {state.runtime.companion === "online"
                    ? state.runtime.paymentsReason ?? "The companion server can't pay on devnet yet."
                    : "The companion server isn't reachable, so payments are simulated."}{" "}
                  With a funded devnet wallet on the companion server, every order settles on-chain with its order number as the memo.
                </T>
              </View>
            ) : null}

            <Card padded={false}>
              <View style={{ padding: 18, paddingBottom: 6 }}>
                <SectionHeader title="Activity" style={{ marginBottom: 0 }} />
              </View>
              {txs.length ? (
                txs.map((t, i) => (
                  <View key={t.id}>
                    {i ? <Divider inset={64} /> : null}
                    <Pressable onPress={() => !t.simulated && t.signature && Linking.openURL(explorerUrl(t.signature))} disabled={t.simulated || !t.signature}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, paddingVertical: 12 }}>
                        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: t.kind === "payment" ? color.sunken : color.greenSoft, alignItems: "center", justifyContent: "center" }}>
                          {t.kind === "payment" ? <ArrowUpRight size={16} color={color.ink2} /> : t.kind === "refund" ? <RotateCcw size={15} color={color.green} /> : <ArrowDownLeft size={16} color={color.green} />}
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <T variant="smallStrong" style={{ color: color.ink }} numberOfLines={1}>
                            {t.label}
                          </T>
                          <T variant="caption" numberOfLines={1}>
                            {relativeDay(t.at, now)} {fmtTime(t.at)}
                            {t.signature ? ` · ${shortAddress(t.signature, 4)}` : ""}
                            {t.orderId ? ` · ${t.orderId}` : ""}
                          </T>
                        </View>
                        <View style={{ alignItems: "flex-end", gap: 3 }}>
                          <T variant="num" style={{ color: t.kind === "payment" ? color.ink : color.green }}>
                            {t.kind === "payment" ? "−" : "+"}
                            {t.amountUsdc.toFixed(2)}
                          </T>
                          {t.simulated ? <T variant="caption">simulated</T> : <Pill label="On-chain" tone="green" />}
                        </View>
                      </View>
                    </Pressable>
                  </View>
                ))
              ) : (
                <View style={{ padding: 18 }}>
                  <T variant="small">No payments yet.</T>
                </View>
              )}
            </Card>
          </View>

          <View style={{ flex: 1, width: wide ? undefined : "100%", gap: 18 }}>
            <Card style={{ gap: 14 }}>
              <SectionHeader title="Spending rules" style={{ marginBottom: 0 }} />
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <T variant="bodyStrong">This week</T>
                  <T variant="num">
                    {money(weekSpent)} <T variant="small">of {money(state.profile.limits.weekly)}</T>
                  </T>
                </View>
                <Bar value={weekSpent / state.profile.limits.weekly} />
              </View>
              <Divider />
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <T variant="body">Largest single order</T>
                <T variant="num">{money(state.profile.limits.perOrder)}</T>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <T variant="body">Without asking</T>
                <T variant="bodyStrong">{state.profile.autonomy === "auto" ? "Up to the limits" : "Never"}</T>
              </View>
              <T variant="caption">Checked before every payment. Anything over a limit always comes back to you.</T>
            </Card>

            <Card style={{ gap: 14 }}>
              <SectionHeader title="How Sous pays" style={{ marginBottom: 0 }} />
              {[
                ["1", "The restaurant confirms", "Sous never pays for an order that hasn't been accepted."],
                ["2", "Sous sends USDC", `Converted at £1 = ${GBP_USDC} USDC, straight to the platform's settlement address.`],
                ["3", "The receipt is on-chain", "Each transfer carries the order number as its memo, so every meal has a verifiable receipt."],
              ].map(([n, title, text]) => (
                <View key={n} style={{ flexDirection: "row", gap: 12 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: color.sunken, alignItems: "center", justifyContent: "center" }}>
                    <T variant="caption" style={{ fontFamily: font.semibold, color: color.ink2 }}>
                      {n}
                    </T>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <T variant="smallStrong" style={{ color: color.ink }}>
                      {title}
                    </T>
                    <T variant="small">{text}</T>
                  </View>
                </View>
              ))}
              {live ? null : <Button title="Set up live devnet payments" kind="secondary" size="sm" onPress={() => Linking.openURL("https://faucet.circle.com")} style={{ alignSelf: "flex-start" }} />}
            </Card>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
