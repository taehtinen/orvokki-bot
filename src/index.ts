import { Client } from "irc-framework";
import path from "node:path";
import { loadConfig } from "./config.js";
import { PluginManager } from "./plugins/manager.js";
import type { CtcpRequestEvent, PluginContext } from "./plugins/types.js";

function logEvent(label: string, ...details: unknown[]): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${label}`, ...details);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const bot = new Client();
  const pluginDirectory = path.resolve(process.cwd(), config.pluginDirectory);

  const pluginContext: PluginContext = {
    bot,
    botNick: config.nick,
    log: logEvent,
  };
  const pluginManager = new PluginManager(pluginDirectory, pluginContext);

  await pluginManager.loadAll();
  pluginManager.startWatching();

  bot.on("message", (event) => {
    void pluginManager.dispatchMessage(event);
  });

  bot.on("connecting", () => {
    logEvent("Connection state: connecting");
  });

  bot.on("reconnecting", (attempt: unknown) => {
    logEvent("Connection state: reconnecting", { attempt });
  });

  bot.on("raw socket connected", () => {
    logEvent("Socket connected (raw)");
  });

  bot.on("registered", () => {
    logEvent("Connected to IRC server");

    for (const channel of config.channels) {
      logEvent(`Joining ${channel}`);
      bot.join(channel);
    }
  });

  bot.on("socket close", (error?: unknown) => {
    logEvent("Socket closed", error);
  });

  bot.on("close", () => {
    logEvent("Disconnected from IRC server");
  });

  bot.on("socket error", (err: unknown) => {
    logEvent("Socket error", err);
  });

  bot.on("error", (err: unknown) => {
    logEvent("IRC error", err);
  });

  bot.on("raw", (payload: { line?: string; from_server?: boolean }) => {
    void pluginManager.dispatchRaw(payload);
  });

  bot.on("ctcp request", (payload: unknown) => {
    const event = payload as Partial<CtcpRequestEvent>;
    const type = (event.type ?? "").toUpperCase();
    const message = event.message ?? "";
    const payloadText = message.replace(/^\S+\s?/, "");

    void pluginManager.dispatchCtcpRequest({
      nick: event.nick ?? "",
      target: event.target ?? "",
      type,
      message,
      payload: payloadText,
      reply: event.reply,
    });
  });

  logEvent(`Connecting to ${config.host}:${config.port} as ${config.nick}`);
  bot.connect({
    host: config.host,
    port: config.port,
    nick: config.nick,
    username: config.ident,
    password: config.password,
    tls: config.tls,
  });

  const shutdown = async (reason: string): Promise<void> => {
    logEvent(`Shutdown requested: ${reason}`);
    await pluginManager.shutdown();
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT").finally(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM").finally(() => process.exit(0));
  });
}

main().catch((error) => {
  logEvent("Fatal startup error", error);
  process.exit(1);
});
