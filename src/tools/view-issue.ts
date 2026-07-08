import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { viewIssue } from "../github.js";
import { runWithAuditLog } from "./run-with-audit-log.js";
import type { McpToolContext } from "./context.js";

export interface ViewIssueInput {
  number: number;
}

export async function viewIssueHandler(
  context: McpToolContext,
  input: ViewIssueInput,
): Promise<CallToolResult> {
  return runWithAuditLog(context, "view_issue", input, () => viewIssue(context.github, input.number));
}

export function registerViewIssueTool(server: McpServer, context: McpToolContext): void {
  server.registerTool(
    "view_issue",
    {
      description: "View a single issue's body, labels, and full comment history.",
      inputSchema: {
        number: z.number().int(),
      },
    },
    async (input) => viewIssueHandler(context, input),
  );
}
