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
const autoListIntervals = new Map<string, NodeJS.Timeout>(); // Track auto-list intervals by guild ID
const communityListIntervals = new Map<string, NodeJS.Timeout>(); // Track community-list intervals by guild ID

// Helper functions for autolist persistence
async function saveAutoListStatus(guildId: string, enabled: boolean) {
  try {
    const fs = await import('fs');
    const configPath = './server/guildConfig.json';
    
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (!config[guildId]) config[guildId] = {};
      config[guildId].autoListEnabled = enabled;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.log(`💾 Autolist status saved for guild ${guildId}: ${enabled}`);
    }
  } catch (error) {
    console.error('Error saving autolist status:', error);
  }
}

async function saveCommunityListStatus(guildId: string, enabled: boolean) {
  try {
    const fs = await import('fs');
    const configPath = './server/guildConfig.json';
    
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (!config[guildId]) config[guildId] = {};
      config[guildId].communityListEnabled = enabled;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.log(`💾 Community list status saved for guild ${guildId}: ${enabled}`);
    }
  } catch (error) {
    console.error('Error saving community list status:', error);
  }
}

async function restoreAutoLists(client: Client) {
  try {
    const fs = await import('fs');
    const configPath = './server/guildConfig.json';
    
    if (!fs.existsSync(configPath)) return;
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    for (const [guildId, guildConfig] of Object.entries(config) as any) {
      if (guildConfig.autoListEnabled) {
        const guild = client.guilds.cache.get(guildId);
        if (guild && guildConfig.rconTerminalChannelId) {
          // Run autolist immediately on restore
          console.log(`⚡ Running immediate autolist for guild ${guildId}`);
          try {
            await performAutoPlayerList(guild, guildConfig);
          } catch (error) {
            console.error('❌ Immediate autolist failed:', error);
          }
          
          // Restart autolist interval
          const intervalId = setInterval(async () => {
            try {
              await performAutoPlayerList(guild, guildConfig);
            } catch (error) {
              console.error('Auto-list error:', error);
            }
          }, 600000); // 10 minutes
          
          autoListIntervals.set(guildId, intervalId);
          console.log(`🔄 Restored autolist for guild ${guildId}`);
        }
      }
      
      if (guildConfig.communityListEnabled) {
        const guild = client.guilds.cache.get(guildId);
        if (guild && guildConfig.onlineListChannelId) {
          // Run community list immediately on restore
          console.log(`⚡ Running immediate community list for guild ${guildId}`);
          try {
            await performCommunityPlayerList(guild, guildConfig);
          } catch (error) {
            console.error('❌ Immediate community list failed:', error);
          }
          
          // Restart community list interval
          const intervalId = setInterval(async () => {
            try {
              await performCommunityPlayerList(guild, guildConfig);
            } catch (error) {
              console.error('Community-list error:', error);
            }
          }, 600000); // 10 minutes
          
          communityListIntervals.set(guildId, intervalId);
          console.log(`🔄 Restored community list for guild ${guildId}`);
        }
      }
    }
  } catch (error) {
    console.error('Error restoring autolists:', error);
  }
}



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
    console.log(`🌐 Discord gateway connection established`);
    console.log(`📡 WebSocket connection active`);
    console.log(`🔗 Bot ready to receive commands across ${client.guilds.cache.size} servers`);
    
    // Initialize IP monitoring
    ipMonitor.setDiscordClient(client);
    console.log('🔍 Checking for IP changes...');
    ipMonitor.startMonitoring(5); // Check every 5 hours
    console.log('🔍 IP monitoring service started');
    
    // Check IP immediately on startup
    await ipMonitor.checkForIPChange();
    
    // Restore any previously running autolists
    console.log('🔄 Restoring autolists and community lists...');
    console.log(`📊 Bot is in ${client.guilds.cache.size} guilds`);
    await restoreAutoLists(client);
    console.log('✅ Autolist restoration complete');
  });

  // Log Discord gateway events for activity
  client.on('disconnect', () => {
    console.log(`⚠️ [DISCORD] Gateway disconnected`);
  });

  client.on('reconnecting', () => {
    console.log(`🔄 [DISCORD] Gateway reconnecting...`);
  });

  client.on('resume', () => {
    console.log(`✅ [DISCORD] Gateway connection resumed`);
  });

  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    const content = message.content.trim();
    const guildId = message.guild?.id;

    // Log all message activity for debugging
    console.log(`📨 [MSG] Guild: ${guildId} | User: ${message.author.username} | Content: ${content.slice(0, 50)}...`);

    // Only process bot commands (messages starting with !)
    if (!content.startsWith('!')) {
      console.log(`📝 [DEBUG] Ignoring non-command message`);
      return;
    }

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
    if (content === '!startautolist') {
      return handleStartAutoList(message, guildConfig);
    }
    if (content === '!stopautolist') {
      return handleStopAutoList(message, guildConfig);
    }
    if (content === '!startcommunitylist') {
      return handleStartCommunityList(message, guildConfig);
    }
    if (content === '!stopcommunitylist') {
      return handleStopCommunityList(message, guildConfig);
    }
    if (content === '!update') {
      return handleUpdate(message, botInstance.id);
    }
    if (content.startsWith('!find ')) {
      console.log('🔍 Find command with search term triggered');
      const searchTerm = content.substring(6).trim();
      
      try {
        const { searchPlayers } = await import('./player-tracker.js');
        const matches = searchPlayers(searchTerm);
        
        if (matches.length === 0) {
          await message.channel.send(`❌ No players found matching "${searchTerm}"`);
          return;
        }
        
        const result = matches.slice(0, 5).map((p: any) => 
          `**${p.name}** (UID: ${p.uid}, ID: ${p.playerId}, Seen: ${p.timesSeen} times)`
        ).join('\n');
        
        await message.channel.send(`🔍 Found ${matches.length} player(s) matching "${searchTerm}":\n\n${result}`);
        return;
      } catch (error) {
        console.error('Find error:', error);
        await message.channel.send('❌ Error searching player database');
        return;
      }
    }

  });

  client.on('error', async (error) => {
    console.error(`Bot ${botInstance.id} error:`, error);
  });

  await client.login(botInstance.token);
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
    const banResponse = await axios.post(
      `https://api.0grind.io/v2/armareforger/${guildConfig.serverId}/rcon`,
      { command: cmd },
      { headers: { Authorization: `Bearer ${guildConfig.apiToken}` } }
    );

    // Look up player UID from the player database
    let playerUID = 'UID not found - player may not have joined server yet';
    
    try {
      const playerTracker = await import('./player-tracker.js');
      const players = playerTracker.getAllPlayers();
      
      // Search for the player by name
      for (const [uid, data] of Object.entries(players)) {
        if (data.name && data.name.toLowerCase() === targetArg.toLowerCase()) {
          playerUID = uid;
          console.log(`Found UID for ${targetArg}: ${uid}`);
          break;
        }
      }
      
      if (playerUID === 'UID not found - player may not have joined server yet') {
        console.log(`UID not found for ${targetArg} in player database`);
      }
    } catch (error) {
      console.error('Error looking up player UID:', error);
      playerUID = 'Error retrieving UID';
    }

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
              value: playerUID,
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
    '**!find <name>** - Search for players by name in database',
    '**!startautolist** - Start automatic player list updates',
    '**!stopautolist** - Stop automatic player list updates',
    '**!startcommunitylist** - Start community player list',
    '**!stopcommunitylist** - Stop community player list',
    '**!update** - Update bot configuration',
    '**!checkip** - Check current Replit outbound IP address',
    '**!ipalert on** - Enable IP change alerts for this channel',
    '**!ipalert off** - Disable IP change alerts for this channel',
    '**!ipalert status** - Show IP monitoring status',
    '**!setup** - Configure bot for this server'
  ].join('\n');

  const updatedCommandList = [
    '**!players** - List current online players',
    '**!kick <ID>** - Kick a player',
    '**!ban <UID|player> <duration> <reason>** - Ban a player',
    '**!ban remove <UID>** - Remove a ban (unban)',
    '**!banlist** - Show the current ban list',
    '**!find <name>** - Search for players by name in database',
    '**!startautolist** - Start automatic player list updates',
    '**!stopautolist** - Stop automatic player list updates',
    '**!startcommunitylist** - Start community player list',
    '**!stopcommunitylist** - Stop community player list',
    '**!update** - Update bot configuration',
    '**!checkip** - Check current Replit outbound IP address',
    '**!ipalert on** - Enable IP change alerts for this channel',
    '**!ipalert off** - Disable IP change alerts for this channel',
    '**!ipalert status** - Show IP monitoring status',
    '**!setup** - Configure bot for this server'
  ].join('\n');

  await message.channel.send(`🔨 **Available Commands:**\n${updatedCommandList}`);
}

