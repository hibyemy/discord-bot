# Gamblebot — Multitask Agent Playbook

Read this before starting any implementation lane.

## Project

Progressive fake-currency Discord economy bot (Node.js 20+, TypeScript, discord.js v14, Prisma/SQLite).

## Wave execution order

1. **Wave 0** (serial, blocking) — foundation scaffold, contracts, config, stubs
2. **Wave 1** (parallel) — lanes A, B, C, D: core services
3. **Wave 2** (parallel) — lane E (game core), then lanes F–K (6 games)
4. **Wave 3** (parallel) — lanes L, M, N, O: shop, quests, achievements, social
5. **Wave 4** (serial) — integration, admin, scheduler, help, README

## Before you start a lane

1. Read your lane brief in [`.cursor/multitask/`](.cursor/multitask/)
2. Read the matching skill in [`.cursor/skills/`](.cursor/skills/)
3. Read [`src/contracts/services.ts`](src/contracts/services.ts) — implement against these interfaces
4. Read relevant config in [`src/config/`](src/config/) — do not hardcode values

## Rules

- **One lane = one agent** — only edit files listed in your brief's "You own" section
- **Contracts are frozen** — parallel lanes implement interfaces; do not redesign APIs
- **Config is data** — lanes read config; only Wave 0 / Wave 4 edit config shapes
- **Per-guild profiles** — user identity is `(discordId, guildId)`
- **Atomic economy** — all coin changes via `EconomyService.transfer()` in Prisma `$transaction`
- **Update SKILL.md** — when implementing a service, fill in its skill in the same run

## Lane briefs

| Wave | Brief | Lane |
|------|-------|------|
| 0 | [WAVE0-foundation.md](.cursor/multitask/WAVE0-foundation.md) | Foundation (complete) |
| 1 | [WAVE1-lane-A-economy.md](.cursor/multitask/WAVE1-lane-A-economy.md) | Economy |
| 1 | [WAVE1-lane-B-progression.md](.cursor/multitask/WAVE1-lane-B-progression.md) | Progression |
| 1 | [WAVE1-lane-C-jobs.md](.cursor/multitask/WAVE1-lane-C-jobs.md) | Jobs |
| 1 | [WAVE1-lane-D-guild-config.md](.cursor/multitask/WAVE1-lane-D-guild-config.md) | Guild config |
| 2 | [WAVE2-lane-E-game-core.md](.cursor/multitask/WAVE2-lane-E-game-core.md) | Game engine |
| 2 | [WAVE2-lane-F-through-K-games.md](.cursor/multitask/WAVE2-lane-F-through-K-games.md) | Individual games |
| 3 | [WAVE3-lane-L-shop.md](.cursor/multitask/WAVE3-lane-L-shop.md) | Shop |
| 3 | [WAVE3-lane-M-quests.md](.cursor/multitask/WAVE3-lane-M-quests.md) | Quests |
| 3 | [WAVE3-lane-N-achievements.md](.cursor/multitask/WAVE3-lane-N-achievements.md) | Achievements |
| 3 | [WAVE3-lane-O-social.md](.cursor/multitask/WAVE3-lane-O-social.md) | Social / leaderboard |
| 4 | [WAVE4-integration.md](.cursor/multitask/WAVE4-integration.md) | Integration |

## Verify before merging

```bash
npm install
npx prisma generate
npx tsc --noEmit
```

## Service registry

Import services from [`src/services/index.ts`](src/services/index.ts). Parallel lanes replace only their own service file — never edit `index.ts` exports.
