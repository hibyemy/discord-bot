# Gamblebot

Progressive **fake-currency** Discord economy bot built with Node.js, TypeScript, discord.js v14, Prisma, and SQLite.

> **Important:** This bot uses fictional in-server coins with no real-world value. It is **not** intended for commercial use or for building real-money gambling services. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

## License

- [PolyForm Noncommercial License 1.0.0](LICENSE) — personal, hobby, and noncommercial use only
- [NOTICE](NOTICE) — prohibited uses (real-money gambling, commercial deployment without permission)

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
- **Games** — coinflip, dice, slots, roulette, blackjack, crash (with play-again / new game)
- **Menu hub** — `/menu` for economy, jobs, casino, shop, and progression
- **Shop** — permanent upgrades (payout, cooldown, bank interest, etc.)
- **Quests** — 3 hourly quests with streak bonuses (resets every hour UTC)
- **Achievements** — one-time milestones with coin/XP rewards
- **Admin** — `/admin` for give/take/setlevel/reset/config/stats

## Cron jobs

On bot ready, the scheduler runs:

- **Quest reset** — prunes stale quest progress (top of each hour UTC)
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

## API usage notes

The bot is designed to avoid unnecessary Discord traffic:

- **Crash** updates the live embed at most every ~2.5s and skips edits when the displayed multiplier/timer bucket is unchanged
- **Leaderboards & announcements** cache member display names for 5 minutes
- **Cron jobs** run twice daily (midnight UTC) — not continuous polling
- **Menus** only call the Discord API on user interaction (no background refresh loops)
