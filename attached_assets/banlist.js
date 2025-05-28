const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = async ({ message }) => {
  if (!message.guild) {
    return message.channel.send('❌ This command must be used in a server.');
  }

  // Load config
  const cfgPath = path.join(__dirname, '..', 'guildConfig.json');
  const raw = fs.readFileSync(cfgPath);
  const config = JSON.parse(raw);
  const guildConfig = config[message.guild.id];

  if (!guildConfig || !guildConfig.serverId || !guildConfig.apiToken) {
    return message.channel.send('❌ Server not configured — run `!setup` first.');
  }

  const { serverId, apiToken } = guildConfig;

  try {
    const res = await axios.post(
      `https://api.0grind.io/v2/armareforger/${serverId}/rcon`,
      { command: '#ban list' },
      { headers: { Authorization: `Bearer ${apiToken}` } }
    );

    // Parse and filter out header/footer or malformed lines
    const entries = res.data.data
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && (line.includes('|') || line.includes(';')))
      .map(line => {
        const delim = line.includes('|') ? '|' : ';';
        const [uid, name] = line.split(delim).map(s => s.trim());
        return { uid, name };
      })
      .filter(item => {
        const u = item.uid.toLowerCase();
        const n = item.name.toLowerCase();
        // drop header labels and empty placeholders
        if (u === 'uid' || n === 'uid') return false;
        if (n.includes('total bans')) return false;
        if (n.includes('identity id')) return false;
        return item.uid && item.name;
      })
      .map(item => `**${item.name}** - UID: ${item.uid}`);

    if (entries.length === 0) {
      return message.channel.send('🔓 No active bans found.');
    }

    // Paginate entries (15 per page)
    const pageSize = 15;
    const pages = [];
    for (let i = 0; i < entries.length; i += pageSize) {
      pages.push(entries.slice(i, i + pageSize));
    }

    let currentPage = 0;
    const generateEmbed = (pageIndex) => {
      const pageEntries = pages[pageIndex].join('\n');
      return new EmbedBuilder()
        .setTitle(`🚫 Current Ban List: ${entries.length} total`)
        .setDescription(pageEntries)
        .setFooter({ text: `Page ${pageIndex + 1}/${pages.length}` })
        .setColor(0xFF0000);
    };

    // Buttons
    const prevButton = new ButtonBuilder()
      .setCustomId('banlist_prev')
      .setLabel('Previous')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true);
    const nextButton = new ButtonBuilder()
      .setCustomId('banlist_next')
      .setLabel('Next')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(pages.length <= 1);
    const actionRow = new ActionRowBuilder().addComponents(prevButton, nextButton);

    // Send initial embed
    const messageReply = await message.channel.send({ embeds: [generateEmbed(0)], components: [actionRow] });

    // Collector for pagination (3 minutes)
    const filter = inter => inter.isButton() && inter.message.id === messageReply.id;
    const collector = messageReply.createMessageComponentCollector({ filter, time: 180000 });

    collector.on('collect', async inter => {
      if (inter.customId === 'banlist_prev') {
        currentPage = Math.max(currentPage - 1, 0);
      } else if (inter.customId === 'banlist_next') {
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

  } catch (err) {
    console.error('Ban list fetch error:', err);
    return message.channel.send('❌ Could not retrieve ban list.');
  }
};
