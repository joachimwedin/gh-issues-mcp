import { describe, expect, it, vi, afterEach } from "vitest";
import {
  listIssues,
  viewIssue,
  commentIssue,
  closeIssue,
  editLabels,
  createSubIssue,
  createIssue,
  editIssue,
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

  it("Given GitHub returns issues in the raw API shape, When listIssues is called, Then it requests the configured repo's issues and maps them to a plain shape", async () => {
    // Given
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

    // When
    const issues = await listIssues(config, {});

    // Then
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

  it("Given GitHub accepts the request, When listIssues is called with state and labels filters, Then it passes them through as query params", async () => {
    // Given
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    // When
    await listIssues(config, { state: "closed", labels: ["bug", "urgent"] });

    // Then
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(
      "https://api.github.com/repos/joachimwedin/gh-issues-mcp/issues?state=closed&labels=bug%2Curgent",
    );
  });

  it("Given GitHub returns a mix of issues and pull requests, When listIssues is called, Then it excludes pull requests from the results", async () => {
    // Given
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

    // When
    const issues = await listIssues(config, {});

    // Then
    expect(issues.map((i) => i.number)).toEqual([1]);
  });

  it("Given GitHub returns a 404, When listIssues is called, Then it throws a GitHubApiError with the real status and message", async () => {
    // Given
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "Not Found" }, 404));
    vi.stubGlobal("fetch", fetchMock);

    // When / Then
    await expect(listIssues(config, {})).rejects.toMatchObject(
      new GitHubApiError(404, "Not Found"),
    );
  });

  it("Given GitHub returns a rate limit response, When listIssues is called, Then it throws a GitHubApiError with the real status and message", async () => {
    // Given
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ message: "API rate limit exceeded for installation." }, 403),
    );
    vi.stubGlobal("fetch", fetchMock);

    // When / Then
    await expect(listIssues(config, {})).rejects.toMatchObject(
      new GitHubApiError(403, "API rate limit exceeded for installation."),
    );
  });
});

describe("viewIssue", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("Given GitHub returns the issue and its comments, When viewIssue is called, Then it returns the issue's body, labels, and full comment history", async () => {
    // Given
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

    // When
    const issue = await viewIssue(config, { number: 3 });

    // Then
    expect(issue).toEqual({
      number: 3,
      title: "list_issues and view_issue tools",
      state: "open",
      body: "some body",
      labels: ["ready-for-agent"],
      comments: [{ body: "first comment" }, { body: "second comment" }],
    });
  });

  it("Given the issue doesn't exist, When viewIssue is called, Then it throws a GitHubApiError with the real status and message", async () => {
    // Given
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ message: "Not Found" }, 404)));
    vi.stubGlobal("fetch", fetchMock);

    // When / Then
    await expect(viewIssue(config, { number: 999 })).rejects.toMatchObject(new GitHubApiError(404, "Not Found"));
  });
});

describe("commentIssue", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("Given GitHub accepts the comment, When commentIssue is called, Then it posts a comment to the given issue and returns it", async () => {
    // Given
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ body: "a new comment" }));
    vi.stubGlobal("fetch", fetchMock);

    // When
    const comment = await commentIssue(config, { number: 3, body: "a new comment" });

    // Then
    expect(comment).toEqual({ body: "a new comment" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/joachimwedin/gh-issues-mcp/issues/3/comments");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ body: "a new comment" });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
  });

  it("Given the issue doesn't exist, When commentIssue is called, Then it throws a GitHubApiError with the real status and message", async () => {
    // Given
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "Not Found" }, 404));
    vi.stubGlobal("fetch", fetchMock);

    // When / Then
    await expect(commentIssue(config, { number: 999, body: "hi" })).rejects.toMatchObject(
      new GitHubApiError(404, "Not Found"),
    );
  });
});

