import { SlashCommandBuilder } from 'discord.js';
import type { Command } from './types.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check if the bot is online'),
  async execute(interaction) {
    const latency = Date.now() - interaction.createdTimestamp;
    await interaction.reply({
      content: `Pong! ${latency}ms API · ${interaction.client.ws.ping}ms WS`,
      ephemeral: true,
    });
  },
};

export default command;
