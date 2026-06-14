# Lane L: Shop Service
Wave: 3 | Parallel: yes | Blocks: none

## Read first
- [.cursor/skills/shop-service/SKILL.md](../skills/shop-service/SKILL.md)
- [src/contracts/services.ts](../../src/contracts/services.ts)
- [src/config/shop.ts](../../src/config/shop.ts)

## You own (ONLY edit these)
- `src/services/shop.service.ts`
- `src/commands/shop/*` (shop, buy, inventory)
- `.cursor/skills/shop-service/SKILL.md`

## Do NOT edit
- `src/services/index.ts`
- `src/contracts/*`
- `src/config/*`
- `prisma/schema.prisma`
- `src/services/economy.service.ts`

## Implement
1. `ShopService` implementing `IShopService`
2. `listItems()` — tier gates by level, current rank, next cost
3. `buy()` — deduct via economy, upsert `UserUpgrade`
4. `getActiveMultipliers()` — aggregate effects for jobs/games
5. Commands: `/shop`, `/buy`, `/inventory`
6. Update shop-service SKILL.md

## Done when
- [ ] `npx tsc --noEmit` passes
- [ ] SKILL.md complete
- [ ] No edits outside owned files
- [ ] Multipliers applied at payout time, not stored on user row
