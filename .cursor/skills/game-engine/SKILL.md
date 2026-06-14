---
name: game-engine
description: Gamblebot game engine for coinflip, slots, blackjack, dice, roulette, crash, bets, and house edge. Use when implementing games, bet flow, or game stats.
disable-model-invocation: true
---

# Game Engine

## Source Files
- Base: `src/services/games/base.game.ts`
- Per-game: `src/services/games/*.game.ts`
- Config: `src/config/games.ts`, `src/config/economy.ts`
- Related commands: `src/commands/games/`

## Responsibilities
- Shared bet validation, wallet deduct/credit, participation XP, and `GameStats` persistence
- `runGameFlow()` orchestrates the full instant-game pipeline
- Export types (`BaseGame`, `GameResolution`, `GameFlowResult`) for per-game lanes
- Optional `EventBus` hooks for quests/achievements (wired in Wave 4 integration)

## Public API

Import from `src/services/games/base.game.ts` (not the service registry).

### Types

| Type | Purpose |
|------|---------|
| `GameResolution<TDetails>` | `{ won, payout, details? }` returned from a game's `resolve` step |
| `GameFlowResult<TDetails>` | Full flow result: bet, payout, profit, xp, user, details |
| `GameFlowOptions<TInput, TDetails>` | Options bag for `runGameFlow()` |
| `BaseGame<TInput, TDetails>` | Interface: `gameType`, `validate()`, `resolve()` |

### `validateBet(key, bet)`
Wraps `economyService.validateBet()`. Throws `ValidationError` when min/max/balance checks fail.

### `deductBet(key, bet, gameType)`
Debits wallet via `economyService.transfer()` with source `game_bet`.

### `creditWinnings(key, payout, gameType, metadata?)`
Credits wallet when `payout > 0` via source `game_win`. No-op on zero payout.

### `recordGameStats(key, gameType, bet, payout, won)`
Upserts `GameStats` (games played, W/L, wagered, won, biggest win, net profit).

### `runGameFlow(options)`
Standard pipeline:

1. `validateBet` — economy rules
2. `validateInput` — optional game-specific callback
3. `deductBet` — unless `betAlreadyDeducted: true` (interactive games)
4. `resolve` — game logic; returns `{ won, payout, details? }`
5. `creditWinnings` — credit `payout` to wallet
6. `progressionService.awardXp` — **15 XP win / 5 XP loss** (`economyConfig.gameXpWin` / `gameXpLoss`)
7. `recordGameStats`
8. Emit game + quest events when `eventBus` is provided

### `runBaseGameFlow(game, key, bet, input, options?)`
Same as `runGameFlow()` but takes a `BaseGame` instance.

### Example (instant game)

```typescript
import { runGameFlow } from '../../services/games/base.game.js';
import type { GameResolution } from '../../services/games/base.game.js';

type CoinflipInput = 'heads' | 'tails';

export async function playCoinflip(key: UserKey, bet: number, choice: CoinflipInput) {
  return runGameFlow({
    key,
    gameType: 'coinflip',
    bet,
    input: choice,
    validateInput: (_key, _bet, side) => {
      if (side !== 'heads' && side !== 'tails') {
        throw new ValidationError('Choose heads or tails.');
      }
    },
    resolve: async (_key, amount, side): Promise<GameResolution> => {
      const flip = Math.random() < 0.5 ? 'heads' : 'tails';
      const won = flip === side;
      return {
        won,
        payout: won ? amount * 2 : 0,
        details: { choice: side, flip },
      };
    },
  });
}
```

## Invariants (MUST follow)
- Bet deducted before outcome; winnings credited after
- Participation XP: win 15 / loss 5 (`economyConfig`)
- Interactive sessions: 60s timeout, `GameSession` model; deduct at session start, pass `betAlreadyDeducted: true` on final `runGameFlow`
- Game flow: deduct → resolve → credit → XP → stats → quest/achievement hooks (via `EventBus`)
- Per-game commands must also check `progressionService.getUnlocks()` and `guildConfigService.isGameDisabled()` before play
- House edge from `src/config/games.ts` — implement in each game's `resolve`, not in base

## Dependencies
- `economyService` — `validateBet`, `transfer` (bet deduct / win credit)
- `progressionService` — `awardXp`
- `prisma` — `GameStats` upsert
- `EventBus` (optional) — `emitGameEvent`, `emitQuestEvent` for Wave 4 wiring

## Extension Checklist
1. Add game definition to `src/config/games.ts` (Wave 0 / config lane only)
2. Create `src/services/games/<id>.game.ts` with `resolve` logic and house edge
3. Create `src/commands/games/<id>.ts` — unlock + disabled checks, then `runGameFlow()`
4. Interactive games: persist `GameSession`, deduct bet on start, call `runGameFlow` with `betAlreadyDeducted: true` on completion
5. Pass `eventBus` once integration lane wires the bus singleton

## Common Mistakes
- Reimplementing bet deduct/credit in per-game files — use `runGameFlow()` instead
- Crediting before resolving — base enforces deduct → resolve → credit order
- Forgetting `betAlreadyDeducted` on interactive finales (double-charges the player)
- Hardcoding XP values — read `economyConfig.gameXpWin` / `gameXpLoss`
- Skipping guild disable / level unlock checks in commands (not handled by base)
