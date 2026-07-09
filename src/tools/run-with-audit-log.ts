import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { GitHubApiError } from "../github.js";
import { appendAuditLog } from "../audit-log.js";

/**
 * Runs a tool's GitHub call and shapes the result the way every tool must:
 * one audit-log entry per call, the JSON-serialized value as tool content on
 * success, and on a GitHubApiError an `isError` result carrying GitHub's real
 * status/message unmodified (never a normalized/generic error, per the PRD's
 * convention). Any other error is logged as a failure and rethrown as-is.
 */
export async function runWithAuditLog<T>(
  context: { auditLogPath: string; repo: string },
  tool: string,
  args: unknown,
  call: () => Promise<T>,
): Promise<CallToolResult> {
  const timestamp = new Date().toISOString();
  const repo = context.repo;

  try {
    const result = await call();
    appendAuditLog(context.auditLogPath, { timestamp, tool, args, success: true, githubStatus: 200, repo });
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  } catch (err) {
    if (err instanceof GitHubApiError) {
      appendAuditLog(context.auditLogPath, {
        timestamp,
        tool,
        args,
        success: false,
        githubStatus: err.status,
        repo,
      });
      return {
        isError: true,
        content: [{ type: "text", text: `GitHub API error (${err.status}): ${err.message}` }],
      };
    }
    appendAuditLog(context.auditLogPath, { timestamp, tool, args, success: false, repo });
    throw err;
  }
}
