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
  UserSelectMenuBuilder,
  type ButtonInteraction,
  type Client,
  type MessageComponentInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  type UserSelectMenuInteraction,
} from 'discord.js';
import type { Transaction } from '@prisma/client';
import type { AchievementCategory } from '../../config/achievements.js';
import { getJobByName } from '../../config/jobs.js';
import { formatRankTier, getRankTierForLevel } from '../../config/ranks.js';
import { GamblebotError, ValidationError } from '../../contracts/errors.js';
import type { UserKey } from '../../contracts/services.js';
import { emitDailyClaimEvents, emitDepositEvents, emitLevelUpEvents, emitPayEvents, emitShopPurchaseEvents, emitWorkEvents } from '../hooks.js';
import { buildPlayMenuPayload } from './play.handler.js';
import {
  handleQuestClaimButton,
  questBoardEmbed,
  questClaimButtonRow,
} from './quests.handler.js';
import {
  achievementService,
  economyService,
  guildConfigService,
  jobService,
  progressionService,
  questService,
  shopService,
} from '../../services/index.js';
import { embedColors, errorEmbed, formatCoins, infoEmbed, profileEmbed } from '../../utils/embeds.js';
import { formatCooldown } from '../../utils/cooldowns.js';
import { dailyResetLine } from '../../utils/daily-reset.js';
import {
  fetchLeaderboard,
  formatLeaderboardLines,
  LEADERBOARD_SIZE,
  TYPE_META,
  type LeaderboardType,
  formatRankingLine,
  getUserRankings,
} from '../../utils/rankings.js';

const PREFIX = 'menu:';

const CATEGORY_ORDER: AchievementCategory[] = [
  'economy',
  'jobs',
  'games',
  'social',
  'progression',
];

const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  economy: 'Economy',
  jobs: 'Jobs',
  games: 'Games',
  social: 'Social',
  progression: 'Progression',
};

interface MenuContext {
  userId: string;
  guildId: string;
  key: UserKey;
}

interface MenuPayload {
  embed: EmbedBuilder;
  components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder | UserSelectMenuBuilder>[];
}

/** Discord.js expects `embeds[]`; our builders use a single `embed`. */
function toMessageOptions(payload: MenuPayload | { embeds: EmbedBuilder[]; components: MenuPayload['components'] }) {
  if ('embeds' in payload) {
    return { embeds: payload.embeds, components: payload.components };
  }
  return { embeds: [payload.embed], components: payload.components };
}

async function applyMenuPayload(
  interaction: MessageComponentInteraction,
  payload: MenuPayload,
  mode: 'update' | 'edit',
): Promise<void> {
  const options = toMessageOptions(payload);
  if (mode === 'edit') {
    await interaction.editReply(options);
  } else {
    await interaction.update(options);
  }
}

function parseUserIdFromParts(parts: string[], index: number): string | null {
  return parts[index] ?? null;
}

function assertOwner(
  interaction: MessageComponentInteraction | ModalSubmitInteraction | UserSelectMenuInteraction,
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

async function getMenuContext(
  interaction: MessageComponentInteraction | ModalSubmitInteraction | UserSelectMenuInteraction,
  userId: string,
): Promise<MenuContext | null> {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'Use /menu in a server.', ephemeral: true });
    return null;
  }
  if (!assertOwner(interaction, userId)) return null;
  return {
    userId,
    guildId: interaction.guildId,
    key: { discordId: userId, guildId: interaction.guildId },
  };
}

function backButton(userId: string, label = 'Back to main menu'): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(`${PREFIX}home:${userId}`)
    .setLabel(label)
    .setStyle(ButtonStyle.Secondary);
}

function backToProgressionButton(userId: string): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(`${PREFIX}back:prog:${userId}`)
    .setLabel('Back')
    .setStyle(ButtonStyle.Secondary);
}

async function resolveDisplayName(
  client: Client,
  guildId: string,
  discordId: string,
): Promise<string> {
  try {
    const guild = client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId));
    const member = await guild.members.fetch(discordId).catch(() => null);
    if (member) return member.displayName;
    const user = await client.users.fetch(discordId);
    return user.displayName;
  } catch {
    return discordId;
  }
}

