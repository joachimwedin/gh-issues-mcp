import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { closeIssueTool, closeIssueInputSchema } from "../../src/tools/close-issue.js";
import type { McpToolContext } from "../../src/tools/context.js";

const repos = [{ repo: "joachimwedin/gh-issues-mcp" }, { repo: "joachimwedin/other-repo" }];
const defaultRepo = "joachimwedin/gh-issues-mcp";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("closeIssueHandler", () => {
  let dir: string;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function context(): McpToolContext {
    dir = mkdtempSync(join(tmpdir(), "gh-issues-mcp-close-issue-test-"));
    return { token: "test-token", repos, defaultRepo, auditLogPath: join(dir, "audit.log") };
  }

  it("Given GitHub accepts the comment and close, When close_issue is called with no repo, Then it posts the comment, closes the issue, and returns the updated issue tagged with the default repo", async () => {
    // Given
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.endsWith("/comments")) return Promise.resolve(jsonResponse({ body: "closing this out" }));
        if (init?.method === "PATCH") {
          return Promise.resolve(
            jsonResponse({ number: 3, title: "an issue", state: "closed", body: "body", labels: [] }),
          );
        }
        throw new Error(`unexpected call: ${url}`);
      }),
    );

    // When
    const result = await closeIssueTool.handler(context(), { number: 3, comment: "closing this out" });

    // Then
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload).toEqual({
      number: 3,
      title: "an issue",
      state: "closed",
      body: "body",
      labels: [],
      repo: "joachimwedin/gh-issues-mcp",
    });
  });

  it("Given a second allowlisted repo, When close_issue is called with that repo explicitly, Then it calls GitHub for that repo and tags the result with it", async () => {
    // Given
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith("/comments")) return Promise.resolve(jsonResponse({ body: "closing" }));
      if (init?.method === "PATCH") {
        return Promise.resolve(jsonResponse({ number: 7, title: "other", state: "closed", body: null, labels: [] }));
      }
      throw new Error(`unexpected call: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    // When
    const result = await closeIssueTool.handler(context(), {
      repo: "joachimwedin/other-repo",
      number: 7,
      comment: "closing",
    });

    // Then
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload).toMatchObject({ number: 7, repo: "joachimwedin/other-repo" });
    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    expect(calledUrl).toContain("/repos/joachimwedin/other-repo/issues");
  });

  it("Given a repo outside the configured allowlist, When close_issue is called with that repo, Then it returns an error result without calling GitHub", async () => {
    // Given
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    // When
    const result = await closeIssueTool.handler(context(), {
      repo: "someone-else/unrelated-repo",
      number: 3,
      comment: "closing",
    });

    // Then
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("someone-else/unrelated-repo");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Given GitHub accepts the comment and close, When close_issue is called, Then it appends a successful entry with the resolved repo to the audit log with the number and comment as args", async () => {
    // Given
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.endsWith("/comments")) return Promise.resolve(jsonResponse({ body: "closing" }));
        if (init?.method === "PATCH") {
          return Promise.resolve(jsonResponse({ number: 3, title: "t", state: "closed", body: null, labels: [] }));
        }
        throw new Error(`unexpected call: ${url}`);
      }),
    );
    const ctx = context();

    // When
    await closeIssueTool.handler(ctx, { number: 3, comment: "closing" });

    // Then
    const entry = JSON.parse(readFileSync(ctx.auditLogPath, "utf8").trim());
    expect(entry).toMatchObject({
      tool: "close_issue",
      args: { number: 3, comment: "closing" },
      success: true,
      githubStatus: 200,
      repo: "joachimwedin/gh-issues-mcp",
    });
  });

  it("Given the issue doesn't exist, When close_issue is called, Then it returns the real GitHub status and message as an error result", async () => {
    // Given
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ message: "Not Found" }, 404))),
    );

    // When
    const result = await closeIssueTool.handler(context(), { number: 999, comment: "closing" });

    // Then
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("404");
    expect((result.content[0] as { text: string }).text).toContain("Not Found");
  });

  it("Given the issue doesn't exist, When close_issue is called, Then it appends a failed entry with the GitHub status to the audit log", async () => {
    // Given
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ message: "Not Found" }, 404))),
    );
    const ctx = context();

    // When
    await closeIssueTool.handler(ctx, { number: 999, comment: "closing" });

    // Then
    const entry = JSON.parse(readFileSync(ctx.auditLogPath, "utf8").trim());
    expect(entry).toMatchObject({ tool: "close_issue", success: false, githubStatus: 404 });
  });

  it("Given an input missing the comment field, When the schema validates it, Then it rejects the input at the schema level, not via a runtime check", () => {
    // Given
    const schema = z.object(closeIssueInputSchema);

    // When
    const result = schema.safeParse({ number: 3 });

    // Then
    expect(result.success).toBe(false);
  });
});
