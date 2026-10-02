require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
const loadCommands = require('./src/loadCommands');

if (!process.env.TOKEN) {
  console.error('❌ Falta TOKEN en el archivo .env');
  process.exit(1);
}

const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers];
if (process.env.MESSAGE_CONTENT === 'true') intents.push(GatewayIntentBits.MessageContent);

const client = new Client({ intents });
client.commands = loadCommands();

const eventsDir = path.join(__dirname, 'src', 'events');
for (const file of fs.readdirSync(eventsDir).filter(f => f.endsWith('.js'))) {
  const ev = require(path.join(eventsDir, file));
  const run = (...args) => ev.execute(...args, client);
  ev.once ? client.once(ev.name, run) : client.on(ev.name, run);
}

process.on('unhandledRejection', e => console.error('unhandledRejection:', e));
client.login(process.env.TOKEN);
