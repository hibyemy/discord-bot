import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ButtonInteraction,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import { getGame, type GameId } from '../../config/games.js';
import { GamblebotError, ValidationError } from '../../contracts/errors.js';
import type { UserKey } from '../../contracts/services.js';
import { playCoinflip, type CoinflipChoice } from '../../services/games/coinflip.game.js';
import { playDice } from '../../services/games/dice.game.js';
import { playRoulette, type RouletteBetType } from '../../services/games/roulette.game.js';
import {
  formatPayoutTable,
  formatSlotsMachine,
  playSlots,
  type SlotsWinType,
} from '../../services/games/slots.game.js';
import type { GameFlowResult } from '../../services/games/base.game.js';
import type { CoinflipDetails } from '../../services/games/coinflip.game.js';
import type { RouletteDetails } from '../../services/games/roulette.game.js';
import { guildConfigService, progressionService } from '../../services/index.js';
import { embedColors, formatCoins } from '../../utils/embeds.js';

const PREFIX = 'ogreplay:';

const ONESHOT_GAMES = ['coinflip', 'dice', 'slots', 'roulette'] as const;
type OneshotGameId = (typeof ONESHOT_GAMES)[number];

const choiceLabel: Record<CoinflipChoice, string> = {
  heads: 'Heads',
  tails: 'Tails',
};

const betTypeLabel: Record<RouletteBetType, string> = {
  red: 'Red',
  black: 'Black',
  number: 'Number',
};

const colorLabel = {
  red: 'Red',
  black: 'Black',
  green: 'Green (0)',
} as const;

const winTypeLabel: Record<SlotsWinType, string> = {
  triple: 'Triple match',
  pair: 'Cherry pair',
  none: 'No match',
};

const replayLabels: Record<OneshotGameId, string> = {
  coinflip: 'Flip again',
  dice: 'Roll again',
  slots: 'Spin again',
  roulette: 'Spin again',
};

export interface ReplayParams {
  game: OneshotGameId;
  userId: string;
  bet: number;
  coinflipChoice?: CoinflipChoice;
  rouletteChoice?: RouletteBetType;
  rouletteNumber?: number;
}

function isOneshotGame(value: string): value is OneshotGameId {
  return (ONESHOT_GAMES as readonly string[]).includes(value);
}

export function buildReplayCustomId(params: ReplayParams): string {
  const parts = [PREFIX + params.game, params.userId, String(params.bet)];
  if (params.game === 'coinflip' && params.coinflipChoice) {
    parts.push(params.coinflipChoice === 'heads' ? 'h' : 't');
  } else if (params.game === 'roulette' && params.rouletteChoice) {
    if (params.rouletteChoice === 'number') {
      parts.push('n', String(params.rouletteNumber ?? 0));
    } else {
      parts.push(params.rouletteChoice === 'red' ? 'r' : 'b');
    }
  }
  return parts.join(':');
}

export function parseReplayCustomId(customId: string): ReplayParams | null {
  if (!customId.startsWith(PREFIX)) return null;

  const body = customId.slice(PREFIX.length);
  const parts = body.split(':');
  const game = parts[0];
  if (!game || !isOneshotGame(game)) return null;

  const userId = parts[1];
  const bet = Number(parts[2]);
  if (!userId || !Number.isInteger(bet) || bet < 1) return null;

  if (game === 'coinflip') {
    const code = parts[3];
    if (code !== 'h' && code !== 't') return null;
    return {
      game,
      userId,
      bet,
      coinflipChoice: code === 'h' ? 'heads' : 'tails',
    };
  }

  if (game === 'roulette') {
    const code = parts[3];
    if (code === 'r') return { game, userId, bet, rouletteChoice: 'red' };
    if (code === 'b') return { game, userId, bet, rouletteChoice: 'black' };
    if (code === 'n') {
      const rouletteNumber = Number(parts[4]);
      if (!Number.isInteger(rouletteNumber) || rouletteNumber < 0 || rouletteNumber > 36) {
        return null;
      }
      return { game, userId, bet, rouletteChoice: 'number', rouletteNumber };
    }
    return null;
  }

  return { game, userId, bet };
}

export function isOneshotReplayButton(customId: string): boolean {
  return parseReplayCustomId(customId) !== null;
}

export function buildReplayRow(params: ReplayParams): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildReplayCustomId(params))
      .setLabel(replayLabels[params.game])
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🔁'),
  );
}

function formatBetChoice(betType: RouletteBetType, number?: number): string {
  if (betType === 'number' && number !== undefined) {
    return `Number **${number}**`;
  }
  return betTypeLabel[betType];
}

export function buildCoinflipEmbed(result: GameFlowResult<CoinflipDetails>): EmbedBuilder {
  const details = result.details!;
  return new EmbedBuilder()
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
}

export function buildDiceEmbed(
  result: GameFlowResult<{ playerRoll: number; botRoll: number; tie: boolean }>,
): EmbedBuilder {
  const details = result.details!;
  const title = details.tie
    ? 'Dice — Tie!'
    : result.won
      ? 'Dice — You won!'
      : 'Dice — You lost';

  return new EmbedBuilder()
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
}

export function buildSlotsEmbed(
  result: GameFlowResult<{
    reels: Array<{ emoji: string }>;
    winType: SlotsWinType;
    multiplier: number;
  }>,
): EmbedBuilder {
  const details = result.details!;
  const outcomeText =
    details.winType === 'triple'
      ? `${details.reels[0]!.emoji} triple — **${details.multiplier}x**`
      : details.winType === 'pair'
        ? '🍒 cherry pair'
        : 'No winning line';

  return new EmbedBuilder()
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
}

export function buildRouletteEmbed(result: GameFlowResult<RouletteDetails>): EmbedBuilder {
  const details = result.details!;
  return new EmbedBuilder()
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
}

