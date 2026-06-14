import type { User } from '@prisma/client';
import type { IProgressionService, UnlockInfo, UserKey } from '../contracts/services.js';
import {
  economyConfig,
  maxBetForLevel,
  xpToNextLevel as configXpToNextLevel,
} from '../config/economy.js';
import { getAllJobs } from '../config/jobs.js';
import { gamesConfig } from '../config/games.js';
import { prisma } from '../db.js';

export class ProgressionService implements IProgressionService {
  private async getOrCreateUser(key: UserKey): Promise<User> {
    return prisma.user.upsert({
      where: {
        discordId_guildId: { discordId: key.discordId, guildId: key.guildId },
      },
      create: {
        discordId: key.discordId,
        guildId: key.guildId,
        wallet: economyConfig.startingBalance,
        bank: economyConfig.startingBank,
        level: economyConfig.startingLevel,
        xp: economyConfig.startingXp,
      },
      update: {},
    });
  }

  async awardXp(key: UserKey, amount: number, _source?: string): Promise<User> {
    const user = await this.getOrCreateUser(key);
    let xp = user.xp + amount;
    let level = user.level;

    while (xp >= this.xpToNextLevel(level)) {
      xp -= this.xpToNextLevel(level);
      level += 1;
    }

    return prisma.user.update({
      where: {
        discordId_guildId: { discordId: key.discordId, guildId: key.guildId },
      },
      data: { xp, level },
    });
  }

  async getLevel(key: UserKey): Promise<number> {
    const user = await this.getOrCreateUser(key);
    return user.level;
  }

  xpToNextLevel(level: number): number {
    return configXpToNextLevel(level);
  }

  async xpProgress(
    key: UserKey,
  ): Promise<{ current: number; required: number; percent: number }> {
    const user = await this.getOrCreateUser(key);
    const required = this.xpToNextLevel(user.level);
    const current = user.xp;
    const percent =
      required > 0 ? Math.min(100, Math.floor((current / required) * 100)) : 100;
    return { current, required, percent };
  }

  getUnlocks(level: number): UnlockInfo {
    const jobs = getAllJobs()
      .filter((job) => job.unlockLevel <= level)
      .map((job) => job.name);

    const games = gamesConfig.games
      .filter((game) => game.unlockLevel <= level)
      .map((game) => game.id);

    const shopTiers = Object.entries(economyConfig.shopTierUnlocks)
      .filter(([, unlockLevel]) => unlockLevel <= level)
      .map(([tier]) => Number(tier));

    return {
      jobs,
      games,
      shopTiers,
      maxBet: maxBetForLevel(level),
    };
  }

  async setLevel(key: UserKey, level: number): Promise<User> {
    await this.getOrCreateUser(key);
    const clampedLevel = Math.max(1, Math.floor(level));

    return prisma.user.update({
      where: {
        discordId_guildId: { discordId: key.discordId, guildId: key.guildId },
      },
      data: { level: clampedLevel, xp: 0 },
    });
  }

  async isUnlocked(
    key: UserKey,
    _feature: string,
    requiredLevel: number,
  ): Promise<boolean> {
    const level = await this.getLevel(key);
    return level >= requiredLevel;
  }
}

export const progressionService = new ProgressionService();
