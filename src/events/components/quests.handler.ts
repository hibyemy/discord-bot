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

export const QUEST_CLAIM_PREFIX = 'quests:claim:';

export function isQuestClaimButton(customId: string): boolean {
  return customId.startsWith(QUEST_CLAIM_PREFIX);
}

export function parseQuestClaimId(customId: string): string | null {
  if (!customId.startsWith(QUEST_CLAIM_PREFIX)) return null;
  const questId = customId.slice(QUEST_CLAIM_PREFIX.length);
  return questId.length > 0 ? questId : null;
}

export function questBoardEmbed(board: QuestBoard): EmbedBuilder {
  const bonusPct = Math.round(board.streakBonus * questConfig.streakBonusPerDay * 100);
  const claimable = board.quests.filter((q) => q.completed && !q.claimed).length;

  const questLines = board.quests.map((quest) => {
    const status = quest.claimed ? '💰' : quest.completed ? '✅' : '⬜';
    const bar = progressBar(quest.progress, quest.target);
    const claimState = quest.claimed
      ? '_Claimed_'
      : quest.completed
        ? '_Ready to claim_'
        : '_In progress_';
    return [
      `${status} **${quest.description}**`,
      `${bar} ${Math.min(quest.progress, quest.target)}/${quest.target}`,
      `Reward: ${formatCoins(quest.rewardCoins)} + ${quest.rewardXp} XP · ${claimState}`,
    ].join('\n');
  });

  const footerParts = [
    `Completed: ${board.completed}/${board.quests.length}`,
    `Claimable: ${claimable}`,
    `Streak bonus: +${bonusPct}%`,
  ];

  if (board.claimed) {
    footerParts.push('All rewards claimed');
  } else if (claimable > 0) {
    footerParts.push('Claim each finished quest individually');
  }

  return new EmbedBuilder()
    .setColor(board.claimed ? embedColors.success : embedColors.info)
    .setTitle('Daily Quests')
    .setDescription(questLines.join('\n\n'))
    .setFooter({ text: footerParts.join(' • ') });
}

export function questClaimButtonRows(board: QuestBoard): ActionRowBuilder<ButtonBuilder>[] {
  const buttons = board.quests.map((quest, index) => {
    const shortLabel = quest.description.length > 18
      ? `Quest ${index + 1}`
      : quest.description;

    if (quest.claimed) {
      return new ButtonBuilder()
        .setCustomId(`${QUEST_CLAIM_PREFIX}${quest.id}`)
        .setLabel(`${shortLabel} ✓`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true);
    }

    if (quest.completed) {
      return new ButtonBuilder()
        .setCustomId(`${QUEST_CLAIM_PREFIX}${quest.id}`)
        .setLabel(`Claim ${shortLabel}`)
        .setStyle(ButtonStyle.Success);
    }

    return new ButtonBuilder()
      .setCustomId(`${QUEST_CLAIM_PREFIX}${quest.id}`)
      .setLabel(shortLabel)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);
  });

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length; i += 3) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 3)),
    );
  }
  return rows;
}

/** @deprecated Use questClaimButtonRows */
export function questClaimButtonRow(board: QuestBoard): ActionRowBuilder<ButtonBuilder> {
  return questClaimButtonRows(board)[0] ?? new ActionRowBuilder<ButtonBuilder>();
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

  const questId = parseQuestClaimId(interaction.customId);
  if (!questId) return;

  const key = { discordId: interaction.user.id, guildId: interaction.guildId };

  try {
    const boardBefore = await questService.getDailyQuests(key);
    const previousLevel = await progressionService.getLevel(key);
    const result = await questService.claimQuestReward(key, questId);
    const refreshed = await questService.getDailyQuests(key);
    const newLevel = await progressionService.getLevel(key);
    await emitLevelUpEvents(key, previousLevel, newLevel);

    if (refreshed.claimed) {
      await achievementService.checkAndAward(key, 'quest_streak', {
        value: boardBefore.streakBonus + 1,
      });
    }

    await interaction.update({
      embeds: [questBoardEmbed(refreshed)],
      components: questClaimButtonRows(refreshed),
    });

    const quest = boardBefore.quests.find((q) => q.id === questId);
    await interaction.followUp({
      embeds: [
        new EmbedBuilder()
          .setColor(embedColors.success)
          .setTitle('Quest Reward Claimed')
          .setDescription(
            [
              quest ? `**${quest.description}**` : 'Quest complete',
              `You received **${formatCoins(result.coins)}** and **${result.xp} XP**.`,
            ].join('\n'),
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
