const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ModalBuilder } = require('discord.js');
const { EPH, field, makeEmbed, isUrl } = require('../util');

const canalOpt = o => o.setName('canal').setDescription('Canal donde se enviará')
  .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mensaje')
    .setDescription('Envía mensajes personalizados como el bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false)
    .addSubcommand(s => s.setName('texto').setDescription('Envía un mensaje de texto normal').addChannelOption(canalOpt))
    .addSubcommand(s => s.setName('embed').setDescription('Envía un embed personalizado').addChannelOption(canalOpt)),

  async execute(i) {
    const sub = i.options.getSubcommand();
    const canal = i.options.getChannel('canal', true);
    const need = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];
    if (sub === 'embed') need.push(PermissionFlagsBits.EmbedLinks);
    if (!canal.permissionsFor(i.guild.members.me)?.has(need))
      return i.reply({ content: `❌ No tengo permisos para enviar ${sub === 'embed' ? 'embeds' : 'mensajes'} en ${canal}.`, flags: EPH });

    const modal = new ModalBuilder().setCustomId(`mensaje:${sub}:${canal.id}`)
      .setTitle(sub === 'texto' ? 'Enviar mensaje' : 'Enviar embed');
    if (sub === 'texto') {
      modal.addComponents(field('texto', 'Mensaje', { long: true, required: true, max: 2000 }));
    } else {
      modal.addComponents(
        field('title', 'Título', { max: 256 }),
        field('description', 'Descripción', { long: true, max: 4000 }),
        field('color', 'Color (hex)', { max: 7, placeholder: '#5865F2' }),
        field('image', 'URL de imagen', { max: 500, placeholder: 'https://...' }),
        field('footer', 'Pie de página', { max: 200 })
      );
    }
    await i.showModal(modal);
  },

  async modal(i, [sub, channelId]) {
    const canal = await i.guild.channels.fetch(channelId).catch(() => null);
    if (!canal?.isTextBased()) return i.reply({ content: '❌ El canal ya no existe.', flags: EPH });

    const allowed = { parse: ['users', 'roles'] };
    if (i.member.permissions.has(PermissionFlagsBits.MentionEveryone)) allowed.parse.push('everyone');

    let payload;
    if (sub === 'texto') {
      payload = { content: i.fields.getTextInputValue('texto') };
    } else {
      const v = id => i.fields.getTextInputValue(id).trim();
      if (!v('title') && !v('description'))
        return i.reply({ content: '❌ El embed necesita al menos título o descripción.', flags: EPH });
      if (v('image') && !isUrl(v('image')))
        return i.reply({ content: '❌ La URL de la imagen no es válida.', flags: EPH });
      payload = { embeds: [makeEmbed({ title: v('title'), description: v('description'), color: v('color'), image: v('image'), footer: v('footer') })] };
    }
    try {
      await canal.send({ ...payload, allowedMentions: allowed });
      await i.reply({ content: `✅ Enviado en ${canal}.`, flags: EPH });
    } catch (e) {
      await i.reply({ content: `❌ No se pudo enviar: ${e.message}`, flags: EPH });
    }
  }
};
