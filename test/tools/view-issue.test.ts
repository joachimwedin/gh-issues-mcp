import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { viewIssueTool } from "../../src/tools/view-issue.js";

const token = "test-token";
const repos = [{ repo: "joachimwedin/gh-issues-mcp" }];
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

  function auditLogPath(): string {
    dir = mkdtempSync(join(tmpdir(), "gh-issues-mcp-view-issue-test-"));
    return join(dir, "audit.log");
  }

  it("Given GitHub returns the issue and its comments, When view_issue is called, Then it returns the issue's body, labels, and comment history as tool content", async () => {
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
    const auditLog = auditLogPath();

    // When
    const result = await viewIssueTool.handler({ token, repos, defaultRepo, auditLogPath: auditLog }, { number: 3 });

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
    });
  });

  it("Given GitHub accepts the request, When view_issue is called, Then it appends a successful entry to the audit log with the issue number as args", async () => {
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
    const auditLog = auditLogPath();

    // When
    await viewIssueTool.handler({ token, repos, defaultRepo, auditLogPath: auditLog }, { number: 3 });

    // Then
    const entry = JSON.parse(readFileSync(auditLog, "utf8").trim());
    expect(entry).toMatchObject({ tool: "view_issue", args: { number: 3 }, success: true, githubStatus: 200 });
  });

  it("Given the issue doesn't exist, When view_issue is called, Then it returns the real GitHub status and message as an error result", async () => {
    // Given
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ message: "Not Found" }, 404))));
    const auditLog = auditLogPath();

    // When
    const result = await viewIssueTool.handler({ token, repos, defaultRepo, auditLogPath: auditLog }, { number: 999 });

    // Then
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("404");
    expect((result.content[0] as { text: string }).text).toContain("Not Found");
  });

  it("Given the issue doesn't exist, When view_issue is called, Then it appends a failed entry with the GitHub status to the audit log", async () => {
    // Given
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ message: "Not Found" }, 404))));
    const auditLog = auditLogPath();

    // When
    await viewIssueTool.handler({ token, repos, defaultRepo, auditLogPath: auditLog }, { number: 999 });

    // Then
    const entry = JSON.parse(readFileSync(auditLog, "utf8").trim());
    expect(entry).toMatchObject({ tool: "view_issue", args: { number: 999 }, success: false, githubStatus: 404 });
  });
});
