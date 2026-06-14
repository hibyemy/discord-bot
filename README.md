# Gamblebot

Progressive fake-currency Discord economy bot built with Node.js, TypeScript, discord.js v14, Prisma, and SQLite.

## Requirements

- Node.js 20+
- A Discord application with bot token and client ID

## Setup

1. **Clone and install**

   ```bash
   npm install
   ```

2. **Environment**

   Copy `.env.example` to `.env` and fill in:

   | Variable | Description |
   |----------|-------------|
   | `DISCORD_TOKEN` | Bot token from the Discord Developer Portal |
   | `DISCORD_CLIENT_ID` | Application client ID |
   | `OWNER_IDS` | Comma-separated Discord user IDs with global admin access |
   | `DATABASE_URL` | SQLite path, e.g. `file:./dev.db` |
   | `NODE_ENV` | `development`, `production`, or `test` |

3. **Database**

   ```bash
   npm run db:generate
   npm run db:push
   ```

4. **Register slash commands**

   Guild-scoped (recommended for development):

   ```bash
   npm run register-commands -- YOUR_GUILD_ID
   ```

   Global (can take up to an hour to propagate):

   ```bash
   npm run register-commands
   ```

5. **Run**

   Development (watch mode):

   ```bash
   npm run dev
   ```

   Production:

   ```bash
   npm run build
   npm start
   ```

## Features

- **Economy** — wallet, bank, daily rewards, deposits, P2P transfers
- **Jobs** — tiered jobs unlocked by level with cooldowns
- **Games** — coinflip, dice, slots, roulette, blackjack, crash
- **Shop** — permanent upgrades (payout, cooldown, bank interest, etc.)
- **Quests** — 3 daily quests with streak bonuses (resets midnight UTC)
- **Achievements** — one-time milestones with coin/XP rewards
- **Admin** — `/admin` for give/take/setlevel/reset/config/stats

## Cron jobs

On bot ready, the scheduler runs:

- **Quest reset** — prunes stale quest progress (midnight UTC)
- **Bank interest** — daily interest on bank balances (midnight UTC)

## Project structure

- `src/commands/` — slash commands
- `src/services/` — business logic
- `src/config/` — tunable game/economy data
- `src/contracts/` — shared interfaces
- `prisma/schema.prisma` — database schema

## Verify

```bash
npx tsc --noEmit
npm run build
```
