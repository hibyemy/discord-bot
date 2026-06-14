import type { ButtonInteraction, ChatInputCommandInteraction } from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';
import type { Prisma } from '@prisma/client';
import { isOwner } from '../../config/env.js';
import { ValidationError } from '../../contracts/errors.js';
import { prisma } from '../../db.js';

export async function requireAdmin(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
): Promise<void> {
  if (!interaction.guildId) {
    throw new ValidationError('This command can only be used in a server.');
  }

  if (isOwner(interaction.user.id)) {
    return;
  }

  const guild = interaction.guild;
  if (guild) {
    const member = await guild.members.fetch(interaction.user.id).catch(() => null);
    if (member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return;
    }
  }

  throw new ValidationError('You need Manage Server permission or bot owner access.');
}

export async function logAdminAction(
  guildId: string,
  adminId: string,
  action: string,
  targetId?: string,
  details?: Record<string, unknown>,
): Promise<void> {
  await prisma.adminLog.create({
    data: {
      guildId,
      adminId,
      action,
      targetId,
      details: details as Prisma.InputJsonValue | undefined,
    },
  });
}
