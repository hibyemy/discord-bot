import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ButtonInteraction,
} from 'discord.js';
import { GamblebotError } from '../../contracts/errors.js';
import type { QuestBoard } from '../../contracts/services.js';
import { emitLevelUpEvents } from '../hooks.js';
import { achievementService, progressionService, questService } from '../../services/index.js';
import { embedColors, errorEmbed, formatCoins, progressBar } from '../../utils/embeds.js';
import { questConfig } from '../../config/quests.js';

export const QUEST_CLAIM_CUSTOM_ID = 'quests:claim';

export function questBoardEmbed(board: QuestBoard): EmbedBuilder {
  const baseCoins = board.quests.reduce((sum, q) => sum + q.rewardCoins, 0);
  const baseXp = board.quests.reduce((sum, q) => sum + q.rewardXp, 0);
  const bonusPct = Math.round(board.streakBonus * questConfig.streakBonusPerDay * 100);

  const questLines = board.quests.map((quest) => {
    const icon = quest.completed ? '✅' : '⬜';
    const bar = progressBar(quest.progress, quest.target);
    return [
      `${icon} **${quest.description}**`,
      `${bar} ${Math.min(quest.progress, quest.target)}/${quest.target}`,
      `Reward: ${formatCoins(quest.rewardCoins)} + ${quest.rewardXp} XP`,
    ].join('\n');
  });

  const footerParts = [
    `Progress: ${board.completed}/${board.quests.length}`,
    `Streak bonus: +${bonusPct}%`,
    `Pool total: ${formatCoins(baseCoins)} + ${baseXp} XP`,
  ];

  if (board.claimed) {
    footerParts.push('Rewards claimed');
  } else if (board.allComplete) {
    footerParts.push('All quests complete — claim your rewards');
  }

  return new EmbedBuilder()
    .setColor(board.allComplete ? embedColors.success : embedColors.info)
    .setTitle('Daily Quests')
    .setDescription(questLines.join('\n\n'))
    .setFooter({ text: footerParts.join(' • ') });
}

export function questClaimButtonRow(board: QuestBoard): ActionRowBuilder<ButtonBuilder> {
  const disabled = board.claimed || !board.allComplete;
  const label = board.claimed
    ? 'Claimed'
    : board.allComplete
      ? 'Claim Rewards'
      : 'Complete All Quests';

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(QUEST_CLAIM_CUSTOM_ID)
      .setLabel(label)
      .setStyle(board.claimed ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(disabled),
  );
}

export async function handleQuestClaimButton(
  interaction: ButtonInteraction,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      embeds: [errorEmbed('This button can only be used in a server.')],
      ephemeral: true,
    });
    return;
  }

  const key = { discordId: interaction.user.id, guildId: interaction.guildId };

  try {
    const boardBefore = await questService.getDailyQuests(key);
    const previousLevel = await progressionService.getLevel(key);
    const result = await questService.claimReward(key);
    const refreshed = await questService.getDailyQuests(key);
    const newLevel = await progressionService.getLevel(key);
    await emitLevelUpEvents(key, previousLevel, newLevel);
    await achievementService.checkAndAward(key, 'quest_streak', {
      value: boardBefore.streakBonus + 1,
    });

    await interaction.update({
      embeds: [questBoardEmbed(refreshed)],
      components: [questClaimButtonRow(refreshed)],
    });

    await interaction.followUp({
      embeds: [
        new EmbedBuilder()
          .setColor(embedColors.success)
          .setTitle('Quest Rewards Claimed')
          .setDescription(
            `You received **${formatCoins(result.coins)}** and **${result.xp} XP**.`,
          ),
      ],
      ephemeral: true,
    });
  } catch (err) {
    const message =
      err instanceof GamblebotError
        ? err.message
        : 'Failed to claim quest rewards.';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [errorEmbed(message)], ephemeral: true });
    } else {
      await interaction.reply({ embeds: [errorEmbed(message)], ephemeral: true });
    }
  }
}
