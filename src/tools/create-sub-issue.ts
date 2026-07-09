import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createSubIssue } from "../github.js";
import { runWithAuditLog } from "./run-with-audit-log.js";
import type { McpToolContext } from "./context.js";

export interface CreateSubIssueInput {
  parent_number: number;
  title: string;
  body: string;
}

export const createSubIssueInputSchema = {
  parent_number: z.number().int(),
  title: z.string(),
  body: z.string(),
};

export async function createSubIssueHandler(
  context: McpToolContext,
  input: CreateSubIssueInput,
): Promise<CallToolResult> {
  return runWithAuditLog(context, "create_sub_issue", input, () =>
    createSubIssue(context.github, input.parent_number, input.title, input.body),
  );
}

export function registerCreateSubIssueTool(server: McpServer, context: McpToolContext): void {
  server.registerTool(
    "create_sub_issue",
    {
      description: "Create a new issue and link it as a sub-issue of the given parent issue.",
      inputSchema: createSubIssueInputSchema,
    },
    async (input) => createSubIssueHandler(context, input),
  );
}
