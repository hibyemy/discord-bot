# Lane D: Guild Config Service
Wave: 1 | Parallel: yes | Blocks: Wave 4 admin config UI

## Read first
- [.cursor/skills/guild-config-service/SKILL.md](../skills/guild-config-service/SKILL.md)
- [src/contracts/services.ts](../../src/contracts/services.ts)
- [src/config/economy.ts](../../src/config/economy.ts)

## You own (ONLY edit these)
- `src/services/guild-config.service.ts`
- `.cursor/skills/guild-config-service/SKILL.md`

## Do NOT edit
- `src/services/index.ts`
- `src/contracts/*`
- `src/config/*`
- `prisma/schema.prisma`
- `src/commands/admin/*` (Wave 4)

## Implement
1. `GuildConfigService` implementing `IGuildConfigService`
2. `getConfig()` — defaults when no `GuildConfig` row
3. `updateConfig()` — partial updates
4. `isGameDisabled()` / `isCommandDisabled()`
5. `getTransferTax()` — override or default 5%
6. Defaults: `dailyBonusMultiplier: 1.0`, empty disabled arrays, `welcomeBonus: 0`
7. Update guild-config-service SKILL.md

## Done when
- [ ] `npx tsc --noEmit` passes
- [ ] SKILL.md complete
- [ ] No edits outside owned files
- [ ] Service is usable by economy lane via `guildConfigService` import
