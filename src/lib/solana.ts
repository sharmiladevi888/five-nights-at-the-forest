import { Connection, clusterApiUrl } from "@solana/web3.js";

export const NETWORK =
  (process.env.NEXT_PUBLIC_SOLANA_NETWORK as "devnet" | "mainnet-beta") ||
  "devnet";

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ||
  clusterApiUrl(NETWORK === "mainnet-beta" ? "mainnet-beta" : "devnet");

export function getConnection(): Connection {
  return new Connection(RPC_URL, "confirmed");
}

export const ADMIN_WALLET = process.env.NEXT_PUBLIC_ADMIN_WALLET || "";

export function isAdmin(wallet?: string | null): boolean {
  if (!wallet || !ADMIN_WALLET) return false;
  return wallet === ADMIN_WALLET;
}

export function shortWallet(w: string): string {
  if (w.length <= 8) return w;
  return `${w.slice(0, 4)}...${w.slice(-4)}`;
}