async function handleStartAutoList(message: any, guildConfig: any) {
  const guildId = message.guild.id;
  
  // Check if auto-list is already running
  if (autoListIntervals.has(guildId)) {
    return message.channel.send('⚠️ Auto-list is already running! Use `!stopautolist` to stop it first.');
  }
  
  // Validate that RCON Terminal Channel is configured
  if (!guildConfig.rconTerminalChannelId) {
    return message.channel.send('❌ RCON Terminal Channel not configured. Please run `!setup` or `!update` first.');
  }
  
  // Get the channel
  const channel = message.guild.channels.cache.get(guildConfig.rconTerminalChannelId);
  if (!channel) {
    return message.channel.send('❌ Configured RCON Terminal Channel not found. Please update the configuration.');
  }
  
  // Post the first player list immediately
  try {
    await performAutoPlayerList(message.guild, guildConfig);
    console.log(`🎯 Initial autolist posted immediately for guild ${guildId}`);
  } catch (error) {
    console.error('Initial autolist error:', error);
  }
  
  // Start the auto-list interval (10 minutes = 600,000 milliseconds)
  const intervalId = setInterval(async () => {
    try {
      await performAutoPlayerList(message.guild, guildConfig);
    } catch (error) {
      console.error('Auto-list error:', error);
    }
  }, 600000); // 10 minutes
  
  autoListIntervals.set(guildId, intervalId);
  
  // Save autolist status to config file
  await saveAutoListStatus(guildId, true);
  
  const confirmEmbed = {
    color: 0x00FF00,
    title: '✅ Auto-list Started',
    description: `Player lists will be automatically posted to <#${guildConfig.rconTerminalChannelId}> every 10 minutes.`,
    fields: [
      { name: 'Stop Command', value: '`!stopautolist`', inline: true }
    ]
  };
  
  await message.channel.send({ embeds: [confirmEmbed] });
  console.log(`🔄 Auto-list started for guild ${guildId}`);
}

