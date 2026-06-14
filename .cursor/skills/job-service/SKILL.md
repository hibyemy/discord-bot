---
name: job-service
description: Gamblebot job service for work, jobs, cooldowns, payouts, and active job management. Use when implementing /work, /jobs, job tiers, or work payouts.
disable-model-invocation: true
---

# JobService

## Source Files
- Service: `src/services/job.service.ts`
- Config: `src/config/jobs.ts`
- Commands: `src/commands/jobs/work.ts`, `jobs.ts`, `job.ts`

## Responsibilities
- Manage per-guild active job selection (`User.activeJob`)
- Enforce work cooldowns (`User.lastWork`) with shop cooldown reduction
- Calculate job payouts and XP from config formulas
- Credit coins via `economyService.transfer()` and XP via `progressionService.awardXp()`
- Expose job list with locked/unlocked/active state for `/jobs` and autocomplete

## Public API

### `work(key: UserKey): Promise<WorkResult>`
Performs one work action for the user's active job.

1. Requires `activeJob` set; throws `ValidationError` if missing or invalid
2. Throws `CooldownError` if `lastWork` is within effective cooldown
3. Throws `LockedError` if user level dropped below job tier requirement
4. Payout: `randomInt(basePayMin, basePayMax) * (1 + level * 0.02) * shop.jobPayout * random(0.9, 1.1)`, floored
5. XP: `10 + tier * 5`; on critical (~5%): payout × 2, XP + 25
6. Credits payout (`source: 'job'`), awards XP, sets `lastWork` to now
7. Returns `{ payout, xp, critical, jobName, cooldownMs, user }`

### `setJob(key: UserKey, jobName: string): Promise<User>`
Sets `activeJob` after validation.

- Case-insensitive name lookup via `getJobByName()`
- Throws `NotFoundError` for unknown jobs
- Throws `LockedError` when `level < unlockLevel`
- Stores canonical job name from config

### `getAvailableJobs(key: UserKey)`
Returns all jobs with display fields:

| Field | Meaning |
|-------|---------|
| `name` | Job name |
| `tier` | Tier 1–5 |
| `basePay` | Midpoint of `basePayMin`/`basePayMax` |
| `cooldownMs` | Tier cooldown after shop reduction |
| `unlocked` | `level >= unlockLevel` |
| `active` | Matches `user.activeJob` (case-insensitive) |

### `getWorkCooldownRemaining(key: UserKey): Promise<number>`
Milliseconds until the user can work again. Returns `0` when no active job, no `lastWork`, or cooldown elapsed.

## Payout & Cooldown Formulas

```
basePay = randomInt(basePayMin, basePayMax)
payout = floor(basePay * (1 + level * 0.02) * shop.jobPayout * uniform(0.9, 1.1))
effectiveCooldown = floor(tierCooldownMs * (1 - min(shop.cooldownReduction, 0.3)))
xp = 10 + tier * 5  (+ 25 on critical)
critical = 5% chance → payout *= 2
```

## Invariants (MUST follow)
- **Never** mutate `wallet`/`bank` directly — always `economyService.transfer()`
- **Never** mutate `xp`/`level` directly — always `progressionService.awardXp()`
- Job tier table and formulas come from `src/config/jobs.ts`
- Per-guild identity: `(discordId, guildId)`
- Shop multipliers from `shopService.getActiveMultipliers()` (payout + cooldown reduction)
- Only `activeJob` and `lastWork` may be updated directly on `User` via Prisma

## Dependencies
- `economyService` — `getOrCreateUser()`, `transfer()`
- `progressionService` — `getLevel()`, `awardXp()`
- `shopService` — `getActiveMultipliers()` for `jobPayout` and `cooldownReduction`
- `prisma` — `activeJob` / `lastWork` updates only

## Commands
| Command | File | Behavior |
|---------|------|----------|
| `/work` | `work.ts` | Calls `work()`, shows payout/XP/cooldown embed |
| `/jobs` | `jobs.ts` | Lists all jobs with lock/active status |
| `/job set` | `job.ts` | Sets active job; autocomplete unlocked jobs |

Errors (`CooldownError`, `LockedError`, `ValidationError`, `NotFoundError`) propagate to `interactionCreate` handler.

## Extension Checklist
1. Add job/tier entries in `src/config/jobs.ts` (Wave 0 / config lane)
2. If payout rules change, update `work()` and this SKILL
3. Quest integration: emit `QuestEvent { type: 'work' }` in Wave 3 integration lane
4. Achievement hooks: `checkAndAward` on critical work in Wave 3

## Common Mistakes
- Updating wallet in `work()` instead of `economyService.transfer()`
- Using tier cooldown without `applyCooldownReduction()` / shop multipliers
- Allowing work without checking level still meets `unlockLevel`
- Storing user-typed job names instead of config canonical names
- Forgetting to set `lastWork` after a successful work (double-work exploit)
