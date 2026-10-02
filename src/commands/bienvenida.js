const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ModalBuilder, EmbedBuilder } = require('discord.js');
const db = require('../db');
const { EPH, field, isUrl, parseColor, welcomePayload } = require('../util');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bienvenida')
    .setDescription('Configura los mensajes de bienvenida')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand(s => s.setName('canal').setDescription('Canal donde se envía la bienvenida')
      .addChannelOption(o => o.setName('canal').setDescription('Canal').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)))
    .addSubcommand(s => s.setName('mensaje').setDescription('Edita el título, texto, color e imagen'))
    .addSubcommand(s => s.setName('rol').setDescription('Rol automático para nuevos miembros (sin rol = quitarlo)')
      .addRoleOption(o => o.setName('rol').setDescription('Rol a asignar')))
    .addSubcommand(s => s.setName('estado').setDescription('Activa o desactiva las bienvenidas')
      .addBooleanOption(o => o.setName('activo').setDescription('¿Activar?').setRequired(true)))
    .addSubcommand(s => s.setName('dm').setDescription('Enviar también la bienvenida por mensaje privado')
      .addBooleanOption(o => o.setName('activo').setDescription('¿Activar?').setRequired(true)))
    .addSubcommand(s => s.setName('probar').setDescription('Muestra cómo se vería la bienvenida contigo'))
    .addSubcommand(s => s.setName('ver').setDescription('Muestra la configuración actual')),

  async execute(i) {
    const w = db.guild(i.guildId).welcome;
    const sub = i.options.getSubcommand();

    if (sub === 'canal') {
      const c = i.options.getChannel('canal', true);
      w.channelId = c.id; db.save();
      return i.reply({ content: `✅ Canal de bienvenida: ${c}`, flags: EPH });
    }
    if (sub === 'rol') {
      const r = i.options.getRole('rol');
      if (!r) { w.roleId = null; db.save(); return i.reply({ content: '✅ Rol automático desactivado.', flags: EPH }); }
      if (r.managed || r.id === i.guildId || r.position >= i.guild.members.me.roles.highest.position)
        return i.reply({ content: '❌ No puedo asignar ese rol (está por encima de mi rol más alto o es un rol especial). Sube mi rol en Ajustes > Roles.', flags: EPH });
      w.roleId = r.id; db.save();
      return i.reply({ content: `✅ Rol automático: ${r}`, flags: EPH, allowedMentions: { parse: [] } });
    }
    if (sub === 'estado') {
      w.enabled = i.options.getBoolean('activo', true); db.save();
      const aviso = w.enabled && !w.channelId ? '\n⚠️ Aún no configuraste un canal con `/bienvenida canal`.' : '';
      return i.reply({ content: `✅ Bienvenidas ${w.enabled ? 'activadas' : 'desactivadas'}.${aviso}`, flags: EPH });
    }
    if (sub === 'dm') {
      w.dm = i.options.getBoolean('activo', true); db.save();
      return i.reply({ content: `✅ Mensaje privado ${w.dm ? 'activado' : 'desactivado'}.`, flags: EPH });
    }
    if (sub === 'mensaje') {
      const modal = new ModalBuilder().setCustomId('bienvenida:mensaje').setTitle('Mensaje de bienvenida').addComponents(
        field('title', 'Título', { max: 256, value: w.title, placeholder: '{server}, {username}...' }),
        field('description', 'Descripción', { long: true, max: 4000, value: w.description, placeholder: 'Variables: {user} {username} {server} {count}' }),
        field('color', 'Color (hex)', { max: 7, value: w.color }),
        field('image', 'URL de imagen / banner', { max: 500, value: w.image }),
        field('footer', 'Pie de página', { max: 200, value: w.footer })
      );
      return i.showModal(modal);
    }
    if (sub === 'probar') {
      return i.reply({ ...welcomePayload(i.member, w), flags: EPH, allowedMentions: { parse: [] } });
    }
    if (sub === 'ver') {
      const e = new EmbedBuilder().setTitle('👋 Configuración de bienvenida').setColor('#5865F2').addFields(
        { name: 'Estado', value: w.enabled ? '🟢 Activado' : '🔴 Desactivado', inline: true },
        { name: 'Canal', value: w.channelId ? `<#${w.channelId}>` : 'No configurado', inline: true },
        { name: 'Rol automático', value: w.roleId ? `<@&${w.roleId}>` : 'Ninguno', inline: true },
        { name: 'Mensaje privado', value: w.dm ? 'Sí' : 'No', inline: true },
        { name: 'Variables', value: '`{user}` `{username}` `{server}` `{count}`' }
      );
      return i.reply({ embeds: [e], flags: EPH });
    }
  },

  async modal(i) {
    const w = db.guild(i.guildId).welcome;
    const v = id => i.fields.getTextInputValue(id).trim();
    if (!v('title') && !v('description'))
      return i.reply({ content: '❌ Necesitas al menos título o descripción.', flags: EPH });
    if (v('image') && !isUrl(v('image')))
      return i.reply({ content: '❌ La URL de la imagen no es válida.', flags: EPH });
    Object.assign(w, { title: v('title'), description: v('description'), color: parseColor(v('color')), image: v('image'), footer: v('footer') });
    db.save();
    await i.reply({ content: '✅ Mensaje guardado. Pruébalo con `/bienvenida probar`.', flags: EPH });
  }
};
