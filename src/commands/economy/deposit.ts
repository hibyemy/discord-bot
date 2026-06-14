import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { emitDepositEvents } from '../../events/hooks.js';
import { economyService } from '../../services/index.js';
import { embedColors, formatCoins } from '../../utils/embeds.js';
import type { Command } from '../types.js';
import { userKey } from './helpers.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('deposit')
    .setDescription('Move coins from wallet to bank')
    .addIntegerOption((option) =>
      option
        .setName('amount')
        .setDescription('Amount to deposit')
        .setRequired(true)
        .setMinValue(1),
    ),
  async execute(interaction) {
    const amount = interaction.options.getInteger('amount', true);
    const key = userKey(interaction);
    const user = await economyService.deposit(key, amount);
    await emitDepositEvents(key, amount);

    const embed = new EmbedBuilder()
      .setColor(embedColors.economy)
      .setTitle('Deposit Complete')
      .setDescription(`Deposited **${formatCoins(amount)}** to your bank.`)
      .addFields(
        { name: 'Wallet', value: formatCoins(user.wallet), inline: true },
        { name: 'Bank', value: formatCoins(user.bank), inline: true },
      );

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