function formatTransaction(tx: Transaction): string {
  const sign = tx.amount >= 0 ? '+' : '';
  const when = `<t:${Math.floor(tx.createdAt.getTime() / 1000)}:R>`;
  return `${sign}${tx.amount.toLocaleString()} · ${tx.source.replace(/_/g, ' ')} · ${when}`;
}

export function isMenuSelect(customId: string): boolean {
  if (!customId.startsWith(PREFIX)) return false;
  const parts = customId.split(':');
  if (parts.length !== 3) return false;
  const kind = parts[1];
  return kind === 'cat' || kind === 'jobset' || kind === 'shopbuy' || kind === 'lbtype';
}

export function isMenuUserSelect(customId: string): boolean {
  return customId.startsWith(`${PREFIX}payto:`);
}

export function isMenuButton(customId: string): boolean {
  return customId.startsWith(PREFIX) && !isMenuSelect(customId) && !isMenuModal(customId);
}

export function isMenuModal(customId: string): boolean {
  return customId.startsWith(`${PREFIX}modal:`);
}

export async function buildMainMenuPayload(key: UserKey, userId: string) {
  const [balance, level] = await Promise.all([
    economyService.getBalance(key),
    progressionService.getLevel(key),
  ]);

  const embed = new EmbedBuilder()
    .setColor(embedColors.info)
    .setTitle('🏠 Gamblebot Hub')
    .setDescription(
      [
        `**Wallet:** ${formatCoins(balance.wallet)} · **Bank:** ${formatCoins(balance.bank)} · **Level:** ${level}`,
        dailyResetLine(),
        '',
        'Choose a category below. This menu is **private** — only you see it.',
        'Individual slash commands still work if you prefer them.',
        '',
        '💰 **Economy** — balance, daily, bank, pay',
        '💼 **Jobs** — pick a job & work shifts',
        '🎰 **Games** — casino hub (all games)',
        '🛒 **Shop** — upgrades & inventory',
        '⭐ **Progression** — profile, quests, ranks',
      ].join('\n'),
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${PREFIX}cat:${userId}`)
      .setPlaceholder('Choose a category…')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('Economy')
          .setDescription('Balance, daily, deposit, withdraw, pay')
          .setValue('economy')
          .setEmoji('💰'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Jobs')
          .setDescription('Set active job and work')
          .setValue('jobs')
          .setEmoji('💼'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Games')
          .setDescription('Coinflip, slots, blackjack, crash…')
          .setValue('games')
          .setEmoji('🎰'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Shop')
          .setDescription('Browse and buy upgrades')
          .setValue('shop')
          .setEmoji('🛒'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Progression')
          .setDescription('Profile, quests, rank, leaderboard')
          .setValue('progression')
          .setEmoji('⭐'),
      ),
  );

  return { embed, components: [row] };
}

async function buildEconomyPayload(key: UserKey, userId: string) {
  const balance = await economyService.getBalance(key);
  const embed = infoEmbed(
    '💰 Economy',
    [
      `**Wallet:** ${formatCoins(balance.wallet)}`,
      `**Bank:** ${formatCoins(balance.bank)}`,
      `**Net worth:** ${formatCoins(balance.netWorth)}`,
      '',
      dailyResetLine(),
      '',
      'Pick an action below.',
    ].join('\n'),
  );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PREFIX}eco:bal:${userId}`)
      .setLabel('Balance')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}eco:daily:${userId}`)
      .setLabel('Daily')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}eco:tx:${userId}`)
      .setLabel('Transactions')
      .setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PREFIX}eco:dep:${userId}`)
      .setLabel('Deposit')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}eco:with:${userId}`)
      .setLabel('Withdraw')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}eco:pay:${userId}`)
      .setLabel('Pay')
      .setStyle(ButtonStyle.Primary),
  );

  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(backButton(userId));

  return { embed, components: [row1, row2, row3] };
}

async function buildJobsPayload(key: UserKey, userId: string) {
  const [jobs, cooldownMs] = await Promise.all([
    jobService.getAvailableJobs(key),
    jobService.getWorkCooldownRemaining(key),
  ]);

  const active = jobs.find((j) => j.active);
  const lines = jobs.map((job) => {
    const unlockLevel = getJobByName(job.name)?.unlockLevel ?? '?';
    const status = job.active
      ? '**[Active]**'
      : job.unlocked
        ? 'Unlocked'
        : `🔒 Lv.${unlockLevel}`;
    return `${status} **${job.name}** (T${job.tier}) — ~${formatCoins(job.basePay)} · ${formatCooldown(job.cooldownMs)} CD`;
  });

  const embed = infoEmbed('💼 Jobs', lines.join('\n'));
  embed.setDescription(
    [
      embed.data.description ?? '',
      '',
      active
        ? `**Active job:** ${active.name}`
        : '**No active job** — pick one from the dropdown.',
      cooldownMs > 0
        ? `**Work cooldown:** ${formatCooldown(cooldownMs)}`
        : '**Ready to work!**',
      '',
      dailyResetLine(),
    ].join('\n'),
  );

  const unlocked = jobs.filter((j) => j.unlocked);
  const components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

  if (unlocked.length > 0) {
    components.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${PREFIX}jobset:${userId}`)
          .setPlaceholder('Set active job…')
          .addOptions(
            unlocked.slice(0, 25).map((job) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(job.name)
                .setDescription(`Tier ${job.tier} · ~${formatCoins(job.basePay)}`)
                .setValue(job.name)
                .setDefault(job.active),
            ),
          ),
      ),
    );
  }

  const workLabel =
    cooldownMs > 0 ? `Work (${formatCooldown(cooldownMs)})` : 'Work now';

  components.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIX}job:work:${userId}`)
        .setLabel(workLabel)
        .setStyle(cooldownMs > 0 ? ButtonStyle.Secondary : ButtonStyle.Success)
        .setDisabled(cooldownMs > 0 || !active),
      backButton(userId),
    ),
  );

  return { embed, components };
}

async function buildShopPayload(key: UserKey, userId: string) {
  const items = await shopService.listItems(key);
  const byTier = new Map<number, typeof items>();

  for (const item of items) {
    const tierItems = byTier.get(item.tier) ?? [];
    tierItems.push(item);
    byTier.set(item.tier, tierItems);
  }

  const lines: string[] = [];
  for (const tier of [...byTier.keys()].sort((a, b) => a - b)) {
    lines.push(`**Tier ${tier}**`);
    for (const item of byTier.get(tier)!) {
      const lock = item.unlocked ? '' : ' 🔒';
      const rank = `${item.currentRank}/${item.maxRank}`;
      const cost =
        item.nextCost !== null ? formatCoins(item.nextCost) : 'MAX';
      lines.push(`${lock} **${item.name}** (${rank}) — ${cost}\n> ${item.description}`);
    }
    lines.push('');
  }

  const embed = infoEmbed('🛒 Shop', lines.join('\n').trim() || 'No items available.');
  embed.setFooter({ text: 'Select an upgrade to buy, or view inventory' });

  const buyable = items.filter((i) => i.unlocked && i.nextCost !== null);
  const components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

  if (buyable.length > 0) {
    components.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${PREFIX}shopbuy:${userId}`)
          .setPlaceholder('Buy upgrade…')
          .addOptions(
            buyable.slice(0, 25).map((item) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(item.name)
                .setDescription(`${item.currentRank}/${item.maxRank} — ${formatCoins(item.nextCost!)}`)
                .setValue(item.id),
            ),
          ),
      ),
    );
  }

  components.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIX}shop:inv:${userId}`)
        .setLabel('Inventory')
        .setStyle(ButtonStyle.Secondary),
      backButton(userId),
    ),
  );

  return { embed, components };
}

function buildProgressionPayload(userId: string) {
  const embed = infoEmbed(
    '⭐ Progression',
    ['Profile, quests, achievements, rank, and leaderboards.', '', dailyResetLine()].join('\n'),
  );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PREFIX}prog:profile:${userId}`)
      .setLabel('Profile')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}prog:rank:${userId}`)
      .setLabel('Rank')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}prog:quests:${userId}`)
      .setLabel('Quests')
      .setStyle(ButtonStyle.Primary),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PREFIX}prog:ach:${userId}`)
      .setLabel('Achievements')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}prog:lb:${userId}`)
      .setLabel('Leaderboard')
      .setStyle(ButtonStyle.Secondary),
    backButton(userId),
  );

  return { embed, components: [row1, row2] };
}

