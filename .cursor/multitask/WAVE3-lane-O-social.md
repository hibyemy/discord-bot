# Lane O: Social / Leaderboard
Wave: 3 | Parallel: yes | Blocks: none

## Read first
- [src/contracts/services.ts](../../src/contracts/services.ts)
- [prisma/schema.prisma](../../prisma/schema.prisma)

## You own (ONLY edit these)
- `src/commands/social/leaderboard.ts`
- `src/utils/announce.ts`

## Do NOT edit
- `src/services/*`
- `src/contracts/*`
- `src/config/*`
- `prisma/schema.prisma`
- `src/events/interactionCreate.ts` (Wave 4 for announce hooks)

## Implement
1. `/leaderboard <type>` — types: richest, level, wins, streak, jobs
2. Per-guild scope by default; respect `globalLeaderboard` guild config flag
3. `announce.ts` — helper to post big wins / level-ups to `announceChannelId`
4. Paginated or top-10 embed format

## Done when
- [ ] `npx tsc --noEmit` passes
- [ ] No edits outside owned files
- [ ] Leaderboard queries use Prisma indexes efficiently
