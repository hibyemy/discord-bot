export type GameId =
  | 'coinflip'
  | 'dice'
  | 'slots'
  | 'roulette'
  | 'blackjack'
  | 'crash';

export interface GameDefinition {
  id: GameId;
  name: string;
  unlockLevel: number;
  houseEdge: number;
  description: string;
  interactive: boolean;
  sessionTimeoutMs: number;
}

export const gamesConfig = {
  sessionTimeoutMs: 60_000,

  games: [
    {
      id: 'coinflip',
      name: 'Coinflip',
      unlockLevel: 1,
      houseEdge: 0.02,
      description: '50/50 pick — fast flips, steady XP.',
      interactive: false,
      sessionTimeoutMs: 0,
    },
    {
      id: 'dice',
      name: 'Dice',
      unlockLevel: 1,
      houseEdge: 0.03,
      description: 'Roll 1–100 vs the bot — beat the house.',
      interactive: false,
      sessionTimeoutMs: 0,
    },
    {
      id: 'slots',
      name: 'Slots',
      unlockLevel: 2,
      houseEdge: 0.05,
      description: '3-reel spins — chase triples & cherry pairs.',
      interactive: false,
      sessionTimeoutMs: 0,
    },
    {
      id: 'roulette',
      name: 'Roulette',
      unlockLevel: 3,
      houseEdge: 0.027,
      description: 'Red, black, or pick a number — classic table odds.',
      interactive: false,
      sessionTimeoutMs: 0,
    },
    {
      id: 'blackjack',
      name: 'Blackjack',
      unlockLevel: 5,
      houseEdge: 0.01,
      description: 'Hit, stand, or double — 3:2 blackjack, dealer stands on 17.',
      interactive: true,
      sessionTimeoutMs: 60_000,
    },
    {
      id: 'crash',
      name: 'Crash',
      unlockLevel: 8,
      houseEdge: 0.04,
      description: 'Ride the multiplier — cash out before the crash (5% bonus: 100x–500x).',
      interactive: true,
      sessionTimeoutMs: 60_000,
    },
  ] satisfies GameDefinition[],
} as const;

export function getGame(id: GameId): GameDefinition | undefined {
  return gamesConfig.games.find((g) => g.id === id);
}

export function getUnlockedGames(level: number): GameDefinition[] {
  return gamesConfig.games.filter((g) => g.unlockLevel <= level);
}
