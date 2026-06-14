# Lane B: Progression Service
Wave: 1 | Parallel: yes | Blocks: Wave 1 lane C, Wave 2 games

## Read first
- [.cursor/skills/progression-service/SKILL.md](../skills/progression-service/SKILL.md)
- [src/contracts/services.ts](../../src/contracts/services.ts)
- [src/config/economy.ts](../../src/config/economy.ts)
- [src/config/jobs.ts](../../src/config/jobs.ts)
- [src/config/games.ts](../../src/config/games.ts)
- [src/config/shop.ts](../../src/config/shop.ts)

## You own (ONLY edit these)
- `src/services/progression.service.ts`
- `src/commands/progression/profile.ts`
- `.cursor/skills/progression-service/SKILL.md`

## Do NOT edit
- `src/services/index.ts`
- `src/contracts/*`
- `src/config/*`
- `prisma/schema.prisma`
- `src/services/economy.service.ts`
- `src/services/job.service.ts`

## Implement
1. `ProgressionService` implementing `IProgressionService`
2. `awardXp()` — multi-level-up handling
3. `xpToNextLevel()` — `100 * level^1.5` from config
4. `getUnlocks(level)` — jobs, games, shop tiers, bet cap
5. `setLevel()` — admin helper (recalc XP)
6. `xpProgress()` — current/required/percent for embed bar
7. `/profile` command — embed with level, XP bar, wallet, bank, job, badges placeholder
8. Update progression-service SKILL.md

## Done when
- [ ] `npx tsc --noEmit` passes
- [ ] SKILL.md complete
- [ ] No edits outside owned files
- [ ] Unlock gates centralized in `getUnlocks()`, not inline in commands
