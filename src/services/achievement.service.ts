import type { Prisma } from '@prisma/client';
import type {
  AchievementDefinition,
  IAchievementService,
  UserKey,
} from '../contracts/services.js';
import { achievementsConfig, type AchievementDef } from '../config/achievements.js';
import { prisma } from '../db.js';
import { economyService } from './economy.service.js';
import { progressionService } from './progression.service.js';

function toDefinition(
  def: AchievementDef,
  earned: boolean,
  earnedAt?: Date,
): AchievementDefinition {
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    category: def.category,
    coinReward: def.coinReward,
    xpReward: def.xpReward,
    earned,
    earnedAt,
  };
}

function contextValue(context?: Record<string, unknown>): number {
  if (!context) return 0;
  const value = context['value'];
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  return 0;
}

function meetsThreshold(def: AchievementDef, context?: Record<string, unknown>): boolean {
  if (def.threshold === undefined) {
    return true;
  }
  return contextValue(context) >= def.threshold;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as Prisma.PrismaClientKnownRequestError).code === 'P2002'
  );
}

export class AchievementService implements IAchievementService {
  async checkAndAward(
    key: UserKey,
    trigger: string,
    context?: Record<string, unknown>,
  ): Promise<AchievementDefinition[]> {
    await economyService.getOrCreateUser(key);

    const candidates = achievementsConfig.achievements.filter(
      (def) => def.trigger === trigger,
    );
    const awarded: AchievementDefinition[] = [];

    for (const def of candidates) {
      if (!meetsThreshold(def, context)) {
        continue;
      }

      const existing = await prisma.achievement.findUnique({
        where: {
          discordId_guildId_achievementId: {
            discordId: key.discordId,
            guildId: key.guildId,
            achievementId: def.id,
          },
        },
      });
      if (existing) {
        continue;
      }

      let earnedAt: Date;
      try {
        const record = await prisma.achievement.create({
          data: {
            discordId: key.discordId,
            guildId: key.guildId,
            achievementId: def.id,
          },
        });
        earnedAt = record.earnedAt;
      } catch (error) {
        if (isUniqueViolation(error)) {
          continue;
        }
        throw error;
      }

      if (def.coinReward > 0) {
        await economyService.transfer(key, {
          amount: def.coinReward,
          source: 'achievement',
          metadata: { achievementId: def.id },
        });
      }
      if (def.xpReward > 0) {
        await progressionService.awardXp(key, def.xpReward, `achievement:${def.id}`);
      }

      awarded.push(toDefinition(def, true, earnedAt));
    }

    return awarded;
  }

  async getEarned(key: UserKey): Promise<AchievementDefinition[]> {
    const records = await prisma.achievement.findMany({
      where: { discordId: key.discordId, guildId: key.guildId },
      orderBy: { earnedAt: 'asc' },
    });
    const earnedById = new Map(
      records.map((record) => [record.achievementId, record.earnedAt]),
    );

    return achievementsConfig.achievements
      .filter((def) => earnedById.has(def.id))
      .map((def) => toDefinition(def, true, earnedById.get(def.id)));
  }

  async getProfileBadges(key: UserKey): Promise<string[]> {
    const earned = await this.getEarned(key);
    return earned.map((achievement) => achievement.name);
  }

  async getAllWithStatus(key: UserKey): Promise<AchievementDefinition[]> {
    const records = await prisma.achievement.findMany({
      where: { discordId: key.discordId, guildId: key.guildId },
    });
    const earnedById = new Map(
      records.map((record) => [record.achievementId, record.earnedAt]),
    );

    return achievementsConfig.achievements.map((def) =>
      toDefinition(def, earnedById.has(def.id), earnedById.get(def.id)),
    );
  }
}

export const achievementService = new AchievementService();
