export type CooldownMap = Record<string, string>;

export function parseCooldowns(raw: unknown): CooldownMap {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const result: CooldownMap = {};
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === 'string') {
        result[key] = value;
      }
    }
    return result;
  }
  return {};
}

export function getCooldownRemaining(
  cooldowns: CooldownMap,
  key: string,
  now = Date.now(),
): number {
  const expiresAt = cooldowns[key];
  if (!expiresAt) return 0;
  const remaining = new Date(expiresAt).getTime() - now;
  return Math.max(0, remaining);
}

export function isOnCooldown(
  cooldowns: CooldownMap,
  key: string,
  now = Date.now(),
): boolean {
  return getCooldownRemaining(cooldowns, key, now) > 0;
}

export function setCooldown(
  cooldowns: CooldownMap,
  key: string,
  durationMs: number,
  now = Date.now(),
): CooldownMap {
  return {
    ...cooldowns,
    [key]: new Date(now + durationMs).toISOString(),
  };
}

export function formatCooldown(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  if (minutes < 60) return rem > 0 ? `${minutes}m ${rem}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return remMin > 0 ? `${hours}h ${remMin}m` : `${hours}h`;
}

export function applyCooldownReduction(
  baseMs: number,
  reductionFraction: number,
  maxReduction = 0.3,
): number {
  const clamped = Math.min(Math.max(reductionFraction, 0), maxReduction);
  return Math.floor(baseMs * (1 - clamped));
}
