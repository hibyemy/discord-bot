import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { economyConfig } from '../../config/economy.js';
import { economyService } from '../../services/index.js';
import { embedColors, formatCoins } from '../../utils/embeds.js';
import type { Command } from '../types.js';
import { userKey } from './helpers.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('View wallet and bank balance')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Member to check (defaults to you)')
        .setRequired(false),
    ),
  async execute(interaction) {
    const target = interaction.options.getUser('user') ?? interaction.user;
    const key = userKey(interaction, target.id);
    const balance = await economyService.getBalance(key);

    const embed = new EmbedBuilder()
      .setColor(embedColors.economy)
      .setTitle(`${target.displayName}'s Balance`)
      .addFields(
        { name: 'Wallet', value: formatCoins(balance.wallet), inline: true },
        { name: 'Bank', value: formatCoins(balance.bank), inline: true },
        {
          name: 'Net Worth',
          value: formatCoins(balance.netWorth),
          inline: true,
        },
      )
      .setFooter({ text: economyConfig.currencyName });

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
