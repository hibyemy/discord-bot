import type { GameStats, User } from '@prisma/client';
import type { EventBus } from '../../contracts/events.js';
import { eventBus as globalEventBus } from '../../events/bus.js';
import { emitLevelUpEvents } from '../../events/hooks.js';
import { ValidationError } from '../../contracts/errors.js';
import type { UserKey } from '../../contracts/services.js';
import { economyConfig } from '../../config/economy.js';
import type { GameId } from '../../config/games.js';
import { prisma } from '../../db.js';
import { economyService } from '../economy.service.js';
import { progressionService } from '../progression.service.js';

/** Outcome from a game's `resolve` step (before wallet credit). */
export interface GameResolution<TDetails = Record<string, unknown>> {
  won: boolean;
  /** Total coins returned to the player's wallet (0 on a full loss). */
  payout: number;
  details?: TDetails;
}

/** Result returned to commands after the full bet flow. */
export interface GameFlowResult<TDetails = Record<string, unknown>> {
  won: boolean;
  bet: number;
  payout: number;
  profit: number;
  xpAwarded: number;
  user: User;
  details?: TDetails;
}

export interface GameFlowOptions<TInput, TDetails = Record<string, unknown>> {
  key: UserKey;
  gameType: GameId;
  bet: number;
  input: TInput;
  /** Game-specific validation (choice, side bet, session state, etc.). */
  validateInput?: (key: UserKey, bet: number, input: TInput) => Promise<void> | void;
  resolve: (key: UserKey, bet: number, input: TInput) => Promise<GameResolution<TDetails>>;
  /** Interactive games deduct at session start; set true when resolving the final outcome. */
  betAlreadyDeducted?: boolean;
  eventBus?: EventBus;
}

/**
 * Contract for per-game implementations. Games supply `validate` + `resolve`;
 * shared wallet / XP / stats steps live in `runGameFlow()`.
 */
export interface BaseGame<TInput = unknown, TDetails = Record<string, unknown>> {
  readonly gameType: GameId;
  validate(key: UserKey, bet: number, input: TInput): Promise<void>;
  resolve(key: UserKey, bet: number, input: TInput): Promise<GameResolution<TDetails>>;
}

/** Validate bet amount against economy rules (min, max, balance). */
export async function validateBet(key: UserKey, bet: number): Promise<void> {
  const result = await economyService.validateBet(key, bet);
  if (!result.valid) {
    throw new ValidationError(result.reason ?? 'Invalid bet.');
  }
}

/** Deduct the wager from the player's wallet. */
export async function deductBet(key: UserKey, bet: number, gameType: GameId): Promise<void> {
  await economyService.transfer(key, {
    amount: -bet,
    source: 'game_bet',
    metadata: { gameType, bet },
  });
}

/** Credit winnings (or a push refund) to the player's wallet. */
export async function creditWinnings(
  key: UserKey,
  payout: number,
  gameType: GameId,
  metadata?: Record<string, unknown>,
): Promise<void> {
  if (payout <= 0) return;

  await economyService.transfer(key, {
    amount: payout,
    source: 'game_win',
    metadata: { gameType, payout, ...metadata },
  });
}

/** Upsert per-game stats for profile / leaderboard use. */
export async function recordGameStats(
  key: UserKey,
  gameType: GameId,
  bet: number,
  payout: number,
  won: boolean,
): Promise<GameStats> {
  const net = payout - bet;
  const winProfit = won && net > 0 ? net : 0;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.gameStats.findUnique({
      where: {
        discordId_guildId_gameType: {
          discordId: key.discordId,
          guildId: key.guildId,
          gameType,
        },
      },
    });

    const biggestWin = existing
      ? Math.max(existing.biggestWin, winProfit)
      : winProfit;

    return tx.gameStats.upsert({
      where: {
        discordId_guildId_gameType: {
          discordId: key.discordId,
          guildId: key.guildId,
          gameType,
        },
      },
      create: {
        discordId: key.discordId,
        guildId: key.guildId,
        gameType,
        gamesPlayed: 1,
        wins: won ? 1 : 0,
        losses: won ? 0 : 1,
        totalWagered: BigInt(bet),
        totalWon: BigInt(payout),
        biggestWin,
        netProfit: net,
      },
      update: {
        gamesPlayed: { increment: 1 },
        wins: { increment: won ? 1 : 0 },
        losses: { increment: won ? 0 : 1 },
        totalWagered: { increment: bet },
        totalWon: { increment: payout },
        biggestWin,
        netProfit: { increment: net },
      },
    });
  });
}

