import { SlashCommandBuilder } from 'discord.js';
import { openMainMenu } from '../events/components/menu.handler.js';
import type { Command } from './types.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('menu')
    .setDescription('Open the main hub — economy, jobs, games, shop, and progression'),
  async execute(interaction) {
    await openMainMenu(interaction);
  },
};

export default command;
