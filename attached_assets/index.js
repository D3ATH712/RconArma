// index.js
require('dotenv').config();

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const setup     = require('./commands/setup');
const players   = require('./commands/players');
const kick      = require('./commands/kick');
const ban       = require('./commands/ban');
const banlist   = require('./commands/banlist');
const commands  = require('./commands/commands'); // Added commands list

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  const content = message.content.trim();

  if (content.startsWith('!setup')) {
    return setup({ message });
  }
  if (content.startsWith('!players')) {
    return players({ message });
  }
  if (content.startsWith('!kick')) {
    const args = content.split(/\s+/).slice(1);
    return kick({ message, args });
  }
  if (content.startsWith('!ban ')) {
    const args = content.split(/\s+/).slice(1);
    return ban({ message, args });
  }
  if (content === '!banlist') {
    return banlist({ message });
  }
  if (content === '!commands') {
    return commands({ message });
  }
});

client.login(process.env.BOT_TOKEN);
