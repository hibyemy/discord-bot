import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import {
  buildFocusRoundDeck,
  getFocusTierProfile,
  type FocusRound,
  type FocusTierProfile,
} from '../../config/focus-games.js';
import { getJobByName, pickWorkTasks } from '../../config/jobs.js';
import { GamblebotError } from '../../contracts/errors.js';
import type { UserKey } from '../../contracts/services.js';
import { emitLevelUpEvents, emitWorkEvents } from '../hooks.js';
import { economyService, jobService, progressionService } from '../../services/index.js';
import { embedColors, errorEmbed, formatCoins } from '../../utils/embeds.js';
import { formatCooldown } from '../../utils/cooldowns.js';

const FOCUS_PREFIX = 'focus:';

type FocusReplyInteraction = ChatInputCommandInteraction | ButtonInteraction;

interface FocusSession {
  sessionId: string;
  key: UserKey;
  userId: string;
  profile: FocusTierProfile;
  rounds: FocusRound[];
  roundIndex: number;
  hits: number;
  roundTimer: ReturnType<typeof setTimeout> | null;
  gapTimer: ReturnType<typeof setTimeout> | null;
  awaitingInput: boolean;
  resolved: boolean;
  replyInteraction: FocusReplyInteraction;
}

const sessions = new Map<string, FocusSession>();

export function isFocusWorkButton(customId: string): boolean {
  return customId.startsWith(FOCUS_PREFIX);
}

export function parseFocusCustomId(customId: string): {
  action: 'pick' | 'quit';
  sessionId: string;
  userId: string;
  choice?: string;
} | null {
  const parts = customId.split(':');
  if (parts.length < 4 || parts[0] !== 'focus') return null;

  const action = parts[1];
  if (action === 'quit' && parts.length === 4) {
    return { action: 'quit', sessionId: parts[2]!, userId: parts[3]! };
  }

  if (action === 'pick' && parts.length === 5) {
    return {
      action: 'pick',
      sessionId: parts[2]!,
      userId: parts[3]!,
      choice: parts[4]!,
    };
  }

  return null;
}

function clearSessionTimers(session: FocusSession): void {
  if (session.roundTimer) clearTimeout(session.roundTimer);
  if (session.gapTimer) clearTimeout(session.gapTimer);
  session.roundTimer = null;
  session.gapTimer = null;
}

function quitButton(sessionId: string, userId: string): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(`${FOCUS_PREFIX}quit:${sessionId}:${userId}`)
    .setLabel('Quit shift')
    .setStyle(ButtonStyle.Danger);
}

function roundChoiceRows(session: FocusSession, round: FocusRound): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  let current = new ActionRowBuilder<ButtonBuilder>();

  for (const choice of round.choices) {
    if (current.components.length >= 4) {
      rows.push(current);
      current = new ActionRowBuilder<ButtonBuilder>();
    }
    current.addComponents(
      new ButtonBuilder()
        .setCustomId(`${FOCUS_PREFIX}pick:${session.sessionId}:${session.userId}:${choice.key}`)
        .setLabel(choice.label)
        .setStyle(choice.style),
    );
  }

  if (current.components.length > 0) rows.push(current);
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(quitButton(session.sessionId, session.userId)));
  return rows;
}

function disabledRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${FOCUS_PREFIX}done:0:0`)
      .setLabel('Shift ended')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
  );
}

function roundEmbed(session: FocusSession, round: FocusRound, status: string): EmbedBuilder {
  const lines = [
    `**${session.profile.name}** · ${round.gameLabel}`,
    '',
    status,
  ];

  if (round.detail) lines.push(round.detail);
  lines.push(
    '',
    `Round **${session.roundIndex + 1}** / **${session.rounds.length}**`,
    `Score: **${session.hits}** correct`,
    '',
    '_Each job tier plays a different mix of mini-challenges. Pay is 3–5× passive work at full accuracy._',
  );

  return new EmbedBuilder()
    .setColor(embedColors.economy)
    .setTitle('⚡ Focus Shift')
    .setDescription(lines.join('\n'));
}

async function editSession(
  session: FocusSession,
  embed: EmbedBuilder,
  components: ActionRowBuilder<ButtonBuilder>[],
): Promise<void> {
  try {
    await session.replyInteraction.editReply({ embeds: [embed], components });
  } catch (err) {
    console.error(`Focus session edit failed [${session.sessionId}]:`, err);
  }
}

async function finishSession(
  session: FocusSession,
  reason: 'complete' | 'quit',
): Promise<void> {
  if (session.resolved) return;
  session.resolved = true;
  session.awaitingInput = false;
  clearSessionTimers(session);
  sessions.delete(session.sessionId);

  if (reason === 'quit') {
    await jobService.abortFocusWork(session.key);
    await editSession(
      session,
      new EmbedBuilder()
        .setColor(embedColors.info)
        .setTitle('Focus shift cancelled')
        .setDescription('No payout — work cooldown was not used.'),
      [disabledRow()],
    );
    return;
  }

  const previousLevel = await progressionService.getLevel(session.key);
  const result = await jobService.completeFocusWork(
    session.key,
    session.hits,
    session.rounds.length,
    session.profile,
  );
  await emitWorkEvents(session.key, result.critical);
  await emitLevelUpEvents(session.key, previousLevel, result.user.level);

  const hitPct = Math.round(result.hitRatio * 100);
  const title =
    result.payout === 0
      ? 'Focus shift failed'
      : result.critical
        ? 'Critical focus shift!'
        : 'Focus shift complete';

  const lines = [
    `**${result.minigameName}** (${result.jobName})`,
    `${session.hits}/${session.rounds.length} correct (${hitPct}%)`,
    `Payout: **${formatCoins(result.payout)}** · XP: **+${result.xp}**`,
    `Next work: **${formatCooldown(result.cooldownMs)}**`,
  ];

  if (result.payout === 0) {
    lines.unshift('_Too many misses — tier pay needs sharper focus._');
  } else if (result.critical) {
    lines.unshift('_Flawless hustle — double payout!_');
  }

  await editSession(
    session,
    new EmbedBuilder().setColor(embedColors.economy).setTitle(title).setDescription(lines.join('\n')),
    [disabledRow()],
  );
}

function scheduleNextRound(session: FocusSession): void {
  session.gapTimer = setTimeout(() => {
    void presentRound(session);
  }, session.profile.roundGapMs);
}

async function advanceAfterAnswer(
  session: FocusSession,
  round: FocusRound,
  status: string,
): Promise<void> {
  session.awaitingInput = false;
  session.roundIndex += 1;

  await editSession(session, roundEmbed(session, round, status), [disabledRow()]);

  if (session.roundIndex >= session.rounds.length) {
    await finishSession(session, 'complete');
    return;
  }

  scheduleNextRound(session);
}

async function presentRound(session: FocusSession): Promise<void> {
  if (session.resolved) return;

  const round = session.rounds[session.roundIndex];
  if (!round) {
    await finishSession(session, 'complete');
    return;
  }

  try {
    session.awaitingInput = true;
    await editSession(
      session,
      roundEmbed(session, round, round.prompt),
      roundChoiceRows(session, round),
    );
  } catch (err) {
    console.error(`Focus round present failed [${session.sessionId}]:`, err);
    await finishSession(session, 'quit');
    return;
  }

  session.roundTimer = setTimeout(() => {
    void (async () => {
      const live = sessions.get(session.sessionId);
      if (!live || live.resolved || !live.awaitingInput || live.roundIndex !== session.roundIndex) {
        return;
      }

      await advanceAfterAnswer(session, round, `⏱️ **${round.prompt}** — too slow!`);
    })();
  }, round.timeoutMs);
}

async function resolvePick(
  session: FocusSession,
  choice: string,
  interaction: ButtonInteraction,
): Promise<void> {
  const round = session.rounds[session.roundIndex];
  if (!round || !session.awaitingInput) {
    await interaction.reply({
      embeds: [errorEmbed('That round already ended.')],
      ephemeral: true,
    });
    return;
  }

  if (session.roundTimer) {
    clearTimeout(session.roundTimer);
    session.roundTimer = null;
  }

  const correct = choice === round.correctChoice;
  if (correct) session.hits += 1;

  const status = correct
    ? `✅ **${round.prompt}** — nailed it!`
    : `❌ **${round.prompt}** — wrong call!`;

  await interaction.deferUpdate();
  await editSession(session, roundEmbed(session, round, status), [disabledRow()]);

  session.awaitingInput = false;
  session.roundIndex += 1;

  if (session.roundIndex >= session.rounds.length) {
    await finishSession(session, 'complete');
    return;
  }

  scheduleNextRound(session);
}

export async function startFocusWorkSession(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  key: UserKey,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      embeds: [errorEmbed('Use focus work in a server.')],
      ephemeral: true,
    });
    return;
  }

  const userId = interaction.user.id;

  try {
    await jobService.validateWorkReady(key);
    const user = await economyService.getOrCreateUser(key);
    const job = user.activeJob ? getJobByName(user.activeJob) : undefined;
    const profile = getFocusTierProfile(job?.tier ?? 1);
    const rounds = buildFocusRoundDeck(profile);

    jobService.registerFocusSession(key);
    const sessionId = `${userId.slice(-6)}${Date.now().toString(36)}`;
    const session: FocusSession = {
      sessionId,
      key,
      userId,
      profile,
      rounds,
      roundIndex: 0,
      hits: 0,
      roundTimer: null,
      gapTimer: null,
      awaitingInput: false,
      resolved: false,
      replyInteraction: interaction,
    };
    sessions.set(sessionId, session);

    const intro = new EmbedBuilder()
      .setColor(embedColors.info)
      .setTitle(`⚡ ${profile.name}`)
      .setDescription(
        [
          profile.tagline,
          '',
          `**${rounds.length}** challenges · up to **${profile.roundTimeoutMs / 1000}s** each`,
          `Perfect run pays up to **${profile.payoutMultiplier}×** one regular work shift`,
          '',
          '_Catch runs, math snaps, pattern reads, market calls — accuracy sets your final multiplier._',
          '',
          '_Starting in a moment…_',
        ].join('\n'),
      );

    if (interaction.isChatInputCommand()) {
      await interaction.deferReply({ ephemeral: true });
    } else if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
    }

    await editSession(session, intro, []);

    session.gapTimer = setTimeout(() => {
      void presentRound(session);
    }, 1_500);
  } catch (err) {
    await jobService.abortFocusWork(key);
    const message =
      err instanceof GamblebotError ? err.message : 'Could not start focus shift.';
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ embeds: [errorEmbed(message)], components: [] });
    } else {
      await interaction.reply({ embeds: [errorEmbed(message)], ephemeral: true });
    }
  }
}

export async function handleFocusWorkButton(interaction: ButtonInteraction): Promise<void> {
  const parsed = parseFocusCustomId(interaction.customId);
  if (!parsed) return;

  if (interaction.user.id !== parsed.userId) {
    await interaction.reply({
      content: 'This focus shift belongs to another player.',
      ephemeral: true,
    });
    return;
  }

  const session = sessions.get(parsed.sessionId);
  if (!session || session.resolved) {
    await interaction.reply({
      embeds: [errorEmbed('This focus shift has already ended.')],
      ephemeral: true,
    });
    return;
  }

  if (parsed.action === 'quit') {
    await interaction.deferUpdate();
    await finishSession(session, 'quit');
    return;
  }

  if (parsed.action === 'pick' && parsed.choice) {
    await resolvePick(session, parsed.choice, interaction);
  }
}

export function buildWorkTaskPickerRows(
  prefix: string,
  userId: string,
): { tasks: ReturnType<typeof pickWorkTasks>; row: ActionRowBuilder<ButtonBuilder> } {
  const tasks = pickWorkTasks(3);
  const row = new ActionRowBuilder<ButtonBuilder>();

  for (const task of tasks) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${prefix}jobtask:${userId}:${task.id}`)
        .setLabel(task.label)
        .setEmoji(task.emoji)
        .setStyle(ButtonStyle.Primary),
    );
  }

  return { tasks, row };
}
