const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', () => {
  console.log(`✅ Bot connected as ${client.user.tag}`);
  console.log(`🏠 In ${client.guilds.cache.size} servers:`);
  client.guilds.cache.forEach(guild => {
    console.log(`   - ${guild.name} (${guild.id})`);
  });
});

client.on('messageCreate', message => {
  console.log(`📨 MESSAGE: "${message.content}" from ${message.author.username} in ${message.guild?.name}`);
  
  if (message.content === '!test') {
    message.reply('Bot is working!');
  }
});

client.on('error', error => {
  console.error('❌ Discord error:', error);
});

console.log('🚀 Starting bot...');
client.login(process.env.BOT_TOKEN);