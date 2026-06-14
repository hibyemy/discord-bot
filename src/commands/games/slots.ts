import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { ValidationError } from '../../contracts/errors.js';
import { getGame } from '../../config/games.js';
import { guildConfigService, progressionService } from '../../services/index.js';
import {
  formatPayoutTable,
  formatSlotsMachine,
  playSlots,
  type SlotsWinType,
} from '../../services/games/slots.game.js';
import { embedColors, formatCoins } from '../../utils/embeds.js';
import type { Command } from '../types.js';
import { userKey } from '../economy/helpers.js';

const gameDef = getGame('slots')!;

const winTypeLabel: Record<SlotsWinType, string> = {
  triple: 'Triple match',
  pair: 'Cherry pair',
  none: 'No match',
};

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('slots')
    .setDescription('Spin the 3-reel slot machine')
    .addIntegerOption((opt) =>
      opt.setName('bet').setDescription('Amount to wager').setRequired(true).setMinValue(1),
    ),
  async execute(interaction) {
    const key = userKey(interaction);
    const bet = interaction.options.getInteger('bet', true);

    const level = await progressionService.getLevel(key);
    const unlocks = progressionService.getUnlocks(level);
    if (!unlocks.games.includes('slots')) {
      throw new ValidationError(
        `Slots unlocks at level **${gameDef.unlockLevel}** (you are level **${level}**).`,
      );
    }

    if (await guildConfigService.isGameDisabled(key.guildId, 'slots')) {
      throw new ValidationError('Slots is disabled in this server.');
    }

    const result = await playSlots(key, bet);
    const details = result.details!;

    const outcomeText =
      details.winType === 'triple'
        ? `${details.reels[0]!.emoji} triple — **${details.multiplier}x**`
        : details.winType === 'pair'
          ? '🍒 cherry pair'
          : 'No winning line';

    const embed = new EmbedBuilder()
      .setColor(result.won ? embedColors.success : embedColors.game)
      .setTitle(result.won ? 'Slots — Jackpot!' : 'Slots — Spin complete')
      .setDescription(formatSlotsMachine(details.reels))
      .addFields(
        { name: 'Result', value: outcomeText, inline: false },
        { name: 'Line', value: winTypeLabel[details.winType], inline: true },
        { name: 'Bet', value: formatCoins(result.bet), inline: true },
        {
          name: 'Payout',
          value: result.payout > 0 ? formatCoins(result.payout) : '—',
          inline: true,
        },
        {
          name: 'Profit',
          value: `${result.profit >= 0 ? '+' : ''}${formatCoins(result.profit)}`,
          inline: true,
        },
        { name: 'XP', value: `+${result.xpAwarded}`, inline: true },
        { name: 'Payout table', value: formatPayoutTable(), inline: false },
      )
      .setFooter({ text: `Wallet: ${formatCoins(Number(result.user.wallet))}` });

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
