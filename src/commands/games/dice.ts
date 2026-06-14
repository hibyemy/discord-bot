import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { ValidationError } from '../../contracts/errors.js';
import { getGame } from '../../config/games.js';
import { guildConfigService, progressionService } from '../../services/index.js';
import { playDice } from '../../services/games/dice.game.js';
import { embedColors, formatCoins } from '../../utils/embeds.js';
import type { Command } from '../types.js';
import { userKey } from '../economy/helpers.js';

const gameDef = getGame('dice')!;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('dice')
    .setDescription('Roll 1–100 against the bot')
    .addIntegerOption((opt) =>
      opt.setName('bet').setDescription('Amount to wager').setRequired(true).setMinValue(1),
    ),
  async execute(interaction) {
    const key = userKey(interaction);
    const bet = interaction.options.getInteger('bet', true);

    const level = await progressionService.getLevel(key);
    const unlocks = progressionService.getUnlocks(level);
    if (!unlocks.games.includes('dice')) {
      throw new ValidationError(
        `Dice unlocks at level **${gameDef.unlockLevel}** (you are level **${level}**).`,
      );
    }

    if (await guildConfigService.isGameDisabled(key.guildId, 'dice')) {
      throw new ValidationError('Dice is disabled in this server.');
    }

    const result = await playDice(key, bet);
    const details = result.details!;

    const title = details.tie
      ? 'Dice — Tie!'
      : result.won
        ? 'Dice — You won!'
        : 'Dice — You lost';

    const embed = new EmbedBuilder()
      .setColor(
        details.tie ? embedColors.warning : result.won ? embedColors.success : embedColors.error,
      )
      .setTitle(title)
      .setDescription(
        details.tie
          ? 'Same roll — your bet is returned.'
          : result.won
            ? 'Your roll beat the bot!'
            : 'The bot rolled higher.',
      )
      .addFields(
        { name: 'Your roll', value: String(details.playerRoll), inline: true },
        { name: 'Bot roll', value: String(details.botRoll), inline: true },
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
      )
      .setFooter({ text: `Wallet: ${formatCoins(Number(result.user.wallet))}` });

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
