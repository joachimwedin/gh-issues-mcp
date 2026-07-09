import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { editIssue } from "../github.js";
import { runWithAuditLog } from "./run-with-audit-log.js";
import type { McpToolContext } from "./context.js";

export interface EditIssueInput {
  number: number;
  title?: string;
  body?: string;
}

export const editIssueInputSchema = {
  number: z.number().int(),
  title: z.string().optional(),
  body: z.string().optional(),
};

export async function editIssueHandler(
  context: McpToolContext,
  input: EditIssueInput,
): Promise<CallToolResult> {
  if (input.title === undefined && input.body === undefined) {
    return {
      isError: true,
      content: [{ type: "text", text: "At least one of title or body must be given." }],
    };
  }

  return runWithAuditLog(context, "edit_issue", input, () =>
    editIssue(context.github, input.number, input.title, input.body),
  );
}

export function registerEditIssueTool(server: McpServer, context: McpToolContext): void {
  server.registerTool(
    "edit_issue",
    {
      description:
        "Update an issue's title and/or body. At least one of title or body must be given.",
      inputSchema: editIssueInputSchema,
    },
    async (input) => editIssueHandler(context, input),
  );
}
