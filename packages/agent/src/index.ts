// Public surface of @vellum/agent: the thin tool-using loop + MCP client.
export {
  runAgent,
  type ToolInvoker,
  type AgentChat,
  type RunAgentInput,
  type AgentRun,
} from "./loop.ts";
export { selectTools, type ToolSpec } from "./tools.ts";
export { McpClient } from "./mcp.ts";

if (import.meta.main) {
  const { createLogger } = await import("@vellum/shared");
  createLogger("agent").info("ready · loop + MCP client + selective tools");
}
