import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerListIssuesTool } from "./tools/list-issues.js";
import { registerViewIssueTool } from "./tools/view-issue.js";
import type { GitHubClientConfig } from "./github.js";

export interface McpToolContext {
  github: GitHubClientConfig;
  auditLogPath: string;
}

/**
 * Assembles the fixed, narrow tool surface this server exposes. Each tool
 * is registered here, one at a time, as later slices (#4, #5, #6) land.
 */
export function createMcpServer(context: McpToolContext): McpServer {
  const server = new McpServer({ name: "gh-issues-mcp", version: "1.0.0" });

  registerListIssuesTool(server, context);
  registerViewIssueTool(server, context);

  return server;
}
