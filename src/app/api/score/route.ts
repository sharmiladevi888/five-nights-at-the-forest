import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeScore, statsArePlausible, RunStats } from "@/lib/score";

function randCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { wallet, stats, ref } = body as {
    wallet: string;
    stats: RunStats;
    ref?: string | null;
  };

  if (!wallet || !stats) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  // Server-side validation — never trust the client's number.
  if (!statsArePlausible(stats)) {
    return NextResponse.json({ error: "implausible stats" }, { status: 422 });
  }

  const score = computeScore(stats);

  // Resolve referrer (if any) before creating the player.
  let referredById: string | undefined;
  if (ref) {
    const referrer = await prisma.player.findUnique({
      where: { referralCode: ref },
    });
    if (referrer && referrer.wallet !== wallet) referredById = referrer.id;
  }

  const player = await prisma.player.upsert({
    where: { wallet },
    update: {},
    create: { wallet, referralCode: randCode(), referredById },
  });

  await prisma.session.create({
    data: {
      playerId: player.id,
      score,
      nightsCleared: stats.nightsCleared,
      secondsSurvived: stats.secondsSurvived,
      creaturesEvaded: stats.creaturesEvaded,
      itemsCollected: stats.itemsCollected,
    },
  });

  // Update high score / nights if this run beat their best.
  if (score > player.highScore) {
    await prisma.player.update({
      where: { id: player.id },
      data: {
        highScore: score,
        nightsCleared: Math.max(player.nightsCleared, stats.nightsCleared),
      },
    });

    // Reward the referrer when their referee clears night 1+.
    if (player.referredById && stats.nightsCleared >= 1) {
      await prisma.player.update({
        where: { id: player.referredById },
        data: { highScore: { increment: 250 } },
      });
    }
  }

  return NextResponse.json({ score, referralCode: player.referralCode });
}
