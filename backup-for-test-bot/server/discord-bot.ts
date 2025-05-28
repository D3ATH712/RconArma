import { Client, GatewayIntentBits, Partials } from 'discord.js';
import axios from 'axios';
import { storage } from './storage';
import type { BotInstance, GuildConfiguration } from '@shared/schema';
import { ipMonitor } from './ip-monitor';

interface BotProcess {
  client: Client;
  botInstance: BotInstance;
}

const activeBots = new Map<number, BotProcess>();

export async function startDiscordBot(botInstance: BotInstance): Promise<void> {
  if (activeBots.has(botInstance.id)) {
    throw new Error(`Bot ${botInstance.id} is already running`);
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
  });

  const botProcess: BotProcess = {
    client,
    botInstance
  };

  activeBots.set(botInstance.id, botProcess);

  client.once('ready', async () => {
    console.log(`✅ Bot ${botInstance.name} logged in as ${client.user?.tag}`);
    
    // Initialize IP monitoring
    ipMonitor.setDiscordClient(client);
    ipMonitor.startMonitoring(5); // Check every 5 hours
  });

  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    const content = message.content.trim();
    const guildId = message.guild?.id;

    // Only process bot commands (messages starting with !)
    if (!content.startsWith('!')) return;

    console.log(`📨 Got message: "${content}" from ${message.author.username}`);

    if (!guildId) return;

    // Load configuration from database first, then fall back to JSON file
    let guildConfig = await storage.getGuildConfig(guildId);
    
    // If not in database, check JSON file for backward compatibility
    if (!guildConfig) {
      const fs = await import('fs');
      const path = await import('path');
      const { fileURLToPath } = await import('url');
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const cfgPath = path.join(__dirname, 'guildConfig.json');
      console.log(`🔍 Looking for config at: ${cfgPath}`);
      let config = {};
      if (fs.existsSync(cfgPath)) {
        console.log(`✅ Found config file at: ${cfgPath}`);
        try { 
          config = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); 
          console.log(`📋 Loaded config for guilds: ${Object.keys(config)}`);
          guildConfig = config[guildId];
          if (guildConfig) {
            console.log(`✅ Found guild config for ${guildId}`);
          } else {
            console.log(`❌ No config found for guild ${guildId}`);
          }
        } catch (err) {
          console.log(`❌ Error parsing config file:`, err);
        }
      } else {
        console.log(`❌ Config file not found at: ${cfgPath}`);
      }
    }
    if (!guildConfig) {
      if (content.startsWith('!setup')) {
        return handleSetup(message, botInstance.id);
      }
      return;
    }

    // Handle commands
    if (content.startsWith('!setup')) {
      return handleSetup(message, botInstance.id);
    }
    if (content.startsWith('!players')) {
      // Use original command file directly for debugging
      const playersCommand = await import('./commands/players.cjs');
      return playersCommand.default({ message });
    }
    if (content.startsWith('!kick')) {
      const args = content.split(/\s+/).slice(1);
      return handleKick(message, args, guildConfig);
    }
    if (content.startsWith('!ban ')) {
      const args = content.split(/\s+/).slice(1);
      return handleBan(message, args, guildConfig, botInstance.id);
    }
    if (content === '!banlist') {
      return handleBanlist(message, guildConfig);
    }
    if (content === '!commands') {
      return handleCommands(message);
    }
    if (content === '!checkip') {
      console.log('📡 Processing checkip command...');
      try {
        const response = await axios.get('https://api.ipify.org?format=json', {
          timeout: 10000,
          responseType: 'json'
        });
        const currentIp = response.data.ip;
        console.log(`🌐 Current outbound IP: ${currentIp}`);
        return message.reply(`🌐 **Current Replit Outbound IP:** \`${currentIp}\`\n\n💡 Use this IP address in your 0grind.io dashboard whitelist for API authentication.`);
      } catch (error) {
        console.error('❌ Checkip command error:', error);
        return message.reply('❌ Unable to check current IP address. Please try again later.');
      }
    }
    if (content === '!ipalert on') {
      ipMonitor.addAlertChannel(message.channel.id);
      return message.reply('✅ **IP Change Alerts Enabled** for this channel!\n\nYou will be automatically notified if Replit\'s IP address changes.');
    }
    if (content === '!ipalert off') {
      ipMonitor.removeAlertChannel(message.channel.id);
      return message.reply('❌ **IP Change Alerts Disabled** for this channel.');
    }
    if (content === '!ipalert status') {
      const status = ipMonitor.getStatus();
      return message.reply(`📊 **IP Monitoring Status:**\n\n` +
        `**Current IP:** \`${status.currentIP || 'Not checked yet'}\`\n` +
        `**Last Checked:** ${status.lastChecked ? new Date(status.lastChecked).toLocaleString() : 'Never'}\n` +
        `**Alert Channels:** ${status.alertChannelsCount}\n` +
        `**Monitoring:** ${status.isMonitoring ? '✅ Active (hourly checks)' : '❌ Inactive'}`);
    }

  });

  client.on('error', async (error) => {
    console.error(`Bot ${botInstance.id} error:`, error);
  });

  await client.login(botInstance.botToken);
}

