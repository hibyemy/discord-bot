# Lane E: Game Engine Core
Wave: 2 | Parallel: no (run before F–K) | Blocks: lanes F–K

## Read first
- [.cursor/skills/game-engine/SKILL.md](../skills/game-engine/SKILL.md)
- [src/contracts/services.ts](../../src/contracts/services.ts)
- [src/contracts/events.ts](../../src/contracts/events.ts)
- [src/config/games.ts](../../src/config/games.ts)
- [src/config/economy.ts](../../src/config/economy.ts)

## You own (ONLY edit these)
- `src/services/games/base.game.ts`
- `.cursor/skills/game-engine/SKILL.md`

## Do NOT edit
- `src/services/games/*.game.ts` (lanes F–K)
- `src/commands/games/*` (lanes F–K)
- `src/services/economy.service.ts`
- `src/services/progression.service.ts`
- `src/contracts/*`
- `src/config/*`

## Implement
1. `BaseGame` interface: validate, deductBet, resolve, creditWinnings, recordStats
2. `runGameFlow()` helper — deduct → resolve → credit → XP → emit events
3. Bet validation via `economyService.validateBet()`
4. Participation XP: win 15 / loss 5
5. `GameStats` update helper
6. Export types for per-game implementations
7. Update game-engine SKILL.md

## Done when
- [ ] `npx tsc --noEmit` passes
- [ ] SKILL.md documents `runGameFlow()` and `BaseGame`
- [ ] No edits outside owned files
- [ ] Per-game lanes can import from `base.game.ts` without modification
