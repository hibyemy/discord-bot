import type { ChatInputCommandInteraction } from 'discord.js';
import { ValidationError } from '../../contracts/errors.js';
import type { UserKey } from '../../contracts/services.js';

export function requireGuild(interaction: ChatInputCommandInteraction): string {
  if (!interaction.guildId) {
    throw new ValidationError('This command can only be used in a server.');
  }
  return interaction.guildId;
}

export function userKey(
  interaction: ChatInputCommandInteraction,
  discordId?: string,
): UserKey {
  return {
    discordId: discordId ?? interaction.user.id,
    guildId: requireGuild(interaction),
  };
}
