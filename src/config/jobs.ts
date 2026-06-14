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

export const jobConfig = {
  /** Payout: basePay * (1 + level * 0.02) * shopMultipliers * random(0.9, 1.1) */
  levelPayoutMultiplier: 0.02,
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

  tiers: [
    {
      tier: 1,
      unlockLevel: 1,
      cooldownMs: 60_000,
      jobs: [
        { name: 'Beggar', basePayMin: 50, basePayMax: 80 },
        { name: 'Street Performer', basePayMin: 50, basePayMax: 80 },
      ],
    },
    {
      tier: 2,
      unlockLevel: 5,
      cooldownMs: 90_000,
      jobs: [
        { name: 'Barista', basePayMin: 120, basePayMax: 180 },
        { name: 'Courier', basePayMin: 120, basePayMax: 180 },
      ],
    },
    {
      tier: 3,
      unlockLevel: 15,
      cooldownMs: 120_000,
      jobs: [
        { name: 'Developer', basePayMin: 300, basePayMax: 450 },
        { name: 'Day Trader', basePayMin: 300, basePayMax: 450 },
      ],
    },
    {
      tier: 4,
      unlockLevel: 30,
      cooldownMs: 180_000,
      jobs: [
        { name: 'Executive', basePayMin: 700, basePayMax: 1000 },
        { name: 'White-hat Hacker', basePayMin: 700, basePayMax: 1000 },
      ],
    },
    {
      tier: 5,
      unlockLevel: 50,
      cooldownMs: 300_000,
      jobs: [
        { name: 'Tycoon', basePayMin: 1500, basePayMax: 2500 },
        { name: 'Crypto Whale', basePayMin: 1500, basePayMax: 2500 },
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
