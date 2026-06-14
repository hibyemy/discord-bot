import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { ValidationError } from '../../contracts/errors.js';
import { getGame } from '../../config/games.js';
import { guildConfigService, progressionService } from '../../services/index.js';
import {
  playRoulette,
  type RouletteBetType,
  type RouletteColor,
} from '../../services/games/roulette.game.js';
import { embedColors, formatCoins } from '../../utils/embeds.js';
import type { Command } from '../types.js';
import { userKey } from '../economy/helpers.js';

const gameDef = getGame('roulette')!;

const betTypeLabel: Record<RouletteBetType, string> = {
  red: 'Red',
  black: 'Black',
  number: 'Number',
};

const colorLabel: Record<RouletteColor, string> = {
  red: 'Red',
  black: 'Black',
  green: 'Green (0)',
};

function formatBetChoice(betType: RouletteBetType, number?: number): string {
  if (betType === 'number' && number !== undefined) {
    return `Number **${number}**`;
  }
  return betTypeLabel[betType];
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('roulette')
    .setDescription('Bet on red, black, or a number (European wheel)')
    .addIntegerOption((opt) =>
      opt.setName('bet').setDescription('Amount to wager').setRequired(true).setMinValue(1),
    )
    .addStringOption((opt) =>
      opt
        .setName('choice')
        .setDescription('Red, black, or a specific number')
        .setRequired(true)
        .addChoices(
          { name: 'Red', value: 'red' },
          { name: 'Black', value: 'black' },
          { name: 'Number', value: 'number' },
        ),
    )
    .addIntegerOption((opt) =>
      opt
        .setName('number')
        .setDescription('0–36 (required when betting on a number)')
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(36),
    ),
  async execute(interaction) {
    const key = userKey(interaction);
    const bet = interaction.options.getInteger('bet', true);
    const choice = interaction.options.getString('choice', true) as RouletteBetType;
    const number = interaction.options.getInteger('number') ?? undefined;

    if (choice === 'number' && number === undefined) {
      throw new ValidationError('Provide a **number** from 0 to 36 when betting on a number.');
    }

    const level = await progressionService.getLevel(key);
    const unlocks = progressionService.getUnlocks(level);
    if (!unlocks.games.includes('roulette')) {
      throw new ValidationError(
        `Roulette unlocks at level **${gameDef.unlockLevel}** (you are level **${level}**).`,
      );
    }

    if (await guildConfigService.isGameDisabled(key.guildId, 'roulette')) {
      throw new ValidationError('Roulette is disabled in this server.');
    }

    const result = await playRoulette(key, bet, choice, number);
    const details = result.details!;

    const embed = new EmbedBuilder()
      .setColor(result.won ? embedColors.success : embedColors.error)
      .setTitle(result.won ? 'Roulette — You won!' : 'Roulette — You lost')
      .addFields(
        {
          name: 'Your bet',
          value: formatBetChoice(details.betType, details.betNumber),
          inline: true,
        },
        {
          name: 'Result',
          value: `**${details.result}** (${colorLabel[details.color]})`,
          inline: true,
        },
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
