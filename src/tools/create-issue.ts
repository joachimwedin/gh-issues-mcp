import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createIssue } from "../github.js";
import { runWithAuditLog } from "./run-with-audit-log.js";
import type { McpToolContext } from "./context.js";

export interface CreateIssueInput {
  title: string;
  body: string;
  labels?: string[];
}

export const createIssueInputSchema = {
  title: z.string(),
  body: z.string(),
  labels: z.array(z.string()).optional(),
};

export async function createIssueHandler(
  context: McpToolContext,
  input: CreateIssueInput,
): Promise<CallToolResult> {
  const invalid = (input.labels ?? []).filter((label) => !context.labelVocabulary.includes(label));

  if (invalid.length > 0) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Label(s) not in the configured vocabulary: ${invalid.join(", ")}. Allowed labels: ${context.labelVocabulary.join(", ")}.`,
        },
      ],
    };
  }

  return runWithAuditLog(context, "create_issue", input, () =>
    createIssue(context.github, input.title, input.body, input.labels),
  );
}

export function registerCreateIssueTool(server: McpServer, context: McpToolContext): void {
  server.registerTool(
    "create_issue",
    {
      description: "Create a new top-level issue in the configured repo.",
      inputSchema: createIssueInputSchema,
    },
    async (input) => createIssueHandler(context, input),
  );
}
