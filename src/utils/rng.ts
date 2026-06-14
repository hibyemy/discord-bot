/** Inclusive random integer between min and max */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Random float in [min, max) */
export function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/** Returns true with given probability (0–1) */
export function chance(probability: number): boolean {
  return Math.random() < probability;
}

/** Pick random element from array */
export function pickRandom<T>(items: readonly T[]): T {
  const item = items[Math.floor(Math.random() * items.length)];
  if (item === undefined) {
    throw new Error('Cannot pick from empty array');
  }
  return item;
}

/** Shuffle array (Fisher-Yates), returns new array */
export function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = result[i]!;
    result[i] = result[j]!;
    result[j] = tmp;
  }
  return result;
}

/** Weighted random pick */
export function weightedPick<T extends { weight: number }>(items: readonly T[]): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  const last = items[items.length - 1];
  if (last === undefined) {
    throw new Error('Cannot pick from empty weighted array');
  }
  return last;
}
