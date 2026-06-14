import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { economyService } from '../../services/index.js';
import { embedColors, formatCoins } from '../../utils/embeds.js';
import type { Command } from '../types.js';
import { userKey } from './helpers.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('withdraw')
    .setDescription('Move coins from bank to wallet')
    .addIntegerOption((option) =>
      option
        .setName('amount')
        .setDescription('Amount to withdraw')
        .setRequired(true)
        .setMinValue(1),
    ),
  async execute(interaction) {
    const amount = interaction.options.getInteger('amount', true);
    const key = userKey(interaction);
    const user = await economyService.withdraw(key, amount);

    const embed = new EmbedBuilder()
      .setColor(embedColors.economy)
      .setTitle('Withdrawal Complete')
      .setDescription(`Withdrew **${formatCoins(amount)}** to your wallet.`)
      .addFields(
        { name: 'Wallet', value: formatCoins(user.wallet), inline: true },
        { name: 'Bank', value: formatCoins(user.bank), inline: true },
      );

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
