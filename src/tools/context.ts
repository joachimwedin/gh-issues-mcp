import type { GitHubClientConfig } from "../github.js";

/**
 * Shared context every MCP tool handler receives: the GitHub client config,
 * the audit-log path, and the configured label vocabulary. Centralized here
 * so later tools (#6) reuse this same shape instead of redefining it per
 * tool.
 */
export interface McpToolContext {
  github: GitHubClientConfig;
  auditLogPath: string;
  labelVocabulary: string[];
}
