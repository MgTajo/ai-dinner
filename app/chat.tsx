import { useState } from "react";
import { Linking, Text, TextInput } from "react-native";
import { Button, Module, Notice, PageHeader, Screen, StripStatus, colors, mono } from "../components/Screen";
import { askGemini } from "../lib/ai/client";

export default function Chat() {
  const [prompt, setPrompt] = useState("Explain what an API is in two sentences.");
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function send() {
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      setAnswer(await askGemini(prompt));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const status = loading ? "Thinking" : error ? "Error" : answer ? "Answered" : "Ready";
  const tone = loading ? "signal" : error ? "fault" : answer ? "ok" : "off";

  return (
    <Screen>
      <PageHeader eyebrow="Module · Gemini AI" title="Ask Gemini.">
        Your question goes to your companion server, which asks Gemini with its key. The key never ships inside the app.
      </PageHeader>

      <Module label="A · Prompt">
        <TextInput
          value={prompt}
          onChangeText={setPrompt}
          placeholder="Ask anything…"
          placeholderTextColor={colors.muted}
          multiline
          style={{
            borderWidth: 1,
            borderColor: colors.ink,
            borderRadius: 3,
            padding: 12,
            minHeight: 96,
            textAlignVertical: "top",
            backgroundColor: colors.diagram,
            fontFamily: mono,
            fontSize: 14,
            color: colors.ink,
          }}
        />
        <Button title={loading ? "Thinking…" : "Ask Gemini ▸"} onPress={send} disabled={loading || !prompt.trim()} />
      </Module>

      <Module label="B · Answer" right={<StripStatus tone={tone}>{status}</StripStatus>}>
        {error ? (
          <Notice tone="fault">
            {error}
            {/API_KEY is not set/.test(error) ? (
              <Text>
                {" "}Get a free key at{" "}
                <Text style={{ textDecorationLine: "underline" }} onPress={() => Linking.openURL("https://aistudio.google.com/apikey")}>
                  aistudio.google.com
                </Text>{" "}
                and put it in companion-server/.env.local.
              </Text>
            ) : null}
          </Notice>
        ) : answer ? (
          <Text style={{ fontSize: 15, lineHeight: 23, color: colors.ink }} selectable>
            {answer}
          </Text>
        ) : (
          <Text style={{ color: colors.muted }}>{loading ? "Waiting for Gemini…" : "The answer appears here."}</Text>
        )}
      </Module>
    </Screen>
  );
}
