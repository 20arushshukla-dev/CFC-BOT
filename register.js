import 'dotenv/config';
import { REST, Routes, ApplicationCommandOptionType } from 'discord.js';

const commands = [
  {
    name: 'membercount',
    description: 'View detailed server member statistics and status breakdown'
  },
  {
    name: 'forceupdate',
    description: 'Force an immediate live member count update'
  },
  {
    name: 'help',
    description: 'Show available bot commands and permissions'
  },
  {
    name: 'ping',
    description: 'Check the bot, API, and message latency with owner info'
  },
  {
    name: 'status',
    description: 'Check the bot, API, and message latency with owner info'
  },
  {
    name: 'update',
    description: 'Submit a new community update',
    options: [
      {
        name: 'current_event',
        description: 'Update the current event card title and progress',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: 'title',
            description: 'Current event card title',
            type: ApplicationCommandOptionType.String,
            required: true
          },
          {
            name: 'progress',
            description: 'Completion percentage from 0 to 100',
            type: ApplicationCommandOptionType.Integer,
            required: true,
            min_value: 0,
            max_value: 100
          }
        ]
      },
      {
        name: 'announcement',
        description: 'Submit a new community update',
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: 'title',
            description: 'Update title',
            type: ApplicationCommandOptionType.String,
            required: true
          },
          {
            name: 'body',
            description: 'Detailed update body',
            type: ApplicationCommandOptionType.String,
            required: true
          },
          {
            name: 'date',
            description: 'Event date in YYYY-MM-DD format',
            type: ApplicationCommandOptionType.String,
            required: true
          },
          {
            name: 'time',
            description: 'Event time in HH:mm format, for example 18:30 UTC',
            type: ApplicationCommandOptionType.String,
            required: true
          },
          {
            name: 'invite_link',
            description: 'Discord invite link for the Join button',
            type: ApplicationCommandOptionType.String,
            required: true
          },
          {
            name: 'poster',
            description: 'Optional event poster image upload',
            type: ApplicationCommandOptionType.Attachment,
            required: false
          }
        ]
      },
      {
        name: 'no_announcements',
        description: 'Clear announcements and show No active events on the website',
        type: ApplicationCommandOptionType.Subcommand
      },
      {
        name: 'no_current_event',
        description: 'Clear the current event card',
        type: ApplicationCommandOptionType.Subcommand
      }
    ]
  }
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

try {
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );

  console.log('Slash commands registered successfully');
} catch (error) {
  console.error('Failed to register slash commands:', error);
}
