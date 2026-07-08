"use client";

import { useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { isAdmin } from "@/lib/solana";

export default function AdminPage() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58();
  const admin = isAdmin(wallet);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [result, setResult] = useState<any>(null);

  // The airdrop controls are ONLY rendered for the admin wallet.
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

  async function call(dryRun: boolean) {
    setBusy(true);
    if (dryRun) setResult(null);
    const res = await fetch("/api/airdrop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        adminWallet: wallet,
        topN: 10,
        amountPerRank: 1000,
        dryRun,
      }),
    });
    const data = await res.json();
    if (dryRun) {
      setPreview(data);
    } else {
      setResult(data);
      setPreview(null);
    }
    setBusy(false);
  }

  return (
    <main className="max-w-xl mx-auto px-6 py-16 text-center">
      <h1 className="text-2xl font-bold text-forest-300 mb-6">🪂 Admin: Airdrop</h1>

      {/* Step 1: always preview first */}
      <button
        onClick={() => call(true)}
        disabled={busy}
        className="border border-forest-500 px-6 py-3 rounded font-bold disabled:opacity-50 mr-3"
      >
        {busy ? "Working..." : "🔍 Preview (dry run)"}
      </button>

      {/* Step 2: real send unlocks only after a preview */}
      <button
        onClick={() => {
          if (
            confirm(
              `Send real tokens to ${preview?.recipients} wallets (${preview?.totalTokens} tokens total)? This cannot be undone.`
            )
          ) {
            call(false);
          }
        }}
        disabled={busy || !preview}
        className="bg-blood px-6 py-3 rounded font-bold disabled:opacity-40"
      >
        ⚡ Send for real
      </button>

      {!preview && !result && (
        <p className="text-forest-300/50 mt-4 text-sm">
          Run a preview first. Real sends stay locked until you do.
        </p>
      )}

      {preview && (
        <div className="text-left mt-6">
          <p className="text-forest-300 font-bold mb-2">
            Preview: {preview.recipients} recipients · {preview.totalTokens} tokens total (no tokens moved)
          </p>
          <pre className="text-xs bg-forest-800 p-4 rounded overflow-auto">
            {JSON.stringify(preview.preview, null, 2)}
          </pre>
        </div>
      )}

      {result && (
        <div className="text-left mt-6">
          <p className="text-forest-300 font-bold mb-2">
            Sent {result.sent}/{result.total}.
          </p>
          <pre className="text-xs bg-forest-800 p-4 rounded overflow-auto">
            {JSON.stringify(result.results, null, 2)}
          </pre>
        </div>
      )}

      <div className="mt-8">
        <Link href="/" className="underline text-forest-300/70">
          Back home
        </Link>
      </div>
    </main>
  );
}
