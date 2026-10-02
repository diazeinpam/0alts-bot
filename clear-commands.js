// Deletes ALL slash commands (and context menus) registered by the bot.
// Usage:  npm run clear              -> global + every server the bot is in
//         npm run clear -- --global  -> global only
//         npm run clear -- --guilds  -> servers only
require('dotenv').config();
const { REST, Routes } = require('discord.js');

(async () => {
  if (!process.env.TOKEN) throw new Error('Missing TOKEN in .env');
  const onlyGlobal = process.argv.includes('--global');
  const onlyGuilds = process.argv.includes('--guilds');
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  const app = await rest.get(Routes.currentApplication());
  const names = l => (l.length ? ' (' + l.map(c => '/' + c.name).join(', ') + ')' : '');

  if (!onlyGuilds) {
    const old = await rest.get(Routes.applicationCommands(app.id));
    await rest.put(Routes.applicationCommands(app.id), { body: [] });
    console.log(`🧹 Global commands deleted: ${old.length}${names(old)}`);
  }
  if (!onlyGlobal) {
    const ids = new Set((await rest.get(Routes.userGuilds())).map(g => g.id));
    if (process.env.GUILD_ID) ids.add(process.env.GUILD_ID);
    for (const id of ids) {
      try {
        const old = await rest.get(Routes.applicationGuildCommands(app.id, id));
        await rest.put(Routes.applicationGuildCommands(app.id, id), { body: [] });
        console.log(`🧹 Server ${id}: deleted ${old.length}${names(old)}`);
      } catch (e) { console.log(`⚠️  Server ${id}: ${e.message}`); }
    }
  }
  console.log('\n✅ Done. Now run: npm run deploy');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
