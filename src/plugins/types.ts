import type { Client, MessageEvent } from "irc-framework";

export interface RawEventPayload {
  line?: string;
  from_server?: boolean;
  command?: string;
}

export interface CtcpRequestEvent {
  nick: string;
  target: string;
  type: string;
  message: string;
  payload: string;
  reply?: (message: string) => void;
}

export interface PluginContext {
  bot: Client;
  botNick: string;
  log: (label: string, ...details: unknown[]) => void;
}

export interface MessagePlugin {
  id: string;
  onLoad?: (context: PluginContext) => void | Promise<void>;
  onUnload?: (context: PluginContext) => void | Promise<void>;
  onMessage?: (event: MessageEvent, context: PluginContext) => void | Promise<void>;
  onRaw?: (payload: RawEventPayload, context: PluginContext) => void | Promise<void>;
  onCtcpRequest?: (event: CtcpRequestEvent, context: PluginContext) => void | Promise<void>;
}

export interface MessagePluginModule {
  default: MessagePlugin;
}
