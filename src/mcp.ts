import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listIssuesTool } from "./tools/list-issues.js";
import { viewIssueTool } from "./tools/view-issue.js";
import { commentIssueTool } from "./tools/comment-issue.js";
import { closeIssueTool } from "./tools/close-issue.js";
import { editLabelsTool } from "./tools/edit-labels.js";
import { createSubIssueTool } from "./tools/create-sub-issue.js";
import { createIssueTool } from "./tools/create-issue.js";
import { editIssueTool } from "./tools/edit-issue.js";
import type { McpToolContext } from "./tools/context.js";
import type { RegisterableTool } from "./tools/define-tool.js";

export type { McpToolContext };

const tools: RegisterableTool[] = [
  listIssuesTool,
  viewIssueTool,
  commentIssueTool,
  closeIssueTool,
  editLabelsTool,
  createSubIssueTool,
  createIssueTool,
  editIssueTool,
];

/**
 * Assembles the fixed, narrow tool surface this server exposes.
 */
export function createMcpServer(context: McpToolContext): McpServer {
  const server = new McpServer({ name: "gh-issues-mcp", version: "1.0.0" });

  for (const tool of tools) tool.register(server, context);

  return server;
}
