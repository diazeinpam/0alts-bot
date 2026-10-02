const {
  SlashCommandBuilder, PermissionFlagsBits: P, ChannelType, ModalBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, EmbedBuilder, AttachmentBuilder
} = require('discord.js');
const db = require('../db');
const { EPH, field, makeEmbed, parseColor } = require('../util');

const KEY = /^[a-z0-9-]{1,20}$/;
const MAX_TYPES = 25;

const isStaff = (member, type) =>
  (type?.staffRoleId && member.roles.cache.has(type.staffRoleId)) || member.permissions.has(P.ManageChannels);

const typeOpt = o => o.setName('type').setDescription('Ticket type (e.g. purchase, support)')
  .setRequired(true).setAutocomplete(true);

async function transcript(channel) {
  const all = [];
  let before;
  for (let n = 0; n < 10; n++) { // up to 1000 messages
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (!batch.size) break;
    all.push(...batch.values());
    before = batch.last().id;
  }
  all.reverse();
  const lines = all.map(m => {
    const files = m.attachments.size ? ' ' + [...m.attachments.values()].map(a => a.url).join(' ') : '';
    const body = m.content || (m.embeds.length ? '[embed]' : '');
    return `[${m.createdAt.toISOString()}] ${m.author.tag}: ${body}${files}`;
  });
  return lines.join('\n') || '(no messages)';
}

