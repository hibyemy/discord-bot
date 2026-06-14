import type { Prisma } from '@prisma/client';
import { ValidationError, ActiveSessionError, NotFoundError } from '../../contracts/errors.js';
import type { UserKey } from '../../contracts/services.js';
import { getGame } from '../../config/games.js';
import { prisma } from '../../db.js';
import {
  deductBet,
  runGameFlow,
  validateBet,
  type GameFlowResult,
  type GameResolution,
} from './base.game.js';

const crashConfig = getGame('crash')!;

export interface CrashSessionState {
  status: 'active' | 'cashed_out' | 'crashed' | 'expired';
  crashPoint: number;
  crashTimeMs: number;
  startedAt: number;
  messageId?: string;
  channelId?: string;
}

export interface CrashDetails {
  crashPoint: number;
  cashOutMultiplier: number | null;
  outcome: 'cashout' | 'crash' | 'expired';
}

export type CrashFinalizeInput = {
  outcome: 'cashout' | 'crash' | 'expired';
  multiplier?: number;
  crashPoint: number;
};

export const CRASH_CASHOUT_PREFIX = 'crash:cashout:';
export const CRASH_QUIT_PREFIX = 'crash:quit:';

export function buildCrashCashoutId(sessionId: string): string {
  return `${CRASH_CASHOUT_PREFIX}${sessionId}`;
}

export function buildCrashQuitId(sessionId: string): string {
  return `${CRASH_QUIT_PREFIX}${sessionId}`;
}

export function parseCrashCashoutId(customId: string): string | null {
  if (!customId.startsWith(CRASH_CASHOUT_PREFIX)) {
    return null;
  }
  const sessionId = customId.slice(CRASH_CASHOUT_PREFIX.length);
  return sessionId.length > 0 ? sessionId : null;
}

export function parseCrashQuitId(customId: string): string | null {
  if (!customId.startsWith(CRASH_QUIT_PREFIX)) {
    return null;
  }
  const sessionId = customId.slice(CRASH_QUIT_PREFIX.length);
  return sessionId.length > 0 ? sessionId : null;
}

/** Generate crash point using ~4% house edge distribution. */
export function generateCrashPoint(): number {
  const houseEdge = crashConfig.houseEdge;
  const roll = Math.random();
  const raw = (1 - houseEdge) / (1 - roll);
  return Math.max(1, Math.floor(raw * 100) / 100);
}

/** Time until the multiplier reaches the crash point (capped by session timeout). */
export function computeCrashTimeMs(crashPoint: number): number {
  const minMs = 2_000;
  const scaledMs = Math.round((crashPoint - 1) * 4_000);
  return Math.min(crashConfig.sessionTimeoutMs, Math.max(minMs, scaledMs));
}

export function getCurrentMultiplier(state: CrashSessionState, now = Date.now()): number {
  const elapsed = now - state.startedAt;
  if (elapsed >= state.crashTimeMs) {
    return state.crashPoint;
  }
  const progress = elapsed / state.crashTimeMs;
  const multiplier = 1 + (state.crashPoint - 1) * progress;
  return Math.floor(multiplier * 100) / 100;
}

export function hasCrashed(state: CrashSessionState, now = Date.now()): boolean {
  return now - state.startedAt >= state.crashTimeMs;
}

function parseSessionState(raw: unknown): CrashSessionState {
  if (!raw || typeof raw !== 'object') {
    throw new ValidationError('Invalid crash session state.');
  }
  const state = raw as CrashSessionState;
  if (
    typeof state.crashPoint !== 'number' ||
    typeof state.crashTimeMs !== 'number' ||
    typeof state.startedAt !== 'number' ||
    typeof state.status !== 'string'
  ) {
    throw new ValidationError('Invalid crash session state.');
  }
  return state;
}

