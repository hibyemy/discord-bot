import type { UserUpgrade } from '@prisma/client';
import {
  getUpgrade,
  getUpgradeCost,
  shopConfig,
  type UpgradeDefinition,
} from '../config/shop.js';
import type {
  IShopService,
  ShopItem,
  ShopMultipliers,
  UserKey,
} from '../contracts/services.js';
import {
  LockedError,
  NotFoundError,
  ValidationError,
} from '../contracts/errors.js';
import { prisma } from '../db.js';
import { economyService } from './economy.service.js';
import { progressionService } from './progression.service.js';

const DEFAULT_MULTIPLIERS: ShopMultipliers = {
  jobPayout: 1,
  winChanceBonus: 0,
  cooldownReduction: 0,
  bankInterest: 0,
  maxBetBonus: 0,
};

function isUpgradeUnlocked(
  upgrade: UpgradeDefinition,
  level: number,
  shopTiers: number[],
): boolean {
  return level >= upgrade.unlockLevel && shopTiers.includes(upgrade.tier);
}

export class ShopService implements IShopService {
  private async getUpgradeRanks(key: UserKey): Promise<Map<string, number>> {
    const rows = await prisma.userUpgrade.findMany({
      where: { discordId: key.discordId, guildId: key.guildId },
    });
    return new Map(rows.map((r) => [r.upgradeId, r.rank]));
  }

  async getUpgradeRank(key: UserKey, upgradeId: string): Promise<number> {
    await economyService.getOrCreateUser(key);
    const row = await prisma.userUpgrade.findUnique({
      where: {
        discordId_guildId_upgradeId: {
          discordId: key.discordId,
          guildId: key.guildId,
          upgradeId,
        },
      },
    });
    return row?.rank ?? 0;
  }

  async listItems(key: UserKey): Promise<ShopItem[]> {
    await economyService.getOrCreateUser(key);
    const level = await progressionService.getLevel(key);
    const { shopTiers } = progressionService.getUnlocks(level);
    const ranks = await this.getUpgradeRanks(key);

    return shopConfig.upgrades.map((upgrade) => {
      const currentRank = ranks.get(upgrade.id) ?? 0;
      const unlocked = isUpgradeUnlocked(upgrade, level, shopTiers);
      return {
        id: upgrade.id,
        name: upgrade.name,
        description: upgrade.description,
        maxRank: upgrade.maxRank,
        tier: upgrade.tier,
        costs: [...upgrade.costs],
        currentRank,
        nextCost: getUpgradeCost(upgrade, currentRank),
        unlocked,
      };
    });
  }

  async buy(key: UserKey, upgradeId: string): Promise<UserUpgrade> {
    await economyService.getOrCreateUser(key);

    const upgrade = getUpgrade(upgradeId);
    if (!upgrade) {
      throw new NotFoundError(`Upgrade "${upgradeId}"`);
    }

    const level = await progressionService.getLevel(key);
    const { shopTiers } = progressionService.getUnlocks(level);
    if (!isUpgradeUnlocked(upgrade, level, shopTiers)) {
      throw new LockedError(upgrade.name, upgrade.unlockLevel, level);
    }

    const currentRank = await this.getUpgradeRank(key, upgradeId);
    if (currentRank >= upgrade.maxRank) {
      throw new ValidationError(
        `${upgrade.name} is already at max rank (${upgrade.maxRank}).`,
      );
    }

    const cost = getUpgradeCost(upgrade, currentRank);
    if (cost === null) {
      throw new ValidationError(`${upgrade.name} cannot be upgraded further.`);
    }

    const newRank = currentRank + 1;

    await economyService.transfer(key, {
      amount: -cost,
      source: 'shop',
      metadata: { upgradeId, rank: newRank, upgradeName: upgrade.name },
    });

    return prisma.userUpgrade.upsert({
      where: {
        discordId_guildId_upgradeId: {
          discordId: key.discordId,
          guildId: key.guildId,
          upgradeId,
        },
      },
      create: {
        discordId: key.discordId,
        guildId: key.guildId,
        upgradeId,
        rank: newRank,
      },
      update: {
        rank: newRank,
      },
    });
  }

  async getActiveMultipliers(key: UserKey): Promise<ShopMultipliers> {
    await economyService.getOrCreateUser(key);

    const rows = await prisma.userUpgrade.findMany({
      where: { discordId: key.discordId, guildId: key.guildId },
    });

    const multipliers: ShopMultipliers = { ...DEFAULT_MULTIPLIERS };

    for (const row of rows) {
      const upgrade = getUpgrade(row.upgradeId);
      if (!upgrade || row.rank <= 0) continue;

      const effect = upgrade.effectPerRank * row.rank;

      switch (upgrade.effectType) {
        case 'job_payout':
          multipliers.jobPayout += effect;
          break;
        case 'win_chance':
          multipliers.winChanceBonus += effect;
          break;
        case 'cooldown_reduction':
          multipliers.cooldownReduction += effect;
          break;
        case 'bank_interest':
          multipliers.bankInterest += effect;
          break;
        case 'max_bet':
          multipliers.maxBetBonus += effect;
          break;
      }
    }

    return multipliers;
  }
}

export const shopService = new ShopService();
