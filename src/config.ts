import dotenv from "dotenv";

dotenv.config();

export interface BotConfig {
  host: string;
  port: number;
  nick: string;
  ident: string;
  password?: string;
  tls: boolean;
  channels: string[];
  pluginDirectory: string;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parsePort(value: string | undefined): number {
  if (!value) {
    return 6697;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error("IRC_PORT must be an integer between 1 and 65535");
  }

  return parsed;
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error("IRC_TLS must be a boolean value (true/false)");
}

function parseChannels(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((channel) => channel.trim())
    .filter(Boolean);
}

function parseOptionalValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parsePluginDirectory(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "src/plugins";
}

export function loadConfig(): BotConfig {
  return {
    host: requireEnv("IRC_HOST"),
    port: parsePort(process.env.IRC_PORT),
    nick: requireEnv("IRC_NICK"),
    ident: requireEnv("IRC_IDENT"),
    password: parseOptionalValue(process.env.IRC_PASSWORD),
    tls: parseBoolean(process.env.IRC_TLS, true),
    channels: parseChannels(process.env.IRC_CHANNELS),
    pluginDirectory: parsePluginDirectory(process.env.PLUGIN_DIRECTORY),
  };
}
