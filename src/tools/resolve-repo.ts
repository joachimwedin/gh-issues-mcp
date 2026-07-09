import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { DEFAULT_LABEL_VOCABULARY } from "../config.js";
import type { McpToolContext, ResolvedToolContext } from "./context.js";

export type RepoResolution = { ok: true; context: ResolvedToolContext } | { ok: false; error: CallToolResult };

/**
 * Resolves a caller's optional `repo` input (or the configured default when
 * omitted) against the allowlist, feeding tool code a per-call resolved
 * GitHub client config and label vocabulary. Rejects repos outside the
 * allowlist as a result rather than throwing, so `defineTool` can return it
 * directly as the tool's error response.
 */
export function resolveRepo(context: McpToolContext, requestedRepo: string | undefined): RepoResolution {
  const repo = requestedRepo ?? context.defaultRepo;
  const entry = context.repos.find((candidate) => candidate.repo === repo);

  if (!entry) {
    return {
      ok: false,
      error: {
        isError: true,
        content: [
          {
            type: "text",
            text: `Repo "${repo}" is not in the configured allowlist. Configured repos: ${context.repos
              .map((candidate) => candidate.repo)
              .join(", ")}.`,
          },
        ],
      },
    };
  }

  const [owner, name] = repo.split("/") as [string, string];

  return {
    ok: true,
    context: {
      github: { owner, repo: name, token: context.token },
      labelVocabulary: entry.labelVocabulary ?? DEFAULT_LABEL_VOCABULARY,
      auditLogPath: context.auditLogPath,
      repo,
      repos: context.repos,
    },
  };
}
