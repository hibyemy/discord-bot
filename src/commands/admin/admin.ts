import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ButtonInteraction,
} from 'discord.js';
import { economyConfig } from '../../config/economy.js';
import { gamesConfig } from '../../config/games.js';
import { economyService, guildConfigService, progressionService } from '../../services/index.js';
import { prisma } from '../../db.js';
import { embedColors, formatCoins, successEmbed } from '../../utils/embeds.js';
import type { Command } from '../types.js';
import { logAdminAction, requireAdmin } from './helpers.js';

function resetConfirmId(targetId: string, adminId: string): string {
  return `admin:reset:confirm:${targetId}:${adminId}`;
}

function parseResetConfirmId(customId: string): { targetId: string; adminId: string } | null {
  const parts = customId.split(':');
  if (parts.length !== 5 || parts[0] !== 'admin' || parts[1] !== 'reset' || parts[2] !== 'confirm') {
    return null;
  }
  return { targetId: parts[3]!, adminId: parts[4]! };
}

const command: Command & {
  handleResetConfirm(interaction: ButtonInteraction): Promise<void>;
} = {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Server administration commands')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('give')
        .setDescription('Give coins to a member')
        .addUserOption((opt) =>
          opt.setName('user').setDescription('Target member').setRequired(true),
        )
        .addIntegerOption((opt) =>
          opt.setName('amount').setDescription('Coins to give').setRequired(true).setMinValue(1),
        )
        .addBooleanOption((opt) =>
          opt.setName('bank').setDescription('Credit bank instead of wallet').setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('take')
        .setDescription('Remove coins from a member')
        .addUserOption((opt) =>
          opt.setName('user').setDescription('Target member').setRequired(true),
        )
        .addIntegerOption((opt) =>
          opt.setName('amount').setDescription('Coins to remove').setRequired(true).setMinValue(1),
        )
        .addBooleanOption((opt) =>
          opt.setName('bank').setDescription('Debit bank instead of wallet').setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('setlevel')
        .setDescription('Set a member level')
        .addUserOption((opt) =>
          opt.setName('user').setDescription('Target member').setRequired(true),
        )
        .addIntegerOption((opt) =>
          opt.setName('level').setDescription('New level').setRequired(true).setMinValue(1),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('reset')
        .setDescription('Reset a member economy profile (requires confirmation)')
        .addUserOption((opt) =>
          opt.setName('user').setDescription('Target member').setRequired(true),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('config')
        .setDescription('Guild configuration')
        .addSubcommand((sub) =>
          sub.setName('view').setDescription('View current guild config'),
        )
        .addSubcommand((sub) =>
          sub
            .setName('daily-multiplier')
            .setDescription('Set daily reward multiplier')
            .addNumberOption((opt) =>
              opt
                .setName('value')
                .setDescription('Multiplier (e.g. 1.5)')
                .setRequired(true)
                .setMinValue(0.1)
                .setMaxValue(10),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName('announce-channel')
            .setDescription('Set the big-win / level-up announce channel')
            .addChannelOption((opt) =>
              opt
                .setName('channel')
                .setDescription('Text channel (omit to clear)')
                .setRequired(false),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName('transfer-tax')
            .setDescription('Override P2P transfer tax rate')
            .addNumberOption((opt) =>
              opt
                .setName('rate')
                .setDescription('Decimal rate (0.05 = 5%, omit to reset)')
                .setRequired(false)
                .setMinValue(0)
                .setMaxValue(1),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName('disable-game')
            .setDescription('Disable a game in this server')
            .addStringOption((opt) =>
              opt
                .setName('game')
                .setDescription('Game to disable')
                .setRequired(true)
                .addChoices(
                  ...gamesConfig.games.map((game) => ({
                    name: game.name,
                    value: game.id,
                  })),
                ),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName('enable-game')
            .setDescription('Re-enable a game in this server')
            .addStringOption((opt) =>
              opt
                .setName('game')
                .setDescription('Game to enable')
                .setRequired(true)
                .addChoices(
                  ...gamesConfig.games.map((game) => ({
                    name: game.name,
                    value: game.id,
                  })),
                ),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName('welcome-bonus')
            .setDescription('Set welcome bonus for new users')
            .addIntegerOption((opt) =>
              opt
                .setName('amount')
                .setDescription('Bonus coins (0 to disable)')
                .setRequired(true)
                .setMinValue(0),
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('stats').setDescription('View server economy statistics'),
    ),

  async execute(interaction) {
    await requireAdmin(interaction);
    const guildId = interaction.guildId!;
    const sub = interaction.options.getSubcommand(true);
    const group = interaction.options.getSubcommandGroup(false);

    if (group === 'config') {
      await handleConfig(interaction, guildId, sub);
      return;
    }

    switch (sub) {
      case 'give':
        await handleGive(interaction, guildId);
        break;
      case 'take':
        await handleTake(interaction, guildId);
        break;
      case 'setlevel':
        await handleSetLevel(interaction, guildId);
        break;
      case 'reset':
        await handleResetPrompt(interaction, guildId);
        break;
      case 'stats':
        await handleStats(interaction, guildId);
        break;
      default:
        await interaction.reply({
          content: 'Unknown admin subcommand.',
          ephemeral: true,
        });
    }
  },

  async handleResetConfirm(interaction: ButtonInteraction) {
    await requireAdmin(interaction);
    const parsed = parseResetConfirmId(interaction.customId);
    if (!parsed || parsed.adminId !== interaction.user.id) {
      await interaction.reply({
        content: 'This confirmation is invalid or was started by someone else.',
        ephemeral: true,
      });
      return;
    }

    const guildId = interaction.guildId!;
    const key = { discordId: parsed.targetId, guildId };

    await prisma.$transaction(async (tx) => {
      await tx.transaction.deleteMany({ where: { discordId: key.discordId, guildId } });
      await tx.userUpgrade.deleteMany({ where: { discordId: key.discordId, guildId } });
      await tx.gameSession.deleteMany({ where: { discordId: key.discordId, guildId } });
      await tx.gameStats.deleteMany({ where: { discordId: key.discordId, guildId } });
      await tx.questProgress.deleteMany({ where: { discordId: key.discordId, guildId } });
      await tx.achievement.deleteMany({ where: { discordId: key.discordId, guildId } });
      await tx.user.upsert({
        where: {
          discordId_guildId: { discordId: key.discordId, guildId: key.guildId },
        },
        create: {
          discordId: key.discordId,
          guildId: key.guildId,
          wallet: economyConfig.startingBalance,
          bank: economyConfig.startingBank,
          level: economyConfig.startingLevel,
          xp: economyConfig.startingXp,
        },
        update: {
          wallet: economyConfig.startingBalance,
          bank: economyConfig.startingBank,
          level: economyConfig.startingLevel,
          xp: economyConfig.startingXp,
          activeJob: null,
          dailyStreak: 0,
          lastDaily: null,
          lastWork: null,
          cooldowns: {},
        },
      });
    });

    await logAdminAction(guildId, interaction.user.id, 'reset', parsed.targetId);
    await interaction.update({
      embeds: [
        successEmbed(
          'Profile reset',
          `<@${parsed.targetId}>'s economy profile was reset to defaults.`,
        ),
      ],
      components: [],
    });
  },
};

async function handleGive(
  interaction: Parameters<Command['execute']>[0],
  guildId: string,
): Promise<void> {
  const target = interaction.options.getUser('user', true);
  const amount = interaction.options.getInteger('amount', true);
  const toBank = interaction.options.getBoolean('bank') ?? false;
  const key = { discordId: target.id, guildId };

  await economyService.transfer(key, {
    amount,
    source: 'admin',
    toBank,
    metadata: { adminId: interaction.user.id },
  });

  await logAdminAction(guildId, interaction.user.id, 'give', target.id, {
    amount,
    toBank,
  });

  await interaction.reply({
    embeds: [
      successEmbed(
        'Coins granted',
        `Gave **${formatCoins(amount)}** to ${target}${toBank ? ' (bank)' : ''}.`,
      ),
    ],
    ephemeral: true,
  });
}

async function handleTake(
  interaction: Parameters<Command['execute']>[0],
  guildId: string,
): Promise<void> {
  const target = interaction.options.getUser('user', true);
  const amount = interaction.options.getInteger('amount', true);
  const fromBank = interaction.options.getBoolean('bank') ?? false;
  const key = { discordId: target.id, guildId };

  await economyService.transfer(key, {
    amount: -amount,
    source: 'admin',
    fromBank,
    metadata: { adminId: interaction.user.id },
  });

  await logAdminAction(guildId, interaction.user.id, 'take', target.id, {
    amount,
    fromBank,
  });

  await interaction.reply({
    embeds: [
      successEmbed(
        'Coins removed',
        `Removed **${formatCoins(amount)}** from ${target}${fromBank ? ' (bank)' : ''}.`,
      ),
    ],
    ephemeral: true,
  });
}

async function handleSetLevel(
  interaction: Parameters<Command['execute']>[0],
  guildId: string,
): Promise<void> {
  const target = interaction.options.getUser('user', true);
  const level = interaction.options.getInteger('level', true);
  const key = { discordId: target.id, guildId };

  await progressionService.setLevel(key, level);
  await logAdminAction(guildId, interaction.user.id, 'setlevel', target.id, { level });

  await interaction.reply({
    embeds: [
      successEmbed('Level updated', `Set ${target}'s level to **${level}**.`),
    ],
    ephemeral: true,
  });
}

async function handleResetPrompt(
  interaction: Parameters<Command['execute']>[0],
  guildId: string,
): Promise<void> {
  const target = interaction.options.getUser('user', true);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(resetConfirmId(target.id, interaction.user.id))
      .setLabel('Confirm reset')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('admin:reset:cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(embedColors.warning)
        .setTitle('Confirm profile reset')
        .setDescription(
          `This will wipe ${target}'s wallet, bank, level, jobs, shop upgrades, quests, achievements, and game stats in this server.`,
        ),
    ],
    components: [row],
    ephemeral: true,
  });

  await logAdminAction(guildId, interaction.user.id, 'reset_prompt', target.id);
}

async function handleConfig(
  interaction: Parameters<Command['execute']>[0],
  guildId: string,
  sub: string,
): Promise<void> {
  if (sub === 'view') {
    const config = await guildConfigService.getConfig(guildId);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(embedColors.info)
          .setTitle('Guild config')
          .addFields(
            {
              name: 'Daily multiplier',
              value: `${config.dailyBonusMultiplier}x`,
              inline: true,
            },
            {
              name: 'Transfer tax override',
              value:
                config.transferTaxOverride !== null
                  ? `${(config.transferTaxOverride * 100).toFixed(1)}%`
                  : 'Default',
              inline: true,
            },
            {
              name: 'Welcome bonus',
              value: formatCoins(config.welcomeBonus),
              inline: true,
            },
            {
              name: 'Announce channel',
              value: config.announceChannelId
                ? `<#${config.announceChannelId}>`
                : 'Not set',
              inline: true,
            },
            {
              name: 'Global leaderboard',
              value: config.globalLeaderboard ? 'Yes' : 'No',
              inline: true,
            },
            {
              name: 'Disabled games',
              value: config.disabledGames.length
                ? config.disabledGames.join(', ')
                : 'None',
              inline: false,
            },
          ),
      ],
      ephemeral: true,
    });
    return;
  }

  if (sub === 'daily-multiplier') {
    const value = interaction.options.getNumber('value', true);
    await guildConfigService.updateConfig(guildId, { dailyBonusMultiplier: value });
    await logAdminAction(guildId, interaction.user.id, 'config_daily_multiplier', undefined, {
      value,
    });
    await interaction.reply({
      embeds: [successEmbed('Config updated', `Daily multiplier set to **${value}x**.`)],
      ephemeral: true,
    });
    return;
  }

  if (sub === 'announce-channel') {
    const channel = interaction.options.getChannel('channel');
    const announceChannelId = channel?.id ?? null;
    await guildConfigService.updateConfig(guildId, { announceChannelId });
    await logAdminAction(guildId, interaction.user.id, 'config_announce_channel', undefined, {
      announceChannelId,
    });
    await interaction.reply({
      embeds: [
        successEmbed(
          'Config updated',
          announceChannelId
            ? `Announce channel set to <#${announceChannelId}>.`
            : 'Announce channel cleared.',
        ),
      ],
      ephemeral: true,
    });
    return;
  }

  if (sub === 'transfer-tax') {
    const rate = interaction.options.getNumber('rate');
    await guildConfigService.updateConfig(guildId, {
      transferTaxOverride: rate ?? null,
    });
    await logAdminAction(guildId, interaction.user.id, 'config_transfer_tax', undefined, {
      rate,
    });
    await interaction.reply({
      embeds: [
        successEmbed(
          'Config updated',
          rate !== null
            ? `Transfer tax override set to **${(rate * 100).toFixed(1)}%**.`
            : 'Transfer tax override cleared (using default).',
        ),
      ],
      ephemeral: true,
    });
    return;
  }

  if (sub === 'disable-game') {
    const game = interaction.options.getString('game', true);
    const config = await guildConfigService.getConfig(guildId);
    if (!config.disabledGames.includes(game)) {
      await guildConfigService.updateConfig(guildId, {
        disabledGames: [...config.disabledGames, game],
      });
    }
    await logAdminAction(guildId, interaction.user.id, 'config_disable_game', undefined, {
      game,
    });
    await interaction.reply({
      embeds: [successEmbed('Config updated', `Disabled **${game}**.`)],
      ephemeral: true,
    });
    return;
  }

  if (sub === 'enable-game') {
    const game = interaction.options.getString('game', true);
    const config = await guildConfigService.getConfig(guildId);
    await guildConfigService.updateConfig(guildId, {
      disabledGames: config.disabledGames.filter((id) => id !== game),
    });
    await logAdminAction(guildId, interaction.user.id, 'config_enable_game', undefined, {
      game,
    });
    await interaction.reply({
      embeds: [successEmbed('Config updated', `Enabled **${game}**.`)],
      ephemeral: true,
    });
    return;
  }

  if (sub === 'welcome-bonus') {
    const amount = interaction.options.getInteger('amount', true);
    await guildConfigService.updateConfig(guildId, { welcomeBonus: amount });
    await logAdminAction(guildId, interaction.user.id, 'config_welcome_bonus', undefined, {
      amount,
    });
    await interaction.reply({
      embeds: [
        successEmbed('Config updated', `Welcome bonus set to **${formatCoins(amount)}**.`),
      ],
      ephemeral: true,
    });
  }
}

async function handleStats(
  interaction: Parameters<Command['execute']>[0],
  guildId: string,
): Promise<void> {
  const [userCount, walletSum, bankSum, txCount, gamesPlayed] = await Promise.all([
    prisma.user.count({ where: { guildId } }),
    prisma.user.aggregate({ where: { guildId }, _sum: { wallet: true } }),
    prisma.user.aggregate({ where: { guildId }, _sum: { bank: true } }),
    prisma.transaction.count({ where: { guildId } }),
    prisma.gameStats.aggregate({
      where: { guildId },
      _sum: { gamesPlayed: true },
    }),
  ]);

  const wallet = walletSum._sum.wallet ?? 0;
  const bank = bankSum._sum.bank ?? 0;

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(embedColors.info)
        .setTitle('Server stats')
        .addFields(
          { name: 'Users', value: `${userCount}`, inline: true },
          { name: 'Wallet total', value: formatCoins(wallet), inline: true },
          { name: 'Bank total', value: formatCoins(bank), inline: true },
          { name: 'Net worth', value: formatCoins(wallet + bank), inline: true },
          { name: 'Transactions', value: `${txCount}`, inline: true },
          {
            name: 'Games played',
            value: `${gamesPlayed._sum.gamesPlayed ?? 0}`,
            inline: true,
          },
        ),
    ],
    ephemeral: true,
  });
}

export default command;
