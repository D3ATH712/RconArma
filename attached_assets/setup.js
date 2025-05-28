// commands/setup.js
const fs = require('fs');
const path = require('path');
const BOT_IP = '65.255.84.54';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

module.exports = async ({ message }) => {
  const filterMsg = m => m.author.id === message.author.id;
  const guildId = message.guild?.id;
  if (!guildId) {
    return message.channel.send('❌ This command must be used in a server.');
  }

  // Pre-flight embed
  const preEmbed = new EmbedBuilder()
    .setTitle('🛠️ RCON-Arma Setup Wizard')
    .setDescription([
      'I will guide you through configuring your Arma Reforger integration.',
      '',
      '**Discord Permissions needed:**',
      '- Embed Links',
      '- Use External Emojis',
      '- Manage Messages (for buttons)',
      '- Read Message History',
      '- View Channel',
      '',
      '**RCON Dashboard Setup:**',
      `- Whitelist **${BOT_IP}** (your bot’s IPv4) in the RCON Dashboard’s allowed IPs before generating an API Token.`,
      '',
      '**We will collect:**',
      '1️⃣ Server ID',
      '2️⃣ API Token',
      '3️⃣ Ban-log Channel',
      '',
      'Type `cancel` at any time to abort.'
    ].join('\n'))
    .setColor('Blue')
    .setFooter({ text: 'You have 2 minutes per step.' });

  // Send pre-flight embed with a copy-IP button
  const ipRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('copy_ip')
      .setLabel('Copy Bot IP')
      .setStyle(ButtonStyle.Primary)
  );
  const preMsg = await message.channel.send({ embeds: [preEmbed], components: [ipRow] });

  // Handle copy-IP button interaction
  const ipInteraction = await preMsg.awaitMessageComponent({
    componentType: ComponentType.Button,
    filter: i => i.customId === 'copy_ip' && i.user.id === message.author.id,
    time: 120000
  }).catch(() => null);
  if (ipInteraction) {
    await ipInteraction.deferUpdate();
    // Send only the IP in an ephemeral code block for easy copy-paste
    await ipInteraction.followUp({ content: `\`${BOT_IP}\``, ephemeral: true });
    // Disable the button after use
    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('copy_ip')
        .setLabel('Bot IP Copied')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );
    await preMsg.edit({ components: [disabledRow] });
  }

  // Step 1: Server ID
  const step1Embed = new EmbedBuilder()
    .setTitle('🔹 Step 1: Server ID')
    .setDescription('Please enter your **Server ID** (letters, numbers, or hyphens).')
    .setColor('Blue');
  await message.channel.send({ embeds: [step1Embed] });
  const collected1 = await message.channel.awaitMessages({ filter: filterMsg, max: 1, time: 120000, errors: ['time'] }).catch(() => null);
  if (!collected1) return message.channel.send('⏲️ Setup timed out. Please run `!setup` again.');
  const serverId = collected1.first().content.trim();
  if (serverId.toLowerCase() === 'cancel') return message.channel.send('❌ Setup cancelled.');
  if (!/^[A-Za-z0-9-]+$/.test(serverId)) {
    return message.channel.send('❌ Invalid Server ID format. Please run `!setup` again.');
  }
  await message.channel.send(`✅ Server ID set to \`${serverId}\`.`);

  // Step 2: API Token
  const step2Embed = new EmbedBuilder()
    .setTitle('🔹 Step 2: API Token')
    .setDescription('Please enter your **API Token**.')
    .setColor('Blue');
  await message.channel.send({ embeds: [step2Embed] });
  const collected2 = await message.channel.awaitMessages({ filter: filterMsg, max: 1, time: 120000, errors: ['time'] }).catch(() => null);
  if (!collected2) return message.channel.send('⏲️ Setup timed out. Please run `!setup` again.');
  const apiToken = collected2.first().content.trim();
  if (apiToken.toLowerCase() === 'cancel') return message.channel.send('❌ Setup cancelled.');
  if (apiToken.length < 10) {
    return message.channel.send('❌ API Token seems too short. Please run `!setup` again.');
  }
  await message.channel.send('✅ API Token set.');

  // Step 3: Ban-log Channel
  const step3Embed = new EmbedBuilder()
    .setTitle('🔹 Step 3: Ban-log Channel')
    .setDescription('Please mention or enter the **Ban-log Channel** where bans will be posted.')
    .setColor('Blue');
  await message.channel.send({ embeds: [step3Embed] });
  const collected3 = await message.channel.awaitMessages({ filter: filterMsg, max: 1, time: 120000, errors: ['time'] }).catch(() => null);
  if (!collected3) return message.channel.send('⏲️ Setup timed out. Please run `!setup` again.');
  let banLogInput = collected3.first().content.trim();
  if (banLogInput.toLowerCase() === 'cancel') return message.channel.send('❌ Setup cancelled.');
  const mentionMatch = banLogInput.match(/^<#(\d+)>$/);
  const banLogChannelId = mentionMatch ? mentionMatch[1] : banLogInput;
  if (!/^[0-9]+$/.test(banLogChannelId) || !message.guild.channels.cache.has(banLogChannelId)) {
    return message.channel.send('❌ Invalid channel ID. Please run `!setup` again.');
  }
  await message.channel.send(`✅ Ban-log channel set to <#${banLogChannelId}>.`);

  // Summary & Confirm
  const summaryEmbed = new EmbedBuilder()
    .setTitle('✅ Configuration Preview')
    .addFields(
      { name: 'Server ID', value: `\`${serverId}\``, inline: true },
      { name: 'API Token', value: '`••••••••••`', inline: true },
      { name: 'Ban-log Channel', value: `<#${banLogChannelId}>`, inline: true }
    )
    .setColor('Green')
    .setFooter({ text: 'Click Confirm to save or Cancel to abort.' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('confirm')
      .setLabel('Confirm')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)
  );

  const summaryMsg = await message.channel.send({ embeds: [summaryEmbed], components: [row] });
  const interaction = await summaryMsg.awaitMessageComponent({ componentType: ComponentType.Button, time: 60000 }).catch(() => null);
  if (!interaction) {
    await summaryMsg.edit({ content: '⏲️ Confirmation timed out. Setup aborted.', embeds: [], components: [] });
    return;
  }

  // Acknowledge the button press to avoid failures
  await interaction.deferUpdate();

  if (interaction.customId === 'cancel') {
    await summaryMsg.edit({ content: '❌ Setup cancelled.', embeds: [], components: [] });
    return;
  }

  // Save configuration
  const filePath = path.join(__dirname, '..', 'guildConfig.json');
  let config = {};
  if (fs.existsSync(filePath)) {
    try { config = JSON.parse(fs.readFileSync(filePath)); } catch {};
  }
  config[guildId] = { serverId, apiToken, banLogChannelId };
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2));

  await summaryMsg.edit({ content: `✅ Setup complete! Bans will now be logged in <#${banLogChannelId}>.`, embeds: [], components: [] });
};
