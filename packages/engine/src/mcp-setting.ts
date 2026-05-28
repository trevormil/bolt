import { z } from "zod";
import { defineSetting } from "@vellum/settings";

/**
 * MCP server configuration (#46) over the settings framework (#40): a list of
 * stdio servers the agent may connect to, resolved persona → global → default
 * like every other setting. The daemon (#31) warms the GLOBAL set at startup and
 * holds the connections open; a per-persona override connects lazily on that
 * persona's first chat turn and is then reused. `env` augments the spawned
 * child's safe default environment (it does not replace PATH).
 */
export const McpServerSchema = z.object({
  name: z.string().min(1), // unique id + the capability scope (#37) for this server
  command: z.string().min(1), // executable to spawn (e.g. "npx", "bun")
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
});
export type McpServerConfig = z.infer<typeof McpServerSchema>;

// A list with unique names — duplicate names would collide in the connection
// pool (keyed by name) and make per-server capability scoping ambiguous.
// Exported so the web API can validate request bodies against the same rule
// (one schema, one source of truth) without re-importing zod.
export const McpServersSchema = z
  .array(McpServerSchema)
  .refine(
    (servers) => new Set(servers.map((s) => s.name)).size === servers.length,
    { message: "MCP server names must be unique" },
  );

export const McpServers = defineSetting<McpServerConfig[]>(
  "mcp.servers",
  McpServersSchema,
  [],
);
