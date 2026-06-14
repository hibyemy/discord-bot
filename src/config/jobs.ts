export interface JobDefinition {
  name: string;
  tier: number;
  unlockLevel: number;
  basePayMin: number;
  basePayMax: number;
  cooldownMs: number;
}

export interface JobTier {
  tier: number;
  unlockLevel: number;
  cooldownMs: number;
  jobs: Array<{ name: string; basePayMin: number; basePayMax: number }>;
}

export interface WorkTask {
  id: string;
  label: string;
  emoji: string;
  multiplier: number;
  flavor: string;
}

export const jobConfig = {
  /** Payout: basePay * (1 + level * 0.02) * shopMultipliers * random(0.9, 1.1) */
  levelPayoutMultiplier: 0.025,
  payoutVarianceMin: 0.9,
  payoutVarianceMax: 1.1,

  /** XP per work: 10 + tier * 5 */
  baseWorkXp: 10,
  xpPerTier: 5,

  /** Critical work event (~5%): 2x payout + bonus XP */
  criticalChance: 0.05,
  criticalPayoutMultiplier: 2,
  criticalBonusXp: 25,

  /** Cooldown reducible via shop (max -30%) */
  maxCooldownReduction: 0.3,

  /** Pick one before each passive work shift for a small payout bonus */
  workTasks: [
    { id: 'rush', label: 'Rush Order', emoji: '⚡', multiplier: 1.12, flavor: 'You crushed a rush order!' },
    { id: 'quality', label: 'Quality Check', emoji: '🔍', multiplier: 1.08, flavor: 'Your quality check earned praise!' },
    { id: 'team', label: 'Team Assist', emoji: '🤝', multiplier: 1.05, flavor: 'You helped the team finish early!' },
    { id: 'inventory', label: 'Stock Shelves', emoji: '📦', multiplier: 1.06, flavor: 'Shelves stocked, manager impressed!' },
    { id: 'client', label: 'Client Call', emoji: '📞', multiplier: 1.1, flavor: 'The client loved your update!' },
    { id: 'cleanup', label: 'Deep Clean', emoji: '🧹', multiplier: 1.04, flavor: 'Spotless work — bonus incoming!' },
    { id: 'overtime', label: 'Overtime Push', emoji: '💪', multiplier: 1.15, flavor: 'Overtime hustle paid off!' },
    { id: 'training', label: 'Train New Hire', emoji: '🎓', multiplier: 1.07, flavor: 'Training complete — smooth shift!' },
  ] satisfies WorkTask[],

  /** Active focus shift — tier-specific minigames, scaled pay */
  focusWork: {
    minHitRatio: 0.4,
    xpMultiplier: 1.5,
  },

  tiers: [
    {
      tier: 1,
      unlockLevel: 1,
      cooldownMs: 48_000,
      jobs: [
        { name: 'Beggar', basePayMin: 60, basePayMax: 95 },
        { name: 'Street Performer', basePayMin: 60, basePayMax: 95 },
      ],
    },
    {
      tier: 2,
      unlockLevel: 5,
      cooldownMs: 72_000,
      jobs: [
        { name: 'Barista', basePayMin: 145, basePayMax: 215 },
        { name: 'Courier', basePayMin: 145, basePayMax: 215 },
      ],
    },
    {
      tier: 3,
      unlockLevel: 15,
      cooldownMs: 96_000,
      jobs: [
        { name: 'Developer', basePayMin: 360, basePayMax: 540 },
        { name: 'Day Trader', basePayMin: 360, basePayMax: 540 },
      ],
    },
    {
      tier: 4,
      unlockLevel: 30,
      cooldownMs: 144_000,
      jobs: [
        { name: 'Executive', basePayMin: 840, basePayMax: 1200 },
        { name: 'White-hat Hacker', basePayMin: 840, basePayMax: 1200 },
      ],
    },
    {
      tier: 5,
      unlockLevel: 50,
      cooldownMs: 240_000,
      jobs: [
        { name: 'Tycoon', basePayMin: 1800, basePayMax: 3000 },
        { name: 'Crypto Whale', basePayMin: 1800, basePayMax: 3000 },
      ],
    },
  ] satisfies JobTier[],
} as const;

export function getAllJobs(): JobDefinition[] {
  return jobConfig.tiers.flatMap((tier) =>
    tier.jobs.map((job) => ({
      name: job.name,
      tier: tier.tier,
      unlockLevel: tier.unlockLevel,
      basePayMin: job.basePayMin,
      basePayMax: job.basePayMax,
      cooldownMs: tier.cooldownMs,
    })),
  );
}

export function getJobByName(name: string): JobDefinition | undefined {
  return getAllJobs().find(
    (j) => j.name.toLowerCase() === name.toLowerCase(),
  );
}

export function workXpForTier(tier: number): number {
  return jobConfig.baseWorkXp + tier * jobConfig.xpPerTier;
}

export function pickWorkTasks(count: number): WorkTask[] {
  const pool = [...jobConfig.workTasks];
  const picked: WorkTask[] = [];

  for (let i = 0; i < count && pool.length > 0; i++) {
    const index = Math.floor(Math.random() * pool.length);
    const task = pool.splice(index, 1)[0];
    if (task) picked.push(task);
  }

  return picked;
}

export function getWorkTaskById(taskId: string): WorkTask | undefined {
  return jobConfig.workTasks.find((task) => task.id === taskId);
}
