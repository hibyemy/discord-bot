import {
  EmbedBuilder,
  type Client,
  type GuildTextBasedChannel,
} from 'discord.js';
import { guildConfigService } from '../services/index.js';
import { embedColors, formatCoins } from './embeds.js';

/** Minimum single-win profit to post a public announcement. */
export const ANNOUNCE_BIG_WIN_MIN_PROFIT = 5_000;

/** Minimum payout to announce when profit alone would not qualify. */
export const ANNOUNCE_BIG_WIN_MIN_PAYOUT = 10_000;

export function isBigWin(profit: number, payout: number): boolean {
  return (
    profit >= ANNOUNCE_BIG_WIN_MIN_PROFIT || payout >= ANNOUNCE_BIG_WIN_MIN_PAYOUT
  );
}

async function getAnnounceChannel(
  client: Client,
  guildId: string,
): Promise<GuildTextBasedChannel | null> {
  const config = await guildConfigService.getConfig(guildId);
  if (!config.announceChannelId) return null;

  const channel = await client.channels.fetch(config.announceChannelId).catch(() => null);
  if (!channel?.isTextBased()) return null;

  return channel as GuildTextBasedChannel;
}

async function resolveUserLabel(
  client: Client,
  guildId: string,
  discordId: string,
): Promise<string> {
  try {
    const guild = client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId));
    const member = await guild.members.fetch(discordId).catch(() => null);
    if (member) return member.toString();

    const user = await client.users.fetch(discordId);
    return user.toString();
  } catch {
    return `<@${discordId}>`;
  }
}

export async function announceBigWin(
  client: Client,
  guildId: string,
  discordId: string,
  gameType: string,
  bet: number,
  payout: number,
  profit: number,
): Promise<boolean> {
  if (!isBigWin(profit, payout)) return false;

  const channel = await getAnnounceChannel(client, guildId);
  if (!channel) return false;

  const userLabel = await resolveUserLabel(client, guildId, discordId);
  const embed = new EmbedBuilder()
    .setColor(embedColors.game)
    .setTitle('Big Win!')
    .setDescription(`${userLabel} hit a massive win on **${gameType}**!`)
    .addFields(
      { name: 'Bet', value: formatCoins(bet), inline: true },
      { name: 'Payout', value: formatCoins(payout), inline: true },
      { name: 'Profit', value: formatCoins(profit), inline: true },
    )
    .setTimestamp();

  await channel.send({ embeds: [embed] });
  return true;
}

export async function announceLevelUp(
  client: Client,
  guildId: string,
  discordId: string,
  previousLevel: number,
  newLevel: number,
): Promise<boolean> {
  if (newLevel <= previousLevel) return false;

  const channel = await getAnnounceChannel(client, guildId);
  if (!channel) return false;

  const userLabel = await resolveUserLabel(client, guildId, discordId);
  const embed = new EmbedBuilder()
    .setColor(embedColors.success)
    .setTitle('Level Up!')
    .setDescription(`${userLabel} reached **Level ${newLevel}**!`)
    .addFields({
      name: 'Progress',
      value: `Level ${previousLevel} → **${newLevel}**`,
      inline: false,
    })
    .setTimestamp();

  await channel.send({ embeds: [embed] });
  return true;
}
