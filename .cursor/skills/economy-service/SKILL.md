---
name: economy-service
description: Gamblebot economy service for balance, wallet, bank, transfer, ledger, daily rewards, pay, deposit, and withdraw. Use when implementing or debugging coin flows, bet validation, or economy commands.
disable-model-invocation: true
---

# EconomyService

## Source Files
- Service: `src/services/economy.service.ts`
- Config: `src/config/economy.ts`
- Commands: `src/commands/economy/` (`balance`, `daily`, `deposit`, `withdraw`, `pay`, `transactions`)

## Responsibilities
- Per-guild user profiles with wallet + bank balances
- Atomic coin mutations via ledgered `transfer()` calls
- P2P payments with guild-configurable transfer tax
- Daily reward claims with UTC streak tracking
- Wallet ↔ bank deposit and withdraw
- Bet validation for the game engine (level-scaled max bet)

## Public API

### `getOrCreateUser(key: UserKey): Promise<User>`
Upserts a user row. On first touch: wallet `1000`, bank `0`, level `1`, xp `0` (from `economyConfig`).

### `getBalance(key: UserKey): Promise<BalanceInfo>`
Returns `{ wallet, bank, netWorth }` after ensuring the user exists.

### `transfer(key: UserKey, options: TransferOptions): Promise<Transaction>`
Single-user coin change inside a Prisma `$transaction`.

| Option | Effect |
|--------|--------|
| `amount > 0`, default | Credit wallet |
| `amount > 0`, `toBank: true` | Credit bank |
| `amount < 0`, default | Debit wallet |
| `amount < 0`, `fromBank: true` | Debit bank |

Creates a `Transaction` row with post-update `balance` (wallet) and `bank`. Throws `InsufficientFundsError` on debit failure, `ValidationError` if amount is zero.

### `transferBetween(from, to, amount, source): Promise<{ sent, received, tax }>`
P2P transfer in one `$transaction`. Debits sender wallet by `amount`, credits receiver wallet by `amount - tax`. Tax rate from `guildConfigService.getTransferTax(from.guildId)`. Tax is sunk (not credited anywhere). Throws `ValidationError` for self-transfer or non-positive amount.

### `validateBet(key, amount): Promise<BetValidation>`
Checks `minBet`, level-scaled `maxBetForLevel(user.level)`, and wallet balance. Does not mutate state.

### `applyDaily(key): Promise<DailyRewardResult>`
UTC-day daily claim inside `$transaction`:
- Same UTC day as `lastDaily` → `AlreadyClaimedError`
- Previous UTC day → streak + 1 (capped at `dailyStreakCap`)
- Otherwise → streak reset to 1
- Reward: `dailyBaseReward × streakMultiplier × guild.dailyBonusMultiplier`
- Streak multiplier is `2` when streak ≥ 7, else `1`
- Credits wallet via `transfer()` with source `daily`, updates `dailyStreak` and `lastDaily`

### `deposit(key, amount) / withdraw(key, amount): Promise<User>`
Moves coins wallet ↔ bank atomically (two ledger entries per operation, source `deposit` or `withdraw`). Throws `ValidationError` if amount ≤ 0.

### `getTransactions(key, limit?): Promise<Transaction[]>`
Returns latest ledger entries (default 10, max 50), newest first.

## Invariants (MUST follow)
- **All coin changes** go through `transfer()` / `transferInTx()` inside Prisma `$transaction`
- Commands never mutate `user.wallet` or `user.bank` directly
- Bets debit wallet only; bank is safe from wagers
- Starting balance is `1000` wallet on first `getOrCreateUser`
- P2P tax defaults to 5% (`economyConfig.transferTaxRate`); guild override via `guildConfigService`
- Daily streaks use **UTC calendar days** (aligned with quest reset)
- `Transaction.balance` / `Transaction.bank` always reflect post-update snapshots

## Dependencies
- `prisma` from `src/db.ts`
- `guildConfigService` — `getTransferTax()`, `getConfig()` for daily bonus multiplier
- `economyConfig`, `maxBetForLevel` from `src/config/economy.ts`

## Extension Checklist
1. Add new `TransactionSource` in `src/contracts/events.ts` (Wave 0 / integration)
2. Implement feature logic calling `economyService.transfer()` with correct source
3. Never bypass the ledger for coin changes
4. For shop max-bet bonus, pass bonus multiplier into `maxBetForLevel` inside `validateBet`
5. Add slash command under `src/commands/economy/` using `economyService` from `src/services/index.ts`

## Common Mistakes
- Mutating wallet/bank with raw Prisma updates outside `transferInTx`
- Forgetting `fromBank` / `toBank` on deposit/withdraw (double-counting wallet)
- Using local timezone for daily streaks instead of UTC
- Calling `guildConfigService` from commands instead of keeping tax logic in the service
- Crediting tax to a user or house account (tax is intentionally sunk)
