import type { User, Transaction, GuildConfig, UserUpgrade } from '@prisma/client';
import type { TransactionSource } from './events.js';

export interface UserKey {
  discordId: string;
  guildId: string;
}

export interface TransferOptions {
  amount: number;
  source: TransactionSource;
  metadata?: Record<string, unknown>;
  /** Deduct from bank instead of wallet */
  fromBank?: boolean;
  /** Credit to bank instead of wallet */
  toBank?: boolean;
}

export interface BalanceInfo {
  wallet: number;
  bank: number;
  netWorth: number;
}

export interface BetValidation {
  valid: boolean;
  maxBet: number;
  reason?: string;
}

export interface DailyRewardResult {
  amount: number;
  streak: number;
  multiplier: number;
  user: User;
}

export interface UnlockInfo {
  jobs: string[];
  games: string[];
  shopTiers: number[];
  maxBet: number;
}

export interface WorkResult {
  payout: number;
  xp: number;
  critical: boolean;
  jobName: string;
  cooldownMs: number;
  user: User;
  taskLabel?: string;
}

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  maxRank: number;
  tier: number;
  costs: number[];
  currentRank: number;
  nextCost: number | null;
  unlocked: boolean;
}

export interface ShopMultipliers {
  jobPayout: number;
  winChanceBonus: number;
  cooldownReduction: number;
  bankInterest: number;
  maxBetBonus: number;
}

export interface QuestDefinition {
  id: string;
  description: string;
  target: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
  rewardCoins: number;
  rewardXp: number;
}

export interface QuestBoard {
  quests: QuestDefinition[];
  completed: number;
  streakBonus: number;
  allComplete: boolean;
  claimed: boolean;
}

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  coinReward: number;
  xpReward: number;
  earned: boolean;
  earnedAt?: Date;
}

export interface GuildConfigData {
  guildId: string;
  dailyBonusMultiplier: number;
  disabledGames: string[];
  disabledCommands: string[];
  transferTaxOverride: number | null;
  announceChannelId: string | null;
  welcomeBonus: number;
  globalLeaderboard: boolean;
}

export interface IEconomyService {
  getOrCreateUser(key: UserKey): Promise<User>;
  getBalance(key: UserKey): Promise<BalanceInfo>;
  transfer(key: UserKey, options: TransferOptions): Promise<Transaction>;
  transferBetween(
    from: UserKey,
    to: UserKey,
    amount: number,
    source: TransactionSource,
  ): Promise<{ sent: number; received: number; tax: number }>;
  validateBet(key: UserKey, amount: number): Promise<BetValidation>;
  applyDaily(key: UserKey): Promise<DailyRewardResult>;
  deposit(key: UserKey, amount: number): Promise<User>;
  withdraw(key: UserKey, amount: number): Promise<User>;
  getTransactions(key: UserKey, limit?: number): Promise<Transaction[]>;
}

export interface IProgressionService {
  awardXp(key: UserKey, amount: number, source?: string): Promise<User>;
  getLevel(key: UserKey): Promise<number>;
  xpToNextLevel(level: number): number;
  xpProgress(key: UserKey): Promise<{ current: number; required: number; percent: number }>;
  getUnlocks(level: number): UnlockInfo;
  setLevel(key: UserKey, level: number): Promise<User>;
  isUnlocked(key: UserKey, feature: string, requiredLevel: number): Promise<boolean>;
}

export interface IJobService {
  work(key: UserKey): Promise<WorkResult>;
  setJob(key: UserKey, jobName: string): Promise<User>;
  getAvailableJobs(key: UserKey): Promise<
    Array<{
      name: string;
      tier: number;
      basePay: number;
      cooldownMs: number;
      unlocked: boolean;
      active: boolean;
    }>
  >;
  getWorkCooldownRemaining(key: UserKey): Promise<number>;
}

export interface IShopService {
  listItems(key: UserKey): Promise<ShopItem[]>;
  buy(key: UserKey, upgradeId: string): Promise<UserUpgrade>;
  getActiveMultipliers(key: UserKey): Promise<ShopMultipliers>;
  getUpgradeRank(key: UserKey, upgradeId: string): Promise<number>;
}

export interface IQuestService {
  getDailyQuests(key: UserKey): Promise<QuestBoard>;
  updateProgress(event: import('./events.js').QuestEvent): Promise<void>;
  claimQuestReward(key: UserKey, questId: string): Promise<{ coins: number; xp: number }>;
  resetAllDaily(): Promise<number>;
  generateDailyQuests(key: UserKey): Promise<QuestBoard>;
}

export interface IAchievementService {
  checkAndAward(
    key: UserKey,
    trigger: string,
    context?: Record<string, unknown>,
  ): Promise<AchievementDefinition[]>;
  getEarned(key: UserKey): Promise<AchievementDefinition[]>;
  getProfileBadges(key: UserKey): Promise<string[]>;
  getAllWithStatus(key: UserKey): Promise<AchievementDefinition[]>;
}

export interface IGuildConfigService {
  getConfig(guildId: string): Promise<GuildConfigData>;
  updateConfig(
    guildId: string,
    updates: Partial<Omit<GuildConfigData, 'guildId'>>,
  ): Promise<GuildConfig>;
  isGameDisabled(guildId: string, gameType: string): Promise<boolean>;
  isCommandDisabled(guildId: string, commandName: string): Promise<boolean>;
  getTransferTax(guildId: string): Promise<number>;
}
