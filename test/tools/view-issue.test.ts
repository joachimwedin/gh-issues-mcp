import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { viewIssueTool } from "../../src/tools/view-issue.js";
import type { McpToolContext } from "../../src/tools/context.js";

const repos = [{ repo: "joachimwedin/gh-issues-mcp" }, { repo: "joachimwedin/other-repo" }];
const defaultRepo = "joachimwedin/gh-issues-mcp";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("viewIssueHandler", () => {
  let dir: string;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function context(): McpToolContext {
    dir = mkdtempSync(join(tmpdir(), "gh-issues-mcp-view-issue-test-"));
    return { token: "test-token", repos, defaultRepo, auditLogPath: join(dir, "audit.log") };
  }

  it("Given GitHub returns the issue and its comments, When view_issue is called with no repo, Then it returns the issue's body, labels, and comment history tagged with the default repo", async () => {
    // Given
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.endsWith("/issues/3")) {
          return Promise.resolve(
            jsonResponse({ number: 3, title: "an issue", state: "open", body: "body", labels: [{ name: "bug" }] }),
          );
        }
        return Promise.resolve(jsonResponse([{ body: "a comment" }]));
      }),
    );

    // When
    const result = await viewIssueTool.handler(context(), { number: 3 });

    // Then
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload).toEqual({
      number: 3,
      title: "an issue",
      state: "open",
      body: "body",
      labels: ["bug"],
      comments: [{ body: "a comment" }],
      repo: "joachimwedin/gh-issues-mcp",
    });
  });

  it("Given a second allowlisted repo, When view_issue is called with that repo explicitly, Then it calls GitHub for that repo and tags the result with it", async () => {
    // Given
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/issues/7")) {
        return Promise.resolve(jsonResponse({ number: 7, title: "other", state: "open", body: null, labels: [] }));
      }
      return Promise.resolve(jsonResponse([]));
    });
    vi.stubGlobal("fetch", fetchMock);

    // When
    const result = await viewIssueTool.handler(context(), { repo: "joachimwedin/other-repo", number: 7 });

    // Then
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload).toMatchObject({ number: 7, repo: "joachimwedin/other-repo" });
    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    expect(calledUrl).toContain("/repos/joachimwedin/other-repo/issues");
  });

  it("Given a repo outside the configured allowlist, When view_issue is called with that repo, Then it returns an error result without calling GitHub", async () => {
    // Given
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    // When
    const result = await viewIssueTool.handler(context(), { repo: "someone-else/unrelated-repo", number: 3 });

    // Then
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("someone-else/unrelated-repo");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Given GitHub accepts the request, When view_issue is called, Then it appends a successful entry with the resolved repo to the audit log with the issue number as args", async () => {
    // Given
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) =>
        Promise.resolve(
          url.endsWith("/comments")
            ? jsonResponse([])
            : jsonResponse({ number: 3, title: "t", state: "open", body: null, labels: [] }),
        ),
      ),
    );
    const ctx = context();

    // When
    await viewIssueTool.handler(ctx, { number: 3 });

    // Then
    const entry = JSON.parse(readFileSync(ctx.auditLogPath, "utf8").trim());
    expect(entry).toMatchObject({
      tool: "view_issue",
      args: { number: 3 },
      success: true,
      githubStatus: 200,
      repo: "joachimwedin/gh-issues-mcp",
    });
  });

  it("Given the issue doesn't exist, When view_issue is called, Then it returns the real GitHub status and message as an error result", async () => {
    // Given
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ message: "Not Found" }, 404))));

    // When
    const result = await viewIssueTool.handler(context(), { number: 999 });

    // Then
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("404");
    expect((result.content[0] as { text: string }).text).toContain("Not Found");
  });

  it("Given the issue doesn't exist, When view_issue is called, Then it appends a failed entry with the GitHub status to the audit log", async () => {
    // Given
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ message: "Not Found" }, 404))));
    const ctx = context();

    // When
    await viewIssueTool.handler(ctx, { number: 999 });

    // Then
    const entry = JSON.parse(readFileSync(ctx.auditLogPath, "utf8").trim());
    expect(entry).toMatchObject({ tool: "view_issue", args: { number: 999 }, success: false, githubStatus: 404 });
  });
});
