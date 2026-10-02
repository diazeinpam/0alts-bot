const crypto = require('crypto');
const {
  SlashCommandBuilder, PermissionFlagsBits: P, ChannelType, ModalBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, EmbedBuilder, ComponentType
} = require('discord.js');
const { EPH, field, isUrl, parseColor } = require('../util');

// ---------- in-memory drafts (expire after 30 min of inactivity) ----------
const drafts = new Map();
const TTL = 30 * 60 * 1000;
const MAX_LEN = 5000; // leaves room for the builder's info embed inside the preview
setInterval(() => { const now = Date.now(); for (const [k, d] of drafts) if (d.expires < now) drafts.delete(k); }, 5 * 60 * 1000).unref();

const blankEmbed = () => ({
  title: '', titleUrl: '', description: '', color: '#5865F2',
  authorName: '', authorIcon: '', footer: '', footerIcon: '',
  image: '', thumbnail: '', timestamp: false, fields: []
});

function newDraft(userId, channelId, target = null) {
  const d = { id: crypto.randomBytes(4).toString('hex'), userId, channelId, target, content: '', embed: blankEmbed(), buttons: [], expires: Date.now() + TTL };
  drafts.set(d.id, d);
  return d;
}

function getDraft(i, id) {
  const d = drafts.get(id);
  if (!d) { i.reply({ content: '⌛ This builder expired. Run `/message create` again.', flags: EPH }); return null; }
  if (d.userId !== i.user.id) { i.reply({ content: '❌ This builder belongs to someone else.', flags: EPH }); return null; }
  d.expires = Date.now() + TTL;
  return d;
}

// ---------- rendering ----------
const isEmpty = e => !(e.title || e.description || e.authorName || e.footer || e.image || e.thumbnail || e.fields.length);
const embedLength = e => (e.title || '').length + (e.description || '').length + (e.authorName || '').length + (e.footer || '').length +
  e.fields.reduce((n, f) => n + f.name.length + f.value.length, 0);

function buildEmbed(e) {
  const em = new EmbedBuilder().setColor(parseColor(e.color));
  if (e.title) { em.setTitle(e.title); if (e.titleUrl) em.setURL(e.titleUrl); }
  if (e.description) em.setDescription(e.description);
  if (e.authorName) em.setAuthor({ name: e.authorName, iconURL: e.authorIcon || undefined });
  if (e.footer) em.setFooter({ text: e.footer, iconURL: e.footerIcon || undefined });
  if (e.image) em.setImage(e.image);
  if (e.thumbnail) em.setThumbnail(e.thumbnail);
  if (e.timestamp) em.setTimestamp();
  if (e.fields.length) em.addFields(e.fields);
  return em;
}

const linkRow = d => new ActionRowBuilder().addComponents(
  d.buttons.map(b => new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(b.label).setURL(b.url))
);

function controls(d) {
  const e = d.embed;
  const b = (action, label, emoji, style = ButtonStyle.Secondary, disabled = false) =>
    new ButtonBuilder().setCustomId(`message:${action}:${d.id}`).setLabel(label).setEmoji(emoji).setStyle(style).setDisabled(disabled);
  return [
    new ActionRowBuilder().addComponents(
      b('content', 'Text', '📝'), b('main', 'Title & Description', '✏️'), b('author', 'Author', '👤'),
      b('footer', 'Footer', '🔻'), b('images', 'Images', '🖼️')),
    new ActionRowBuilder().addComponents(
      b('color', 'Color', '🎨'), b('field', 'Add field', '➕', ButtonStyle.Secondary, e.fields.length >= 25),
      b('unfield', 'Remove field', '➖', ButtonStyle.Secondary, !e.fields.length),
      b('link', 'Add link button', '🔗', ButtonStyle.Secondary, d.buttons.length >= 5),
      b('unlink', 'Remove link', '✂️', ButtonStyle.Secondary, !d.buttons.length)),
    new ActionRowBuilder().addComponents(
      b('timestamp', `Timestamp: ${e.timestamp ? 'On' : 'Off'}`, '🕒', e.timestamp ? ButtonStyle.Primary : ButtonStyle.Secondary),
      b('send', d.target ? 'Save changes' : 'Send', '📨', ButtonStyle.Success),
      b('cancel', 'Cancel', '✖️', ButtonStyle.Danger))
  ];
}

