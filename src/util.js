const { ActionRowBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, MessageFlags } = require('discord.js');

const EPH = MessageFlags.Ephemeral;

function parseColor(input, fallback = '#5865F2') {
  const c = (input || '').trim();
  return /^#?[0-9a-f]{6}$/i.test(c) ? (c.startsWith('#') ? c : '#' + c) : fallback;
}

function isUrl(u) {
  try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:'; } catch { return false; }
}

// Variables: {user} {username} {server} {count}
function fmt(text, member) {
  if (!text) return text;
  const g = member.guild;
  return text
    .replaceAll('{user}', `<@${member.id}>`)
    .replaceAll('{username}', member.user.username)
    .replaceAll('{server}', g.name)
    .replaceAll('{count}', String(g.memberCount));
}

function field(id, label, { long = false, required = false, max = 100, value, placeholder } = {}) {
  const t = new TextInputBuilder()
    .setCustomId(id).setLabel(label.slice(0, 45))
    .setStyle(long ? TextInputStyle.Paragraph : TextInputStyle.Short)
    .setRequired(required).setMaxLength(max);
  if (placeholder) t.setPlaceholder(placeholder.slice(0, 100));
  if (value) t.setValue(String(value).slice(0, max));
  return new ActionRowBuilder().addComponents(t);
}

function makeEmbed({ title, description, color, image, footer } = {}) {
  const e = new EmbedBuilder().setColor(parseColor(color));
  if (title) e.setTitle(title.slice(0, 256));
  if (description) e.setDescription(description.slice(0, 4000));
  if (image && isUrl(image)) e.setImage(image);
  if (footer) e.setFooter({ text: footer.slice(0, 2048) });
  return e;
}

function welcomePayload(member, cfg) {
  const embed = makeEmbed({
    title: fmt(cfg.title, member), description: fmt(cfg.description, member),
    color: cfg.color, image: cfg.image, footer: fmt(cfg.footer, member)
  }).setThumbnail(member.user.displayAvatarURL());
  if (!embed.data.title && !embed.data.description) embed.setDescription('Welcome!');
  return { content: `<@${member.id}>`, embeds: [embed] };
}

module.exports = { EPH, parseColor, isUrl, fmt, field, makeEmbed, welcomePayload };
