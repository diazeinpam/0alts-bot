const fs = require('fs');
const path = require('path');

module.exports = function loadCommands() {
  const dir = path.join(__dirname, 'commands');
  const map = new Map();
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
    const cmd = require(path.join(dir, file));
    if (!cmd.data || typeof cmd.execute !== 'function')
      throw new Error(`${file}: debe exportar "data" y "execute"`);
    const name = cmd.data.name;
    if (map.has(name)) throw new Error(`Comando duplicado "/${name}" (archivo ${file})`);
    map.set(name, cmd);
  }
  return map;
};
