import { SlashCommandBuilder } from 'discord.js';
import { openGamesMenu } from '../../events/components/menu.handler.js';
import type { Command } from '../types.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Open the casino hub (shortcut — use /menu for everything)'),
  async execute(interaction) {
    await openGamesMenu(interaction);
  },
};

export default command;
