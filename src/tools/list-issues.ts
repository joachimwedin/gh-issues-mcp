import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { listIssues } from "../github.js";
import { runWithAuditLog } from "./run-with-audit-log.js";
import type { McpToolContext } from "./context.js";

export interface ListIssuesInput {
  state?: string;
  labels?: string[];
}

export async function listIssuesHandler(
  context: McpToolContext,
  input: ListIssuesInput,
): Promise<CallToolResult> {
  return runWithAuditLog(context, "list_issues", input, () => listIssues(context.github, input));
}

export function registerListIssuesTool(server: McpServer, context: McpToolContext): void {
  server.registerTool(
    "list_issues",
    {
      description: "List issues in the configured repository, optionally filtered by state and labels.",
      inputSchema: {
        state: z.enum(["open", "closed", "all"]).optional(),
        labels: z.array(z.string()).optional(),
      },
    },
    async (input) => listIssuesHandler(context, input),
  );
}
