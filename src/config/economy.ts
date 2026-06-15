export const economyConfig = {
  currencyName: 'Coins',
  startingBalance: 1000,
  startingBank: 0,
  startingLevel: 1,
  startingXp: 0,

  /** Daily reward base amount (day 1) */
  dailyBaseReward: 1000,
  /** +12% payout per streak day before milestone (day 2 = 1.12×, day 4 = 1.36×, etc.) */
  dailyStreakRampPerDay: 0.12,
  /** Full streak bonus kicks in at this many consecutive days */
  dailyStreakMultiplierDay: 5,
  /** Payout multiplier at/above streak milestone day */
  dailyStreakMultiplier: 5,
  dailyStreakCap: 45,

  /** P2P transfer tax (5% sink) */
  transferTaxRate: 0.05,

  /** Max bet: min(1000 * level, 500_000) */
  maxBetBasePerLevel: 1000,
  maxBetAbsolute: 500_000,
  minBet: 1,

  /** Level formula — quick early levels, steep curve after 25 for long-term mastery */
  xpBase: 50,
  xpExponentEarly: 1.36,
  xpLateLevelStart: 25,
  xpLateExponent: 1.72,

  /** Bank interest cron (daily) */
  bankInterestBaseRate: 0.01,

  /** Participation XP for games */
  gameXpWin: 20,
  gameXpLoss: 8,

  /** Shop tier unlock levels */
  shopTierUnlocks: {
    1: 1,
    2: 10,
    3: 25,
  } as Record<number, number>,
} as const;

export function xpToNextLevel(level: number): number {
  const { xpBase, xpExponentEarly, xpLateLevelStart, xpLateExponent } = economyConfig;

  if (level < xpLateLevelStart) {
    return Math.floor(xpBase * Math.pow(level, xpExponentEarly));
  }

  const anchor = Math.floor(xpBase * Math.pow(xpLateLevelStart - 1, xpExponentEarly));
  return Math.floor(anchor * Math.pow(level / (xpLateLevelStart - 1), xpLateExponent));
}

export function maxBetForLevel(level: number, bonusMultiplier = 1): number {
  const base = Math.min(
    economyConfig.maxBetBasePerLevel * level,
    economyConfig.maxBetAbsolute,
  );
  return Math.floor(base * bonusMultiplier);
}

export function dailyStreakPayMultiplier(streak: number): number {
  const days = Math.min(Math.max(streak, 1), economyConfig.dailyStreakCap);
  if (days >= economyConfig.dailyStreakMultiplierDay) {
    return economyConfig.dailyStreakMultiplier;
  }
  return 1 + (days - 1) * economyConfig.dailyStreakRampPerDay;
}

export function dailyRewardForStreak(streak: number): number {
  return Math.floor(economyConfig.dailyBaseReward * dailyStreakPayMultiplier(streak));
}
