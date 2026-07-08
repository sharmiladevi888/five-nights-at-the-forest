"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { RunStats } from "@/lib/score";

interface Hud {
  night: number;
  time: number;
  battery: number;
  health: number;
  score: number;
  block: string;
}

export default function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { publicKey } = useWallet();
  const [hud, setHud] = useState<Hud | null>(null);
  const [result, setResult] = useState<RunStats | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<null | { score: number }>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!started) return;
    let engine: import("@/game/VoxelForest").VoxelForest | null = null;

    (async () => {
      const { VoxelForest } = await import("@/game/VoxelForest");
      engine = new VoxelForest(
        (stats) => setResult(stats),
        (h) => setHud(h)
      );
      engine.start(containerRef.current!);
    })();

    return () => engine?.dispose();
  }, [started]);

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
      body: JSON.stringify({ wallet: publicKey.toBase58(), stats: result, ref }),
    });
    const data = await res.json();
    setSubmitted({ score: data.score });
    setSubmitting(false);
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-[800px] h-[500px] rounded overflow-hidden border border-forest-700">
        <div ref={containerRef} className="absolute inset-0" />

        {started && hud && !result && (
          <div className="absolute top-3 left-3 font-mono text-forest-300 text-sm leading-6 pointer-events-none">
            <div>NIGHT {hud.night}/5 · {hud.time}s</div>
            <div>BATTERY {hud.battery}% · HP {hud.health}</div>
            <div>SCORE {hud.score}</div>
            <div className="text-forest-300/70">BLOCK: {hud.block?.toUpperCase()} (1-4)</div>
          </div>
        )}

        {started && !result && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-4 h-4 border border-white/70 rounded-sm" />
          </div>
        )}

        {!started && (
          <button
            onClick={() => setStarted(true)}
            className="absolute inset-0 flex flex-col items-center justify-center bg-forest-900/80 text-forest-300"
          >
            <span className="text-2xl font-bold mb-2">▶ Enter the Forest</span>
            <span className="text-sm text-forest-300/70">Click to play · WASD move · mouse look</span>
            <span className="text-xs text-forest-300/50 mt-1">Left-click break · right-click place · 1-4 pick block</span>
          </button>
        )}

        {result && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-forest-900/85 text-center px-6">
            {!submitted ? (
              <>
                <p className="text-blood text-2xl font-bold mb-2">The forest took you.</p>
                <p className="text-forest-300 mb-4">
                  Nights cleared: {result.nightsCleared} · Survived {result.secondsSurvived}s
                </p>
                <button
                  onClick={submitScore}
                  disabled={submitting}
                  className="bg-forest-500 px-6 py-2 rounded font-bold disabled:opacity-50"
                >
                  {submitting ? "Submitting..." : "Submit score to leaderboard"}
                </button>
              </>
            ) : (
              <p className="text-forest-300 font-bold">
                Score locked in: {submitted.score}. Check the leaderboard.
              </p>
            )}
          </div>
        )}
      </div>
      <p className="text-forest-300/50 text-xs font-mono">
        Click to capture mouse · WASD move · left-click break · right-click place · 1-4 select block · Esc release
      </p>
    </div>
  );
}
