import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { closeIssue } from "../github.js";
import { runWithAuditLog } from "./run-with-audit-log.js";
import type { McpToolContext } from "./context.js";

export interface CloseIssueInput {
  number: number;
  comment: string;
}

/**
 * `comment` has no `.optional()`, so a close_issue call with no comment is
 * rejected by the MCP SDK's own schema validation before the handler ever
 * runs — closing without an explanation is structurally impossible.
 */
export const closeIssueInputSchema = {
  number: z.number().int(),
  comment: z.string(),
};

export async function closeIssueHandler(
  context: McpToolContext,
  input: CloseIssueInput,
): Promise<CallToolResult> {
  return runWithAuditLog(context, "close_issue", input, () =>
    closeIssue(context.github, input.number, input.comment),
  );
}

export function registerCloseIssueTool(server: McpServer, context: McpToolContext): void {
  server.registerTool(
    "close_issue",
    {
      description:
        "Post a comment and close the given issue. A comment is required, so an issue can never be closed without an explanation.",
      inputSchema: closeIssueInputSchema,
    },
    async (input) => closeIssueHandler(context, input),
  );
}
