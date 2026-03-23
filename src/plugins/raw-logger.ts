import type { MessagePlugin } from "./types.js";

// Logs non-heartbeat IRC raw lines for quick protocol-level debugging.
const rawLoggerPlugin: MessagePlugin = {
  id: "raw-logger",
  onRaw(payload, context) {
    const line = payload.line ?? "";
    const command = payload.command;
    if (command === "PING" || command === "PONG") {
      return;
    }

    const direction = payload.from_server ? "<<<" : ">>>";
    context.log(`RAW ${direction}`, line);
  },
};

export default rawLoggerPlugin;
