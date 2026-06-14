import type { User } from '@prisma/client';
import type { FocusTierProfile } from '../config/focus-games.js';
import {
  getAllJobs,
  getJobByName,
  jobConfig,
  type WorkTask,
  workXpForTier,
} from '../config/jobs.js';
import type { IJobService, UserKey, WorkResult } from '../contracts/services.js';
import {
  ActiveSessionError,
  CooldownError,
  LockedError,
  NotFoundError,
  ValidationError,
} from '../contracts/errors.js';
import { prisma } from '../db.js';
import { economyService } from './economy.service.js';
import { progressionService } from './progression.service.js';
import { shopService } from './shop.service.js';
import { applyCooldownReduction } from '../utils/cooldowns.js';
import { chance, randomFloat, randomInt } from '../utils/rng.js';

export interface WorkOptions {
  taskMultiplier?: number;
  taskLabel?: string;
}

export interface FocusWorkResult extends WorkResult {
  hits: number;
  totalRounds: number;
  hitRatio: number;
  minigameName: string;
}

const activeFocusUsers = new Set<string>();

function focusUserKey(key: UserKey): string {
  return `${key.discordId}:${key.guildId}`;
}

export class JobService implements IJobService {
  private async getUser(key: UserKey): Promise<User> {
    return economyService.getOrCreateUser(key);
  }

  private async getEffectiveCooldownMs(key: UserKey, baseCooldownMs: number): Promise<number> {
    const multipliers = await shopService.getActiveMultipliers(key);
    return applyCooldownReduction(
      baseCooldownMs,
      multipliers.cooldownReduction,
      jobConfig.maxCooldownReduction,
    );
  }

  private assertNotInFocusSession(key: UserKey): void {
    if (activeFocusUsers.has(focusUserKey(key))) {
      throw new ActiveSessionError('focus work');
    }
  }

  registerFocusSession(key: UserKey): void {
    activeFocusUsers.add(focusUserKey(key));
  }

  clearFocusSession(key: UserKey): void {
    activeFocusUsers.delete(focusUserKey(key));
  }

  isInFocusSession(key: UserKey): boolean {
    return activeFocusUsers.has(focusUserKey(key));
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

  private async resolveActiveJob(key: UserKey): Promise<{
    job: NonNullable<ReturnType<typeof getJobByName>>;
    level: number;
    cooldownMs: number;
    multipliers: Awaited<ReturnType<typeof shopService.getActiveMultipliers>>;
  }> {
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

    const multipliers = await shopService.getActiveMultipliers(key);
    const cooldownMs = await this.getEffectiveCooldownMs(key, job.cooldownMs);

    return { job, level, cooldownMs, multipliers };
  }

  estimatePassivePayout(
    job: NonNullable<ReturnType<typeof getJobByName>>,
    level: number,
    multipliers: Awaited<ReturnType<typeof shopService.getActiveMultipliers>>,
    taskMultiplier = 1,
  ): number {
    const basePay = (job.basePayMin + job.basePayMax) / 2;
    return Math.floor(
      basePay *
        (1 + level * jobConfig.levelPayoutMultiplier) *
        multipliers.jobPayout *
        taskMultiplier,
    );
  }

  async validateWorkReady(key: UserKey): Promise<void> {
    this.assertNotInFocusSession(key);
    await this.resolveActiveJob(key);
  }

  async work(key: UserKey, options: WorkOptions = {}): Promise<WorkResult> {
    this.assertNotInFocusSession(key);

    const { job, level, cooldownMs, multipliers } = await this.resolveActiveJob(key);
    const taskMultiplier = options.taskMultiplier ?? 1;

    const basePay = randomInt(job.basePayMin, job.basePayMax);
    let payout = Math.floor(
      basePay *
        (1 + level * jobConfig.levelPayoutMultiplier) *
        multipliers.jobPayout *
        taskMultiplier *
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
      metadata: {
        jobName: job.name,
        critical,
        tier: job.tier,
        task: options.taskLabel,
      },
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
      taskLabel: options.taskLabel,
    };
  }

  async completeFocusWork(
    key: UserKey,
    hits: number,
    totalRounds: number,
    profile: FocusTierProfile,
  ): Promise<FocusWorkResult> {
    try {
      const { job, level, cooldownMs, multipliers } = await this.resolveActiveJob(key);
      const hitRatio = totalRounds > 0 ? hits / totalRounds : 0;

      if (hitRatio < jobConfig.focusWork.minHitRatio) {
        await prisma.user.update({
          where: {
            discordId_guildId: { discordId: key.discordId, guildId: key.guildId },
          },
          data: { lastWork: new Date() },
        });

        const failXp = Math.floor(workXpForTier(job.tier) * 0.25);
        return {
          payout: 0,
          xp: failXp,
          critical: false,
          jobName: job.name,
          cooldownMs,
          user: await progressionService.awardXp(key, failXp, 'focus_job'),
          hits,
          totalRounds,
          hitRatio,
          minigameName: profile.name,
        };
      }

      const passiveEstimate = this.estimatePassivePayout(job, level, multipliers);
      let payout = Math.floor(
        passiveEstimate * profile.payoutMultiplier * hitRatio,
      );

      let xp = Math.floor(
        workXpForTier(job.tier) * jobConfig.focusWork.xpMultiplier * hitRatio,
      );
      const critical = chance(jobConfig.criticalChance);
      if (critical) {
        payout = Math.floor(payout * jobConfig.criticalPayoutMultiplier);
        xp += jobConfig.criticalBonusXp;
      }

      await economyService.transfer(key, {
        amount: payout,
        source: 'job',
        metadata: {
          jobName: job.name,
          critical,
          tier: job.tier,
          focus: true,
          minigame: profile.name,
          hits,
          totalRounds,
        },
      });

      const updatedUser = await progressionService.awardXp(key, xp, 'focus_job');

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
        hits,
        totalRounds,
        hitRatio,
        minigameName: profile.name,
      };
    } finally {
      this.clearFocusSession(key);
    }
  }

  async abortFocusWork(key: UserKey): Promise<void> {
    this.clearFocusSession(key);
  }
}

export const jobService = new JobService();

export type { WorkTask };
