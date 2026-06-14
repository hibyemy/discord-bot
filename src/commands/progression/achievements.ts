import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { achievementService } from '../../services/index.js';
import { embedColors, formatCoins } from '../../utils/embeds.js';
import type { Command } from '../types.js';
import type { AchievementCategory } from '../../config/achievements.js';

const CATEGORY_ORDER: AchievementCategory[] = [
  'economy',
  'jobs',
  'games',
  'social',
  'progression',
];

const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  economy: 'Economy',
  jobs: 'Jobs',
  games: 'Games',
  social: 'Social',
  progression: 'Progression',
};

function categoryEmoji(category: AchievementCategory): string {
  switch (category) {
    case 'economy':
      return '💰';
    case 'jobs':
      return '💼';
    case 'games':
      return '🎰';
    case 'social':
      return '🤝';
    case 'progression':
      return '⭐';
    default:
      return '🏅';
  }
}

function formatAchievementLine(
  earned: boolean,
  name: string,
  description: string,
  coinReward: number,
  xpReward: number,
): string {
  const status = earned ? '✅' : '🔒';
  const rewards: string[] = [];
  if (coinReward > 0) rewards.push(formatCoins(coinReward));
  if (xpReward > 0) rewards.push(`${xpReward} XP`);
  const rewardText = rewards.length > 0 ? ` — ${rewards.join(' + ')}` : '';
  return `${status} **${name}** — ${description}${rewardText}`;
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('achievements')
    .setDescription('View earned and locked achievements')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Member whose achievements to view')
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
    const achievements = await achievementService.getAllWithStatus(key);
    const earnedCount = achievements.filter((a) => a.earned).length;

    const embed = new EmbedBuilder()
      .setColor(embedColors.info)
      .setTitle(`${target.displayName}'s Achievements`)
      .setThumbnail(target.displayAvatarURL())
      .setDescription(
        `**${earnedCount}/${achievements.length}** achievements unlocked`,
      );

    for (const category of CATEGORY_ORDER) {
      const inCategory = achievements.filter((a) => a.category === category);
      if (inCategory.length === 0) continue;

      const lines = inCategory.map((a) =>
        formatAchievementLine(
          a.earned,
          a.name,
          a.description,
          a.coinReward,
          a.xpReward,
        ),
      );

      embed.addFields({
        name: `${categoryEmoji(category)} ${CATEGORY_LABELS[category]}`,
        value: lines.join('\n'),
      });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
