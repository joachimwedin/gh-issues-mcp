import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { listIssues, GitHubApiError, type GitHubClientConfig } from "../github.js";
import { appendAuditLog } from "../audit-log.js";

export interface ListIssuesContext {
  github: GitHubClientConfig;
  auditLogPath: string;
}

export interface ListIssuesInput {
  state?: string;
  labels?: string[];
}

export async function listIssuesHandler(
  context: ListIssuesContext,
  input: ListIssuesInput,
): Promise<CallToolResult> {
  const timestamp = new Date().toISOString();

  try {
    const issues = await listIssues(context.github, input);
    appendAuditLog(context.auditLogPath, {
      timestamp,
      tool: "list_issues",
      args: input,
      success: true,
      githubStatus: 200,
    });
    return { content: [{ type: "text", text: JSON.stringify(issues) }] };
  } catch (err) {
    if (err instanceof GitHubApiError) {
      appendAuditLog(context.auditLogPath, {
        timestamp,
        tool: "list_issues",
        args: input,
        success: false,
        githubStatus: err.status,
      });
      return {
        isError: true,
        content: [{ type: "text", text: `GitHub API error (${err.status}): ${err.message}` }],
      };
    }
    appendAuditLog(context.auditLogPath, { timestamp, tool: "list_issues", args: input, success: false });
    throw err;
  }
}

export function registerListIssuesTool(server: McpServer, context: ListIssuesContext): void {
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
