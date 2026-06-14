import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { Transaction } from '@prisma/client';
import { economyService } from '../../services/index.js';
import { embedColors, formatCoins } from '../../utils/embeds.js';
import type { Command } from '../types.js';
import { userKey } from './helpers.js';

function formatSource(source: string): string {
  return source.replace(/_/g, ' ');
}

function formatTransaction(tx: Transaction): string {
  const sign = tx.amount >= 0 ? '+' : '';
  const when = `<t:${Math.floor(tx.createdAt.getTime() / 1000)}:R>`;
  return `${sign}${tx.amount.toLocaleString()} · ${formatSource(tx.source)} · ${when}`;
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('transactions')
    .setDescription('View your recent transaction history')
    .addIntegerOption((option) =>
      option
        .setName('limit')
        .setDescription('Number of entries to show (1–50)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(50),
    ),
  async execute(interaction) {
    const limit = interaction.options.getInteger('limit') ?? 10;
    const key = userKey(interaction);
    const transactions = await economyService.getTransactions(key, limit);

    const description =
      transactions.length === 0
        ? 'No transactions yet.'
        : transactions.map(formatTransaction).join('\n');

    const embed = new EmbedBuilder()
      .setColor(embedColors.info)
      .setTitle('Recent Transactions')
      .setDescription(description)
      .setFooter({
        text: `Showing ${transactions.length} entr${transactions.length === 1 ? 'y' : 'ies'}`,
      });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

export default command;
