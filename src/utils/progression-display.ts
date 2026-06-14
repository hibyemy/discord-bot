import { gamesConfig, type GameDefinition } from '../config/games.js';
import { formatRankTier, getRankTierForLevel } from '../config/ranks.js';
import { formatCoins, progressBar } from './embeds.js';

export function countUnlockedGames(level: number): number {
  return gamesConfig.games.filter((g) => g.unlockLevel <= level).length;
}

export function getNextLockedGame(level: number): GameDefinition | null {
  return gamesConfig.games.find((g) => g.unlockLevel > level) ?? null;
}

/** One-line summary for the main /menu hub. */
export function buildHubProgressLine(level: number): string {
  const rank = getRankTierForLevel(level);
  const unlocked = countUnlockedGames(level);
  const total = gamesConfig.games.length;
  const nextGame = getNextLockedGame(level);

  let tail: string;
  if (nextGame) {
    const away = nextGame.unlockLevel - level;
    tail =
      away === 1
        ? `Next: **${nextGame.name}** (1 level)`
        : `Next: **${nextGame.name}** (Lv ${nextGame.unlockLevel})`;
  } else {
    tail = 'All games unlocked — climb ranks & max bets';
  }

  return `${formatRankTier(rank.current)} · **Lv ${level}** · ${unlocked}/${total} games · ${tail}`;
}

export interface XpProgressSlice {
  current: number;
  required: number;
  percent: number;
}

/** Rich progression block for the casino hub embed. */
export function buildCasinoProgressBlock(
  level: number,
  xp: XpProgressSlice,
  maxBet: number,
): string[] {
  const rank = getRankTierForLevel(level);
  const unlocked = countUnlockedGames(level);
  const total = gamesConfig.games.length;
  const nextGame = getNextLockedGame(level);

  const lines = [
    `**${formatRankTier(rank.current)}** · Level **${level}**`,
    `XP ${progressBar(xp.current, xp.required)} **${xp.current}** / **${xp.required}** (${xp.percent}%)`,
  ];

  if (rank.next) {
    lines.push(
      `Rank up to **${formatRankTier(rank.next)}** in **${rank.levelsToNext}** level(s) — titles go up to **Lv 100**`,
    );
  } else {
    lines.push('**Max rank** — you are at the top title. Keep playing for wealth & records.');
  }

  lines.push(`**Casino access:** ${unlocked}/${total} games · **Max bet:** ${formatCoins(maxBet)}`);

  if (nextGame) {
    const away = nextGame.unlockLevel - level;
    lines.push(
      away === 1
        ? `🔓 **${nextGame.name}** unlocks on your **next level**`
        : `🔓 **${nextGame.name}** unlocks at level **${nextGame.unlockLevel}** (${away} levels away)`,
    );
  } else {
    lines.push('✅ **Full casino unlocked** — mastery is max bet, rank & net worth.');
  }

  lines.push('_Tip: work, daily, quests & games all grant XP._');

  return lines;
}
