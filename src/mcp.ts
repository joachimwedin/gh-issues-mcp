import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerListIssuesTool } from "./tools/list-issues.js";
import { registerViewIssueTool } from "./tools/view-issue.js";
import { registerCommentIssueTool } from "./tools/comment-issue.js";
import { registerCloseIssueTool } from "./tools/close-issue.js";
import { registerEditLabelsTool } from "./tools/edit-labels.js";
import type { McpToolContext } from "./tools/context.js";

export type { McpToolContext };

/**
 * Assembles the fixed, narrow tool surface this server exposes. Each tool
 * is registered here, one at a time, as later slices (#6) land.
 */
export function createMcpServer(context: McpToolContext): McpServer {
  const server = new McpServer({ name: "gh-issues-mcp", version: "1.0.0" });

  registerListIssuesTool(server, context);
  registerViewIssueTool(server, context);
  registerCommentIssueTool(server, context);
  registerCloseIssueTool(server, context);
  registerEditLabelsTool(server, context);

  return server;
}