async function showCategory(
  interaction: MessageComponentInteraction,
  ctx: MenuContext,
  category: string,
  editReply = false,
): Promise<void> {
  switch (category) {
    case 'economy': {
      await applyMenuPayload(
        interaction,
        await buildEconomyPayload(ctx.key, ctx.userId),
        editReply ? 'edit' : 'update',
      );
      return;
    }
    case 'jobs': {
      await applyMenuPayload(
        interaction,
        await buildJobsPayload(ctx.key, ctx.userId),
        editReply ? 'edit' : 'update',
      );
      return;
    }
    case 'games': {
      const payload = await buildPlayMenuPayload(ctx.key, ctx.userId);
      const embed = EmbedBuilder.from(payload.embed).setFooter({
        text: 'Casino hub · Back returns to main menu',
      });
      const components = [
        ...payload.components,
        new ActionRowBuilder<ButtonBuilder>().addComponents(backButton(ctx.userId)),
      ];
      const options = { embeds: [embed], components };
      if (editReply) {
        await interaction.editReply(options);
      } else {
        await interaction.update(options);
      }
      return;
    }
    case 'shop': {
      await applyMenuPayload(
        interaction,
        await buildShopPayload(ctx.key, ctx.userId),
        editReply ? 'edit' : 'update',
      );
      return;
    }
    case 'progression': {
      await applyMenuPayload(
        interaction,
        buildProgressionPayload(ctx.userId),
        editReply ? 'edit' : 'update',
      );
      return;
    }
    default:
      throw new ValidationError('Unknown category.');
  }
}

