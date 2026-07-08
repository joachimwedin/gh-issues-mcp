import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * The audit-log entry shape established by the list_issues/view_issue
 * slice. Every later write-tool (comment_issue, close_issue, edit_labels,
 * create_sub_issue) reuses this same shape.
 */
export interface AuditLogEntry {
  timestamp: string;
  tool: string;
  args: unknown;
  success: boolean;
  githubStatus?: number;
}

/**
 * Appends one JSON-lines entry to the local audit log, independent of
 * GitHub's own issue-timeline history. Creates the parent directory on
 * first use so callers don't need to provision it up front.
 */
export function appendAuditLog(path: string, entry: AuditLogEntry): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(entry)}\n`, "utf8");
}
