import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { ValidationError } from '../../contracts/errors.js';
import { getGame } from '../../config/games.js';
import { guildConfigService, progressionService } from '../../services/index.js';
import { playCoinflip } from '../../services/games/coinflip.game.js';
import { embedColors, formatCoins } from '../../utils/embeds.js';
import type { Command } from '../types.js';
import { userKey } from '../economy/helpers.js';

const gameDef = getGame('coinflip')!;

const choiceLabel: Record<'heads' | 'tails', string> = {
  heads: 'Heads',
  tails: 'Tails',
};

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('Bet on heads or tails')
    .addIntegerOption((opt) =>
      opt.setName('bet').setDescription('Amount to wager').setRequired(true).setMinValue(1),
    )
    .addStringOption((opt) =>
      opt
        .setName('choice')
        .setDescription('Heads or tails')
        .setRequired(true)
        .addChoices(
          { name: 'Heads', value: 'heads' },
          { name: 'Tails', value: 'tails' },
        ),
    ),
  async execute(interaction) {
    const key = userKey(interaction);
    const bet = interaction.options.getInteger('bet', true);
    const choice = interaction.options.getString('choice', true);

    const level = await progressionService.getLevel(key);
    const unlocks = progressionService.getUnlocks(level);
    if (!unlocks.games.includes('coinflip')) {
      throw new ValidationError(
        `Coinflip unlocks at level **${gameDef.unlockLevel}** (you are level **${level}**).`,
      );
    }

    if (await guildConfigService.isGameDisabled(key.guildId, 'coinflip')) {
      throw new ValidationError('Coinflip is disabled in this server.');
    }

    const result = await playCoinflip(key, bet, choice);
    const details = result.details!;

    const embed = new EmbedBuilder()
      .setColor(result.won ? embedColors.success : embedColors.error)
      .setTitle(result.won ? 'Coinflip — You won!' : 'Coinflip — You lost')
      .addFields(
        { name: 'Your pick', value: choiceLabel[details.choice], inline: true },
        { name: 'Result', value: choiceLabel[details.flip], inline: true },
        { name: 'Bet', value: formatCoins(result.bet), inline: true },
        {
          name: 'Payout',
          value: result.won ? formatCoins(result.payout) : '—',
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
