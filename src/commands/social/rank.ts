import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import {
  formatRankTier,
  getRankTierForLevel,
} from '../../config/ranks.js';
import { economyService, guildConfigService } from '../../services/index.js';
import { embedColors, progressBar } from '../../utils/embeds.js';
import { formatRankingLine, getUserRankings } from '../../utils/rankings.js';
import type { Command } from '../types.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('View your title and leaderboard standings')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Member whose rank to view')
        .setRequired(false),
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

    const target = interaction.options.getUser('user') ?? interaction.user;
    const key = { discordId: target.id, guildId: interaction.guildId };
    const [user, config] = await Promise.all([
      economyService.getOrCreateUser(key),
      guildConfigService.getConfig(interaction.guildId),
    ]);

    const tierProgress = getRankTierForLevel(user.level);
    const rankings = await getUserRankings(
      interaction.guildId,
      target.id,
      config.globalLeaderboard,
    );

    const standings = rankings.map(formatRankingLine).join('\n');
    const scopeLabel = config.globalLeaderboard
      ? 'Global standings'
      : `${interaction.guild?.name ?? 'Server'} standings`;

    let nextTierText = 'Maximum rank reached';
    if (tierProgress.next) {
      nextTierText = `${formatRankTier(tierProgress.next)} at level **${tierProgress.next.minLevel}** (${tierProgress.levelsToNext} level${tierProgress.levelsToNext === 1 ? '' : 's'} to go)`;
    }

    const embed = new EmbedBuilder()
      .setColor(embedColors.info)
      .setTitle(`${target.displayName}'s Rank`)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        {
          name: 'Title',
          value: [
            `**${formatRankTier(tierProgress.current)}**`,
            `Level **${user.level}**`,
            tierProgress.next
              ? `Progress: ${progressBar(tierProgress.progressPercent, 100)} ${tierProgress.progressPercent}%`
              : 'Progress: **MAX**',
            `Next: ${nextTierText}`,
          ].join('\n'),
          inline: false,
        },
        {
          name: scopeLabel,
          value: standings,
          inline: false,
        },
      )
      .setFooter({ text: 'Use /leaderboard to view top 10 in each category' });

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
