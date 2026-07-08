"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { RunStats } from "@/lib/score";

export default function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { publicKey } = useWallet();
  const [result, setResult] = useState<RunStats | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<null | { score: number }>(null);

  useEffect(() => {
    let game: import("phaser").Game | null = null;

    (async () => {
      const Phaser = (await import("phaser")).default;
      const { ForestScene } = await import("@/game/ForestScene");

      const scene = new ForestScene((stats) => setResult(stats));

      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: containerRef.current!,
        width: 800,
        height: 500,
        physics: { default: "arcade", arcade: { debug: false } },
        scene,
      });
    })();

    return () => {
      game?.destroy(true);
    };
  }, []);

  async function submitScore() {
    if (!result || !publicKey) return;
    setSubmitting(true);
    const ref =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("ref")
        : null;
    const res = await fetch("/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wallet: publicKey.toBase58(),
        stats: result,
        ref,
      }),
    });
    const data = await res.json();
    setSubmitted({ score: data.score });
    setSubmitting(false);
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div ref={containerRef} className="rounded overflow-hidden border border-forest-700" />
      {result && !submitted && (
        <div className="text-center">
          <p className="text-blood text-xl font-bold mb-2">You didn&apos;t make it out.</p>
          <p className="text-forest-300 mb-3">
            Nights cleared: {result.nightsCleared} · Survived {result.secondsSurvived}s
          </p>
          <button
            onClick={submitScore}
            disabled={submitting}
            className="bg-forest-500 px-6 py-2 rounded font-bold disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit score to leaderboard"}
          </button>
        </div>
      )}
      {submitted && (
        <p className="text-forest-300 font-bold">
          Score locked in: {submitted.score}. Check the leaderboard.
        </p>
      )}
    </div>
  );
}