function view(d) {
  const e = d.embed;
  const preview = isEmpty(e)
    ? new EmbedBuilder().setColor('#2B2D31').setDescription('*The embed is empty — use the buttons below to design it.*')
    : buildEmbed(e);
  const links = d.buttons.length ? ` · Buttons: ${d.buttons.map(x => x.label).join(', ')}` : '';
  const info = new EmbedBuilder().setColor('#5865F2').setDescription(
    `🛠️ **Message builder** · ${d.target ? 'editing a message in' : 'sending to'} <#${d.channelId}>\n` +
    `Fields: ${e.fields.length}/25 · Link buttons: ${d.buttons.length}/5${links}\n*Everything below is a live preview.*`
  );
  return { content: d.content || '', embeds: [info, preview], components: controls(d), allowedMentions: { parse: [] } };
}

const mentions = i => {
  const allowed = { parse: ['users', 'roles'] };
  if (i.member.permissions.has(P.MentionEveryone)) allowed.parse.push('everyone');
  return allowed;
};

const mk = (d, action, title, ...rows) =>
  new ModalBuilder().setCustomId(`message:m-${action}:${d.id}`).setTitle(title).addComponents(...rows);

// ---------- command ----------
module.exports = {
  data: new SlashCommandBuilder()
    .setName('message')
    .setDescription('Create and send custom messages and embeds')
    .setDefaultMemberPermissions(P.ManageMessages)
    .setDMPermission(false)
    .addSubcommand(s => s.setName('create').setDescription('Open the interactive embed builder')
      .addChannelOption(o => o.setName('channel').setDescription('Channel to send it in')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)))
    .addSubcommand(s => s.setName('edit').setDescription("Edit one of the bot's messages in the builder")
      .addStringOption(o => o.setName('message').setDescription('Message link, or message ID (then also pick a channel)').setRequired(true))
      .addChannelOption(o => o.setName('channel').setDescription('Channel of the message (not needed with a link)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommand(s => s.setName('text').setDescription('Quickly send a plain text message')
      .addChannelOption(o => o.setName('channel').setDescription('Channel to send it in')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))),

  async execute(i) {
    const sub = i.options.getSubcommand();
    const me = i.guild.members.me;

    if (sub === 'edit') {
      const raw = i.options.getString('message', true).trim();
      const link = raw.match(/channels\/(\d+)\/(\d+)\/(\d+)/);
      let channel, msgId;
      if (link) {
        if (link[1] !== i.guildId) return i.reply({ content: '❌ That message is from another server.', flags: EPH });
        channel = await i.guild.channels.fetch(link[2]).catch(() => null);
        msgId = link[3];
      } else {
        channel = i.options.getChannel('channel');
        msgId = raw;
        if (!channel) return i.reply({ content: '❌ Paste a message link, or provide the `channel` option with the message ID.', flags: EPH });
        if (!/^\d{17,20}$/.test(msgId)) return i.reply({ content: '❌ That is not a valid message ID.', flags: EPH });
      }
      if (!channel?.isTextBased()) return i.reply({ content: '❌ I could not find that channel.', flags: EPH });
      if (!channel.permissionsFor(me)?.has([P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.EmbedLinks]))
        return i.reply({ content: `❌ I'm missing permissions in ${channel} (View, Send, Read History, Embed Links).`, flags: EPH });
      const msg = await channel.messages.fetch(msgId).catch(() => null);
      if (!msg) return i.reply({ content: '❌ I could not find that message.', flags: EPH });
      if (msg.author.id !== i.client.user.id) return i.reply({ content: '❌ I can only edit messages sent by me.', flags: EPH });
      const rows = msg.components || [];
      const hasInteractive = rows.some(r => r.components.some(c => c.type !== ComponentType.Button || c.style !== ButtonStyle.Link));
      if (hasInteractive)
        return i.reply({ content: "❌ That message has interactive buttons (e.g. a ticket panel). Editing it here would remove them. Edit panels with `/ticket panel-text` and post a new panel.", flags: EPH });

      const d = newDraft(i.user.id, channel.id, msg.id);
      d.content = msg.content || '';
      const src = msg.embeds[0];
      if (src) {
        Object.assign(d.embed, {
          title: src.title || '', titleUrl: src.url || '', description: src.description || '',
          color: src.hexColor || '#5865F2', authorName: src.author?.name || '', authorIcon: src.author?.iconURL || '',
          footer: src.footer?.text || '', footerIcon: src.footer?.iconURL || '',
          image: src.image?.url || '', thumbnail: src.thumbnail?.url || '', timestamp: !!src.timestamp,
          fields: src.fields.map(f => ({ name: f.name, value: f.value, inline: !!f.inline }))
        });
      }
      d.buttons = rows.flatMap(r => r.components).map(c => ({ label: c.label, url: c.url })).filter(b => b.label && b.url).slice(0, 5);
      return i.reply({ ...view(d), flags: EPH });
    }

    const channel = i.options.getChannel('channel', true);
    const need = [P.ViewChannel, P.SendMessages];
    if (sub === 'create') need.push(P.EmbedLinks);
    if (!channel.permissionsFor(me)?.has(need))
      return i.reply({ content: `❌ I don't have permission to send ${sub === 'create' ? 'embeds' : 'messages'} in ${channel}.`, flags: EPH });

    if (sub === 'text') {
      return i.showModal(new ModalBuilder().setCustomId(`message:m-plain:${channel.id}`).setTitle('Send message')
        .addComponents(field('text', 'Message', { long: true, required: true, max: 2000 })));
    }
    const d = newDraft(i.user.id, channel.id);
    return i.reply({ ...view(d), flags: EPH });
  },

  async button(i, [action, id]) {
    const d = getDraft(i, id);
    if (!d) return;
    const e = d.embed;

    switch (action) {
      case 'content':
        return i.showModal(mk(d, 'content', 'Text above the embed',
          field('content', 'Message text', { long: true, max: 2000, value: d.content, placeholder: 'Mentions like @role work here' })));
      case 'main':
        return i.showModal(mk(d, 'main', 'Title & Description',
          field('title', 'Title', { max: 256, value: e.title }),
          field('description', 'Description', { long: true, max: 4000, value: e.description }),
          field('url', 'Title link (optional)', { max: 500, value: e.titleUrl, placeholder: 'https://...' })));
      case 'author':
        return i.showModal(mk(d, 'author', 'Author',
          field('name', 'Author name', { max: 256, value: e.authorName }),
          field('icon', 'Author icon URL', { max: 500, value: e.authorIcon, placeholder: 'https://...' })));
      case 'footer':
        return i.showModal(mk(d, 'footer', 'Footer',
          field('text', 'Footer text', { max: 200, value: e.footer }),
          field('icon', 'Footer icon URL', { max: 500, value: e.footerIcon, placeholder: 'https://...' })));
      case 'images':
        return i.showModal(mk(d, 'images', 'Images',
          field('image', 'Large image URL (bottom)', { max: 500, value: e.image, placeholder: 'https://...' }),
          field('thumbnail', 'Thumbnail URL (top right)', { max: 500, value: e.thumbnail, placeholder: 'https://...' })));
      case 'color':
        return i.showModal(mk(d, 'color', 'Embed color',
          field('color', 'Hex color', { required: true, max: 7, value: e.color, placeholder: '#5865F2' })));
      case 'field':
        return i.showModal(mk(d, 'field', 'Add field',
          field('name', 'Field name', { required: true, max: 256 }),
          field('value', 'Field value', { long: true, required: true, max: 1024 }),
          field('inline', 'Inline? (yes / no)', { max: 3, placeholder: 'no' })));
      case 'link':
        return i.showModal(mk(d, 'link', 'Add link button',
          field('label', 'Button label', { required: true, max: 80 }),
          field('url', 'URL', { required: true, max: 500, placeholder: 'https://...' })));
      case 'unfield': e.fields.pop(); return i.update(view(d));
      case 'unlink': d.buttons.pop(); return i.update(view(d));
      case 'timestamp': e.timestamp = !e.timestamp; return i.update(view(d));
      case 'cancel':
        drafts.delete(d.id);
        return i.update({ content: '✖️ Cancelled.', embeds: [], components: [] });
      case 'send': {
        const empty = isEmpty(e);
        if (!d.content && !empty) { /* embed only: fine */ }
        if (!d.content && empty) return i.reply({ content: '❌ Nothing to send yet. Add some text or design the embed first.', flags: EPH });
        const channel = await i.guild.channels.fetch(d.channelId).catch(() => null);
        if (!channel?.isTextBased()) return i.reply({ content: '❌ That channel no longer exists.', flags: EPH });
        const payload = { embeds: empty ? [] : [buildEmbed(e)], components: d.buttons.length ? [linkRow(d)] : [], allowedMentions: mentions(i) };
        if (d.target) payload.content = d.content || null;
        else if (d.content) payload.content = d.content;
        await i.deferUpdate();
        try {
          if (d.target) {
            const msg = await channel.messages.fetch(d.target);
            await msg.edit(payload);
          } else {
            await channel.send(payload);
          }
        } catch (err) {
          return i.followUp({ content: `❌ Could not send it: ${err.message}`, flags: EPH });
        }
        drafts.delete(d.id);
        return i.editReply({ content: `✅ ${d.target ? 'Message updated' : 'Message sent'} in ${channel}.`, embeds: [], components: [] });
      }
    }
  },

  async modal(i, [action, id]) {
    const v = x => i.fields.getTextInputValue(x).trim();

    if (action === 'm-plain') { // quick text: id is the channel id
      const channel = await i.guild.channels.fetch(id).catch(() => null);
      if (!channel?.isTextBased()) return i.reply({ content: '❌ That channel no longer exists.', flags: EPH });
      try {
        await channel.send({ content: i.fields.getTextInputValue('text'), allowedMentions: mentions(i) });
        return i.reply({ content: `✅ Sent in ${channel}.`, flags: EPH });
      } catch (err) {
        return i.reply({ content: `❌ Could not send it: ${err.message}`, flags: EPH });
      }
    }

    const d = getDraft(i, id);
    if (!d) return;
    const e = d.embed;

    const urlFields = { 'm-main': ['url'], 'm-author': ['icon'], 'm-footer': ['icon'], 'm-images': ['image', 'thumbnail'], 'm-link': ['url'] };
    for (const f of urlFields[action] || [])
      if (v(f) && !isUrl(v(f))) return i.reply({ content: `❌ That URL is not valid (it must start with http:// or https://).`, flags: EPH });

    if (action === 'm-color' && !/^#?[0-9a-f]{6}$/i.test(v('color')))
      return i.reply({ content: '❌ Use a hex color like `#5865F2`.', flags: EPH });

    const snap = structuredClone({ embed: d.embed, content: d.content, buttons: d.buttons });
    switch (action) {
      case 'm-content': d.content = i.fields.getTextInputValue('content'); break;
      case 'm-main': e.title = v('title'); e.description = v('description'); e.titleUrl = v('url'); break;
      case 'm-author': e.authorName = v('name'); e.authorIcon = v('icon'); break;
      case 'm-footer': e.footer = v('text'); e.footerIcon = v('icon'); break;
      case 'm-images': e.image = v('image'); e.thumbnail = v('thumbnail'); break;
      case 'm-color': e.color = parseColor(v('color')); break;
      case 'm-field':
        if (e.fields.length >= 25) return i.reply({ content: '❌ Maximum of 25 fields.', flags: EPH });
        e.fields.push({ name: v('name'), value: v('value'), inline: /^(y|yes|true|1)$/i.test(v('inline')) });
        break;
      case 'm-link':
        if (d.buttons.length >= 5) return i.reply({ content: '❌ Maximum of 5 link buttons.', flags: EPH });
        d.buttons.push({ label: v('label'), url: v('url') });
        break;
      default: return;
    }
    if (embedLength(d.embed) > MAX_LEN) {
      d.embed = snap.embed; d.content = snap.content; d.buttons = snap.buttons;
      return i.reply({ content: `❌ The embed would be too long (limit ${MAX_LEN} characters of text). Shorten something.`, flags: EPH });
    }
    return i.update(view(d));
  }
};
