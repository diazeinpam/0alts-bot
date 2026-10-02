const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ModalBuilder, EmbedBuilder } = require('discord.js');
const db = require('../db');
const { EPH, field, isUrl, parseColor, welcomePayload } = require('../util');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Configure welcome messages')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand(s => s.setName('channel').setDescription('Channel where the welcome message is sent')
      .addChannelOption(o => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)))
    .addSubcommand(s => s.setName('message').setDescription('Edit the title, text, color and image'))
    .addSubcommand(s => s.setName('role').setDescription('Auto-role for new members (no role = remove it)')
      .addRoleOption(o => o.setName('role').setDescription('Role to assign')))
    .addSubcommand(s => s.setName('status').setDescription('Turn welcome messages on or off')
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable?').setRequired(true)))
    .addSubcommand(s => s.setName('dm').setDescription('Also send the welcome message by DM')
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable?').setRequired(true)))
    .addSubcommand(s => s.setName('test').setDescription('Preview the welcome message with your account'))
    .addSubcommand(s => s.setName('view').setDescription('Show the current settings')),

  async execute(i) {
    const w = db.guild(i.guildId).welcome;
    const sub = i.options.getSubcommand();

    if (sub === 'channel') {
      const c = i.options.getChannel('channel', true);
      w.channelId = c.id; db.save();
      return i.reply({ content: `✅ Welcome channel: ${c}`, flags: EPH });
    }
    if (sub === 'role') {
      const r = i.options.getRole('role');
      if (!r) { w.roleId = null; db.save(); return i.reply({ content: '✅ Auto-role disabled.', flags: EPH }); }
      if (r.managed || r.id === i.guildId || r.position >= i.guild.members.me.roles.highest.position)
        return i.reply({ content: "❌ I can't assign that role (it is above my highest role or is a special role). Move my role higher in Server Settings > Roles.", flags: EPH });
      w.roleId = r.id; db.save();
      return i.reply({ content: `✅ Auto-role: ${r}`, flags: EPH, allowedMentions: { parse: [] } });
    }
    if (sub === 'status') {
      w.enabled = i.options.getBoolean('enabled', true); db.save();
      const warn = w.enabled && !w.channelId ? '\n⚠️ You have not set a channel yet: `/welcome channel`.' : '';
      return i.reply({ content: `✅ Welcome messages ${w.enabled ? 'enabled' : 'disabled'}.${warn}`, flags: EPH });
    }
    if (sub === 'dm') {
      w.dm = i.options.getBoolean('enabled', true); db.save();
      return i.reply({ content: `✅ Welcome DM ${w.dm ? 'enabled' : 'disabled'}.`, flags: EPH });
    }
    if (sub === 'message') {
      return i.showModal(new ModalBuilder().setCustomId('welcome:message').setTitle('Welcome message').addComponents(
        field('title', 'Title', { max: 256, value: w.title, placeholder: '{server}, {username}...' }),
        field('description', 'Description', { long: true, max: 4000, value: w.description, placeholder: 'Variables: {user} {username} {server} {count}' }),
        field('color', 'Color (hex)', { max: 7, value: w.color }),
        field('image', 'Image / banner URL', { max: 500, value: w.image }),
        field('footer', 'Footer', { max: 200, value: w.footer })
      ));
    }
    if (sub === 'test') {
      return i.reply({ ...welcomePayload(i.member, w), flags: EPH, allowedMentions: { parse: [] } });
    }
    if (sub === 'view') {
      const e = new EmbedBuilder().setTitle('👋 Welcome settings').setColor('#5865F2').addFields(
        { name: 'Status', value: w.enabled ? '🟢 Enabled' : '🔴 Disabled', inline: true },
        { name: 'Channel', value: w.channelId ? `<#${w.channelId}>` : 'Not set', inline: true },
        { name: 'Auto-role', value: w.roleId ? `<@&${w.roleId}>` : 'None', inline: true },
        { name: 'Welcome DM', value: w.dm ? 'Yes' : 'No', inline: true },
        { name: 'Variables', value: '`{user}` `{username}` `{server}` `{count}`' }
      );
      return i.reply({ embeds: [e], flags: EPH });
    }
  },

  async modal(i) {
    const w = db.guild(i.guildId).welcome;
    const v = id => i.fields.getTextInputValue(id).trim();
    if (!v('title') && !v('description'))
      return i.reply({ content: '❌ You need at least a title or a description.', flags: EPH });
    if (v('image') && !isUrl(v('image')))
      return i.reply({ content: '❌ The image URL is not valid.', flags: EPH });
    Object.assign(w, { title: v('title'), description: v('description'), color: parseColor(v('color')), image: v('image'), footer: v('footer') });
    db.save();
    await i.reply({ content: '✅ Saved. Preview it with `/welcome test`.', flags: EPH });
  }
};