async function handleStopAutoList(message: any, guildConfig: any) {
  const guildId = message.guild.id;
  
  if (!autoListIntervals.has(guildId)) {
    return message.channel.send('ℹ️ Auto-list is not currently running.');
  }
  
  clearInterval(autoListIntervals.get(guildId));
  autoListIntervals.delete(guildId);
  
  const confirmEmbed = {
    color: 0xFF6B6B,
    title: '🛑 Auto-list Stopped',
    description: 'Automatic player list updates have been disabled.',
    fields: [
      { name: 'Restart Command', value: '`!startautolist`', inline: true }
    ]
  };
  
  await message.channel.send({ embeds: [confirmEmbed] });
  console.log(`🛑 Auto-list stopped for guild ${guildId}`);
}

async function performAutoPlayerList(guild: any, guildConfig: any) {
  try {
    const channel = guild.channels.cache.get(guildConfig.rconTerminalChannelId);
    if (!channel) {
      console.error('RCON Terminal Channel not found:', guildConfig.rconTerminalChannelId);
      return;
    }
    
    // Delete previous autolist messages from the bot
    try {
      const messages = await channel.messages.fetch({ limit: 50 });
      const botMessages = messages.filter((msg: any) => {
        if (!msg.author.bot) return false;
        if (!msg.embeds || msg.embeds.length === 0) return false;
        
        const embed = msg.embeds[0];
        if (!embed.title) return false;
        
        // Look for autolist messages specifically
        return embed.title.includes('Players on') || 
               embed.title.includes('online') ||
               (embed.description && embed.description.includes('Server:'));
      });
      
      if (botMessages.size > 0) {
        // Delete messages one by one to avoid bulk delete issues
        let deletedCount = 0;
        for (const [, message] of botMessages) {
          try {
            await message.delete();
            deletedCount++;
          } catch (err) {
            console.warn('Failed to delete individual message:', err.message);
          }
        }
        console.log(`🗑️ Deleted ${deletedCount} old autolist messages`);
      }
    } catch (deleteError) {
      console.warn('Failed to delete old autolist messages:', deleteError.message);
    }
    
    // Import and use the existing players command logic
    const playersCommand = await import('./commands/players.cjs');
    
    // Create a mock message object for the players command
    const mockMessage = {
      channel: channel,
      guild: guild,
      author: { username: 'AutoList' }
    };
    
    // Execute the players command which will post to the channel
    await playersCommand.default({ message: mockMessage });
    
  } catch (error: any) {
    // Clean error logging focused on troubleshooting
    const guildId = guild.id;
    
    if (error.response?.status === 500) {
      console.log(`⚠️ Autolist: Server offline (Guild: ${guildId}) - ${error.response.data?.reason || 'Server unreachable'}`);
    } else if (error.response?.status === 401) {
      console.log(`🔑 Autolist: Auth failed (Guild: ${guildId}) - Check API token`);
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      console.log(`🌐 Autolist: Network error (Guild: ${guildId}) - ${error.code}`);
    } else if (error.code === 'ETIMEDOUT') {
      console.log(`⏱️ Autolist: Timeout (Guild: ${guildId}) - API request timed out`);
    } else {
      console.log(`❌ Autolist error (Guild: ${guildId}) - ${error.message}`);
    }
    // Don't throw to prevent crash, just log and continue
  }
}

