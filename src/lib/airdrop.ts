import {
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  transfer,
  getMint,
} from "@solana/spl-token";
import bs58 from "bs58";
import { getConnection } from "./solana";

// Loads the admin signer from the base58 secret key in the environment.
// Throws a clear error if it's missing/malformed so the route can 500 cleanly.
export function getAdminKeypair(): Keypair {
  const secret = process.env.ADMIN_SECRET_KEY;
  if (!secret) throw new Error("ADMIN_SECRET_KEY not configured");
  try {
    return Keypair.fromSecretKey(bs58.decode(secret.trim()));
  } catch {
    throw new Error("ADMIN_SECRET_KEY is not a valid base58 secret key");
  }
}

export function getRewardMint(): PublicKey {
  const mint = process.env.NEXT_PUBLIC_REWARD_TOKEN_MINT;
  if (!mint) throw new Error("NEXT_PUBLIC_REWARD_TOKEN_MINT not configured");
  return new PublicKey(mint);
}

// Sends `uiAmount` of the reward token from the admin wallet to `recipient`.
// Returns the confirmed transaction signature. Amount is scaled by the
// mint's decimals so callers pass whole tokens, not raw base units.
export async function sendRewardTokens(
  recipientWallet: string,
  uiAmount: number
): Promise<string> {
  const connection: Connection = getConnection();
  const admin = getAdminKeypair();
  const mint = getRewardMint();

  const mintInfo = await getMint(connection, mint);
  const rawAmount = BigInt(Math.round(uiAmount * 10 ** mintInfo.decimals));

  // Source ATA (admin). Must already be funded with the reward token.
  const source = await getOrCreateAssociatedTokenAccount(
    connection,
    admin,
    mint,
    admin.publicKey
  );

  // Destination ATA (player). Created + rent-funded by admin if missing.
  const recipient = new PublicKey(recipientWallet);
  const dest = await getOrCreateAssociatedTokenAccount(
    connection,
    admin,
    mint,
    recipient
  );

  const signature = await transfer(
    connection,
    admin,
    source.address,
    dest.address,
    admin.publicKey,
    rawAmount
  );

  await connection.confirmTransaction(signature, "confirmed");
  return signature;
}
