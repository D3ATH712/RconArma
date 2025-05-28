// commands/players.js
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { ActionRowBuilder, ButtonBuilder, EmbedBuilder, ButtonStyle } = require('discord.js');

module.exports = async ({ message }) => {
  if (!message.guild) {
    return message.channel.send('❌ This command must be used in a server.');
  }

  // load configuration
  const cfgPath = path.join(__dirname, '..', 'guildConfig.json');
  let config = {};
  if (fs.existsSync(cfgPath)) {
    try { config = JSON.parse(fs.readFileSync(cfgPath)); } catch {}
  }
  const guildConfig = config[message.guild.id];
  if (!guildConfig || !guildConfig.serverId || !guildConfig.apiToken) {
    return message.channel.send('❌ Server not configured. Please run `!setup` first.');
  }
  const { serverId, apiToken } = guildConfig;

  try {
    // Fetch raw player list via RCON
    const res = await axios.post(
      `https://api.0grind.io/v2/armareforger/${serverId}/rcon`,
      { command: '#players' },
      { 
        headers: { Authorization: `Bearer ${apiToken}` }, 
        responseType: 'json',
        family: 4  // Force IPv4
      }
    );
    if (!res.data.success) throw new Error(res.data.reason || 'Unknown error');

    // Split into lines and trim
    const lines = res.data.data
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    // Keep only lines with two semicolons
    const rawEntries = lines.filter(line => (line.match(/;/g) || []).length >= 2);
    // Parse and remove any non-numeric IDs (filter out headers)
    const entries = rawEntries
      .map(entry => entry.split(';').map(part => part.trim()))
      .filter(([id]) => /^\d+$/.test(id));

    const playerCount = entries.length;
    if (playerCount === 0) {
      return message.channel.send(`📋 **Players on ${serverId}: 0 online**`);
    }

    // Paginate entries (7 per page)
    const pageSize = 7;
    const pages = [];
    for (let i = 0; i < entries.length; i += pageSize) {
      pages.push(entries.slice(i, i + pageSize));
    }

    let currentPage = 0;
    const generateEmbed = (pageIndex) => {
      const pageEntries = pages[pageIndex]
        .map(([id, uid, name]) => `Player: ${name}\nUID: ${uid}\nID: ${id}`)
        .join('\n\n');
      return new EmbedBuilder()
        .setTitle(`Players on ${serverId}: ${playerCount} online`)
        .setDescription(pageEntries)
        .setFooter({ text: `Page ${pageIndex + 1}/${pages.length}` })
        .setColor(0x00AE86);
    };

    // Create buttons
    const prevButton = new ButtonBuilder()
      .setCustomId('players_prev')
      .setLabel('Previous')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true);
    const nextButton = new ButtonBuilder()
      .setCustomId('players_next')
      .setLabel('Next')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(pages.length <= 1);
    const actionRow = new ActionRowBuilder().addComponents(prevButton, nextButton);

    // Send initial embed
    const messageReply = await message.channel.send({ embeds: [generateEmbed(0)], components: [actionRow] });

    // Collector for paging
    const filter = inter => inter.isButton() && inter.message.id === messageReply.id;
    const collector = messageReply.createMessageComponentCollector({ filter, time: 240000 });

    collector.on('collect', async inter => {
      if (inter.customId === 'players_prev') {
        currentPage = Math.max(currentPage - 1, 0);
      } else if (inter.customId === 'players_next') {
        currentPage = Math.min(currentPage + 1, pages.length - 1);
      }
      prevButton.setDisabled(currentPage === 0);
      nextButton.setDisabled(currentPage === pages.length - 1);
      await inter.update({ embeds: [generateEmbed(currentPage)], components: [actionRow] });
    });

    collector.on('end', () => {
      prevButton.setDisabled(true);
      nextButton.setDisabled(true);
      messageReply.edit({ components: [actionRow] });
    });

  } catch (error) {
    console.error('RCON /players error:', error);
    return message.channel.send('❌ Failed to fetch player list.');
  }
};
