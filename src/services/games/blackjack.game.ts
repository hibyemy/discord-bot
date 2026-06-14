import type { GameSession } from '@prisma/client';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type APIActionRowComponent,
  type APIButtonComponent,
} from 'discord.js';
import { ActiveSessionError, ValidationError } from '../../contracts/errors.js';
import type { UserKey } from '../../contracts/services.js';
import { getGame, gamesConfig } from '../../config/games.js';
import { prisma } from '../../db.js';
import { shuffle } from '../../utils/rng.js';
import {
  deductBet,
  runGameFlow,
  validateBet,
  type GameFlowResult,
  type GameResolution,
} from './base.game.js';

const GAME_TYPE = 'blackjack' as const;
const SUITS = ['♠', '♥', '♦', '♣'] as const;
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];

export interface Card {
  rank: Rank;
  suit: Suit;
}

export interface BlackjackState {
  deck: Card[];
  playerHand: Card[];
  dealerHand: Card[];
  doubled: boolean;
  finished: boolean;
  dealerRevealed: boolean;
}

export type BlackjackOutcome =
  | 'blackjack'
  | 'win'
  | 'lose'
  | 'push'
  | 'bust'
  | 'dealer_bust';

export interface BlackjackDetails {
  playerHand: Card[];
  dealerHand: Card[];
  playerValue: number;
  dealerValue: number;
  outcome: BlackjackOutcome;
  doubled: boolean;
}

export interface BlackjackResolveInput {
  playerHand: Card[];
  dealerHand: Card[];
  doubled: boolean;
}

export interface StartBlackjackResult {
  session: GameSession | null;
  state: BlackjackState;
  immediate: GameFlowResult<BlackjackDetails> | null;
}

export const BLACKJACK_BUTTON_PREFIX = 'bj';

function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return shuffle(deck);
}

function drawCard(deck: Card[]): Card {
  const card = deck.pop();
  if (!card) {
    throw new ValidationError('Deck exhausted.');
  }
  return card;
}

function rankValue(rank: Rank): number {
  if (rank === 'A') return 11;
  if (rank === 'K' || rank === 'Q' || rank === 'J') return 10;
  return Number(rank);
}

