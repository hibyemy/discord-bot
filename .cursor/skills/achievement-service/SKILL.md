---
name: achievement-service
description: Gamblebot achievement service for achievements, badges, milestones, and one-time rewards. Use when implementing /achievements or achievement triggers.
disable-model-invocation: true
---

# AchievementService

## Source Files
- Service: `src/services/achievement.service.ts`
- Config: `src/config/achievements.ts`
- Related commands: `src/commands/progression/achievements.ts`

## Responsibilities
- Track per-guild achievement unlocks in the `Achievement` Prisma model
- Evaluate threshold triggers from `achievementsConfig` via `checkAndAward()`
- Grant one-time coin (ledger `achievement` source) and XP rewards on first unlock
- Expose earned badges for profile display and full earned/locked lists for `/achievements`
- Idempotent awards — duplicate calls or races never double-grant

## Public API

### `checkAndAward(key, trigger, context?): Promise<AchievementDefinition[]>`
Checks all config entries matching `trigger`. For each not yet earned:
- **With `threshold`:** awards when `context.value >= threshold`
- **Without `threshold`:** awards when the caller invokes (event occurred)

Creates the `Achievement` row first (unique on `discordId + guildId + achievementId`), then credits coins via `economyService.transfer()` and XP via `progressionService.awardXp()`. Returns only newly awarded achievements.

### `getEarned(key): Promise<AchievementDefinition[]>`
Earned achievements only, in unlock order.

### `getAllWithStatus(key): Promise<AchievementDefinition[]>`
Every config achievement with `earned` flag and optional `earnedAt`.

### `getProfileBadges(key): Promise<string[]>`
Display names of earned achievements (for `/profile` badges field).

## Context contract (`checkAndAward`)

Pass `{ value: number }` for numeric triggers. Boolean/event triggers omit `threshold` in config — call when the event fires.

| Trigger | When to call | Context `value` |
|---------|--------------|-----------------|
| `net_worth` | Balance changes | `wallet + bank` |
| `total_deposited` | After deposit | Cumulative lifetime deposited |
| `daily_streak` | After daily claim | Current `dailyStreak` |
| `jobs_completed` | After work | Total jobs completed |
| `critical_work` | Critical payout | (none — event fired) |
| `job_tier_unlocked` | Job tier unlock | Unlocked tier number |
| `games_won` | Game win | Total wins |
| `win_streak` | Game win/loss | Current consecutive wins |
| `games_played` | Game resolved | Total games played |
| `biggest_win` | Large win | Single-game payout |
| `all_games_played` | Game played | (none — all types played) |
| `blackjack_natural` | Natural 21 | (none — event fired) |
| `crash_multiplier` | Crash cashout | Cashout multiplier |
| `total_paid` | After `/pay` | Cumulative coins sent |
| `level` | Level up | Current level |
| `quest_streak` | Quest board claimed | Consecutive all-complete days |
| `all_upgrades_owned` | Shop purchase | (none — every upgrade rank ≥ 1) |

Wave 4 integration wires these from game/work/economy/progression event bus listeners.

## Invariants (MUST follow)
- Achievement definitions from `achievementsConfig` only — never hardcode IDs in callers
- Idempotent award — check DB + unique constraint; no double-grant
- One-time coin + XP rewards per achievement
- Coin rewards via `economyService.transfer()` with source `achievement`
- XP rewards via `progressionService.awardXp()` with source `achievement:{id}`

## Dependencies
- `prisma` from `src/db.ts`
- `economyService` from `src/services/economy.service.ts`
- `progressionService` from `src/services/progression.service.ts`
- `achievementsConfig` from `src/config/achievements.ts`

## Extension Checklist
1. Add entry to `src/config/achievements.ts` with unique `id`, `trigger`, and optional `threshold`
2. Choose trigger key and document expected `context.value` in this skill
3. Wire `achievementService.checkAndAward()` from the owning feature or Wave 4 event bus
4. Run `/achievements` to verify earned/locked display
5. Confirm ledger shows `achievement` source and XP applied once

## Common Mistakes
- Calling `checkAndAward` without `context.value` on threshold achievements (never awards)
- Granting coins with raw Prisma wallet updates instead of `economyService.transfer()`
- Awarding before persisting the `Achievement` row (retry could double-pay)
- Hardcoding achievement IDs in game/job code instead of using config triggers
- Assuming `getProfileBadges` returns emoji — it returns achievement display names
