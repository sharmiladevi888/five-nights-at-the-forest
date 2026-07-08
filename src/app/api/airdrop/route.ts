import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/solana";

// Admin-only. Distributes reward amounts to the top-N players by score.
// SPL transfer signing is stubbed where marked — wire ADMIN_SECRET_KEY +
// spl-token transfer to make it live on devnet (see README).
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

  const results = [];
  for (let i = 0; i < top.length; i++) {
    const p = top[i];
    // Higher ranks get more. Rank 1 = topN * amountPerRank.
    const amount = (topN - i) * amountPerRank;

    // TODO(live): sign + send SPL transfer here using ADMIN_SECRET_KEY and
    // @solana/spl-token transfer(); capture the real signature.
    const txSignature = `devnet-sim-${p.id}`;

    await prisma.airdrop.create({
      data: { playerId: p.id, wallet: p.wallet, amount, txSignature },
    });
    results.push({ wallet: p.wallet, amount, txSignature });
  }

  return NextResponse.json({ sent: results.length, results });
}
