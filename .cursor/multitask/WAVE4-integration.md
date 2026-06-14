# Lane 4: Integration
Wave: 4 | Parallel: no (serial) | Blocks: release

## Read first
- [AGENTS.md](../../AGENTS.md)
- All lane briefs for context
- [src/contracts/events.ts](../../src/contracts/events.ts)

## You own (ONLY edit these)
- `src/jobs/scheduler.ts`
- `src/commands/admin/*`
- `src/commands/help.ts` (or `src/commands/progression/help.ts`)
- `src/events/interactionCreate.ts` (component routing for blackjack/crash)
- `src/events/components/*` (if not created by game lanes)
- `README.md`
- Event bus wiring in `src/bot.ts` or new `src/events/bus.ts`
- Cross-service hook registration

## Do NOT edit
- Individual service implementations (unless fixing import bugs)
- `src/config/*` (unless integration requires minor fixes)
- `prisma/schema.prisma`

## Implement
1. Event bus — wire `GameEvent` / `QuestEvent` listeners for quest + achievement services
2. `scheduler.ts` — daily quest reset (midnight UTC), bank interest, streak checks
3. Admin commands: `/admin give`, `/admin take`, `/admin setlevel`, `/admin reset`, `/admin config`, `/admin stats`
4. Component routing in `interactionCreate.ts` for blackjack/crash buttons
5. `/help` — command list with game odds
6. README — setup, env vars, deploy, register-commands
7. Full `npx tsc --noEmit` + smoke test command registration
8. `AdminLog` entries for all admin actions

## Done when
- [x] `npx tsc --noEmit` passes
- [x] All commands registered via `npm run register-commands`
- [x] Cron jobs start on bot ready
- [x] Quest/achievement hooks fire on game/work events
- [x] README documents full bot usage
