import Constants from "expo-constants";
import { Platform } from "react-native";

// The app never holds API keys or wallet keys: anything inside an app can be extracted
// by whoever installs it. Features that need a secret (Gemini, payments) ask your
// companion server (companion-server/) instead, over plain HTTP.

const COMPANION_PORT = 3000;

/** Base URL of the companion server, without a trailing slash. */
export function companionUrl(): string {
  const configured = process.env.EXPO_PUBLIC_COMPANION_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  // In development the companion runs on the same computer as `npm start`. Expo knows
  // that computer's address on your Wi-Fi (e.g. 192.168.1.20:8081), so a phone running
  // Expo Go can reach it too.
  const devHost = Constants.expoConfig?.hostUri?.split(":")[0];
  if (devHost) return `http://${devHost}:${COMPANION_PORT}`;

  // The Android emulator reaches your computer as 10.0.2.2.
  return Platform.OS === "android" ? `http://10.0.2.2:${COMPANION_PORT}` : `http://localhost:${COMPANION_PORT}`;
}

export class CompanionError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly body: unknown = null,
  ) {
    super(message);
    this.name = "CompanionError";
  }
}

/** Calls the companion server. Throws a CompanionError with a readable message if it can't be reached. */
export async function companionFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${companionUrl()}${path}`;
  try {
    return await fetch(url, init);
  } catch {
    throw new CompanionError(
      `Can't reach the companion server at ${url}. Is \`npm run companion\` running, and is your phone on the same Wi-Fi as your computer?`,
      null,
    );
  }
}

/** Calls the companion server and parses its JSON answer. Non-2xx answers throw with the server's `error` message. */
export async function companionJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await companionFetch(path, init);
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const error = (body as { error?: unknown } | null)?.error;
    throw new CompanionError(typeof error === "string" ? error : `Companion server answered ${res.status}`, res.status, body);
  }
  return body as T;
}
