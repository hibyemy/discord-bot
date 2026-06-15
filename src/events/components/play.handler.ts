import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Message,
  type MessageComponentInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { economyConfig } from '../../config/economy.js';
import { gamesConfig, getGame, type GameDefinition, type GameId } from '../../config/games.js';
import { GamblebotError, ValidationError } from '../../contracts/errors.js';
import type { UserKey } from '../../contracts/services.js';
import {
  buildBlackjackButtons,
  BLACKJACK_MENU_FOOTER,
  formatHand,
  handValue,
  outcomeLabel,
  serializeButtonRows,
  startBlackjack,
  type BlackjackDetails,
  type BlackjackState,
} from '../../services/games/blackjack.game.js';
import type { GameFlowResult } from '../../services/games/base.game.js';
import type { CoinflipChoice } from '../../services/games/coinflip.game.js';
import { playCoinflip } from '../../services/games/coinflip.game.js';
import { playDice } from '../../services/games/dice.game.js';
import { playRoulette, type RouletteBetType } from '../../services/games/roulette.game.js';
import { playSlots } from '../../services/games/slots.game.js';
import { CRASH_UI_TICK_MS, shouldRefreshCrashDisplay } from '../../utils/crash-live-ui.js';
import {
  attachCrashMessage,
  buildCrashCashoutId,
  buildCrashQuitId,
  finalizeCrashSession,
  getCurrentMultiplier,
  hasCrashed,
  startCrashSession,
  tryAutoCrash,
  type CrashDetails,
} from '../../services/games/crash.game.js';
import {
  buildCrashActiveEmbed,
  buildCrashActiveRow,
  buildResultEmbed,
} from './crash.handler.js';
import {
  economyService,
  guildConfigService,
  progressionService,
} from '../../services/index.js';
import { embedColors, errorEmbed, formatCoins } from '../../utils/embeds.js';
import { buildCasinoProgressBlock } from '../../utils/progression-display.js';
import { buildOneshotReply } from './oneshot-replay.handler.js';

const PREFIX = 'play:';

const ONESHOT_IDS = new Set<GameId>(['coinflip', 'dice', 'slots', 'roulette']);

interface PlayContext {
  userId: string;
  guildId: string;
  key: UserKey;
}

function parseUserId(customId: string, partIndex: number): string | null {
  const parts = customId.split(':');
  return parts[partIndex] ?? null;
}

function assertOwner(
  interaction: MessageComponentInteraction | ModalSubmitInteraction,
  userId: string,
): boolean {
  if (interaction.user.id !== userId) {
    void interaction.reply({
      content: 'This menu belongs to another player.',
      ephemeral: true,
    });
    return false;
  }
  return true;
}

export function isPlaySelect(customId: string): boolean {
  return customId.startsWith(`${PREFIX}pick:`);
}

export function isPlayButton(customId: string): boolean {
  return customId.startsWith(PREFIX) && !customId.startsWith(`${PREFIX}pick:`);
}

export function isPlayModal(customId: string): boolean {
  return customId.startsWith(`${PREFIX}modal:`);
}

function buildBetPresets(maxBet: number, wallet: number): number[] {
  const cap = Math.min(maxBet, wallet);
  if (cap < economyConfig.minBet) return [];

  const candidates = [
    economyConfig.minBet,
    50,
    100,
    250,
    500,
    1000,
    2500,
    5000,
    10_000,
  ];
  const valid = candidates.filter((amount) => amount <= cap);
  if (valid.length === 0) {
    return [cap];
  }
  return [...new Set(valid)].slice(-4);
}

async function getPlayContext(
  interaction: MessageComponentInteraction | ModalSubmitInteraction,
  userId: string,
): Promise<PlayContext | null> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: 'Use /play in a server.',
      ephemeral: true,
    });
    return null;
  }
  if (!assertOwner(interaction, userId)) return null;

  return {
    userId,
    guildId: interaction.guildId,
    key: { discordId: userId, guildId: interaction.guildId },
  };
}

