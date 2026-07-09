import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commentIssueTool } from "../../src/tools/comment-issue.js";

const github = { owner: "joachimwedin", repo: "gh-issues-mcp", token: "test-token" };

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

  function auditLogPath(): string {
    dir = mkdtempSync(join(tmpdir(), "gh-issues-mcp-comment-issue-test-"));
    return join(dir, "audit.log");
  }

  it("Given GitHub accepts the comment, When comment_issue is called, Then it posts the comment and returns it as tool content", async () => {
    // Given
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ body: "a comment" }))));
    const auditLog = auditLogPath();

    // When
    const result = await commentIssueTool.handler({ github, auditLogPath: auditLog }, { number: 3, body: "a comment" });

    // Then
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload).toEqual({ body: "a comment" });
  });

  it("Given GitHub accepts the comment, When comment_issue is called, Then it appends a successful entry to the audit log with the number and body as args", async () => {
    // Given
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ body: "a comment" }))));
    const auditLog = auditLogPath();

    // When
    await commentIssueTool.handler({ github, auditLogPath: auditLog }, { number: 3, body: "a comment" });

    // Then
    const entry = JSON.parse(readFileSync(auditLog, "utf8").trim());
    expect(entry).toMatchObject({
      tool: "comment_issue",
      args: { number: 3, body: "a comment" },
      success: true,
      githubStatus: 200,
    });
  });

  it("Given the issue doesn't exist, When comment_issue is called, Then it returns the real GitHub status and message as an error result", async () => {
    // Given
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ message: "Not Found" }, 404))),
    );
    const auditLog = auditLogPath();

    // When
    const result = await commentIssueTool.handler({ github, auditLogPath: auditLog }, { number: 999, body: "a comment" });

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
    const auditLog = auditLogPath();

    // When
    await commentIssueTool.handler({ github, auditLogPath: auditLog }, { number: 999, body: "a comment" });

    // Then
    const entry = JSON.parse(readFileSync(auditLog, "utf8").trim());
    expect(entry).toMatchObject({ tool: "comment_issue", success: false, githubStatus: 404 });
  });
});
