import { ActivityType, Events, type Client } from 'discord.js';
import { startScheduler } from '../jobs/scheduler.js';

export function registerReadyEvent(client: Client): void {
  client.once(Events.ClientReady, (readyClient) => {
    console.log(`Logged in as ${readyClient.user.tag}`);
    readyClient.user.setActivity('fake currency', { type: ActivityType.Watching });
    startScheduler();
  });
}
