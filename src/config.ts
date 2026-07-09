import { readFileSync } from "node:fs";

export const DEFAULT_LABEL_VOCABULARY = [
  "needs-triage",
  "needs-info",
  "ready-for-agent",
  "ready-for-human",
  "wontfix",
];

const REPO_FORMAT = /^[^/\s]+\/[^/\s]+$/;

export interface RepoAllowlistEntry {
  /** "owner/name" */
  repo: string;
  labelVocabulary?: string[];
}

/** A repo's effective label vocabulary: its own override, or the hardcoded default. */
export function effectiveLabelVocabulary(entry: RepoAllowlistEntry): string[] {
  return entry.labelVocabulary ?? DEFAULT_LABEL_VOCABULARY;
}

export interface ServerConfig {
  repos: RepoAllowlistEntry[];
  defaultRepo: string;
  port: number;
}

function parseRepos(path: string, raw: unknown): RepoAllowlistEntry[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`Config file at "${path}" must have a non-empty "repos" array.`);
  }

  return raw.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error(`Config file at "${path}" has an invalid "repos" entry at index ${index}.`);
    }

    const { repo, labelVocabulary } = entry as Record<string, unknown>;

    if (typeof repo !== "string" || !REPO_FORMAT.test(repo)) {
      throw new Error(
        `Config file at "${path}" has a "repos" entry at index ${index} whose "repo" must be in "owner/name" format.`,
      );
    }

    const result: RepoAllowlistEntry = { repo };

    if (labelVocabulary !== undefined) {
      if (
        !Array.isArray(labelVocabulary) ||
        !labelVocabulary.every((label) => typeof label === "string" && label.length > 0)
      ) {
        throw new Error(
          `Config file at "${path}" has an invalid "labelVocabulary" for repo "${repo}"; expected an array of non-empty strings.`,
        );
      }
      result.labelVocabulary = labelVocabulary as string[];
    }

    return result;
  });
}

function resolveDefaultRepo(path: string, repos: RepoAllowlistEntry[], defaultRepo: unknown): string {
  if (defaultRepo !== undefined) {
    if (typeof defaultRepo !== "string" || !repos.some((entry) => entry.repo === defaultRepo)) {
      throw new Error(`Config file at "${path}" has a "defaultRepo" that isn't among the configured "repos".`);
    }
    return defaultRepo;
  }

  if (repos.length === 1) return repos[0]!.repo;

  throw new Error(`Config file at "${path}" must set "defaultRepo" when more than one repo is configured.`);
}

/**
 * Loads the server's repo allowlist, default repo, and listen port from a
 * local JSON config file. Read once at startup; the resolved allowlist and
 * default are then consulted per tool call, rather than the server being
 * scoped to a single fixed repo.
 */
export function loadConfig(path: string): ServerConfig {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(`Config file not found at "${path}".`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Config file at "${path}" contains invalid JSON.`);
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`Config file at "${path}" must contain a JSON object.`);
  }

  const { repos: rawRepos, defaultRepo: rawDefaultRepo, port, owner, repo } = parsed as Record<string, unknown>;

  if (rawRepos === undefined && (owner !== undefined || repo !== undefined)) {
    throw new Error(
      `Config file at "${path}" uses the old "owner"/"repo" shape, which is no longer supported; use "repos"/"defaultRepo" instead.`,
    );
  }

  const repos = parseRepos(path, rawRepos);
  const defaultRepo = resolveDefaultRepo(path, repos, rawDefaultRepo);

  if (typeof port !== "number" || !Number.isInteger(port)) {
    throw new Error(`Config file at "${path}" is missing a valid integer "port".`);
  }

  return { repos, defaultRepo, port };
}
