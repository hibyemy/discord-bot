import { ValidationError } from '../../contracts/errors.js';
import type { UserKey } from '../../contracts/services.js';
import {
  runGameFlow,
  type GameFlowResult,
  type GameResolution,
} from './base.game.js';

export type RouletteBetType = 'red' | 'black' | 'number';
export type RouletteColor = 'red' | 'black' | 'green';

export interface RouletteInput {
  betType: RouletteBetType;
  number?: number;
}

export interface RouletteDetails {
  betType: RouletteBetType;
  betNumber?: number;
  result: number;
  color: RouletteColor;
}

/** European roulette red pockets (0 is green). */
const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

const WHEEL_SIZE = 37;

function pocketColor(n: number): RouletteColor {
  if (n === 0) return 'green';
  return RED_NUMBERS.has(n) ? 'red' : 'black';
}

function spinWheel(): number {
  return Math.floor(Math.random() * WHEEL_SIZE);
}

function validateRouletteInput(input: RouletteInput): void {
  if (input.betType === 'red' || input.betType === 'black') {
    return;
  }

  if (input.betType !== 'number') {
    throw new ValidationError('Choose red, black, or a number (0–36).');
  }

  if (input.number === undefined || !Number.isInteger(input.number)) {
    throw new ValidationError('Provide a number from 0 to 36.');
  }

  if (input.number < 0 || input.number > 36) {
    throw new ValidationError('Number bets must be between 0 and 36.');
  }
}

function isWin(betType: RouletteBetType, betNumber: number | undefined, result: number): boolean {
  const color = pocketColor(result);

  if (betType === 'red') {
    return color === 'red';
  }

  if (betType === 'black') {
    return color === 'black';
  }

  return betNumber === result;
}

/** Red/black pays 1:1; straight number pays 35:1 (36× total return). */
function payoutMultiplier(betType: RouletteBetType, won: boolean): number {
  if (!won) return 0;
  return betType === 'number' ? 36 : 2;
}

export async function playRoulette(
  key: UserKey,
  bet: number,
  betType: RouletteBetType,
  number?: number,
): Promise<GameFlowResult<RouletteDetails>> {
  const input: RouletteInput = { betType, number };

  return runGameFlow({
    key,
    gameType: 'roulette',
    bet,
    input,
    validateInput: (_key, _bet, value) => {
      validateRouletteInput(value);
    },
    resolve: async (_key, amount, value): Promise<GameResolution<RouletteDetails>> => {
      const result = spinWheel();
      const color = pocketColor(result);
      const won = isWin(value.betType, value.number, result);
      const multiplier = payoutMultiplier(value.betType, won);
      const payout = Math.floor(amount * multiplier);

      return {
        won,
        payout,
        details: {
          betType: value.betType,
          betNumber: value.betType === 'number' ? value.number : undefined,
          result,
          color,
        },
      };
    },
  });
}
