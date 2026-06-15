import {
  EmbedBuilder,
  type ButtonInteraction,
} from 'discord.js';
import { GamblebotError } from '../../contracts/errors.js';
import type { UserKey } from '../../contracts/services.js';
import {
  buildBlackjackButtons,
  BLACKJACK_MENU_FOOTER,
  doubleBlackjack,
  forfeitBlackjack,
  hitBlackjack,
  outcomeLabel,
  parseBlackjackCustomId,
  serializeButtonRows,
  standBlackjack,
  type BlackjackDetails,
  type BlackjackState,
  formatHand,
  handValue,
} from '../../services/games/blackjack.game.js';
import { achievementService } from '../../services/index.js';
import { announceBigWin } from '../../utils/announce.js';
import { embedColors, errorEmbed, formatCoins } from '../../utils/embeds.js';

async function afterBlackjackResult(
  interaction: ButtonInteraction,
  key: UserKey,
  result: {
    bet: number;
    payout: number;
    profit: number;
    details?: BlackjackDetails;
  },
): Promise<void> {
  if (result.details?.outcome === 'blackjack') {
    await achievementService.checkAndAward(key, 'blackjack_natural');
  }

  void announceBigWin(
    interaction.client,
    key.guildId,
    key.discordId,
    'blackjack',
    result.bet,
    result.payout,
    result.profit,
  );
}

function interactionKey(interaction: ButtonInteraction): UserKey {
  return {
    discordId: interaction.user.id,
    guildId: interaction.guildId!,
  };
}

function activeHandEmbed(
  state: BlackjackState,
  bet: number,
): EmbedBuilder {
  const dealerShown = state.dealerRevealed;
  const dealerValue = dealerShown ? handValue(state.dealerHand) : '?';

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
        value: `${formatHand(state.dealerHand, !dealerShown)} (${dealerValue})`,
        inline: false,
      },
      {
        name: 'Bet',
        value: formatCoins(bet),
        inline: true,
      },
    )
    .setFooter({ text: BLACKJACK_MENU_FOOTER });
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

export function isBlackjackButton(customId: string): boolean {
  return parseBlackjackCustomId(customId) !== null;
}

export async function handleBlackjackButton(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      embeds: [errorEmbed('This button can only be used in a server.')],
      ephemeral: true,
    });
    return;
  }

  const parsed = parseBlackjackCustomId(interaction.customId);
  if (!parsed) {
    return;
  }

  const key = interactionKey(interaction);

  try {
    if (parsed.action === 'quit') {
      const { state, result } = await forfeitBlackjack(parsed.sessionId, key);
      if (!result.details) {
        throw new Error('Blackjack forfeit missing details.');
      }
      await interaction.update({
        embeds: [
          resultEmbed(
            state,
            result.bet,
            result.details,
            result.payout,
            result.profit,
            result.xpAwarded,
          ).setTitle('Blackjack — Forfeited'),
        ],
        components: [],
      });
      return;
    }

    if (parsed.action === 'hit') {
      const { state, bet, result } = await hitBlackjack(parsed.sessionId, key);
      if (result?.details) {
        await afterBlackjackResult(interaction, key, result);
        await interaction.update({
          embeds: [
            resultEmbed(
              state,
              result.bet,
              result.details,
              result.payout,
              result.profit,
              result.xpAwarded,
            ),
          ],
          components: [],
        });
        return;
      }

      const canDouble = state.playerHand.length === 2 && !state.doubled;
      await interaction.update({
        embeds: [activeHandEmbed(state, bet)],
        components: serializeButtonRows(
          buildBlackjackButtons(parsed.sessionId, canDouble),
        ),
      });
      return;
    }

    if (parsed.action === 'stand') {
      const { state, result } = await standBlackjack(parsed.sessionId, key);
      if (!result.details) {
        throw new Error('Blackjack result missing details.');
      }
      await afterBlackjackResult(interaction, key, result);
      await interaction.update({
        embeds: [
          resultEmbed(
            state,
            result.bet,
            result.details,
            result.payout,
            result.profit,
            result.xpAwarded,
          ),
        ],
        components: [],
      });
      return;
    }

    const { state, result } = await doubleBlackjack(parsed.sessionId, key);
    if (!result?.details) {
      throw new Error('Blackjack result missing details.');
    }
    await afterBlackjackResult(interaction, key, result);
    await interaction.update({
      embeds: [
        resultEmbed(
          state,
          result.bet,
          result.details,
          result.payout,
          result.profit,
          result.xpAwarded,
        ),
      ],
      components: [],
    });
  } catch (err) {
    const message =
      err instanceof GamblebotError
        ? err.message
        : 'Something went wrong with your blackjack hand.';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [errorEmbed(message)], ephemeral: true });
    } else {
      await interaction.reply({ embeds: [errorEmbed(message)], ephemeral: true });
    }
  }
}
