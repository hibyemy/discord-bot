import { loadEnv } from './config/env.js';
import { createBot } from './bot.js';
import { disconnectDb } from './db.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const client = await createBot();

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down...`);
    client.destroy();
    await disconnectDb();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await client.login(env.DISCORD_TOKEN);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
