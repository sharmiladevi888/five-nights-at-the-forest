# Five Nights at the Forest 🌲

A Web3 play-to-earn survival game on **Solana**. Voxel/block forest (Minecraft/Roblox vibe) with Five Nights at Freddy's tension. Connect a wallet, survive 5 escalating nights, climb the global leaderboard, and receive an admin-triggered SPL token airdrop.

> Status: **playable starter**. The full survival loop, wallet connect, scoring, leaderboard, referrals, and an admin-gated airdrop flow all work on devnet. The on-chain SPL transfer inside the airdrop is stubbed where marked (`src/app/api/airdrop/route.ts`) so you can wire your own mint safely.

## Stack
- **Next.js 14** (App Router) + TypeScript + Tailwind
- **Phaser 3** game engine (`src/game/ForestScene.ts`)
- **@solana/wallet-adapter** (Phantom, Solflare)
- **Prisma** + SQLite locally / Postgres in prod
- **Anchor** program (`programs/forest`) for on-chain score registry + admin-gated airdrop records

## Quick start
```bash
# 1. install
npm install

# 2. env
cp .env.example .env
#   set NEXT_PUBLIC_ADMIN_WALLET to your wallet address (unlocks /admin)

# 3. database
npm run db:push
npm run db:seed      # demo leaderboard

# 4. run
npm run dev          # http://localhost:3000
```
Connect a wallet, hit **Enter the Forest**, survive, submit your score.

## Switching devnet ↔ mainnet
One variable in `.env`:
```
NEXT_PUBLIC_SOLANA_NETWORK=devnet        # or mainnet-beta
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
```

## Create the reward token (devnet)
```bash
solana config set --url devnet
spl-token create-token          # copy the mint address
spl-token create-account <MINT>
spl-token mint <MINT> 1000000
```
Put the mint in `NEXT_PUBLIC_REWARD_TOKEN_MINT`.

## Airdrop (admin only)
The **Send Airdrop** button and `/api/airdrop` are gated to `NEXT_PUBLIC_ADMIN_WALLET`. Everyone else gets a 403 / hidden UI. To make transfers live, wire `ADMIN_SECRET_KEY` + `@solana/spl-token` `transfer()` where marked with `TODO(live)` in the airdrop route.

## Anchor program
```bash
anchor build
anchor deploy --provider.cluster devnet
```
Instructions: `initialize` (sets admin), `submit_score` (on-chain high score PDA), `record_airdrop` (admin-gated, `Unauthorized` error otherwise).

## How scoring works
`(nights × 1000) + (seconds × 5) + (creatures evaded × 50) + (items × 25)`. Validated server-side in `src/lib/score.ts` so clients can't forge scores.

## Referrals
Share `?ref=YOURCODE`. When a referee clears night 1+, the referrer gets +250. Codes are auto-generated per wallet.

## Roadmap
Tracked in ClickUp. Next up: live SPL transfers, richer enemy AI, sprite art, mainnet hardening.
