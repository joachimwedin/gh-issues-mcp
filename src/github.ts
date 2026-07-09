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

interface GitHubRequestOptions {
  method?: string;
  body?: unknown;
}

/** Builds a `/repos/{owner}/{repo}/issues[/segment...]` path, the shape shared by every issues endpoint. */
function issuesPath(config: GitHubClientConfig, ...segments: (string | number)[]): string {
  return [`/repos/${config.owner}/${config.repo}/issues`, ...segments].join("/");
}

async function githubRequest(
  config: GitHubClientConfig,
  path: string,
  options?: GitHubRequestOptions,
): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: options?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options?.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
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
  id: number;
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

  const raw = (await githubRequest(config, `${issuesPath(config)}?${params.toString()}`)) as RawIssue[];

  return raw.filter((issue) => !("pull_request" in issue)).map(normalizeIssue);
}

export async function viewIssue(
  config: GitHubClientConfig,
  { number }: { number: number },
): Promise<GitHubIssueDetail> {
  const [issue, comments] = await Promise.all([
    githubRequest(config, issuesPath(config, number)) as Promise<RawIssue>,
    githubRequest(config, issuesPath(config, number, "comments")) as Promise<GitHubComment[]>,
  ]);

  return {
    ...normalizeIssue(issue),
    comments: comments.map((comment) => ({ body: comment.body })),
  };
}

export async function commentIssue(
  config: GitHubClientConfig,
  { number, body }: { number: number; body: string },
): Promise<GitHubComment> {
  const raw = (await githubRequest(config, issuesPath(config, number, "comments"), {
    method: "POST",
    body: { body },
  })) as GitHubComment;

  return { body: raw.body };
}

/**
 * Posts the given comment, then closes the issue. Always in this order so a
 * failure to close still leaves the explanatory comment on the issue.
 */
export async function closeIssue(
  config: GitHubClientConfig,
  { number, comment }: { number: number; comment: string },
): Promise<GitHubIssue> {
  await commentIssue(config, { number, body: comment });

  const raw = (await githubRequest(config, issuesPath(config, number), {
    method: "PATCH",
    body: { state: "closed" },
  })) as RawIssue;

  return normalizeIssue(raw);
}

interface RawLabelObject {
  name: string;
}

/**
 * Adds and/or removes labels on an issue. Adding is one API call for the
 * whole batch; removing is one call per label (GitHub's API has no bulk
 * removal endpoint). Returns the resulting label set from the last write
 * performed.
 */
export async function editLabels(
  config: GitHubClientConfig,
  { number, add = [], remove = [] }: { number: number; add?: string[]; remove?: string[] },
): Promise<string[]> {
  let labels: RawLabelObject[] | undefined;

  if (add.length > 0) {
    labels = (await githubRequest(config, issuesPath(config, number, "labels"), {
      method: "POST",
      body: { labels: add },
    })) as RawLabelObject[];
  }

  for (const name of remove) {
    labels = (await githubRequest(config, issuesPath(config, number, "labels", encodeURIComponent(name)), {
      method: "DELETE",
    })) as RawLabelObject[];
  }

  if (labels === undefined) {
    const raw = (await githubRequest(config, issuesPath(config, number))) as RawIssue;
    return normalizeIssue(raw).labels;
  }

  return labels.map((label) => label.name);
}

/**
 * Verifies the parent exists, creates a new issue, then links it as a
 * sub-issue of the parent via GitHub's sub-issues API (which takes the new
 * issue's internal `id`, not its `number`). The parent-existence check runs
 * first so a bad parent number fails fast without leaving a created but
 * unlinked issue behind. If the link call itself still fails after that
 * check passes (e.g. a transient error), the issue is left created but
 * unlinked rather than orphaned/deleted — mirroring closeIssue's
 * comment-before-close ordering, an accepted trade-off, not a bug to
 * silently swallow.
 */
export async function createSubIssue(
  config: GitHubClientConfig,
  { parentNumber, title, body }: { parentNumber: number; title: string; body: string },
): Promise<GitHubIssue> {
  await githubRequest(config, issuesPath(config, parentNumber));

  const created = (await githubRequest(config, issuesPath(config), {
    method: "POST",
    body: { title, body },
  })) as RawIssue;

  await githubRequest(config, issuesPath(config, parentNumber, "sub_issues"), {
    method: "POST",
    body: { sub_issue_id: created.id },
  });

  return normalizeIssue(created);
}

/**
 * Updates an existing issue's title and/or body. Only the provided fields
 * are sent in the PATCH body, mirroring createIssue's omit-when-undefined
 * pattern rather than GitHub's own "send null to clear" semantics.
 */
export async function editIssue(
  config: GitHubClientConfig,
  { number, title, body }: { number: number; title?: string; body?: string },
): Promise<GitHubIssue> {
  const patch: Record<string, string> = {};
  if (title !== undefined) patch.title = title;
  if (body !== undefined) patch.body = body;

  const raw = (await githubRequest(config, issuesPath(config, number), {
    method: "PATCH",
    body: patch,
  })) as RawIssue;

  return normalizeIssue(raw);
}

/**
 * Creates a new top-level issue in the configured repo.
 */
export async function createIssue(
  config: GitHubClientConfig,
  { title, body, labels }: { title: string; body: string; labels?: string[] },
): Promise<GitHubIssue> {
  const raw = (await githubRequest(config, issuesPath(config), {
    method: "POST",
    body: labels !== undefined ? { title, body, labels } : { title, body },
  })) as RawIssue;

  return normalizeIssue(raw);
}
