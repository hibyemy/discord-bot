import type { Prisma, QuestProgress } from '@prisma/client';
import type { QuestEvent } from '../contracts/events.js';
import { AlreadyClaimedError, ValidationError } from '../contracts/errors.js';
import type {
  IQuestService,
  QuestBoard,
  QuestDefinition,
  UserKey,
} from '../contracts/services.js';
import { questConfig, type QuestPoolEntry, type QuestType } from '../config/quests.js';
import { prisma } from '../db.js';
import { economyService } from './economy.service.js';
import { progressionService } from './progression.service.js';

interface StoredQuestState {
  poolId: string;
  progress: number;
  completed: boolean;
  claimed?: boolean;
  winStreak?: number;
}

function utcDateKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function previousUtcDateKey(date: Date = new Date()): string {
  const prev = new Date(date);
  prev.setUTCDate(prev.getUTCDate() - 1);
  return utcDateKey(prev);
}

function getPoolEntry(poolId: string): QuestPoolEntry {
  const entry = questConfig.pool.find((q) => q.id === poolId);
  if (!entry) {
    throw new Error(`Unknown quest pool id: ${poolId}`);
  }
  return entry;
}

function pickWeightedQuests(count: number): QuestPoolEntry[] {
  const remaining = [...questConfig.pool];
  const selected: QuestPoolEntry[] = [];

  for (let i = 0; i < count && remaining.length > 0; i++) {
    const totalWeight = remaining.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.random() * totalWeight;

    for (let j = 0; j < remaining.length; j++) {
      const entry = remaining[j];
      if (!entry) continue;
      roll -= entry.weight;
      if (roll <= 0) {
        selected.push(entry);
        remaining.splice(j, 1);
        break;
      }
    }
  }

  return selected;
}

function toStoredQuests(entries: QuestPoolEntry[]): StoredQuestState[] {
  return entries.map((entry) => ({
    poolId: entry.id,
    progress: 0,
    completed: false,
    claimed: false,
  }));
}

function parseStoredQuests(quests: QuestProgress['quests']): StoredQuestState[] {
  return (quests as unknown as StoredQuestState[]).map((state) => ({
    ...state,
    claimed: state.claimed ?? false,
  }));
}

function toQuestBoard(record: QuestProgress): QuestBoard {
  const stored = parseStoredQuests(record.quests);
  const quests: QuestDefinition[] = stored.map((state) => {
    const pool = getPoolEntry(state.poolId);
    return {
      id: pool.id,
      description: pool.description,
      target: pool.target,
      progress: state.progress,
      completed: state.completed,
      claimed: state.claimed ?? false,
      rewardCoins: pool.rewardCoins,
      rewardXp: pool.rewardXp,
    };
  });

  const allComplete = quests.length > 0 && quests.every((q) => q.completed);
  const allClaimed = quests.length > 0 && quests.every((q) => q.claimed);

  return {
    quests,
    completed: record.completed,
    streakBonus: record.streakBonus,
    allComplete,
    claimed: allClaimed,
  };
}

function eventMatchesQuest(questType: QuestType, event: QuestEvent): boolean {
  switch (questType) {
    case 'work':
      return event.type === 'work';
    case 'game_win':
      return event.type === 'game_win';
    case 'game_play':
      return event.type === 'game_played';
    case 'wager_total':
      return event.type === 'wager';
    case 'deposit':
      return event.type === 'deposit';
    case 'shop_purchase':
      return event.type === 'shop_purchase';
    case 'pay_user':
      return event.type === 'pay';
    case 'win_streak':
      return event.type === 'game_win' || event.type === 'game_played';
    default:
      return false;
  }
}

function applyEventToQuest(
  questType: QuestType,
  state: StoredQuestState,
  event: QuestEvent,
): void {
  if (state.completed || state.claimed) return;

  const pool = getPoolEntry(state.poolId);

  if (questType === 'win_streak') {
    if (event.type === 'game_win') {
      const streak = (state.winStreak ?? 0) + 1;
      state.winStreak = streak;
      state.progress = Math.max(state.progress, streak);
    } else if (event.type === 'game_played' && event.metadata?.['won'] === false) {
      state.winStreak = 0;
    }
  } else {
    const delta =
      questType === 'wager_total' || questType === 'deposit' || questType === 'pay_user'
        ? event.amount ?? 0
        : 1;
    if (delta <= 0) return;
    state.progress = Math.min(pool.target, state.progress + delta);
  }

  if (state.progress >= pool.target) {
    state.completed = true;
  }
}

export class QuestService implements IQuestService {
  private async computeStreakBonus(key: UserKey): Promise<number> {
    const yesterday = previousUtcDateKey();
    const previous = await prisma.questProgress.findUnique({
      where: {
        discordId_guildId_questDate: {
          discordId: key.discordId,
          guildId: key.guildId,
          questDate: yesterday,
        },
      },
    });

    if (!previous) return 0;

    const board = toQuestBoard(previous);
    if (board.allComplete && board.claimed) {
      return Math.min(previous.streakBonus + 1, questConfig.streakBonusCap);
    }

    return 0;
  }

