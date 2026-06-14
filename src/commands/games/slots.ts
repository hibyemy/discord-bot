import { SlashCommandBuilder } from 'discord.js';
import { ValidationError } from '../../contracts/errors.js';
import { getGame } from '../../config/games.js';
import { buildOneshotReply } from '../../events/components/oneshot-replay.handler.js';
import { guildConfigService, progressionService } from '../../services/index.js';
import { playSlots } from '../../services/games/slots.game.js';
import type { Command } from '../types.js';
import { userKey } from '../economy/helpers.js';

const gameDef = getGame('slots')!;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('slots')
    .setDescription('Spin the 3-reel slot machine')
    .addIntegerOption((opt) =>
      opt.setName('bet').setDescription('Amount to wager').setRequired(true).setMinValue(1),
    ),
  async execute(interaction) {
    const key = userKey(interaction);
    const bet = interaction.options.getInteger('bet', true);

    const level = await progressionService.getLevel(key);
    const unlocks = progressionService.getUnlocks(level);
    if (!unlocks.games.includes('slots')) {
      throw new ValidationError(
        `Slots unlocks at level **${gameDef.unlockLevel}** (you are level **${level}**).`,
      );
    }

    if (await guildConfigService.isGameDisabled(key.guildId, 'slots')) {
      throw new ValidationError('Slots is disabled in this server.');
    }

    const result = await playSlots(key, bet);
    const { embed, components } = buildOneshotReply(
      'slots',
      interaction.user.id,
      bet,
      result,
    );

    await interaction.reply({ embeds: [embed], components });
  },
};

export default command;
