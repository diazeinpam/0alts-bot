const { Events } = require('discord.js');
const db = require('../db');
const { welcomePayload } = require('../util');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    const w = db.guild(member.guild.id).welcome;
    if (!w.enabled) return;

    if (w.roleId) {
      member.roles.add(w.roleId).catch(e => console.warn(`Could not assign the welcome role in ${member.guild.name}: ${e.message}`));
    }
    const payload = welcomePayload(member, w);
    if (w.channelId) {
      const ch = await member.guild.channels.fetch(w.channelId).catch(() => null);
      if (ch?.isTextBased()) {
        await ch.send({ ...payload, allowedMentions: { users: [member.id] } })
          .catch(e => console.warn(`Could not send the welcome message: ${e.message}`));
      }
    }
    if (w.dm) await member.send({ embeds: payload.embeds }).catch(() => {});
  }
};
