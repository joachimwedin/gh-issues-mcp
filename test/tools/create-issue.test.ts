import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createIssueTool } from "../../src/tools/create-issue.js";

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

describe("createIssueHandler", () => {
  let dir: string;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function auditLogPath(): string {
    dir = mkdtempSync(join(tmpdir(), "gh-issues-mcp-create-issue-test-"));
    return join(dir, "audit.log");
  }

  it("Given GitHub accepts the new issue, When create_issue is called, Then it returns the created issue as tool content", async () => {
    // Given
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.endsWith("/issues") && init?.method === "POST") {
          return Promise.resolve(
            jsonResponse({ id: 42, number: 11, title: "a new issue", state: "open", body: "issue body", labels: [] }),
          );
        }
        throw new Error(`unexpected call: ${url}`);
      }),
    );
    const auditLog = auditLogPath();

    // When
    const result = await createIssueTool.handler(
      { token, repos, defaultRepo, auditLogPath: auditLog },
      { title: "a new issue", body: "issue body" },
    );

    // Then
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload).toEqual({ number: 11, title: "a new issue", state: "open", body: "issue body", labels: [] });
  });

  it("Given GitHub accepts the new issue, When create_issue is called with labels, Then it appends a successful entry to the audit log with the title, body, and labels as args", async () => {
    // Given
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          id: 42,
          number: 11,
          title: "a new issue",
          state: "open",
          body: "issue body",
          labels: [{ name: "ready-for-agent" }],
        }),
      ),
    );
    const auditLog = auditLogPath();

    // When
    await createIssueTool.handler(
      { token, repos, defaultRepo, auditLogPath: auditLog },
      { title: "a new issue", body: "issue body", labels: ["ready-for-agent"] },
    );

    // Then
    const entry = JSON.parse(readFileSync(auditLog, "utf8").trim());
    expect(entry).toMatchObject({
      tool: "create_issue",
      args: { title: "a new issue", body: "issue body", labels: ["ready-for-agent"] },
      success: true,
      githubStatus: 200,
    });
  });

  it("Given a label outside the configured vocabulary, When create_issue is called, Then it returns an error and does not call the GitHub API", async () => {
    // Given
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const auditLog = auditLogPath();

    // When
    const result = await createIssueTool.handler(
      { token, repos, defaultRepo, auditLogPath: auditLog },
      { title: "a new issue", body: "issue body", labels: ["typo-label"] },
    );

    // Then
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("typo-label");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Given GitHub rejects the new issue, When create_issue is called, Then it returns the real GitHub status and message as an error result", async () => {
    // Given
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ message: "Validation Failed" }, 422)),
    );
    const auditLog = auditLogPath();

    // When
    const result = await createIssueTool.handler(
      { token, repos, defaultRepo, auditLogPath: auditLog },
      { title: "a new issue", body: "issue body" },
    );

    // Then
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("422");
    expect((result.content[0] as { text: string }).text).toContain("Validation Failed");
  });
});
