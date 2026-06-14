export const economyConfig = {
  currencyName: 'Coins',
  startingBalance: 1000,
  startingBank: 0,
  startingLevel: 1,
  startingXp: 0,

  /** Daily reward base amount (day 1) */
  dailyBaseReward: 500,
  /** Streak multiplier kicks in at day 7+ (2x) */
  dailyStreakMultiplierDay: 7,
  dailyStreakMultiplier: 2,
  dailyStreakCap: 30,

  /** P2P transfer tax (5% sink) */
  transferTaxRate: 0.05,

  /** Max bet: min(1000 * level, 500_000) */
  maxBetBasePerLevel: 1000,
  maxBetAbsolute: 500_000,
  minBet: 1,

  /** Level formula: xpToNext = 100 * level^1.5 */
  xpBase: 100,
  xpExponent: 1.5,

  /** Bank interest cron (daily) */
  bankInterestBaseRate: 0.01,

  /** Participation XP for games */
  gameXpWin: 15,
  gameXpLoss: 5,

  /** Shop tier unlock levels */
  shopTierUnlocks: {
    1: 1,
    2: 10,
    3: 25,
  } as Record<number, number>,
} as const;

export function xpToNextLevel(level: number): number {
  return Math.floor(economyConfig.xpBase * Math.pow(level, economyConfig.xpExponent));
}

export function maxBetForLevel(level: number, bonusMultiplier = 1): number {
  const base = Math.min(
    economyConfig.maxBetBasePerLevel * level,
    economyConfig.maxBetAbsolute,
  );
  return Math.floor(base * bonusMultiplier);
}

export function dailyRewardForStreak(streak: number): number {
  const capped = Math.min(streak, economyConfig.dailyStreakCap);
  const multiplier =
    capped >= economyConfig.dailyStreakMultiplierDay
      ? economyConfig.dailyStreakMultiplier
      : 1;
  return Math.floor(economyConfig.dailyBaseReward * multiplier);
}
