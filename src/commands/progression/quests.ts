import { SlashCommandBuilder } from 'discord.js';
import { questService } from '../../services/index.js';
import {
  handleQuestClaimButton,
  QUEST_CLAIM_CUSTOM_ID,
  questBoardEmbed,
  questClaimButtonRow,
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
      components: [questClaimButtonRow(board)],
      fetchReply: true,
    });

    if (board.claimed || !board.allComplete) return;

    const collector = reply.createMessageComponentCollector({
      time: COLLECTOR_MS,
    });

    collector.on('collect', async (componentInteraction) => {
      if (componentInteraction.customId !== QUEST_CLAIM_CUSTOM_ID) return;
      if (!componentInteraction.isButton()) return;
      if (componentInteraction.user.id !== interaction.user.id) return;

      await handleQuestClaimButton(componentInteraction);
      collector.stop('claimed');
    });

    collector.on('end', async () => {
      try {
        const refreshed = await questService.getDailyQuests(key);
        await reply.edit({
          components: [questClaimButtonRow(refreshed)],
        });
      } catch {
        // Message may have been deleted.
      }
    });
  },
};

export default command;
