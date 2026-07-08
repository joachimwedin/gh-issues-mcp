import type { GitHubClientConfig } from "../github.js";

/**
 * Shared context every MCP tool handler receives: the GitHub client config
 * and the audit-log path. Centralized here so later tools (#4/#5/#6) reuse
 * this same shape instead of redefining it per tool.
 */
export interface McpToolContext {
  github: GitHubClientConfig;
  auditLogPath: string;
}
