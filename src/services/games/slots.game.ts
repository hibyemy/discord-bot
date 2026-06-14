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
  tripleMultiplier: number;
}

export const SLOT_SYMBOLS: readonly SlotSymbol[] = [
  { id: 'cherry', emoji: '🍒', label: 'Cherry', tripleMultiplier: 2 },
  { id: 'lemon', emoji: '🍋', label: 'Lemon', tripleMultiplier: 3 },
  { id: 'orange', emoji: '🍊', label: 'Orange', tripleMultiplier: 5 },
  { id: 'grape', emoji: '🍇', label: 'Grape', tripleMultiplier: 8 },
  { id: 'bell', emoji: '🔔', label: 'Bell', tripleMultiplier: 15 },
  { id: 'seven', emoji: '7️⃣', label: 'Seven', tripleMultiplier: 25 },
  { id: 'diamond', emoji: '💎', label: 'Diamond', tripleMultiplier: 50 },
] as const;

export type SlotsWinType = 'triple' | 'pair' | 'none';

export interface SlotsDetails {
  reels: SlotSymbol[];
  winType: SlotsWinType;
  multiplier: number;
}

const slotsConfig = getGame('slots')!;

/** Weighted outcomes — tuned for ~95% RTP at 5% house edge (see `expectedRtp`). */
const SLOT_OUTCOMES = [
  { kind: 'loss' as const, weight: 580, multiplier: 0 },
  { kind: 'pair' as const, weight: 240, multiplier: 1.6 },
  { kind: 'triple' as const, weight: 85, symbolId: 'cherry', multiplier: 2 },
  { kind: 'triple' as const, weight: 42, symbolId: 'lemon', multiplier: 3 },
  { kind: 'triple' as const, weight: 24, symbolId: 'orange', multiplier: 5 },
  { kind: 'triple' as const, weight: 12, symbolId: 'grape', multiplier: 8 },
  { kind: 'triple' as const, weight: 4, symbolId: 'bell', multiplier: 15 },
  { kind: 'triple' as const, weight: 1, symbolId: 'diamond', multiplier: 50 },
] as const;

type SlotOutcome = (typeof SLOT_OUTCOMES)[number];

const OUTCOME_TOTAL_WEIGHT = SLOT_OUTCOMES.reduce((sum, row) => sum + row.weight, 0);

const NON_CHERRY = SLOT_SYMBOLS.filter((symbol) => symbol.id !== 'cherry');

function symbolById(id: string): SlotSymbol {
  return SLOT_SYMBOLS.find((symbol) => symbol.id === id) ?? SLOT_SYMBOLS[0]!;
}

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function reelsWouldWin(reels: SlotSymbol[]): boolean {
  const left = reels[0]!;
  const middle = reels[1]!;
  const right = reels[2]!;

  if (left.id === middle.id && middle.id === right.id) {
    return true;
  }

  const cherryCount = reels.filter((reel) => reel.id === 'cherry').length;
  return cherryCount >= 2;
}

function rollOutcome(): SlotOutcome {
  let roll = Math.random() * OUTCOME_TOTAL_WEIGHT;
  for (const outcome of SLOT_OUTCOMES) {
    roll -= outcome.weight;
    if (roll <= 0) {
      return outcome;
    }
  }
  return SLOT_OUTCOMES[0]!;
}

function buildReelsForOutcome(outcome: SlotOutcome): SlotSymbol[] {
  if (outcome.kind === 'triple' && 'symbolId' in outcome && outcome.symbolId) {
    const symbol = symbolById(outcome.symbolId);
    return [symbol, symbol, symbol];
  }

  if (outcome.kind === 'pair') {
    const cherry = symbolById('cherry');
    let third = pickRandom(NON_CHERRY);
    while (third.id === cherry.id) {
      third = pickRandom(NON_CHERRY);
    }
    const slots = [cherry, cherry, third];
    if (Math.random() < 0.5) {
      [slots[0], slots[2]] = [slots[2]!, slots[0]!];
    }
    return slots;
  }

  for (let attempt = 0; attempt < 32; attempt += 1) {
    const reels = [pickRandom(SLOT_SYMBOLS), pickRandom(SLOT_SYMBOLS), pickRandom(SLOT_SYMBOLS)];
    if (!reelsWouldWin(reels)) {
      return reels;
    }
  }

  return [symbolById('lemon'), symbolById('orange'), symbolById('grape')];
}

export function formatSlotsMachine(reels: ReadonlyArray<Pick<SlotSymbol, 'emoji'>>): string {
  const cells = reels.map((reel) => ` ${reel.emoji} `).join('┃');
  return ['```', '╔═══╦═══╦═══╗', `║${cells}║`, '╚═══╩═══╩═══╝', '```'].join('\n');
}

export function formatPayoutTable(): string {
  const edgeFactor = 1 - slotsConfig.houseEdge;
  const tripleLines = SLOT_SYMBOLS.map(
    (symbol) =>
      `${symbol.emoji}${symbol.emoji}${symbol.emoji} → ${(symbol.tripleMultiplier * edgeFactor).toFixed(2)}x`,
  );
  return [
    ...tripleLines,
    `🍒🍒 — → ${(1.6 * edgeFactor).toFixed(2)}x (any third symbol)`,
    '',
    '_Odds are outcome-weighted (~95% return over time)._',
  ].join('\n');
}

/** Dev helper — expected return per coin wagered before flooring. */
export function expectedSlotsRtp(): number {
  const edgeFactor = 1 - slotsConfig.houseEdge;
  let ev = 0;
  for (const outcome of SLOT_OUTCOMES) {
    ev += (outcome.weight / OUTCOME_TOTAL_WEIGHT) * outcome.multiplier * edgeFactor;
  }
  return ev;
}

function resolveFromOutcome(
  outcome: SlotOutcome,
  reels: SlotSymbol[],
  bet: number,
): { payout: number; won: boolean; winType: SlotsWinType; multiplier: number } {
  if (outcome.kind === 'loss') {
    return { payout: 0, won: false, winType: 'none', multiplier: 0 };
  }

  const edgeFactor = 1 - slotsConfig.houseEdge;
  const payout = Math.floor(bet * outcome.multiplier * edgeFactor);

  if (outcome.kind === 'pair') {
    return {
      payout,
      won: payout > bet,
      winType: 'pair',
      multiplier: outcome.multiplier,
    };
  }

  return {
    payout,
    won: payout > bet,
    winType: 'triple',
    multiplier: outcome.multiplier,
  };
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
      const outcome = rollOutcome();
      const reels = buildReelsForOutcome(outcome);
      const result = resolveFromOutcome(outcome, reels, bet);

      return {
        won: result.won,
        payout: result.payout,
        details: {
          reels,
          winType: result.winType,
          multiplier: result.multiplier,
        },
      };
    },
  });
}
