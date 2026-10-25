import { transact } from "@solana-mobile/mobile-wallet-adapter-protocol-kit";
import { getAddressDecoder, getBase64Encoder, type Address, type SignatureBytes, type TransactionPartialSigner } from "@solana/kit";

// Solana Mobile Wallet Adapter (MWA): the app asks a wallet app on the same phone (Phantom,
// Solflare, Backpack, …) to approve things. The wallet holds the keys; this app never sees them.
// Every `transact()` opens the wallet, which shows its own approval screen.

/** How the wallet names this app on its approval screens. */
const APP_IDENTITY = { name: "Superteam Agent App" } as const;
/** Devnet only: test money. */
export const WALLET_CHAIN = "solana:devnet";

// The wallet hands out an auth token on the first approval, so later requests can skip the
// "connect this app?" step. Kept in memory: restarting the app asks again.
let authToken: string | undefined;

/** MWA sends addresses as base64; @solana/kit uses base58 `Address` strings. */
const toAddress = (base64: string): Address => getAddressDecoder().decode(getBase64Encoder().encode(base64));

/** Opens the wallet and asks the user to connect it. Returns their devnet address. */
export async function connectWallet(): Promise<Address> {
  return transact(async (wallet) => {
    const auth = await wallet.authorize({ identity: APP_IDENTITY, chain: WALLET_CHAIN, auth_token: authToken });
    authToken = auth.auth_token;
    return toAddress(auth.accounts[0].address);
  });
}

/** Forgets the connection here and tells the wallet to revoke it. */
export async function disconnectWallet(): Promise<void> {
  const token = authToken;
  authToken = undefined;
  if (token) await transact((wallet) => wallet.deauthorize({ auth_token: token }));
}

/**
 * A @solana/kit signer backed by the wallet app, which is what x402 needs to pay. Each payment
 * opens the wallet so the user can approve or reject it; the wallet only adds its own signature
 * (x402's facilitator pays the network fee).
 */
export function walletSigner(owner: Address): TransactionPartialSigner {
  return {
    address: owner,
    async signTransactions(transactions) {
      const signed = await transact(async (wallet) => {
        const auth = await wallet.authorize({ identity: APP_IDENTITY, chain: WALLET_CHAIN, auth_token: authToken });
        authToken = auth.auth_token;
        return wallet.signTransactions({ transactions: [...transactions] });
      });
      return signed.map((tx) => {
        const signature = tx.signatures[owner];
        if (!signature) throw new Error("The wallet did not sign with the connected account.");
        return { [owner]: signature } as Record<Address, SignatureBytes>;
      });
    },
  };
}
