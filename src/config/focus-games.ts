import { ButtonStyle } from 'discord.js';
import { pickRandom, randomInt, shuffle } from '../utils/rng.js';

export type FocusGameType =
  | 'catch'
  | 'odd_out'
  | 'quick_math'
  | 'priority'
  | 'pattern'
  | 'high_number'
  | 'market_call';

export interface FocusTierProfile {
  tier: number;
  name: string;
  tagline: string;
  roundCount: number;
  roundTimeoutMs: number;
  roundGapMs: number;
  /** Multiplier vs one passive work shift at 100% accuracy (3–5× by tier) */
  payoutMultiplier: number;
  gameTypes: FocusGameType[];
}

export interface FocusChoice {
  key: string;
  label: string;
  style: ButtonStyle;
}

export interface FocusRound {
  gameType: FocusGameType;
  gameLabel: string;
  prompt: string;
  detail?: string;
  correctChoice: string;
  choices: FocusChoice[];
  timeoutMs: number;
}

export const focusGameConfig = {
  minHitRatio: 0.4,
  xpMultiplier: 1.5,

  tierProfiles: [
    {
      tier: 1,
      name: 'Street Hustle',
      tagline: 'Spot the right mark and snatch the payout.',
      roundCount: 6,
      roundTimeoutMs: 4_000,
      roundGapMs: 900,
      payoutMultiplier: 3,
      gameTypes: ['catch', 'odd_out'],
    },
    {
      tier: 2,
      name: 'Rush Service',
      tagline: 'Prioritize fast — wrong pick costs you.',
      roundCount: 7,
      roundTimeoutMs: 3_500,
      roundGapMs: 900,
      payoutMultiplier: 3.5,
      gameTypes: ['catch', 'priority', 'quick_math'],
    },
    {
      tier: 3,
      name: 'Desk Grind',
      tagline: 'Patterns and numbers under the clock.',
      roundCount: 8,
      roundTimeoutMs: 3_200,
      roundGapMs: 850,
      payoutMultiplier: 4,
      gameTypes: ['quick_math', 'pattern', 'odd_out', 'high_number'],
    },
    {
      tier: 4,
      name: 'Corner Office',
      tagline: 'Big calls, tight windows, bigger rewards.',
      roundCount: 8,
      roundTimeoutMs: 2_900,
      roundGapMs: 800,
      payoutMultiplier: 4.5,
      gameTypes: ['priority', 'pattern', 'high_number', 'market_call'],
    },
    {
      tier: 5,
      name: 'Empire Sprint',
      tagline: 'Elite reflexes for elite payouts.',
      roundCount: 9,
      roundTimeoutMs: 2_600,
      roundGapMs: 750,
      payoutMultiplier: 5,
      gameTypes: ['market_call', 'pattern', 'quick_math', 'priority', 'high_number'],
    },
  ] satisfies FocusTierProfile[],
} as const;

const GAME_LABELS: Record<FocusGameType, string> = {
  catch: 'Catch Run',
  odd_out: 'Odd One Out',
  quick_math: 'Quick Math',
  priority: 'Priority Call',
  pattern: 'Pattern Pulse',
  high_number: 'High Stakes',
  market_call: 'Market Snap',
};

const CATCH_TARGETS = [
  { emoji: '💵', label: 'Tip jar' },
  { emoji: '📦', label: 'Package' },
  { emoji: '☕', label: 'Order ticket' },
  { emoji: '🎫', label: 'VIP pass' },
  { emoji: '💎', label: 'Rare drop' },
];

const ODD_SETS = [
  { items: ['🍎', '🍎', '🚗'], odd: '🚗' },
  { items: ['🐱', '🐶', '🐱'], odd: '🐶' },
  { items: ['⚽', '🏀', '⚽'], odd: '🏀' },
  { items: ['🎸', '🎹', '🎸'], odd: '🎹' },
  { items: ['🌙', '⭐', '🌙'], odd: '⭐' },
];

