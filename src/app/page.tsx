"use client";

import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletButton } from "@/components/WalletButton";
import { isAdmin, NETWORK } from "@/lib/solana";

export default function Home() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58();
  const admin = isAdmin(wallet);

  return (
    <main className="max-w-3xl mx-auto px-6 py-16 text-center">
      <p className="text-forest-300 text-xs uppercase tracking-widest mb-2">
        Network: {NETWORK}
      </p>
      <h1 className="text-4xl md:text-6xl font-bold text-forest-300 mb-4">
        Five Nights at the Forest
      </h1>
      <p className="text-forest-300/70 mb-8">
        Survive the dark. Climb the leaderboard. Earn the airdrop.
      </p>

      <div className="flex justify-center mb-10">
        <WalletButton />
      </div>

      {wallet ? (
        <div className="flex flex-col md:flex-row gap-4 justify-center">
          <Link
            href="/play"
            className="bg-forest-500 hover:bg-forest-700 px-6 py-3 rounded font-bold"
          >
            ▶ Enter the Forest
          </Link>
          <Link
            href="/leaderboard"
            className="border border-forest-500 px-6 py-3 rounded"
          >
            🏆 Leaderboard
          </Link>
          {admin && (
            <Link
              href="/admin"
              className="border border-blood text-blood px-6 py-3 rounded"
            >
              🪂 Admin: Airdrop
            </Link>
          )}
        </div>
      ) : (
        <p className="text-forest-300/50">Connect a wallet to play.</p>
      )}
    </main>
  );
}
