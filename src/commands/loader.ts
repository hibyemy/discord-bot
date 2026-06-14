import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Client } from 'discord.js';
import type { Command, CommandModule } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function isCommandModuleFile(file: string): boolean {
  if (file.endsWith('.d.ts') || file.endsWith('.js.map')) {
    return false;
  }
  return file.endsWith('.js') || file.endsWith('.ts');
}

async function loadCommandFile(
  filePath: string,
  commands: Map<string, Command>,
): Promise<void> {
  const mod = (await import(pathToFileURL(filePath).href)) as CommandModule;
  const command = mod.default;
  if (!command?.data || !command.execute) {
    console.warn(`Skipping invalid command module: ${filePath}`);
    return;
  }
  const name = command.data.name;
  if (commands.has(name)) {
    console.warn(`Duplicate command name "${name}" in ${filePath}`);
  }
  commands.set(name, command);
}

export async function loadCommands(
  client: Client,
  commands: Map<string, Command>,
): Promise<void> {
  const commandsDir = __dirname;
  const entries = await readdir(commandsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subdir = join(commandsDir, entry.name);
      const files = await readdir(subdir);
      for (const file of files) {
        if (isCommandModuleFile(file)) {
          await loadCommandFile(join(subdir, file), commands);
        }
      }
    } else if (
      isCommandModuleFile(entry.name) &&
      entry.name !== 'loader.ts' &&
      entry.name !== 'loader.js' &&
      entry.name !== 'types.ts' &&
      entry.name !== 'types.js'
    ) {
      await loadCommandFile(join(commandsDir, entry.name), commands);
    }
  }

  client.commands = commands;
  console.log(`Loaded ${commands.size} command(s)`);
}

declare module 'discord.js' {
  interface Client {
    commands: Map<string, Command>;
  }
}
