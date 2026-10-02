const { Events } = require('discord.js');
const { EPH } = require('../util');

// customIds use the format  command:action:data  and are routed to the owning command.
module.exports = {
  name: Events.InteractionCreate,
  async execute(i, client) {
    try {
      if (i.isChatInputCommand()) {
        if (!i.inGuild()) return i.reply({ content: 'Use this command inside a server.', flags: EPH });
        await client.commands.get(i.commandName)?.execute(i);
      } else if (i.isAutocomplete()) {
        await client.commands.get(i.commandName)?.autocomplete?.(i);
      } else if (i.isButton() || i.isModalSubmit()) {
        const [name, ...args] = i.customId.split(':');
        const cmd = client.commands.get(name);
        const handler = i.isButton() ? cmd?.button : cmd?.modal;
        if (handler) await handler(i, args);
      }
    } catch (e) {
      console.error(`Interaction error (${i.commandName || i.customId}):`, e);
      if (i.isAutocomplete()) return;
      const msg = { content: '❌ An unexpected error occurred.', flags: EPH };
      if (i.replied || i.deferred) await i.followUp(msg).catch(() => {});
      else await i.reply(msg).catch(() => {});
    }
  }
};
