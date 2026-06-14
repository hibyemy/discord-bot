import { registerSlashCommands } from '../bot.js';

const guildId = process.argv[2];

registerSlashCommands(guildId)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
