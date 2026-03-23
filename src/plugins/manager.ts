import { watch, type FSWatcher } from "node:fs";
import { access, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { MessageEvent } from "irc-framework";
import type {
  CtcpRequestEvent,
  MessagePlugin,
  MessagePluginModule,
  PluginContext,
  RawEventPayload,
} from "./types.js";

interface PluginRecord {
  filePath: string;
  plugin: MessagePlugin;
  sourceVersion: string;
}

interface ImportedPlugin {
  plugin: MessagePlugin;
  sourceVersion: string;
}

function isPluginFilename(fileName: string): boolean {
  return (
    fileName.endsWith(".ts") &&
    !fileName.startsWith(".reload-") &&
    fileName !== "manager.ts" &&
    fileName !== "types.ts"
  );
}

async function importPlugin(filePath: string): Promise<ImportedPlugin> {
  let importPath = filePath;
  let tempPath: string | undefined;
  let sourceVersion = "unknown";
  try {
    // tsx can keep stale module state for repeated imports of the same .ts path.
    // Importing a unique temp copy guarantees fresh evaluation on reload.
    if (filePath.endsWith(".ts")) {
      const source = await readFile(filePath, "utf8");
      sourceVersion = createHash("sha1").update(source).digest("hex").slice(0, 10);
      tempPath = path.join(
        path.dirname(filePath),
        `.reload-${path.basename(filePath, ".ts")}-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}.ts`,
      );
      await writeFile(tempPath, source, "utf8");
      importPath = tempPath;
    }

    const fileUrl = pathToFileURL(importPath);
    const module = (await import(`${fileUrl.href}?t=${Date.now()}`)) as Partial<MessagePluginModule>;
    const plugin = module.default;

    if (!plugin || typeof plugin !== "object") {
      throw new Error("Plugin module must export a default object");
    }
    if (!plugin.id || typeof plugin.id !== "string") {
      throw new Error("Plugin default export must include string id");
    }
    if (
      typeof plugin.onMessage !== "function" &&
      typeof plugin.onRaw !== "function" &&
      typeof plugin.onCtcpRequest !== "function"
    ) {
      throw new Error("Plugin must define at least one handler (onMessage, onRaw, or onCtcpRequest)");
    }

    return { plugin, sourceVersion };
  } finally {
    if (tempPath) {
      try {
        await unlink(tempPath);
      } catch {
        // Best-effort cleanup; stale temp files are harmless.
      }
    }
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseRawCommand(line: string): string | undefined {
  if (!line) {
    return undefined;
  }

  const start = line.startsWith(":") ? line.indexOf(" ") + 1 : 0;
  if (start < 0 || start >= line.length) {
    return undefined;
  }

  const rest = line.slice(start).trimStart();
  if (!rest) {
    return undefined;
  }

  const firstToken = rest.split(/\s+/, 1)[0];
  return firstToken ? firstToken.toUpperCase() : undefined;
}

export class PluginManager {
  private readonly byFilePath = new Map<string, PluginRecord>();
  private readonly byPluginId = new Map<string, PluginRecord>();
  private watcher?: FSWatcher;
  private readonly debounceTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly pluginDirectory: string,
    private readonly context: PluginContext,
  ) {}

  async loadAll(): Promise<void> {
    const stack = [this.pluginDirectory];
    while (stack.length > 0) {
      const directory = stack.pop();
      if (!directory) {
        continue;
      }

      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        const filePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          stack.push(filePath);
          continue;
        }
        if (!entry.isFile() || !isPluginFilename(entry.name)) {
          continue;
        }
        await this.loadFile(filePath);
      }
    }
  }

  async loadFile(filePath: string): Promise<void> {
    const imported = await importPlugin(filePath);
    const plugin = imported.plugin;
    const idConflict = this.byPluginId.get(plugin.id);
    if (idConflict) {
      throw new Error(`Plugin id "${plugin.id}" already loaded from ${idConflict.filePath}`);
    }

    await plugin.onLoad?.(this.context);
    const record: PluginRecord = { filePath, plugin, sourceVersion: imported.sourceVersion };
    this.byFilePath.set(filePath, record);
    this.byPluginId.set(plugin.id, record);
    this.context.log("Plugin loaded", {
      id: plugin.id,
      filePath,
      sourceVersion: imported.sourceVersion,
    });
  }

  async unloadFile(filePath: string): Promise<void> {
    const record = this.byFilePath.get(filePath);
    if (!record) {
      return;
    }

    await record.plugin.onUnload?.(this.context);
    this.byFilePath.delete(filePath);
    this.byPluginId.delete(record.plugin.id);
    this.context.log("Plugin unloaded", { id: record.plugin.id, filePath });
  }

  async reloadFile(filePath: string): Promise<void> {
    const current = this.byFilePath.get(filePath);
    if (!current) {
      await this.loadFile(filePath);
      return;
    }

    let imported: ImportedPlugin;
    try {
      imported = await importPlugin(filePath);
    } catch (error) {
      this.context.log("Plugin reload import failed", { filePath, error });
      return;
    }
    const nextPlugin = imported.plugin;

    const conflict = this.byPluginId.get(nextPlugin.id);
    if (conflict && conflict.filePath !== filePath) {
      this.context.log("Plugin reload id conflict", {
        filePath,
        id: nextPlugin.id,
        conflictPath: conflict.filePath,
      });
      return;
    }

    try {
      await nextPlugin.onLoad?.(this.context);
    } catch (error) {
      this.context.log("Plugin reload onLoad failed", { filePath, error });
      return;
    }

    try {
      await current.plugin.onUnload?.(this.context);
    } catch (error) {
      this.context.log("Plugin unload warning", {
        id: current.plugin.id,
        filePath,
        error,
      });
    }

    this.byPluginId.delete(current.plugin.id);
    const nextRecord: PluginRecord = {
      filePath,
      plugin: nextPlugin,
      sourceVersion: imported.sourceVersion,
    };
    this.byFilePath.set(filePath, nextRecord);
    this.byPluginId.set(nextPlugin.id, nextRecord);
    this.context.log("Plugin reloaded", {
      id: nextPlugin.id,
      filePath,
      sourceVersion: imported.sourceVersion,
      previousSourceVersion: current.sourceVersion,
    });
  }

  async dispatchMessage(event: MessageEvent): Promise<void> {
    const records = [...this.byFilePath.values()];
    for (const record of records) {
      try {
        await record.plugin.onMessage?.(event, this.context);
      } catch (error) {
        this.context.log("Plugin message handler failed", {
          id: record.plugin.id,
          filePath: record.filePath,
          error,
        });
      }
    }
  }

  async dispatchRaw(payload: RawEventPayload): Promise<void> {
    const line = payload.line ?? "";
    const normalizedPayload: RawEventPayload = {
      ...payload,
      line,
      command: parseRawCommand(line),
    };

    const records = [...this.byFilePath.values()];
    for (const record of records) {
      if (!record.plugin.onRaw) {
        continue;
      }
      try {
        await record.plugin.onRaw(normalizedPayload, this.context);
      } catch (error) {
        this.context.log("Plugin raw handler failed", {
          id: record.plugin.id,
          filePath: record.filePath,
          error,
        });
      }
    }
  }

  async dispatchCtcpRequest(event: CtcpRequestEvent): Promise<void> {
    const records = [...this.byFilePath.values()];
    for (const record of records) {
      if (!record.plugin.onCtcpRequest) {
        continue;
      }
      try {
        await record.plugin.onCtcpRequest(event, this.context);
      } catch (error) {
        this.context.log("Plugin CTCP request handler failed", {
          id: record.plugin.id,
          filePath: record.filePath,
          error,
        });
      }
    }
  }

  startWatching(): void {
    if (this.watcher) {
      return;
    }

    const onChange = (eventType: string, fileName: string | Buffer | null): void => {
      if (!fileName) {
        return;
      }
      const name = fileName.toString();
      if (!isPluginFilename(name)) {
        return;
      }

      const key = name;
      const existingTimer = this.debounceTimers.get(key);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const timer = setTimeout(async () => {
        this.debounceTimers.delete(key);
        const filePath = path.join(this.pluginDirectory, key);

        try {
          const exists = await fileExists(filePath);
          if (!exists) {
            await this.unloadFile(filePath);
            return;
          }

          if (eventType === "rename" && !this.byFilePath.has(filePath)) {
            await this.loadFile(filePath);
            return;
          }
          await this.reloadFile(filePath);
        } catch (error) {
          this.context.log("Plugin file change handling failed", { filePath, error });
        }
      }, 120);

      this.debounceTimers.set(key, timer);
    };

    try {
      this.watcher = watch(this.pluginDirectory, { recursive: true }, onChange);
    } catch {
      this.watcher = watch(this.pluginDirectory, onChange);
      this.context.log("Plugin watch fallback (non-recursive)", {
        pluginDirectory: this.pluginDirectory,
      });
    }

    this.context.log("Plugin watch started", { pluginDirectory: this.pluginDirectory });
  }

  async shutdown(): Promise<void> {
    this.watcher?.close();
    this.watcher = undefined;

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    const records = [...this.byFilePath.values()];
    for (const record of records) {
      try {
        await record.plugin.onUnload?.(this.context);
      } catch (error) {
        this.context.log("Plugin shutdown unload warning", {
          id: record.plugin.id,
          filePath: record.filePath,
          error,
        });
      }
    }

    this.byFilePath.clear();
    this.byPluginId.clear();
  }
}
