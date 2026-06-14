# Lane N: Achievement Service
Wave: 3 | Parallel: yes | Blocks: none

## Read first
- [.cursor/skills/achievement-service/SKILL.md](../skills/achievement-service/SKILL.md)
- [src/contracts/services.ts](../../src/contracts/services.ts)
- [src/config/achievements.ts](../../src/config/achievements.ts)

## You own (ONLY edit these)
- `src/services/achievement.service.ts`
- `src/commands/progression/achievements.ts`
- `.cursor/skills/achievement-service/SKILL.md`

## Do NOT edit
- `src/services/index.ts`
- `src/contracts/*`
- `src/config/*`
- `prisma/schema.prisma`
- Game/job command files

## Implement
1. `AchievementService` implementing `IAchievementService`
2. `checkAndAward()` — idempotent, threshold triggers from config
3. `getEarned()` / `getAllWithStatus()` / `getProfileBadges()`
4. One-time coin + XP rewards via economy/progression services
5. `/achievements` command — list with earned/locked states
6. Document triggers for Wave 4 event wiring
7. Update achievement-service SKILL.md

## Done when
- [ ] `npx tsc --noEmit` passes
- [ ] SKILL.md complete
- [ ] No edits outside owned files
- [ ] No double-grant of achievements