export async function stopDiscordBot(botId: number): Promise<void> {
  const botProcess = activeBots.get(botId);
  if (!botProcess) {
    throw new Error(`Bot ${botId} is not running`);
  }

  await botProcess.client.destroy();
  activeBots.delete(botId);
}

export async function getBotStatus(botId: number): Promise<string> {
  const botProcess = activeBots.get(botId);
  if (!botProcess) {
    return "stopped";
  }

  const client = botProcess.client;
  if (client.isReady()) {
    return "online";
  } else {
    return "starting";
  }
}

// Command handlers (simplified versions of the original code)
async function handleSetup(message: any, botInstanceId: number) {
  const guildId = message.guild?.id;
  if (!guildId) {
    return message.channel.send('❌ This command must be used in a server.');
  }

  const filterMsg = (m: any) => m.author.id === message.author.id;

  // Get current IP dynamically
  const currentIP = await ipMonitor.getCurrentIP();

  // Pre-flight embed with dynamic IP
  const preEmbed = {
    color: 0x3498DB,
    title: '🛠️ RCON-Arma Setup Wizard',
    description: [
      'I will guide you through configuring your Arma Reforger integration.',
      '',
      '**RCON Dashboard Setup:**',
      `Please whitelist **${currentIP}** in your 0grind.io dashboard before generating an API Token.`,
      '',
      '**IMPORTANT:** This IP may change occasionally. As a precaution:',
      '• Run `!ipalert on` to get automatic notifications when the IP changes',
      '• Use `!ipalert status` to check the monitoring system anytime', 
      '• Run `!checkip` for manual IP verification',
      '',
      '**We will collect:**',
      '1️⃣ Server ID',
      '2️⃣ API Token',
      '3️⃣ Ban-log Channel',
      '',
      'Type `cancel` at any time to abort.'
    ].join('\n'),
    footer: {
      text: 'You have 2 minutes per step.'
    }
  };

  await message.channel.send({ embeds: [preEmbed] });

  // Step 1: Server ID
  const step1Embed = {
    color: 0x3498DB,
    title: '🔹 Step 1: Server ID',
    description: 'Please enter your **Server ID** (letters, numbers, or hyphens).'
  };
  await message.channel.send({ embeds: [step1Embed] });
  
  const collected1 = await message.channel.awaitMessages({ 
    filter: filterMsg, max: 1, time: 120000, errors: ['time'] 
  }).catch(() => null);
  
  if (!collected1) return message.channel.send('⏲️ Setup timed out. Please run `!setup` again.');
  const serverId = collected1.first().content.trim();
  if (serverId.toLowerCase() === 'cancel') return message.channel.send('❌ Setup cancelled.');
  if (!/^[A-Za-z0-9-]+$/.test(serverId)) {
    return message.channel.send('❌ Invalid Server ID format. Please run `!setup` again.');
  }
  await message.channel.send(`✅ Server ID set to \`${serverId}\`.`);

  // Step 2: API Token
  const step2Embed = {
    color: 0x3498DB,
    title: '🔹 Step 2: API Token',
    description: 'Please enter your **API Token**.'
  };
  await message.channel.send({ embeds: [step2Embed] });
  
  const collected2 = await message.channel.awaitMessages({ 
    filter: filterMsg, max: 1, time: 120000, errors: ['time'] 
  }).catch(() => null);
  
  if (!collected2) return message.channel.send('⏲️ Setup timed out. Please run `!setup` again.');
  const apiToken = collected2.first().content.trim();
  if (apiToken.toLowerCase() === 'cancel') return message.channel.send('❌ Setup cancelled.');
  if (apiToken.length < 10) {
    return message.channel.send('❌ API Token seems too short. Please run `!setup` again.');
  }
  await message.channel.send('✅ API Token set.');

  // Step 3: Ban-log Channel
  const step3Embed = {
    color: 0x3498DB,
    title: '🔹 Step 3: Ban-log Channel',
    description: 'Please mention or enter the **Ban-log Channel** where bans will be posted.'
  };
  await message.channel.send({ embeds: [step3Embed] });
  
  const collected3 = await message.channel.awaitMessages({ 
    filter: filterMsg, max: 1, time: 120000, errors: ['time'] 
  }).catch(() => null);
  
  if (!collected3) return message.channel.send('⏲️ Setup timed out. Please run `!setup` again.');
  let banLogInput = collected3.first().content.trim();
  if (banLogInput.toLowerCase() === 'cancel') return message.channel.send('❌ Setup cancelled.');
  
  const mentionMatch = banLogInput.match(/^<#(\d+)>$/);
  const banLogChannelId = mentionMatch ? mentionMatch[1] : banLogInput;
  if (!/^[0-9]+$/.test(banLogChannelId) || !message.guild.channels.cache.has(banLogChannelId)) {
    return message.channel.send('❌ Invalid channel ID. Please run `!setup` again.');
  }
  await message.channel.send(`✅ Ban-log channel set to <#${banLogChannelId}>.`);

  // Save configuration to JSON file (same as working system)
  try {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const cfgPath = path.join(__dirname, 'guildConfig.json');
    
    // Load existing config
    let config = {};
    if (fs.existsSync(cfgPath)) {
      try {
        config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      } catch {}
    }
    
    // Add/update this guild's config
    config[guildId] = {
      serverId,
      apiToken,
      banLogChannelId
    };
    
    // Save back to file
    fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2));

    const summaryEmbed = {
      color: 0x2ECC71,
      title: '✅ Configuration Complete!',
      fields: [
        { name: 'Server ID', value: `\`${serverId}\``, inline: true },
        { name: 'API Token', value: '`••••••••••`', inline: true },
        { name: 'Ban-log Channel', value: `<#${banLogChannelId}>`, inline: true }
      ],
      footer: { text: 'Your bot is now ready to use!' }
    };

    await message.channel.send({ embeds: [summaryEmbed] });
  } catch (error) {
    console.error('Setup error:', error);
    await message.channel.send('❌ Failed to save configuration. Please try again.');
  }
}

