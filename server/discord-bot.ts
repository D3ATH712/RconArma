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
          // Run community list immediately
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
    
    // Initialize IP monitoring
    ipMonitor.setDiscordClient(client);
    ipMonitor.startMonitoring(5); // Check every 5 hours
    
    // Restore automatic lists for all configured guilds
    await restoreAutoLists(client);
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
      return handleFind(message);
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
      '2️⃣ Display Name',
      '3️⃣ API Token',
      '4️⃣ Ban-log Channel',
      '5️⃣ Online List Channel',
      '6️⃣ RCON Terminal Channel',
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

  // Step 2: Display Name
  const step2Embed = {
    color: 0x3498DB,
    title: '🔹 Step 2: Display Name',
    description: 'Please enter a **friendly display name** for your server (e.g., "Main ARMA Server", "Community Reforger").\n\n*This will appear in Discord embeds instead of the raw server ID.*'
  };
  await message.channel.send({ embeds: [step2Embed] });
  
  const collected2 = await message.channel.awaitMessages({ 
    filter: filterMsg, max: 1, time: 120000, errors: ['time'] 
  }).catch(() => null);
  
  if (!collected2) return message.channel.send('⏲️ Setup timed out. Please run `!setup` again.');
  const displayName = collected2.first().content.trim();
  if (displayName.toLowerCase() === 'cancel') return message.channel.send('❌ Setup cancelled.');
  if (displayName.length < 1 || displayName.length > 50) {
    return message.channel.send('❌ Display name must be 1-50 characters. Please run `!setup` again.');
  }
  await message.channel.send(`✅ Display name set to \`${displayName}\`.`);

  // Step 3: API Token
  const step3Embed = {
    color: 0x3498DB,
    title: '🔹 Step 3: API Token',
    description: 'Please enter your **API Token**.'
  };
  await message.channel.send({ embeds: [step3Embed] });
  
  const collected3 = await message.channel.awaitMessages({ 
    filter: filterMsg, max: 1, time: 120000, errors: ['time'] 
  }).catch(() => null);
  
  if (!collected3) return message.channel.send('⏲️ Setup timed out. Please run `!setup` again.');
  const apiToken = collected3.first().content.trim();
  if (apiToken.toLowerCase() === 'cancel') return message.channel.send('❌ Setup cancelled.');
  if (apiToken.length < 10) {
    return message.channel.send('❌ API Token seems too short. Please run `!setup` again.');
  }
  await message.channel.send('✅ API Token set.');

  // Step 4: Ban-log Channel
  const step4Embed = {
    color: 0x3498DB,
    title: '🔹 Step 4: Ban-log Channel',
    description: 'Please mention or enter the **Ban-log Channel** where bans will be posted.'
  };
  await message.channel.send({ embeds: [step4Embed] });
  
  const collected4 = await message.channel.awaitMessages({ 
    filter: filterMsg, max: 1, time: 120000, errors: ['time'] 
  }).catch(() => null);
  
  if (!collected4) return message.channel.send('⏲️ Setup timed out. Please run `!setup` again.');
  let banLogInput = collected4.first().content.trim();
  if (banLogInput.toLowerCase() === 'cancel') return message.channel.send('❌ Setup cancelled.');
  
  const mentionMatch = banLogInput.match(/^<#(\d+)>$/);
  const banLogChannelId = mentionMatch ? mentionMatch[1] : banLogInput;
  if (!/^[0-9]+$/.test(banLogChannelId) || !message.guild.channels.cache.has(banLogChannelId)) {
    return message.channel.send('❌ Invalid channel ID. Please run `!setup` again.');
  }
  await message.channel.send(`✅ Ban-log channel set to <#${banLogChannelId}>.`);

  // Step 5: Online List Channel
  const step5Embed = {
    color: 0x3498DB,
    title: '🔹 Step 5: Online List Channel',
    description: 'Please mention or enter the **Online List Channel** where community player lists will be posted.'
  };
  await message.channel.send({ embeds: [step5Embed] });
  
  const collected5 = await message.channel.awaitMessages({ 
    filter: filterMsg, max: 1, time: 120000, errors: ['time'] 
  }).catch(() => null);
  
  if (!collected5) return message.channel.send('⏲️ Setup timed out. Please run `!setup` again.');
  let onlineListInput = collected5.first().content.trim();
  if (onlineListInput.toLowerCase() === 'cancel') return message.channel.send('❌ Setup cancelled.');
  
  const onlineListMatch = onlineListInput.match(/^<#(\d+)>$/);
  const onlineListChannelId = onlineListMatch ? onlineListMatch[1] : onlineListInput;
  if (!/^[0-9]+$/.test(onlineListChannelId) || !message.guild.channels.cache.has(onlineListChannelId)) {
    return message.channel.send('❌ Invalid channel ID. Please run `!setup` again.');
  }
  await message.channel.send(`✅ Online List channel set to <#${onlineListChannelId}>.`);

  // Step 6: RCON Terminal Channel
  const step6Embed = {
    color: 0x3498DB,
    title: '🔹 Step 6: RCON Terminal Channel',
    description: 'Please mention or enter the **RCON Terminal Channel** where autolist and RCON activity will be posted.'
  };
  await message.channel.send({ embeds: [step6Embed] });
  
  const collected6 = await message.channel.awaitMessages({ 
    filter: filterMsg, max: 1, time: 120000, errors: ['time'] 
  }).catch(() => null);
  
  if (!collected6) return message.channel.send('⏲️ Setup timed out. Please run `!setup` again.');
  let rconTerminalInput = collected6.first().content.trim();
  if (rconTerminalInput.toLowerCase() === 'cancel') return message.channel.send('❌ Setup cancelled.');
  
  const rconTerminalMatch = rconTerminalInput.match(/^<#(\d+)>$/);
  const rconTerminalChannelId = rconTerminalMatch ? rconTerminalMatch[1] : rconTerminalInput;
  if (!/^[0-9]+$/.test(rconTerminalChannelId) || !message.guild.channels.cache.has(rconTerminalChannelId)) {
    return message.channel.send('❌ Invalid channel ID. Please run `!setup` again.');
  }
  await message.channel.send(`✅ RCON Terminal channel set to <#${rconTerminalChannelId}>.`);

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
    
    // Add/update this guild's config with all 6 fields plus defaults
    config[guildId] = {
      serverId,
      apiToken,
      banLogChannelId,
      onlineListChannelId,
      rconTerminalChannelId,
      autoListEnabled: true,
      communityListEnabled: true,
      displayName: displayName
    };
    
    // Save back to file
    fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2));

    const summaryEmbed = {
      color: 0x2ECC71,
      title: '✅ Configuration Complete!',
      fields: [
        { name: 'Server ID', value: `\`${serverId}\``, inline: true },
        { name: 'Display Name', value: `\`${displayName}\``, inline: true },
        { name: 'API Token', value: '`••••••••••`', inline: true },
        { name: 'Ban-log Channel', value: `<#${banLogChannelId}>`, inline: true },
        { name: 'Online List Channel', value: `<#${onlineListChannelId}>`, inline: true },
        { name: 'RCON Terminal Channel', value: `<#${rconTerminalChannelId}>`, inline: true },
        { name: 'Auto Features', value: 'AutoList & Community List: **Enabled**', inline: false }
      ],
      footer: { text: 'Your bot is now ready with all 6 settings configured! AutoList and Community monitoring are enabled by default.' }
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
    '**!find <name>** - Search for players by name in database',
    '**!startautolist** - Start automatic player list updates',
    '**!stopautolist** - Stop automatic player list updates',
    '**!startcommunitylist** - Start community status monitoring',
    '**!stopcommunitylist** - Stop community status monitoring',
    '**!checkip** - Check current Replit outbound IP address',
    '**!ipalert on** - Enable IP change alerts for this channel',
    '**!ipalert off** - Disable IP change alerts for this channel',
    '**!ipalert status** - Show IP monitoring status',
    '**!setup** - Configure bot for this server',
    '**!update** - Update bot configuration'
  ].join('\n');

  await message.channel.send(`🔨 **Available Commands:**\n${commandList}`);
}

