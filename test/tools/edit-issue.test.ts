import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { editIssueTool } from "../../src/tools/edit-issue.js";

const token = "test-token";
const repos = [
  {
    repo: "joachimwedin/gh-issues-mcp",
    labelVocabulary: ["needs-triage", "needs-info", "ready-for-agent", "ready-for-human", "wontfix"],
  },
];
const defaultRepo = "joachimwedin/gh-issues-mcp";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("editIssueHandler", () => {
  let dir: string;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function auditLogPath(): string {
    dir = mkdtempSync(join(tmpdir(), "gh-issues-mcp-edit-issue-test-"));
    return join(dir, "audit.log");
  }

  it("Given GitHub accepts the update, When edit_issue is called with a new title, Then it updates the issue's title and returns it as tool content", async () => {
    // Given
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.endsWith("/issues/3") && init?.method === "PATCH") {
          return Promise.resolve(
            jsonResponse({ number: 3, title: "an updated title", state: "open", body: "original body", labels: [] }),
          );
        }
        throw new Error(`unexpected call: ${url}`);
      }),
    );
    const auditLog = auditLogPath();

    // When
    const result = await editIssueTool.handler(
      { token, repos, defaultRepo, auditLogPath: auditLog },
      { number: 3, title: "an updated title" },
    );

    // Then
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload).toEqual({ number: 3, title: "an updated title", state: "open", body: "original body", labels: [] });
  });

  it("Given GitHub accepts the update, When edit_issue is called with a new title, Then it appends a successful entry to the audit log with the number and given fields as args", async () => {
    // Given
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ number: 3, title: "an updated title", state: "open", body: "original body", labels: [] }),
      ),
    );
    const auditLog = auditLogPath();

    // When
    await editIssueTool.handler(
      { token, repos, defaultRepo, auditLogPath: auditLog },
      { number: 3, title: "an updated title" },
    );

    // Then
    const entry = JSON.parse(readFileSync(auditLog, "utf8").trim());
    expect(entry).toMatchObject({
      tool: "edit_issue",
      args: { number: 3, title: "an updated title" },
      success: true,
      githubStatus: 200,
    });
  });

  it("Given a call with neither title nor body, When edit_issue is called, Then it rejects the call without making any GitHub API call", async () => {
    // Given
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const auditLog = auditLogPath();

    // When
    const result = await editIssueTool.handler(
      { token, repos, defaultRepo, auditLogPath: auditLog },
      { number: 3 },
    );

    // Then
    expect(result.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Given GitHub rejects the update, When edit_issue is called, Then it returns the real GitHub status and message as an error result", async () => {
    // Given
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ message: "Not Found" }, 404)),
    );
    const auditLog = auditLogPath();

    // When
    const result = await editIssueTool.handler(
      { token, repos, defaultRepo, auditLogPath: auditLog },
      { number: 999, title: "title" },
    );

    // Then
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("404");
    expect((result.content[0] as { text: string }).text).toContain("Not Found");
  });
});
