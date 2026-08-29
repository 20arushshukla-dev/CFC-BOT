import 'dotenv/config';
import { Client, EmbedBuilder, GatewayIntentBits, InteractionType, MessageFlags, ActivityType } from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildPresences, GatewayIntentBits.MessageContent]
});

const allowedRoleId = process.env.ALLOWED_ROLE_ID;
const apiUrl = `http://127.0.0.1:${process.env.PORT || 3001}`;
const websiteUrls = (process.env.WEBSITE_URL || 'https://20arushshukla-dev.github.io/CFC-Website')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);
const healthChannelId = '1542409912099934218';
const auditChannelId = '1529026754415558746';
let latestWebsiteBotUpdateAt = null;
let healthUpdateInFlight = false;
const recentChatMessages = [];

const TEAM_MEMBER_IDS = {
  CFC_BOT: '1541883107395899402',
  Abhinav: '934050129223249940',
  'Arush Shukla': '767693440104136714',
  Ayaan: '1497349989020602560',
  Alexis: '796250713818792006',
  Aadarsh: '1327266320995323936',
  imper_monarch25: '1503787225203085312',
  in_hell_: '806644757811560449',
  VK: '671613376539131925'
};

const canManageBot = (member, userId) => (
  !allowedRoleId || member?.roles?.cache?.has(allowedRoleId) || userId === process.env.OWNER_ID
);

const isUnavailableInteraction = (error) => error?.code === 10062 || error?.code === 40060;

const getTextChannel = async (channelId) => {
  const channel = await client.channels.fetch(channelId);
  return channel?.isTextBased() ? channel : null;
};

const formatIstDateTime = (date = new Date()) => new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true
}).format(date);

const discordTime = (date = new Date()) => formatIstDateTime(date);
const probe = async (url) => {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return response.ok;
  } catch {
    return false;
  }
};

const probeAny = async (urls) => {
  const results = await Promise.all(urls.map(probe));
  return results.some(Boolean);
};

const refreshHealthStatus = async () => {
  if (healthUpdateInFlight || !client.user) return;
  healthUpdateInFlight = true;

  try {
    const [websiteIsUp, apiIsUp] = await Promise.all([
      probeAny(websiteUrls),
      probe(`${apiUrl}/api/health`)
    ]);
    const channel = await getTextChannel(healthChannelId);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor(websiteIsUp && apiIsUp ? 0x23a55a : 0xed4245)
      .setTitle('CFC Website Live Status')
      .addFields(
        { name: 'Website', value: websiteIsUp ? '🟢 Online' : '🔴 Offline', inline: true },
        { name: 'API', value: apiIsUp ? '🟢 Online' : '🔴 Offline', inline: true },
        { name: 'Latest bot-driven website update', value: latestWebsiteBotUpdateAt ? discordTime(latestWebsiteBotUpdateAt) : 'No update recorded yet', inline: false }
      )
      .setFooter({ text: `Checked ${formatIstDateTime()}` })
      .setTimestamp();

    const messages = await channel.messages.fetch({ limit: 50 });
    const existing = messages.find((message) => (
      message.author.id === client.user.id && message.embeds[0]?.title === 'CFC Website Live Status'
    ));

    if (existing) await existing.edit({ embeds: [embed] });
    else await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Failed to update website health status:', error.message);
  } finally {
    healthUpdateInFlight = false;
  }
};

const recordWebsiteUpdate = () => {
  latestWebsiteBotUpdateAt = new Date();
  refreshHealthStatus();
};

const announceWebsiteUpdate = async (user, updateType) => {
  try {
    const channel = await getTextChannel(auditChannelId);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setDescription(`<@${user.id}> pushed a ${updateType} update to the website.`)
      .addFields({ name: 'Time and date', value: discordTime() })
      .setTimestamp();

    await channel.send({ content: `<@${user.id}>`, embeds: [embed] });
  } catch (error) {
    console.error('Failed to announce website update:', error.message);
  }
};

