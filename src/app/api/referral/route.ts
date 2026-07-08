import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Returns a wallet's referral code + how many players they've referred.
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "missing wallet" }, { status: 400 });

  const player = await prisma.player.findUnique({
    where: { wallet },
    include: { referrals: true },
  });
  if (!player) return NextResponse.json({ referralCode: null, count: 0 });

  return NextResponse.json({
    referralCode: player.referralCode,
    count: player.referrals.length,
  });
}
