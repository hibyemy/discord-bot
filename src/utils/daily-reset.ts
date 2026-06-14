/** Milliseconds until the next midnight UTC (daily reward + quest reset). */
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

export function formatResetCountdown(now = new Date()): string {
  const ms = msUntilUtcMidnight(now);
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function formatNextUtcMidnightTimestamp(now = new Date()): string {
  const ms = msUntilUtcMidnight(now);
  const next = new Date(now.getTime() + ms);
  return `<t:${Math.floor(next.getTime() / 1000)}:R>`;
}

export function dailyResetLine(now = new Date()): string {
  return `Daily & quests reset in **${formatResetCountdown(now)}** (${formatNextUtcMidnightTimestamp(now)})`;
}