async function handleFind(message: any) {
  const args = message.content.slice('!find '.length).trim();
  
  if (!args) {
    return message.channel.send('❌ Please provide a search term. Usage: `!find <playername>`');
  }

  try {
    const { searchPlayers } = await import('./player-tracker.js');
    const results = searchPlayers(args);
    
    if (results.length === 0) {
      return message.channel.send(`🔍 No players found matching "${args}"`);
    }

    // Limit results to prevent spam
    const limitedResults = results.slice(0, 10);
    const resultText = limitedResults.map(player => {
      const timesSeenText = player.timesSeen === 1 ? '1 time' : `${player.timesSeen} times`;
      return `**${player.name}**\nUID: \`${player.uid}\`\nID: \`${player.playerId}\`\nSeen: ${timesSeenText}\nLast seen: <t:${Math.floor(new Date(player.lastSeen).getTime() / 1000)}:R>`;
    }).join('\n\n');

    const embed = {
      color: 0x00AE86,
      title: `🔍 Search Results for "${args}"`,
      description: resultText,
      footer: { 
        text: results.length > 10 ? `Showing first 10 of ${results.length} results` : `Found ${results.length} result${results.length === 1 ? '' : 's'}`
      }
    };

    await message.channel.send({ embeds: [embed] });
    
  } catch (error) {
    console.error('Error in find command:', error);
    await message.channel.send('❌ Error searching player database.');
  }
}

