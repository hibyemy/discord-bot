import { prisma } from '../db.js';
import { formatCoins } from './embeds.js';

export const LEADERBOARD_SIZE = 10;

export const MEDALS = ['🥇', '🥈', '🥉'] as const;

export type LeaderboardType = 'richest' | 'level' | 'wins' | 'streak' | 'jobs';

export interface LeaderboardRow {
  discordId: string;
  value: number;
}

export interface UserRanking {
  type: LeaderboardType;
  rank: number | null;
  total: number;
  value: number;
}

export const TYPE_META: Record<
  LeaderboardType,
  { title: string; valueLabel: string; emoji: string; format: (value: number) => string }
> = {
  richest: {
    title: 'Richest Players',
    valueLabel: 'Net Worth',
    emoji: '💰',
    format: (value) => formatCoins(value),
  },
  level: {
    title: 'Highest Levels',
    valueLabel: 'Level',
    emoji: '⭐',
    format: (value) => `Level ${value}`,
  },
  wins: {
    title: 'Most Wins',
    valueLabel: 'Wins',
    emoji: '🏆',
    format: (value) => `${value.toLocaleString()} wins`,
  },
  streak: {
    title: 'Longest Daily Streaks',
    valueLabel: 'Streak',
    emoji: '🔥',
    format: (value) => `${value} day${value === 1 ? '' : 's'}`,
  },
  jobs: {
    title: 'Most Jobs Completed',
    valueLabel: 'Shifts',
    emoji: '💼',
    format: (value) => `${value.toLocaleString()} shifts`,
  },
};

export const LEADERBOARD_TYPES: LeaderboardType[] = [
  'richest',
  'level',
  'wins',
  'streak',
  'jobs',
];

async function fetchRichest(
  guildId: string,
  globalScope: boolean,
): Promise<LeaderboardRow[]> {
  if (globalScope) {
    const rows = await prisma.$queryRaw<Array<{ discordId: string; netWorth: bigint }>>`
      SELECT discordId, SUM(wallet + bank) AS netWorth
      FROM User
      GROUP BY discordId
      ORDER BY netWorth DESC
      LIMIT ${LEADERBOARD_SIZE}
    `;

    return rows.map((row) => ({
      discordId: row.discordId,
      value: Number(row.netWorth),
    }));
  }

  const users = await prisma.user.findMany({
    where: { guildId },
    orderBy: [{ wallet: 'desc' }, { bank: 'desc' }],
    take: LEADERBOARD_SIZE,
    select: { discordId: true, wallet: true, bank: true },
  });

  return users.map((user) => ({
    discordId: user.discordId,
    value: user.wallet + user.bank,
  }));
}

async function fetchLevels(
  guildId: string,
  globalScope: boolean,
): Promise<LeaderboardRow[]> {
  if (globalScope) {
    const rows = await prisma.$queryRaw<Array<{ discordId: string; level: number }>>`
      SELECT discordId, MAX(level) AS level
      FROM User
      GROUP BY discordId
      ORDER BY level DESC
      LIMIT ${LEADERBOARD_SIZE}
    `;

    return rows.map((row) => ({
      discordId: row.discordId,
      value: row.level,
    }));
  }

  const users = await prisma.user.findMany({
    where: { guildId },
    orderBy: [{ level: 'desc' }, { xp: 'desc' }],
    take: LEADERBOARD_SIZE,
    select: { discordId: true, level: true },
  });

  return users.map((user) => ({
    discordId: user.discordId,
    value: user.level,
  }));
}

async function fetchWins(
  guildId: string,
  globalScope: boolean,
): Promise<LeaderboardRow[]> {
  const grouped = await prisma.gameStats.groupBy({
    by: globalScope ? ['discordId'] : ['discordId', 'guildId'],
    where: globalScope ? { wins: { gt: 0 } } : { guildId, wins: { gt: 0 } },
    _sum: { wins: true },
    orderBy: { _sum: { wins: 'desc' } },
    take: LEADERBOARD_SIZE,
  });

  return grouped.map((row) => ({
    discordId: row.discordId,
    value: row._sum.wins ?? 0,
  }));
}

