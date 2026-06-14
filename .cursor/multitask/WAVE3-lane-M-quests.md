# Lane M: Quest Service
Wave: 3 | Parallel: yes | Blocks: Wave 4 scheduler wiring

## Read first
- [.cursor/skills/quest-service/SKILL.md](../skills/quest-service/SKILL.md)
- [src/contracts/services.ts](../../src/contracts/services.ts)
- [src/contracts/events.ts](../../src/contracts/events.ts)
- [src/config/quests.ts](../../src/config/quests.ts)

## You own (ONLY edit these)
- `src/services/quest.service.ts`
- `src/commands/progression/quests.ts`
- `src/jobs/quest-reset.ts`
- `.cursor/skills/quest-service/SKILL.md`

## Do NOT edit
- `src/services/index.ts`
- `src/contracts/*`
- `src/config/*`
- `prisma/schema.prisma`
- `src/jobs/scheduler.ts` (Wave 4)
- Game/job command files

## Implement
1. `QuestService` implementing `IQuestService`
2. `generateDailyQuests()` — 3 random from pool (weighted)
3. `updateProgress()` — handle `QuestEvent` types
4. `claimReward()` — coins + XP, streak bonus (+20%/day, cap 7)
5. `resetAllDaily()` — midnight UTC cron helper
6. `/quests` command — show board, claim button
7. Document event types commands must emit (Wave 4 wires listeners)
8. Update quest-service SKILL.md

## Done when
- [ ] `npx tsc --noEmit` passes
- [ ] SKILL.md complete
- [ ] No edits outside owned files
