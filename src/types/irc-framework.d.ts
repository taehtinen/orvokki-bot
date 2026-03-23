declare module "irc-framework" {
  export type EventListener = (...args: any[]) => void;

  export interface ConnectOptions {
    host: string;
    port?: number;
    nick: string;
    password?: string;
    tls?: boolean;
    username?: string;
    gecos?: string;
  }

  export interface MessageEvent {
    nick: string;
    target: string;
    message: string;
    reply(message: string): void;
  }

  export class Client {
    connect(options: ConnectOptions): void;
    on(event: string, listener: EventListener): this;
    raw(rawLine: string): void;
    join(channel: string): void;
    part(channel: string, message?: string): void;
    say(target: string, message: string): void;
    notice(target: string, message: string): void;
    ctcpRequest(target: string, type: string, ...params: string[]): void;
    ctcpResponse(target: string, type: string, ...params: string[]): void;
    quit(reason?: string): void;
  }
}