  async generateDailyQuests(key: UserKey): Promise<QuestBoard> {
    await economyService.getOrCreateUser(key);

    const questDate = utcDateKey();
    const existing = await prisma.questProgress.findUnique({
      where: {
        discordId_guildId_questDate: {
          discordId: key.discordId,
          guildId: key.guildId,
          questDate,
        },
      },
    });

    if (existing) {
      return toQuestBoard(existing);
    }

    const picked = pickWeightedQuests(questConfig.dailyQuestCount);
    const streakBonus = await this.computeStreakBonus(key);

    const record = await prisma.questProgress.create({
      data: {
        discordId: key.discordId,
        guildId: key.guildId,
        questDate,
        quests: toStoredQuests(picked) as unknown as Prisma.InputJsonValue,
        completed: 0,
        streakBonus,
      },
    });

    return toQuestBoard(record);
  }

  async getDailyQuests(key: UserKey): Promise<QuestBoard> {
    const questDate = utcDateKey();
    const record = await prisma.questProgress.findUnique({
      where: {
        discordId_guildId_questDate: {
          discordId: key.discordId,
          guildId: key.guildId,
          questDate,
        },
      },
    });

    if (!record) {
      return this.generateDailyQuests(key);
    }

    return toQuestBoard(record);
  }

  async updateProgress(event: QuestEvent): Promise<void> {
    const key: UserKey = { discordId: event.discordId, guildId: event.guildId };
    const questDate = utcDateKey(event.timestamp);

    let record = await prisma.questProgress.findUnique({
      where: {
        discordId_guildId_questDate: {
          discordId: key.discordId,
          guildId: key.guildId,
          questDate,
        },
      },
    });

    if (!record) {
      await this.generateDailyQuests(key);
      record = await prisma.questProgress.findUnique({
        where: {
          discordId_guildId_questDate: {
            discordId: key.discordId,
            guildId: key.guildId,
            questDate,
          },
        },
      });
    }

    if (!record) return;

    const stored = parseStoredQuests(record.quests);
    let completedCount = 0;

    for (const state of stored) {
      if (state.completed) {
        completedCount += 1;
        continue;
      }

      const pool = getPoolEntry(state.poolId);
      if (!eventMatchesQuest(pool.type, event)) continue;

      applyEventToQuest(pool.type, state, event);
      if (state.completed) {
        completedCount += 1;
      }
    }

    await prisma.questProgress.update({
      where: { id: record.id },
      data: {
        quests: stored as unknown as Prisma.InputJsonValue,
        completed: completedCount,
      },
    });
  }

  async claimQuestReward(key: UserKey, questId: string): Promise<{ coins: number; xp: number }> {
    const questDate = utcDateKey();
    const record = await prisma.questProgress.findUnique({
      where: {
        discordId_guildId_questDate: {
          discordId: key.discordId,
          guildId: key.guildId,
          questDate,
        },
      },
    });

    if (!record) {
      throw new ValidationError('No daily quests found for today.');
    }

    const stored = parseStoredQuests(record.quests);
    const state = stored.find((entry) => entry.poolId === questId);
    if (!state) {
      throw new ValidationError('Quest not found on today\'s board.');
    }

    if (!state.completed) {
      throw new ValidationError('Complete this quest before claiming its reward.');
    }

    if (state.claimed) {
      throw new AlreadyClaimedError('Quest reward');
    }

    const pool = getPoolEntry(questId);
    const multiplier = 1 + record.streakBonus * questConfig.streakBonusPerDay;
    const coins = Math.floor(pool.rewardCoins * multiplier);
    const xp = Math.floor(pool.rewardXp * multiplier);

    state.claimed = true;
    const allClaimed = stored.every((entry) => entry.claimed);

    await prisma.$transaction(async (tx) => {
      const fresh = await tx.questProgress.findUnique({ where: { id: record.id } });
      if (!fresh) {
        throw new ValidationError('No daily quests found for today.');
      }

      const freshStored = parseStoredQuests(fresh.quests);
      const freshState = freshStored.find((entry) => entry.poolId === questId);
      if (!freshState?.completed) {
        throw new ValidationError('Complete this quest before claiming its reward.');
      }
      if (freshState.claimed) {
        throw new AlreadyClaimedError('Quest reward');
      }

      freshState.claimed = true;
      const everyClaimed = freshStored.every((entry) => entry.claimed);

      await tx.questProgress.update({
        where: { id: record.id },
        data: {
          quests: freshStored as unknown as Prisma.InputJsonValue,
          claimedAt: everyClaimed ? new Date() : fresh.claimedAt,
        },
      });
    });

    if (coins > 0) {
      await economyService.transfer(key, {
        amount: coins,
        source: 'quest',
        metadata: { questDate, questId, streakBonus: record.streakBonus },
      });
    }

    if (xp > 0) {
      await progressionService.awardXp(key, xp, 'quest');
    }

    return { coins, xp };
  }

  async resetAllDaily(): Promise<number> {
    const cutoff = previousUtcDateKey();
    const result = await prisma.questProgress.deleteMany({
      where: {
        questDate: { lt: cutoff },
      },
    });
    return result.count;
  }
}

export const questService = new QuestService();
