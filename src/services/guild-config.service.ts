import type { GuildConfig, Prisma } from '@prisma/client';
import { economyConfig } from '../config/economy.js';
import type { GuildConfigData, IGuildConfigService } from '../contracts/services.js';
import { prisma } from '../db.js';

function defaultConfig(guildId: string): GuildConfigData {
  return {
    guildId,
    dailyBonusMultiplier: 1.0,
    disabledGames: [],
    disabledCommands: [],
    transferTaxOverride: null,
    announceChannelId: null,
    welcomeBonus: 0,
    globalLeaderboard: false,
  };
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function toGuildConfigData(row: GuildConfig): GuildConfigData {
  return {
    guildId: row.guildId,
    dailyBonusMultiplier: row.dailyBonusMultiplier,
    disabledGames: parseStringArray(row.disabledGames),
    disabledCommands: parseStringArray(row.disabledCommands),
    transferTaxOverride: row.transferTaxOverride,
    announceChannelId: row.announceChannelId,
    welcomeBonus: row.welcomeBonus,
    globalLeaderboard: row.globalLeaderboard,
  };
}

export class GuildConfigService implements IGuildConfigService {
  async getConfig(guildId: string): Promise<GuildConfigData> {
    const row = await prisma.guildConfig.findUnique({ where: { guildId } });
    if (!row) {
      return defaultConfig(guildId);
    }
    return toGuildConfigData(row);
  }

  async updateConfig(
    guildId: string,
    updates: Partial<Omit<GuildConfigData, 'guildId'>>,
  ): Promise<GuildConfig> {
    const defaults = defaultConfig(guildId);
    const updateData: Prisma.GuildConfigUpdateInput = {};

    if (updates.dailyBonusMultiplier !== undefined) {
      updateData.dailyBonusMultiplier = updates.dailyBonusMultiplier;
    }
    if (updates.disabledGames !== undefined) {
      updateData.disabledGames = updates.disabledGames;
    }
    if (updates.disabledCommands !== undefined) {
      updateData.disabledCommands = updates.disabledCommands;
    }
    if (updates.transferTaxOverride !== undefined) {
      updateData.transferTaxOverride = updates.transferTaxOverride;
    }
    if (updates.announceChannelId !== undefined) {
      updateData.announceChannelId = updates.announceChannelId;
    }
    if (updates.welcomeBonus !== undefined) {
      updateData.welcomeBonus = updates.welcomeBonus;
    }
    if (updates.globalLeaderboard !== undefined) {
      updateData.globalLeaderboard = updates.globalLeaderboard;
    }

    return prisma.guildConfig.upsert({
      where: { guildId },
      create: {
        guildId,
        dailyBonusMultiplier:
          updates.dailyBonusMultiplier ?? defaults.dailyBonusMultiplier,
        disabledGames: updates.disabledGames ?? defaults.disabledGames,
        disabledCommands: updates.disabledCommands ?? defaults.disabledCommands,
        transferTaxOverride:
          updates.transferTaxOverride ?? defaults.transferTaxOverride,
        announceChannelId:
          updates.announceChannelId ?? defaults.announceChannelId,
        welcomeBonus: updates.welcomeBonus ?? defaults.welcomeBonus,
        globalLeaderboard:
          updates.globalLeaderboard ?? defaults.globalLeaderboard,
      },
      update: updateData,
    });
  }

  async isGameDisabled(guildId: string, gameType: string): Promise<boolean> {
    const config = await this.getConfig(guildId);
    return config.disabledGames.includes(gameType);
  }

  async isCommandDisabled(guildId: string, commandName: string): Promise<boolean> {
    const config = await this.getConfig(guildId);
    return config.disabledCommands.includes(commandName);
  }

  async getTransferTax(guildId: string): Promise<number> {
    const config = await this.getConfig(guildId);
    return config.transferTaxOverride ?? economyConfig.transferTaxRate;
  }
}

export const guildConfigService = new GuildConfigService();
