---
name: progression-service
description: Gamblebot progression service for XP, level-ups, unlock gates, bet cap, and profile progression. Use when implementing leveling, unlock checks, or profile display.
disable-model-invocation: true
---

# ProgressionService

## Source Files
- Service: `src/services/progression.service.ts`
- Config: `src/config/economy.ts`, `src/config/jobs.ts`, `src/config/games.ts`, `src/config/shop.ts`
- Related commands: `src/commands/progression/profile.ts`

## Responsibilities
- Award XP and handle multi-level-ups in a single call
- Expose current level and XP progress toward the next level
- Centralize unlock gates (jobs, games, shop tiers, max bet) by level
- Admin `setLevel()` helper that resets XP for the target level
- Lazy user creation on first progression touch (same defaults as economy config)

## Public API

Import singleton: `import { progressionService } from '../../services/index.js'`

### `awardXp(key, amount, source?)`
Adds `amount` XP to the user. Loops while `xp >= xpToNextLevel(level)`, subtracting required XP and incrementing level each time. Creates the user on first touch. `source` is reserved for future logging.

### `getLevel(key)`
Returns the user's current level (creates user if missing).

### `xpToNextLevel(level)`
Pure function: `Math.floor(100 * level^1.5)` from `economyConfig`. Does not hit the database.

### `xpProgress(key)`
Returns `{ current, required, percent }` for embed progress bars:
- `current` — XP accumulated toward the next level
- `required` — `xpToNextLevel(user.level)`
- `percent` — `floor(current / required * 100)`, capped at 100

### `getUnlocks(level)`
Returns `UnlockInfo` for a given level (no DB):
- `jobs` — job names from `jobConfig.tiers` where `unlockLevel <= level`
- `games` — game ids from `gamesConfig.games` where `unlockLevel <= level`
- `shopTiers` — tier numbers from `economyConfig.shopTierUnlocks` where unlock level `<= level`
- `maxBet` — `maxBetForLevel(level)` (no shop bonus; shop lane applies multipliers separately)

### `setLevel(key, level)`
Admin helper: clamps level to `>= 1`, sets `xp` to `0`. Creates user if missing.

### `isUnlocked(key, feature, requiredLevel)`
Returns `true` when `getLevel(key) >= requiredLevel`. `feature` is reserved for future per-feature overrides.

## Invariants (MUST follow)
- Level formula from config: `xpToNext = 100 * level^1.5`
- Central gate for job/game/shop tier unlocks — commands check `getUnlocks()` / `isUnlocked()`, not inline config
- User `xp` is progress toward the **next** level, not lifetime total
- Multi-level-up must consume XP for each crossed threshold in one `awardXp()` call

## Dependencies
- Prisma `User` model (`discordId`, `guildId`, `level`, `xp`)
- `economyConfig` for starting level/XP and shop tier unlock table
- `jobConfig`, `gamesConfig` for unlock lists
- `maxBetForLevel()` from `src/config/economy.ts`

## Extension Checklist
1. Add unlock entry in the relevant config file (`jobs.ts`, `games.ts`, `shop.ts`, or `economy.ts` shop tiers)
2. `getUnlocks()` picks it up automatically — no service change unless new unlock **category**
3. Wire XP awards from jobs, games, quests, achievements via `awardXp()`
4. For bet cap with shop bonus, callers combine `getUnlocks(level).maxBet` with `shopService.getActiveMultipliers()`

## Common Mistakes
- Duplicating unlock level checks in commands instead of `getUnlocks()` / `isUnlocked()`
- Treating `user.xp` as lifetime XP (it resets implicitly on level-up via subtraction)
- Hardcoding `100 * level^1.5` instead of `xpToNextLevel()` from config
- Forgetting multi-level-up loop in `awardXp()` when large XP grants are possible
- Using `getUnlocks()` max bet with shop rank bonus baked in (shop lane applies `max_bet` multiplier separately)