export function handValue(hand: readonly Card[]): number {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    if (card.rank === 'A') {
      aces += 1;
      total += 11;
    } else {
      total += rankValue(card.rank);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

export function isNaturalBlackjack(hand: readonly Card[]): boolean {
  return hand.length === 2 && handValue(hand) === 21;
}

function formatCard(card: Card): string {
  return `${card.rank}${card.suit}`;
}

export function formatHand(hand: readonly Card[], hideFirst = false): string {
  if (hand.length === 0) return '—';
  if (hideFirst) {
    return `🂠 ${hand.slice(1).map(formatCard).join(' ')}`;
  }
  return hand.map(formatCard).join(' ');
}

function dealerUpcard(hand: readonly Card[]): Card | undefined {
  return hand[0];
}

function dealerShowsAceOrTen(hand: readonly Card[]): boolean {
  const up = dealerUpcard(hand);
  if (!up) return false;
  return up.rank === 'A' || rankValue(up.rank) === 10;
}

function playDealer(state: BlackjackState): void {
  state.dealerRevealed = true;
  while (handValue(state.dealerHand) < 17) {
    state.dealerHand.push(drawCard(state.deck));
  }
}

function getHouseEdge(): number {
  return getGame(GAME_TYPE)?.houseEdge ?? 0.01;
}

/** 6:5 blackjack payout (~1% house edge) instead of 3:2. */
function blackjackPayout(totalBet: number): number {
  return Math.floor(totalBet * 2.2);
}

export function computeOutcome(
  playerHand: readonly Card[],
  dealerHand: readonly Card[],
  totalBet: number,
): GameResolution<BlackjackDetails> {
  const playerValue = handValue(playerHand);
  const dealerValue = handValue(dealerHand);
  const doubled = false;
  const houseEdge = getHouseEdge();

  const details = (outcome: BlackjackOutcome): BlackjackDetails => ({
    playerHand: [...playerHand],
    dealerHand: [...dealerHand],
    playerValue,
    dealerValue,
    outcome,
    doubled,
  });

  if (isNaturalBlackjack(playerHand)) {
    if (isNaturalBlackjack(dealerHand)) {
      return { won: false, payout: totalBet, details: details('push') };
    }
    return {
      won: true,
      payout: blackjackPayout(totalBet),
      details: details('blackjack'),
    };
  }

  if (playerValue > 21) {
    return { won: false, payout: 0, details: details('bust') };
  }

  if (isNaturalBlackjack(dealerHand)) {
    return { won: false, payout: 0, details: details('lose') };
  }

  if (dealerValue > 21) {
    return {
      won: true,
      payout: totalBet * 2,
      details: details('dealer_bust'),
    };
  }

  if (playerValue > dealerValue) {
    return {
      won: true,
      payout: totalBet * 2,
      details: details('win'),
    };
  }

  if (playerValue < dealerValue) {
    return { won: false, payout: 0, details: details('lose') };
  }

  if (Math.random() < houseEdge) {
    return { won: false, payout: 0, details: details('lose') };
  }

  return { won: false, payout: totalBet, details: details('push') };
}

function parseState(raw: unknown): BlackjackState {
  if (!raw || typeof raw !== 'object') {
    throw new ValidationError('Invalid blackjack session state.');
  }
  const state = raw as BlackjackState;
  if (
    !Array.isArray(state.deck) ||
    !Array.isArray(state.playerHand) ||
    !Array.isArray(state.dealerHand)
  ) {
    throw new ValidationError('Corrupt blackjack session state.');
  }
  return state;
}

function sessionExpired(session: GameSession): boolean {
  return session.expiresAt.getTime() <= Date.now();
}

async function findActiveSession(key: UserKey): Promise<GameSession | null> {
  return prisma.gameSession.findFirst({
    where: {
      discordId: key.discordId,
      guildId: key.guildId,
      gameType: GAME_TYPE,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });
}

function initialDeal(): BlackjackState {
  const deck = createDeck();
  const playerHand = [drawCard(deck), drawCard(deck)];
  const dealerHand = [drawCard(deck), drawCard(deck)];
  return {
    deck,
    playerHand,
    dealerHand,
    doubled: false,
    finished: false,
    dealerRevealed: false,
  };
}

function shouldResolveImmediately(state: BlackjackState): boolean {
  if (isNaturalBlackjack(state.playerHand)) {
    return true;
  }
  if (dealerShowsAceOrTen(state.dealerHand) && isNaturalBlackjack(state.dealerHand)) {
    state.dealerRevealed = true;
    return true;
  }
  return false;
}

export async function finalizeBlackjack(
  key: UserKey,
  session: GameSession,
  state: BlackjackState,
): Promise<GameFlowResult<BlackjackDetails>> {
  state.finished = true;
  state.dealerRevealed = true;

  const result = await runGameFlow<BlackjackResolveInput, BlackjackDetails>({
    key,
    gameType: GAME_TYPE,
    bet: session.bet,
    betAlreadyDeducted: true,
    input: {
      playerHand: state.playerHand,
      dealerHand: state.dealerHand,
      doubled: state.doubled,
    },
    resolve: async (_k, bet, input) => {
      const resolution = computeOutcome(input.playerHand, input.dealerHand, bet);
      if (resolution.details) {
        resolution.details.doubled = input.doubled;
      }
      return resolution;
    },
  });

  await prisma.gameSession.delete({ where: { id: session.id } });
  return result;
}

export async function startBlackjack(
  key: UserKey,
  bet: number,
): Promise<StartBlackjackResult> {
  await validateBet(key, bet);

  const active = await findActiveSession(key);
  if (active) {
    throw new ActiveSessionError(GAME_TYPE);
  }

  const state = initialDeal();

  if (shouldResolveImmediately(state)) {
    await deductBet(key, bet, GAME_TYPE);
    const resolution = computeOutcome(state.playerHand, state.dealerHand, bet);
    const immediate = await runGameFlow<BlackjackResolveInput, BlackjackDetails>({
      key,
      gameType: GAME_TYPE,
      bet,
      betAlreadyDeducted: true,
      input: {
        playerHand: state.playerHand,
        dealerHand: state.dealerHand,
        doubled: false,
      },
      resolve: async () => resolution,
    });
    return { session: null, state, immediate };
  }

  await deductBet(key, bet, GAME_TYPE);

  const expiresAt = new Date(Date.now() + gamesConfig.sessionTimeoutMs);
  const session = await prisma.gameSession.create({
    data: {
      discordId: key.discordId,
      guildId: key.guildId,
      gameType: GAME_TYPE,
      bet,
      state: state as object,
      expiresAt,
    },
  });

  return { session, state, immediate: null };
}

export async function getBlackjackSession(
  sessionId: string,
  key: UserKey,
): Promise<{ session: GameSession; state: BlackjackState }> {
  const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
  if (!session || session.gameType !== GAME_TYPE) {
    throw new ValidationError('Blackjack session not found.');
  }
  if (session.discordId !== key.discordId || session.guildId !== key.guildId) {
    throw new ValidationError('This is not your blackjack session.');
  }
  if (sessionExpired(session)) {
    throw new ValidationError('This blackjack session has expired.');
  }
  const state = parseState(session.state);
  if (state.finished) {
    throw new ValidationError('This blackjack hand is already finished.');
  }
  return { session, state };
}

async function persistSession(
  sessionId: string,
  state: BlackjackState,
): Promise<void> {
  await prisma.gameSession.update({
    where: { id: sessionId },
    data: { state: state as object },
  });
}

export async function hitBlackjack(
  sessionId: string,
  key: UserKey,
): Promise<{
  state: BlackjackState;
  bet: number;
  result: GameFlowResult<BlackjackDetails> | null;
}> {
  const { session, state } = await getBlackjackSession(sessionId, key);
  state.playerHand.push(drawCard(state.deck));

  if (handValue(state.playerHand) > 21) {
    state.dealerRevealed = true;
    const result = await finalizeBlackjack(key, session, state);
    return { state, bet: session.bet, result };
  }

  await persistSession(sessionId, state);
  return { state, bet: session.bet, result: null };
}

export async function standBlackjack(
  sessionId: string,
  key: UserKey,
): Promise<{ state: BlackjackState; result: GameFlowResult<BlackjackDetails> }> {
  const { session, state } = await getBlackjackSession(sessionId, key);
  playDealer(state);
  const result = await finalizeBlackjack(key, session, state);
  return { state, result };
}

export async function doubleBlackjack(
  sessionId: string,
  key: UserKey,
): Promise<{ state: BlackjackState; result: GameFlowResult<BlackjackDetails> | null }> {
  const { session, state } = await getBlackjackSession(sessionId, key);

  if (state.playerHand.length !== 2 || state.doubled) {
    throw new ValidationError('Double down is only available on your first move.');
  }

  await validateBet(key, session.bet);
  await deductBet(key, session.bet, GAME_TYPE);

  state.doubled = true;
  state.playerHand.push(drawCard(state.deck));

  const updatedBet = session.bet * 2;
  await prisma.gameSession.update({
    where: { id: sessionId },
    data: { bet: updatedBet, state: state as object },
  });
  const updatedSession = { ...session, bet: updatedBet };

  if (handValue(state.playerHand) > 21) {
    state.dealerRevealed = true;
    const result = await finalizeBlackjack(key, updatedSession, state);
    return { state, result };
  }

  playDealer(state);
  const result = await finalizeBlackjack(key, updatedSession, state);
  return { state, result };
}

export function buildBlackjackButtons(
  sessionId: string,
  canDouble: boolean,
): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${BLACKJACK_BUTTON_PREFIX}:hit:${sessionId}`)
      .setLabel('Hit')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${BLACKJACK_BUTTON_PREFIX}:stand:${sessionId}`)
      .setLabel('Stand')
      .setStyle(ButtonStyle.Secondary),
  );

  if (canDouble) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${BLACKJACK_BUTTON_PREFIX}:double:${sessionId}`)
        .setLabel('Double')
        .setStyle(ButtonStyle.Success),
    );
  }

  return [row];
}

export function parseBlackjackCustomId(
  customId: string,
): { action: 'hit' | 'stand' | 'double'; sessionId: string } | null {
  const parts = customId.split(':');
  if (parts.length !== 3 || parts[0] !== BLACKJACK_BUTTON_PREFIX) {
    return null;
  }
  const action = parts[1];
  const sessionId = parts[2];
  if (!sessionId || (action !== 'hit' && action !== 'stand' && action !== 'double')) {
    return null;
  }
  return { action, sessionId };
}

export function outcomeLabel(outcome: BlackjackOutcome): string {
  switch (outcome) {
    case 'blackjack':
      return 'Blackjack!';
    case 'win':
      return 'You win!';
    case 'dealer_bust':
      return 'Dealer busts — you win!';
    case 'bust':
      return 'Bust — you lose.';
    case 'push':
      return 'Push — bet returned.';
    case 'lose':
      return 'Dealer wins.';
  }
}

export function serializeButtonRows(
  rows: ActionRowBuilder<ButtonBuilder>[],
): APIActionRowComponent<APIButtonComponent>[] {
  return rows.map((row) => row.toJSON());
}
