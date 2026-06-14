import { SlashCommandBuilder } from 'discord.js';
import type { UserKey } from '../../contracts/services.js';
import { emitShopPurchaseEvents } from '../../events/hooks.js';
import { shopService } from '../../services/index.js';
import { formatCoins, successEmbed } from '../../utils/embeds.js';
import type { Command } from '../types.js';
import { userKey } from '../economy/helpers.js';

function autocompleteKey(interaction: {
  user: { id: string };
  guildId: string | null;
}): UserKey {
  return { discordId: interaction.user.id, guildId: interaction.guildId! };
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Purchase a shop upgrade')
    .addStringOption((opt) =>
      opt
        .setName('item')
        .setDescription('Upgrade to buy')
        .setRequired(true)
        .setAutocomplete(true),
    ),
  async execute(interaction) {
    const upgradeId = interaction.options.getString('item', true);
    const key = userKey(interaction);

    const upgrade = await shopService.buy(key, upgradeId);
    await emitShopPurchaseEvents(key);
    const items = await shopService.listItems(key);
    const item = items.find((i) => i.id === upgradeId);

    const name = item?.name ?? upgradeId;
    const rank = `${upgrade.rank}/${item?.maxRank ?? '?'}`;
    const nextCost =
      item?.nextCost !== null && item?.nextCost !== undefined
        ? formatCoins(item.nextCost)
        : 'MAX';

    await interaction.reply({
      embeds: [
        successEmbed(
          'Upgrade purchased',
          [
            `**${name}** is now rank **${rank}**.`,
            item?.nextCost !== null
              ? `Next rank: **${nextCost}**`
              : 'This upgrade is fully maxed.',
          ].join('\n'),
        ),
      ],
      ephemeral: true,
    });
  },
  async autocomplete(interaction) {
    if (!interaction.guildId) {
      await interaction.respond([]);
      return;
    }

    const key = autocompleteKey(interaction);
    const focused = interaction.options.getFocused().toLowerCase();
    const items = await shopService.listItems(key);

    const choices = items
      .filter(
        (item) =>
          item.unlocked &&
          item.nextCost !== null &&
          (item.name.toLowerCase().includes(focused) ||
            item.id.toLowerCase().includes(focused)),
      )
      .slice(0, 25)
      .map((item) => ({
        name: `${item.name} (${item.currentRank}/${item.maxRank}) — ${item.nextCost!.toLocaleString()}`,
        value: item.id,
      }));

    await interaction.respond(choices);
  },
};

export default command;
