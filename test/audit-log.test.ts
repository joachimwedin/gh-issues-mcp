import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendAuditLog } from "../src/audit-log.js";

describe("appendAuditLog", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function logPath(): string {
    dir = mkdtempSync(join(tmpdir(), "gh-issues-mcp-audit-test-"));
    return join(dir, "nested", "audit.log");
  }

  it("appends a JSON line with timestamp, tool, args, success, and githubStatus", () => {
    const path = logPath();

    appendAuditLog(path, {
      timestamp: "2026-07-08T12:00:00.000Z",
      tool: "list_issues",
      args: { state: "open" },
      success: true,
      githubStatus: 200,
    });

    const lines = readFileSync(path, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual({
      timestamp: "2026-07-08T12:00:00.000Z",
      tool: "list_issues",
      args: { state: "open" },
      success: true,
      githubStatus: 200,
    });
  });

  it("creates the parent directory if it doesn't exist yet", () => {
    const path = logPath();

    expect(() =>
      appendAuditLog(path, {
        timestamp: "2026-07-08T12:00:00.000Z",
        tool: "view_issue",
        args: { number: 3 },
        success: true,
      }),
    ).not.toThrow();
  });

  it("appends subsequent calls as additional lines rather than overwriting", () => {
    const path = logPath();

    appendAuditLog(path, {
      timestamp: "2026-07-08T12:00:00.000Z",
      tool: "list_issues",
      args: {},
      success: true,
    });
    appendAuditLog(path, {
      timestamp: "2026-07-08T12:00:01.000Z",
      tool: "view_issue",
      args: { number: 3 },
      success: false,
      githubStatus: 404,
    });

    const lines = readFileSync(path, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1])).toMatchObject({ tool: "view_issue", success: false, githubStatus: 404 });
  });
});
