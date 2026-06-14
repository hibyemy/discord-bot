import { SlashCommandBuilder } from 'discord.js';
import { shopService } from '../../services/index.js';
import { infoEmbed } from '../../utils/embeds.js';
import type { Command } from '../types.js';
import { userKey } from '../economy/helpers.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('View your owned shop upgrades'),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const items = await shopService.listItems(userKey(interaction));
    const owned = items.filter((item) => item.currentRank > 0);

    if (owned.length === 0) {
      const embed = infoEmbed(
        'Inventory',
        'You do not own any upgrades yet.\nUse `/shop` to browse and `/buy` to purchase.',
      );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const multipliers = await shopService.getActiveMultipliers(userKey(interaction));

    const lines = owned.map((item) => {
      const rank = `${item.currentRank}/${item.maxRank}`;
      return `**${item.name}** (${rank})\n> ${item.description}`;
    });

    const effectSummary = [
      `Job payout: **${Math.round((multipliers.jobPayout - 1) * 100)}%** bonus`,
      `Win chance: **+${(multipliers.winChanceBonus * 100).toFixed(1)}%**`,
      `Cooldown reduction: **${Math.round(multipliers.cooldownReduction * 100)}%**`,
      `Bank interest: **+${(multipliers.bankInterest * 100).toFixed(1)}%**`,
      `Max bet: **+${Math.round(multipliers.maxBetBonus * 100)}%**`,
    ];

    const embed = infoEmbed('Inventory', lines.join('\n\n'));
    embed.addFields({ name: 'Active effects', value: effectSummary.join('\n') });

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
