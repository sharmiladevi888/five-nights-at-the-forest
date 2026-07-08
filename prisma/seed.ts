import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function randCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function main() {
  const demo = [
    { wallet: "7xKq...Aa1", highScore: 9200, nightsCleared: 5 },
    { wallet: "3mNp...Bb2", highScore: 7400, nightsCleared: 4 },
    { wallet: "9zRt...Cc3", highScore: 6100, nightsCleared: 3 },
    { wallet: "1qWe...Dd4", highScore: 3800, nightsCleared: 2 },
    { wallet: "5vBn...Ee5", highScore: 1500, nightsCleared: 1 },
  ];

  for (const d of demo) {
    await prisma.player.upsert({
      where: { wallet: d.wallet },
      update: { highScore: d.highScore, nightsCleared: d.nightsCleared },
      create: { ...d, referralCode: randCode() },
    });
  }
  console.log("Seeded demo leaderboard.");
}

main().finally(() => prisma.$disconnect());
