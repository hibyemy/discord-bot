import type { Client } from 'discord.js';

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { label: string; expiresAt: number }>();

function cacheKey(guildId: string, discordId: string): string {
  return `${guildId}:${discordId}`;
}

/** Resolve a guild member mention/display name with a short TTL cache to limit Discord API calls. */
export async function resolveMemberLabel(
  client: Client,
  guildId: string,
  discordId: string,
): Promise<string> {
  const key = cacheKey(guildId, discordId);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.label;
  }

  let label = `<@${discordId}>`;
  try {
    const guild = client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId));
    const member = await guild.members.fetch(discordId).catch(() => null);
    if (member) {
      label = member.displayName;
    } else {
      const user = await client.users.fetch(discordId);
      label = user.displayName;
    }
  } catch {
    // keep fallback mention-style label
  }

  cache.set(key, { label, expiresAt: Date.now() + TTL_MS });
  return label;
}

/** Cached @mention string for announcements. */
export async function resolveMemberMention(
  client: Client,
  guildId: string,
  discordId: string,
): Promise<string> {
  const key = `mention:${guildId}:${discordId}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.label;
  }

  let label = `<@${discordId}>`;
  try {
    const guild = client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId));
    const member = await guild.members.fetch(discordId).catch(() => null);
    if (member) {
      label = member.toString();
    }
  } catch {
    // keep fallback
  }

  cache.set(key, { label, expiresAt: Date.now() + TTL_MS });
  return label;
}