async function handleMenuError(
  interaction: MessageComponentInteraction | ModalSubmitInteraction | UserSelectMenuInteraction,
  err: unknown,
): Promise<void> {
  const message =
    err instanceof GamblebotError ? err.message : 'Something went wrong. Try again.';
  const payload = { embeds: [errorEmbed(message)], ephemeral: true };
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(payload);
  } else {
    await interaction.reply(payload);
  }
}

export async function openMainMenu(interaction: {
  guildId: string | null;
  user: { id: string };
  reply: (opts: object) => Promise<unknown>;
}): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'Use /menu in a server.', ephemeral: true });
    return;
  }

  const key: UserKey = { discordId: interaction.user.id, guildId: interaction.guildId };
  const { embed, components } = await buildMainMenuPayload(key, interaction.user.id);

  await interaction.reply({ embeds: [embed], components, ephemeral: true });
}

export async function openGamesMenu(interaction: {
  guildId: string | null;
  user: { id: string };
  reply: (opts: object) => Promise<unknown>;
}): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'Use /play in a server.', ephemeral: true });
    return;
  }

  const key: UserKey = { discordId: interaction.user.id, guildId: interaction.guildId };
  const payload = await buildPlayMenuPayload(key, interaction.user.id);
  const components = [
    ...payload.components,
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIX}home:${interaction.user.id}`)
        .setLabel('Main menu')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];

  await interaction.reply({
    embeds: [payload.embed],
    components,
    ephemeral: true,
  });
}

export async function handleMenuSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const parts = interaction.customId.split(':');

  if (parts[1] === 'cat') {
    const userId = parseUserIdFromParts(parts, 2);
    if (!userId) return;
    const ctx = await getMenuContext(interaction, userId);
    if (!ctx) return;
    const category = interaction.values[0]!;
    await interaction.deferUpdate();
    await showCategory(interaction, ctx, category, true);
    return;
  }

  const userId = parseUserIdFromParts(parts, 2);
  if (!userId) return;
  const ctx = await getMenuContext(interaction, userId);
  if (!ctx) return;

  if (parts[1] === 'jobset') {
    await interaction.deferUpdate();
    const jobName = interaction.values[0]!;
    const user = await jobService.setJob(ctx.key, jobName);
    const payload = await buildJobsPayload(ctx.key, ctx.userId);
    payload.embed.setDescription(
      `${payload.embed.data.description ?? ''}\n\n✅ Active job set to **${user.activeJob}**.`,
    );
    await interaction.editReply(toMessageOptions(payload));
    return;
  }

  if (parts[1] === 'shopbuy') {
    await interaction.deferUpdate();
    const upgradeId = interaction.values[0]!;
    await shopService.buy(ctx.key, upgradeId);
    await emitShopPurchaseEvents(ctx.key);

    const payload = await buildShopPayload(ctx.key, ctx.userId);
    payload.embed.setDescription(
      `${payload.embed.data.description ?? ''}\n\n✅ Purchased **${upgradeId}** upgrade.`,
    );
    await interaction.editReply(toMessageOptions(payload));
    return;
  }

  if (parts[1] === 'lbtype') {
    await interaction.deferUpdate();
    const type = interaction.values[0] as LeaderboardType;
    const config = await guildConfigService.getConfig(ctx.guildId);
    const rows = await fetchLeaderboard(type, ctx.guildId, config.globalLeaderboard);
    const names = new Map<string, string>();
    await Promise.all(
      rows.map(async (row) => {
        names.set(
          row.discordId,
          await resolveDisplayName(interaction.client, ctx.guildId, row.discordId),
        );
      }),
    );

    const meta = TYPE_META[type];
    const embed = new EmbedBuilder()
      .setColor(embedColors.info)
      .setTitle(`${meta.title} — Top ${LEADERBOARD_SIZE}`)
      .setDescription(formatLeaderboardLines(rows, names, meta.format))
      .setFooter({ text: config.globalLeaderboard ? 'Global' : 'This server' });

    await interaction.editReply({
      embeds: [embed],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(backToProgressionButton(userId)),
      ],
    });
  }
}

export async function handleMenuUserSelect(interaction: UserSelectMenuInteraction): Promise<void> {
  const parts = interaction.customId.split(':');
  if (parts[1] !== 'payto') return;

  const userId = parseUserIdFromParts(parts, 2);
  if (!userId) return;
  const ctx = await getMenuContext(interaction, userId);
  if (!ctx) return;

  const target = interaction.users.first();
  if (!target) {
    throw new ValidationError('Select a member to pay.');
  }
  if (target.bot) {
    throw new ValidationError('You cannot pay bots.');
  }

  const modal = new ModalBuilder()
    .setCustomId(`${PREFIX}modal:pay:${userId}:${target.id}`)
    .setTitle(`Pay ${target.displayName}`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('amount')
          .setLabel('Amount (coins)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(8),
      ),
    );

  await interaction.showModal(modal);
}

export async function handleMenuButton(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split(':');
  const section = parts[1];
  if (!section) return;

  const needsModal =
    section === 'eco' && (parts[2] === 'dep' || parts[2] === 'with');

  try {
    if (section === 'home') {
      const userId = parseUserIdFromParts(parts, 2);
      if (!userId) return;
      const ctx = await getMenuContext(interaction, userId);
      if (!ctx) return;
      await interaction.deferUpdate();
      const payload = await buildMainMenuPayload(ctx.key, ctx.userId);
      await interaction.editReply(toMessageOptions(payload));
      return;
    }

    if (section === 'back') {
      const target = parts[2];
      const userId = parseUserIdFromParts(parts, 3);
      if (!userId || !target) return;
      const ctx = await getMenuContext(interaction, userId);
      if (!ctx) return;
      await interaction.deferUpdate();
      if (target === 'prog') {
        await interaction.editReply(toMessageOptions(buildProgressionPayload(ctx.userId)));
        return;
      }
      if (target === 'eco') {
        await interaction.editReply(
          toMessageOptions(await buildEconomyPayload(ctx.key, ctx.userId)),
        );
        return;
      }
      return;
    }

    const userId = parts[parts.length - 1];
    if (!userId) return;
    const ctx = await getMenuContext(interaction, userId);
    if (!ctx) return;

    if (needsModal) {
      const action = parts[2];
      if (action === 'dep') {
        await interaction.showModal(
          new ModalBuilder()
            .setCustomId(`${PREFIX}modal:dep:${userId}`)
            .setTitle('Deposit to bank')
            .addComponents(
              new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                  .setCustomId('amount')
                  .setLabel('Amount (coins)')
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true),
              ),
            ),
        );
        return;
      }
      if (action === 'with') {
        await interaction.showModal(
          new ModalBuilder()
            .setCustomId(`${PREFIX}modal:with:${userId}`)
            .setTitle('Withdraw from bank')
            .addComponents(
              new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                  .setCustomId('amount')
                  .setLabel('Amount (coins)')
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true),
              ),
            ),
        );
        return;
      }
    }

    await interaction.deferUpdate();

    if (section === 'eco') {
      const action = parts[2];
      switch (action) {
        case 'bal': {
          const balance = await economyService.getBalance(ctx.key);
          const embed = new EmbedBuilder()
            .setColor(embedColors.economy)
            .setTitle('Your Balance')
            .addFields(
              { name: 'Wallet', value: formatCoins(balance.wallet), inline: true },
              { name: 'Bank', value: formatCoins(balance.bank), inline: true },
              { name: 'Net Worth', value: formatCoins(balance.netWorth), inline: true },
            );
          const payload = await buildEconomyPayload(ctx.key, ctx.userId);
          await interaction.editReply({
            embeds: [embed, payload.embed],
            components: payload.components,
          });
          return;
        }
        case 'daily': {
          const result = await economyService.applyDaily(ctx.key);
          await emitDailyClaimEvents(ctx.key, result.streak);
          const payload = await buildEconomyPayload(ctx.key, ctx.userId);
          payload.embed.setDescription(
            [
              payload.embed.data.description ?? '',
              '',
              `✅ **Daily claimed** — +${formatCoins(result.amount)} · Streak **${result.streak}** day(s)`,
            ].join('\n'),
          );
          await interaction.editReply(toMessageOptions(payload));
          return;
        }
        case 'tx': {
          const transactions = await economyService.getTransactions(ctx.key, 10);
          const description =
            transactions.length === 0
              ? 'No transactions yet.'
              : transactions.map(formatTransaction).join('\n');
          const txEmbed = infoEmbed('Recent Transactions', description);
          const payload = await buildEconomyPayload(ctx.key, ctx.userId);
          await interaction.editReply({
            embeds: [txEmbed, payload.embed],
            components: payload.components,
          });
          return;
        }
        case 'pay': {
          await interaction.editReply({
            embeds: [
              infoEmbed('Pay Member', 'Select who you want to pay from the dropdown below.'),
            ],
            components: [
              new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
                new UserSelectMenuBuilder()
                  .setCustomId(`${PREFIX}payto:${userId}`)
                  .setPlaceholder('Choose a member…'),
              ),
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                backButton(userId, 'Cancel'),
              ),
            ],
          });
          return;
        }
      }
    }

    if (section === 'job' && parts[2] === 'work') {
      const previousLevel = await progressionService.getLevel(ctx.key);
      const result = await jobService.work(ctx.key);
      await emitWorkEvents(ctx.key, result.critical);
      await emitLevelUpEvents(ctx.key, previousLevel, result.user.level);

      const title = result.critical ? 'Critical work success!' : 'Work complete';
      const payload = await buildJobsPayload(ctx.key, ctx.userId);
      payload.embed.setDescription(
        [
          payload.embed.data.description ?? '',
          '',
          `✅ **${title}**`,
          `**${result.jobName}** — +${formatCoins(result.payout)} · +${result.xp} XP`,
        ].join('\n'),
      );
      await interaction.editReply(toMessageOptions(payload));
      return;
    }

    if (section === 'shop' && parts[2] === 'inv') {
      const items = await shopService.listItems(ctx.key);
      const owned = items.filter((item) => item.currentRank > 0);
      const multipliers = await shopService.getActiveMultipliers(ctx.key);

      let invEmbed: EmbedBuilder;
      if (owned.length === 0) {
        invEmbed = infoEmbed('Inventory', 'You do not own any upgrades yet.');
      } else {
        const lines = owned.map(
          (item) => `**${item.name}** (${item.currentRank}/${item.maxRank})\n> ${item.description}`,
        );
        invEmbed = infoEmbed('Inventory', lines.join('\n\n'));
        invEmbed.addFields({
          name: 'Active effects',
          value: [
            `Job payout: **${Math.round((multipliers.jobPayout - 1) * 100)}%**`,
            `Win chance: **+${(multipliers.winChanceBonus * 100).toFixed(1)}%**`,
            `Cooldown reduction: **${Math.round(multipliers.cooldownReduction * 100)}%**`,
          ].join('\n'),
        });
      }

      const payload = await buildShopPayload(ctx.key, ctx.userId);
      await interaction.editReply({
        embeds: [invEmbed, payload.embed],
        components: payload.components,
      });
      return;
    }

    if (section === 'prog') {
      const action = parts[2];
      switch (action) {
        case 'profile': {
          const xp = await progressionService.xpProgress(ctx.key);
          const badges = await achievementService.getProfileBadges(ctx.key);
          const dbUser = await economyService.getOrCreateUser(ctx.key);
          const embed = profileEmbed(interaction.user, {
            level: dbUser.level,
            xp: xp.current,
            xpRequired: xp.required,
            wallet: dbUser.wallet,
            bank: dbUser.bank,
            activeJob: dbUser.activeJob,
            dailyStreak: dbUser.dailyStreak,
            badges: badges.length > 0 ? badges : ['No badges yet'],
          });
          await interaction.editReply({
            embeds: [embed],
            components: [
              new ActionRowBuilder<ButtonBuilder>().addComponents(backToProgressionButton(userId)),
            ],
          });
          return;
        }
        case 'rank': {
          const [user, config] = await Promise.all([
            economyService.getOrCreateUser(ctx.key),
            guildConfigService.getConfig(ctx.guildId),
          ]);
          const tierProgress = getRankTierForLevel(user.level);
          const rankings = await getUserRankings(
            ctx.guildId,
            ctx.userId,
            config.globalLeaderboard,
          );
          const embed = new EmbedBuilder()
            .setColor(embedColors.info)
            .setTitle(`${interaction.user.displayName}'s Rank`)
            .addFields(
              {
                name: 'Title',
                value: [
                  `**${formatRankTier(tierProgress.current)}**`,
                  `Level **${user.level}**`,
                ].join('\n'),
              },
              {
                name: 'Standings',
                value: rankings.map(formatRankingLine).join('\n'),
              },
            );
          await interaction.editReply({
            embeds: [embed],
            components: [
              new ActionRowBuilder<ButtonBuilder>().addComponents(backToProgressionButton(userId)),
            ],
          });
          return;
        }
        case 'quests': {
          const board = await questService.getDailyQuests(ctx.key);
          const questEmbed = questBoardEmbed(board);
          questEmbed.setDescription(
            `${questEmbed.data.description ?? ''}\n\n_${dailyResetLine()}_`,
          );
          await interaction.editReply({
            embeds: [questEmbed],
            components: [
              questClaimButtonRow(board),
              new ActionRowBuilder<ButtonBuilder>().addComponents(backToProgressionButton(userId)),
            ],
          });
          return;
        }
        case 'ach': {
          const achievements = await achievementService.getAllWithStatus(ctx.key);
          const earnedCount = achievements.filter((a) => a.earned).length;
          const embed = new EmbedBuilder()
            .setColor(embedColors.info)
            .setTitle(`${interaction.user.displayName}'s Achievements`)
            .setDescription(`**${earnedCount}/${achievements.length}** unlocked`);

          for (const category of CATEGORY_ORDER) {
            const inCategory = achievements.filter((a) => a.category === category);
            if (inCategory.length === 0) continue;
            embed.addFields({
              name: CATEGORY_LABELS[category],
              value: inCategory
                .map((a) =>
                  `${a.earned ? '✅' : '🔒'} **${a.name}** — ${a.description}`,
                )
                .join('\n')
                .slice(0, 1024),
            });
          }

          await interaction.editReply({
            embeds: [embed],
            components: [
              new ActionRowBuilder<ButtonBuilder>().addComponents(backToProgressionButton(userId)),
            ],
          });
          return;
        }
        case 'lb': {
          await interaction.editReply({
            embeds: [infoEmbed('Leaderboard', 'Pick a category to view the top 10.')],
            components: [
              new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                  .setCustomId(`${PREFIX}lbtype:${userId}`)
                  .setPlaceholder('Leaderboard type…')
                  .addOptions(
                    { label: 'Richest', value: 'richest' },
                    { label: 'Level', value: 'level' },
                    { label: 'Wins', value: 'wins' },
                    { label: 'Daily Streak', value: 'streak' },
                    { label: 'Jobs', value: 'jobs' },
                  ),
              ),
              new ActionRowBuilder<ButtonBuilder>().addComponents(backToProgressionButton(userId)),
            ],
          });
        }
      }
    }
  } catch (err) {
    await handleMenuError(interaction, err);
  }
}

