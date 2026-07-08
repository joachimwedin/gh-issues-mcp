import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { commentIssue } from "../github.js";
import { runWithAuditLog } from "./run-with-audit-log.js";
import type { McpToolContext } from "./context.js";

export interface CommentIssueInput {
  number: number;
  body: string;
}

export async function commentIssueHandler(
  context: McpToolContext,
  input: CommentIssueInput,
): Promise<CallToolResult> {
  return runWithAuditLog(context, "comment_issue", input, () =>
    commentIssue(context.github, input.number, input.body),
  );
}

export function registerCommentIssueTool(server: McpServer, context: McpToolContext): void {
  server.registerTool(
    "comment_issue",
    {
      description: "Post a comment to the given issue.",
      inputSchema: {
        number: z.number().int(),
        body: z.string(),
      },
    },
    async (input) => commentIssueHandler(context, input),
  );
}
