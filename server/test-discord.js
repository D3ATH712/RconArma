import { Client, GatewayIntentBits } from 'discord.js';

console.log('Testing Discord connection...');
console.log('Token exists:', !!process.env.BOT_TOKEN);
console.log('Token length:', process.env.BOT_TOKEN?.length);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.once('ready', () => {
  console.log('✅ Discord bot connected successfully!');
  console.log('Bot tag:', client.user.tag);
  process.exit(0);
});

client.on('error', (error) => {
  console.error('❌ Discord error:', error);
  process.exit(1);
});

client.login('MTM2NDQwMDk5NzY1NjU1OTYyNg.GZwd_X.Lk_da1ktOzixVBgrtPB5-Sngvf_Om8eMhV5UqY')
  .then(() => {
    console.log('Login attempt successful, waiting for ready event...');
  })
  .catch((error) => {
    console.error('❌ Login failed:', error.message);
    console.error('This suggests the token is invalid or there\'s a network issue');
    process.exit(1);
  });

// Timeout after 10 seconds
setTimeout(() => {
  console.log('❌ Connection timeout - something is wrong');
  process.exit(1);
}, 10000);