const PRIORITY_PROMPTS = [
  {
    prompt: 'Two pings land at once — which do you handle first?',
    choices: [
      { key: 'a', label: '🔥 Server alert', style: ButtonStyle.Danger },
      { key: 'b', label: '☕ Coffee order', style: ButtonStyle.Secondary },
    ],
    correct: 'a',
  },
  {
    prompt: 'Queue is piling up — pick the urgent task.',
    choices: [
      { key: 'a', label: '📋 File paperwork', style: ButtonStyle.Secondary },
      { key: 'b', label: '🚨 Angry client', style: ButtonStyle.Danger },
    ],
    correct: 'b',
  },
  {
    prompt: 'Limited time — what gets your focus?',
    choices: [
      { key: 'a', label: '💰 Closing deal', style: ButtonStyle.Success },
      { key: 'b', label: '🧹 Organize desk', style: ButtonStyle.Secondary },
    ],
    correct: 'a',
  },
];

const PATTERN_ROUNDS = [
  {
    prompt: '🔴 🔵 🔴 🔵 ❓',
    choices: [
      { key: 'a', label: '🔴', style: ButtonStyle.Danger },
      { key: 'b', label: '🔵', style: ButtonStyle.Primary },
      { key: 'c', label: '🟢', style: ButtonStyle.Success },
    ],
    correct: 'a',
  },
  {
    prompt: '⭐ 🌙 ⭐ 🌙 ❓',
    choices: [
      { key: 'a', label: '🌙', style: ButtonStyle.Primary },
      { key: 'b', label: '⭐', style: ButtonStyle.Secondary },
      { key: 'c', label: '☀️', style: ButtonStyle.Secondary },
    ],
    correct: 'b',
  },
  {
    prompt: '▶️ ⏸️ ▶️ ⏸️ ❓',
    choices: [
      { key: 'a', label: '⏸️', style: ButtonStyle.Secondary },
      { key: 'b', label: '▶️', style: ButtonStyle.Success },
      { key: 'c', label: '⏹️', style: ButtonStyle.Danger },
    ],
    correct: 'b',
  },
];

const MARKET_ROUNDS = [
  {
    prompt: '📈 Price is climbing fast!',
    detail: 'Make the right call before the window closes.',
    choices: [
      { key: 'a', label: 'Buy', style: ButtonStyle.Success },
      { key: 'b', label: 'Sell', style: ButtonStyle.Danger },
      { key: 'c', label: 'Hold', style: ButtonStyle.Secondary },
    ],
    correct: 'a',
  },
  {
    prompt: '📉 Price is tanking!',
    detail: 'Cut losses or miss the payout.',
    choices: [
      { key: 'a', label: 'Buy dip', style: ButtonStyle.Secondary },
      { key: 'b', label: 'Sell', style: ButtonStyle.Danger },
      { key: 'c', label: 'Hold', style: ButtonStyle.Secondary },
    ],
    correct: 'b',
  },
  {
    prompt: '⚖️ Price flatlined — no momentum.',
    detail: 'Only one choice keeps your streak alive.',
    choices: [
      { key: 'a', label: 'Buy', style: ButtonStyle.Secondary },
      { key: 'b', label: 'Sell', style: ButtonStyle.Secondary },
      { key: 'c', label: 'Hold', style: ButtonStyle.Primary },
    ],
    correct: 'c',
  },
];

export function getFocusTierProfile(tier: number): FocusTierProfile {
  const profile = focusGameConfig.tierProfiles.find((entry) => entry.tier === tier);
  return profile ?? focusGameConfig.tierProfiles[0]!;
}

function choiceButtons(
  choices: Array<{ key: string; label: string; style: ButtonStyle }>,
): FocusChoice[] {
  return choices.map((choice) => ({
    key: choice.key,
    label: choice.label,
    style: choice.style,
  }));
}

function buildCatchRound(timeoutMs: number): FocusRound {
  const target = pickRandom(CATCH_TARGETS);
  const decoys = shuffle(CATCH_TARGETS.filter((item) => item.emoji !== target.emoji)).slice(0, 2);
  const options = shuffle([
    { key: 'a', label: `${target.emoji} ${target.label}`, style: ButtonStyle.Success },
    ...decoys.map((item, index) => ({
      key: String.fromCharCode(98 + index),
      label: `${item.emoji} ${item.label}`,
      style: ButtonStyle.Secondary,
    })),
  ]);

  const correct = options.find((opt) => opt.label.startsWith(target.emoji))!;

  return {
    gameType: 'catch',
    gameLabel: GAME_LABELS.catch,
    prompt: `Catch the **${target.label}**!`,
    correctChoice: correct.key,
    choices: choiceButtons(options),
    timeoutMs,
  };
}