const getLatencyEmbed = async (message) => {
  const apiStart = Date.now();
  const apiHealthy = await probe(`${apiUrl}/api/health`);
  const apiLatency = Date.now() - apiStart;
  const messageLatency = Date.now() - message.createdTimestamp;
  const gatewayLatency = client.ws.ping ?? 0;
  const ownerId = process.env.OWNER_ID;
  const ownerMention = ownerId ? `<@${ownerId}>` : 'Owner not configured';

  const embed = new EmbedBuilder()
    .setColor(apiHealthy ? 0x22c55e : 0xed4245)
    .setTitle('⏱️ Bot latency check')
    .setDescription(apiHealthy ? '✅ The bot and API are responding normally.' : '⚠️ The bot is online, but the API is currently unreachable.')
    .addFields(
      { name: '⚡ API latency', value: `${apiLatency} ms`, inline: true },
      { name: '💬 Message latency', value: `${messageLatency} ms`, inline: true },
      { name: '🌐 Gateway latency', value: `${gatewayLatency} ms`, inline: true },
      { name: '📡 API status', value: apiHealthy ? '✅ Online' : '❌ Offline', inline: false }
    )
    .setFooter({ text: `Checked at ${new Date().toLocaleString()}` })
    .setTimestamp();

  return {
    content: ownerMention,
    embeds: [embed]
  };
};

const helpEmbed = () => new EmbedBuilder()
  .setColor(0x22c55e)
  .setTitle('🤖 Citizens Of Change Bot')
  .setDescription('Available commands and access requirements for both prefix and slash usage.')
  .addFields(
    { name: '📊 Member stats', value: '`CCmembercount` / `CCmc` / `/membercount`\nShows total, human, bot, and online counts.' },
    { name: '🔄 Force update', value: '`CCforceupdate` / `/forceupdate`\nSyncs current member and server stats immediately.' },
    { name: '📢 Current event', value: '`CCupdate current_event <title> <progress>` / `/update current_event`\nCreates or updates the current event card.' },
    { name: '📣 Announcements', value: '`CCupdate announcement <title> | <body> | <date> | <time> | <invite_link>` / `/update announcement`\nSubmits a new community update.' },
    { name: '🧹 Clear entries', value: '`CCupdate no_announcements` / `CCupdate no_current_event` / `/update no_announcements` / `/update no_current_event`\nClears website announcements or current event cards.' },
    { name: '⏱️ Ping / status', value: 'Mention the bot, or use `CCping` / `CCstatus` / `CC latency` / `/ping`\nShows API latency, message latency, and owner info.' },
    { name: '❓ Help', value: '`CChelp` / `CC help` / `/help`\nDisplays this list of commands.' },
    { name: '🔐 Allowed role', value: allowedRoleId ? `<@&${allowedRoleId}> (the owner is also allowed).` : 'Any server member.' }
  )
  .setFooter({ text: 'Both prefix and slash commands are supported.' });

const sendInteractionError = async (interaction, content) => {
  if (interaction.deferred) {
    try {
      await interaction.editReply(content);
    } catch (error) {
      if (!isUnavailableInteraction(error)) console.error('Failed to edit interaction error:', error);
    }
    return;
  }

  if (!interaction.replied) {
    try {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    } catch (error) {
      if (!isUnavailableInteraction(error)) console.error('Failed to reply to interaction error:', error);
    }
  }
};

const getGuildMemberCount = async () => {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    return guild.memberCount ?? 0;
  } catch (error) {
    console.error('Failed to fetch guild member count:', error);
    return 0;
  }
};

const getRecentChatMessages = () => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  while (recentChatMessages[0] < cutoff) recentChatMessages.shift();
  return recentChatMessages.length;
};

const syncMemberCount = async () => {
  const count = await getGuildMemberCount();

  try {
    const response = await fetch(`${apiUrl}/api/member-count`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.API_KEY || 'change-me' },
      body: JSON.stringify({ memberCount: count, updatedAt: new Date().toISOString() })
    });
    if (response.ok) recordWebsiteUpdate();
    return response.ok;
  } catch (error) {
    console.error('Failed to sync member count:', error);
    return false;
  }
};

