import { SlashCommandBuilder } from 'discord.js';
import { shopService } from '../../services/index.js';
import { formatCoins, infoEmbed } from '../../utils/embeds.js';
import type { Command } from '../types.js';
import { userKey } from '../economy/helpers.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Browse available shop upgrades'),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const items = await shopService.listItems(userKey(interaction));
    const byTier = new Map<number, typeof items>();

    for (const item of items) {
      const tierItems = byTier.get(item.tier) ?? [];
      tierItems.push(item);
      byTier.set(item.tier, tierItems);
    }

    const lines: string[] = [];
    for (const tier of [...byTier.keys()].sort((a, b) => a - b)) {
      lines.push(`**Tier ${tier}**`);
      for (const item of byTier.get(tier)!) {
        const lock = item.unlocked ? '' : ' 🔒';
        const rank = `${item.currentRank}/${item.maxRank}`;
        const cost =
          item.nextCost !== null
            ? formatCoins(item.nextCost)
            : 'MAX';
        lines.push(
          `${lock} **${item.name}** (${rank}) — ${cost}\n> ${item.description}`,
        );
      }
      lines.push('');
    }

    const embed = infoEmbed('Shop', lines.join('\n').trim());
    embed.setFooter({ text: 'Use /buy to purchase an upgrade' });

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
