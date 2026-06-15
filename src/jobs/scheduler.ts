import cron from 'node-cron';
import { questResetCron, questResetTimezone, runQuestReset } from './quest-reset.js';
import { runBankInterest } from './bank-interest.js';

const bankInterestCron = '0 0 * * *';

/**
 * Starts background cron jobs for quest reset and bank interest.
 * Call once after the bot is ready.
 */
export function startScheduler(): void {
  cron.schedule(
    questResetCron,
    () => {
      void runQuestReset()
        .then((count) => console.log(`Quest reset: pruned ${count} stale row(s)`))
        .catch((err) => console.error('Quest reset failed:', err));
    },
    { timezone: questResetTimezone },
  );

  cron.schedule(
    bankInterestCron,
    () => {
      void runBankInterest()
        .then((count) => console.log(`Bank interest: credited ${count} user(s)`))
        .catch((err) => console.error('Bank interest failed:', err));
    },
    { timezone: questResetTimezone },
  );

  console.log('Scheduler started (hourly quest reset + bank interest midnight UTC)');
}