async function handlePlayers(message: any, guildConfig: any) {
  try {
    const res = await axios.post(
      `https://api.0grind.io/v2/armareforger/${guildConfig.serverId}/rcon`,
      { command: '#players' },
      { headers: { Authorization: `Bearer ${guildConfig.apiToken}` }, responseType: 'json' }
    );

    if (!res.data.success) {
      throw new Error(res.data.reason || 'Unknown error');
    }

    const lines = res.data.data.split('\n').map((line: string) => line.trim()).filter((line: string) => line.length > 0);
    const rawEntries = lines.filter((line: string) => (line.match(/;/g) || []).length >= 2);
    const entries = rawEntries
      .map((entry: string) => entry.split(';').map((part: string) => part.trim()))
      .filter(([id]: string[]) => /^\d+$/.test(id));

    const playerCount = entries.length;
    if (playerCount === 0) {
      return message.channel.send(`📋 **Players on ${guildConfig.serverId}: 0 online**`);
    }

    const playerList = entries
      .slice(0, 10) // Limit to first 10 players for simplicity
      .map(([id, uid, name]: string[]) => `**${name}** (ID: ${id}, UID: ${uid})`)
      .join('\n');

    await message.channel.send(`📋 **Players on ${guildConfig.serverId}: ${playerCount} online**\n\n${playerList}`);
  } catch (error) {
    console.error('RCON /players error:', error);
    await message.channel.send('❌ Failed to fetch player list.');
  }
}