async function closeTicket(channel, closer, g, tk) {
  delete g.tickets[channel.id];
  db.save();
  await channel.send('🔒 Ticket closed. This channel will be deleted in 5 seconds.').catch(() => {});

  const type = g.ticket.types[tk.type];
  if (type?.logChannelId) {
    const log = await channel.guild.channels.fetch(type.logChannelId).catch(() => null);
    if (log?.isTextBased()) {
      let text;
      try { text = await transcript(channel); } catch { text = '(could not generate transcript)'; }
      const file = new AttachmentBuilder(Buffer.from(text, 'utf8'), { name: `transcript-${channel.name}.txt` });
      const embed = new EmbedBuilder().setColor('#ED4245')
        .setTitle(`${type.label} ticket #${tk.number} closed`).addFields(
          { name: 'Opened by', value: `<@${tk.userId}>`, inline: true },
          { name: 'Closed by', value: `<@${closer.id}>`, inline: true },
          { name: 'Claimed by', value: tk.claimedBy ? `<@${tk.claimedBy}>` : 'Nobody', inline: true }
        ).setTimestamp();
      await log.send({ embeds: [embed], files: [file], allowedMentions: { parse: [] } })
        .catch(e => console.warn('Could not send ticket log:', e.message));
    }
  }
  setTimeout(() => channel.delete().catch(() => {}), 5000);
}

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ticket system with multiple types')
    .setDefaultMemberPermissions(P.ManageGuild)
    .setDMPermission(false)
    .addSubcommand(s => s.setName('create-type').setDescription('Create a ticket type (e.g. purchase, support)')
      .addStringOption(o => o.setName('name').setDescription('Short name: letters, numbers, hyphens').setRequired(true).setMaxLength(20))
      .addRoleOption(o => o.setName('staff').setDescription('Role that handles these tickets').setRequired(true))
      .addChannelOption(o => o.setName('category').setDescription('Category where tickets are created').addChannelTypes(ChannelType.GuildCategory))
      .addChannelOption(o => o.setName('logs').setDescription('Channel for logs and transcripts').addChannelTypes(ChannelType.GuildText))
      .addIntegerOption(o => o.setName('max').setDescription('Open tickets per user (default 1)').setMinValue(1).setMaxValue(5)))
    .addSubcommand(s => s.setName('config').setDescription('Edit a ticket type (no options = show current)')
      .addStringOption(typeOpt)
      .addRoleOption(o => o.setName('staff').setDescription('Role that handles these tickets'))
      .addChannelOption(o => o.setName('category').setDescription('Category where tickets are created').addChannelTypes(ChannelType.GuildCategory))
      .addChannelOption(o => o.setName('logs').setDescription('Channel for logs and transcripts').addChannelTypes(ChannelType.GuildText))
      .addIntegerOption(o => o.setName('max').setDescription('Open tickets per user').setMinValue(1).setMaxValue(5)))
    .addSubcommand(s => s.setName('delete-type').setDescription('Delete a ticket type').addStringOption(typeOpt))
    .addSubcommand(s => s.setName('list').setDescription('List all ticket types'))
    .addSubcommand(s => s.setName('panel').setDescription('Send the panel for a ticket type')
      .addStringOption(typeOpt)
      .addChannelOption(o => o.setName('channel').setDescription('Channel for the panel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)))
    .addSubcommand(s => s.setName('panel-text').setDescription('Customize the panel text, color and button').addStringOption(typeOpt))
    .addSubcommand(s => s.setName('ticket-text').setDescription('Customize the message shown inside each ticket').addStringOption(typeOpt))
    .addSubcommand(s => s.setName('add').setDescription('Add a user to the current ticket')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)))
    .addSubcommand(s => s.setName('remove').setDescription('Remove a user from the current ticket')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)))
    .addSubcommand(s => s.setName('close').setDescription('Close the current ticket')),

  async autocomplete(i) {
    const g = db.guild(i.guildId);
    const q = i.options.getFocused().toLowerCase();
    const list = Object.entries(g.ticket.types)
      .filter(([k, t]) => k.includes(q) || t.label.toLowerCase().includes(q))
      .slice(0, 25).map(([k, t]) => ({ name: t.label, value: k }));
    await i.respond(list);
  },

  async execute(i) {
    const g = db.guild(i.guildId);
    const types = g.ticket.types;
    const sub = i.options.getSubcommand();

    // ---------- type management ----------
    if (sub === 'create-type') {
      const key = i.options.getString('name', true).trim().toLowerCase().replace(/\s+/g, '-');
      if (!KEY.test(key)) return i.reply({ content: '❌ Use only letters, numbers and hyphens (max 20 characters).', flags: EPH });
      if (types[key]) return i.reply({ content: `❌ The type **${key}** already exists. Use \`/ticket config\` to edit it.`, flags: EPH });
      if (Object.keys(types).length >= MAX_TYPES) return i.reply({ content: `❌ Maximum of ${MAX_TYPES} ticket types reached.`, flags: EPH });
      const label = cap(key.replaceAll('-', ' '));
      types[key] = {
        label,
        categoryId: i.options.getChannel('category')?.id || null,
        staffRoleId: i.options.getRole('staff', true).id,
        logChannelId: i.options.getChannel('logs')?.id || null,
        max: i.options.getInteger('max') || 1,
        counter: 0,
        panel: { title: `🎫 ${label}`, description: 'Press the button below to open a ticket.', color: '#5865F2', button: `Open ${label} ticket`.slice(0, 80), emoji: '🎫' },
        open: { title: `${label} ticket #{number}`, description: 'Hi {user}, our staff will be with you shortly.\nPlease describe your request in as much detail as possible.', color: '#57F287' }
      };
      db.save();
      return i.reply({ content: `✅ Ticket type **${label}** created.\nNext: \`/ticket panel type:${key} channel:#your-channel\``, flags: EPH });
    }

    if (sub === 'list') {
      const entries = Object.entries(types);
      if (!entries.length) return i.reply({ content: 'No ticket types yet. Create one with `/ticket create-type`.', flags: EPH });
      const e = new EmbedBuilder().setColor('#5865F2').setTitle('🎫 Ticket types').addFields(entries.map(([k, t]) => ({
        name: `${t.label} (${k})`,
        value: `Category: ${t.categoryId ? `<#${t.categoryId}>` : 'none'}\nStaff: <@&${t.staffRoleId}>\nLogs: ${t.logChannelId ? `<#${t.logChannelId}>` : 'none'}\nMax per user: ${t.max}\nOpen now: ${Object.values(g.tickets).filter(x => x.type === k).length}`,
        inline: true
      })));
      return i.reply({ embeds: [e], flags: EPH, allowedMentions: { parse: [] } });
    }

    if (['config', 'delete-type', 'panel', 'panel-text', 'ticket-text'].includes(sub)) {
      const key = i.options.getString('type', true);
      const t = types[key];
      if (!t) return i.reply({ content: '❌ That ticket type does not exist. See `/ticket list`.', flags: EPH });

      if (sub === 'delete-type') {
        delete types[key]; db.save();
        return i.reply({ content: `✅ Type **${t.label}** deleted. Existing panels will stop working; already-open tickets can still be closed.`, flags: EPH });
      }

      if (sub === 'config') {
        const cat = i.options.getChannel('category'), staff = i.options.getRole('staff');
        const logs = i.options.getChannel('logs'), max = i.options.getInteger('max');
        if (cat) t.categoryId = cat.id;
        if (staff) t.staffRoleId = staff.id;
        if (logs) t.logChannelId = logs.id;
        if (max) t.max = max;
        if (cat || staff || logs || max) db.save();
        const e = new EmbedBuilder().setTitle(`🎫 ${t.label}`).setColor('#5865F2').addFields(
          { name: 'Category', value: t.categoryId ? `<#${t.categoryId}>` : 'None (top level)', inline: true },
          { name: 'Staff', value: `<@&${t.staffRoleId}>`, inline: true },
          { name: 'Logs', value: t.logChannelId ? `<#${t.logChannelId}>` : 'None', inline: true },
          { name: 'Max per user', value: String(t.max), inline: true }
        );
        return i.reply({ embeds: [e], flags: EPH, allowedMentions: { parse: [] } });
      }

      if (sub === 'panel') {
        const channel = i.options.getChannel('channel', true);
        if (!channel.permissionsFor(i.guild.members.me)?.has([P.ViewChannel, P.SendMessages, P.EmbedLinks]))
          return i.reply({ content: `❌ I don't have permission to send embeds in ${channel}.`, flags: EPH });
        const btn = new ButtonBuilder().setCustomId(`ticket:open:${key}`).setLabel(t.panel.button || 'Open ticket').setStyle(ButtonStyle.Primary);
        if (t.panel.emoji) btn.setEmoji(t.panel.emoji);
        try {
          await channel.send({ embeds: [makeEmbed(t.panel)], components: [new ActionRowBuilder().addComponents(btn)] });
        } catch (e) {
          return i.reply({ content: `❌ Could not send the panel (invalid emoji?): ${e.message}`, flags: EPH });
        }
        return i.reply({ content: `✅ **${t.label}** panel sent in ${channel}.`, flags: EPH });
      }

      if (sub === 'panel-text') {
        return i.showModal(new ModalBuilder().setCustomId(`ticket:m-panel:${key}`).setTitle(`${t.label} panel`.slice(0, 45)).addComponents(
          field('title', 'Title', { max: 256, value: t.panel.title }),
          field('description', 'Description', { long: true, max: 4000, value: t.panel.description }),
          field('color', 'Color (hex)', { max: 7, value: t.panel.color }),
          field('button', 'Button text', { max: 80, required: true, value: t.panel.button }),
          field('emoji', 'Button emoji', { max: 60, value: t.panel.emoji, placeholder: '🎫' })
        ));
      }

      if (sub === 'ticket-text') {
        return i.showModal(new ModalBuilder().setCustomId(`ticket:m-ticket:${key}`).setTitle(`${t.label} ticket message`.slice(0, 45)).addComponents(
          field('title', 'Title', { max: 256, value: t.open.title, placeholder: 'Variables: {number} {type}' }),
          field('description', 'Description', { long: true, max: 4000, value: t.open.description, placeholder: 'Variables: {user} {number} {type}' }),
          field('color', 'Color (hex)', { max: 7, value: t.open.color })
        ));
      }
    }

    // ---------- commands that only work inside a ticket ----------
    const tk = g.tickets[i.channelId];
    if (!tk) return i.reply({ content: '❌ This command only works inside a ticket.', flags: EPH });
    const type = types[tk.type];

    if (sub === 'close') {
      if (i.user.id !== tk.userId && !isStaff(i.member, type))
        return i.reply({ content: "❌ You can't close this ticket.", flags: EPH });
      await i.reply('🔒 Closing ticket…');
      return closeTicket(i.channel, i.user, g, tk);
    }

    if (!isStaff(i.member, type)) return i.reply({ content: '❌ Only staff can do this.', flags: EPH });
    const user = i.options.getUser('user', true);
    if (sub === 'add') {
      await i.channel.permissionOverwrites.edit(user, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true });
      return i.reply({ content: `✅ ${user} was added to the ticket.`, allowedMentions: { users: [user.id] } });
    }
    if (sub === 'remove') {
      if (user.id === tk.userId) return i.reply({ content: "❌ You can't remove the ticket creator.", flags: EPH });
      await i.channel.permissionOverwrites.delete(user);
      return i.reply({ content: `✅ ${user.tag} was removed from the ticket.` });
    }
  },

  async button(i, [action, key]) {
    const g = db.guild(i.guildId);

    if (action === 'open') {
      const t = g.ticket.types[key];
      if (!t) return i.reply({ content: '⚠️ This ticket type no longer exists. Please tell an administrator.', flags: EPH });

      for (const cid of Object.keys(g.tickets)) if (!i.guild.channels.cache.has(cid)) delete g.tickets[cid]; // channels deleted by hand
      const mine = Object.entries(g.tickets).filter(([, x]) => x.userId === i.user.id && x.type === key).map(([id]) => `<#${id}>`);
      if (mine.length >= t.max)
        return i.reply({ content: `❌ You already have ${mine.length} open ${t.label} ticket(s): ${mine.join(', ')}`, flags: EPH });

      await i.deferReply({ flags: EPH });
      const n = ++t.counter;
      const allow = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks];
      const parent = t.categoryId && i.guild.channels.cache.get(t.categoryId)?.type === ChannelType.GuildCategory ? t.categoryId : null;
      let ch;
      try {
        ch = await i.guild.channels.create({
          name: `${key}-${String(n).padStart(4, '0')}`,
          type: ChannelType.GuildText,
          parent,
          topic: `${t.label} ticket #${n} by ${i.user.tag} (${i.user.id})`,
          permissionOverwrites: [
            { id: i.guild.id, deny: [P.ViewChannel] },
            { id: i.user.id, allow },
            { id: t.staffRoleId, allow: [...allow, P.ManageMessages] },
            { id: i.client.user.id, allow: [...allow, P.ManageChannels, P.ManageMessages] }
          ]
        });
      } catch (e) {
        t.counter--;
        db.save();
        const me = i.guild.members.me;
        const parentCh = parent ? i.guild.channels.cache.get(parent) : null;
        const perms = parentCh ? parentCh.permissionsFor(me) : me.permissions;
        const missing = perms.missing([P.ViewChannel, P.ManageChannels, P.ManageRoles, P.SendMessages, P.EmbedLinks, P.AttachFiles, P.ReadMessageHistory, P.ManageMessages])
          .map(x => x.replace(/([A-Z])/g, ' $1').trim());
        const where = parentCh ? `in the category ${parentCh}` : 'in this server';
        const detail = missing.length
          ? `I'm missing these permissions ${where}: **${missing.join(', ')}**.`
          : `Discord said: ${e.message}. Check that the category isn't full (50 channels max).`;
        return i.editReply(`❌ I couldn't create the ticket. ${detail}\nAsk an admin to fix my permissions and try again.`);
      }
      g.tickets[ch.id] = { type: key, userId: i.user.id, number: n, claimedBy: null, createdAt: Date.now() };
      db.save();

      const fill = s => (s || '').replaceAll('{user}', `<@${i.user.id}>`).replaceAll('{number}', String(n)).replaceAll('{type}', t.label);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket:close').setLabel('Close').setEmoji('🔒').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ticket:claim').setLabel('Claim').setEmoji('🙋').setStyle(ButtonStyle.Success)
      );
      await ch.send({
        content: `<@${i.user.id}> <@&${t.staffRoleId}>`,
        embeds: [makeEmbed({ title: fill(t.open.title), description: fill(t.open.description), color: t.open.color })],
        components: [row],
        allowedMentions: { users: [i.user.id], roles: [t.staffRoleId] }
      });
      return i.editReply(`✅ Your ticket has been created: ${ch}`);
    }

    const tk = g.tickets[i.channelId];
    if (!tk) return i.reply({ content: '❌ This channel is no longer an active ticket.', flags: EPH });
    const type = g.ticket.types[tk.type];

    if (action === 'close') {
      if (i.user.id !== tk.userId && !isStaff(i.member, type))
        return i.reply({ content: "❌ You can't close this ticket.", flags: EPH });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket:confirm').setLabel('Yes, close it').setStyle(ButtonStyle.Danger)
      );
      return i.reply({ content: 'Are you sure you want to close this ticket?', components: [row], flags: EPH });
    }
    if (action === 'confirm') {
      if (i.user.id !== tk.userId && !isStaff(i.member, type))
        return i.reply({ content: "❌ You can't close this ticket.", flags: EPH });
      await i.update({ content: '🔒 Closing ticket…', components: [] });
      return closeTicket(i.channel, i.user, g, tk);
    }
    if (action === 'claim') {
      if (!isStaff(i.member, type)) return i.reply({ content: '❌ Only staff can claim tickets.', flags: EPH });
      if (tk.claimedBy) return i.reply({ content: `Already claimed by <@${tk.claimedBy}>.`, flags: EPH, allowedMentions: { parse: [] } });
      tk.claimedBy = i.user.id; db.save();
      return i.reply({ content: `🙋 ${i.user} will handle this ticket.`, allowedMentions: { parse: [] } });
    }
  },

  async modal(i, [action, key]) {
    const g = db.guild(i.guildId);
    const t = g.ticket.types[key];
    if (!t) return i.reply({ content: '❌ That ticket type no longer exists.', flags: EPH });
    const v = id => i.fields.getTextInputValue(id).trim();
    if (!v('title') && !v('description'))
      return i.reply({ content: '❌ You need at least a title or a description.', flags: EPH });
    if (action === 'm-panel') {
      t.panel = { title: v('title'), description: v('description'), color: parseColor(v('color')), button: v('button') || 'Open ticket', emoji: v('emoji') };
      db.save();
      return i.reply({ content: `✅ Saved. Use \`/ticket panel type:${key}\` to post a new panel with these texts.`, flags: EPH });
    }
    if (action === 'm-ticket') {
      t.open = { title: v('title'), description: v('description'), color: parseColor(v('color'), '#57F287') };
      db.save();
      return i.reply({ content: '✅ Saved. It will apply to new tickets.', flags: EPH });
    }
  }
};
