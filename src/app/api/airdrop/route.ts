import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/solana";
import { sendRewardTokens } from "@/lib/airdrop";

// Admin-only. Distributes reward tokens to the top-N players by score.
// When `dryRun` is true, NO tokens move and NOTHING is written to the DB —
// it just returns exactly who would be paid and how much, so the admin can
// eyeball the batch before committing real transfers.
export async function POST(req: NextRequest) {
  const {
    adminWallet,
    topN = 10,
    amountPerRank = 1000,
    dryRun = true, // safe by default: you must explicitly opt in to real sends
  } = await req.json();

  // Hard gate: only the configured admin wallet may trigger airdrops.
  if (!isAdmin(adminWallet)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const top = await prisma.player.findMany({
    orderBy: { highScore: "desc" },
    take: topN,
  });

  // ---- DRY RUN: preview only, no chain writes, no DB writes ----
  if (dryRun) {
    const preview = top.map((p, i) => ({
      rank: i + 1,
      wallet: p.wallet,
      highScore: p.highScore,
      amount: (topN - i) * amountPerRank,
    }));
    const totalTokens = preview.reduce((sum, r) => sum + r.amount, 0);
    return NextResponse.json({
      dryRun: true,
      recipients: preview.length,
      totalTokens,
      preview,
    });
  }

  // ---- LIVE: real on-chain SPL transfers ----
  const results: Array<{
    wallet: string;
    amount: number;
    txSignature?: string;
    status: "sent" | "skipped" | "failed";
    reason?: string;
  }> = [];

  for (let i = 0; i < top.length; i++) {
    const p = top[i];
    const amount = (topN - i) * amountPerRank;

    // Idempotency: never pay the same wallet/amount twice.
    const already = await prisma.airdrop.findFirst({
      where: { wallet: p.wallet, amount, txSignature: { not: null } },
    });
    if (already) {
      results.push({ wallet: p.wallet, amount, status: "skipped", reason: "already sent" });
      continue;
    }

    try {
      const txSignature = await sendRewardTokens(p.wallet, amount);
      await prisma.airdrop.create({
        data: { playerId: p.id, wallet: p.wallet, amount, txSignature },
      });
      results.push({ wallet: p.wallet, amount, txSignature, status: "sent" });
    } catch (err: any) {
      await prisma.airdrop.create({
        data: { playerId: p.id, wallet: p.wallet, amount, txSignature: null },
      });
      results.push({
        wallet: p.wallet,
        amount,
        status: "failed",
        reason: err?.message ?? "transfer failed",
      });
    }
  }

  const sent = results.filter((r) => r.status === "sent").length;
  return NextResponse.json({ dryRun: false, sent, total: results.length, results });
}
