const axios = require('axios');

async function checkip({ message }) {
  try {
    console.log('📡 Checking current outbound IP address...');
    console.log('📡 Starting IP check request...');
    
    // Use ipify.org to get the current outbound IPv4 address
    const response = await axios.get('https://api.ipify.org?format=json', {
      timeout: 10000,
      responseType: 'json'
    });
    
    const currentIp = response.data.ip;
    console.log(`🌐 Current outbound IP: ${currentIp}`);
    
    // Send the IP address to Discord
    await message.reply(`🌐 **Current Replit Outbound IP:** \`${currentIp}\`\n\n💡 Use this IP address in your 0grind.io dashboard whitelist for API authentication.`);
    
  } catch (error) {
    console.error('❌ Error checking IP address:', error.message);
    await message.reply('❌ Unable to check current IP address. Please try again later.');
  }
}

module.exports = { checkip };