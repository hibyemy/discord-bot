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
        'Progressive fake-currency economy bot. Start with **`/menu`** for the full hub (private menus, less chat spam). Individual slash commands still work.',
      )
      .addFields(
        {
          name: 'Main hub',
          value: [
            '`/menu` — economy, jobs, games, shop, progression',
            '`/play` — shortcut to the casino / games hub',
          ].join('\n'),
          inline: false,
        },
        {
          name: 'Economy (also in /menu)',
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
          name: 'Jobs (also in /menu)',
          value: [
            '`/jobs` — list jobs · `/job set` · `/work` · `/focus`',
            '_Work: pick a task for bonus pay. Focus Shift: 3–5× passive pay if you stay sharp._',
            '_Or use the Jobs tab in `/menu` (all-in-one)._',
          ].join('\n'),
          inline: false,
        },
        {
          name: 'Games (also in /menu → Games)',
          value: [
            '`/play` — casino hub (menus & buttons, keeps chat clean)',
            ...gameLines,
          ].join('\n'),
          inline: false,
        },
        {
          name: 'Shop & progression (also in /menu)',
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
            'Claim each daily quest reward as soon as you finish it.',
            'Admins: `/admin` (Manage Server required).',
          ].join('\n'),
          inline: false,
        },
      );

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