async function fetchStreaks(
  guildId: string,
  globalScope: boolean,
): Promise<LeaderboardRow[]> {
  if (globalScope) {
    const rows = await prisma.$queryRaw<Array<{ discordId: string; streak: number }>>`
      SELECT discordId, MAX(dailyStreak) AS streak
      FROM User
      WHERE dailyStreak > 0
      GROUP BY discordId
      ORDER BY streak DESC
      LIMIT ${LEADERBOARD_SIZE}
    `;

    return rows.map((row) => ({
      discordId: row.discordId,
      value: row.streak,
    }));
  }

  const users = await prisma.user.findMany({
    where: { guildId, dailyStreak: { gt: 0 } },
    orderBy: { dailyStreak: 'desc' },
    take: LEADERBOARD_SIZE,
    select: { discordId: true, dailyStreak: true },
  });

  return users.map((user) => ({
    discordId: user.discordId,
    value: user.dailyStreak,
  }));
}

async function fetchJobs(
  guildId: string,
  globalScope: boolean,
): Promise<LeaderboardRow[]> {
  const grouped = await prisma.transaction.groupBy({
    by: globalScope ? ['discordId'] : ['discordId', 'guildId'],
    where: globalScope
      ? { source: 'job', amount: { gt: 0 } }
      : { guildId, source: 'job', amount: { gt: 0 } },
    _count: { _all: true },
    orderBy: { _count: { id: 'desc' } },
    take: LEADERBOARD_SIZE,
  });

  return grouped.map((row) => ({
    discordId: row.discordId,
    value: row._count._all,
  }));
}

export async function fetchLeaderboard(
  type: LeaderboardType,
  guildId: string,
  globalScope: boolean,
): Promise<LeaderboardRow[]> {
  switch (type) {
    case 'richest':
      return fetchRichest(guildId, globalScope);
    case 'level':
      return fetchLevels(guildId, globalScope);
    case 'wins':
      return fetchWins(guildId, globalScope);
    case 'streak':
      return fetchStreaks(guildId, globalScope);
    case 'jobs':
      return fetchJobs(guildId, globalScope);
  }
}

async function getRichestRanking(
  guildId: string,
  discordId: string,
  globalScope: boolean,
): Promise<UserRanking> {
  if (globalScope) {
    const rows = await prisma.$queryRaw<
      Array<{ rank: bigint; total: bigint; value: bigint }>
    >`
      WITH totals AS (
        SELECT discordId, SUM(wallet + bank) AS netWorth
        FROM User
        GROUP BY discordId
      ),
      ranked AS (
        SELECT
          discordId,
          netWorth AS value,
          ROW_NUMBER() OVER (ORDER BY netWorth DESC) AS rank,
          COUNT(*) OVER () AS total
        FROM totals
      )
      SELECT rank, total, value
      FROM ranked
      WHERE discordId = ${discordId}
    `;
    const row = rows[0];
    return {
      type: 'richest',
      rank: row ? Number(row.rank) : null,
      total: row ? Number(row.total) : 0,
      value: row ? Number(row.value) : 0,
    };
  }

  const rows = await prisma.$queryRaw<
    Array<{ rank: bigint; total: bigint; value: bigint }>
  >`
    WITH ranked AS (
      SELECT
        discordId,
        (wallet + bank) AS value,
        ROW_NUMBER() OVER (ORDER BY (wallet + bank) DESC, xp DESC) AS rank,
        COUNT(*) OVER () AS total
      FROM User
      WHERE guildId = ${guildId}
    )
    SELECT rank, total, value
    FROM ranked
    WHERE discordId = ${discordId}
  `;
  const row = rows[0];
  return {
    type: 'richest',
    rank: row ? Number(row.rank) : null,
    total: row ? Number(row.total) : 0,
    value: row ? Number(row.value) : 0,
  };
}

