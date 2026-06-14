export type AchievementCategory =
  | 'economy'
  | 'jobs'
  | 'games'
  | 'social'
  | 'progression';

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  coinReward: number;
  xpReward: number;
  /** Trigger key checked by AchievementService */
  trigger: string;
  threshold?: number;
}

export const achievementsConfig = {
  achievements: [
    // Economy
    {
      id: 'first_coins',
      name: 'Pocket Change',
      description: 'Earn your first 1,000 coins',
      category: 'economy',
      coinReward: 100,
      xpReward: 25,
      trigger: 'net_worth',
      threshold: 1000,
    },
    {
      id: 'saver',
      name: 'Saver',
      description: 'Deposit 10,000 coins to your bank',
      category: 'economy',
      coinReward: 500,
      xpReward: 50,
      trigger: 'total_deposited',
      threshold: 10_000,
    },
    {
      id: 'whale',
      name: 'Whale',
      description: 'Reach 1,000,000 net worth',
      category: 'economy',
      coinReward: 10_000,
      xpReward: 500,
      trigger: 'net_worth',
      threshold: 1_000_000,
    },
    {
      id: 'daily_streak_7',
      name: 'Consistent',
      description: 'Maintain a 7-day daily streak',
      category: 'economy',
      coinReward: 1000,
      xpReward: 75,
      trigger: 'daily_streak',
      threshold: 7,
    },
    {
      id: 'daily_streak_30',
      name: 'Dedicated',
      description: 'Maintain a 30-day daily streak',
      category: 'economy',
      coinReward: 5000,
      xpReward: 200,
      trigger: 'daily_streak',
      threshold: 30,
    },
    // Jobs
    {
      id: 'first_work',
      name: 'First Shift',
      description: 'Complete your first job',
      category: 'jobs',
      coinReward: 100,
      xpReward: 25,
      trigger: 'jobs_completed',
      threshold: 1,
    },
    {
      id: 'grindset',
      name: 'Grindset',
      description: 'Complete 100 jobs',
      category: 'jobs',
      coinReward: 2000,
      xpReward: 150,
      trigger: 'jobs_completed',
      threshold: 100,
    },
    {
      id: 'workaholic',
      name: 'Workaholic',
      description: 'Complete 500 jobs',
      category: 'jobs',
      coinReward: 8000,
      xpReward: 400,
      trigger: 'jobs_completed',
      threshold: 500,
    },
    {
      id: 'critical_hit',
      name: 'Critical Hit',
      description: 'Land a critical work payout',
      category: 'jobs',
      coinReward: 250,
      xpReward: 30,
      trigger: 'critical_work',
    },
    {
      id: 'tier5_job',
      name: 'Top Earner',
      description: 'Unlock a tier 5 job',
      category: 'jobs',
      coinReward: 3000,
      xpReward: 200,
      trigger: 'job_tier_unlocked',
      threshold: 5,
    },
    // Games
    {
      id: 'first_blood',
      name: 'First Blood',
      description: 'Win your first game',
      category: 'games',
      coinReward: 100,
      xpReward: 25,
      trigger: 'games_won',
      threshold: 1,
    },
    {
      id: 'lucky_streak',
      name: 'Hot Streak',
      description: 'Win 5 games in a row',
      category: 'games',
      coinReward: 750,
      xpReward: 60,
      trigger: 'win_streak',
      threshold: 5,
    },
    {
      id: 'degenerate',
      name: 'Degenerate',
      description: 'Play 1,000 games',
      category: 'games',
      coinReward: 5000,
      xpReward: 300,
      trigger: 'games_played',
      threshold: 1000,
    },
    {
      id: 'high_roller_win',
      name: 'Jackpot',
      description: 'Win 50,000 in a single game',
      category: 'games',
      coinReward: 2500,
      xpReward: 150,
      trigger: 'biggest_win',
      threshold: 50_000,
    },
    {
      id: 'all_games',
      name: 'Casino Regular',
      description: 'Play every game type at least once',
      category: 'games',
      coinReward: 1500,
      xpReward: 100,
      trigger: 'all_games_played',
    },
    {
      id: 'blackjack_21',
      name: 'Natural 21',
      description: 'Get a natural blackjack',
      category: 'games',
      coinReward: 500,
      xpReward: 40,
      trigger: 'blackjack_natural',
    },
    {
      id: 'crash_10x',
      name: 'Moon Shot',
      description: 'Cash out crash at 10x or higher',
      category: 'games',
      coinReward: 1000,
      xpReward: 80,
      trigger: 'crash_multiplier',
      threshold: 10,
    },
    // Social
    {
      id: 'generous',
      name: 'Generous',
      description: 'Pay another user 10,000 coins total',
      category: 'social',
      coinReward: 500,
      xpReward: 40,
      trigger: 'total_paid',
      threshold: 10_000,
    },
    {
      id: 'philanthropist',
      name: 'Philanthropist',
      description: 'Pay another user 100,000 coins total',
      category: 'social',
      coinReward: 3000,
      xpReward: 150,
      trigger: 'total_paid',
      threshold: 100_000,
    },
    // Progression
    {
      id: 'level_10',
      name: 'Rising Star',
      description: 'Reach level 10',
      category: 'progression',
      coinReward: 500,
      xpReward: 0,
      trigger: 'level',
      threshold: 10,
    },
    {
      id: 'level_25',
      name: 'Veteran',
      description: 'Reach level 25',
      category: 'progression',
      coinReward: 2000,
      xpReward: 0,
      trigger: 'level',
      threshold: 25,
    },
    {
      id: 'level_50',
      name: 'Legend',
      description: 'Reach level 50',
      category: 'progression',
      coinReward: 10_000,
      xpReward: 0,
      trigger: 'level',
      threshold: 50,
    },
    {
      id: 'quest_master',
      name: 'Quest Master',
      description: 'Complete all daily quests 7 days in a row',
      category: 'progression',
      coinReward: 3000,
      xpReward: 200,
      trigger: 'quest_streak',
      threshold: 7,
    },
    {
      id: 'shop_collector',
      name: 'Collector',
      description: 'Own at least one rank of every upgrade',
      category: 'progression',
      coinReward: 5000,
      xpReward: 250,
      trigger: 'all_upgrades_owned',
    },
  ] satisfies AchievementDef[],
} as const;

export function getAchievement(id: string): AchievementDef | undefined {
  return achievementsConfig.achievements.find((a) => a.id === id);
}