async function handleKick(message: any, args: string[], guildConfig: GuildConfiguration) {
  if (!args || args.length < 1) {
    return message.channel.send('❌ Usage: `!kick <playerUID>`');
  }

  const targetUid = args[0];

  try {
    const res = await axios.post(
      `https://api.0grind.io/v2/armareforger/${guildConfig.serverId}/rcon`,
      { command: `#kick ${targetUid}` },
      { headers: { Authorization: `Bearer ${guildConfig.apiToken}` } }
    );

    if (res.data.success) {
      return message.channel.send(`👢 Kicked player with UID: ${targetUid}.`);
    } else {
      throw new Error(res.data.reason || 'unknown');
    }
  } catch (err: any) {
    console.error('RCON /kick error:', err);
    return message.channel.send(`❌ Failed to kick \`${targetUid}\` (${err.message}).`);
  }
}

async function handleBan(message: any, args: string[], guildConfig: GuildConfiguration, botInstanceId: number) {
  if (!message.member.permissions.has('BanMembers')) {
    return message.channel.send('❌ You do not have permission to use this command.');
  }

  if (args[0]?.toLowerCase() === 'remove') {
    const uid = args[1];
    if (!uid) {
      return message.channel.send('❌ Usage: `!ban remove <playerUID>`');
    }
    return handleUnban(message, uid, guildConfig, botInstanceId);
  }

  let offset = 0;
  if (args[0]?.toLowerCase() === 'create') offset = 1;
  if (!args || args.length < offset + 3) {
    return message.channel.send('❌ Usage: `!ban [create] <playerName|playerUID> <durationSeconds> <reason>`');
  }

  const targetArg = args[offset];
  const durationArg = args[offset + 1];
  const reason = args.slice(offset + 2).join(' ');

  if (isNaN(Number(durationArg)) || Number(durationArg) < 0) {
    return message.channel.send('❌ Duration must be a non-negative number (seconds).');
  }

  const duration = Number(durationArg);

  try {
    const cmd = `#ban create ${targetArg} ${duration} ${reason}`;
    await axios.post(
      `https://api.0grind.io/v2/armareforger/${guildConfig.serverId}/rcon`,
      { command: cmd },
      { headers: { Authorization: `Bearer ${guildConfig.apiToken}` } }
    );

    await message.channel.send(`🔨 Banned player \`${targetArg}\` for ${duration === 0 ? 'permanent' : `${duration} seconds`}. Reason: ${reason}`);
    
    // Log to ban channel if configured
    if (guildConfig.banLogChannelId) {
      const logChannel = message.guild.channels.cache.get(guildConfig.banLogChannelId);
      if (logChannel) {
        const banEmbed = {
          color: 0xE74C3C, // Red color for bans
          title: '🔨 Player Banned',
          fields: [
            {
              name: 'Moderator',
              value: message.author.username,
              inline: true
            },
            {
              name: 'Player',
              value: targetArg,
              inline: true
            },
            {
              name: 'Player ID',
              value: '1',
              inline: true
            },
            {
              name: 'UID',
              value: 'Generated after ban execution',
              inline: false
            },
            {
              name: 'Duration',
              value: duration === 0 ? 'Permanent' : `${duration} second(s)`,
              inline: false
            },
            {
              name: 'Reason',
              value: reason,
              inline: false
            }
          ],
          timestamp: new Date().toISOString()
        };
        
        await logChannel.send({ embeds: [banEmbed] });
      }
    }

    // Log activity
    await storage.logActivity(botInstanceId, message.guild.id, "player_banned", {
      moderator: message.author.tag,
      player: targetArg,
      duration,
      reason
    });

  } catch (err: any) {
    console.error('RCON /ban error:', err);
    return message.channel.send(`❌ Failed to ban \`${targetArg}\` (${err.message}).`);
  }
}

