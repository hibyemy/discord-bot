import { SlashCommandBuilder } from 'discord.js';
import { ValidationError } from '../../contracts/errors.js';
import type { UserKey } from '../../contracts/services.js';
import { emitLevelUpEvents, emitWorkEvents } from '../../events/hooks.js';
import { jobService, progressionService } from '../../services/index.js';
import {
  embedColors,
  formatCoins,
  successEmbed,
} from '../../utils/embeds.js';
import { formatCooldown } from '../../utils/cooldowns.js';
import type { Command } from '../types.js';

function userKey(interaction: { user: { id: string }; guildId: string | null }): UserKey {
  return { discordId: interaction.user.id, guildId: interaction.guildId! };
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('work')
    .setDescription('Work your active job for coins and XP'),
  async execute(interaction) {
    if (!interaction.guildId) {
      throw new ValidationError('This command can only be used in a server.');
    }

    await interaction.deferReply();

    const key = userKey(interaction);
    const previousLevel = await progressionService.getLevel(key);
    const result = await jobService.work(key);
    await emitWorkEvents(key, result.critical);
    await emitLevelUpEvents(key, previousLevel, result.user.level);

    const title = result.critical ? 'Critical work success!' : 'Work complete';
    const embed = successEmbed(title)
      .setColor(embedColors.economy)
      .addFields(
        { name: 'Job', value: result.jobName, inline: true },
        { name: 'Payout', value: formatCoins(result.payout), inline: true },
        { name: 'XP', value: `+${result.xp}`, inline: true },
        {
          name: 'Next work',
          value: formatCooldown(result.cooldownMs),
          inline: true,
        },
      );

    if (result.critical) {
      embed.setDescription('You had an exceptional shift — double payout and bonus XP!');
    }

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
