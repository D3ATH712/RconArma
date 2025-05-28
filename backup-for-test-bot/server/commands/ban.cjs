// commands/ban.js
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { EmbedBuilder } = require('discord.js');

module.exports = async ({ message, args }) => {
  if (!message.guild) return message.channel.send('❌ This command must be used in a server.');

  // Permission check
  if (!message.member.permissions.has('BanMembers')) {
    return message.channel.send('❌ You do not have permission to use this command.');
  }

  // Unban subcommand: directly accepts UID
  if (args[0]?.toLowerCase() === 'remove') {
    const uid = args[1];
    if (!uid) {
      return message.channel.send('❌ Usage: `!ban remove <playerUID>`');
    }
    return unbanByUid({ message, uid });
  }

  // Ban logic
  let offset = 0;
  if (args[0]?.toLowerCase() === 'create') offset = 1;
  if (!args || args.length < offset + 3) {
    return message.channel.send('❌ Usage: `!ban [create] <playerName|playerUID> <durationSeconds> <reason>`');
  }
  const targetArg = args[offset];
  const durationArg = args[offset + 1];
  const reason = args.slice(offset + 2).join(' ');

  if (isNaN(durationArg) || Number(durationArg) < 0) {
    return message.channel.send('❌ Duration must be a non-negative number (seconds).');
  }
  const duration = Number(durationArg);
  const displayDuration = duration === 0 ? 'Permanent' : `${duration} second(s)`;

  // Load configuration
  const cfgPath = path.join(__dirname, '..', 'guildConfig.json');
  let config = {};
  if (fs.existsSync(cfgPath)) {
    try { config = JSON.parse(fs.readFileSync(cfgPath)); } catch {}
  }
  const guildConfig = config[message.guild.id];
  if (!guildConfig || !guildConfig.serverId || !guildConfig.apiToken) {
    return message.channel.send('❌ Server not configured — run `!setup` first.');
  }
  const { serverId, apiToken, banLogChannelId } = guildConfig;

  // Resolve player info for display
  let playerName;
  let targetUid = targetArg;
  let playerId = 'N/A';
  try {
    const playersRes = await axios.post(
      `https://api.0grind.io/v2/armareforger/${serverId}/rcon`,
      { command: '#players' },
      { headers: { Authorization: `Bearer ${apiToken}` }, responseType: 'json' }
    );
    if (playersRes.data.success) {
      const entries = playersRes.data.data
        .split('\n')
        .map(l => l.trim())
        .filter(l => (l.match(/;/g) || []).length >= 2)
        .map(e => e.split(';').map(p => p.trim()));
      const found = entries.find(([id, uid, name]) =>
        id === targetArg || uid === targetArg || name.toLowerCase() === targetArg.toLowerCase()
      );
      if (found) [playerId, targetUid, playerName] = found;
    }
  } catch (err) {
    console.error('Error fetching players for ban lookup:', err);
  }

  // Issue ban command
  try {
    const cmd = `#ban create ${targetUid} ${duration} ${reason}`;
    await axios.post(
      `https://api.0grind.io/v2/armareforger/${serverId}/rcon`,
      { command: cmd },
      { headers: { Authorization: `Bearer ${apiToken}` } }
    );
  } catch (err) {
    console.error('RCON /ban error:', err);
    return message.channel.send(`❌ Failed to ban \`${targetArg}\` (${err.message}).`);
  }

  // Confirmation embed
  const displayName = playerName || targetArg;
  const embed = new EmbedBuilder()
    .setTitle('🔨 Player Banned')
    .setColor('Red')
    .addFields(
      { name: 'Moderator', value: message.author.tag, inline: true },
      { name: 'Player', value: displayName, inline: true },
      { name: 'Player ID', value: playerId, inline: true },
      { name: 'UID', value: targetUid, inline: true },
      { name: 'Duration', value: displayDuration, inline: true },
      { name: 'Reason', value: reason }
    )
    .setTimestamp();
  await message.channel.send({ embeds: [embed] });

  if (banLogChannelId) {
    const logChannel = message.guild.channels.cache.get(banLogChannelId);
    if (logChannel) logChannel.send({ embeds: [embed] }).catch(console.error);
  }

  // Auto-kick after ban
  try {
    const kickTarget = playerId !== 'N/A' ? playerId : targetUid;
    await axios.post(
      `https://api.0grind.io/v2/armareforger/${serverId}/rcon`,
      { command: `#kick ${kickTarget}` },
      { headers: { Authorization: `Bearer ${apiToken}` } }
    );
  } catch {}
};

async function unbanByUid({ message, uid }) {
  // Load config
  const cfgPath = path.join(__dirname, '..', 'guildConfig.json');
  const raw = fs.readFileSync(cfgPath);
  const config = JSON.parse(raw);
  const { serverId, apiToken, banLogChannelId } = config[message.guild.id];

  // Issue unban by UID directly
  const cmd = `#ban remove ${uid}`;
  try {
    await axios.post(
      `https://api.0grind.io/v2/armareforger/${serverId}/rcon`,
      { command: cmd },
      { headers: { Authorization: `Bearer ${apiToken}` } }
    );
    const embed = new EmbedBuilder()
      .setTitle('🔓 Player Unbanned')
      .setColor('Green')
      .setDescription(`Unbanned UID: ${uid}`)
      .setTimestamp();
    await message.channel.send({ embeds: [embed] });
    if (banLogChannelId) {
      const logChannel = message.guild.channels.cache.get(banLogChannelId);
      if (logChannel) logChannel.send({ embeds: [embed] }).catch(console.error);
    }
  } catch (err) {
    console.error('Unban error:', err);
    return message.channel.send(`❌ Could not unban UID \`${uid}\`. Try again manually with: ${cmd}`);
  }
}
