import { Events } from 'discord.js';
import type { Client } from 'discord.js';
import { GamblebotError } from '../contracts/errors.js';
import { guildConfigService } from '../services/index.js';
import { errorEmbed } from '../utils/embeds.js';
import {
  handleBlackjackButton,
  isBlackjackButton,
} from './components/blackjack.handler.js';
import { handleCrashButton, isCrashButton } from './components/crash.handler.js';
import {
  handleOneshotReplayButton,
  isOneshotReplayButton,
} from './components/oneshot-replay.handler.js';
import {
  handleMenuButton,
  handleMenuModal,
  handleMenuSelect,
  handleMenuUserSelect,
  isMenuButton,
  isMenuModal,
  isMenuSelect,
  isMenuUserSelect,
} from './components/menu.handler.js';
import {
  handlePlayButton,
  handlePlayModal,
  handlePlaySelect,
  isPlayButton,
  isPlayModal,
  isPlaySelect,
} from './components/play.handler.js';
import adminCommand from '../commands/admin/admin.js';
import {
  handleQuestClaimButton,
  QUEST_CLAIM_CUSTOM_ID,
} from './components/quests.handler.js';

export function registerInteractionCreateEvent(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (command?.autocomplete) {
        try {
          await command.autocomplete(interaction);
        } catch (err) {
          console.error(`Autocomplete error [${interaction.commandName}]:`, err);
        }
      }
      return;
    }

    if (interaction.isButton()) {
      try {
        if (interaction.customId === QUEST_CLAIM_CUSTOM_ID) {
          await handleQuestClaimButton(interaction);
          return;
        }
        if (isMenuButton(interaction.customId)) {
          await handleMenuButton(interaction);
          return;
        }
        if (isPlayButton(interaction.customId)) {
          await handlePlayButton(interaction);
          return;
        }
        if (isBlackjackButton(interaction.customId)) {
          await handleBlackjackButton(interaction);
          return;
        }
        if (isCrashButton(interaction.customId)) {
          await handleCrashButton(interaction);
          return;
        }
        if (isOneshotReplayButton(interaction.customId)) {
          await handleOneshotReplayButton(interaction);
          return;
        }
        if (interaction.customId.startsWith('admin:reset:confirm:')) {
          await adminCommand.handleResetConfirm(interaction);
          return;
        }
      } catch (err) {
        console.error(`Button error [${interaction.customId}]:`, err);
        const message =
          err instanceof GamblebotError
            ? err.message
            : 'An unexpected error occurred.';
        const payload = {
          embeds: [errorEmbed(message)],
          ephemeral: true,
        };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(payload);
        } else {
          await interaction.reply(payload);
        }
      }
      return;
    }

    if (interaction.isStringSelectMenu()) {
      try {
        if (isMenuSelect(interaction.customId)) {
          await handleMenuSelect(interaction);
          return;
        }
        if (isPlaySelect(interaction.customId)) {
          await handlePlaySelect(interaction);
          return;
        }
      } catch (err) {
        console.error(`Select menu error [${interaction.customId}]:`, err);
        const message =
          err instanceof GamblebotError
            ? err.message
            : 'An unexpected error occurred.';
        await interaction.reply({ embeds: [errorEmbed(message)], ephemeral: true });
      }
      return;
    }

    if (interaction.isUserSelectMenu()) {
      try {
        if (isMenuUserSelect(interaction.customId)) {
          await handleMenuUserSelect(interaction);
          return;
        }
      } catch (err) {
        console.error(`User select error [${interaction.customId}]:`, err);
        const message =
          err instanceof GamblebotError
            ? err.message
            : 'An unexpected error occurred.';
        await interaction.reply({ embeds: [errorEmbed(message)], ephemeral: true });
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      try {
        if (isMenuModal(interaction.customId)) {
          await handleMenuModal(interaction);
          return;
        }
        if (isPlayModal(interaction.customId)) {
          await handlePlayModal(interaction);
          return;
        }
      } catch (err) {
        console.error(`Modal error [${interaction.customId}]:`, err);
        const message =
          err instanceof GamblebotError
            ? err.message
            : 'An unexpected error occurred.';
        await interaction.reply({ embeds: [errorEmbed(message)], ephemeral: true });
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    if (interaction.guildId) {
      const disabled = await guildConfigService.isCommandDisabled(
        interaction.guildId,
        interaction.commandName,
      );
      if (disabled) {
        await interaction.reply({
          embeds: [errorEmbed('This command is disabled in this server.')],
          ephemeral: true,
        });
        return;
      }
    }

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      await interaction.reply({
        embeds: [errorEmbed('Unknown command.')],
        ephemeral: true,
      });
      return;
    }

    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`Command error [${interaction.commandName}]:`, err);
      const message =
        err instanceof GamblebotError
          ? err.message
          : 'An unexpected error occurred.';
      const payload = {
        embeds: [errorEmbed(message)],
        ephemeral: true,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    }
  });
}
