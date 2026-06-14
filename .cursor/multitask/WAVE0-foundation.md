# Lane 0: Foundation
Wave: 0 | Parallel: no | Blocks: all lanes

**Status: COMPLETE**

## Read first
- Root plan (gamblebot_progressive_discord_bot plan)
- [AGENTS.md](../../AGENTS.md)

## You own (ONLY edit these)
- `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`
- `prisma/schema.prisma`
- `src/index.ts`, `src/bot.ts`, `src/db.ts`
- `src/contracts/*`
- `src/config/*`
- `src/utils/*`
- `src/commands/loader.ts`, `src/commands/types.ts`, `src/commands/ping.ts`
- `src/events/*`
- `src/services/index.ts` + stub service files
- `.cursor/multitask/*`
- `.cursor/skills/*/SKILL.md` (stubs)
- `AGENTS.md`

## Do NOT edit
- Lane-owned command implementations (Wave 1+)
- Lane-owned service business logic (Wave 1+)

## Implement
- [x] Project scaffold with scripts
- [x] Full Prisma schema (all models)
- [x] Service contracts and error types
- [x] Config files with final shapes and plan values
- [x] Utils (embeds, rng, cooldowns)
- [x] Bot shell with command auto-loader
- [x] Service stub singletons
- [x] Multitask briefs for all lanes
- [x] Skill stubs for all 8 services
- [x] `tsc --noEmit` passes

## Done when
- [x] `npx tsc --noEmit` passes
- [x] `npx prisma generate` succeeds
- [x] All lane briefs exist
- [x] No business logic in services (stubs only)
