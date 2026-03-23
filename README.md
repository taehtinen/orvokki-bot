# orvokki-bot

IRC bot written in TypeScript using [`irc-framework`](https://www.npmjs.com/package/irc-framework), with a file-based plugin system and always-on hot reloading.

## Features

- Connects to IRC with TLS support
- Joins one or more configured channels on successful registration
- Loads plugins from a directory at startup
- Dispatches IRC `message` and raw socket events to plugins
- Supports plugin lifecycle hooks (`onLoad` / `onUnload`)
- Always-on plugin file watching and hot reloading
- Graceful shutdown on `SIGINT`/`SIGTERM`

## Requirements

- Node.js 20+
- npm

## Quick Start

1. Install dependencies:
   - `npm install`
2. Create local environment config:
   - `cp .env.example .env`
3. Update `.env` for your server, nick, and channels.
4. Start in development:
   - `npm run dev`

## Configuration

The bot reads configuration from environment variables (loaded with `dotenv`):

- `IRC_HOST` (required): IRC server hostname
- `IRC_NICK` (required): bot nickname
- `IRC_IDENT` (required): username/ident sent at connect time
- `IRC_PORT` (optional): IRC port, default `6697`
- `IRC_PASSWORD` (optional): server password / NickServ pass-through, if needed
- `IRC_TLS` (optional): `true`/`false`, default `true`
- `IRC_CHANNELS` (optional): comma-separated channel list, e.g. `#orvokki,#bots`
- `PLUGIN_DIRECTORY` (optional): plugin root directory, default `src/plugins`

Example:

```env
IRC_HOST=irc.libera.chat
IRC_PORT=6697
IRC_TLS=true
IRC_NICK=orvokki-bot
IRC_IDENT=orvokki-bot
IRC_PASSWORD=
IRC_CHANNELS="#orvokki"
PLUGIN_DIRECTORY=src/plugins
```

## Scripts

- `npm run dev`: run directly from TypeScript via `tsx`
- `npm run build`: compile TypeScript into `dist/`
- `npm start`: run compiled build (`dist/index.js`)

## Plugin System

Plugins are TypeScript modules discovered recursively from `PLUGIN_DIRECTORY`. Each plugin must default-export an object with:

- `id: string` (required, unique)
- At least one handler:
  - `onMessage(event, context)`
  - `onRaw(payload, context)`
  - `onCtcpRequest(event, context)`
- Optional lifecycle hooks:
  - `onLoad(context)`
  - `onUnload(context)`

`context` includes:

- `bot`: the `irc-framework` client
- `botNick`: configured bot nick
- `log(...)`: timestamped logger function

### Implemented Plugins

- `src/plugins/ping-message.ts`: listens for `!ping` in channel/private messages and replies `pong` (with cooldown).
- `src/plugins/ping-ctcp.ts`: responds to CTCP `PING` requests using the incoming payload (with cooldown).
- `src/plugins/raw-logger.ts`: logs raw IRC traffic except heartbeat commands (`PING`/`PONG`).

### Hot Reload Behavior

The plugin manager always watches the plugin directory and:

- loads newly created plugin files
- reloads changed plugin files
- unloads removed plugin files

Reloads are guarded to avoid duplicate plugin IDs and to preserve bot runtime stability if a plugin throws during import or lifecycle hooks.

## Project Structure

- `src/index.ts`: application entrypoint and IRC connection lifecycle
- `src/config.ts`: environment parsing and validation
- `src/plugins/manager.ts`: plugin loading, dispatch, and watch/reload logic
- `src/plugins/types.ts`: plugin interfaces and context types
- `src/plugins/*.ts`: plugin implementations

## Development Notes

- Use `npm run dev` while developing plugins.
- Keep plugin `id` values stable and unique across files.
- If running production builds, set `PLUGIN_DIRECTORY` to compiled plugin location (typically `dist/plugins`) so changes to compiled plugin files can still be reloaded.

