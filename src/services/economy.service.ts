import type { Prisma, Transaction, User } from '@prisma/client';
import type { TransactionSource } from '../contracts/events.js';
import {
  AlreadyClaimedError,
  InsufficientFundsError,
  ValidationError,
} from '../contracts/errors.js';
import type {
  BalanceInfo,
  BetValidation,
  DailyRewardResult,
  IEconomyService,
  TransferOptions,
  UserKey,
} from '../contracts/services.js';
import { economyConfig, maxBetForLevel } from '../config/economy.js';
import { prisma } from '../db.js';
import { guildConfigService } from './guild-config.service.js';

type TxClient = Prisma.TransactionClient;

function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function previousUtcDateKey(date: Date): string {
  const prev = new Date(date);
  prev.setUTCDate(prev.getUTCDate() - 1);
  return utcDateKey(prev);
}

export class EconomyService implements IEconomyService {
  async getOrCreateUser(key: UserKey): Promise<User> {
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
        cooldowns: {},
      },
      update: {},
    });
  }

  async getBalance(key: UserKey): Promise<BalanceInfo> {
    const user = await this.getOrCreateUser(key);
    return {
      wallet: user.wallet,
      bank: user.bank,
      netWorth: user.wallet + user.bank,
    };
  }

  async transfer(key: UserKey, options: TransferOptions): Promise<Transaction> {
    return prisma.$transaction((tx) => this.transferInTx(tx, key, options));
  }

  async transferBetween(
    from: UserKey,
    to: UserKey,
    amount: number,
    source: TransactionSource,
  ): Promise<{ sent: number; received: number; tax: number }> {
    if (amount <= 0) {
      throw new ValidationError('Transfer amount must be positive.');
    }
    if (from.discordId === to.discordId && from.guildId === to.guildId) {
      throw new ValidationError('Cannot transfer to yourself.');
    }

    const taxRate = await guildConfigService.getTransferTax(from.guildId);
    const tax = Math.floor(amount * taxRate);
    const received = amount - tax;

    await prisma.$transaction(async (tx) => {
      await this.transferInTx(tx, from, {
        amount: -amount,
        source: 'transfer_out',
        metadata: {
          toDiscordId: to.discordId,
          originalSource: source,
          tax,
        },
      });
      await this.transferInTx(tx, to, {
        amount: received,
        source: 'transfer_in',
        metadata: {
          fromDiscordId: from.discordId,
          originalSource: source,
          tax,
        },
      });
    });

    return { sent: amount, received, tax };
  }

  async validateBet(key: UserKey, amount: number): Promise<BetValidation> {
    const user = await this.getOrCreateUser(key);
    const maxBet = maxBetForLevel(user.level);

    if (amount < economyConfig.minBet) {
      return {
        valid: false,
        maxBet,
        reason: `Minimum bet is ${economyConfig.minBet} coins.`,
      };
    }
    if (amount > maxBet) {
      return {
        valid: false,
        maxBet,
        reason: `Maximum bet at level ${user.level} is ${maxBet.toLocaleString()} coins.`,
      };
    }
    if (user.wallet < amount) {
      return {
        valid: false,
        maxBet,
        reason: `Insufficient wallet balance (${user.wallet.toLocaleString()} available).`,
      };
    }

    return { valid: true, maxBet };
  }

  async applyDaily(key: UserKey): Promise<DailyRewardResult> {
    const now = new Date();
    const today = utcDateKey(now);

    return prisma.$transaction(async (tx) => {
      const user = await this.getOrCreateUserInTx(tx, key);

      if (user.lastDaily && utcDateKey(user.lastDaily) === today) {
        throw new AlreadyClaimedError('Daily reward');
      }

      let newStreak = 1;
      if (user.lastDaily) {
        const lastDay = utcDateKey(user.lastDaily);
        if (lastDay === previousUtcDateKey(now)) {
          newStreak = Math.min(user.dailyStreak + 1, economyConfig.dailyStreakCap);
        }
      }

      const streakMultiplier =
        newStreak >= economyConfig.dailyStreakMultiplierDay
          ? economyConfig.dailyStreakMultiplier
          : 1;
      const guildConfig = await guildConfigService.getConfig(key.guildId);
      const multiplier = streakMultiplier * guildConfig.dailyBonusMultiplier;
      const amount = Math.floor(economyConfig.dailyBaseReward * multiplier);

      await this.transferInTx(tx, key, {
        amount,
        source: 'daily',
        metadata: { streak: newStreak, multiplier },
      });

      const updated = await tx.user.update({
        where: {
          discordId_guildId: { discordId: key.discordId, guildId: key.guildId },
        },
        data: {
          dailyStreak: newStreak,
          lastDaily: now,
        },
      });

      return {
        amount,
        streak: newStreak,
        multiplier,
        user: updated,
      };
    });
  }

  async deposit(key: UserKey, amount: number): Promise<User> {
    if (amount <= 0) {
      throw new ValidationError('Deposit amount must be positive.');
    }

    return prisma.$transaction(async (tx) => {
      await this.transferInTx(tx, key, {
        amount: -amount,
        source: 'deposit',
        metadata: { direction: 'wallet_to_bank' },
      });
      await this.transferInTx(tx, key, {
        amount,
        source: 'deposit',
        toBank: true,
        metadata: { direction: 'wallet_to_bank' },
      });
      return tx.user.findUniqueOrThrow({
        where: {
          discordId_guildId: { discordId: key.discordId, guildId: key.guildId },
        },
      });
    });
  }

  async withdraw(key: UserKey, amount: number): Promise<User> {
    if (amount <= 0) {
      throw new ValidationError('Withdraw amount must be positive.');
    }

    return prisma.$transaction(async (tx) => {
      await this.transferInTx(tx, key, {
        amount: -amount,
        source: 'withdraw',
        fromBank: true,
        metadata: { direction: 'bank_to_wallet' },
      });
      await this.transferInTx(tx, key, {
        amount,
        source: 'withdraw',
        metadata: { direction: 'bank_to_wallet' },
      });
      return tx.user.findUniqueOrThrow({
        where: {
          discordId_guildId: { discordId: key.discordId, guildId: key.guildId },
        },
      });
    });
  }

  async getTransactions(key: UserKey, limit = 10): Promise<Transaction[]> {
    await this.getOrCreateUser(key);
    const take = Math.min(Math.max(limit, 1), 50);
    return prisma.transaction.findMany({
      where: { discordId: key.discordId, guildId: key.guildId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  private async getOrCreateUserInTx(tx: TxClient, key: UserKey): Promise<User> {
    return tx.user.upsert({
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
        cooldowns: {},
      },
      update: {},
    });
  }

  private async transferInTx(
    tx: TxClient,
    key: UserKey,
    options: TransferOptions,
  ): Promise<Transaction> {
    const user = await this.getOrCreateUserInTx(tx, key);
    const { amount, source, metadata, fromBank = false, toBank = false } = options;

    if (amount === 0) {
      throw new ValidationError('Transfer amount cannot be zero.');
    }

    let wallet = user.wallet;
    let bank = user.bank;

    if (amount < 0) {
      const debit = -amount;
      if (fromBank) {
        if (bank < debit) {
          throw new InsufficientFundsError(debit, bank);
        }
        bank -= debit;
      } else {
        if (wallet < debit) {
          throw new InsufficientFundsError(debit, wallet);
        }
        wallet -= debit;
      }
    } else if (toBank) {
      bank += amount;
    } else {
      wallet += amount;
    }

    const updated = await tx.user.update({
      where: {
        discordId_guildId: { discordId: key.discordId, guildId: key.guildId },
      },
      data: { wallet, bank },
    });

    return tx.transaction.create({
      data: {
        discordId: key.discordId,
        guildId: key.guildId,
        amount,
        balance: updated.wallet,
        bank: updated.bank,
        source,
        metadata: metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }
}

export const economyService = new EconomyService();
