---
name: guild-config-service
description: Gamblebot guild config service for server settings, disabled games, disabled commands, and announce channel. Use when implementing per-server config or admin settings.
disable-model-invocation: true
---

# GuildConfigService

## Source Files
- Service: `src/services/guild-config.service.ts`
- Config: defaults in service; economy tax in `src/config/economy.ts`
- Contract: `GuildConfigData`, `IGuildConfigService` in `src/contracts/services.ts`
- Related commands: `src/commands/admin/config` (Wave 4)

## Responsibilities
- Load and persist per-guild settings in the `GuildConfig` Prisma model
- Return sensible defaults when no row exists (no DB write on read)
- Expose helpers for game/command gating and transfer tax resolution
- Support partial updates via upsert (create on first admin change)

## Public API

Import: `import { guildConfigService } from '../services/index.js';`

### `getConfig(guildId: string): Promise<GuildConfigData>`
Returns merged config for a guild. If no `GuildConfig` row exists, returns in-memory defaults without creating a row.

Default values:
| Field | Default |
|-------|---------|
| `dailyBonusMultiplier` | `1.0` |
| `disabledGames` | `[]` |
| `disabledCommands` | `[]` |
| `transferTaxOverride` | `null` |
| `announceChannelId` | `null` |
| `welcomeBonus` | `0` |
| `globalLeaderboard` | `false` |

### `updateConfig(guildId, updates): Promise<GuildConfig>`
Partial update. Only keys present in `updates` are changed on existing rows. Uses `upsert`: first write creates a row with defaults for omitted fields.

`updates` type: `Partial<Omit<GuildConfigData, 'guildId'>>`

### `isGameDisabled(guildId, gameType): Promise<boolean>`
`true` when `gameType` is in `disabledGames` (exact string match, e.g. `'coinflip'`).

### `isCommandDisabled(guildId, commandName): Promise<boolean>`
`true` when `commandName` is in `disabledCommands` (exact string match).

### `getTransferTax(guildId): Promise<number>`
Returns `transferTaxOverride` when set, otherwise `economyConfig.transferTaxRate` (currently `0.05` / 5%).

## Invariants (MUST follow)
- Defaults when no `GuildConfig` row exists — never auto-create on `getConfig()`
- Fields: `dailyBonusMultiplier`, `disabledGames`, `disabledCommands`, `transferTaxOverride`, `announceChannelId`, `welcomeBonus`, `globalLeaderboard`
- `disabledGames` / `disabledCommands` stored as JSON arrays in Prisma; non-array or invalid JSON parses to `[]`
- Transfer tax override is a rate (0–1), not a percentage integer
- Game/command disable checks use exact ID/name strings from config

## Dependencies
- `prisma` from `src/db.ts` — `GuildConfig` CRUD
- `economyConfig.transferTaxRate` from `src/config/economy.ts` — default P2P tax

## Consumers
- **EconomyService** — `getTransferTax()` in `transferBetween()`
- **Game commands** — `isGameDisabled()` before play
- **Command router** (Wave 4) — `isCommandDisabled()` before dispatch
- **Social/leaderboard** (Wave 3) — `globalLeaderboard` flag

## Extension Checklist
1. Add field to `GuildConfig` in `prisma/schema.prisma` (Wave 0 / schema owner)
2. Add field to `GuildConfigData` in `src/contracts/services.ts`
3. Add default in `defaultConfig()` and mapping in `toGuildConfigData()`
4. Handle field in `updateConfig()` create + update branches
5. Document in this SKILL.md
6. Wire admin UI in Wave 4 if user-facing

## Common Mistakes
- Auto-creating a `GuildConfig` row on every `getConfig()` call — only `updateConfig()` writes
- Storing tax as `5` instead of `0.05` — use decimal rate consistent with `economyConfig`
- Case-mismatch on game IDs — use lowercase `GameId` values from `src/config/games.ts`
- Replacing entire disabled arrays when meaning to add/remove one entry — `updateConfig` replaces the full array; admin layer should merge
- Importing `guildConfigService` from the service file in other lanes — use `src/services/index.ts`
