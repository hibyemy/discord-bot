import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { ValidationError } from '../../contracts/errors.js';
import { emitPayEvents } from '../../events/hooks.js';
import { economyService } from '../../services/index.js';
import { embedColors, formatCoins } from '../../utils/embeds.js';
import type { Command } from '../types.js';
import { requireGuild, userKey } from './helpers.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('pay')
    .setDescription('Send coins to another member')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Member to pay')
        .setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName('amount')
        .setDescription('Amount to send')
        .setRequired(true)
        .setMinValue(1),
    ),
  async execute(interaction) {
    const recipient = interaction.options.getUser('user', true);
    const amount = interaction.options.getInteger('amount', true);
    const guildId = requireGuild(interaction);

    if (recipient.bot) {
      throw new ValidationError('You cannot pay bots.');
    }

    const from = userKey(interaction);
    const to = { discordId: recipient.id, guildId };
    const result = await economyService.transferBetween(from, to, amount, 'transfer_out');
    await emitPayEvents(from, result.sent);

    const embed = new EmbedBuilder()
      .setColor(embedColors.success)
      .setTitle('Payment Sent')
      .setDescription(
        [
          `Sent **${formatCoins(result.sent)}** to ${recipient}.`,
          `They received **${formatCoins(result.received)}**.`,
          result.tax > 0
            ? `Transfer tax: **${formatCoins(result.tax)}**.`
            : null,
        ]
          .filter(Boolean)
          .join('\n'),
      );

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
