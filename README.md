# Customizable Discord bot (messages, welcomes, multi-type tickets)

## Setup
1. `npm install`
2. Copy `.env.example` to `.env` and set `TOKEN` (and `GUILD_ID` for testing).
3. Developer Portal > Bot > enable **Server Members Intent**.
4. Invite with scopes `bot` + `applications.commands` and permissions: Manage Channels, Manage Roles, View Channels, Send Messages, Embed Links, Attach Files, Read Message History.
5. `npm run clear` -> `npm run deploy` -> `npm run verify:remote` -> `npm start`

## Commands
- `/message create channel:` – interactive embed builder with live preview (text, title, description, author, footer, images, color, fields, link buttons, timestamp).
- `/message edit message:<link>` – load one of the bot's messages into the builder and save changes.
- `/message text channel:` – quick plain text message.
- `/welcome channel | message | role | status | dm | test | view` – variables: `{user} {username} {server} {count}`.
- `/ticket create-type | config | delete-type | list | panel | panel-text | ticket-text | add | remove | close`

## Multiple ticket types (example)
```
/ticket create-type name:purchase staff:@Sales   category:Purchases logs:#purchase-logs
/ticket create-type name:support  staff:@Support category:Support   logs:#support-logs
/ticket panel type:purchase channel:#purchase
/ticket panel type:support  channel:#support
```
Each type has its own category, staff role, logs, limit per user, panel text and in-ticket message.