async function getLevelRanking(
  guildId: string,
  discordId: string,
  globalScope: boolean,
): Promise<UserRanking> {
  if (globalScope) {
    const rows = await prisma.$queryRaw<
      Array<{ rank: bigint; total: bigint; value: bigint }>
    >`
      WITH totals AS (
        SELECT discordId, MAX(level) AS value
        FROM User
        GROUP BY discordId
      ),
      ranked AS (
        SELECT
          discordId,
          value,
          ROW_NUMBER() OVER (ORDER BY value DESC) AS rank,
          COUNT(*) OVER () AS total
        FROM totals
      )
      SELECT rank, total, value
      FROM ranked
      WHERE discordId = ${discordId}
    `;
    const row = rows[0];
    return {
      type: 'level',
      rank: row ? Number(row.rank) : null,
      total: row ? Number(row.total) : 0,
      value: row ? Number(row.value) : 0,
    };
  }

  const rows = await prisma.$queryRaw<
    Array<{ rank: bigint; total: bigint; value: bigint }>
  >`
    WITH ranked AS (
      SELECT
        discordId,
        level AS value,
        ROW_NUMBER() OVER (ORDER BY level DESC, xp DESC) AS rank,
        COUNT(*) OVER () AS total
      FROM User
      WHERE guildId = ${guildId}
    )
    SELECT rank, total, value
    FROM ranked
    WHERE discordId = ${discordId}
  `;
  const row = rows[0];
  return {
    type: 'level',
    rank: row ? Number(row.rank) : null,
    total: row ? Number(row.total) : 0,
    value: row ? Number(row.value) : 0,
  };
}

async function getWinsRanking(
  guildId: string,
  discordId: string,
  globalScope: boolean,
): Promise<UserRanking> {
  if (globalScope) {
    const rows = await prisma.$queryRaw<
      Array<{ rank: bigint | null; total: bigint; value: bigint | null }>
    >`
      WITH summed AS (
        SELECT discordId, SUM(wins) AS value
        FROM GameStats
        WHERE wins > 0
        GROUP BY discordId
      ),
      ranked AS (
        SELECT
          discordId,
          value,
          ROW_NUMBER() OVER (ORDER BY value DESC) AS rank,
          COUNT(*) OVER () AS total
        FROM summed
      )
      SELECT rank, total, value
      FROM ranked
      WHERE discordId = ${discordId}
    `;
    const row = rows[0];
    return {
      type: 'wins',
      rank: row?.rank != null ? Number(row.rank) : null,
      total: row ? Number(row.total) : 0,
      value: row?.value != null ? Number(row.value) : 0,
    };
  }

  const rows = await prisma.$queryRaw<
    Array<{ rank: bigint | null; total: bigint; value: bigint | null }>
  >`
    WITH summed AS (
      SELECT discordId, SUM(wins) AS value
      FROM GameStats
      WHERE guildId = ${guildId} AND wins > 0
      GROUP BY discordId
    ),
    ranked AS (
      SELECT
        discordId,
        value,
        ROW_NUMBER() OVER (ORDER BY value DESC) AS rank,
        COUNT(*) OVER () AS total
      FROM summed
    )
    SELECT rank, total, value
    FROM ranked
    WHERE discordId = ${discordId}
  `;
  const row = rows[0];
  return {
    type: 'wins',
    rank: row?.rank != null ? Number(row.rank) : null,
    total: row ? Number(row.total) : 0,
    value: row?.value != null ? Number(row.value) : 0,
  };
}

async function getStreakRanking(
  guildId: string,
  discordId: string,
  globalScope: boolean,
): Promise<UserRanking> {
  if (globalScope) {
    const rows = await prisma.$queryRaw<
      Array<{ rank: bigint | null; total: bigint; value: bigint | null }>
    >`
      WITH totals AS (
        SELECT discordId, MAX(dailyStreak) AS value
        FROM User
        WHERE dailyStreak > 0
        GROUP BY discordId
      ),
      ranked AS (
        SELECT
          discordId,
          value,
          ROW_NUMBER() OVER (ORDER BY value DESC) AS rank,
          COUNT(*) OVER () AS total
        FROM totals
      )
      SELECT rank, total, value
      FROM ranked
      WHERE discordId = ${discordId}
    `;
    const row = rows[0];
    return {
      type: 'streak',
      rank: row?.rank != null ? Number(row.rank) : null,
      total: row ? Number(row.total) : 0,
      value: row?.value != null ? Number(row.value) : 0,
    };
  }

  const rows = await prisma.$queryRaw<
    Array<{ rank: bigint | null; total: bigint; value: bigint | null }>
  >`
    WITH ranked AS (
      SELECT
        discordId,
        dailyStreak AS value,
        ROW_NUMBER() OVER (ORDER BY dailyStreak DESC) AS rank,
        COUNT(*) OVER () AS total
      FROM User
      WHERE guildId = ${guildId} AND dailyStreak > 0
    )
    SELECT rank, total, value
    FROM ranked
    WHERE discordId = ${discordId}
  `;
  const row = rows[0];
  return {
    type: 'streak',
    rank: row?.rank != null ? Number(row.rank) : null,
    total: row ? Number(row.total) : 0,
    value: row?.value != null ? Number(row.value) : 0,
  };
}

