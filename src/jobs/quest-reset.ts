import { questConfig } from '../config/quests.js';
import { questService } from '../services/quest.service.js';

/** Cron schedule for hourly quest reset (top of each hour UTC). */
export const questResetCron = questConfig.resetCron;

/** Timezone for quest reset scheduling. */
export const questResetTimezone = questConfig.resetTimezone;

/**
 * Deletes quest progress older than the previous hour (UTC).
 * Wave 4 scheduler calls this on `questResetCron`.
 */
export async function runQuestReset(): Promise<number> {
  return questService.resetAllDaily();
}
