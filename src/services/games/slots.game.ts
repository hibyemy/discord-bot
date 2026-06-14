import type { UserKey } from '../../contracts/services.js';
import { getGame } from '../../config/games.js';
import {
  runGameFlow,
  type GameFlowResult,
  type GameResolution,
} from './base.game.js';

export interface SlotSymbol {
  id: string;
  emoji: string;
  label: string;
  weight: number;
  tripleMultiplier: number;
}

export const SLOT_SYMBOLS: readonly SlotSymbol[] = [
  { id: 'cherry', emoji: '🍒', label: 'Cherry', weight: 28, tripleMultiplier: 2 },
  { id: 'lemon', emoji: '🍋', label: 'Lemon', weight: 24, tripleMultiplier: 3 },
  { id: 'orange', emoji: '🍊', label: 'Orange', weight: 20, tripleMultiplier: 5 },
  { id: 'grape', emoji: '🍇', label: 'Grape', weight: 14, tripleMultiplier: 8 },
  { id: 'bell', emoji: '🔔', label: 'Bell', weight: 9, tripleMultiplier: 15 },
  { id: 'seven', emoji: '7️⃣', label: 'Seven', weight: 4, tripleMultiplier: 25 },
  { id: 'diamond', emoji: '💎', label: 'Diamond', weight: 1, tripleMultiplier: 50 },
] as const;

export type SlotsWinType = 'triple' | 'pair' | 'none';

export interface SlotsDetails {
  reels: SlotSymbol[];
  winType: SlotsWinType;
  multiplier: number;
}

const slotsConfig = getGame('slots')!;

const TOTAL_WEIGHT = SLOT_SYMBOLS.reduce((sum, symbol) => sum + symbol.weight, 0);

const PAIR_CHERRY_MULTIPLIER = 1;

export function formatSlotsMachine(reels: ReadonlyArray<Pick<SlotSymbol, 'emoji'>>): string {
  const cells = reels.map((reel) => ` ${reel.emoji} `).join('┃');
  return ['```', '╔═══╦═══╦═══╗', `║${cells}║`, '╚═══╩═══╩═══╝', '```'].join('\n');
}

export function formatPayoutTable(): string {
  const edgeFactor = 1 - slotsConfig.houseEdge;
  const tripleLines = SLOT_SYMBOLS.map(
    (symbol) =>
      `${symbol.emoji} ${symbol.emoji} ${symbol.emoji} → ${symbol.tripleMultiplier * edgeFactor}x`,
  );
  return [
    ...tripleLines,
    `🍒 🍒 — → ${PAIR_CHERRY_MULTIPLIER * edgeFactor}x (any third symbol)`,
  ].join('\n');
}

function spinReel(): SlotSymbol {
  let roll = Math.random() * TOTAL_WEIGHT;
  for (const symbol of SLOT_SYMBOLS) {
    roll -= symbol.weight;
    if (roll <= 0) {
      return symbol;
    }
  }
  return SLOT_SYMBOLS[SLOT_SYMBOLS.length - 1]!;
}

function resolvePayout(
  reels: SlotSymbol[],
  bet: number,
): { payout: number; won: boolean; winType: SlotsWinType; multiplier: number } {
  const edgeFactor = 1 - slotsConfig.houseEdge;
  const left = reels[0]!;
  const middle = reels[1]!;
  const right = reels[2]!;

  if (left.id === middle.id && middle.id === right.id) {
    const multiplier = left.tripleMultiplier * edgeFactor;
    const payout = Math.floor(bet * multiplier);
    return { payout, won: payout > bet, winType: 'triple', multiplier: left.tripleMultiplier };
  }

  const cherryCount = reels.filter((reel) => reel.id === 'cherry').length;
  if (cherryCount === 2) {
    const multiplier = PAIR_CHERRY_MULTIPLIER * edgeFactor;
    const payout = Math.floor(bet * multiplier);
    return { payout, won: payout > bet, winType: 'pair', multiplier: PAIR_CHERRY_MULTIPLIER };
  }

  return { payout: 0, won: false, winType: 'none', multiplier: 0 };
}

export async function playSlots(
  key: UserKey,
  bet: number,
): Promise<GameFlowResult<SlotsDetails>> {
  return runGameFlow({
    key,
    gameType: 'slots',
    bet,
    input: null,
    resolve: async (): Promise<GameResolution<SlotsDetails>> => {
      const reels = [spinReel(), spinReel(), spinReel()];
      const outcome = resolvePayout(reels, bet);

      return {
        won: outcome.won,
        payout: outcome.payout,
        details: {
          reels,
          winType: outcome.winType,
          multiplier: outcome.multiplier,
        },
      };
    },
  });
}
