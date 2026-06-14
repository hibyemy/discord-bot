import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types.js';
import { achievementService, progressionService } from '../../services/index.js';
import { prisma } from '../../db.js';
import { profileEmbed } from '../../utils/embeds.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View your economy profile')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Member whose profile to view')
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

    const [xp, badges] = await Promise.all([
      progressionService.xpProgress(key),
      achievementService.getProfileBadges(key),
    ]);
    const dbUser = await prisma.user.findUniqueOrThrow({
      where: {
        discordId_guildId: { discordId: key.discordId, guildId: key.guildId },
      },
    });

    const embed = profileEmbed(target, {
      level: dbUser.level,
      xp: xp.current,
      xpRequired: xp.required,
      wallet: dbUser.wallet,
      bank: dbUser.bank,
      activeJob: dbUser.activeJob,
      dailyStreak: dbUser.dailyStreak,
      badges: badges.length > 0 ? badges : ['No badges yet'],
    });

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
