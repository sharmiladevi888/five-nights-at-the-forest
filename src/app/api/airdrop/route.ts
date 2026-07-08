import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/solana";
import { sendRewardTokens } from "@/lib/airdrop";

// Admin-only. Distributes reward tokens to the top-N players by score via
// real on-chain SPL transfers (devnet or mainnet, per NEXT_PUBLIC_SOLANA_NETWORK).
export async function POST(req: NextRequest) {
  const { adminWallet, topN = 10, amountPerRank = 1000 } = await req.json();

  // Hard gate: only the configured admin wallet may trigger airdrops.
  if (!isAdmin(adminWallet)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const top = await prisma.player.findMany({
    orderBy: { highScore: "desc" },
    take: topN,
  });

  const results: Array<{
    wallet: string;
    amount: number;
    txSignature?: string;
    status: "sent" | "skipped" | "failed";
    reason?: string;
  }> = [];

  for (let i = 0; i < top.length; i++) {
    const p = top[i];
    // Higher ranks get more. Rank 1 = topN * amountPerRank.
    const amount = (topN - i) * amountPerRank;

    // Idempotency: never pay the same wallet twice in a run/campaign.
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
      // Record the failed attempt (no signature) so we have an audit trail.
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
  return NextResponse.json({ sent, total: results.length, results });
}