describe("closeIssue", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("Given GitHub accepts the comment and close, When closeIssue is called, Then it posts the comment then closes the issue, returning the updated issue", async () => {
    // Given
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

    // When
    const issue = await closeIssue(config, { number: 3, comment: "closing this out" });

    // Then
    expect(issue).toEqual({ number: 3, title: "an issue", state: "closed", body: "body", labels: ["bug"] });

    const commentCall = fetchMock.mock.calls.find(([url]) => (url as string).endsWith("/comments"));
    expect(JSON.parse((commentCall![1] as RequestInit).body as string)).toEqual({ body: "closing this out" });

    const patchCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PATCH");
    expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual({ state: "closed" });
  });

  it("Given the issue doesn't exist, When closeIssue is called, Then it throws a GitHubApiError with the real status and message", async () => {
    // Given
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "Not Found" }, 404));
    vi.stubGlobal("fetch", fetchMock);

    // When / Then
    await expect(closeIssue(config, { number: 999, comment: "closing" })).rejects.toMatchObject(
      new GitHubApiError(404, "Not Found"),
    );
  });
});

describe("editLabels", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("Given GitHub accepts the label addition, When editLabels is called with a label to add, Then it posts the given labels to add and returns the resulting label set", async () => {
    // Given
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([{ name: "ready-for-agent" }, { name: "needs-info" }]),
    );
    vi.stubGlobal("fetch", fetchMock);

    // When
    const labels = await editLabels(config, { number: 3, add: ["needs-info"], remove: [] });

    // Then
    expect(labels).toEqual(["ready-for-agent", "needs-info"]);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/joachimwedin/gh-issues-mcp/issues/3/labels");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ labels: ["needs-info"] });
  });

  it("Given GitHub accepts each deletion, When editLabels is called with labels to remove, Then it deletes each label, one call per label, and returns the resulting label set", async () => {
    // Given
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/labels/needs-triage")) return Promise.resolve(jsonResponse([{ name: "wontfix" }]));
      if (url.endsWith("/labels/needs-info")) return Promise.resolve(jsonResponse([]));
      throw new Error(`unexpected call: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    // When
    const labels = await editLabels(config, { number: 3, add: [], remove: ["needs-triage", "needs-info"] });

    // Then
    expect(labels).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [firstUrl, firstInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(firstUrl).toBe(
      "https://api.github.com/repos/joachimwedin/gh-issues-mcp/issues/3/labels/needs-triage",
    );
    expect(firstInit.method).toBe("DELETE");
  });

  it("Given the issue doesn't exist, When editLabels is called, Then it throws a GitHubApiError with the real status and message", async () => {
    // Given
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "Not Found" }, 404));
    vi.stubGlobal("fetch", fetchMock);

    // When / Then
    await expect(editLabels(config, { number: 999, add: ["needs-info"], remove: [] })).rejects.toMatchObject(
      new GitHubApiError(404, "Not Found"),
    );
  });

  it("Given neither add nor remove is given, When editLabels is called, Then it fetches the issue's current labels", async () => {
    // Given
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

    // When
    const labels = await editLabels(config, { number: 3, add: [], remove: [] });

    // Then
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

  it("Given the parent exists and GitHub accepts all requests, When createSubIssue is called, Then it verifies the parent exists, creates a new issue, links it under the parent, and returns the new issue", async () => {
    // Given
    const fetchMock = stubHappyPath();
    vi.stubGlobal("fetch", fetchMock);

    // When
    const issue = await createSubIssue(config, { parentNumber: 3, title: "a sub-issue", body: "sub body" });

    // Then
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

  it("Given the parent doesn't exist, When createSubIssue is called, Then it throws a GitHubApiError and creates no issue", async () => {
    // Given
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "Not Found" }, 404));
    vi.stubGlobal("fetch", fetchMock);

    // When / Then
    await expect(
      createSubIssue(config, { parentNumber: 999, title: "title", body: "body" }),
    ).rejects.toMatchObject(new GitHubApiError(404, "Not Found"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.github.com/repos/joachimwedin/gh-issues-mcp/issues/999");
  });

  it("Given the parent exists but creating the issue fails, When createSubIssue is called, Then it throws a GitHubApiError with the real status and message", async () => {
    // Given
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

    // When / Then
    await expect(
      createSubIssue(config, { parentNumber: 3, title: "title", body: "body" }),
    ).rejects.toMatchObject(new GitHubApiError(422, "Validation Failed"));
  });

  it("Given the parent exists and the issue is created but linking fails, When createSubIssue is called, Then it throws a GitHubApiError with the real status and message", async () => {
    // Given
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

    // When / Then
    await expect(
      createSubIssue(config, { parentNumber: 3, title: "title", body: "body" }),
    ).rejects.toMatchObject(new GitHubApiError(500, "Server Error"));
  });
});

describe("createIssue", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("Given GitHub accepts the new issue, When createIssue is called, Then it posts a new top-level issue and returns it", async () => {
    // Given
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        { id: 42, number: 11, title: "a new issue", state: "open", body: "issue body", labels: [] },
        201,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    // When
    const issue = await createIssue(config, { title: "a new issue", body: "issue body" });

    // Then
    expect(issue).toEqual({ number: 11, title: "a new issue", state: "open", body: "issue body", labels: [] });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/joachimwedin/gh-issues-mcp/issues");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ title: "a new issue", body: "issue body" });
  });

  it("Given GitHub accepts the new issue, When createIssue is called with labels, Then it includes labels in the request body", async () => {
    // Given
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        { id: 42, number: 11, title: "a new issue", state: "open", body: "issue body", labels: [{ name: "bug" }] },
        201,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    // When
    await createIssue(config, { title: "a new issue", body: "issue body", labels: ["bug"] });

    // Then
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ title: "a new issue", body: "issue body", labels: ["bug"] });
  });

  it("Given GitHub rejects the new issue, When createIssue is called, Then it throws a GitHubApiError with the real status and message", async () => {
    // Given
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "Validation Failed" }, 422));
    vi.stubGlobal("fetch", fetchMock);

    // When / Then
    await expect(createIssue(config, { title: "title", body: "body" })).rejects.toMatchObject(
      new GitHubApiError(422, "Validation Failed"),
    );
  });
});

describe("editIssue", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("Given GitHub accepts the update, When editIssue is called with only a title, Then it PATCHes only the given title and returns the updated issue", async () => {
    // Given
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ number: 3, title: "an updated title", state: "open", body: "original body", labels: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    // When
    const issue = await editIssue(config, { number: 3, title: "an updated title" });

    // Then
    expect(issue).toEqual({ number: 3, title: "an updated title", state: "open", body: "original body", labels: [] });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/joachimwedin/gh-issues-mcp/issues/3");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ title: "an updated title" });
  });

  it("Given GitHub accepts the update, When editIssue is called with only a body, Then it PATCHes only the given body", async () => {
    // Given
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ number: 3, title: "original title", state: "open", body: "an updated body", labels: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    // When
    await editIssue(config, { number: 3, body: "an updated body" });

    // Then
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ body: "an updated body" });
  });

  it("Given GitHub accepts the update, When editIssue is called with both title and body, Then it PATCHes both", async () => {
    // Given
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ number: 3, title: "new title", state: "open", body: "new body", labels: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    // When
    await editIssue(config, { number: 3, title: "new title", body: "new body" });

    // Then
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ title: "new title", body: "new body" });
  });

  it("Given the issue doesn't exist, When editIssue is called, Then it throws a GitHubApiError with the real status and message", async () => {
    // Given
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "Not Found" }, 404));
    vi.stubGlobal("fetch", fetchMock);

    // When / Then
    await expect(editIssue(config, { number: 999, title: "title" })).rejects.toMatchObject(
      new GitHubApiError(404, "Not Found"),
    );
  });
});
