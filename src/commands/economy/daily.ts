import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { emitDailyClaimEvents } from '../../events/hooks.js';
import { economyService } from '../../services/index.js';
import { embedColors, formatCoins } from '../../utils/embeds.js';
import type { Command } from '../types.js';
import { userKey } from './helpers.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily coin reward'),
  async execute(interaction) {
    const key = userKey(interaction);
    const result = await economyService.applyDaily(key);
    await emitDailyClaimEvents(key, result.streak);

    const multiplierNote =
      result.multiplier > 1
        ? ` (${result.multiplier}x bonus active)`
        : '';

    const embed = new EmbedBuilder()
      .setColor(embedColors.success)
      .setTitle('Daily Reward Claimed')
      .setDescription(
        [
          `You received **${formatCoins(result.amount)}**${multiplierNote}.`,
          `Streak: **${result.streak}** day${result.streak === 1 ? '' : 's'}`,
          `Wallet: **${formatCoins(result.user.wallet)}**`,
        ].join('\n'),
      );

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