async function getJobsRanking(
  guildId: string,
  discordId: string,
  globalScope: boolean,
): Promise<UserRanking> {
  if (globalScope) {
    const rows = await prisma.$queryRaw<
      Array<{ rank: bigint | null; total: bigint; value: bigint | null }>
    >`
      WITH summed AS (
        SELECT discordId, COUNT(*) AS value
        FROM Transaction
        WHERE source = 'job' AND amount > 0
        GROUP BY discordId
      ),
      ranked AS (
        SELECT
          discordId,
          value,
          ROW_NUMBER() OVER (ORDER BY value DESC) AS rank,
          COUNT(*) OVER () AS total
        FROM summed
      )
      SELECT rank, total, value
      FROM ranked
      WHERE discordId = ${discordId}
    `;
    const row = rows[0];
    return {
      type: 'jobs',
      rank: row?.rank != null ? Number(row.rank) : null,
      total: row ? Number(row.total) : 0,
      value: row?.value != null ? Number(row.value) : 0,
    };
  }

  const rows = await prisma.$queryRaw<
    Array<{ rank: bigint | null; total: bigint; value: bigint | null }>
  >`
    WITH summed AS (
      SELECT discordId, COUNT(*) AS value
      FROM Transaction
      WHERE guildId = ${guildId} AND source = 'job' AND amount > 0
      GROUP BY discordId
    ),
    ranked AS (
      SELECT
        discordId,
        value,
        ROW_NUMBER() OVER (ORDER BY value DESC) AS rank,
        COUNT(*) OVER () AS total
      FROM summed
    )
    SELECT rank, total, value
    FROM ranked
    WHERE discordId = ${discordId}
  `;
  const row = rows[0];
  return {
    type: 'jobs',
    rank: row?.rank != null ? Number(row.rank) : null,
    total: row ? Number(row.total) : 0,
    value: row?.value != null ? Number(row.value) : 0,
  };
}

export async function getUserRankings(
  guildId: string,
  discordId: string,
  globalScope: boolean,
): Promise<UserRanking[]> {
  return Promise.all([
    getRichestRanking(guildId, discordId, globalScope),
    getLevelRanking(guildId, discordId, globalScope),
    getWinsRanking(guildId, discordId, globalScope),
    getStreakRanking(guildId, discordId, globalScope),
    getJobsRanking(guildId, discordId, globalScope),
  ]);
}

export function formatLeaderboardLines(
  rows: LeaderboardRow[],
  names: Map<string, string>,
  formatValue: (value: number) => string,
): string {
  if (rows.length === 0) {
    return '_No entries yet._';
  }

  return rows
    .map((row, index) => {
      const rank = index + 1;
      const prefix = rank <= MEDALS.length ? MEDALS[rank - 1] : `\`${rank}.\``;
      const name = names.get(row.discordId) ?? row.discordId;
      return `${prefix} **${name}** — ${formatValue(row.value)}`;
    })
    .join('\n');
}

export function formatRankingLine(ranking: UserRanking): string {
  const meta = TYPE_META[ranking.type];
  if (ranking.rank == null || ranking.value <= 0) {
    return `${meta.emoji} **${meta.valueLabel}** — Unranked`;
  }

  const totalLabel = ranking.total > 0 ? ` of ${ranking.total}` : '';
  return `${meta.emoji} **${meta.valueLabel}** — #${ranking.rank}${totalLabel} (${meta.format(ranking.value)})`;
}
