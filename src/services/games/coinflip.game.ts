import { ValidationError } from '../../contracts/errors.js';
import type { UserKey } from '../../contracts/services.js';
import { getGame } from '../../config/games.js';
import {
  runGameFlow,
  type GameFlowResult,
  type GameResolution,
} from './base.game.js';

export type CoinflipChoice = 'heads' | 'tails';

export interface CoinflipDetails {
  choice: CoinflipChoice;
  flip: CoinflipChoice;
}

const coinflipConfig = getGame('coinflip')!;

function winMultiplier(): number {
  return 2 * (1 - coinflipConfig.houseEdge);
}

function normalizeChoice(raw: string): CoinflipChoice {
  const value = raw.toLowerCase();
  if (value === 'heads' || value === 'tails') {
    return value;
  }
  throw new ValidationError('Choose heads or tails.');
}

export async function playCoinflip(
  key: UserKey,
  bet: number,
  choice: string,
): Promise<GameFlowResult<CoinflipDetails>> {
  const side = normalizeChoice(choice);

  return runGameFlow({
    key,
    gameType: 'coinflip',
    bet,
    input: side,
    validateInput: (_key, _bet, input) => {
      if (input !== 'heads' && input !== 'tails') {
        throw new ValidationError('Choose heads or tails.');
      }
    },
    resolve: async (_key, amount, input): Promise<GameResolution<CoinflipDetails>> => {
      const flip: CoinflipChoice = Math.random() < 0.5 ? 'heads' : 'tails';
      const won = flip === input;
      const payout = won ? Math.floor(amount * winMultiplier()) : 0;

      return {
        won,
        payout,
        details: { choice: input, flip },
      };
    },
  });
}
