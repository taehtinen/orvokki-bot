import type { MessagePlugin } from "./types.js";

// Handles "!ping" messages and replies with "pong" (rate-limited).
const REPLY_COOLDOWN_MS = 60_000;
let lastReplyAt = 0;

const pingMessagePlugin: MessagePlugin = {
  id: "ping-message",
  onMessage(event, context) {
    const text = event.message.trim();
    if (text !== "!ping") {
      return;
    }

    const now = Date.now();
    const elapsed = now - lastReplyAt;
    if (elapsed < REPLY_COOLDOWN_MS) {
      context.log("Ping spam", {
        user: event.nick,
        channel: event.target,
      });
      return;
    }

    lastReplyAt = now;
    event.reply("pong");
  },
};

export default pingMessagePlugin;