async function emitGameFlowEvents(
  eventBus: EventBus | undefined,
  key: UserKey,
  gameType: GameId,
  bet: number,
  payout: number,
  won: boolean,
): Promise<void> {
  if (!eventBus) return;

  const timestamp = new Date();
  const base = {
    discordId: key.discordId,
    guildId: key.guildId,
    gameType,
    bet,
    payout,
    won,
    timestamp,
  };

  await eventBus.emitGameEvent({ type: 'wager_placed', ...base });
  await eventBus.emitGameEvent({ type: 'game_played', ...base });
  await eventBus.emitGameEvent({ type: won ? 'game_won' : 'game_lost', ...base });

  await eventBus.emitQuestEvent({
    type: 'wager',
    discordId: key.discordId,
    guildId: key.guildId,
    amount: bet,
    metadata: { gameType },
    timestamp,
  });
  await eventBus.emitQuestEvent({
    type: 'game_played',
    discordId: key.discordId,
    guildId: key.guildId,
    metadata: { gameType, won },
    timestamp,
  });
  if (won) {
    await eventBus.emitQuestEvent({
      type: 'game_win',
      discordId: key.discordId,
      guildId: key.guildId,
      amount: payout,
      metadata: { gameType, bet },
      timestamp,
    });
  }
}

/**
 * Standard game pipeline: validate → deduct → resolve → credit → XP → stats → events.
 */
export async function runGameFlow<TInput, TDetails = Record<string, unknown>>(
  options: GameFlowOptions<TInput, TDetails>,
): Promise<GameFlowResult<TDetails>> {
  const { key, gameType, bet, input, validateInput, resolve, betAlreadyDeducted, eventBus } =
    options;

  if (!betAlreadyDeducted) {
    await validateBet(key, bet);
  }
  if (validateInput) {
    await validateInput(key, bet, input);
  }

  if (!betAlreadyDeducted) {
    await deductBet(key, bet, gameType);
  }

  const outcome = await resolve(key, bet, input);
  const payout = Math.max(0, Math.floor(outcome.payout));

  await creditWinnings(key, payout, gameType, outcome.details as Record<string, unknown> | undefined);

  const xpAwarded = outcome.won ? economyConfig.gameXpWin : economyConfig.gameXpLoss;
  const previousLevel = await progressionService.getLevel(key);
  const user = await progressionService.awardXp(key, xpAwarded, gameType);
  const bus = eventBus ?? globalEventBus;

  await recordGameStats(key, gameType, bet, payout, outcome.won);
  await emitGameFlowEvents(bus, key, gameType, bet, payout, outcome.won);
  await emitLevelUpEvents(key, previousLevel, user.level);

  return {
    won: outcome.won,
    bet,
    payout,
    profit: payout - bet,
    xpAwarded,
    user,
    details: outcome.details,
  };
}

/** Convenience wrapper when the game is modeled as a `BaseGame` instance. */
export async function runBaseGameFlow<TInput, TDetails = Record<string, unknown>>(
  game: BaseGame<TInput, TDetails>,
  key: UserKey,
  bet: number,
  input: TInput,
  options?: Pick<GameFlowOptions<TInput, TDetails>, 'betAlreadyDeducted' | 'eventBus'>,
): Promise<GameFlowResult<TDetails>> {
  return runGameFlow({
    key,
    gameType: game.gameType,
    bet,
    input,
    validateInput: (k, b, i) => game.validate(k, b, i),
    resolve: (k, b, i) => game.resolve(k, b, i),
    betAlreadyDeducted: options?.betAlreadyDeducted,
    eventBus: options?.eventBus,
  });
}
