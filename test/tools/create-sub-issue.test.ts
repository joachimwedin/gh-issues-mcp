import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSubIssueHandler } from "../../src/tools/create-sub-issue.js";

const github = { owner: "joachimwedin", repo: "gh-issues-mcp", token: "test-token" };

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

  function auditLogPath(): string {
    dir = mkdtempSync(join(tmpdir(), "gh-issues-mcp-create-sub-issue-test-"));
    return join(dir, "audit.log");
  }

  it("creates the sub-issue and returns it as tool content", async () => {
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
    const auditLog = auditLogPath();

    const result = await createSubIssueHandler(
      { github, auditLogPath: auditLog },
      { parent_number: 3, title: "a sub-issue", body: "sub body" },
    );

    expect(result.isError).toBeUndefined();
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload).toEqual({ number: 10, title: "a sub-issue", state: "open", body: "sub body", labels: [] });
  });

  it("appends a successful entry to the audit log with the parent number, title, and body as args", async () => {
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
    const auditLog = auditLogPath();

    await createSubIssueHandler(
      { github, auditLogPath: auditLog },
      { parent_number: 3, title: "a sub-issue", body: "sub body" },
    );

    const entry = JSON.parse(readFileSync(auditLog, "utf8").trim());
    expect(entry).toMatchObject({
      tool: "create_sub_issue",
      args: { parent_number: 3, title: "a sub-issue", body: "sub body" },
      success: true,
      githubStatus: 200,
    });
  });

  it("returns the real GitHub status and message as an error result and creates no issue when the parent doesn't exist", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "Not Found" }, 404));
    vi.stubGlobal("fetch", fetchMock);
    const auditLog = auditLogPath();

    const result = await createSubIssueHandler(
      { github, auditLogPath: auditLog },
      { parent_number: 999, title: "a sub-issue", body: "sub body" },
    );

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("404");
    expect((result.content[0] as { text: string }).text).toContain("Not Found");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("appends a failed entry with the GitHub status to the audit log on error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: "Validation Failed" }, 422)));
    const auditLog = auditLogPath();

    await createSubIssueHandler(
      { github, auditLogPath: auditLog },
      { parent_number: 3, title: "a sub-issue", body: "sub body" },
    );

    const entry = JSON.parse(readFileSync(auditLog, "utf8").trim());
    expect(entry).toMatchObject({ tool: "create_sub_issue", success: false, githubStatus: 422 });
  });
});
