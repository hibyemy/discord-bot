import { economyConfig } from '../config/economy.js';
import { prisma } from '../db.js';
import { economyService, shopService } from '../services/index.js';

/**
 * Applies daily bank interest for all users with a positive bank balance.
 * Wave 4 scheduler calls this on the daily cron.
 */
export async function runBankInterest(): Promise<number> {
  const users = await prisma.user.findMany({
    where: { bank: { gt: 0 } },
    select: { discordId: true, guildId: true, bank: true },
  });

  let credited = 0;

  for (const user of users) {
    const key = { discordId: user.discordId, guildId: user.guildId };
    const multipliers = await shopService.getActiveMultipliers(key);
    const rate = economyConfig.bankInterestBaseRate + multipliers.bankInterest;
    const interest = Math.floor(user.bank * rate);

    if (interest <= 0) continue;

    await economyService.transfer(key, {
      amount: interest,
      source: 'bank_interest',
      toBank: true,
      metadata: { rate, baseBank: user.bank },
    });
    credited += 1;
  }

  return credited;
}