export async function handleMenuModal(interaction: ModalSubmitInteraction): Promise<void> {
  const parts = interaction.customId.split(':');
  if (parts[1] !== 'modal') return;

  const kind = parts[2];
  const userId = parts[3];
  if (!userId) return;

  const ctx = await getMenuContext(interaction, userId);
  if (!ctx) return;

  try {
    await interaction.deferUpdate();

    const amount = Number.parseInt(interaction.fields.getTextInputValue('amount').trim(), 10);

    if (kind === 'dep') {
      if (!Number.isInteger(amount) || amount < 1) {
        throw new ValidationError('Enter a valid amount.');
      }
      const user = await economyService.deposit(ctx.key, amount);
      await emitDepositEvents(ctx.key, amount);
      const payload = await buildEconomyPayload(ctx.key, ctx.userId);
      payload.embed.setDescription(
        [
          payload.embed.data.description ?? '',
          '',
          `✅ **Deposited** — ${formatCoins(amount)} to bank`,
          `Wallet: ${formatCoins(user.wallet)} · Bank: ${formatCoins(user.bank)}`,
        ].join('\n'),
      );
      await interaction.editReply(toMessageOptions(payload));
      return;
    }

    if (kind === 'with') {
      if (!Number.isInteger(amount) || amount < 1) {
        throw new ValidationError('Enter a valid amount.');
      }
      const user = await economyService.withdraw(ctx.key, amount);
      const payload = await buildEconomyPayload(ctx.key, ctx.userId);
      payload.embed.setDescription(
        [
          payload.embed.data.description ?? '',
          '',
          `✅ **Withdrawn** — ${formatCoins(amount)} to wallet`,
          `Wallet: ${formatCoins(user.wallet)} · Bank: ${formatCoins(user.bank)}`,
        ].join('\n'),
      );
      await interaction.editReply(toMessageOptions(payload));
      return;
    }

    if (kind === 'pay') {
      const targetId = parts[4];
      if (!targetId || !Number.isInteger(amount) || amount < 1) {
        throw new ValidationError('Enter a valid amount.');
      }
      const result = await economyService.transferBetween(
        ctx.key,
        { discordId: targetId, guildId: ctx.guildId },
        amount,
        'transfer_out',
      );
      await emitPayEvents(ctx.key, result.sent);
      const payload = await buildEconomyPayload(ctx.key, ctx.userId);
      payload.embed.setDescription(
        [
          payload.embed.data.description ?? '',
          '',
          `✅ **Payment sent** — ${formatCoins(result.sent)} (received ${formatCoins(result.received)})`,
        ].join('\n'),
      );
      await interaction.editReply(toMessageOptions(payload));
    }
  } catch (err) {
    await handleMenuError(interaction, err);
  }
}
