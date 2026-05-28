import { McpClient } from "@vellum/agent";
import { createLogger } from "@vellum/shared";
import type { McpServerConfig } from "./mcp-setting.ts";

const log = createLogger("mcp-manager");

// A server that fails to connect is retried no more often than this — so a chat
// turn never hammers (or blocks on) a broken server on every message, but the
// daemon still recovers a server that comes back without a restart.
const RETRY_COOLDOWN_MS = 30_000;

export type McpConnector = (cfg: McpServerConfig) => Promise<McpClient>;

async function defaultConnect(cfg: McpServerConfig): Promise<McpClient> {
  const client = new McpClient();
  await client.connectStdio(cfg.command, cfg.args ?? [], cfg.env);
  return client;
}

/**
 * Holds live MCP server connections for the daemon's lifetime (#46). Servers are
 * connected ONCE and cached by name: chat() asks for a persona's configured set
 * on every turn, but `ensure()` reuses the existing child process instead of
 * spawning one per message. A server that fails to connect is logged + skipped
 * (it never crashes the daemon) and retried only after a cooldown.
 *
 * The connector is injectable so the lifecycle is unit-testable without spawning
 * real subprocesses; the default spawns a stdio child via McpClient.
 */
export class McpManager {
  private clients = new Map<
    string,
    { client: McpClient; config: McpServerConfig }
  >();
  private failedAt = new Map<string, number>();
  private connect: McpConnector;

  constructor(connect: McpConnector = defaultConnect) {
    this.connect = connect;
  }

  /**
   * Connect (or reuse) the given servers, returning the live clients paired with
   * their server name for per-server capability scoping (#37). Servers that fail
   * to connect — or that recently failed and are still within the retry cooldown
   * — are omitted, so the caller only ever sees usable connections.
   */
  async ensure(
    configs: McpServerConfig[],
  ): Promise<{ name: string; client: McpClient }[]> {
    const out: { name: string; client: McpClient }[] = [];
    for (const cfg of configs) {
      const existing = this.clients.get(cfg.name);
      if (existing) {
        out.push({ name: cfg.name, client: existing.client });
        continue;
      }
      const failed = this.failedAt.get(cfg.name);
      if (failed !== undefined && Date.now() - failed < RETRY_COOLDOWN_MS)
        continue;
      try {
        const client = await this.connect(cfg);
        this.clients.set(cfg.name, { client, config: cfg });
        this.failedAt.delete(cfg.name);
        out.push({ name: cfg.name, client });
        log.info(`connected mcp server "${cfg.name}" (${cfg.command})`);
      } catch (e) {
        this.failedAt.set(cfg.name, Date.now());
        log.warn(`mcp server "${cfg.name}" failed to connect: ${e}`);
      }
    }
    return out;
  }

  /** Eagerly connect a set at startup (daemon) so the first chat turn doesn't pay
   *  the spawn latency. Returns how many connected. */
  async warm(configs: McpServerConfig[]): Promise<number> {
    return (await this.ensure(configs)).length;
  }

  /** The names of currently-connected servers (for diagnostics). */
  connected(): string[] {
    return [...this.clients.keys()];
  }

  /** Close every connection (daemon shutdown) so child processes don't orphan. */
  async closeAll(): Promise<void> {
    for (const [name, e] of this.clients) {
      await e.client.close().catch((err) => log.warn(`close ${name}: ${err}`));
    }
    this.clients.clear();
    this.failedAt.clear();
  }
}
