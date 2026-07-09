import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { closeIssueTool, closeIssueInputSchema } from "../../src/tools/close-issue.js";

const github = { owner: "joachimwedin", repo: "gh-issues-mcp", token: "test-token" };

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

  function auditLogPath(): string {
    dir = mkdtempSync(join(tmpdir(), "gh-issues-mcp-close-issue-test-"));
    return join(dir, "audit.log");
  }

  it("posts the comment, closes the issue, and returns the updated issue as tool content", async () => {
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
    const auditLog = auditLogPath();

    const result = await closeIssueTool.handler(
      { github, auditLogPath: auditLog },
      { number: 3, comment: "closing this out" },
    );

    expect(result.isError).toBeUndefined();
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload).toEqual({ number: 3, title: "an issue", state: "closed", body: "body", labels: [] });
  });

  it("appends a successful entry to the audit log with the number and comment as args", async () => {
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
    const auditLog = auditLogPath();

    await closeIssueTool.handler({ github, auditLogPath: auditLog }, { number: 3, comment: "closing" });

    const entry = JSON.parse(readFileSync(auditLog, "utf8").trim());
    expect(entry).toMatchObject({
      tool: "close_issue",
      args: { number: 3, comment: "closing" },
      success: true,
      githubStatus: 200,
    });
  });

  it("returns the real GitHub status and message as an error result when the issue doesn't exist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ message: "Not Found" }, 404))),
    );
    const auditLog = auditLogPath();

    const result = await closeIssueTool.handler({ github, auditLogPath: auditLog }, { number: 999, comment: "closing" });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("404");
    expect((result.content[0] as { text: string }).text).toContain("Not Found");
  });

  it("appends a failed entry with the GitHub status to the audit log on error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ message: "Not Found" }, 404))),
    );
    const auditLog = auditLogPath();

    await closeIssueTool.handler({ github, auditLogPath: auditLog }, { number: 999, comment: "closing" });

    const entry = JSON.parse(readFileSync(auditLog, "utf8").trim());
    expect(entry).toMatchObject({ tool: "close_issue", success: false, githubStatus: 404 });
  });

  it("rejects a missing comment at the schema level, not via a runtime check", () => {
    const schema = z.object(closeIssueInputSchema);

    const result = schema.safeParse({ number: 3 });

    expect(result.success).toBe(false);
  });
});
