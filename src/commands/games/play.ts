import { SlashCommandBuilder } from 'discord.js';
import { openPlayMenu } from '../../events/components/play.handler.js';
import type { Command } from '../types.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Open the casino hub — pick games from one menu'),
  async execute(interaction) {
    await openPlayMenu(interaction);
  },
};

export default command;
