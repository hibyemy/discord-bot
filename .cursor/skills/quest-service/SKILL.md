---
name: quest-service
description: Gamblebot quest service for daily quests, quest progress, quest reset, and streak bonuses. Use when implementing /quests or quest event handling.
disable-model-invocation: true
---

# QuestService

## Source Files
- Service: `src/services/quest.service.ts`
- Config: `src/config/quests.ts`
- Related commands: `src/commands/progression/quests.ts`
- Cron: `src/jobs/quest-reset.ts`

## Responsibilities
- Generate 3 weighted-random daily quests per user per UTC day
- Track quest progress from `QuestEvent` emissions
- Award pooled coin + XP rewards with streak bonus when all quests are claimed
- Prune stale `QuestProgress` rows via midnight UTC reset helper

## Public API

### `getDailyQuests(key: UserKey): Promise<QuestBoard>`
Returns today's quest board, generating quests lazily if missing.

### `generateDailyQuests(key: UserKey): Promise<QuestBoard>`
Picks `dailyQuestCount` quests from the weighted pool (no duplicates), stores `QuestProgress`, and computes streak bonus from yesterday's completion.

### `updateProgress(event: QuestEvent): Promise<void>`
Applies a quest event to today's active quests. Ignores events after rewards are claimed.

### `claimReward(key: UserKey): Promise<{ coins: number; xp: number }>`
Requires all quests complete and not yet claimed. Pays coins via `economyService.transfer()` (`source: 'quest'`) and XP via `progressionService.awardXp()`. Applies streak multiplier: `1 + streakBonus × streakBonusPerDay`.

### `resetAllDaily(): Promise<number>`
Deletes `QuestProgress` rows with `questDate` older than yesterday (UTC). Returns delete count. Called by `runQuestReset()` in `src/jobs/quest-reset.ts`.

## Invariants (MUST follow)
- 3 random quests per user per day; midnight UTC reset
- Quest pool from `questConfig.pool` — never hardcode quest definitions
- Progress stored in `QuestProgress.quests` JSON (`poolId`, `progress`, `completed`)
- Streak bonus (0–7) carries when previous UTC day had all quests complete **and** claimed
- Rewards use atomic ledger (`transfer`) and `awardXp` — never mutate balances directly
- `updateProgress` is idempotent-safe for completed quests

## Quest event mapping

Commands and services must emit these `QuestEvent` types (Wave 4 wires listeners):

| `QuestEvent.type` | Quest pool `type` | Progress |
|-------------------|-------------------|----------|
| `work` | `work` | +1 |
| `game_win` | `game_win` | +1 |
| `game_played` | `game_play` | +1 |
| `wager` | `wager_total` | +`amount` |
| `deposit` | `deposit` | +`amount` |
| `pay` | `pay_user` | +`amount` |
| `shop_purchase` | `shop_purchase` | +1 |
| `game_win` / `game_played` | `win_streak` | consecutive wins (pool entry not in default pool) |

Emitters not yet wired in Wave 3 (Wave 4 integration):
- `work` — job service after `/work`
- `deposit`, `withdraw`, `pay` — economy commands
- `daily_claim` — `/daily` (no matching quest type)
- `shop_purchase` — shop service after buy
- `level_up` — progression (no matching quest type)

Games already emit `wager`, `game_played`, and `game_win` via `base.game.ts` when `eventBus` is provided.

## Dependencies
- `prisma` from `src/db.ts`
- `economyService` — `getOrCreateUser()`, `transfer()` for quest payouts
- `progressionService` — `awardXp()` for quest XP
- `questConfig` from `src/config/quests.ts`

## Extension Checklist
1. Add `QuestType` + pool entry in `src/config/quests.ts` (Wave 0 / config lane)
2. Add matching `QuestEventType` in `src/contracts/events.ts` if needed
3. Map event → quest type in `eventMatchesQuest()` and `applyEventToQuest()`
4. Emit `QuestEvent` from the feature command/service
5. Register `eventBus.onQuestEvent(questService.updateProgress)` in Wave 4 integration

## Common Mistakes
- Using local timezone instead of UTC for `questDate`
- Deleting yesterday's `QuestProgress` during reset (breaks streak calculation)
- Awarding coins without `transfer()` or XP without `awardXp()`
- Incrementing progress after `claimedAt` is set
- Forgetting weighted sampling should not pick duplicate pool entries
