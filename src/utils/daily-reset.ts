/** Milliseconds until the next midnight UTC (daily reward reset). */
export function msUntilUtcMidnight(now = new Date()): number {
  const nextMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  );
  return Math.max(0, nextMidnight - now.getTime());
}

/** Milliseconds until the next top-of-hour UTC (quest reset). */
export function msUntilNextUtcHour(now = new Date()): number {
  const next = new Date(now);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(next.getUTCHours() + 1);
  return Math.max(0, next.getTime() - now.getTime());
}

function formatCountdown(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function formatResetCountdown(now = new Date()): string {
  return formatCountdown(msUntilUtcMidnight(now));
}

export function formatNextUtcMidnightTimestamp(now = new Date()): string {
  const ms = msUntilUtcMidnight(now);
  const next = new Date(now.getTime() + ms);
  return `<t:${Math.floor(next.getTime() / 1000)}:R>`;
}

export function formatNextUtcHourTimestamp(now = new Date()): string {
  const ms = msUntilNextUtcHour(now);
  const next = new Date(now.getTime() + ms);
  return `<t:${Math.floor(next.getTime() / 1000)}:R>`;
}

export function dailyResetLine(now = new Date()): string {
  return `Daily reset in **${formatResetCountdown(now)}** (${formatNextUtcMidnightTimestamp(now)})`;
}

export function questResetLine(now = new Date()): string {
  return `Quests reset in **${formatCountdown(msUntilNextUtcHour(now))}** (${formatNextUtcHourTimestamp(now)})`;
}
