import { describe, expect, it, vi, afterEach } from "vitest";
import { listIssues, viewIssue, commentIssue, closeIssue, GitHubApiError } from "../src/github.js";

const config = { owner: "joachimwedin", repo: "gh-issues-mcp", token: "test-token" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("listIssues", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests the configured repo's issues and maps them to a plain shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          number: 3,
          title: "list_issues and view_issue tools",
          state: "open",
          body: "some body",
          labels: [{ name: "ready-for-agent" }],
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const issues = await listIssues(config, {});

    expect(issues).toEqual([
      {
        number: 3,
        title: "list_issues and view_issue tools",
        state: "open",
        body: "some body",
        labels: ["ready-for-agent"],
      },
    ]);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://api.github.com/repos/joachimwedin/gh-issues-mcp/issues?state=open",
    );
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
  });

  it("passes state and labels filters through as query params", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    await listIssues(config, { state: "closed", labels: ["bug", "urgent"] });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(
      "https://api.github.com/repos/joachimwedin/gh-issues-mcp/issues?state=closed&labels=bug%2Curgent",
    );
  });

  it("excludes pull requests from the results", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        { number: 1, title: "an issue", state: "open", body: null, labels: [] },
        {
          number: 2,
          title: "a pull request",
          state: "open",
          body: null,
          labels: [],
          pull_request: { url: "https://api.github.com/repos/x/y/pulls/2" },
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const issues = await listIssues(config, {});

    expect(issues.map((i) => i.number)).toEqual([1]);
  });

  it("throws a GitHubApiError with the real status and message on a 404", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "Not Found" }, 404));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listIssues(config, {})).rejects.toMatchObject(
      new GitHubApiError(404, "Not Found"),
    );
  });

  it("throws a GitHubApiError with the real status and message on a rate limit response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ message: "API rate limit exceeded for installation." }, 403),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listIssues(config, {})).rejects.toMatchObject(
      new GitHubApiError(403, "API rate limit exceeded for installation."),
    );
  });
});

describe("viewIssue", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the issue's body, labels, and full comment history", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/issues/3")) {
        return Promise.resolve(
          jsonResponse({
            number: 3,
            title: "list_issues and view_issue tools",
            state: "open",
            body: "some body",
            labels: [{ name: "ready-for-agent" }],
          }),
        );
      }
      if (url.endsWith("/issues/3/comments")) {
        return Promise.resolve(jsonResponse([{ body: "first comment" }, { body: "second comment" }]));
      }
      throw new Error(`unexpected url: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const issue = await viewIssue(config, 3);

    expect(issue).toEqual({
      number: 3,
      title: "list_issues and view_issue tools",
      state: "open",
      body: "some body",
      labels: ["ready-for-agent"],
      comments: [{ body: "first comment" }, { body: "second comment" }],
    });
  });

  it("throws a GitHubApiError with the real status and message when the issue doesn't exist", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ message: "Not Found" }, 404)));
    vi.stubGlobal("fetch", fetchMock);

    await expect(viewIssue(config, 999)).rejects.toMatchObject(new GitHubApiError(404, "Not Found"));
  });
});

describe("commentIssue", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts a comment to the given issue and returns it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ body: "a new comment" }));
    vi.stubGlobal("fetch", fetchMock);

    const comment = await commentIssue(config, 3, "a new comment");

    expect(comment).toEqual({ body: "a new comment" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/joachimwedin/gh-issues-mcp/issues/3/comments");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ body: "a new comment" });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
  });

  it("throws a GitHubApiError with the real status and message when the issue doesn't exist", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "Not Found" }, 404));
    vi.stubGlobal("fetch", fetchMock);

    await expect(commentIssue(config, 999, "hi")).rejects.toMatchObject(new GitHubApiError(404, "Not Found"));
  });
});

describe("closeIssue", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the comment then closes the issue, returning the updated issue", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith("/issues/3/comments")) {
        return Promise.resolve(jsonResponse({ body: "closing this out" }));
      }
      if (url.endsWith("/issues/3") && init?.method === "PATCH") {
        return Promise.resolve(
          jsonResponse({ number: 3, title: "an issue", state: "closed", body: "body", labels: [{ name: "bug" }] }),
        );
      }
      throw new Error(`unexpected call: ${url} ${init?.method}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const issue = await closeIssue(config, 3, "closing this out");

    expect(issue).toEqual({ number: 3, title: "an issue", state: "closed", body: "body", labels: ["bug"] });

    const commentCall = fetchMock.mock.calls.find(([url]) => (url as string).endsWith("/comments"));
    expect(JSON.parse((commentCall![1] as RequestInit).body as string)).toEqual({ body: "closing this out" });

    const patchCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PATCH");
    expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual({ state: "closed" });
  });

  it("throws a GitHubApiError with the real status and message when the issue doesn't exist", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "Not Found" }, 404));
    vi.stubGlobal("fetch", fetchMock);

    await expect(closeIssue(config, 999, "closing")).rejects.toMatchObject(new GitHubApiError(404, "Not Found"));
  });
});