async function gameAvailability(
  key: UserKey,
  game: GameDefinition,
  level: number,
): Promise<{ playable: boolean; reason?: string }> {
  if (await guildConfigService.isGameDisabled(key.guildId, game.id)) {
    return { playable: false, reason: 'Disabled on this server' };
  }

  if (level < game.unlockLevel) {
    const away = game.unlockLevel - level;
    const reason =
      away === 1
        ? 'Unlocks next level'
        : `Unlocks at level ${game.unlockLevel} (${away} away)`;
    return { playable: false, reason };
  }

  return { playable: true };
}

function formatGameLine(
  game: GameDefinition,
  status: { playable: boolean; reason?: string },
): string {
  const edge = `${(game.houseEdge * 100).toFixed(1)}% edge`;
  if (!status.playable) {
    return `🔒 **${game.name}** — ${status.reason ?? 'Locked'}`;
  }
  const tag = game.interactive ? '🎮 Live' : '⚡ Instant';
  return `✅ **${game.name}** — ${game.description} · _${edge}_ · ${tag}`;
}

export function buildQuitToCasinoButton(userId: string): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(`${PREFIX}quit:${userId}`)
    .setLabel('Quit')
    .setStyle(ButtonStyle.Danger);
}

export function buildMainMenuExitButton(userId: string): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(`menu:home:${userId}`)
    .setLabel('← Main menu')
    .setStyle(ButtonStyle.Secondary);
}

export async function buildPlayMenuPayload(key: UserKey, userId: string) {
  const [balance, level, xp, maxBetValidation] = await Promise.all([
    economyService.getBalance(key),
    progressionService.getLevel(key),
    progressionService.xpProgress(key),
    economyService.validateBet(key, economyConfig.minBet),
  ]);
  const maxBet = maxBetValidation.maxBet;

  const availableLines: string[] = [];
  const lockedLines: string[] = [];
  const selectOptions: StringSelectMenuOptionBuilder[] = [];

  for (const game of gamesConfig.games) {
    const status = await gameAvailability(key, game, level);
    if (status.playable) {
      availableLines.push(formatGameLine(game, status));
      selectOptions.push(
        new StringSelectMenuOptionBuilder()
          .setLabel(game.name)
          .setDescription(game.description.slice(0, 100))
          .setValue(game.id)
          .setEmoji(game.interactive ? '🎮' : '🎰'),
      );
    } else {
      lockedLines.push(formatGameLine(game, status));
    }
  }

  const progressBlock = buildCasinoProgressBlock(level, xp, maxBet);

  const embed = new EmbedBuilder()
    .setColor(embedColors.game)
    .setTitle('🎰 Casino Hub')
    .setDescription(
      [
        ...progressBlock,
        '',
        `**Wallet:** ${formatCoins(balance.wallet)}`,
        '',
        '_Results post publicly — this menu stays private._',
        '',
        '**Play now**',
        availableLines.length > 0 ? availableLines.join('\n') : '_No games available yet — level up!_',
        ...(lockedLines.length > 0
          ? ['', '**Unlocks ahead**', lockedLines.join('\n')]
          : []),
      ].join('\n'),
    )
    .setFooter({ text: 'Pick a game below · Rank titles cap at level 100' });

  const components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

  if (selectOptions.length > 0) {
    components.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${PREFIX}pick:${userId}`)
          .setPlaceholder('Choose a game…')
          .addOptions(selectOptions),
      ),
    );
  }

  components.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(buildMainMenuExitButton(userId)),
  );

  return { embed, components };
}

function buildBetScreenEmbed(game: GameDefinition, wallet: number, maxBet: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(embedColors.game)
    .setTitle(game.name)
    .setDescription(
      [
        game.description,
        '',
        `**House edge:** ${(game.houseEdge * 100).toFixed(1)}%`,
        `**Wallet:** ${formatCoins(wallet)}`,
        `**Max bet:** ${formatCoins(maxBet)}`,
        '',
        game.interactive
          ? 'Choose a wager, then start the round.'
          : 'Choose a wager to continue.',
      ].join('\n'),
    );
}

function buildBetComponents(
  userId: string,
  gameId: GameId,
  presets: number[],
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  if (presets.length > 0) {
    const betRow = new ActionRowBuilder<ButtonBuilder>();
    for (const amount of presets) {
      betRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`${PREFIX}bet:${userId}:${gameId}:${amount}`)
          .setLabel(formatCoins(amount))
          .setStyle(ButtonStyle.Secondary),
      );
    }
    rows.push(betRow);
  }

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIX}custom:${userId}:${gameId}`)
        .setLabel('Custom bet')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${PREFIX}back:${userId}`)
        .setLabel('← Casino hub')
        .setStyle(ButtonStyle.Secondary),
      buildMainMenuExitButton(userId),
      buildQuitToCasinoButton(userId),
    ),
  );

  return rows;
}

function buildCoinflipChoiceRow(userId: string, bet: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PREFIX}cf:${userId}:${bet}:heads`)
      .setLabel('Heads')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}cf:${userId}:${bet}:tails`)
      .setLabel('Tails')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}back:${userId}`)
      .setLabel('← Casino hub')
      .setStyle(ButtonStyle.Secondary),
    buildMainMenuExitButton(userId),
    buildQuitToCasinoButton(userId),
  );
}

