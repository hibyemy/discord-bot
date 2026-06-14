import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { economyConfig } from '../config/economy.js';
import { gamesConfig } from '../config/games.js';
import { embedColors } from '../utils/embeds.js';
import type { Command } from './types.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Overview of Gamblebot commands and game odds'),
  async execute(interaction) {
    const gameLines = gamesConfig.games.map(
      (game) =>
        `**${game.name}** (Lv ${game.unlockLevel}) — ${game.description}`,
    );

    const embed = new EmbedBuilder()
      .setColor(embedColors.info)
      .setTitle('Gamblebot Help')
      .setDescription(
        'Progressive fake-currency economy bot. Earn coins, level up, and unlock games & shop tiers.',
      )
      .addFields(
        {
          name: 'Economy',
          value: [
            '`/balance` — wallet & bank',
            '`/daily` — daily reward + streak',
            '`/deposit` / `/withdraw` — move coins to bank',
            '`/pay` — send coins (5% tax by default)',
            '`/transactions` — recent ledger',
          ].join('\n'),
          inline: false,
        },
        {
          name: 'Jobs',
          value: [
            '`/jobs` — list available jobs',
            '`/job set` — choose active job',
            '`/work` — earn coins & XP (cooldown)',
          ].join('\n'),
          inline: false,
        },
        {
          name: 'Games',
          value: [
            '`/play` — casino hub (menus & buttons, keeps chat clean)',
            ...gameLines,
          ].join('\n'),
          inline: false,
        },
        {
          name: 'Shop & progression',
          value: [
            '`/shop` — browse upgrades',
            '`/buy` — purchase upgrade ranks',
            '`/inventory` — active multipliers',
            '`/profile` — level, balance, badges',
            '`/rank` — your title and standings',
            '`/quests` — daily quest board',
            '`/achievements` — milestone rewards',
            '`/leaderboard` — top 10 by category',
          ].join('\n'),
          inline: false,
        },
        {
          name: 'Tips',
          value: [
            `Currency: **${economyConfig.currencyName}**`,
            'Max bet scales with level; bank earns daily interest.',
            'Instant games show a **Play again** button after each round.',
            'Complete all daily quests for streak bonus rewards.',
            'Admins: `/admin` (Manage Server required).',
          ].join('\n'),
          inline: false,
        },
      );

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
