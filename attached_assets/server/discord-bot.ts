import { Client, GatewayIntentBits, Partials } from 'discord.js';
import axios from 'axios';
import { storage } from './storage';
// Types for bot instance
interface BotInstance {
  id: number;
  name: string;
  token: string;
}

interface GuildConfiguration {
  serverId: string;
  apiToken: string;
  banLogChannelId?: string;
  onlineListChannelId?: string;
  rconTerminalChannelId?: string;
}
import { ipMonitor } from './ip-monitor';

interface BotProcess {
  client: Client;
  botInstance: BotInstance;
}

const activeBots = new Map<number, BotProcess>();
const autoListIntervals = new Map<string, NodeJS.Timeout>(); // Track auto-list intervals by guild ID
const communityListIntervals = new Map<string, NodeJS.Timeout>(); // Track community-list intervals by guild ID

export async function startDiscordBot(botInstance: BotInstance): Promise<void> {
  // Stop existing bot if running
  if (activeBots.has(botInstance.id)) {
    await stopDiscordBot(botInstance.id);
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
    console.log(`🏠 Bot is in ${client.guilds.cache.size} servers`);
    client.guilds.cache.forEach(guild => {
      console.log(`📍 Server: ${guild.name} (${guild.id})`);
    });
    
    // Initialize IP monitoring
    ipMonitor.setDiscordClient(client);
    ipMonitor.startMonitoring(5); // Check every 5 hours
  });

  client.on('messageCreate', async (message) => {
    console.log(`📨 [RAW] Got ANY message from ${message.author.username}`);
    
    if (message.author.bot) {
      console.log(`📨 [DEBUG] Ignoring bot message`);
      return;
    }
    
    const content = message.content.trim();
    const guildId = message.guild?.id;

    console.log(`📨 [DEBUG] Message received: "${content}" from ${message.author.username} in ${guildId ? `guild ${guildId}` : 'DM'}`);

    // Only process bot commands (messages starting with !)
    if (!content.startsWith('!')) {
      console.log(`📨 [DEBUG] Not a command (doesn't start with !)`);
      return;
    }

    console.log(`📨 [DEBUG] Processing command: "${content}" from ${message.author.username}`);

    if (!guildId) {
      console.log(`📨 [DEBUG] No guild ID - command sent in DM, ignoring`);
      return;
    }

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

    // Process commands that require guild config
    console.log(`🎯 Processing command: ${content}`);

    if (content === '!findtest') {
      console.log('🔍 Find test command triggered');
      await message.channel.send('✅ Find command is working! Now let me implement the search...');
      return;
    }
    if (content === '!dbcheck') {
      console.log('🔍 Database check command triggered');
      try {
        const fs = await import('fs');
        const path = await import('path');
        const { fileURLToPath } = await import('url');
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const playersFile = path.join(__dirname, 'players-database.json');
        
        if (!fs.existsSync(playersFile)) {
          await message.channel.send('❌ Player database file not found');
          return;
        }
        
        const data = JSON.parse(fs.readFileSync(playersFile, 'utf8'));
        const playerNames = Object.values(data).map((p: any) => p.name);
        await message.channel.send(`📊 Database contains ${Object.keys(data).length} players:\n${playerNames.slice(0, 10).join(', ')}`);
        return;
      } catch (error) {
        console.error('Database check error:', error);
        await message.channel.send('❌ Error checking database');
        return;
      }
    }
    if (content.startsWith('!search ')) {
      console.log('🔍 Search command triggered');
      const searchTerm = content.substring(8).trim();
      
      try {
        const fs = await import('fs');
        const path = await import('path');
        const { fileURLToPath } = await import('url');
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const playersFile = path.join(__dirname, 'players-database.json');
        
        if (!fs.existsSync(playersFile)) {
          await message.channel.send('❌ Player database not found. The autolist needs to run first.');
          return;
        }
        
        const data = JSON.parse(fs.readFileSync(playersFile, 'utf8'));
        const matches = Object.values(data).filter((p: any) => 
          p.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
        
        if (matches.length === 0) {
          await message.channel.send(`❌ No players found matching "${searchTerm}"`);
          return;
        }
        
        const result = matches.slice(0, 5).map((p: any) => {
          const lastSeenDate = new Date(p.lastSeen);
          const timeSince = Math.floor((Date.now() - lastSeenDate.getTime()) / (1000 * 60 * 60));
          const timeString = timeSince < 1 ? 'Recently' : 
                           timeSince < 24 ? `${timeSince}h ago` : 
                           `${Math.floor(timeSince / 24)}d ago`;
          
          return `**${p.name}** (ID: ${p.playerId}, Seen: ${p.timesSeen} times, Last: ${timeString})`;
        }).join('\n');
        
        await message.channel.send(`🔍 Found ${matches.length} player(s) matching "${searchTerm}":\n\n${result}`);
        return;
      } catch (error) {
        console.error('Search error:', error);
        await message.channel.send('❌ Error searching player database');
        return;
      }
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

    // Handle commands
    if (content.startsWith('!setup')) {
      return handleSetup(message, botInstance.id);
    }
    if (content.startsWith('!update')) {
      return handleUpdate(message, botInstance.id);
    }
    if (content.startsWith('!startautolist')) {
      return handleStartAutoList(message, guildConfig);
    }
    if (content.startsWith('!stopautolist')) {
      return handleStopAutoList(message, guildConfig);
    }
    if (content.startsWith('!startcommunitylist')) {
      return handleStartCommunityList(message, guildConfig);
    }
    if (content.startsWith('!stopcommunitylist')) {
      return handleStopCommunityList(message, guildConfig);
    }
    if (content.startsWith('!players')) {
      // Use original command file directly for debugging
      const playersCommand = await import('./commands/players.cjs');
      return playersCommand.default({ message });
    }
    if (content === '!findtest') {
      console.log('🔍 Find test command triggered');
      await message.channel.send('✅ Find command is working! Now let me implement the search...');
      return;
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

    if (content === '!dbtest') {
      console.log('🔍 Testing database connection and player storage...');
      try {
        // Test saving a sample player to database
        await storage.createOrUpdatePlayer({
          uid: 'test123',
          name: 'TestPlayer',
          playerId: '999'
        });
        console.log('✅ Successfully saved test player to database');
        
        // Test retrieving the player
        const testPlayer = await storage.getPlayer('test123');
        if (testPlayer) {
          console.log('✅ Successfully retrieved test player from database');
          await message.channel.send('✅ Database connection and player storage working correctly!');
        } else {
          await message.channel.send('❌ Could not retrieve test player from database');
        }
      } catch (error) {
        console.error('❌ Database test failed:', error);
        await message.channel.send(`❌ Database test failed: ${error.message}`);
      }
      return;
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
        
        // Log to system logs for dashboard visibility
        await storage.createSystemLog({
          level: 'INFO',
          component: 'DISCORD',
          message: `IP check requested by ${message.author.username}: ${currentIp}`,
          metadata: null
        });
        
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

  await client.login('MTM3MzQzOTM5NzIxNDU1NjI1MA.G7RGGa.1X-xb0fGjm60UXzAr9lXYK79aEqGE9uv-_xcdk');
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
      '4️⃣ Online List Channel',
      '5️⃣ RCON Terminal Channel',
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

  // Step 4: Online List Channel
  const step4Embed = {
    color: 0x3498DB,
    title: '🔹 Step 4: Online List Channel',
    description: 'Please mention or enter the **Online List Channel** where player counts and server status will be posted.'
  };
  await message.channel.send({ embeds: [step4Embed] });
  
  const collected4 = await message.channel.awaitMessages({ 
    filter: filterMsg, max: 1, time: 120000, errors: ['time'] 
  }).catch(() => null);
  
  if (!collected4) return message.channel.send('⏲️ Setup timed out. Please run `!setup` again.');
  let onlineListInput = collected4.first().content.trim();
  if (onlineListInput.toLowerCase() === 'cancel') return message.channel.send('❌ Setup cancelled.');
  
  const onlineListMatch = onlineListInput.match(/^<#(\d+)>$/);
  const onlineListChannelId = onlineListMatch ? onlineListMatch[1] : onlineListInput;
  if (!/^[0-9]+$/.test(onlineListChannelId) || !message.guild.channels.cache.has(onlineListChannelId)) {
    return message.channel.send('❌ Invalid channel ID. Please run `!setup` again.');
  }
  await message.channel.send(`✅ Online List channel set to <#${onlineListChannelId}>.`);

  // Step 5: RCON Terminal Channel
  const step5Embed = {
    color: 0x3498DB,
    title: '🔹 Step 5: RCON Terminal Channel',
    description: 'Please mention or enter the **RCON Terminal Channel** where RCON commands and responses will be logged.'
  };
  await message.channel.send({ embeds: [step5Embed] });
  
  const collected5 = await message.channel.awaitMessages({ 
    filter: filterMsg, max: 1, time: 120000, errors: ['time'] 
  }).catch(() => null);
  
  if (!collected5) return message.channel.send('⏲️ Setup timed out. Please run `!setup` again.');
  let rconTerminalInput = collected5.first().content.trim();
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
    
    // Add/update this guild's config
    config[guildId] = {
      serverId,
      apiToken,
      banLogChannelId,
      onlineListChannelId,
      rconTerminalChannelId
    };
    
    // Save back to file
    fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2));

    const summaryEmbed = {
      color: 0x2ECC71,
      title: '✅ Configuration Complete!',
      fields: [
        { name: 'Server ID', value: `\`${serverId}\``, inline: true },
        { name: 'API Token', value: '`••••••••••`', inline: true },
        { name: 'Ban-log Channel', value: `<#${banLogChannelId}>`, inline: true },
        { name: 'Online List Channel', value: `<#${onlineListChannelId}>`, inline: true },
        { name: 'RCON Terminal Channel', value: `<#${rconTerminalChannelId}>`, inline: true }
      ],
      footer: { text: 'Your bot is now ready to use with all 5 channels configured!' }
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
    '**!setup** - Configure bot for this server',
    '**!update** - Update specific configuration settings',
    '**!startautolist** - Start admin player list updates (RCON Terminal Channel)',
    '**!stopautolist** - Stop admin player list updates',
    '**!startcommunitylist** - Start community player list updates (Online List Channel)',
    '**!stopcommunitylist** - Stop community player list updates',
    '**!commands** - Show this command list'
  ].join('\n');

  await message.channel.send(`🔨 **Available Commands:**\n${commandList}`);
}

async function handleUpdate(message: any, botInstanceId: number) {
  const guildId = message.guild.id;
  
  // Load current configuration
  const fs = await import('fs');
  const path = await import('path');
  const { fileURLToPath } = await import('url');
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const cfgPath = path.join(__dirname, 'guildConfig.json');
  
  let guildConfig;
  try {
    if (fs.existsSync(cfgPath)) {
      const config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      guildConfig = config[guildId];
    }
  } catch (error) {
    return message.channel.send('❌ Error reading configuration file. Please run `!setup` first.');
  }
  
  if (!guildConfig) {
    return message.channel.send('❌ No configuration found for this server. Please run `!setup` first.');
  }
  
  // Show current configuration with menu
  const configEmbed = {
    color: 0x3498DB,
    title: '⚙️ Current Configuration',
    fields: [
      { name: '1. Server ID', value: `\`${guildConfig.serverId || 'Not set'}\``, inline: true },
      { name: '2. API Token', value: guildConfig.apiToken ? '`••••••••••`' : '`Not set`', inline: true },
      { name: '3. Ban Log Channel', value: guildConfig.banLogChannelId ? `<#${guildConfig.banLogChannelId}>` : '`Not set`', inline: true },
      { name: '4. Online List Channel', value: guildConfig.onlineListChannelId ? `<#${guildConfig.onlineListChannelId}>` : '`Not set`', inline: true },
      { name: '5. RCON Terminal Channel', value: guildConfig.rconTerminalChannelId ? `<#${guildConfig.rconTerminalChannelId}>` : '`Not set`', inline: true }
    ],
    footer: { text: 'Type the number (1-5) of the setting you want to update, or "cancel" to exit.' }
  };
  
  await message.channel.send({ embeds: [configEmbed] });
  
  // Wait for user input
  const messageFilter = (msg: any) => {
    return msg.author.id === message.author.id && 
           (msg.content === 'cancel' || ['1', '2', '3', '4', '5'].includes(msg.content.trim()));
  };
  
  const collected = await message.channel.awaitMessages({ 
    filter: messageFilter, 
    max: 1, 
    time: 60000, 
    errors: ['time'] 
  }).catch(() => null);
  
  if (!collected) {
    return message.channel.send('⏲️ Update timed out. Please run `!update` again.');
  }
  
  const userChoice = collected.first().content.trim();
  
  if (userChoice === 'cancel') {
    return message.channel.send('❌ Update cancelled.');
  }
  
  const choice = userChoice;
    let fieldName = '';
    let prompt = '';
    let configKey = '';
    
    switch (choice) {
      case '1':
        fieldName = 'Server ID';
        prompt = 'Please enter the new **Server ID**:';
        configKey = 'serverId';
        break;
      case '2':
        fieldName = 'API Token';
        prompt = 'Please enter the new **API Token**:';
        configKey = 'apiToken';
        break;
      case '3':
        fieldName = 'Ban Log Channel';
        prompt = 'Please mention or enter the new **Ban Log Channel ID**:';
        configKey = 'banLogChannelId';
        break;
      case '4':
        fieldName = 'Online List Channel';
        prompt = 'Please mention or enter the new **Online List Channel ID**:';
        configKey = 'onlineListChannelId';
        break;
      case '5':
        fieldName = 'RCON Terminal Channel';
        prompt = 'Please mention or enter the new **RCON Terminal Channel ID**:';
        configKey = 'rconTerminalChannelId';
        break;
    }
    
    const promptEmbed = {
      color: 0xF39C12,
      title: `🔧 Update ${fieldName}`,
      description: prompt + '\n\n*Type "cancel" to abort.*'
    };
    
    await message.channel.send({ embeds: [promptEmbed] });
    
    // Wait for new value
    const valueFilter = (msg: any) => msg.author.id === message.author.id;
    const valueCollector = message.channel.createMessageCollector({ 
      filter: valueFilter, 
      time: 120000, 
      max: 1 
    });
    
    valueCollector.on('collect', async (msg: any) => {
      const newValue = msg.content.trim();
      
      if (newValue.toLowerCase() === 'cancel') {
        return message.channel.send('❌ Update cancelled.');
      }
      
      // Validate channel IDs if needed
      if (configKey.includes('ChannelId')) {
        const mentionMatch = newValue.match(/^<#(\d+)>$/);
        const channelId = mentionMatch ? mentionMatch[1] : newValue;
        
        if (!/^[0-9]+$/.test(channelId) || !message.guild.channels.cache.has(channelId)) {
          return message.channel.send('❌ Invalid channel ID. Please try again.');
        }
        
        guildConfig[configKey] = channelId;
      } else {
        guildConfig[configKey] = newValue;
      }
      
      // Save updated configuration
      try {
        const config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        config[guildId] = guildConfig;
        fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2));
        
        const successEmbed = {
          color: 0x2ECC71,
          title: '✅ Configuration Updated!',
          description: `**${fieldName}** has been successfully updated.`,
          fields: [
            { 
              name: 'New Value', 
              value: configKey.includes('ChannelId') ? `<#${guildConfig[configKey]}>` : 
                     configKey === 'apiToken' ? '`••••••••••`' : 
                     `\`${guildConfig[configKey]}\``
            }
          ]
        };
        
        await message.channel.send({ embeds: [successEmbed] });
        
        // Log to system logs
        await storage.createSystemLog({
          level: 'INFO',
          component: 'DISCORD',
          message: `Configuration updated by ${message.author.username}: ${fieldName}`,
          metadata: null
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
      // Log to system logs
      await storage.createSystemLog({
        level: 'ERROR',
        component: 'DISCORD',
        message: `Auto-list error: ${error}`,
        metadata: null
      });
    }
  }, 600000); // 10 minutes
  
  // Store the interval ID
  autoListIntervals.set(guildId, intervalId);
  
  // Perform initial update immediately
  await performAutoPlayerList(message.guild, guildConfig);
  
  // Send confirmation after initial update
  const confirmEmbed = {
    color: 0x2ECC71,
    title: '✅ Auto-List Started!',
    description: `Player list updates will be posted to <#${guildConfig.rconTerminalChannelId}> every **10 minutes**.`,
    fields: [
      { name: 'Next Update', value: `<t:${Math.floor((Date.now() + 600000) / 1000)}:R>`, inline: true },
      { name: 'Stop Command', value: '`!stopautolist`', inline: true }
    ]
  };
  
  await message.channel.send({ embeds: [confirmEmbed] });
  
  // Log to system logs
  await storage.createSystemLog({
    level: 'INFO',
    component: 'DISCORD',
    message: `Auto-list started by ${message.author.username} in guild ${guildId}`,
    metadata: null
  });
}

async function handleStopAutoList(message: any, guildConfig: any) {
  const guildId = message.guild.id;
  
  // Check if auto-list is running
  if (!autoListIntervals.has(guildId)) {
    return message.channel.send('⚠️ Auto-list is not currently running.');
  }
  
  // Clear the interval
  const intervalId = autoListIntervals.get(guildId);
  if (intervalId) {
    clearInterval(intervalId);
  }
  autoListIntervals.delete(guildId);
  
  // Send confirmation
  const confirmEmbed = {
    color: 0xE74C3C,
    title: '🛑 Auto-List Stopped!',
    description: 'Automatic player list updates have been disabled.',
    fields: [
      { name: 'Restart Command', value: '`!startautolist`', inline: true }
    ]
  };
  
  await message.channel.send({ embeds: [confirmEmbed] });
  
  // Log to system logs
  await storage.createSystemLog({
    level: 'INFO',
    component: 'DISCORD',
    message: `Auto-list stopped by ${message.author.username} in guild ${guildId}`,
    metadata: null
  });
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
      const botMessages = messages.filter(msg => 
        msg.author.bot && 
        msg.embeds.length > 0 && 
        msg.embeds[0].title && 
        msg.embeds[0].title.includes('Players on')
      );
      
      if (botMessages.size > 0) {
        await channel.bulkDelete(botMessages);
        console.log(`🗑️ Deleted ${botMessages.size} old autolist messages`);
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
    
  } catch (error) {
    console.error('Error in performAutoPlayerList:', error);
    throw error;
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
  
  // Start the community-list interval (10 minutes = 600,000 milliseconds)
  const intervalId = setInterval(async () => {
    try {
      await performCommunityPlayerList(message.guild, guildConfig);
    } catch (error) {
      console.error('Community-list error:', error);
      // Log to system logs
      await storage.createSystemLog({
        level: 'ERROR',
        component: 'DISCORD',
        message: `Community-list error: ${error}`,
        metadata: null
      });
    }
  }, 600000); // 10 minutes
  
  // Store the interval ID
  communityListIntervals.set(guildId, intervalId);
  
  // Perform initial update immediately
  await performCommunityPlayerList(message.guild, guildConfig);
  
  // Send confirmation after initial update
  const confirmEmbed = {
    color: 0x2ECC71,
    title: '✅ Community List Started!',
    description: `Community player lists will be posted to <#${guildConfig.onlineListChannelId}> every **10 minutes**.`,
    fields: [
      { name: 'Next Update', value: `<t:${Math.floor((Date.now() + 600000) / 1000)}:R>`, inline: true },
      { name: 'Stop Command', value: '`!stopcommunitylist`', inline: true }
    ]
  };
  
  await message.channel.send({ embeds: [confirmEmbed] });
  
  // Log to system logs
  await storage.createSystemLog({
    level: 'INFO',
    component: 'DISCORD',
    message: `Community-list started by ${message.author.username} in guild ${guildId}`,
    metadata: null
  });
}

async function handleStopCommunityList(message: any, guildConfig: any) {
  const guildId = message.guild.id;
  
  // Check if community-list is running
  if (!communityListIntervals.has(guildId)) {
    return message.channel.send('⚠️ Community list is not currently running.');
  }
  
  // Clear the interval
  const intervalId = communityListIntervals.get(guildId);
  if (intervalId) {
    clearInterval(intervalId);
  }
  communityListIntervals.delete(guildId);
  
  // Send confirmation
  const confirmEmbed = {
    color: 0xE74C3C,
    title: '🛑 Community List Stopped!',
    description: 'Automatic community player list updates have been disabled.',
    fields: [
      { name: 'Restart Command', value: '`!startcommunitylist`', inline: true }
    ]
  };
  
  await message.channel.send({ embeds: [confirmEmbed] });
  
  // Log to system logs
  await storage.createSystemLog({
    level: 'INFO',
    component: 'DISCORD',
    message: `Community-list stopped by ${message.author.username} in guild ${guildId}`,
    metadata: null
  });
}

async function performCommunityPlayerList(guild: any, guildConfig: any) {
  try {
    const channel = guild.channels.cache.get(guildConfig.onlineListChannelId);
    if (!channel) {
      console.error('Online List Channel not found:', guildConfig.onlineListChannelId);
      return;
    }
    
    // Delete previous community list messages from the bot
    try {
      const messages = await channel.messages.fetch({ limit: 50 });
      const botMessages = messages.filter(msg => 
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
      console.warn('Failed to delete old community list messages:', deleteError.message);
    }
    
    // Fetch player data from API
    const axios = await import('axios');
    const { serverId, apiToken } = guildConfig;
    
    const res = await axios.default.post(
      `https://api.0grind.io/v2/armareforger/${serverId}/rcon`,
      { command: '#players' },
      { 
        headers: { Authorization: `Bearer ${apiToken}` }, 
        responseType: 'json',
        family: 4  // Force IPv4
      }
    );
    
    if (!res.data.success) {
      throw new Error(res.data.reason || 'Unknown error');
    }

    // Parse player data
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
    const playerNames = entries.map(([id, uid, name]) => name).join('\n') || 'No players online';

    // Create community-friendly embed
    const communityEmbed = {
      color: 0x3498DB,
      title: `🎮 Online Players - ${serverId}`,
      description: playerCount === 0 ? '**No players currently online**' : `**${playerCount} player${playerCount === 1 ? '' : 's'} online:**\n\n${playerNames}`,
      footer: {
        text: `Last updated: ${new Date().toLocaleTimeString()}`
      },
      timestamp: new Date().toISOString()
    };

    await channel.send({ embeds: [communityEmbed] });
    
  } catch (error) {
    console.error('Error in performCommunityPlayerList:', error);
    
    // Send error message to community channel
    const errorEmbed = {
      color: 0xE74C3C,
      title: '❌ Server Status Unavailable',
      description: 'Unable to fetch current player information. Please try again later.',
      footer: {
        text: `Last attempted: ${new Date().toLocaleTimeString()}`
      }
    };
    
    const channel = guild.channels.cache.get(guildConfig.onlineListChannelId);
    if (channel) {
      await channel.send({ embeds: [errorEmbed] });
    }
    
    throw error;
  }
}
