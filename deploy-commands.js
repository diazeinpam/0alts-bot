require('dotenv').config();
const { REST, Routes } = require('discord.js');
const loadCommands = require('./src/loadCommands');

(async () => {
  if (!process.env.TOKEN) throw new Error('Missing TOKEN in .env');
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  const app = await rest.get(Routes.currentApplication());
  const body = [...loadCommands().values()].map(c => c.data.toJSON());
  const guildId = process.env.GUILD_ID;
  const route = guildId ? Routes.applicationGuildCommands(app.id, guildId) : Routes.applicationCommands(app.id);
  // PUT replaces EVERYTHING registered in that scope, so old commands there disappear.
  await rest.put(route, { body });
  console.log(`✅ ${body.length} commands registered ${guildId ? `in server ${guildId}` : 'globally (can take up to 1 h to show up)'}`);
  if (guildId) console.log('ℹ️  If you also had old GLOBAL commands, run: npm run clear -- --global');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
