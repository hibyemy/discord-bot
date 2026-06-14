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
      description: 'Bet on heads or tails. ~2% house edge.',
      interactive: false,
      sessionTimeoutMs: 0,
    },
    {
      id: 'dice',
      name: 'Dice',
      unlockLevel: 3,
      houseEdge: 0.03,
      description: 'Roll 1–100 vs the bot. ~3% house edge.',
      interactive: false,
      sessionTimeoutMs: 0,
    },
    {
      id: 'slots',
      name: 'Slots',
      unlockLevel: 5,
      houseEdge: 0.05,
      description: '3-reel slot machine. ~5% house edge.',
      interactive: false,
      sessionTimeoutMs: 0,
    },
    {
      id: 'roulette',
      name: 'Roulette',
      unlockLevel: 10,
      houseEdge: 0.027,
      description: 'Bet on red, black, or a number. ~2.7% house edge.',
      interactive: false,
      sessionTimeoutMs: 0,
    },
    {
      id: 'blackjack',
      name: 'Blackjack',
      unlockLevel: 15,
      houseEdge: 0.01,
      description: 'Beat the dealer with hit/stand/double buttons. ~1% house edge.',
      interactive: true,
      sessionTimeoutMs: 60_000,
    },
    {
      id: 'crash',
      name: 'Crash',
      unlockLevel: 25,
      houseEdge: 0.04,
      description: 'Cash out before the multiplier crashes. ~4% house edge.',
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
