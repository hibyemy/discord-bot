import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import { getWorkTaskById, pickWorkTasks } from '../../config/jobs.js';
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

const TASK_PREFIX = 'work:task:';
const TASK_TIMEOUT_MS = 30_000;

function userKey(interaction: { user: { id: string }; guildId: string | null }): UserKey {
  return { discordId: interaction.user.id, guildId: interaction.guildId! };
}

function buildTaskPicker(userId: string, tasks: ReturnType<typeof pickWorkTasks>) {
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (const task of tasks) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${TASK_PREFIX}${userId}:${task.id}`)
        .setLabel(task.label)
        .setEmoji(task.emoji)
        .setStyle(ButtonStyle.Primary),
    );
  }
  return row;
}

async function runWorkWithTask(
  interaction: Parameters<Command['execute']>[0],
  key: UserKey,
  taskId: string,
): Promise<void> {
  const task = getWorkTaskById(taskId);
  if (!task) {
    throw new ValidationError('Unknown work task.');
  }

  const previousLevel = await progressionService.getLevel(key);
  const result = await jobService.work(key, {
    taskMultiplier: task.multiplier,
    taskLabel: task.label,
  });
  await emitWorkEvents(key, result.critical);
  await emitLevelUpEvents(key, previousLevel, result.user.level);

  const title = result.critical ? 'Critical work success!' : 'Work complete';
  const embed = successEmbed(title)
    .setColor(embedColors.economy)
    .addFields(
      { name: 'Job', value: result.jobName, inline: true },
      { name: 'Task', value: task.label, inline: true },
      { name: 'Payout', value: formatCoins(result.payout), inline: true },
      { name: 'XP', value: `+${result.xp}`, inline: true },
      {
        name: 'Next work',
        value: formatCooldown(result.cooldownMs),
        inline: true,
      },
    );

  const description = result.critical
    ? `${task.flavor}\n\n_Exceptional shift — double payout and bonus XP!_`
    : task.flavor;

  embed.setDescription(description);
  await interaction.editReply({ embeds: [embed], components: [] });
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
    const tasks = pickWorkTasks(3);
    const picker = new EmbedBuilder()
      .setColor(embedColors.info)
      .setTitle('Choose your shift task')
      .setDescription(
        [
          'Pick how you want to spend this work shift.',
          'Each task gives a small payout bonus.',
          '',
          ...tasks.map((task) => `${task.emoji} **${task.label}** — +${Math.round((task.multiplier - 1) * 100)}% pay`),
        ].join('\n'),
      );

    const reply = await interaction.editReply({
      embeds: [picker],
      components: [buildTaskPicker(interaction.user.id, tasks)],
    });

    const collector = reply.createMessageComponentCollector({
      time: TASK_TIMEOUT_MS,
      filter: (component) =>
        component.user.id === interaction.user.id &&
        component.customId.startsWith(TASK_PREFIX),
    });

    collector.on('collect', async (componentInteraction) => {
      if (!componentInteraction.isButton()) return;
      const taskId = componentInteraction.customId.split(':').at(-1);
      if (!taskId) return;

      await componentInteraction.deferUpdate();
      collector.stop('picked');
      await runWorkWithTask(interaction, key, taskId);
    });

    collector.on('end', async (_collected, reason) => {
      if (reason === 'picked') return;
      try {
        await reply.edit({ components: [] });
      } catch {
        // Message may have been deleted.
      }
    });
  },
};

export default command;
