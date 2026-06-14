# Lane C: Job Service
Wave: 1 | Parallel: yes | Blocks: Wave 3 quests (work events)

## Read first
- [.cursor/skills/job-service/SKILL.md](../skills/job-service/SKILL.md)
- [src/contracts/services.ts](../../src/contracts/services.ts)
- [src/config/jobs.ts](../../src/config/jobs.ts)
- Import `economyService`, `progressionService`, `shopService` from `src/services/index.ts`

## You own (ONLY edit these)
- `src/services/job.service.ts`
- `src/commands/jobs/*` (work, jobs, job set)
- `.cursor/skills/job-service/SKILL.md`

## Do NOT edit
- `src/services/index.ts`
- `src/services/economy.service.ts`
- `src/services/progression.service.ts`
- `src/contracts/*`
- `src/config/*`
- `prisma/schema.prisma`

## Implement
1. `JobService` implementing `IJobService`
2. `work()` — cooldown, payout formula, critical event (~5%)
3. `setJob()` — validate unlock by level
4. `getAvailableJobs()` — locked/unlocked/current states
5. Payout via `economyService.transfer()`; XP via `progressionService.awardXp()`
6. Shop cooldown reduction hook via `shopService.getActiveMultipliers()`
7. Commands: `/work`, `/jobs`, `/job set`
8. Update job-service SKILL.md

## Done when
- [ ] `npx tsc --noEmit` passes
- [ ] SKILL.md complete
- [ ] No edits outside owned files
- [ ] Never mutates wallet directly — uses economy service
