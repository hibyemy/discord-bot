---
name: shop-service
description: Gamblebot shop service for shop, buy, upgrades, inventory, and payout multipliers. Use when implementing shop commands or upgrade effects.
disable-model-invocation: true
---

# ShopService

## Source Files
- Service: `src/services/shop.service.ts`
- Config: `src/config/shop.ts`
- Commands: `src/commands/shop/shop.ts`, `buy.ts`, `inventory.ts`

## Responsibilities
- List shop upgrades with tier gates, current rank, and next cost
- Purchase upgrades via `economyService.transfer()` and `UserUpgrade` upsert
- Aggregate owned upgrade ranks into payout multipliers for jobs/games/economy callers
- Expose per-upgrade rank lookup for achievements and inventory

## Public API

### `listItems(key: UserKey): Promise<ShopItem[]>`
Returns all upgrades from `shopConfig` enriched with user state.

| Field | Meaning |
|-------|---------|
| `currentRank` | Owned rank (`0` if none) |
| `nextCost` | Cost for next rank from `getUpgradeCost()`, or `null` at max |
| `unlocked` | `level >= unlockLevel` **and** tier in `progressionService.getUnlocks().shopTiers` |

### `buy(key: UserKey, upgradeId: string): Promise<UserUpgrade>`
Purchases the next rank of an upgrade.

1. Throws `NotFoundError` for unknown `upgradeId`
2. Throws `LockedError` when level/tier gate fails
3. Throws `ValidationError` at max rank
4. Deducts `nextCost` via `economyService.transfer({ amount: -cost, source: 'shop' })`
5. Upserts `UserUpgrade` with `rank = currentRank + 1`

### `getActiveMultipliers(key: UserKey): Promise<ShopMultipliers>`
Aggregates effects from owned upgrades. Defaults:

| Field | Default | Aggregation |
|-------|---------|-------------|
| `jobPayout` | `1` | `1 + Σ(rank × effectPerRank)` for `job_payout` |
| `winChanceBonus` | `0` | additive `win_chance` |
| `cooldownReduction` | `0` | additive `cooldown_reduction` |
| `bankInterest` | `0` | additive `bank_interest` |
| `maxBetBonus` | `0` | additive `max_bet` |

Multipliers are computed at payout/validation time — never stored on `User`.

### `getUpgradeRank(key: UserKey, upgradeId: string): Promise<number>`
Returns owned rank or `0`.

## Invariants (MUST follow)
- Cost scaling from `shopConfig` via `getUpgradeCost()`; ranks stored in `UserUpgrade`
- Tier gates: both `upgrade.unlockLevel` and `economyConfig.shopTierUnlocks` tier access
- All coin deductions via `economyService.transfer()` (`source: 'shop'`)
- Per-guild identity: `(discordId, guildId)`
- Multipliers applied at payout time by callers (`jobService`, games, economy), not on user row

## Dependencies
- `economyService` — `getOrCreateUser()`, `transfer()`
- `progressionService` — `getLevel()`, `getUnlocks()` for tier/level gates
- `prisma` — `UserUpgrade` reads/writes only

## Commands
| Command | File | Behavior |
|---------|------|----------|
| `/shop` | `shop.ts` | Lists upgrades by tier with rank, cost, lock status |
| `/buy` | `buy.ts` | Purchases upgrade; autocomplete shows unlocked, non-maxed items |
| `/inventory` | `inventory.ts` | Shows owned upgrades and aggregated active effects |

Errors (`LockedError`, `NotFoundError`, `ValidationError`, `InsufficientFundsError`) propagate to the global interaction handler.

## Extension Checklist
1. Add entry to `shopConfig.upgrades` in `src/config/shop.ts` (Wave 0/4 config lane)
2. Pick `effectType` matching an existing `ShopMultipliers` field (or extend contract in Wave 0)
3. Set `tier`, `unlockLevel`, `maxRank`, `costs[]`, `effectPerRank`
4. Wire caller to read new multiplier via `getActiveMultipliers()` at payout time
5. No `ShopService` change needed unless new effect category

## Common Mistakes
- Storing multiplier totals on `User` instead of deriving from `UserUpgrade` ranks
- Checking only `unlockLevel` without `shopTiers` from `getUnlocks()`
- Using `costs[currentRank - 1]` instead of `getUpgradeCost(upgrade, currentRank)` (index 0 = rank 1)
- Starting `jobPayout` at `0` instead of `1` (it is a multiplier, not a bonus fraction)
- Mutating wallet directly instead of `economyService.transfer()`
