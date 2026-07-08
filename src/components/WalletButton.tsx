"use client";

import dynamic from "next/dynamic";

// Wallet button touches window; load client-only to avoid SSR mismatch.
export const WalletButton = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);
