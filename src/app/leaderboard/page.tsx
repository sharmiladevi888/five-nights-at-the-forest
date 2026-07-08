import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { shortWallet } from "@/lib/solana";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const players = await prisma.player.findMany({
    orderBy: { highScore: "desc" },
    take: 100,
  });

  return (
    <main className="max-w-2xl mx-auto px-6 py-12">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-forest-300">🏆 Leaderboard</h1>
        <Link href="/" className="text-forest-300/70 underline">
          ← Home
        </Link>
      </div>
      <table className="w-full text-left">
        <thead className="text-forest-300/60 text-xs uppercase">
          <tr>
            <th className="py-2">#</th>
            <th>Wallet</th>
            <th>Nights</th>
            <th className="text-right">Score</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p, i) => (
            <tr key={p.id} className="border-t border-forest-800">
              <td className="py-2 text-forest-300/70">{i + 1}</td>
              <td className="font-mono">{shortWallet(p.wallet)}</td>
              <td>{p.nightsCleared}</td>
              <td className="text-right font-bold text-forest-300">{p.highScore}</td>
            </tr>
          ))}
          {players.length === 0 && (
            <tr>
              <td colSpan={4} className="py-6 text-center text-forest-300/50">
                No runs yet. Be the first.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