async function assertGameAllowed(key: UserKey, game: OneshotGameId): Promise<void> {
  const gameDef = getGame(game as GameId);
  if (!gameDef) {
    throw new ValidationError('Unknown game.');
  }

  const level = await progressionService.getLevel(key);
  const unlocks = progressionService.getUnlocks(level);
  if (!unlocks.games.includes(game as GameId)) {
    throw new ValidationError(
      `${gameDef.name} unlocks at level **${gameDef.unlockLevel}** (you are level **${level}**).`,
    );
  }

  if (await guildConfigService.isGameDisabled(key.guildId, game as GameId)) {
    throw new ValidationError(`${gameDef.name} is disabled in this server.`);
  }
}

function replayParamsFromResult(
  game: OneshotGameId,
  userId: string,
  bet: number,
  result: GameFlowResult<unknown>,
): ReplayParams {
  const base = { game, userId, bet };

  if (game === 'coinflip') {
    const details = result.details as CoinflipDetails;
    return { ...base, coinflipChoice: details.choice };
  }

  if (game === 'roulette') {
    const details = result.details as RouletteDetails;
    return {
      ...base,
      rouletteChoice: details.betType,
      rouletteNumber: details.betNumber,
    };
  }

  return base;
}

async function runOneshotGame(
  key: UserKey,
  params: ReplayParams,
): Promise<{ embed: EmbedBuilder; row: ActionRowBuilder<ButtonBuilder> }> {
  await assertGameAllowed(key, params.game);

  let result: GameFlowResult<unknown>;

  switch (params.game) {
    case 'coinflip': {
      if (!params.coinflipChoice) {
        throw new ValidationError('Missing coinflip choice.');
      }
      result = await playCoinflip(key, params.bet, params.coinflipChoice);
      return {
        embed: buildCoinflipEmbed(result as GameFlowResult<CoinflipDetails>),
        row: buildReplayRow(replayParamsFromResult('coinflip', params.userId, params.bet, result)),
      };
    }
    case 'dice': {
      result = await playDice(key, params.bet);
      return {
        embed: buildDiceEmbed(
          result as GameFlowResult<{ playerRoll: number; botRoll: number; tie: boolean }>,
        ),
        row: buildReplayRow(replayParamsFromResult('dice', params.userId, params.bet, result)),
      };
    }
    case 'slots': {
      result = await playSlots(key, params.bet);
      return {
        embed: buildSlotsEmbed(
          result as GameFlowResult<{
            reels: Array<{ emoji: string }>;
            winType: SlotsWinType;
            multiplier: number;
          }>,
        ),
        row: buildReplayRow(replayParamsFromResult('slots', params.userId, params.bet, result)),
      };
    }
    case 'roulette': {
      if (!params.rouletteChoice) {
        throw new ValidationError('Missing roulette choice.');
      }
      result = await playRoulette(
        key,
        params.bet,
        params.rouletteChoice,
        params.rouletteNumber,
      );
      return {
        embed: buildRouletteEmbed(result as GameFlowResult<RouletteDetails>),
        row: buildReplayRow(replayParamsFromResult('roulette', params.userId, params.bet, result)),
      };
    }
  }
}

export function buildOneshotReply(
  game: OneshotGameId,
  userId: string,
  bet: number,
  result: GameFlowResult<unknown>,
  extra?: Omit<ReplayParams, 'game' | 'userId' | 'bet'>,
): { embed: EmbedBuilder; components: ActionRowBuilder<MessageActionRowComponentBuilder>[] } {
  let embed: EmbedBuilder;

  switch (game) {
    case 'coinflip':
      embed = buildCoinflipEmbed(result as GameFlowResult<CoinflipDetails>);
      break;
    case 'dice':
      embed = buildDiceEmbed(
        result as GameFlowResult<{ playerRoll: number; botRoll: number; tie: boolean }>,
      );
      break;
    case 'slots':
      embed = buildSlotsEmbed(
        result as GameFlowResult<{
          reels: Array<{ emoji: string }>;
          winType: SlotsWinType;
          multiplier: number;
        }>,
      );
      break;
    case 'roulette':
      embed = buildRouletteEmbed(result as GameFlowResult<RouletteDetails>);
      break;
  }

  const replayParams: ReplayParams = {
    game,
    userId,
    bet,
    ...extra,
  };

  if (game === 'coinflip') {
    replayParams.coinflipChoice = (result.details as CoinflipDetails).choice;
  } else if (game === 'roulette') {
    const details = result.details as RouletteDetails;
    replayParams.rouletteChoice = details.betType;
    replayParams.rouletteNumber = details.betNumber;
  }

  return {
    embed,
    components: [buildReplayRow(replayParams)],
  };
}

export async function handleOneshotReplayButton(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: 'This button can only be used in a server.',
      ephemeral: true,
    });
    return;
  }

  const params = parseReplayCustomId(interaction.customId);
  if (!params) {
    await interaction.reply({
      content: 'This play-again button is no longer valid.',
      ephemeral: true,
    });
    return;
  }

  if (interaction.user.id !== params.userId) {
    await interaction.reply({
      content: 'Only the player who started this game can use this button.',
      ephemeral: true,
    });
    return;
  }

  const key: UserKey = { discordId: interaction.user.id, guildId: interaction.guildId };

  try {
    await interaction.deferUpdate();
    const { embed, row } = await runOneshotGame(key, params);
    await interaction.editReply({ embeds: [embed], components: [row] });
  } catch (err) {
    const message =
      err instanceof GamblebotError
        ? err.message
        : 'Could not run the game again. Try the slash command.';

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(embedColors.error)
          .setTitle('Play again failed')
          .setDescription(message),
      ],
      components: [],
    });
  }
}
