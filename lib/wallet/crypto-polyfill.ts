import * as ExpoCrypto from "expo-crypto";

// @solana/kit uses the browser's WebCrypto: `crypto.subtle.digest("SHA-256", …)` to work out
// token account addresses, and `crypto.getRandomValues` for randomness. React Native doesn't
// have WebCrypto, so this fills in those two calls with Expo's own native crypto module.
// Import it before anything that builds a payment (lib/wallet/pay.ts does).

type Digest = (algorithm: AlgorithmIdentifier, data: BufferSource) => Promise<ArrayBuffer>;

const g = globalThis as { crypto?: { subtle?: { digest?: Digest }; getRandomValues?: unknown } };
g.crypto ??= {};
g.crypto.getRandomValues ??= ExpoCrypto.getRandomValues;
g.crypto.subtle ??= {};
g.crypto.subtle.digest ??= (algorithm, data) => {
  const name = typeof algorithm === "string" ? algorithm : algorithm.name;
  // expo-crypto uses the same names as WebCrypto ("SHA-256", "SHA-512", …).
  return ExpoCrypto.digest(name as ExpoCrypto.CryptoDigestAlgorithm, data);
};
