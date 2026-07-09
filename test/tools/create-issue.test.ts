import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createIssueTool } from "../../src/tools/create-issue.js";

const github = { owner: "joachimwedin", repo: "gh-issues-mcp", token: "test-token" };
const labelVocabulary = ["needs-triage", "needs-info", "ready-for-agent", "ready-for-human", "wontfix"];

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

  it("creates the issue and returns it as tool content", async () => {
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

    const result = await createIssueTool.handler(
      { github, auditLogPath: auditLog, labelVocabulary },
      { title: "a new issue", body: "issue body" },
    );

    expect(result.isError).toBeUndefined();
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload).toEqual({ number: 11, title: "a new issue", state: "open", body: "issue body", labels: [] });
  });

  it("appends a successful entry to the audit log with the title, body, and labels as args", async () => {
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

    await createIssueTool.handler(
      { github, auditLogPath: auditLog, labelVocabulary },
      { title: "a new issue", body: "issue body", labels: ["ready-for-agent"] },
    );

    const entry = JSON.parse(readFileSync(auditLog, "utf8").trim());
    expect(entry).toMatchObject({
      tool: "create_issue",
      args: { title: "a new issue", body: "issue body", labels: ["ready-for-agent"] },
      success: true,
      githubStatus: 200,
    });
  });

  it("rejects a label outside the configured vocabulary without making any GitHub API call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const auditLog = auditLogPath();

    const result = await createIssueTool.handler(
      { github, auditLogPath: auditLog, labelVocabulary },
      { title: "a new issue", body: "issue body", labels: ["typo-label"] },
    );

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("typo-label");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the real GitHub status and message as an error result on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ message: "Validation Failed" }, 422)),
    );
    const auditLog = auditLogPath();

    const result = await createIssueTool.handler(
      { github, auditLogPath: auditLog, labelVocabulary },
      { title: "a new issue", body: "issue body" },
    );

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("422");
    expect((result.content[0] as { text: string }).text).toContain("Validation Failed");
  });
});