const getServerStats = async () => {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const channels = await guild.channels.fetch();

  try {
    await guild.members.fetch({ withPresences: true });
  } catch (error) {
    // Ignore rate limit errors - use cached members instead
    console.log('Using cached member data due to rate limiting');
  }

  let voiceChannels = 0;
  let activeVoiceMembers = 0;
  let chatChannels = 0;
  let onlineMembers = 0;
  let idleMembers = 0;
  let dndMembers = 0;
  let offlineMembers = 0;
  let totalMembers = guild.memberCount ?? 0;
  let botCount = 0;
  let humanCount = 0;

  for (const channel of channels.values()) {
    if (channel?.type === 2) {
      voiceChannels += 1;
      activeVoiceMembers += channel.members?.size || 0;
    }
    if (channel?.type === 0 || channel?.type === 5 || channel?.type === 15) chatChannels += 1;
  }

  for (const member of guild.members.cache.values()) {
    if (member.user.bot) {
      botCount += 1;
    } else {
      humanCount += 1;
    }

    const status = member.presence?.status;
    if (status === 'online') onlineMembers += 1;
    else if (status === 'idle') idleMembers += 1;
    else if (status === 'dnd') dndMembers += 1;
    else offlineMembers += 1;
  }

  return {
    memberCount: totalMembers,
    onlineMembers,
    idleMembers,
    dndMembers,
    offlineMembers,
    activeVoiceMembers,
    recentChatMessages: getRecentChatMessages(),
    voiceChannels,
    chatChannels,
    botCount,
    humanCount
  };
};

const syncServerStats = async () => {
  try {
    const stats = await getServerStats();
    const response = await fetch(`${apiUrl}/api/server-stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.API_KEY || 'change-me' },
      body: JSON.stringify({ ...stats, updatedAt: new Date().toISOString() })
    });
    if (response.ok) recordWebsiteUpdate();
    return response.ok;
  } catch (error) {
    console.error('Failed to sync server stats:', error);
    return false;
  }
};

const syncTeamPresence = async () => {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const payload = [];

    for (const [name, userId] of Object.entries(TEAM_MEMBER_IDS)) {
      try {
        const member = await guild.members.fetch({ user: userId, withPresences: true });
        const status = member?.presence?.status || 'offline';
        payload.push({
          userId,
          name,
          status,
          statusLabel: status === 'online' ? 'Online' : status === 'idle' ? 'Idle' : status === 'dnd' ? 'Do Not Disturb' : 'Offline'
        });
      } catch {
        payload.push({
          userId,
          name,
          status: 'offline',
          statusLabel: 'Offline'
        });
      }
    }

    const response = await fetch(`${apiUrl}/api/team-presence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.API_KEY || 'change-me' },
      body: JSON.stringify({ members: payload, updatedAt: new Date().toISOString() })
    });
    if (response.ok) recordWebsiteUpdate();
    return response.ok;
  } catch (error) {
    console.error('Failed to sync team presence:', error);
    return false;
  }
};

