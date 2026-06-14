import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { Client } from 'discord.js';
import { guildConfigService } from '../../services/index.js';
import { embedColors } from '../../utils/embeds.js';
import {
  fetchLeaderboard,
  formatLeaderboardLines,
  LEADERBOARD_SIZE,
  TYPE_META,
  type LeaderboardType,
} from '../../utils/rankings.js';
import type { Command } from '../types.js';

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
        text: `${scopeLabel} • ${meta.valueLabel} • Use /rank for your standings`,
      });

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
