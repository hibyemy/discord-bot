import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ButtonInteraction,
} from 'discord.js';
import { ValidationError } from '../../contracts/errors.js';
import type { UserKey } from '../../contracts/services.js';
import {
  buildCrashCashoutId,
  finalizeCrashSession,
  getCurrentMultiplier,
  loadCrashSession,
  parseCrashCashoutId,
  tryAutoCrash,
  type CrashDetails,
} from '../../services/games/crash.game.js';
import { achievementService } from '../../services/index.js';
import { announceBigWin } from '../../utils/announce.js';
import { embedColors, formatCoins } from '../../utils/embeds.js';
import type { GameFlowResult } from '../../services/games/base.game.js';

export function isCrashButton(customId: string): boolean {
  return parseCrashCashoutId(customId) !== null;
}

function userKeyFromInteraction(interaction: ButtonInteraction): UserKey {
  if (!interaction.guildId) {
    throw new ValidationError('This button can only be used in a server.');
  }
  return { discordId: interaction.user.id, guildId: interaction.guildId };
}

function buildResultEmbed(result: GameFlowResult<CrashDetails>): EmbedBuilder {
  const details = result.details!;
  const title =
    details.outcome === 'cashout'
      ? 'Crash — Cashed out!'
      : details.outcome === 'expired'
        ? 'Crash — Timed out'
        : 'Crash — Busted!';

  const color =
    details.outcome === 'cashout'
      ? embedColors.success
      : embedColors.error;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .addFields(
      { name: 'Crash point', value: `${details.crashPoint.toFixed(2)}x`, inline: true },
      {
        name: 'Your cash-out',
        value:
          details.cashOutMultiplier !== null
            ? `${details.cashOutMultiplier.toFixed(2)}x`
            : '—',
        inline: true,
      },
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

  return embed;
}

export function buildCrashActiveEmbed(
  bet: number,
  multiplier: number,
  remainingMs: number,
): EmbedBuilder {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  return new EmbedBuilder()
    .setColor(embedColors.game)
    .setTitle('Crash — Multiplier rising')
    .setDescription(
      [
        `**${multiplier.toFixed(2)}x**`,
        '',
        'Cash out before the multiplier crashes!',
        `Round ends in **${seconds}s**.`,
      ].join('\n'),
    )
    .addFields(
      { name: 'Bet', value: formatCoins(bet), inline: true },
      {
        name: 'Potential win',
        value: formatCoins(Math.floor(bet * multiplier)),
        inline: true,
      },
    );
}

export function buildCrashActiveRow(sessionId: string, disabled = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildCrashCashoutId(sessionId))
      .setLabel('Cash out')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
  );
}

export async function handleCrashButton(interaction: ButtonInteraction): Promise<boolean> {
  const sessionId = parseCrashCashoutId(interaction.customId);
  if (!sessionId) {
    return false;
  }

  const key = userKeyFromInteraction(interaction);

  await interaction.deferUpdate();

  const autoResult = await tryAutoCrash(key, sessionId);
  if (autoResult) {
    if (
      autoResult.details?.cashOutMultiplier !== null &&
      autoResult.details?.cashOutMultiplier !== undefined
    ) {
      await achievementService.checkAndAward(key, 'crash_multiplier', {
        value: autoResult.details.cashOutMultiplier,
      });
    }
    void announceBigWin(
      interaction.client,
      key.guildId,
      key.discordId,
      'crash',
      autoResult.bet,
      autoResult.payout,
      autoResult.profit,
    );
    await interaction.editReply({
      embeds: [buildResultEmbed(autoResult)],
      components: [],
    });
    return true;
  }

  const { state } = await loadCrashSession(sessionId, key);
  const multiplier = getCurrentMultiplier(state);

  const result = await finalizeCrashSession(key, sessionId, {
    outcome: 'cashout',
    multiplier,
    crashPoint: state.crashPoint,
  });

  if (result.details?.cashOutMultiplier !== null && result.details?.cashOutMultiplier !== undefined) {
    await achievementService.checkAndAward(key, 'crash_multiplier', {
      value: result.details.cashOutMultiplier,
    });
  }
  void announceBigWin(
    interaction.client,
    key.guildId,
    key.discordId,
    'crash',
    result.bet,
    result.payout,
    result.profit,
  );

  await interaction.editReply({
    embeds: [buildResultEmbed(result)],
    components: [],
  });

  return true;
}

export { buildResultEmbed };