async function handleStartCommunityList(message: any, guildConfig: any) {
  const guildId = message.guild.id;
  
  // Check if community-list is already running
  if (communityListIntervals.has(guildId)) {
    return message.channel.send('⚠️ Community list is already running! Use `!stopcommunitylist` to stop it first.');
  }
  
  // Validate that Online List Channel is configured
  if (!guildConfig.onlineListChannelId) {
    return message.channel.send('❌ Online List Channel not configured. Please run `!setup` or `!update` first.');
  }
  
  // Get the channel
  const channel = message.guild.channels.cache.get(guildConfig.onlineListChannelId);
  if (!channel) {
    return message.channel.send('❌ Configured Online List Channel not found. Please update the configuration.');
  }
  
  // Post the first community list immediately
  try {
    await performCommunityPlayerList(message.guild, guildConfig);
    console.log(`🎯 Initial community list posted immediately for guild ${guildId}`);
  } catch (error) {
    console.error('Initial community list error:', error);
  }
  
  // Start the community-list interval (10 minutes = 600,000 milliseconds)
  const intervalId = setInterval(async () => {
    try {
      await performCommunityPlayerList(message.guild, guildConfig);
    } catch (error) {
      console.error('Community-list error:', error);
    }
  }, 600000); // 10 minutes
  
  communityListIntervals.set(guildId, intervalId);
  
  const confirmEmbed = {
    color: 0x00FF00,
    title: '✅ Community List Started',
    description: `Server status and player counts will be automatically posted to <#${guildConfig.onlineListChannelId}> every 10 minutes.`,
    fields: [
      { name: 'Stop Command', value: '`!stopcommunitylist`', inline: true }
    ]
  };
  
  await message.channel.send({ embeds: [confirmEmbed] });
  
  // Save community list status for persistence
  await saveCommunityListStatus(guildId, true);
  
  console.log(`🔄 Community-list started for guild ${guildId}`);
}

async function handleStopCommunityList(message: any, guildConfig: any) {
  const guildId = message.guild.id;
  
  if (!communityListIntervals.has(guildId)) {
    return message.channel.send('ℹ️ Community list is not currently running.');
  }
  
  clearInterval(communityListIntervals.get(guildId));
  communityListIntervals.delete(guildId);
  
  // Save community list status for persistence
  await saveCommunityListStatus(guildId, false);
  
  const confirmEmbed = {
    color: 0xFF6B6B,
    title: '🛑 Community List Stopped',
    description: 'Automatic community player lists have been disabled.',
    fields: [
      { name: 'Restart Command', value: '`!startcommunitylist`', inline: true }
    ]
  };
  
  await message.channel.send({ embeds: [confirmEmbed] });
  console.log(`🛑 Community-list stopped for guild ${guildId}`);
}

