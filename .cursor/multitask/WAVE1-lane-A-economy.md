# Lane A: Economy Service
Wave: 1 | Parallel: yes | Blocks: Wave 2 games, Wave 3 shop/quests

## Read first
- [.cursor/skills/economy-service/SKILL.md](../skills/economy-service/SKILL.md)
- [src/contracts/services.ts](../../src/contracts/services.ts)
- [src/config/economy.ts](../../src/config/economy.ts)

## You own (ONLY edit these)
- `src/services/economy.service.ts`
- `src/commands/economy/*` (balance, daily, deposit, withdraw, pay, transactions)
- `.cursor/skills/economy-service/SKILL.md`

## Do NOT edit
- `src/services/index.ts`
- `src/contracts/*`
- `src/config/*`
- `prisma/schema.prisma`
- Other service files
- `src/events/interactionCreate.ts`

## Implement
1. `EconomyService` implementing `IEconomyService`
2. `getOrCreateUser()` — starting balance 1000 on first touch
3. `transfer()` — atomic Prisma `$transaction`, ledger `Transaction` rows
4. `transferBetween()` — 5% tax (respect guild override via `guildConfigService`)
5. `validateBet()` — level-scaled max bet from config
6. `applyDaily()` — streak logic from config
7. `deposit()` / `withdraw()` — wallet ↔ bank
8. `getTransactions()` — last N ledger entries
9. Commands: `/balance`, `/daily`, `/deposit`, `/withdraw`, `/pay`, `/transactions`
10. Update economy-service SKILL.md with API and invariants

## Done when
- [ ] `npx tsc --noEmit` passes
- [ ] SKILL.md documents all public methods and invariants
- [ ] No edits outside owned files
- [ ] All coin changes go through `transfer()` in `$transaction`
