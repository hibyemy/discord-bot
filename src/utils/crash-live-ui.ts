/** How often live crash embeds refresh (Discord PATCH). Avoid sub-second polling. */
export const CRASH_UI_TICK_MS = 2_500;

/** Bucket remaining time so we do not edit every tick when only ms change. */
export function crashDisplaySnapshot(multiplier: number, remainingMs: number): string {
  const bucketSec = Math.ceil(Math.max(0, remainingMs) / 5_000);
  return `${multiplier.toFixed(2)}:${bucketSec}`;
}

export function shouldRefreshCrashDisplay(
  lastSnapshot: string | null,
  multiplier: number,
  remainingMs: number,
): { refresh: boolean; snapshot: string } {
  const snapshot = crashDisplaySnapshot(multiplier, remainingMs);
  return { refresh: snapshot !== lastSnapshot, snapshot };
}
