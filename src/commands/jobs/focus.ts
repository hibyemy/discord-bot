import { SlashCommandBuilder } from 'discord.js';
import { ValidationError } from '../../contracts/errors.js';
import type { UserKey } from '../../contracts/services.js';
import { startFocusWorkSession } from '../../events/components/focus-work.handler.js';
import type { Command } from '../types.js';

function userKey(interaction: { user: { id: string }; guildId: string | null }): UserKey {
  return { discordId: interaction.user.id, guildId: interaction.guildId! };
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('focus')
    .setDescription('Start a high-paying focus shift minigame (requires constant attention)'),
  async execute(interaction) {
    if (!interaction.guildId) {
      throw new ValidationError('This command can only be used in a server.');
    }

    await startFocusWorkSession(interaction, userKey(interaction));
  },
};

export default command;
