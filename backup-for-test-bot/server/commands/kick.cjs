// commands/kick.js
const axios = require('axios');
const path = require('path');
const fs = require('fs');

module.exports = async ({ message, args }) => {
  if (!message.guild) {
    return message.channel.send('❌ This command must be used in a server.');
  }

  if (!args || args.length < 1) {
    return message.channel.send('❌ Usage: `!kick <playerUID>`');
  }
  const targetUid = args[0];

  // load saved config
  const cfgPath = path.join(__dirname, '..', 'guildConfig.json');
  let config = {};
  if (fs.existsSync(cfgPath)) {
    try { config = JSON.parse(fs.readFileSync(cfgPath)); } catch {}
  }
  const guildConfig = config[message.guild.id];
  if (!guildConfig || !guildConfig.serverId || !guildConfig.apiToken) {
    return message.channel.send('❌ Server not configured — run `!setup` first.');
  }
  const { serverId, apiToken } = guildConfig;

  // attempt to fetch current players to lookup the username
  let playerName;
  try {
    const playersRes = await axios.post(
      `https://api.0grind.io/v2/armareforger/${serverId}/rcon`,
      { command: '#players' },
      { headers: { Authorization: `Bearer ${apiToken}` }, responseType: 'json' }
    );
    if (playersRes.data.success) {
      const lines = playersRes.data.data
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
      const rawEntries = lines.filter(line => (line.match(/;/g) || []).length >= 2);
      const entries = rawEntries
        .map(entry => entry.split(';').map(part => part.trim()))
        .filter(([id, uid]) => uid === targetUid);
      if (entries.length > 0) {
        playerName = entries[0][2];
      }
    }
  } catch (err) {
    console.error('Error fetching players for kick confirmation:', err);
  }

  // send the kick command via RCON
  try {
    const res = await axios.post(
      `https://api.0grind.io/v2/armareforger/${serverId}/rcon`,
      { command: `#kick ${targetUid}` },
      { headers: { Authorization: `Bearer ${apiToken}` } }
    );

    if (res.data.success) {
      const displayName = playerName || targetUid;
      return message.channel.send(`👢 Kicked player \`${displayName}\` (UID: ${targetUid}).`);
    } else {
      throw new Error(res.data.reason || 'unknown');
    }
  } catch (err) {
    console.error('RCON /kick error:', err);
    return message.channel.send(`❌ Failed to kick \`${targetUid}\` (${err.message}).`);
  }
};
