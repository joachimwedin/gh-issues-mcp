const API_BASE = "https://api.github.com";

export interface GitHubClientConfig {
  owner: string;
  repo: string;
  token: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  body: string | null;
  labels: string[];
}

export interface GitHubComment {
  body: string;
}

export interface GitHubIssueDetail extends GitHubIssue {
  comments: GitHubComment[];
}

export interface ListIssuesFilters {
  state?: string;
  labels?: string[];
}

/**
 * Thrown for any non-2xx response from the GitHub API, carrying the real
 * HTTP status and message through unmodified so callers (ultimately MCP
 * tool callers) can reason about what actually went wrong instead of a
 * normalized/generic error.
 */
export class GitHubApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
  }
}

async function githubRequest(config: GitHubClientConfig, path: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // Response body wasn't JSON; fall back to the status text already set.
    }
    throw new GitHubApiError(res.status, message);
  }

  return res.json();
}

interface RawLabel {
  name?: string;
}

interface RawIssue {
  number: number;
  title: string;
  state: string;
  body: string | null;
  labels?: (string | RawLabel)[];
  pull_request?: unknown;
}

function normalizeLabels(labels: (string | RawLabel)[] | undefined): string[] {
  return (labels ?? []).map((label) => (typeof label === "string" ? label : (label.name ?? "")));
}

function normalizeIssue(raw: RawIssue): GitHubIssue {
  return {
    number: raw.number,
    title: raw.title,
    state: raw.state,
    body: raw.body ?? null,
    labels: normalizeLabels(raw.labels),
  };
}

/**
 * Lists issues in the configured repo. GitHub's issues endpoint also
 * returns pull requests (distinguished by a `pull_request` field); those
 * are filtered out since this project treats issues, not PRs, as the
 * triage surface.
 */
export async function listIssues(
  config: GitHubClientConfig,
  filters: ListIssuesFilters,
): Promise<GitHubIssue[]> {
  const params = new URLSearchParams();
  params.set("state", filters.state ?? "open");
  if (filters.labels?.length) params.set("labels", filters.labels.join(","));

  const raw = (await githubRequest(
    config,
    `/repos/${config.owner}/${config.repo}/issues?${params.toString()}`,
  )) as RawIssue[];

  return raw.filter((issue) => !("pull_request" in issue)).map(normalizeIssue);
}

export async function viewIssue(config: GitHubClientConfig, number: number): Promise<GitHubIssueDetail> {
  const [issue, comments] = await Promise.all([
    githubRequest(config, `/repos/${config.owner}/${config.repo}/issues/${number}`) as Promise<RawIssue>,
    githubRequest(
      config,
      `/repos/${config.owner}/${config.repo}/issues/${number}/comments`,
    ) as Promise<{ body: string }[]>,
  ]);

  return {
    ...normalizeIssue(issue),
    comments: comments.map((comment) => ({ body: comment.body })),
  };
}
