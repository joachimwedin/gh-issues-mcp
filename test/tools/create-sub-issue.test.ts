import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSubIssueTool } from "../../src/tools/create-sub-issue.js";
import type { McpToolContext } from "../../src/tools/context.js";

const repos = [{ repo: "joachimwedin/gh-issues-mcp" }, { repo: "joachimwedin/other-repo" }];
const defaultRepo = "joachimwedin/gh-issues-mcp";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createSubIssueHandler", () => {
  let dir: string;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function context(): McpToolContext {
    dir = mkdtempSync(join(tmpdir(), "gh-issues-mcp-create-sub-issue-test-"));
    return { token: "test-token", repos, defaultRepo, auditLogPath: join(dir, "audit.log") };
  }

  it("Given the parent exists and GitHub accepts the new issue, When create_sub_issue is called with no repo, Then it creates the sub-issue and returns it tagged with the default repo", async () => {
    // Given
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.endsWith("/issues/3") && (init?.method ?? "GET") === "GET") {
          return Promise.resolve(jsonResponse({ id: 1, number: 3, title: "parent", state: "open", body: null, labels: [] }));
        }
        if (url.endsWith("/issues") && init?.method === "POST") {
          return Promise.resolve(
            jsonResponse({ id: 555, number: 10, title: "a sub-issue", state: "open", body: "sub body", labels: [] }),
          );
        }
        if (url.endsWith("/sub_issues")) {
          return Promise.resolve(jsonResponse({ number: 3, title: "parent", state: "open", body: null, labels: [] }));
        }
        throw new Error(`unexpected call: ${url}`);
      }),
    );

    // When
    const result = await createSubIssueTool.handler(context(), {
      parent_number: 3,
      title: "a sub-issue",
      body: "sub body",
    });

    // Then
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload).toEqual({
      number: 10,
      title: "a sub-issue",
      state: "open",
      body: "sub body",
      labels: [],
      repo: "joachimwedin/gh-issues-mcp",
    });
  });

  it("Given a second allowlisted repo, When create_sub_issue is called with that repo explicitly, Then it calls GitHub for that repo for both parent and child and tags the result with it", async () => {
    // Given
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith("/issues/4") && (init?.method ?? "GET") === "GET") {
        return Promise.resolve(jsonResponse({ id: 2, number: 4, title: "other parent", state: "open", body: null, labels: [] }));
      }
      if (url.endsWith("/issues") && init?.method === "POST") {
        return Promise.resolve(
          jsonResponse({ id: 777, number: 20, title: "other sub-issue", state: "open", body: "sub body", labels: [] }),
        );
      }
      if (url.endsWith("/sub_issues")) {
        return Promise.resolve(jsonResponse({ number: 4, title: "other parent", state: "open", body: null, labels: [] }));
      }
      throw new Error(`unexpected call: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    // When
    const result = await createSubIssueTool.handler(context(), {
      repo: "joachimwedin/other-repo",
      parent_number: 4,
      title: "other sub-issue",
      body: "sub body",
    });

    // Then
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload).toMatchObject({ number: 20, repo: "joachimwedin/other-repo" });
    for (const [calledUrl] of fetchMock.mock.calls as [string][]) {
      expect(calledUrl).toContain("/repos/joachimwedin/other-repo/issues");
    }
  });

  it("Given a repo outside the configured allowlist, When create_sub_issue is called with that repo, Then it returns an error result without calling GitHub", async () => {
    // Given
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    // When
    const result = await createSubIssueTool.handler(context(), {
      repo: "someone-else/unrelated-repo",
      parent_number: 3,
      title: "a sub-issue",
      body: "sub body",
    });

    // Then
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("someone-else/unrelated-repo");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Given the parent exists and GitHub accepts the new issue, When create_sub_issue is called, Then it appends a successful entry with the resolved repo to the audit log with the parent number, title, and body as args", async () => {
    // Given
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.endsWith("/issues/3") && (init?.method ?? "GET") === "GET") {
          return Promise.resolve(jsonResponse({ id: 1, number: 3, title: "parent", state: "open", body: null, labels: [] }));
        }
        if (url.endsWith("/issues") && init?.method === "POST") {
          return Promise.resolve(
            jsonResponse({ id: 555, number: 10, title: "a sub-issue", state: "open", body: "sub body", labels: [] }),
          );
        }
        if (url.endsWith("/sub_issues")) {
          return Promise.resolve(jsonResponse({ number: 3, title: "parent", state: "open", body: null, labels: [] }));
        }
        throw new Error(`unexpected call: ${url}`);
      }),
    );
    const ctx = context();

    // When
    await createSubIssueTool.handler(ctx, { parent_number: 3, title: "a sub-issue", body: "sub body" });

    // Then
    const entry = JSON.parse(readFileSync(ctx.auditLogPath, "utf8").trim());
    expect(entry).toMatchObject({
      tool: "create_sub_issue",
      args: { parent_number: 3, title: "a sub-issue", body: "sub body" },
      success: true,
      githubStatus: 200,
      repo: "joachimwedin/gh-issues-mcp",
    });
  });

  it("Given the parent doesn't exist, When create_sub_issue is called, Then it returns the real GitHub status and message as an error result and creates no issue", async () => {
    // Given
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "Not Found" }, 404));
    vi.stubGlobal("fetch", fetchMock);

    // When
    const result = await createSubIssueTool.handler(context(), {
      parent_number: 999,
      title: "a sub-issue",
      body: "sub body",
    });

    // Then
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("404");
    expect((result.content[0] as { text: string }).text).toContain("Not Found");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("Given GitHub rejects the new issue, When create_sub_issue is called, Then it appends a failed entry with the GitHub status to the audit log", async () => {
    // Given
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: "Validation Failed" }, 422)));
    const ctx = context();

    // When
    await createSubIssueTool.handler(ctx, { parent_number: 3, title: "a sub-issue", body: "sub body" });

    // Then
    const entry = JSON.parse(readFileSync(ctx.auditLogPath, "utf8").trim());
    expect(entry).toMatchObject({ tool: "create_sub_issue", success: false, githubStatus: 422 });
  });
});
