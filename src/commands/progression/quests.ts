import { SlashCommandBuilder } from 'discord.js';
import { questService } from '../../services/index.js';
import {
  handleQuestClaimButton,
  isQuestClaimButton,
  questBoardEmbed,
  questClaimButtonRows,
} from '../../events/components/quests.handler.js';
import { userKey } from '../economy/helpers.js';
import type { Command } from '../types.js';

const COLLECTOR_MS = 5 * 60 * 1000;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('quests')
    .setDescription('View your daily quest board and claim rewards'),
  async execute(interaction) {
    const key = userKey(interaction);
    const board = await questService.getDailyQuests(key);

    const reply = await interaction.reply({
      embeds: [questBoardEmbed(board)],
      components: questClaimButtonRows(board),
      fetchReply: true,
    });

    const hasClaimable = board.quests.some((q) => q.completed && !q.claimed);
    if (!hasClaimable) return;

    const collector = reply.createMessageComponentCollector({
      time: COLLECTOR_MS,
    });

    collector.on('collect', async (componentInteraction) => {
      if (!isQuestClaimButton(componentInteraction.customId)) return;
      if (!componentInteraction.isButton()) return;
      if (componentInteraction.user.id !== interaction.user.id) return;

      await handleQuestClaimButton(componentInteraction);
      const refreshed = await questService.getDailyQuests(key);
      if (!refreshed.quests.some((q) => q.completed && !q.claimed)) {
        collector.stop('claimed');
      }
    });

    collector.on('end', async () => {
      try {
        const refreshed = await questService.getDailyQuests(key);
        await reply.edit({
          components: questClaimButtonRows(refreshed),
        });
      } catch {
        // Message may have been deleted.
      }
    });
  },
};

export default command;
