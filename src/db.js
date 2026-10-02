// Simple JSON storage (no native dependencies = no install problems).
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'db.json');
let data = { guilds: {} };
try { data = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { /* primera vez */ }

const defaults = () => ({
  welcome: {
    enabled: false, channelId: null, roleId: null, dm: false,
    title: 'Welcome to {server}!',
    description: 'Hey {user}, you are member #{count}. We hope you have a great time!',
    color: '#5865F2', image: '', footer: ''
  },
  // Each ticket type: { label, categoryId, staffRoleId, logChannelId, max, counter, panel:{...}, open:{...} }
  ticket: { types: {} },
  // Open tickets, keyed by channel id: { type, userId, number, claimedBy, createdAt }
  tickets: {}
});

function merge(def, cur) {
  const out = {};
  for (const k of Object.keys(def)) {
    const d = def[k];
    out[k] = d && typeof d === 'object' && !Array.isArray(d) ? merge(d, cur?.[k] || {}) : (cur && k in cur ? cur[k] : d);
  }
  for (const k of Object.keys(cur || {})) if (!(k in out)) out[k] = cur[k];
  return out;
}

const ready = new Set();
function guild(id) {
  if (!ready.has(id)) { data.guilds[id] = merge(defaults(), data.guilds[id] || {}); ready.add(id); }
  return data.guilds[id];
}

function flush() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, FILE);
}
let timer;
function save() { clearTimeout(timer); timer = setTimeout(flush, 200); }
process.on('exit', () => { try { flush(); } catch {} });
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

module.exports = { guild, save };
