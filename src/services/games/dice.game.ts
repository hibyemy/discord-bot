import type { UserKey } from '../../contracts/services.js';
import { getGame } from '../../config/games.js';
import {
  runGameFlow,
  type GameFlowResult,
  type GameResolution,
} from './base.game.js';

export interface DiceDetails {
  playerRoll: number;
  botRoll: number;
  tie: boolean;
}

const diceConfig = getGame('dice')!;

function winMultiplier(): number {
  return 2 * (1 - diceConfig.houseEdge);
}

function rollD100(): number {
  return Math.floor(Math.random() * 100) + 1;
}

export async function playDice(
  key: UserKey,
  bet: number,
): Promise<GameFlowResult<DiceDetails>> {
  return runGameFlow({
    key,
    gameType: 'dice',
    bet,
    input: null,
    resolve: async (_key, amount): Promise<GameResolution<DiceDetails>> => {
      const playerRoll = rollD100();
      const botRoll = rollD100();
      const tie = playerRoll === botRoll;
      const won = playerRoll > botRoll;

      let payout = 0;
      if (tie) {
        payout = amount;
      } else if (won) {
        payout = Math.floor(amount * winMultiplier());
      }

      return {
        won,
        payout,
        details: { playerRoll, botRoll, tie },
      };
    },
  });
}
