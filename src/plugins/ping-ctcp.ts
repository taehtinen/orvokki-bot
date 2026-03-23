import type { MessagePlugin } from "./types.js";

// Responds to CTCP PING requests with the same payload (rate-limited).
const REPLY_COOLDOWN_MS = 60_000;
let lastReplyAt = 0;

const pingCtcpPlugin: MessagePlugin = {
  id: "ping-ctcp",
  onCtcpRequest(event, context) {
    if (event.type !== "PING") {
      return;
    }

    const now = Date.now();
    const elapsed = now - lastReplyAt;
    if (elapsed < REPLY_COOLDOWN_MS) {
      context.log("CTCP ping spam", {
        user: event.nick,
        channel: event.target,
      });
      return;
    }

    lastReplyAt = now;
    if (event.payload) {
      context.bot.ctcpResponse(event.nick, "PING", event.payload);
    } else {
      context.bot.ctcpResponse(event.nick, "PING");
    }
  },
};

export default pingCtcpPlugin;