async function performAutoPlayerList(guild: any, guildConfig: any) {
  try {
    const channel = guild.channels.cache.get(guildConfig.rconTerminalChannelId);
    if (!channel) {
      console.error('RCON Terminal Channel not found:', guildConfig.rconTerminalChannelId);
      return;
    }
    
    // Delete old autolist messages before posting new one
    try {
      const messages = await channel.messages.fetch({ limit: 50 });
      const botMessages = messages.filter((msg: any) => 
        msg.author.id === channel.client.user.id &&
        msg.embeds.length > 0 &&
        msg.embeds[0].title &&
        (msg.embeds[0].title.includes('Players on') || msg.embeds[0].title.includes('online'))
      );
      
      if (botMessages.size > 0) {
        await Promise.all(botMessages.map((msg: any) => msg.delete().catch(() => {})));
        console.log(`🗑️ Deleted ${botMessages.size} old autolist messages`);
      }
    } catch (error) {
      console.log('⚠️ Could not delete old autolist messages (might be too old)');
    }
    
    // Get player data from RCON API and log to database
    try {
      const res = await axios.post(
        `https://api.0grind.io/v2/armareforger/${guildConfig.serverId}/rcon`,
        { command: '#players' },
        { headers: { Authorization: `Bearer ${guildConfig.apiToken}` } }
      );

      if (res.data.success && res.data.data) {
        // Parse and log players to database
        const lines = res.data.data.split('\n').filter((line: string) => line.trim());
        const rawEntries = lines.filter((line: string) => (line.match(/;/g) || []).length >= 2);
        const entries = rawEntries
          .map((entry: string) => entry.split(';').map((part: string) => part.trim()))
          .filter(([id]: string[]) => /^\d+$/.test(id));

        // Import player tracker and save each player
        const { savePlayer } = await import('./player-tracker.js');
        
        for (const [playerId, uid, name] of entries) {
          try {
            await savePlayer(uid, name, playerId);
          } catch (playerError) {
            console.warn(`Failed to save player ${name}:`, playerError);
          }
        }
        
        if (entries.length > 0) {
          console.log(`📊 Autolist: Logged ${entries.length} players to database for ${guildConfig.serverId}`);
        }
      } else {
        console.log(`⚠️ Autolist: Server ${guildConfig.serverId} returned no player data - ${res.data.reason || 'Unknown reason'}`);
      }
    } catch (apiError: any) {
      if (apiError.response?.status === 500) {
        console.log(`🔴 Autolist: Server ${guildConfig.serverId} offline - ${apiError.response.data?.reason || 'Server unreachable'}`);
      } else if (apiError.response?.status === 401) {
        console.log(`🔑 Autolist: Auth failed for ${guildConfig.serverId} - Check API token`);
      } else {
        console.log(`⚠️ Autolist: Network error for ${guildConfig.serverId} - ${apiError.code || 'Unknown error'}`);
      }
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
    
  } catch (error) {
    console.error('Error in performAutoPlayerList:', error);
    throw error;
  }
}

async function performCommunityPlayerList(guild: any, guildConfig: any) {
  try {
    const channel = guild.channels.cache.get(guildConfig.onlineListChannelId);
    if (!channel) {
      console.error('Online List Channel not found:', guildConfig.onlineListChannelId);
      return;
    }

    // Delete old community list messages before posting new one
    try {
      const messages = await channel.messages.fetch({ limit: 50 });
      const botMessages = messages.filter((msg: any) => 
        msg.author.id === channel.client.user.id &&
        msg.embeds.length > 0 &&
        msg.embeds[0].title &&
        (msg.embeds[0].title.includes('Community Status') || msg.embeds[0].title.includes(guildConfig.serverId) || msg.embeds[0].title.includes(guildConfig.displayName))
      );
      
      if (botMessages.size > 0) {
        await Promise.all(botMessages.map((msg: any) => msg.delete().catch(() => {})));
        console.log(`🗑️ Deleted ${botMessages.size} old community list messages`);
      }
    } catch (error) {
      console.log('⚠️ Could not delete old community list messages (might be too old)');
    }

    // Get player data from RCON API with error handling
    let res;
    try {
      res = await axios.post(
        `https://api.0grind.io/v2/armareforger/${guildConfig.serverId}/rcon`,
        { command: '#players' },
        { headers: { Authorization: `Bearer ${guildConfig.apiToken}` } }
      );
    } catch (apiError: any) {
      if (apiError.response?.status === 500) {
        console.log(`🔴 Community list: Server ${guildConfig.serverId} offline - ${apiError.response.data?.reason || 'Server unreachable'}`);
      } else if (apiError.response?.status === 401) {
        console.log(`🔑 Community list: Auth failed for ${guildConfig.serverId} - Check API token`);
      } else {
        console.log(`⚠️ Community list: Network error for ${guildConfig.serverId} - ${apiError.code || 'Unknown error'}`);
      }
      
      // Create offline server embed
      const embed = {
        color: 0x95A5A6,
        title: `🌍 ${guildConfig.displayName || guildConfig.serverId} Community Status`,
        description: `**Server Status:** Offline`,
        fields: [
          { 
            name: '🔴 Status', 
            value: `Server unreachable`, 
            inline: true 
          },
          { 
            name: '🕐 Last Updated', 
            value: `<t:${Math.floor(Date.now() / 1000)}:R>`, 
            inline: true 
          }
        ],
        timestamp: new Date()
      };

      await channel.send({ embeds: [embed] });
      return;
    }

    if (!res.data.success) {
      console.log(`⚠️ Community list: Server ${guildConfig.serverId} returned error - ${res.data.reason || 'Unknown reason'}`);
      
      // Create error embed
      const embed = {
        color: 0x95A5A6,
        title: `🌍 ${guildConfig.displayName || guildConfig.serverId} Community Status`,
        description: `**Players Online:** 0/64`,
        fields: [
          { 
            name: '📊 Server Load', 
            value: `0%`, 
            inline: true 
          },
          { 
            name: '🕐 Last Updated', 
            value: `<t:${Math.floor(Date.now() / 1000)}:R>`, 
            inline: true 
          }
        ],
        timestamp: new Date()
      };

      await channel.send({ embeds: [embed] });
      return;
    }

    // Check if data exists and is a string before splitting
    if (!res.data.data || typeof res.data.data !== 'string') {
      console.log(`📊 Community list posted for ${guildConfig.serverId}: 0 players (empty response)`);
      
      // Create embed for empty server
      const embed = {
        color: 0x95A5A6,
        title: `🌍 ${guildConfig.displayName || guildConfig.serverId} Community Status`,
        description: `**Players Online:** 0/64`,
        fields: [
          { 
            name: '📊 Server Load', 
            value: `0%`, 
            inline: true 
          },
          { 
            name: '🕐 Last Updated', 
            value: `<t:${Math.floor(Date.now() / 1000)}:R>`, 
            inline: true 
          }
        ],
        timestamp: new Date()
      };

      await channel.send({ embeds: [embed] });
      return;
    }

    const lines = res.data.data.split('\n').filter((line: string) => line.trim());
    const rawEntries = lines.filter((line: string) => (line.match(/;/g) || []).length >= 2);
    const entries = rawEntries
      .map((entry: string) => entry.split(';').map((part: string) => part.trim()))
      .filter(([id]: string[]) => /^\d+$/.test(id));

    // Log players to database from community monitoring too
    if (entries.length > 0) {
      const { savePlayer } = await import('./player-tracker.js');
      
      for (const [playerId, uid, name] of entries) {
        try {
          await savePlayer(uid, name, playerId);
        } catch (playerError) {
          console.warn(`Failed to save player ${name}:`, playerError);
        }
      }
      
      console.log(`📊 Community list: Logged ${entries.length} players to database for ${guildConfig.serverId}`);
    }

    const playerCount = entries.length;
    const maxPlayers = 128; // ARMA Reforger server capacity

    // Create community status embed
    const embed = {
      color: playerCount > 0 ? 0x2ECC71 : 0x95A5A6,
      title: `🌍 ${guildConfig.displayName || guildConfig.serverId} Community Status`,
      description: `**Players Online:** ${playerCount}/${maxPlayers}`,
      fields: [
        { 
          name: '📊 Server Load', 
          value: `${Math.round((playerCount / maxPlayers) * 100)}%`, 
          inline: true 
        },
        { 
          name: '🕐 Last Updated', 
          value: `<t:${Math.floor(Date.now() / 1000)}:R>`, 
          inline: true 
        }
      ],
      timestamp: new Date()
    };

    if (playerCount > 0) {
      // Limit player list to prevent Discord character limits
      const maxPlayersToShow = 8; // Reduced from 5 to be safe with character limits
      const playerList = entries
        .slice(0, maxPlayersToShow)
        .map(([id, uid, name]: string[]) => {
          // Truncate long names to prevent character limit issues
          const displayName = name.length > 20 ? name.substring(0, 20) + '...' : name;
          return `• **${displayName}**`;
        })
        .join('\n');
      
      // Ensure total field value stays under Discord's 1024 character limit
      const remainingCount = entries.length - maxPlayersToShow;
      const fieldValue = remainingCount > 0 
        ? playerList + `\n*...and ${remainingCount} more*`
        : playerList;
      
      // Only add the field if it's not too long
      if (fieldValue.length <= 1024) {
        embed.fields.push({ 
          name: '👥 Recent Players', 
          value: fieldValue, 
          inline: false 
        });
      }
    }

    // Delete old community list messages before posting new one
    try {
      const messages = await channel.messages.fetch({ limit: 50 });
      const botMessages = messages.filter((msg: any) => 
        msg.author.id === channel.client.user.id &&
        msg.embeds.length > 0 &&
        msg.embeds[0].title &&
        msg.embeds[0].title.includes('Community Status')
      );
      
      if (botMessages.size > 0) {
        await Promise.all(botMessages.map((msg: any) => msg.delete().catch(() => {})));
        console.log(`🗑️ Deleted ${botMessages.size} old community list messages`);
      }
    } catch (error) {
      console.log('⚠️ Could not delete old community messages (might be too old)');
    }

    await channel.send({ embeds: [embed] });
    console.log(`📊 Community list posted for ${guildConfig.serverId}: ${playerCount} players`);

  } catch (error) {
    console.error('Error in performCommunityPlayerList:', error);
    // Don't throw error to prevent stopping the interval
    console.log(`⚠️ Community list failed for ${guildConfig.serverId}, will retry next interval`);
  }
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
  
  // Start the auto-list interval (10 minutes = 600,000 milliseconds)
  const intervalId = setInterval(async () => {
    try {
      await performAutoPlayerList(message.guild, guildConfig);
    } catch (error) {
      console.error('Auto-list error:', error);
    }
  }, 600000); // 10 minutes
  
  autoListIntervals.set(guildId, intervalId);
  
  // Perform initial update immediately
  await performAutoPlayerList(message.guild, guildConfig);
  
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
    return message.channel.send('⚠️ Auto-list is not currently running.');
  }
  
  clearInterval(autoListIntervals.get(guildId));
  autoListIntervals.delete(guildId);
  
  // Save autolist status to config file
  await saveAutoListStatus(guildId, false);
  
  const confirmEmbed = {
    color: 0xFF5555,
    title: '🛑 Auto-list Stopped',
    description: 'Automatic player list updates have been disabled.',
    fields: [
      { name: 'Restart Command', value: '`!startautolist`', inline: true }
    ]
  };
  
  await message.channel.send({ embeds: [confirmEmbed] });
  console.log(`🛑 Auto-list stopped for guild ${guildId}`);
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
    return message.channel.send('⚠️ Community list is not currently running.');
  }
  
  clearInterval(communityListIntervals.get(guildId));
  communityListIntervals.delete(guildId);
  
  // Save community list status for persistence
  await saveCommunityListStatus(guildId, false);
  
  const confirmEmbed = {
    color: 0xFF5555,
    title: '🛑 Community List Stopped',
    description: 'Automatic community status updates have been disabled.',
    fields: [
      { name: 'Restart Command', value: '`!startcommunitylist`', inline: true }
    ]
  };
  
  await message.channel.send({ embeds: [confirmEmbed] });
  console.log(`🛑 Community-list stopped for guild ${guildId}`);
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
      { name: '2️⃣ Display Name', value: 'Set a friendly name for embeds', inline: false },
      { name: '3️⃣ API Token', value: 'Update your RCON API token', inline: false },
      { name: '4️⃣ Ban Log Channel', value: 'Change the ban log channel', inline: false },
      { name: '5️⃣ Online List Channel', value: 'Change the community list channel', inline: false },
      { name: '6️⃣ RCON Terminal Channel', value: 'Change the autolist channel', inline: false }
    ],
    footer: { text: 'Type the number (1-6) or "cancel" to abort' }
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
    '2': { field: 'displayName', name: 'Display Name', prompt: 'Enter a friendly display name (e.g., "Main ARMA Server", "Community Reforger"):' },
    '3': { field: 'apiToken', name: 'API Token', prompt: 'Enter the new API Token:' },
    '4': { field: 'banLogChannelId', name: 'Ban Log Channel', prompt: 'Mention or enter the new Ban Log Channel ID:' },
    '5': { field: 'onlineListChannelId', name: 'Online List Channel', prompt: 'Mention or enter the new Online List Channel ID:' },
    '6': { field: 'rconTerminalChannelId', name: 'RCON Terminal Channel', prompt: 'Mention or enter the new RCON Terminal Channel ID:' }
  };

  const selectedOption = choiceMap[choice];
  if (!selectedOption) {
    return message.channel.send('❌ Invalid choice. Please run `!update` again and select 1-6.');
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

      // Log activity
      await storage.logActivity(botInstanceId, guildId, "configuration_updated", {
        field: selectedOption.field,
        moderator: message.author.tag
      });

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
