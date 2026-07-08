import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { viewIssue, GitHubApiError, type GitHubClientConfig } from "../github.js";
import { appendAuditLog } from "../audit-log.js";

export interface ViewIssueContext {
  github: GitHubClientConfig;
  auditLogPath: string;
}

export interface ViewIssueInput {
  number: number;
}

export async function viewIssueHandler(
  context: ViewIssueContext,
  input: ViewIssueInput,
): Promise<CallToolResult> {
  const timestamp = new Date().toISOString();

  try {
    const issue = await viewIssue(context.github, input.number);
    appendAuditLog(context.auditLogPath, {
      timestamp,
      tool: "view_issue",
      args: input,
      success: true,
      githubStatus: 200,
    });
    return { content: [{ type: "text", text: JSON.stringify(issue) }] };
  } catch (err) {
    if (err instanceof GitHubApiError) {
      appendAuditLog(context.auditLogPath, {
        timestamp,
        tool: "view_issue",
        args: input,
        success: false,
        githubStatus: err.status,
      });
      return {
        isError: true,
        content: [{ type: "text", text: `GitHub API error (${err.status}): ${err.message}` }],
      };
    }
    appendAuditLog(context.auditLogPath, { timestamp, tool: "view_issue", args: input, success: false });
    throw err;
  }
}

export function registerViewIssueTool(server: McpServer, context: ViewIssueContext): void {
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
