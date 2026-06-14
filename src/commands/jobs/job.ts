import { SlashCommandBuilder } from 'discord.js';
import { ValidationError } from '../../contracts/errors.js';
import type { UserKey } from '../../contracts/services.js';
import { jobService } from '../../services/index.js';
import { successEmbed } from '../../utils/embeds.js';
import type { Command } from '../types.js';

function userKey(interaction: { user: { id: string }; guildId: string | null }): UserKey {
  return { discordId: interaction.user.id, guildId: interaction.guildId! };
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('job')
    .setDescription('Manage your active job')
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Set your active job')
        .addStringOption((opt) =>
          opt
            .setName('name')
            .setDescription('Job name')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    ),
  async execute(interaction) {
    if (!interaction.guildId) {
      throw new ValidationError('This command can only be used in a server.');
    }

    const sub = interaction.options.getSubcommand();
    if (sub !== 'set') return;

    const name = interaction.options.getString('name', true);
    const user = await jobService.setJob(userKey(interaction), name);

    await interaction.reply({
      embeds: [
        successEmbed('Job updated', `You are now working as **${user.activeJob}**.`),
      ],
      ephemeral: true,
    });
  },
  async autocomplete(interaction) {
    if (!interaction.guildId) {
      await interaction.respond([]);
      return;
    }

    const focused = interaction.options.getFocused().toLowerCase();
    const jobs = await jobService.getAvailableJobs(userKey(interaction));
    const choices = jobs
      .filter((j) => j.unlocked && j.name.toLowerCase().includes(focused))
      .slice(0, 25)
      .map((j) => ({ name: j.name, value: j.name }));

    await interaction.respond(choices);
  },
};

export default command;