function buildOddOutRound(timeoutMs: number): FocusRound {
  const set = pickRandom(ODD_SETS);
  const options = shuffle(set.items.map((emoji, index) => ({
    key: String.fromCharCode(97 + index),
    label: emoji,
    style: ButtonStyle.Primary,
  })));
  const correct = options.find((opt) => opt.label === set.odd)!;

  return {
    gameType: 'odd_out',
    gameLabel: GAME_LABELS.odd_out,
    prompt: 'Tap the **odd one out**!',
    correctChoice: correct.key,
    choices: choiceButtons(options),
    timeoutMs,
  };
}

function buildMathRound(timeoutMs: number): FocusRound {
  const a = randomInt(3, 18);
  const b = randomInt(2, 14);
  const correctValue = a + b;
  const wrong = new Set<number>();
  while (wrong.size < 3) {
    const delta = randomInt(-4, 4);
    const candidate = correctValue + delta;
    if (candidate !== correctValue && candidate > 0) wrong.add(candidate);
  }

  const answers = shuffle([correctValue, ...wrong]);
  const options = answers.map((value, index) => ({
    key: String.fromCharCode(97 + index),
    label: String(value),
    style: ButtonStyle.Primary,
  }));
  const correct = options.find((opt) => opt.label === String(correctValue))!;

  return {
    gameType: 'quick_math',
    gameLabel: GAME_LABELS.quick_math,
    prompt: `Solve: **${a} + ${b} = ?**`,
    correctChoice: correct.key,
    choices: choiceButtons(options),
    timeoutMs,
  };
}

function buildPriorityRound(timeoutMs: number): FocusRound {
  const round = pickRandom(PRIORITY_PROMPTS);
  return {
    gameType: 'priority',
    gameLabel: GAME_LABELS.priority,
    prompt: round.prompt,
    correctChoice: round.correct,
    choices: choiceButtons(round.choices),
    timeoutMs,
  };
}

function buildPatternRound(timeoutMs: number): FocusRound {
  const round = pickRandom(PATTERN_ROUNDS);
  return {
    gameType: 'pattern',
    gameLabel: GAME_LABELS.pattern,
    prompt: 'Complete the pattern:',
    detail: round.prompt,
    correctChoice: round.correct,
    choices: choiceButtons(round.choices),
    timeoutMs,
  };
}

function buildHighNumberRound(timeoutMs: number): FocusRound {
  const values = shuffle([randomInt(12, 40), randomInt(41, 70), randomInt(71, 99), randomInt(5, 11)]);
  const max = Math.max(...values);
  const options = values.map((value, index) => ({
    key: String.fromCharCode(97 + index),
    label: String(value),
    style: ButtonStyle.Primary,
  }));
  const correct = options.find((opt) => opt.label === String(max))!;

  return {
    gameType: 'high_number',
    gameLabel: GAME_LABELS.high_number,
    prompt: 'Pick the **highest number**!',
    correctChoice: correct.key,
    choices: choiceButtons(options),
    timeoutMs,
  };
}

function buildMarketRound(timeoutMs: number): FocusRound {
  const round = pickRandom(MARKET_ROUNDS);
  return {
    gameType: 'market_call',
    gameLabel: GAME_LABELS.market_call,
    prompt: round.prompt,
    detail: round.detail,
    correctChoice: round.correct,
    choices: choiceButtons(round.choices),
    timeoutMs,
  };
}

const ROUND_BUILDERS: Record<FocusGameType, (timeoutMs: number) => FocusRound> = {
  catch: buildCatchRound,
  odd_out: buildOddOutRound,
  quick_math: buildMathRound,
  priority: buildPriorityRound,
  pattern: buildPatternRound,
  high_number: buildHighNumberRound,
  market_call: buildMarketRound,
};

export function buildFocusRoundDeck(profile: FocusTierProfile): FocusRound[] {
  const deck: FocusRound[] = [];
  const types = shuffle([...profile.gameTypes]);

  for (let i = 0; i < profile.roundCount; i++) {
    const type = types[i % types.length]!;
    deck.push(ROUND_BUILDERS[type](profile.roundTimeoutMs));
  }

  return deck;
}

export function estimateFocusDurationMs(profile: FocusTierProfile): number {
  return profile.roundCount * (profile.roundTimeoutMs + profile.roundGapMs);
}
