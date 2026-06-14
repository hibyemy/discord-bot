# Lanes F–K: Individual Games (Index)
Wave: 2 | Parallel: yes (after lane E) | Blocks: Wave 3 quests/achievements

Launch up to 6 agents in parallel — one per game. Each lane owns exactly 2 files (+ optional component handler).

## Read first
- [.cursor/skills/game-engine/SKILL.md](../skills/game-engine/SKILL.md)
- [src/services/games/base.game.ts](../../src/services/games/base.game.ts)
- [src/config/games.ts](../../src/config/games.ts)

## Shared rules (all game lanes)
- Call `runGameFlow()` from `base.game.ts` — do not reimplement bet deduct/credit
- Check unlock level via `progressionService.getUnlocks()`
- Check `guildConfigService.isGameDisabled()` before play
- House edge from `src/config/games.ts`

## Do NOT edit (any game lane)
- `src/services/games/base.game.ts`
- `src/contracts/*`
- `src/config/*`
- Other game files
- `src/services/index.ts`

---

## Lane F: Coinflip
**Owns:** `src/services/games/coinflip.game.ts`, `src/commands/games/coinflip.ts`

| Field | Value |
|-------|-------|
| Unlock | Lv 1 |
| Command | `/coinflip <bet> <heads/tails>` |
| House edge | ~2% |
| Interactive | No |

**Implement:** heads/tails resolution, payout embed

---

## Lane G: Dice
**Owns:** `src/services/games/dice.game.ts`, `src/commands/games/dice.ts`

| Field | Value |
|-------|-------|
| Unlock | Lv 3 |
| Command | `/dice <bet>` — roll 1–100 vs bot |
| House edge | ~3% |
| Interactive | No |

**Implement:** roll comparison, win/loss/tie handling

---

## Lane H: Slots
**Owns:** `src/services/games/slots.game.ts`, `src/commands/games/slots.ts`

| Field | Value |
|-------|-------|
| Unlock | Lv 5 |
| Command | `/slots <bet>` — 3-reel embed |
| House edge | ~5% |
| Interactive | No |

**Implement:** 3-reel symbols, payout table, visual embed

---

## Lane I: Roulette
**Owns:** `src/services/games/roulette.game.ts`, `src/commands/games/roulette.ts`

| Field | Value |
|-------|-------|
| Unlock | Lv 10 |
| Command | `/roulette <bet> <red/black/number>` |
| House edge | ~2.7% |
| Interactive | No |

**Implement:** red/black/number bets, European-style wheel

---

## Lane J: Blackjack
**Owns:** `src/services/games/blackjack.game.ts`, `src/commands/games/blackjack.ts`, optionally `src/events/components/blackjack.handler.ts`

| Field | Value |
|-------|-------|
| Unlock | Lv 15 |
| Command | `/blackjack <bet>` — hit/stand/double buttons |
| House edge | ~1% |
| Interactive | Yes (60s timeout) |

**Implement:** hand logic, `GameSession` persistence, button components

---

## Lane K: Crash
**Owns:** `src/services/games/crash.game.ts`, `src/commands/games/crash.ts`, optionally `src/events/components/crash.handler.ts`

| Field | Value |
|-------|-------|
| Unlock | Lv 25 |
| Command | `/crash <bet>` — cash-out button |
| House edge | ~4% |
| Interactive | Yes (60s timeout) |

**Implement:** rising multiplier, bust point, cash-out timing

---

## Done when (per lane)
- [ ] `npx tsc --noEmit` passes
- [ ] Only owned files edited
- [ ] Game uses `runGameFlow()` from base
