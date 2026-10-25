import { useCallback, useEffect, useState } from "react";
import { Text } from "react-native";
import { Button, KeyValue, Module, Muted, Notice, PageHeader, Screen, StripStatus } from "../components/Screen";
import { companionJson } from "../lib/companion";

interface Readiness {
  verifierToken: string;
  taskTypes: Record<string, string>;
}

// The race verifier calls your companion server, not the phone. This screen shows what it will find.
export default function Race() {
  const [state, setState] = useState<Readiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const check = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setState(await companionJson<Readiness>("/race"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const built = state ? Object.values(state.taskTypes).filter((v) => v === "handler written").length : 0;
  return (
    <Screen>
      <PageHeader eyebrow="Module · AI Race adapter" title="Race readiness.">
        The AI Race verifier tests your companion server at /agent-studio/v1. Write your AI logic in the companion server, in src/race/handlers.ts.
      </PageHeader>
      <Module label="A · Companion" right={<StripStatus tone={loading ? "signal" : error ? "fault" : state ? "ok" : "off"}>{loading ? "Checking" : error ? "Error" : state ? "Reachable" : "Idle"}</StripStatus>}>
        {error ? <Notice tone="fault">{error}</Notice> : state ? <KeyValue rows={[["Verifier token", state.verifierToken]]} /> : <Muted>Checking the companion server…</Muted>}
        <Button title={loading ? "Checking…" : "Check again ▸"} onPress={check} disabled={loading} />
      </Module>
      {state && (
        <Module label="B · Task types" right={<Text>{`${built} of ${Object.keys(state.taskTypes).length} built`}</Text>}>
          <KeyValue rows={Object.entries(state.taskTypes)} />
        </Module>
      )}
    </Screen>
  );
}
