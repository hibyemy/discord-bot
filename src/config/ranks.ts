export const rankTiers = [
  { id: 'newcomer', name: 'Newcomer', minLevel: 1, emoji: '🌱' },
  { id: 'regular', name: 'Regular', minLevel: 5, emoji: '🪙' },
  { id: 'gambler', name: 'Gambler', minLevel: 10, emoji: '🎲' },
  { id: 'high_roller', name: 'High Roller', minLevel: 20, emoji: '💎' },
  { id: 'baron', name: 'Baron', minLevel: 35, emoji: '🏛️' },
  { id: 'magnate', name: 'Magnate', minLevel: 50, emoji: '👑' },
  { id: 'legend', name: 'Legend', minLevel: 75, emoji: '⭐' },
  { id: 'mythic', name: 'Mythic', minLevel: 100, emoji: '🔥' },
] as const;

export type RankTier = (typeof rankTiers)[number];

export interface RankTierProgress {
  current: RankTier;
  next: RankTier | null;
  levelsToNext: number;
  progressPercent: number;
}

export function getRankTierForLevel(level: number): RankTierProgress {
  let current: RankTier = rankTiers[0]!;
  for (const tier of rankTiers) {
    if (level >= tier.minLevel) {
      current = tier;
    }
  }

  const currentIndex = rankTiers.indexOf(current);
  const next =
    currentIndex >= 0 && currentIndex < rankTiers.length - 1
      ? rankTiers[currentIndex + 1]!
      : null;

  if (!next) {
    return { current, next: null, levelsToNext: 0, progressPercent: 100 };
  }

  const span = next.minLevel - current.minLevel;
  const progress = level - current.minLevel;
  const progressPercent =
    span > 0 ? Math.min(100, Math.floor((progress / span) * 100)) : 0;

  return {
    current,
    next,
    levelsToNext: Math.max(0, next.minLevel - level),
    progressPercent,
  };
}

export function formatRankTier(tier: RankTier): string {
  return `${tier.emoji} ${tier.name}`;
}
