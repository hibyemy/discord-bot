export type QuestType =
  | 'work'
  | 'game_win'
  | 'game_play'
  | 'wager_total'
  | 'deposit'
  | 'win_streak'
  | 'shop_purchase'
  | 'pay_user';

export interface QuestPoolEntry {
  id: string;
  type: QuestType;
  description: string;
  target: number;
  rewardCoins: number;
  rewardXp: number;
  weight: number;
}

export const questConfig = {
  dailyQuestCount: 3,
  /** Streak bonus on each quest claim: +20% per completed period, cap 7 */
  streakBonusPerDay: 0.2,
  streakBonusCap: 7,
  /** Top of every hour (UTC) */
  resetCron: '0 * * * *',
  resetTimezone: 'UTC',

  pool: [
    {
      id: 'work_3',
      type: 'work',
      description: 'Work 3 times',
      target: 3,
      rewardCoins: 500,
      rewardXp: 30,
      weight: 10,
    },
    {
      id: 'work_5',
      type: 'work',
      description: 'Work 5 times',
      target: 5,
      rewardCoins: 800,
      rewardXp: 50,
      weight: 6,
    },
    {
      id: 'win_2',
      type: 'game_win',
      description: 'Win 2 games',
      target: 2,
      rewardCoins: 600,
      rewardXp: 40,
      weight: 10,
    },
    {
      id: 'win_5',
      type: 'game_win',
      description: 'Win 5 games',
      target: 5,
      rewardCoins: 1200,
      rewardXp: 75,
      weight: 5,
    },
    {
      id: 'play_3',
      type: 'game_play',
      description: 'Play 3 games',
      target: 3,
      rewardCoins: 400,
      rewardXp: 25,
      weight: 10,
    },
    {
      id: 'wager_10k',
      type: 'wager_total',
      description: 'Wager 10,000 total',
      target: 10_000,
      rewardCoins: 1000,
      rewardXp: 60,
      weight: 8,
    },
    {
      id: 'wager_25k',
      type: 'wager_total',
      description: 'Wager 25,000 total',
      target: 25_000,
      rewardCoins: 2000,
      rewardXp: 100,
      weight: 4,
    },
    {
      id: 'deposit_5k',
      type: 'deposit',
      description: 'Deposit 5,000 to bank',
      target: 5_000,
      rewardCoins: 750,
      rewardXp: 35,
      weight: 8,
    },
    {
      id: 'deposit_10k',
      type: 'deposit',
      description: 'Deposit 10,000 to bank',
      target: 10_000,
      rewardCoins: 1200,
      rewardXp: 55,
      weight: 5,
    },
    {
      id: 'shop_1',
      type: 'shop_purchase',
      description: 'Buy 1 shop upgrade',
      target: 1,
      rewardCoins: 500,
      rewardXp: 30,
      weight: 6,
    },
    {
      id: 'pay_1k',
      type: 'pay_user',
      description: 'Pay another user 1,000 coins',
      target: 1_000,
      rewardCoins: 400,
      rewardXp: 20,
      weight: 5,
    },
  ] satisfies QuestPoolEntry[],
} as const;
