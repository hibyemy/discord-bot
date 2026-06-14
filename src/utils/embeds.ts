import {
  EmbedBuilder,
  type ColorResolvable,
  type User as DiscordUser,
} from 'discord.js';
import { economyConfig } from '../config/economy.js';
import { formatRankTier, getRankTierForLevel } from '../config/ranks.js';

export const embedColors = {
  success: 0x57f287 as ColorResolvable,
  error: 0xed4245 as ColorResolvable,
  warning: 0xfee75c as ColorResolvable,
  info: 0x5865f2 as ColorResolvable,
  economy: 0xf1c40f as ColorResolvable,
  game: 0x9b59b6 as ColorResolvable,
} as const;

export function successEmbed(title: string, description?: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(embedColors.success)
    .setTitle(title);
  if (description) embed.setDescription(description);
  return embed;
}

export function errorEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(embedColors.error)
    .setTitle('Error')
    .setDescription(message);
}

export function infoEmbed(title: string, description?: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(embedColors.info)
    .setTitle(title);
  if (description) embed.setDescription(description);
  return embed;
}

export function formatCoins(amount: number): string {
  return `${amount.toLocaleString()} ${economyConfig.currencyName}`;
}

export function progressBar(current: number, max: number, length = 10): string {
  if (max <= 0) return '▱'.repeat(length);
  const filled = Math.min(length, Math.round((current / max) * length));
  return '▰'.repeat(filled) + '▱'.repeat(length - filled);
}

export function profileEmbed(
  user: DiscordUser,
  data: {
    level: number;
    xp: number;
    xpRequired: number;
    wallet: number;
    bank: number;
    activeJob?: string | null;
    dailyStreak?: number;
    badges?: string[];
  },
): EmbedBuilder {
  const tier = getRankTierForLevel(data.level);
  const embed = new EmbedBuilder()
    .setColor(embedColors.info)
    .setTitle(`${user.displayName}'s Profile`)
    .setThumbnail(user.displayAvatarURL())
    .addFields(
      {
        name: 'Rank',
        value: formatRankTier(tier.current),
        inline: true,
      },
      {
        name: 'Level',
        value: `${data.level} (${progressBar(data.xp, data.xpRequired)} ${data.xp}/${data.xpRequired} XP)`,
        inline: false,
      },
      {
        name: 'Wallet',
        value: formatCoins(data.wallet),
        inline: true,
      },
      {
        name: 'Bank',
        value: formatCoins(data.bank),
        inline: true,
      },
      {
        name: 'Net Worth',
        value: formatCoins(data.wallet + data.bank),
        inline: true,
      },
    );

  if (data.activeJob) {
    embed.addFields({ name: 'Job', value: data.activeJob, inline: true });
  }
  if (data.dailyStreak !== undefined) {
    embed.addFields({ name: 'Daily Streak', value: `${data.dailyStreak} days`, inline: true });
  }
  if (data.badges && data.badges.length > 0) {
    embed.addFields({ name: 'Badges', value: data.badges.join(' • '), inline: false });
  }

  return embed;
}
