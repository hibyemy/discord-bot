import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { Client } from 'discord.js';
import { prisma } from '../../db.js';
import { guildConfigService } from '../../services/index.js';
import { embedColors, formatCoins } from '../../utils/embeds.js';
import type { Command } from '../types.js';

const LEADERBOARD_SIZE = 10;

const MEDALS = ['🥇', '🥈', '🥉'] as const;

type LeaderboardType = 'richest' | 'level' | 'wins' | 'streak' | 'jobs';

interface LeaderboardRow {
  discordId: string;
  value: number;
}

const TYPE_META: Record<
  LeaderboardType,
  { title: string; valueLabel: string; format: (value: number) => string }
> = {
  richest: {
    title: 'Richest Players',
    valueLabel: 'Net Worth',
    format: (value) => formatCoins(value),
  },
  level: {
    title: 'Highest Levels',
    valueLabel: 'Level',
    format: (value) => `Level ${value}`,
  },
  wins: {
    title: 'Most Wins',
    valueLabel: 'Wins',
    format: (value) => `${value.toLocaleString()} wins`,
  },
  streak: {
    title: 'Longest Daily Streaks',
    valueLabel: 'Streak',
    format: (value) => `${value} day${value === 1 ? '' : 's'}`,
  },
  jobs: {
    title: 'Most Jobs Completed',
    valueLabel: 'Shifts',
    format: (value) => `${value.toLocaleString()} shifts`,
  },
};

async function resolveDisplayName(
  client: Client,
  guildId: string,
  discordId: string,
): Promise<string> {
  try {
    const guild = client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId));
    const member = await guild.members.fetch(discordId).catch(() => null);
    if (member) return member.displayName;

    const user = await client.users.fetch(discordId);
    return user.displayName;
  } catch {
    return `Unknown (${discordId})`;
  }
}

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

async function fetchLeaderboard(
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

function formatLeaderboardLines(
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

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View server or global leaderboards')
    .addStringOption((option) =>
      option
        .setName('type')
        .setDescription('Leaderboard category')
        .setRequired(true)
        .addChoices(
          { name: 'Richest', value: 'richest' },
          { name: 'Level', value: 'level' },
          { name: 'Wins', value: 'wins' },
          { name: 'Daily Streak', value: 'streak' },
          { name: 'Jobs', value: 'jobs' },
        ),
    ),
  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    const type = interaction.options.getString('type', true) as LeaderboardType;
    const config = await guildConfigService.getConfig(interaction.guildId);
    const globalScope = config.globalLeaderboard;
    const meta = TYPE_META[type];

    const rows = await fetchLeaderboard(type, interaction.guildId, globalScope);
    const names = new Map<string, string>();
    await Promise.all(
      rows.map(async (row) => {
        names.set(
          row.discordId,
          await resolveDisplayName(interaction.client, interaction.guildId!, row.discordId),
        );
      }),
    );

    const description = formatLeaderboardLines(rows, names, meta.format);
    const scopeLabel = globalScope ? 'Global' : interaction.guild?.name ?? 'This server';

    const embed = new EmbedBuilder()
      .setColor(embedColors.info)
      .setTitle(`${meta.title} — Top ${LEADERBOARD_SIZE}`)
      .setDescription(description)
      .setFooter({
        text: `${scopeLabel} • ${meta.valueLabel} • Use /admin config to toggle global leaderboards`,
      });

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
