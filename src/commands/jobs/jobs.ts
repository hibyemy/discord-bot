import { SlashCommandBuilder } from 'discord.js';
import { getJobByName } from '../../config/jobs.js';
import { ValidationError } from '../../contracts/errors.js';
import type { UserKey } from '../../contracts/services.js';
import { jobService } from '../../services/index.js';
import { formatCooldown } from '../../utils/cooldowns.js';
import { formatCoins, infoEmbed } from '../../utils/embeds.js';
import type { Command } from '../types.js';

function userKey(interaction: { user: { id: string }; guildId: string | null }): UserKey {
  return { discordId: interaction.user.id, guildId: interaction.guildId! };
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('jobs')
    .setDescription('List available jobs and your active job'),
  async execute(interaction) {
    if (!interaction.guildId) {
      throw new ValidationError('This command can only be used in a server.');
    }

    await interaction.deferReply({ ephemeral: true });

    const jobs = await jobService.getAvailableJobs(userKey(interaction));
    const active = jobs.find((j) => j.active);

    const lines = jobs.map((job) => {
      const unlockLevel = getJobByName(job.name)?.unlockLevel ?? '?';
      const status = job.active
        ? '**[Active]**'
        : job.unlocked
          ? 'Unlocked'
          : `🔒 Lv.${unlockLevel}`;
      const pay = formatCoins(job.basePay);
      const cd = formatCooldown(job.cooldownMs);
      return `${status} **${job.name}** (T${job.tier}) — ~${pay} · ${cd} cooldown`;
    });

    const embed = infoEmbed('Jobs', lines.join('\n'));
    if (active) {
      embed.setFooter({ text: `Active job: ${active.name}` });
    } else {
      embed.setFooter({ text: 'Use /job set to choose a job' });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
