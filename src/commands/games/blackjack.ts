import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { DisabledError, LockedError } from '../../contracts/errors.js';
import { getGame } from '../../config/games.js';
import { guildConfigService, progressionService } from '../../services/index.js';
import {
  buildBlackjackButtons,
  BLACKJACK_ACTIVE_FOOTER,
  formatHand,
  handValue,
  outcomeLabel,
  serializeButtonRows,
  startBlackjack,
  type BlackjackDetails,
  type BlackjackState,
} from '../../services/games/blackjack.game.js';
import { embedColors, formatCoins } from '../../utils/embeds.js';
import type { Command } from '../types.js';
import { userKey } from '../economy/helpers.js';

const GAME_ID = 'blackjack' as const;

function activeHandEmbed(
  state: BlackjackState,
  bet: number,
  footer?: string,
): EmbedBuilder {
  const dealerShown = state.dealerRevealed;
  const dealerValue = dealerShown ? handValue(state.dealerHand) : rankOnly(state.dealerHand);

  return new EmbedBuilder()
    .setColor(embedColors.game)
    .setTitle('Blackjack')
    .addFields(
      {
        name: 'Your hand',
        value: `${formatHand(state.playerHand)} (${handValue(state.playerHand)})`,
        inline: false,
      },
      {
        name: 'Dealer',
        value: `${formatHand(state.dealerHand, !dealerShown)} (${dealerShown ? dealerValue : '?'})`,
        inline: false,
      },
      {
        name: 'Bet',
        value: formatCoins(bet),
        inline: true,
      },
    )
    .setFooter(
      footer
        ? { text: footer }
        : { text: BLACKJACK_ACTIVE_FOOTER },
    );
}

function rankOnly(dealerHand: BlackjackState['dealerHand']): string {
  const up = dealerHand[0];
  if (!up) return '?';
  if (up.rank === 'A') return '11 or 1';
  if (up.rank === 'K' || up.rank === 'Q' || up.rank === 'J') return '10';
  return up.rank;
}

function resultEmbed(
  state: BlackjackState,
  bet: number,
  details: BlackjackDetails,
  payout: number,
  profit: number,
  xpAwarded: number,
): EmbedBuilder {
  const color =
    details.outcome === 'blackjack' || details.outcome === 'win' || details.outcome === 'dealer_bust'
      ? embedColors.success
      : details.outcome === 'push'
        ? embedColors.warning
        : embedColors.error;

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(outcomeLabel(details.outcome))
    .addFields(
      {
        name: 'Your hand',
        value: `${formatHand(state.playerHand)} (${details.playerValue})`,
        inline: false,
      },
      {
        name: 'Dealer',
        value: `${formatHand(state.dealerHand)} (${details.dealerValue})`,
        inline: false,
      },
      {
        name: 'Bet',
        value: formatCoins(bet),
        inline: true,
      },
      {
        name: 'Payout',
        value: formatCoins(payout),
        inline: true,
      },
      {
        name: 'Profit',
        value: `${profit >= 0 ? '+' : ''}${formatCoins(profit)}`,
        inline: true,
      },
      {
        name: 'XP',
        value: `+${xpAwarded}`,
        inline: true,
      },
    );
}

async function assertCanPlay(guildId: string, key: ReturnType<typeof userKey>): Promise<void> {
  const game = getGame(GAME_ID);
  const unlockLevel = game?.unlockLevel ?? 15;

  const level = await progressionService.getLevel(key);
  const unlocks = progressionService.getUnlocks(level);
  if (!unlocks.games.includes(GAME_ID)) {
    throw new LockedError('Blackjack', unlockLevel, level);
  }

  if (await guildConfigService.isGameDisabled(guildId, GAME_ID)) {
    throw new DisabledError('Blackjack', 'disabled by server admin');
  }
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('blackjack')
    .setDescription('Play blackjack — hit, stand, or double (dealer stands on 17)')
    .addIntegerOption((option) =>
      option.setName('bet').setDescription('Wager amount').setRequired(true).setMinValue(1),
    ),
  async execute(interaction) {
    const key = userKey(interaction);
    const bet = interaction.options.getInteger('bet', true);
    await assertCanPlay(key.guildId, key);

    const { session, state, immediate } = await startBlackjack(key, bet);

    if (immediate?.details) {
      const embed = resultEmbed(
        state,
        immediate.bet,
        immediate.details,
        immediate.payout,
        immediate.profit,
        immediate.xpAwarded,
      );
      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (!session) {
      throw new Error('Blackjack session missing after deal.');
    }

    const canDouble = state.playerHand.length === 2 && !state.doubled;
    const embed = activeHandEmbed(state, session.bet);
    const components = serializeButtonRows(buildBlackjackButtons(session.id, canDouble));

    await interaction.reply({ embeds: [embed], components });
  },
};

export default command;