const forceUpdate = async () => {
  const synced = await syncServerStats();
  return { synced, stats: synced ? await getServerStats() : null };
};

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.user.setActivity('Listening to _.aruxh_', { type: 2 });

  // Set bot presence - listening to .aruxh
  client.user.setPresence({
    activities: [{
      name: '_.aruxh_',
      type: ActivityType.Listening
    }],
    status: 'do not disturb'
  });

  syncMemberCount();
  syncServerStats();
  syncTeamPresence();
  refreshHealthStatus();
  setInterval(syncMemberCount, 30000);
  setInterval(syncServerStats, 30000);
  setInterval(syncTeamPresence, 30000);
  setInterval(refreshHealthStatus, 30000);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  recentChatMessages.push(Date.now());

  const content = message.content.trim();
  const command = content.toLowerCase();

  if (message.mentions.has(client.user)) {
    const mentionText = content.replace(/<@!?\d+>/g, '').trim().toLowerCase();
    if (!mentionText || mentionText === 'ping' || mentionText === 'status' || mentionText === 'latency') {
      const ownerTag = process.env.OWNER_ID ? `<@${process.env.OWNER_ID}>` : '@Owner';
      await message.reply({ content: ownerTag, embeds: [await getLatencyEmbed(message)] });
      return;
    }
  }

  // Help command
  if (command === 'cchelp' || command === 'cc help') {
    await message.reply({ embeds: [helpEmbed()] });
    return;
  }

  if (command === 'ccping' || command === 'ccstatus' || command === 'cc latency') {
    const ownerTag = process.env.OWNER_ID ? `<@${process.env.OWNER_ID}>` : '@Owner';
    await message.reply({ content: ownerTag, embeds: [await getLatencyEmbed(message)] });
    return;
  }

  if (command.startsWith('ccupdate ')) {
    const args = command.slice('ccupdate '.length).trim();
    const parts = args.split(/\s+\|\s*|\s+/);

    if (args === 'no_announcements') {
      if (!canManageBot(message.member, message.author.id)) {
        await message.reply('🚫 You do not have permission to clear announcements.');
        return;
      }

      const response = await fetch(`${apiUrl}/api/clear-updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.API_KEY || 'change-me' },
        body: JSON.stringify({ clearedBy: message.member?.displayName || message.author.globalName || message.author.username })
      });
      if (!response.ok) {
        await message.reply('❌ Failed to clear announcements.');
        return;
      }
      recordWebsiteUpdate();
      await message.reply('✅ Announcements cleared. The website now shows no active events.');
      return;
    }

    if (args === 'no_current_event') {
      if (!canManageBot(message.member, message.author.id)) {
        await message.reply('🚫 You do not have permission to clear the current event.');
        return;
      }

      const response = await fetch(`${apiUrl}/api/clear-current-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.API_KEY || 'change-me' },
        body: JSON.stringify({ clearedBy: message.member?.displayName || message.author.globalName || message.author.username })
      });
      if (!response.ok) {
        await message.reply('❌ Failed to clear the current event.');
        return;
      }
      recordWebsiteUpdate();
      await message.reply('✅ Current event cleared.');
      return;
    }

    if (args.startsWith('current_event ')) {
      if (!canManageBot(message.member, message.author.id)) {
        await message.reply('🚫 You do not have permission to update the current event.');
        return;
      }

      const title = args.slice('current_event '.length).trim();
      if (!title) {
        await message.reply('⚠️ Use: `CCupdate current_event <title> <progress>`');
        return;
      }

      const match = title.match(/^(.*?)(?:\s+)(\d{1,3})$/);
      if (!match) {
        await message.reply('⚠️ Use: `CCupdate current_event <title> <progress>`');
        return;
      }

      const eventTitle = match[1].trim();
      const progress = Number(match[2]);
      if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
        await message.reply('⚠️ Progress must be a number between 0 and 100.');
        return;
      }

      const response = await fetch(`${apiUrl}/api/current-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.API_KEY || 'change-me' },
        body: JSON.stringify({ title: eventTitle, progress, updatedAt: new Date().toISOString() })
      });
      if (!response.ok) {
        await message.reply('❌ Failed to update the current event.');
        return;
      }
      recordWebsiteUpdate();
      await message.reply(`✅ Current event updated: **${eventTitle}** (${progress}%).`);
      return;
    }

    if (args.startsWith('announcement ')) {
      if (!canManageBot(message.member, message.author.id)) {
        await message.reply('🚫 You do not have permission to post an announcement.');
        return;
      }

      const raw = args.slice('announcement '.length).trim();
      const pieces = raw.split(/\s*\|\s*/);
      if (pieces.length < 5) {
        await message.reply('⚠️ Use: `CCupdate announcement <title> | <body> | <date> | <time> | <invite_link>`');
        return;
      }

      const [title, body, date, time, inviteLink] = pieces;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}(\s+[A-Za-z]{2,5})?$/.test(time)) {
        await message.reply('⚠️ Use a valid date like `YYYY-MM-DD` and a valid time like `HH:mm UTC`.');
        return;
      }

      const payload = {
        newEvent: '',
        title,
        body,
        date,
        time,
        inviteLink,
        poster: null,
        submittedBy: message.author.tag,
        submittedAt: new Date().toISOString()
      };

      const response = await fetch(`${apiUrl}/api/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.API_KEY || 'change-me' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        await message.reply('❌ Failed to submit the announcement.');
        return;
      }
      recordWebsiteUpdate();
      await message.reply(`✅ Announcement for **${title}** submitted successfully.`);
      return;
    }

    await message.reply('⚠️ Use a valid `CCupdate` command. Try `CChelp`.');
    return;
  }

  // Member count command
  if (command === 'ccmembercount' || command === 'ccmc' || command === 'cc membercount' || command === 'cc mc') {
    try {
      const stats = await getServerStats();
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📊 Server Member Statistics')
        .setDescription('Complete breakdown of server members and their status.')
        .addFields(
          {
            name: '📈 Overview',
            value: `**Total Members:** ${stats.memberCount.toLocaleString()}\n**Humans:** ${stats.humanCount.toLocaleString()}\n**Bots:** ${stats.botCount.toLocaleString()}`,
            inline: false
          },
          {
            name: '💚 Member Status',
            value: `🟢 Online: ${stats.onlineMembers.toLocaleString()}\n🟡 Idle: ${stats.idleMembers.toLocaleString()}\n🔴 DND: ${stats.dndMembers.toLocaleString()}\n⚫ Offline: ${stats.offlineMembers.toLocaleString()}`,
            inline: false
          }
        )
        .setFooter({ text: `Requested by ${message.author.tag}` })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Error fetching member stats:', error);
      await message.reply('❌ Failed to fetch member statistics. Please try again later.');
    }
    return;
  }

  // Force update command
  if (command !== 'ccforceupdate' && command !== 'cc forceupdate') return;

  if (!canManageBot(message.member, message.author.id)) {
    await message.reply('🚫 You do not have permission to force a member count update.');
    return;
  }

  const { synced, stats } = await forceUpdate();
  const count = stats?.memberCount ?? await getGuildMemberCount();
  await message.reply(synced
    ? `✅ Member count updated: **${count.toLocaleString()}**`
    : '❌ Could not reach the website API. The member count was not updated.');
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.type !== InteractionType.ApplicationCommand) return;

  // Member Count Command
  if (interaction.commandName === 'membercount') {
    try {
      await interaction.deferReply();
      const stats = await getServerStats();
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📊 Server Member Statistics')
        .setDescription('Complete breakdown of server members and their status.')
        .addFields(
          {
            name: '📈 Overview',
            value: `**Total Members:** ${stats.memberCount.toLocaleString()}\n**Humans:** ${stats.humanCount.toLocaleString()}\n**Bots:** ${stats.botCount.toLocaleString()}`,
            inline: false
          },
          {
            name: '💚 Member Status',
            value: `🟢 Online: ${stats.onlineMembers.toLocaleString()}\n🟡 Idle: ${stats.idleMembers.toLocaleString()}\n🔴 DND: ${stats.dndMembers.toLocaleString()}\n⚫ Offline: ${stats.offlineMembers.toLocaleString()}`,
            inline: false
          }
        )
        .setFooter({ text: `Requested by ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      if (isUnavailableInteraction(error)) return;
      console.error(error);
      await sendInteractionError(interaction, 'Failed to fetch member statistics.');
    }
    return;
  }

  if (interaction.commandName === 'forceupdate') {
    if (!canManageBot(interaction.member, interaction.user.id)) {
      await interaction.reply({
        content: 'You do not have permission to force a member count update.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const { synced, stats } = await forceUpdate();
      const count = stats?.memberCount ?? await getGuildMemberCount();
      await interaction.editReply(synced
        ? `Member count updated: **${count.toLocaleString()}**`
        : 'Could not reach the website API. The member count was not updated.');
    } catch (error) {
      if (isUnavailableInteraction(error)) return;
      console.error(error);
      await sendInteractionError(interaction, 'Could not complete the member count update.');
    }
    return;
  }

  if (interaction.commandName === 'help') {
    await interaction.reply({ embeds: [helpEmbed()], flags: MessageFlags.Ephemeral });
    return;
  }

  if (interaction.commandName === 'ping') {
    await interaction.reply(await getLatencyEmbed({ createdTimestamp: Date.now() }));
    return;
  }

  if (interaction.commandName !== 'update') return;

  if (!canManageBot(interaction.member, interaction.user.id)) {
    await interaction.reply({
      content: 'You do not have permission to use this command.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'no_announcements') {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const response = await fetch(`${apiUrl}/api/clear-updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.API_KEY || 'change-me' },
        body: JSON.stringify({ clearedBy: interaction.member?.displayName || interaction.user.globalName || interaction.user.username })
      });
      if (!response.ok) throw new Error('Failed to clear announcements');
      recordWebsiteUpdate();
      await announceWebsiteUpdate(interaction.user, 'announcement clear');
      await interaction.editReply('Announcements cleared. The website now shows No active events with null date and time.');
    } catch (error) {
      if (isUnavailableInteraction(error)) return;
      console.error(error);
      await sendInteractionError(interaction, 'Failed to clear announcements.');
    }
    return;
  }

  if (subcommand === 'no_current_event') {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const response = await fetch(`${apiUrl}/api/clear-current-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.API_KEY || 'change-me' },
        body: JSON.stringify({ clearedBy: interaction.member?.displayName || interaction.user.globalName || interaction.user.username })
      });
      if (!response.ok) throw new Error('Failed to clear current event');
      recordWebsiteUpdate();
      await announceWebsiteUpdate(interaction.user, 'current event clear');
      await interaction.editReply('Current event cleared.');
    } catch (error) {
      if (isUnavailableInteraction(error)) return;
      console.error(error);
      await sendInteractionError(interaction, 'Failed to clear the current event.');
    }
    return;
  }

  if (subcommand === 'current_event') {
    const title = interaction.options.getString('title', true);
    const progress = interaction.options.getInteger('progress', true);

    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const response = await fetch(`${apiUrl}/api/current-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.API_KEY || 'change-me' },
        body: JSON.stringify({ title, progress, updatedAt: new Date().toISOString() })
      });

      if (!response.ok) throw new Error('Failed to save current event');
      recordWebsiteUpdate();
      await announceWebsiteUpdate(interaction.user, 'current event');
      await interaction.editReply(`Current event updated: **${title}** (${progress}%).`);
    } catch (error) {
      if (isUnavailableInteraction(error)) return;
      console.error(error);
      await sendInteractionError(interaction, 'Failed to update the current event card.');
    }
    return;
  }

  const title = interaction.options.getString('title', true);
  const body = interaction.options.getString('body', true);
  const date = interaction.options.getString('date', true);
  const time = interaction.options.getString('time', true);
  const inviteLink = interaction.options.getString('invite_link', true);
  const poster = interaction.options.getAttachment('poster');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}(\s+[A-Za-z]{2,5})?$/.test(time)) {
    await interaction.reply({
      content: 'Use date YYYY-MM-DD and time HH:mm, optionally followed by a timezone such as UTC.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  const payload = {
    newEvent: '',
    title,
    body,
    date,
    time,
    inviteLink,
    poster: poster?.url || null,
    submittedBy: interaction.user.tag,
    submittedAt: new Date().toISOString()
  };

  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const response = await fetch(`${apiUrl}/api/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.API_KEY || 'change-me' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error('Failed to save update');
    recordWebsiteUpdate();
    await announceWebsiteUpdate(interaction.user, 'announcement');
    await interaction.editReply(`Announcement for **${title}** submitted successfully.`);
  } catch (error) {
    if (isUnavailableInteraction(error)) return;
    console.error(error);
    await sendInteractionError(interaction, 'Failed to submit the update.');
  }
});

client.login(process.env.DISCORD_TOKEN);
