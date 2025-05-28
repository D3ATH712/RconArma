// commands/commands.js
const { EmbedBuilder } = require('discord.js');

module.exports = async ({ message }) => {
  // Ensure this is run in a guild context
  if (!message.guild) {
    return message.channel.send('❌ This command must be used in a server.');
  }

  // Build an embed listing the available staff commands
  const embed = new EmbedBuilder()
    .setTitle('🔨 Staff Command List')
    .setDescription([
      '**!kick <ID> [reason]** - Kick a player',
      '**!players** - List current online players',
      '**!ban <UID|player> <duration> [reason]** - Ban a player; auto-kicks and logs reason for appeals',
      '**!ban remove <UID>** - Remove a ban (unban)',
      '**!banlist** - Show the current ban list'
    ].join('\n'))
    .setColor(0x0099ff);

  // Send the embed
  await message.channel.send({ embeds: [embed] });
};
