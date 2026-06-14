import { SlashCommandBuilder } from 'discord.js';
import { ValidationError } from '../../contracts/errors.js';
import { getGame } from '../../config/games.js';
import { guildConfigService, progressionService } from '../../services/index.js';
import type { GameFlowResult } from '../../services/games/base.game.js';
import {
  attachCrashMessage,
  buildCrashCashoutId,
  finalizeCrashSession,
  getCurrentMultiplier,
  hasCrashed,
  startCrashSession,
  tryAutoCrash,
  type CrashDetails,
} from '../../services/games/crash.game.js';
import {
  buildCrashActiveEmbed,
  buildCrashActiveRow,
  buildResultEmbed,
} from '../../events/components/crash.handler.js';
import type { Command } from '../types.js';
import { userKey } from '../economy/helpers.js';

const gameDef = getGame('crash')!;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('crash')
    .setDescription('Cash out before the multiplier crashes')
    .addIntegerOption((opt) =>
      opt.setName('bet').setDescription('Amount to wager').setRequired(true).setMinValue(1),
    ),
  async execute(interaction) {
    const key = userKey(interaction);
    const bet = interaction.options.getInteger('bet', true);

    const level = await progressionService.getLevel(key);
    const unlocks = progressionService.getUnlocks(level);
    if (!unlocks.games.includes('crash')) {
      throw new ValidationError(
        `Crash unlocks at level **${gameDef.unlockLevel}** (you are level **${level}**).`,
      );
    }

    if (await guildConfigService.isGameDisabled(key.guildId, 'crash')) {
      throw new ValidationError('Crash is disabled in this server.');
    }

    const { sessionId, state } = await startCrashSession(key, bet);
    const expiresAt = Date.now() + gameDef.sessionTimeoutMs;

    const reply = await interaction.reply({
      embeds: [
        buildCrashActiveEmbed(bet, getCurrentMultiplier(state), gameDef.sessionTimeoutMs),
      ],
      components: [buildCrashActiveRow(sessionId)],
      fetchReply: true,
    });

    await attachCrashMessage(sessionId, key, reply.id, reply.channelId);

    let settled = false;

    const settle = async (
      finalize: () => Promise<GameFlowResult<CrashDetails>>,
    ): Promise<void> => {
      if (settled) return;
      settled = true;
      clearInterval(tick);
      collector.stop();

      const result = await finalize();
      await interaction.editReply({
        embeds: [buildResultEmbed(result)],
        components: [],
      });
    };

    const tick = setInterval(async () => {
      if (settled) return;

      try {
        const autoResult = await tryAutoCrash(key, sessionId);
        if (autoResult) {
          settled = true;
          clearInterval(tick);
          collector.stop();
          await interaction.editReply({
            embeds: [buildResultEmbed(autoResult)],
            components: [],
          });
          return;
        }

        const remainingMs = expiresAt - Date.now();
        if (remainingMs <= 0) {
          await settle(() =>
            finalizeCrashSession(key, sessionId, {
              outcome: 'expired',
              crashPoint: state.crashPoint,
            }),
          );
          return;
        }

        const multiplier = getCurrentMultiplier(state);
        if (hasCrashed(state)) {
          await settle(() =>
            finalizeCrashSession(key, sessionId, {
              outcome: 'crash',
              crashPoint: state.crashPoint,
            }),
          );
          return;
        }

        await interaction.editReply({
          embeds: [buildCrashActiveEmbed(bet, multiplier, remainingMs)],
          components: [buildCrashActiveRow(sessionId)],
        });
      } catch (err) {
        console.error('Crash tick error:', err);
      }
    }, 1_500);

    const collector = reply.createMessageComponentCollector({
      time: gameDef.sessionTimeoutMs,
      filter: (i) =>
        i.user.id === interaction.user.id &&
        i.customId === buildCrashCashoutId(sessionId),
    });

    collector.on('collect', async (buttonInteraction) => {
      try {
        await buttonInteraction.deferUpdate();
        const multiplier = getCurrentMultiplier(state);
        await settle(() =>
          finalizeCrashSession(key, sessionId, {
            outcome: 'cashout',
            multiplier,
            crashPoint: state.crashPoint,
          }),
        );
      } catch (err) {
        console.error('Crash cash-out error:', err);
      }
    });

    collector.on('end', async () => {
      if (settled) return;

      try {
        const autoResult = await tryAutoCrash(key, sessionId);
        if (autoResult) {
          settled = true;
          clearInterval(tick);
          await interaction.editReply({
            embeds: [buildResultEmbed(autoResult)],
            components: [],
          });
          return;
        }

        await settle(() =>
          finalizeCrashSession(key, sessionId, {
            outcome: 'expired',
            crashPoint: state.crashPoint,
          }),
        );
      } catch (err) {
        console.error('Crash session end error:', err);
      }
    });
  },
};

export default command;
