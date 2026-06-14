import { Client, GatewayIntentBits, REST, Routes } from 'discord.js';
import { loadEnv } from './config/env.js';
import { loadCommands } from './commands/loader.js';
import type { Command } from './commands/types.js';
import { registerEventHooks } from './events/hooks.js';
import { registerReadyEvent } from './events/ready.js';
import { registerInteractionCreateEvent } from './events/interactionCreate.js';

export async function createBot(): Promise<Client> {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  const commands = new Map<string, Command>();
  await loadCommands(client, commands);

  registerEventHooks(client);
  registerReadyEvent(client);
  registerInteractionCreateEvent(client);

  return client;
}

export async function registerSlashCommands(guildId?: string): Promise<void> {
  const env = loadEnv();
  const client = await createBot();
  const commandData = [...client.commands.values()].map((cmd) => cmd.data.toJSON());

  const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, guildId), {
      body: commandData,
    });
    console.log(`Registered ${commandData.length} guild commands for ${guildId}`);
  } else {
    await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), {
      body: commandData,
    });
    console.log(`Registered ${commandData.length} global commands`);
  }
}
