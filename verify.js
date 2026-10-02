// Conflict check.  npm run verify  |  npm run verify:remote
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const loadCommands = require('./src/loadCommands');

const remote = process.argv.includes('--remote');
let errors = 0, warnings = 0;
const ok = m => console.log('✅', m);
const warn = m => { warnings++; console.log('⚠️ ', m); };
const bad = m => { errors++; console.log('❌', m); };

(async () => {
  const major = +process.versions.node.split('.')[0];
  major >= 18 ? ok(`Node ${process.versions.node}`) : bad(`Node ${process.versions.node}: you need 18 or higher`);

  try {
    const v = require('discord.js/package.json').version;
    v.startsWith('14.') ? ok(`discord.js ${v}`) : bad(`discord.js ${v}: must be 14.x (delete node_modules and package-lock.json, then reinstall)`);
  } catch { bad('discord.js is not installed: run npm install'); }

  process.env.TOKEN ? ok('TOKEN is set') : bad('Missing TOKEN in .env');

  let local = new Map();
  try {
    local = loadCommands();
    const bodies = [...local.values()].map(c => c.data.toJSON()); // validates names/options
    ok(`${local.size} valid commands, no duplicates: ${bodies.map(b => '/' + b.name).join(', ')}`);
  } catch (e) { bad(`Commands: ${e.message}`); }

  if (!remote) { console.log('\nℹ️  To compare with what Discord has registered: npm run verify:remote'); return; }
  if (!process.env.TOKEN) return;

  try {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    const app = await rest.get(Routes.currentApplication());
    ok(`Token is valid. Application: ${app.name}`);

    const F = { members: (1 << 14) | (1 << 15), content: (1 << 18) | (1 << 19) };
    (app.flags & F.members) ? ok('Server Members Intent enabled') : bad('Enable "Server Members Intent" in Developer Portal > Bot (otherwise the bot will not start)');
    if (process.env.MESSAGE_CONTENT === 'true')
      (app.flags & F.content) ? ok('Message Content Intent enabled') : bad('MESSAGE_CONTENT=true but the intent is not enabled in the Developer Portal');

    const globals = await rest.get(Routes.applicationCommands(app.id));
    const guilds = await rest.get(Routes.userGuilds());
    ok(`Bot is in ${guilds.length} server(s)`);
    const gNames = new Set(globals.map(c => c.name));

    for (const c of globals) if (!local.has(c.name)) warn(`Old GLOBAL command: /${c.name}  -> npm run clear -- --global`);
    for (const g of guilds) {
      let list = [];
      try { list = await rest.get(Routes.applicationGuildCommands(app.id, g.id)); } catch { continue; }
      for (const c of list) {
        if (!local.has(c.name)) warn(`Old command in "${g.name}": /${c.name}  -> npm run clear -- --guilds`);
        else if (gNames.has(c.name)) warn(`/${c.name} is registered globally AND in "${g.name}" (it will show up twice). Run npm run clear, then npm run deploy`);
      }
    }
    const registered = new Set([...gNames]);
    for (const n of local.keys()) if (!registered.has(n) && !process.env.GUILD_ID) warn(`/${n} is not registered globally yet: npm run deploy`);
  } catch (e) { bad(`Could not query Discord: ${e.message}`); }
})().finally(() => {
  console.log(`\nResult: ${errors} error(s), ${warnings} warning(s).`);
  process.exit(errors ? 1 : 0);
});
