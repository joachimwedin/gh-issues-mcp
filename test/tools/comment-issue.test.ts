import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commentIssueTool } from "../../src/tools/comment-issue.js";
import type { McpToolContext } from "../../src/tools/context.js";

const repos = [{ repo: "joachimwedin/gh-issues-mcp" }, { repo: "joachimwedin/other-repo" }];
const defaultRepo = "joachimwedin/gh-issues-mcp";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("commentIssueHandler", () => {
  let dir: string;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function context(): McpToolContext {
    dir = mkdtempSync(join(tmpdir(), "gh-issues-mcp-comment-issue-test-"));
    return { token: "test-token", repos, defaultRepo, auditLogPath: join(dir, "audit.log") };
  }

  it("Given GitHub accepts the comment, When comment_issue is called with no repo, Then it posts the comment and returns it tagged with the default repo", async () => {
    // Given
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ body: "a comment" }))));

    // When
    const result = await commentIssueTool.handler(context(), { number: 3, body: "a comment" });

    // Then
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload).toEqual({ body: "a comment", repo: "joachimwedin/gh-issues-mcp" });
  });

  it("Given a second allowlisted repo, When comment_issue is called with that repo explicitly, Then it calls GitHub for that repo and tags the result with it", async () => {
    // Given
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ body: "a comment" }));
    vi.stubGlobal("fetch", fetchMock);

    // When
    const result = await commentIssueTool.handler(context(), {
      repo: "joachimwedin/other-repo",
      number: 3,
      body: "a comment",
    });

    // Then
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload).toEqual({ body: "a comment", repo: "joachimwedin/other-repo" });
    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    expect(calledUrl).toContain("/repos/joachimwedin/other-repo/issues");
  });

  it("Given a repo outside the configured allowlist, When comment_issue is called with that repo, Then it returns an error result without calling GitHub", async () => {
    // Given
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    // When
    const result = await commentIssueTool.handler(context(), {
      repo: "someone-else/unrelated-repo",
      number: 3,
      body: "a comment",
    });

    // Then
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("someone-else/unrelated-repo");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Given GitHub accepts the comment, When comment_issue is called, Then it appends a successful entry with the resolved repo to the audit log with the number and body as args", async () => {
    // Given
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ body: "a comment" }))));
    const ctx = context();

    // When
    await commentIssueTool.handler(ctx, { number: 3, body: "a comment" });

    // Then
    const entry = JSON.parse(readFileSync(ctx.auditLogPath, "utf8").trim());
    expect(entry).toMatchObject({
      tool: "comment_issue",
      args: { number: 3, body: "a comment" },
      success: true,
      githubStatus: 200,
      repo: "joachimwedin/gh-issues-mcp",
    });
  });

  it("Given the issue doesn't exist, When comment_issue is called, Then it returns the real GitHub status and message as an error result", async () => {
    // Given
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ message: "Not Found" }, 404))),
    );

    // When
    const result = await commentIssueTool.handler(context(), { number: 999, body: "a comment" });

    // Then
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("404");
    expect((result.content[0] as { text: string }).text).toContain("Not Found");
  });

  it("Given the issue doesn't exist, When comment_issue is called, Then it appends a failed entry with the GitHub status to the audit log", async () => {
    // Given
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ message: "Not Found" }, 404))),
    );
    const ctx = context();

    // When
    await commentIssueTool.handler(ctx, { number: 999, body: "a comment" });

    // Then
    const entry = JSON.parse(readFileSync(ctx.auditLogPath, "utf8").trim());
    expect(entry).toMatchObject({ tool: "comment_issue", success: false, githubStatus: 404 });
  });
});
