import type { Client } from 'discord.js';
import { gamesConfig } from '../config/games.js';
import { shopConfig } from '../config/shop.js';
import type { GameEvent, ProgressionEvent, QuestEvent } from '../contracts/events.js';
import type { UserKey } from '../contracts/services.js';
import { prisma } from '../db.js';
import {
  achievementService,
  economyService,
  questService,
} from '../services/index.js';
import { announceBigWin, announceLevelUp } from '../utils/announce.js';
import { eventBus } from './bus.js';

const winStreaks = new Map<string, number>();

function streakKey(key: UserKey): string {
  return `${key.guildId}:${key.discordId}`;
}

async function sumTransactionAmount(
  key: UserKey,
  source: string,
  positiveOnly = false,
): Promise<number> {
  const rows = await prisma.transaction.findMany({
    where: {
      discordId: key.discordId,
      guildId: key.guildId,
      source,
    },
    select: { amount: true },
  });

  return rows.reduce((sum, row) => {
    if (positiveOnly && row.amount <= 0) return sum;
    return sum + Math.abs(row.amount);
  }, 0);
}

async function handleGameAchievements(event: GameEvent): Promise<void> {
  const key: UserKey = { discordId: event.discordId, guildId: event.guildId };

  if (event.type === 'game_played') {
    const stats = await prisma.gameStats.findMany({
      where: { discordId: key.discordId, guildId: key.guildId },
    });
    const gamesPlayed = stats.reduce((sum, row) => sum + row.gamesPlayed, 0);
    await achievementService.checkAndAward(key, 'games_played', { value: gamesPlayed });

    const playedTypes = new Set(stats.filter((row) => row.gamesPlayed > 0).map((row) => row.gameType));
    if (playedTypes.size >= gamesConfig.games.length) {
      await achievementService.checkAndAward(key, 'all_games_played');
    }
  }

  if (event.type === 'game_won') {
    const stats = await prisma.gameStats.findMany({
      where: { discordId: key.discordId, guildId: key.guildId },
    });
    const wins = stats.reduce((sum, row) => sum + row.wins, 0);
    await achievementService.checkAndAward(key, 'games_won', { value: wins });

    const profit = event.payout - event.bet;
    if (profit > 0) {
      const biggestWin = stats.reduce((max, row) => Math.max(max, row.biggestWin), 0);
      await achievementService.checkAndAward(key, 'biggest_win', { value: biggestWin });
    }

    const streak = (winStreaks.get(streakKey(key)) ?? 0) + 1;
    winStreaks.set(streakKey(key), streak);
    await achievementService.checkAndAward(key, 'win_streak', { value: streak });
  }

  if (event.type === 'game_lost') {
    winStreaks.set(streakKey(key), 0);
    await achievementService.checkAndAward(key, 'win_streak', { value: 0 });
  }
}

async function handleEconomyAchievements(key: UserKey): Promise<void> {
  const balance = await economyService.getBalance(key);
  await achievementService.checkAndAward(key, 'net_worth', {
    value: balance.netWorth,
  });
}

async function handleGameAnnounce(client: Client, event: GameEvent): Promise<void> {
  if (event.type !== 'game_won') return;

  const profit = event.payout - event.bet;
  await announceBigWin(
    client,
    event.guildId,
    event.discordId,
    event.gameType,
    event.bet,
    event.payout,
    profit,
  );
}

async function handleProgressionAnnounce(
  client: Client,
  event: ProgressionEvent,
): Promise<void> {
  if (event.type !== 'level_up' || event.previousLevel === undefined) return;

  await announceLevelUp(
    client,
    event.guildId,
    event.discordId,
    event.previousLevel,
    event.level,
  );

  const key: UserKey = { discordId: event.discordId, guildId: event.guildId };
  await achievementService.checkAndAward(key, 'level', { value: event.level });
}

export async function emitLevelUpEvents(
  key: UserKey,
  previousLevel: number,
  newLevel: number,
): Promise<void> {
  if (newLevel <= previousLevel) return;

  const timestamp = new Date();
  await eventBus.emitProgressionEvent({
    type: 'level_up',
    discordId: key.discordId,
    guildId: key.guildId,
    xp: 0,
    level: newLevel,
    previousLevel,
    timestamp,
  });
  await eventBus.emitQuestEvent({
    type: 'level_up',
    discordId: key.discordId,
    guildId: key.guildId,
    metadata: { previousLevel, newLevel },
    timestamp,
  });
}

export async function emitWorkEvents(key: UserKey, critical: boolean): Promise<void> {
  const timestamp = new Date();
  await eventBus.emitQuestEvent({
    type: 'work',
    discordId: key.discordId,
    guildId: key.guildId,
    timestamp,
  });

  const jobsCompleted = await prisma.transaction.count({
    where: { discordId: key.discordId, guildId: key.guildId, source: 'job' },
  });
  await achievementService.checkAndAward(key, 'jobs_completed', { value: jobsCompleted });

  if (critical) {
    await achievementService.checkAndAward(key, 'critical_work');
  }

  await handleEconomyAchievements(key);
}

export async function emitDepositEvents(key: UserKey, amount: number): Promise<void> {
  const timestamp = new Date();
  await eventBus.emitQuestEvent({
    type: 'deposit',
    discordId: key.discordId,
    guildId: key.guildId,
    amount,
    timestamp,
  });

  const totalDeposited = await sumTransactionAmount(key, 'deposit', true);
  await achievementService.checkAndAward(key, 'total_deposited', { value: totalDeposited });
  await handleEconomyAchievements(key);
}

export async function emitPayEvents(key: UserKey, amount: number): Promise<void> {
  const timestamp = new Date();
  await eventBus.emitQuestEvent({
    type: 'pay',
    discordId: key.discordId,
    guildId: key.guildId,
    amount,
    timestamp,
  });

  const totalPaid = await sumTransactionAmount(key, 'transfer_out');
  await achievementService.checkAndAward(key, 'total_paid', { value: totalPaid });
}

export async function emitShopPurchaseEvents(key: UserKey): Promise<void> {
  const timestamp = new Date();
  await eventBus.emitQuestEvent({
    type: 'shop_purchase',
    discordId: key.discordId,
    guildId: key.guildId,
    timestamp,
  });

  const upgrades = await prisma.userUpgrade.findMany({
    where: { discordId: key.discordId, guildId: key.guildId },
  });
  const ownedIds = new Set(upgrades.map((row) => row.upgradeId));
  if (shopConfig.upgrades.every((upgrade) => ownedIds.has(upgrade.id))) {
    await achievementService.checkAndAward(key, 'all_upgrades_owned');
  }

  await handleEconomyAchievements(key);
}

export async function emitDailyClaimEvents(
  key: UserKey,
  streak: number,
): Promise<void> {
  const timestamp = new Date();
  await eventBus.emitQuestEvent({
    type: 'daily_claim',
    discordId: key.discordId,
    guildId: key.guildId,
    metadata: { streak },
    timestamp,
  });

  await achievementService.checkAndAward(key, 'daily_streak', { value: streak });
  await handleEconomyAchievements(key);
}

export function registerEventHooks(client: Client): void {
  eventBus.onQuestEvent((event: QuestEvent) => questService.updateProgress(event));

  eventBus.onGameEvent(async (event: GameEvent) => {
    await handleGameAchievements(event);
    await handleGameAnnounce(client, event);
    await handleEconomyAchievements({
      discordId: event.discordId,
      guildId: event.guildId,
    });
  });

  eventBus.onProgressionEvent(async (event: ProgressionEvent) => {
    await handleProgressionAnnounce(client, event);
  });
}
