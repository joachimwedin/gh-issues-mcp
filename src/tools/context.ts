import type { RepoAllowlistEntry } from "../config.js";
import type { GitHubClientConfig } from "../github.js";

/**
 * Shared context every MCP tool handler receives: the token, the full
 * configured repo allowlist, the resolved default repo, and the audit-log
 * path. Held once per server; a specific target repo is resolved from it
 * per call (see resolve-repo.ts), not fixed at construction time.
 */
export interface McpToolContext {
  token: string;
  repos: RepoAllowlistEntry[];
  defaultRepo: string;
  auditLogPath: string;
}

/**
 * The per-call context a tool's `validate`/`call` actually run against,
 * once the caller's `repo` input (or the default) has been resolved against
 * the allowlist. Tool code keeps referencing `github`/`labelVocabulary`
 * exactly as it did before multi-repo support; only `repo` is new.
 */
export interface ResolvedToolContext {
  github: GitHubClientConfig;
  labelVocabulary: string[];
  auditLogPath: string;
  /** The resolved "owner/name" this call targeted. */
  repo: string;
}
