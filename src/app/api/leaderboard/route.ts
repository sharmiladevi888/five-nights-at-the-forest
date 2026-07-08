import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { shortWallet } from "@/lib/solana";

export const dynamic = "force-dynamic";

export async function GET() {
  const players = await prisma.player.findMany({
    orderBy: { highScore: "desc" },
    take: 100,
  });
  return NextResponse.json(
    players.map((p, i) => ({
      rank: i + 1,
      wallet: shortWallet(p.wallet),
      fullWallet: p.wallet,
      highScore: p.highScore,
      nightsCleared: p.nightsCleared,
    }))
  );
}