export async function getActiveCrashSession(key: UserKey) {
  return prisma.gameSession.findFirst({
    where: {
      discordId: key.discordId,
      guildId: key.guildId,
      gameType: 'crash',
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function startCrashSession(
  key: UserKey,
  bet: number,
): Promise<{ sessionId: string; state: CrashSessionState; bet: number }> {
  await validateBet(key, bet);

  const existing = await getActiveCrashSession(key);
  if (existing) {
    const existingState = parseSessionState(existing.state);
    if (existingState.status === 'active') {
      throw new ActiveSessionError('crash');
    }
  }

  await deductBet(key, bet, 'crash');

  const crashPoint = generateCrashPoint();
  const crashTimeMs = computeCrashTimeMs(crashPoint);
  const state: CrashSessionState = {
    status: 'active',
    crashPoint,
    crashTimeMs,
    startedAt: Date.now(),
  };

  const session = await prisma.gameSession.create({
    data: {
      discordId: key.discordId,
      guildId: key.guildId,
      gameType: 'crash',
      bet,
      state: state as unknown as Prisma.InputJsonValue,
      expiresAt: new Date(Date.now() + crashConfig.sessionTimeoutMs),
    },
  });

  return { sessionId: session.id, state, bet };
}

export async function loadCrashSession(sessionId: string, key: UserKey) {
  const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
  if (
    !session ||
    session.discordId !== key.discordId ||
    session.guildId !== key.guildId ||
    session.gameType !== 'crash'
  ) {
    throw new NotFoundError('Crash session');
  }
  if (session.expiresAt <= new Date()) {
    throw new ValidationError('This crash round has expired.');
  }
  return { session, state: parseSessionState(session.state) };
}

export async function attachCrashMessage(
  sessionId: string,
  key: UserKey,
  messageId: string,
  channelId: string,
): Promise<CrashSessionState> {
  const { session, state } = await loadCrashSession(sessionId, key);
  if (state.status !== 'active') {
    return state;
  }

  const updated: CrashSessionState = { ...state, messageId, channelId };
  await prisma.gameSession.update({
    where: { id: session.id },
    data: { state: updated as unknown as Prisma.InputJsonValue },
  });
  return updated;
}

async function markSessionEnded(
  sessionId: string,
  status: CrashSessionState['status'],
): Promise<void> {
  const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
  if (!session) return;

  const state = parseSessionState(session.state);
  await prisma.gameSession.update({
    where: { id: sessionId },
    data: { state: { ...state, status } as unknown as Prisma.InputJsonValue },
  });
  await prisma.gameSession.delete({ where: { id: sessionId } });
}

export async function finalizeCrashSession(
  key: UserKey,
  sessionId: string,
  input: CrashFinalizeInput,
): Promise<GameFlowResult<CrashDetails>> {
  const { session, state } = await loadCrashSession(sessionId, key);

  if (state.status !== 'active') {
    throw new ValidationError('This crash round is already finished.');
  }

  const now = Date.now();
  const crashed = hasCrashed(state, now);

  if (input.outcome === 'cashout') {
    if (crashed) {
      throw new ValidationError('Too late — the multiplier already crashed.');
    }
    const multiplier = input.multiplier ?? getCurrentMultiplier(state, now);
    if (multiplier >= state.crashPoint) {
      throw new ValidationError('Too late — the multiplier already crashed.');
    }

    const result = await runGameFlow({
      key,
      gameType: 'crash',
      bet: session.bet,
      betAlreadyDeducted: true,
      input: { outcome: 'cashout', multiplier, crashPoint: state.crashPoint },
      resolve: async (_k, amount, fin): Promise<GameResolution<CrashDetails>> => {
        const payout = Math.floor(amount * fin.multiplier!);
        return {
          won: true,
          payout,
          details: {
            crashPoint: fin.crashPoint,
            cashOutMultiplier: fin.multiplier!,
            outcome: 'cashout',
          },
        };
      },
    });

    await markSessionEnded(sessionId, 'cashed_out');
    return result;
  }

  const endStatus = input.outcome === 'expired' ? 'expired' : 'crashed';
  const result = await runGameFlow({
    key,
    gameType: 'crash',
    bet: session.bet,
    betAlreadyDeducted: true,
    input: { outcome: endStatus, crashPoint: state.crashPoint },
    resolve: async (_k, _amount, fin): Promise<GameResolution<CrashDetails>> => ({
      won: false,
      payout: 0,
      details: {
        crashPoint: fin.crashPoint,
        cashOutMultiplier: null,
        outcome: fin.outcome === 'expired' ? 'expired' : 'crash',
      },
    }),
  });

  await markSessionEnded(sessionId, endStatus);
  return result;
}

export async function tryAutoCrash(
  key: UserKey,
  sessionId: string,
): Promise<GameFlowResult<CrashDetails> | null> {
  const { state } = await loadCrashSession(sessionId, key);
  if (state.status !== 'active' || !hasCrashed(state)) {
    return null;
  }
  return finalizeCrashSession(key, sessionId, {
    outcome: 'crash',
    crashPoint: state.crashPoint,
  });
}
