import type { User } from '@prisma/client';
import {
  getAllJobs,
  getJobByName,
  jobConfig,
  workXpForTier,
} from '../config/jobs.js';
import type { IJobService, IShopService, UserKey, WorkResult } from '../contracts/services.js';
import {
  CooldownError,
  LockedError,
  NotFoundError,
  ValidationError,
} from '../contracts/errors.js';
import { prisma } from '../db.js';
import {
  economyService,
  progressionService,
  shopService,
} from './index.js';
import { applyCooldownReduction } from '../utils/cooldowns.js';
import { chance, randomFloat, randomInt } from '../utils/rng.js';

/** Stub ShopService omits param types until Wave 3 lane L implements it. */
const shop = shopService as IShopService;

export class JobService implements IJobService {
  private async getUser(key: UserKey): Promise<User> {
    return economyService.getOrCreateUser(key);
  }

  private async getEffectiveCooldownMs(key: UserKey, baseCooldownMs: number): Promise<number> {
    const multipliers = await shop.getActiveMultipliers(key);
    return applyCooldownReduction(
      baseCooldownMs,
      multipliers.cooldownReduction,
      jobConfig.maxCooldownReduction,
    );
  }

  async getWorkCooldownRemaining(key: UserKey): Promise<number> {
    const user = await this.getUser(key);
    if (!user.lastWork || !user.activeJob) return 0;

    const job = getJobByName(user.activeJob);
    if (!job) return 0;

    const cooldownMs = await this.getEffectiveCooldownMs(key, job.cooldownMs);
    const elapsed = Date.now() - user.lastWork.getTime();
    return Math.max(0, cooldownMs - elapsed);
  }

  async getAvailableJobs(key: UserKey): Promise<
    Array<{
      name: string;
      tier: number;
      basePay: number;
      cooldownMs: number;
      unlocked: boolean;
      active: boolean;
    }>
  > {
    const user = await this.getUser(key);
    const level = await progressionService.getLevel(key);

    return Promise.all(
      getAllJobs().map(async (job) => ({
        name: job.name,
        tier: job.tier,
        basePay: Math.floor((job.basePayMin + job.basePayMax) / 2),
        cooldownMs: await this.getEffectiveCooldownMs(key, job.cooldownMs),
        unlocked: level >= job.unlockLevel,
        active: user.activeJob?.toLowerCase() === job.name.toLowerCase(),
      })),
    );
  }

  async setJob(key: UserKey, jobName: string): Promise<User> {
    await this.getUser(key);

    const job = getJobByName(jobName);
    if (!job) {
      throw new NotFoundError(`Job "${jobName}"`);
    }

    const level = await progressionService.getLevel(key);
    if (level < job.unlockLevel) {
      throw new LockedError(job.name, job.unlockLevel, level);
    }

    return prisma.user.update({
      where: {
        discordId_guildId: { discordId: key.discordId, guildId: key.guildId },
      },
      data: { activeJob: job.name },
    });
  }

  async work(key: UserKey): Promise<WorkResult> {
    const user = await this.getUser(key);

    if (!user.activeJob) {
      throw new ValidationError('No active job. Use `/job set` to choose a job first.');
    }

    const job = getJobByName(user.activeJob);
    if (!job) {
      throw new ValidationError(
        `Active job "${user.activeJob}" is invalid. Use \`/job set\` to choose a valid job.`,
      );
    }

    const remaining = await this.getWorkCooldownRemaining(key);
    if (remaining > 0) {
      throw new CooldownError('work', remaining);
    }

    const level = await progressionService.getLevel(key);
    if (level < job.unlockLevel) {
      throw new LockedError(job.name, job.unlockLevel, level);
    }

    const multipliers = await shop.getActiveMultipliers(key);
    const cooldownMs = await this.getEffectiveCooldownMs(key, job.cooldownMs);

    const basePay = randomInt(job.basePayMin, job.basePayMax);
    let payout = Math.floor(
      basePay *
        (1 + level * jobConfig.levelPayoutMultiplier) *
        multipliers.jobPayout *
        randomFloat(jobConfig.payoutVarianceMin, jobConfig.payoutVarianceMax),
    );

    let xp = workXpForTier(job.tier);
    const critical = chance(jobConfig.criticalChance);
    if (critical) {
      payout = Math.floor(payout * jobConfig.criticalPayoutMultiplier);
      xp += jobConfig.criticalBonusXp;
    }

    await economyService.transfer(key, {
      amount: payout,
      source: 'job',
      metadata: { jobName: job.name, critical, tier: job.tier },
    });

    const updatedUser = await progressionService.awardXp(key, xp, 'job');

    await prisma.user.update({
      where: {
        discordId_guildId: { discordId: key.discordId, guildId: key.guildId },
      },
      data: { lastWork: new Date() },
    });

    return {
      payout,
      xp,
      critical,
      jobName: job.name,
      cooldownMs,
      user: updatedUser,
    };
  }
}

export const jobService = new JobService();
