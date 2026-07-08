"use client";

import { useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { isAdmin } from "@/lib/solana";

export default function AdminPage() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58();
  const admin = isAdmin(wallet);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<any>(null);

  // The Send Airdrop control is ONLY rendered/enabled for the admin wallet.
  if (!admin) {
    return (
      <main className="max-w-xl mx-auto px-6 py-16 text-center">
        <p className="text-blood font-bold">Not authorized.</p>
        <p className="text-forest-300/60">Airdrops are admin-only.</p>
        <Link href="/" className="underline text-forest-300/70">
          Back home
        </Link>
      </main>
    );
  }

  async function sendAirdrop() {
    setSending(true);
    const res = await fetch("/api/airdrop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminWallet: wallet, topN: 10, amountPerRank: 1000 }),
    });
    setResult(await res.json());
    setSending(false);
  }

  return (
    <main className="max-w-xl mx-auto px-6 py-16 text-center">
      <h1 className="text-2xl font-bold text-forest-300 mb-6">🪂 Admin: Airdrop</h1>
      <button
        onClick={sendAirdrop}
        disabled={sending}
        className="bg-blood px-8 py-3 rounded font-bold disabled:opacity-50"
      >
        {sending ? "Sending..." : "Send Airdrop to Top 10"}
      </button>
      {result && (
        <pre className="text-left mt-6 text-xs bg-forest-800 p-4 rounded overflow-auto">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
      <div className="mt-6">
        <Link href="/" className="underline text-forest-300/70">
          Back home
        </Link>
      </div>
    </main>
  );
}
