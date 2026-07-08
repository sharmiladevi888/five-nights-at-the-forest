"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";

const GameCanvas = dynamic(() => import("@/components/GameCanvas"), {
  ssr: false,
});

export default function PlayPage() {
  const { publicKey } = useWallet();

  if (!publicKey) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-16 text-center">
        <p className="text-forest-300">Connect your wallet first.</p>
        <Link href="/" className="underline text-forest-300/70">
          Back home
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <div className="flex justify-between items-center mb-6">
        <Link href="/" className="text-forest-300/70 underline">
          ← Home
        </Link>
        <span className="text-forest-300/70 text-sm">WASD / arrows to move</span>
      </div>
      <GameCanvas />
    </main>
  );
}
