export interface UpgradeDefinition {
  id: string;
  name: string;
  description: string;
  tier: number;
  unlockLevel: number;
  maxRank: number;
  /** Cost per rank (index 0 = rank 1) */
  costs: number[];
  effectPerRank: number;
  effectType:
    | 'job_payout'
    | 'win_chance'
    | 'cooldown_reduction'
    | 'bank_interest'
    | 'max_bet';
}

export const shopConfig = {
  upgrades: [
    {
      id: 'pay_raise',
      name: 'Pay Raise',
      description: '+5% job payout per rank',
      tier: 1,
      unlockLevel: 1,
      maxRank: 5,
      costs: [5_000, 15_000, 40_000, 100_000, 250_000],
      effectPerRank: 0.05,
      effectType: 'job_payout',
    },
    {
      id: 'lucky_charm',
      name: 'Lucky Charm',
      description: '+0.5% win chance per rank (capped)',
      tier: 1,
      unlockLevel: 1,
      maxRank: 3,
      costs: [10_000, 30_000, 75_000],
      effectPerRank: 0.005,
      effectType: 'win_chance',
    },
    {
      id: 'fast_hands',
      name: 'Fast Hands',
      description: '-10% job cooldown per rank',
      tier: 2,
      unlockLevel: 10,
      maxRank: 3,
      costs: [8_000, 20_000, 50_000],
      effectPerRank: 0.1,
      effectType: 'cooldown_reduction',
    },
    {
      id: 'bank_interest',
      name: 'Bank Interest',
      description: '+0.5% daily bank interest per rank',
      tier: 2,
      unlockLevel: 10,
      maxRank: 5,
      costs: [12_000, 35_000, 80_000, 180_000, 400_000],
      effectPerRank: 0.005,
      effectType: 'bank_interest',
    },
    {
      id: 'high_roller',
      name: 'High Roller',
      description: '+10% max bet per rank',
      tier: 3,
      unlockLevel: 25,
      maxRank: 3,
      costs: [25_000, 75_000, 200_000],
      effectPerRank: 0.1,
      effectType: 'max_bet',
    },
  ] satisfies UpgradeDefinition[],
} as const;

export function getUpgrade(id: string): UpgradeDefinition | undefined {
  return shopConfig.upgrades.find((u) => u.id === id);
}

export function getUpgradeCost(upgrade: UpgradeDefinition, currentRank: number): number | null {
  if (currentRank >= upgrade.maxRank) return null;
  return upgrade.costs[currentRank] ?? null;
}