async function performCommunityPlayerList(guild: any, guildConfig: any) {
  try {
    const channel = guild.channels.cache.get(guildConfig.onlineListChannelId);
    if (!channel) {
      console.error('Online List Channel not found:', guildConfig.onlineListChannelId);
      return;
    }
    
    // Check if bot has permission to send messages
    const botMember = guild.members.me;
    if (!botMember) {
      console.error('Bot member not found in guild');
      return;
    }
    
    const permissions = channel.permissionsFor(botMember);
    if (!permissions || !permissions.has('SendMessages')) {
      console.error(`❌ Missing permission to send messages in channel ${guildConfig.onlineListChannelId}`);
      console.error('Required permissions: SendMessages, ViewChannel');
      return;
    }
    
    // Delete previous community list messages from the bot
    try {
      const messages = await channel.messages.fetch({ limit: 50 });
      const botMessages = messages.filter((msg: any) => 
        msg.author.bot && 
        msg.embeds.length > 0 && 
        msg.embeds[0].title && 
        (msg.embeds[0].title.includes('Online Players') || msg.embeds[0].title.includes('Server Status'))
      );
      
      if (botMessages.size > 0) {
        await channel.bulkDelete(botMessages);
        console.log(`🗑️ Deleted ${botMessages.size} old community list messages`);
      }
    } catch (deleteError) {
      console.warn('Failed to delete old community list messages:', deleteError);
    }
    
    // Fetch player data from API
    const res = await axios.post(
      `https://api.0grind.io/v2/armareforger/${guildConfig.serverId}/rcon`,
      { command: '#players' },
      { 
        headers: { Authorization: `Bearer ${guildConfig.apiToken}` }, 
        responseType: 'json',
        family: 4
      }
    );

    if (!res.data.success) throw new Error(res.data.reason || 'Unknown error');

    const lines = res.data.data
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0);

    const rawEntries = lines.filter((line: string) => (line.match(/;/g) || []).length >= 2);
    const entries = rawEntries
      .map((entry: string) => entry.split(';').map(part => part.trim()))
      .filter(([id]) => /^\d+$/.test(id));

    const playerCount = entries.length;
    
    const embed = {
      color: playerCount > 0 ? 0x00AE86 : 0x95A5A6,
      title: `👥 Online Players (${playerCount})`,
      fields: [
        {
          name: '🌐 Server ID',
          value: guildConfig.serverId,
          inline: true
        },
        {
          name: '⏰ Last Updated',
          value: new Date().toLocaleTimeString(),
          inline: true
        }
      ],
      timestamp: new Date().toISOString()
    };

    if (playerCount > 0) {
      // Function to escape Discord markdown characters
      const escapeMarkdown = (text) => {
        return text.replace(/_/g, '\\_').replace(/\*/g, '\\*').replace(/~/g, '\\~').replace(/`/g, '\\`');
      };

      // Split players into groups of 25 for multiple fields
      const playersPerField = 25;
      for (let i = 0; i < entries.length; i += playersPerField) {
        const fieldEntries = entries.slice(i, i + playersPerField);
        const playerList = fieldEntries
          .map(([id, uid, name]) => `• ${escapeMarkdown(name)}`)
          .join('\n');
        
        const fieldName = entries.length <= playersPerField 
          ? '📋 Current Players' 
          : `📋 Players ${i + 1}-${Math.min(i + playersPerField, entries.length)}`;
        
        embed.fields.push({
          name: fieldName,
          value: playerList,
          inline: false
        });
      }
    } else {
      embed.fields.push({
        name: '📋 Current Players',
        value: 'No players currently online',
        inline: false
      });
    }

    try {
      await channel.send({ embeds: [embed] });
      console.log(`✅ Community list posted to channel ${guildConfig.onlineListChannelId}`);
    } catch (sendError: any) {
      if (sendError.code === 50013) {
        console.error(`❌ Permission denied: Bot lacks permission to send messages in channel ${guildConfig.onlineListChannelId}`);
        console.error('Solution: Grant bot "Send Messages" and "View Channel" permissions');
      } else {
        console.error('Failed to send community list message:', sendError.message);
      }
      return; // Don't throw, just log and continue
    }
    
  } catch (error: any) {
    // Clean error logging focused on troubleshooting
    const serverId = guildConfig.serverId;
    const guildId = guild.id;
    
    if (error.response?.status === 500) {
      console.log(`⚠️ Server offline: ${serverId} (Guild: ${guildId}) - ${error.response.data?.reason || 'Server unreachable'}`);
    } else if (error.response?.status === 401) {
      console.log(`🔑 Auth failed: ${serverId} (Guild: ${guildId}) - Check API token`);
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      console.log(`🌐 Network error: ${serverId} (Guild: ${guildId}) - ${error.code}`);
    } else if (error.code === 'ETIMEDOUT') {
      console.log(`⏱️ Timeout: ${serverId} (Guild: ${guildId}) - API request timed out`);
    } else {
      console.log(`❌ Community list error: ${serverId} (Guild: ${guildId}) - ${error.message}`);
    }
    // Don't throw to prevent crash, just log and continue
  }
}