async function handleUnban(message: any, uid: string, guildConfig: GuildConfiguration, botInstanceId: number) {
  try {
    const cmd = `#ban remove ${uid}`;
    await axios.post(
      `https://api.0grind.io/v2/armareforger/${guildConfig.serverId}/rcon`,
      { command: cmd },
      { headers: { Authorization: `Bearer ${guildConfig.apiToken}` } }
    );

    await message.channel.send(`🔓 Unbanned player with UID: ${uid}`);
    
    if (guildConfig.banLogChannelId) {
      const logChannel = message.guild.channels.cache.get(guildConfig.banLogChannelId);
      if (logChannel) {
        const unbanEmbed = {
          color: 0xF39C12, // Orange color for unbans
          title: '🔓 Player Unbanned',
          description: `Removed ban for UID: ${uid}`,
          fields: [
            {
              name: 'Moderator',
              value: message.author.tag,
              inline: true
            }
          ],
          timestamp: new Date().toISOString(),
          footer: {
            text: 'RconArma Ban System'
          }
        };
        
        await logChannel.send({ embeds: [unbanEmbed] });
      }
    }

    await storage.logActivity(botInstanceId, message.guild.id, "player_unbanned", {
      moderator: message.author.tag,
      uid
    });

  } catch (err: any) {
    console.error('Unban error:', err);
    return message.channel.send(`❌ Could not unban UID \`${uid}\`. Error: ${err.message}`);
  }
}

async function handleBanlist(message: any, guildConfig: GuildConfiguration) {
  try {
    const res = await axios.post(
      `https://api.0grind.io/v2/armareforger/${guildConfig.serverId}/rcon`,
      { command: '#ban list' },
      { headers: { Authorization: `Bearer ${guildConfig.apiToken}` } }
    );

    const entries = res.data.data
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line && (line.includes('|') || line.includes(';')))
      .slice(0, 15); // Limit for Discord message length

    if (entries.length === 0) {
      return message.channel.send('🔓 No active bans found.');
    }

    const banList = entries.join('\n');
    await message.channel.send(`🚫 **Current Ban List:**\n\`\`\`\n${banList}\n\`\`\``);

  } catch (err: any) {
    console.error('Ban list fetch error:', err);
    return message.channel.send('❌ Could not retrieve ban list.');
  }
}

async function handleCommands(message: any) {
  const commandList = [
    '**!players** - List current online players',
    '**!kick <ID>** - Kick a player',
    '**!ban <UID|player> <duration> <reason>** - Ban a player',
    '**!ban remove <UID>** - Remove a ban (unban)',
    '**!banlist** - Show the current ban list',
    '**!checkip** - Check current Replit outbound IP address',
    '**!ipalert on** - Enable IP change alerts for this channel',
    '**!ipalert off** - Disable IP change alerts for this channel',
    '**!ipalert status** - Show IP monitoring status',
    '**!setup** - Configure bot for this server'
  ].join('\n');

  await message.channel.send(`🔨 **Available Commands:**\n${commandList}`);
}
