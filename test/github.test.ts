import { describe, expect, it, vi, afterEach } from "vitest";
import {
  listIssues,
  viewIssue,
  commentIssue,
  closeIssue,
  editLabels,
  createSubIssue,
  createIssue,
  GitHubApiError,
} from "../src/github.js";

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

describe("editLabels", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the given labels to add and returns the resulting label set", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([{ name: "ready-for-agent" }, { name: "needs-info" }]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const labels = await editLabels(config, 3, ["needs-info"], []);

    expect(labels).toEqual(["ready-for-agent", "needs-info"]);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/joachimwedin/gh-issues-mcp/issues/3/labels");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ labels: ["needs-info"] });
  });

  it("deletes each label to remove, one call per label, and returns the resulting label set", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/labels/needs-triage")) return Promise.resolve(jsonResponse([{ name: "wontfix" }]));
      if (url.endsWith("/labels/needs-info")) return Promise.resolve(jsonResponse([]));
      throw new Error(`unexpected call: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const labels = await editLabels(config, 3, [], ["needs-triage", "needs-info"]);

    expect(labels).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [firstUrl, firstInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(firstUrl).toBe(
      "https://api.github.com/repos/joachimwedin/gh-issues-mcp/issues/3/labels/needs-triage",
    );
    expect(firstInit.method).toBe("DELETE");
  });

  it("throws a GitHubApiError with the real status and message when the issue doesn't exist", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "Not Found" }, 404));
    vi.stubGlobal("fetch", fetchMock);

    await expect(editLabels(config, 999, ["needs-info"], [])).rejects.toMatchObject(
      new GitHubApiError(404, "Not Found"),
    );
  });

  it("fetches the issue's current labels when neither add nor remove is given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        number: 3,
        title: "an issue",
        state: "open",
        body: null,
        labels: [{ name: "bug" }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const labels = await editLabels(config, 3, [], []);

    expect(labels).toEqual(["bug"]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe("https://api.github.com/repos/joachimwedin/gh-issues-mcp/issues/3");
    expect(init?.method ?? "GET").toBe("GET");
  });
});

describe("createSubIssue", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubHappyPath(): ReturnType<typeof vi.fn> {
    return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith("/issues/3") && (init?.method ?? "GET") === "GET") {
        return Promise.resolve(jsonResponse({ id: 1, number: 3, title: "parent", state: "open", body: null, labels: [] }));
      }
      if (url.endsWith("/issues") && init?.method === "POST") {
        return Promise.resolve(
          jsonResponse(
            { id: 555, number: 10, title: "a sub-issue", state: "open", body: "sub body", labels: [] },
            201,
          ),
        );
      }
      if (url.endsWith("/issues/3/sub_issues") && init?.method === "POST") {
        return Promise.resolve(
          jsonResponse({ number: 3, title: "parent", state: "open", body: "parent body", labels: [] }, 201),
        );
      }
      throw new Error(`unexpected call: ${url} ${init?.method}`);
    });
  }

  it("verifies the parent exists, creates a new issue, links it under the parent, and returns the new issue", async () => {
    const fetchMock = stubHappyPath();
    vi.stubGlobal("fetch", fetchMock);

    const issue = await createSubIssue(config, 3, "a sub-issue", "sub body");

    expect(issue).toEqual({ number: 10, title: "a sub-issue", state: "open", body: "sub body", labels: [] });

    const parentCheckCall = fetchMock.mock.calls.find(
      ([url, init]) => (url as string).endsWith("/issues/3") && ((init as RequestInit | undefined)?.method ?? "GET") === "GET",
    );
    expect(parentCheckCall![0]).toBe("https://api.github.com/repos/joachimwedin/gh-issues-mcp/issues/3");

    const createCall = fetchMock.mock.calls.find(
      ([url, init]) => (url as string).endsWith("/issues") && (init as RequestInit)?.method === "POST",
    );
    expect(createCall![0]).toBe("https://api.github.com/repos/joachimwedin/gh-issues-mcp/issues");
    expect(JSON.parse((createCall![1] as RequestInit).body as string)).toEqual({
      title: "a sub-issue",
      body: "sub body",
    });

    const linkCall = fetchMock.mock.calls.find(([url]) => (url as string).endsWith("/sub_issues"));
    expect(linkCall![0]).toBe("https://api.github.com/repos/joachimwedin/gh-issues-mcp/issues/3/sub_issues");
    expect(JSON.parse((linkCall![1] as RequestInit).body as string)).toEqual({ sub_issue_id: 555 });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.github.com/repos/joachimwedin/gh-issues-mcp/issues/3",
      "https://api.github.com/repos/joachimwedin/gh-issues-mcp/issues",
      "https://api.github.com/repos/joachimwedin/gh-issues-mcp/issues/3/sub_issues",
    ]);
  });

  it("throws a GitHubApiError and creates no issue when the parent doesn't exist", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "Not Found" }, 404));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createSubIssue(config, 999, "title", "body")).rejects.toMatchObject(
      new GitHubApiError(404, "Not Found"),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.github.com/repos/joachimwedin/gh-issues-mcp/issues/999");
  });

  it("throws a GitHubApiError with the real status and message when creating the issue fails", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith("/issues/3") && (init?.method ?? "GET") === "GET") {
        return Promise.resolve(jsonResponse({ id: 1, number: 3, title: "parent", state: "open", body: null, labels: [] }));
      }
      if (url.endsWith("/issues") && init?.method === "POST") {
        return Promise.resolve(jsonResponse({ message: "Validation Failed" }, 422));
      }
      throw new Error(`unexpected call: ${url} ${init?.method}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(createSubIssue(config, 3, "title", "body")).rejects.toMatchObject(
      new GitHubApiError(422, "Validation Failed"),
    );
  });

  it("throws a GitHubApiError with the real status and message when linking to the parent fails", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith("/issues/3") && (init?.method ?? "GET") === "GET") {
        return Promise.resolve(jsonResponse({ id: 1, number: 3, title: "parent", state: "open", body: null, labels: [] }));
      }
      if (url.endsWith("/issues") && init?.method === "POST") {
        return Promise.resolve(
          jsonResponse({ id: 555, number: 10, title: "a sub-issue", state: "open", body: "sub body", labels: [] }),
        );
      }
      if (url.endsWith("/sub_issues")) return Promise.resolve(jsonResponse({ message: "Server Error" }, 500));
      throw new Error(`unexpected call: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(createSubIssue(config, 3, "title", "body")).rejects.toMatchObject(
      new GitHubApiError(500, "Server Error"),
    );
  });
});

describe("createIssue", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts a new top-level issue and returns it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        { id: 42, number: 11, title: "a new issue", state: "open", body: "issue body", labels: [] },
        201,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const issue = await createIssue(config, "a new issue", "issue body");

    expect(issue).toEqual({ number: 11, title: "a new issue", state: "open", body: "issue body", labels: [] });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/joachimwedin/gh-issues-mcp/issues");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ title: "a new issue", body: "issue body" });
  });

  it("includes labels in the request body when given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        { id: 42, number: 11, title: "a new issue", state: "open", body: "issue body", labels: [{ name: "bug" }] },
        201,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createIssue(config, "a new issue", "issue body", ["bug"]);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ title: "a new issue", body: "issue body", labels: ["bug"] });
  });

  it("throws a GitHubApiError with the real status and message on failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "Validation Failed" }, 422));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createIssue(config, "title", "body")).rejects.toMatchObject(
      new GitHubApiError(422, "Validation Failed"),
    );
  });
});