async function handleUpdate(message: any, botInstanceId: number) {
  const guildId = message.guild?.id;
  if (!guildId) {
    return message.channel.send('❌ This command must be used in a server.');
  }

  const updateEmbed = {
    color: 0x3498DB,
    title: '🔧 Configuration Update',
    description: 'Which setting would you like to update?',
    fields: [
      { name: '1️⃣ Server ID', value: 'Update your ARMA server ID', inline: false },
      { name: '2️⃣ API Token', value: 'Update your RCON API token', inline: false },
      { name: '3️⃣ Ban Log Channel', value: 'Change the ban log channel', inline: false },
      { name: '4️⃣ Online List Channel', value: 'Change the community list channel', inline: false },
      { name: '5️⃣ RCON Terminal Channel', value: 'Change the autolist channel', inline: false }
    ],
    footer: { text: 'Type the number (1-5) or "cancel" to abort' }
  };

  await message.channel.send({ embeds: [updateEmbed] });

  const filter = (m: any) => m.author.id === message.author.id;
  const collected = await message.channel.awaitMessages({ 
    filter, max: 1, time: 30000, errors: ['time'] 
  }).catch(() => null);

  if (!collected) {
    return message.channel.send('⏲️ Update timed out. Please run `!update` again.');
  }

  const choice = collected.first().content.trim();
  if (choice.toLowerCase() === 'cancel') {
    return message.channel.send('❌ Update cancelled.');
  }

  const choiceMap: any = {
    '1': { field: 'serverId', name: 'Server ID', prompt: 'Enter the new Server ID:' },
    '2': { field: 'apiToken', name: 'API Token', prompt: 'Enter the new API Token:' },
    '3': { field: 'banLogChannelId', name: 'Ban Log Channel', prompt: 'Mention or enter the new Ban Log Channel ID:' },
    '4': { field: 'onlineListChannelId', name: 'Online List Channel', prompt: 'Mention or enter the new Online List Channel ID:' },
    '5': { field: 'rconTerminalChannelId', name: 'RCON Terminal Channel', prompt: 'Mention or enter the new RCON Terminal Channel ID:' }
  };

  const selectedOption = choiceMap[choice];
  if (!selectedOption) {
    return message.channel.send('❌ Invalid choice. Please run `!update` again and select 1-5.');
  }

  await message.channel.send(`🔹 **${selectedOption.name}**\n${selectedOption.prompt}`);

  const valueCollector = message.channel.createMessageCollector({ 
    filter, max: 1, time: 120000 
  });

  valueCollector.on('collect', async (m: any) => {
    let newValue = m.content.trim();
    
    if (newValue.toLowerCase() === 'cancel') {
      return message.channel.send('❌ Update cancelled.');
    }

    // Handle channel mentions for channel fields
    if (selectedOption.field.includes('ChannelId')) {
      const channelMatch = newValue.match(/^<#(\d+)>$/);
      const channelId = channelMatch ? channelMatch[1] : newValue;
      
      if (!/^[0-9]+$/.test(channelId) || !message.guild.channels.cache.has(channelId)) {
        return message.channel.send('❌ Invalid channel ID. Please run `!update` again.');
      }
      newValue = channelId;
    }

    try {
      // Load current config
      const fs = await import('fs');
      const path = await import('path');
      const { fileURLToPath } = await import('url');
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const cfgPath = path.join(__dirname, 'guildConfig.json');
      let config: any = {};
      
      if (fs.existsSync(cfgPath)) {
        try {
          config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        } catch (e) {
          config = {};
        }
      }

      // Update the specific field
      if (!config[guildId]) config[guildId] = {};
      config[guildId][selectedOption.field] = newValue;

      // Save updated config
      fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2));

      const successEmbed = {
        color: 0x00FF00,
        title: '✅ Configuration Updated',
        description: `**${selectedOption.name}** has been successfully updated.`,
        fields: selectedOption.field.includes('ChannelId') 
          ? [{ name: 'New Value', value: `<#${newValue}>`, inline: false }]
          : [{ name: 'New Value', value: selectedOption.field === 'apiToken' ? '***HIDDEN***' : newValue, inline: false }]
      };

      await message.channel.send({ embeds: [successEmbed] });
      console.log(`🔧 Config updated for guild ${guildId}: ${selectedOption.field} = ${selectedOption.field === 'apiToken' ? '[HIDDEN]' : newValue}`);

    } catch (error) {
      console.error('Update error:', error);
      await message.channel.send('❌ Error saving configuration. Please try again.');
    }
  });

  valueCollector.on('end', (collected: any) => {
    if (collected.size === 0) {
      message.channel.send('⏲️ Update timed out. Please run `!update` again.');
    }
  });
}