function buildRouletteChoiceRows(userId: string, bet: number): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIX}rl:${userId}:${bet}:red`)
        .setLabel('Red')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`${PREFIX}rl:${userId}:${bet}:black`)
        .setLabel('Black')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${PREFIX}rlnum:${userId}:${bet}`)
        .setLabel('Number…')
        .setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIX}back:${userId}`)
        .setLabel('← Casino hub')
        .setStyle(ButtonStyle.Secondary),
      buildMainMenuExitButton(userId),
      buildQuitToCasinoButton(userId),
    ),
  ];
}

function buildInteractiveStartRow(
  userId: string,
  gameId: 'blackjack' | 'crash',
  bet: number,
): ActionRowBuilder<ButtonBuilder> {
  const label = gameId === 'blackjack' ? 'Deal' : 'Launch';
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PREFIX}start:${userId}:${gameId}:${bet}`)
      .setLabel(`${label} (${formatCoins(bet)})`)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}back:${userId}`)
      .setLabel('← Casino hub')
      .setStyle(ButtonStyle.Secondary),
    buildMainMenuExitButton(userId),
    buildQuitToCasinoButton(userId),
  );
}

function blackjackActiveEmbed(state: BlackjackState, bet: number): EmbedBuilder {
  const dealerShown = state.dealerRevealed;
  const dealerValue = dealerShown ? handValue(state.dealerHand) : '?';

  return new EmbedBuilder()
    .setColor(embedColors.game)
    .setTitle('Blackjack')
    .addFields(
      {
        name: 'Your hand',
        value: `${formatHand(state.playerHand)} (${handValue(state.playerHand)})`,
        inline: false,
      },
      {
        name: 'Dealer',
        value: `${formatHand(state.dealerHand, !dealerShown)} (${dealerValue})`,
        inline: false,
      },
      { name: 'Bet', value: formatCoins(bet), inline: true },
    )
    .setFooter({ text: BLACKJACK_MENU_FOOTER });
}

function blackjackResultEmbed(
  state: BlackjackState,
  bet: number,
  details: BlackjackDetails,
  payout: number,
  profit: number,
  xpAwarded: number,
): EmbedBuilder {
  const color =
    details.outcome === 'blackjack' || details.outcome === 'win' || details.outcome === 'dealer_bust'
      ? embedColors.success
      : details.outcome === 'push'
        ? embedColors.warning
        : embedColors.error;

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(outcomeLabel(details.outcome))
    .addFields(
      {
        name: 'Your hand',
        value: `${formatHand(state.playerHand)} (${details.playerValue})`,
        inline: false,
      },
      {
        name: 'Dealer',
        value: `${formatHand(state.dealerHand)} (${details.dealerValue})`,
        inline: false,
      },
      { name: 'Bet', value: formatCoins(bet), inline: true },
      { name: 'Payout', value: formatCoins(payout), inline: true },
      {
        name: 'Profit',
        value: `${profit >= 0 ? '+' : ''}${formatCoins(profit)}`,
        inline: true,
      },
      { name: 'XP', value: `+${xpAwarded}`, inline: true },
    );
}

async function refreshMenu(interaction: MessageComponentInteraction, ctx: PlayContext): Promise<void> {
  const { embed, components } = await buildPlayMenuPayload(ctx.key, ctx.userId);
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ embeds: [embed], components });
  } else {
    await interaction.update({ embeds: [embed], components });
  }
}

async function showBetScreen(
  interaction: MessageComponentInteraction,
  ctx: PlayContext,
  gameId: GameId,
): Promise<void> {
  const game = getGame(gameId);
  if (!game) {
    throw new ValidationError('Unknown game.');
  }

  const level = await progressionService.getLevel(ctx.key);
  const status = await gameAvailability(ctx.key, game, level);
  if (!status.playable) {
    throw new ValidationError(status.reason ?? 'This game is not available.');
  }

  const [balance, validation] = await Promise.all([
    economyService.getBalance(ctx.key),
    economyService.validateBet(ctx.key, economyConfig.minBet),
  ]);

  const presets = buildBetPresets(validation.maxBet, balance.wallet);
  const embed = buildBetScreenEmbed(game, balance.wallet, validation.maxBet);
  const components = buildBetComponents(ctx.userId, gameId, presets);

  await interaction.update({ embeds: [embed], components });
}

async function validateWager(key: UserKey, bet: number): Promise<void> {
  const validation = await economyService.validateBet(key, bet);
  if (!validation.valid) {
    throw new ValidationError(validation.reason ?? 'Invalid bet.');
  }
}

async function resetMenuAfterPlay(
  interaction: MessageComponentInteraction | ModalSubmitInteraction,
  ctx: PlayContext,
): Promise<void> {
  const { embed, components } = await buildPlayMenuPayload(ctx.key, ctx.userId);
  await interaction.editReply({ embeds: [embed], components });
}

async function postPublicOneshotResult(
  interaction: MessageComponentInteraction | ModalSubmitInteraction,
  ctx: PlayContext,
  gameId: GameId,
  bet: number,
  extra?: {
    coinflipChoice?: CoinflipChoice;
    rouletteChoice?: RouletteBetType;
    rouletteNumber?: number;
  },
): Promise<void> {
  let result;
  switch (gameId) {
    case 'coinflip':
      if (!extra?.coinflipChoice) throw new ValidationError('Pick heads or tails.');
      result = await playCoinflip(ctx.key, bet, extra.coinflipChoice);
      break;
    case 'dice':
      result = await playDice(ctx.key, bet);
      break;
    case 'slots':
      result = await playSlots(ctx.key, bet);
      break;
    case 'roulette':
      if (!extra?.rouletteChoice) throw new ValidationError('Pick a roulette bet.');
      result = await playRoulette(ctx.key, bet, extra.rouletteChoice, extra.rouletteNumber);
      break;
    default:
      throw new ValidationError('Unsupported game.');
  }

  const { embed, components } = buildOneshotReply(
    gameId as 'coinflip' | 'dice' | 'slots' | 'roulette',
    ctx.userId,
    bet,
    result,
    extra,
  );

  await interaction.followUp({ embeds: [embed], components, ephemeral: false });
  await resetMenuAfterPlay(interaction, ctx);
}

async function runCrashOnMessage(
  message: Message,
  userId: string,
  key: UserKey,
  bet: number,
  sessionId: string,
  state: Awaited<ReturnType<typeof startCrashSession>>['state'],
): Promise<void> {
  const gameDef = getGame('crash')!;
  const expiresAt = Date.now() + gameDef.sessionTimeoutMs;

  let settled = false;
  let lastDisplaySnapshot: string | null = null;

  const settle = async (
    finalize: () => Promise<GameFlowResult<CrashDetails>>,
  ): Promise<void> => {
    if (settled) return;
    settled = true;
    clearInterval(tick);
    collector.stop();
    const result = await finalize();
    await message.edit({ embeds: [buildResultEmbed(result)], components: [] });
  };

  const tick = setInterval(async () => {
    if (settled) return;
    try {
      const autoResult = await tryAutoCrash(key, sessionId);
      if (autoResult) {
        settled = true;
        clearInterval(tick);
        collector.stop();
        await message.edit({ embeds: [buildResultEmbed(autoResult)], components: [] });
        return;
      }

      const remainingMs = expiresAt - Date.now();
      if (remainingMs <= 0) {
        await settle(() =>
          finalizeCrashSession(key, sessionId, {
            outcome: 'expired',
            crashPoint: state.crashPoint,
          }),
        );
        return;
      }

      if (hasCrashed(state)) {
        await settle(() =>
          finalizeCrashSession(key, sessionId, {
            outcome: 'crash',
            crashPoint: state.crashPoint,
          }),
        );
        return;
      }

      const multiplier = getCurrentMultiplier(state);
      const { refresh, snapshot } = shouldRefreshCrashDisplay(
        lastDisplaySnapshot,
        multiplier,
        remainingMs,
      );
      if (!refresh) return;
      lastDisplaySnapshot = snapshot;

      await message.edit({
        embeds: [buildCrashActiveEmbed(bet, multiplier, remainingMs)],
        components: [buildCrashActiveRow(sessionId)],
      });
    } catch (err) {
      console.error('Play hub crash tick error:', err);
    }
  }, CRASH_UI_TICK_MS);

  const collector = message.createMessageComponentCollector({
    time: gameDef.sessionTimeoutMs,
    filter: (i) =>
      i.user.id === userId &&
      (i.customId === buildCrashCashoutId(sessionId) ||
        i.customId === buildCrashQuitId(sessionId)),
  });

  collector.on('collect', async (buttonInteraction) => {
    try {
      await buttonInteraction.deferUpdate();
      if (buttonInteraction.customId === buildCrashQuitId(sessionId)) {
        await settle(() =>
          finalizeCrashSession(key, sessionId, {
            outcome: 'crash',
            crashPoint: state.crashPoint,
          }),
        );
        return;
      }
      const multiplier = getCurrentMultiplier(state);
      await settle(() =>
        finalizeCrashSession(key, sessionId, {
          outcome: 'cashout',
          multiplier,
          crashPoint: state.crashPoint,
        }),
      );
    } catch (err) {
      console.error('Play hub crash button error:', err);
    }
  });

  collector.on('end', async () => {
    if (settled) return;
    try {
      const autoResult = await tryAutoCrash(key, sessionId);
      if (autoResult) {
        settled = true;
        clearInterval(tick);
        await message.edit({ embeds: [buildResultEmbed(autoResult)], components: [] });
        return;
      }
      await settle(() =>
        finalizeCrashSession(key, sessionId, {
          outcome: 'expired',
          crashPoint: state.crashPoint,
        }),
      );
    } catch (err) {
      console.error('Play hub crash end error:', err);
    }
  });
}

async function startInteractiveGame(
  interaction: MessageComponentInteraction,
  ctx: PlayContext,
  gameId: 'blackjack' | 'crash',
  bet: number,
): Promise<void> {
  await validateWager(ctx.key, bet);

  if (gameId === 'blackjack') {
    const { session, state, immediate } = await startBlackjack(ctx.key, bet);

    if (immediate?.details) {
      await interaction.followUp({
        embeds: [
          blackjackResultEmbed(
            state,
            immediate.bet,
            immediate.details,
            immediate.payout,
            immediate.profit,
            immediate.xpAwarded,
          ),
        ],
        ephemeral: false,
      });
    } else if (session) {
      const canDouble = state.playerHand.length === 2 && !state.doubled;
      await interaction.followUp({
        embeds: [blackjackActiveEmbed(state, session.bet)],
        components: serializeButtonRows(buildBlackjackButtons(session.id, canDouble)),
        ephemeral: false,
      });
    }
  } else {
    const gameDef = getGame('crash')!;
    const { sessionId, state } = await startCrashSession(ctx.key, bet);
    const msg = await interaction.followUp({
      embeds: [
        buildCrashActiveEmbed(bet, getCurrentMultiplier(state), gameDef.sessionTimeoutMs),
      ],
      components: [buildCrashActiveRow(sessionId)],
      ephemeral: false,
      fetchReply: true,
    });
    await attachCrashMessage(sessionId, ctx.key, msg.id, msg.channelId);
    void runCrashOnMessage(msg, ctx.userId, ctx.key, bet, sessionId, state);
  }

  await resetMenuAfterPlay(interaction, ctx);
}

async function handleBetChosen(
  interaction: MessageComponentInteraction,
  ctx: PlayContext,
  gameId: GameId,
  bet: number,
): Promise<void> {
  await validateWager(ctx.key, bet);
  const game = getGame(gameId);
  if (!game) throw new ValidationError('Unknown game.');

  if (gameId === 'coinflip') {
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(embedColors.game)
          .setTitle('Coinflip')
          .setDescription(`Wager: **${formatCoins(bet)}** — pick heads or tails.`),
      ],
      components: [buildCoinflipChoiceRow(ctx.userId, bet)],
    });
    return;
  }

  if (gameId === 'roulette') {
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(embedColors.game)
          .setTitle('Roulette')
          .setDescription(`Wager: **${formatCoins(bet)}** — pick red, black, or a number.`),
      ],
      components: buildRouletteChoiceRows(ctx.userId, bet),
    });
    return;
  }

  if (gameId === 'blackjack' || gameId === 'crash') {
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(embedColors.game)
          .setTitle(game.name)
          .setDescription(`Ready to play for **${formatCoins(bet)}**?`),
      ],
      components: [buildInteractiveStartRow(ctx.userId, gameId, bet)],
    });
    return;
  }

  await interaction.deferUpdate();
  await postPublicOneshotResult(interaction, ctx, gameId, bet);
}

export async function handlePlaySelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const userId = parseUserId(interaction.customId, 2);
  if (!userId) return;

  const ctx = await getPlayContext(interaction, userId);
  if (!ctx) return;

  const gameId = interaction.values[0] as GameId;
  await showBetScreen(interaction, ctx, gameId);
}

export async function handlePlayButton(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split(':');
  const action = parts[1];
  const userId = parts[2];
  if (!action || !userId) return;

  const ctx = await getPlayContext(interaction, userId);
  if (!ctx) return;

  try {
    if (action === 'quit') {
      await interaction.deferUpdate();
      const { embed, components } = await buildPlayMenuPayload(ctx.key, ctx.userId);
      await interaction.editReply({ embeds: [embed], components });
      return;
    }

    if (action === 'back') {
      await refreshMenu(interaction, ctx);
      return;
    }

    if (action === 'custom') {
      const gameId = parts[3] as GameId;
      const modal = new ModalBuilder()
        .setCustomId(`${PREFIX}modal:bet:${userId}:${gameId}`)
        .setTitle('Custom bet')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('bet')
              .setLabel('Bet amount (coins)')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMinLength(1)
              .setMaxLength(8),
          ),
        );
      await interaction.showModal(modal);
      return;
    }

    if (action === 'bet') {
      const gameId = parts[3] as GameId;
      const bet = Number(parts[4]);
      if (!Number.isInteger(bet) || bet < 1) {
        throw new ValidationError('Invalid bet amount.');
      }
      await handleBetChosen(interaction, ctx, gameId, bet);
      return;
    }

    if (action === 'cf') {
      const bet = Number(parts[3]);
      const choice = parts[4] as CoinflipChoice;
      await interaction.deferUpdate();
      await postPublicOneshotResult(interaction, ctx, 'coinflip', bet, { coinflipChoice: choice });
      return;
    }

    if (action === 'rl') {
      const bet = Number(parts[3]);
      const choice = parts[4] as RouletteBetType;
      await interaction.deferUpdate();
      await postPublicOneshotResult(interaction, ctx, 'roulette', bet, { rouletteChoice: choice });
      return;
    }

    if (action === 'rlnum') {
      const bet = Number(parts[3]);
      const modal = new ModalBuilder()
        .setCustomId(`${PREFIX}modal:rnum:${userId}:${bet}`)
        .setTitle('Roulette number')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('number')
              .setLabel('Number (0–36)')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMinLength(1)
              .setMaxLength(2),
          ),
        );
      await interaction.showModal(modal);
      return;
    }

    if (action === 'start') {
      const gameId = parts[3] as 'blackjack' | 'crash';
      const bet = Number(parts[4]);
      await interaction.deferUpdate();
      await startInteractiveGame(interaction, ctx, gameId, bet);
    }
  } catch (err) {
    const message =
      err instanceof GamblebotError ? err.message : 'Something went wrong. Try again.';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [errorEmbed(message)], ephemeral: true });
    } else {
      await interaction.reply({ embeds: [errorEmbed(message)], ephemeral: true });
    }
  }
}

export async function handlePlayModal(interaction: ModalSubmitInteraction): Promise<void> {
  const parts = interaction.customId.split(':');
  const kind = parts[2];
  const userId = parts[3];
  if (!userId) return;

  const ctx = await getPlayContext(interaction, userId);
  if (!ctx) return;

  try {
    if (kind === 'bet') {
      const gameId = parts[4] as GameId;
      const raw = interaction.fields.getTextInputValue('bet').trim();
      const bet = Number.parseInt(raw, 10);
      if (!Number.isInteger(bet) || bet < 1) {
        throw new ValidationError('Enter a whole number of coins.');
      }

      await interaction.deferUpdate();
      const game = getGame(gameId);
      if (!game) throw new ValidationError('Unknown game.');

      if (gameId === 'coinflip') {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(embedColors.game)
              .setTitle('Coinflip')
              .setDescription(`Wager: **${formatCoins(bet)}** — pick heads or tails.`),
          ],
          components: [buildCoinflipChoiceRow(userId, bet)],
        });
        return;
      }

      if (gameId === 'roulette') {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(embedColors.game)
              .setTitle('Roulette')
              .setDescription(`Wager: **${formatCoins(bet)}** — pick red, black, or a number.`),
          ],
          components: buildRouletteChoiceRows(userId, bet),
        });
        return;
      }

      if (gameId === 'blackjack' || gameId === 'crash') {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(embedColors.game)
              .setTitle(game.name)
              .setDescription(`Ready to play for **${formatCoins(bet)}**?`),
          ],
          components: [buildInteractiveStartRow(userId, gameId, bet)],
        });
        return;
      }

      await validateWager(ctx.key, bet);
      await postPublicOneshotResult(interaction, ctx, gameId, bet);
      return;
    }

    if (kind === 'rnum') {
      const bet = Number(parts[4]);
      const raw = interaction.fields.getTextInputValue('number').trim();
      const number = Number.parseInt(raw, 10);
      if (!Number.isInteger(number) || number < 0 || number > 36) {
        throw new ValidationError('Enter a number from 0 to 36.');
      }
      await interaction.deferUpdate();
      await postPublicOneshotResult(interaction, ctx, 'roulette', bet, {
        rouletteChoice: 'number',
        rouletteNumber: number,
      });
    }
  } catch (err) {
    const message =
      err instanceof GamblebotError ? err.message : 'Something went wrong. Try again.';
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ embeds: [errorEmbed(message)], ephemeral: true });
    } else {
      await interaction.reply({ embeds: [errorEmbed(message)], ephemeral: true });
    }
  }
}

export async function openPlayMenu(interaction: {
  guildId: string | null;
  user: { id: string };
  reply: (opts: object) => Promise<unknown>;
}): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: 'Use /play in a server.',
      ephemeral: true,
    });
    return;
  }

  const key: UserKey = { discordId: interaction.user.id, guildId: interaction.guildId };
  const { embed, components } = await buildPlayMenuPayload(key, interaction.user.id);

  await interaction.reply({
    embeds: [embed],
    components,
    ephemeral: true,
  });
}
