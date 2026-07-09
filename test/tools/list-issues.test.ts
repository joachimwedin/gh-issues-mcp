import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listIssuesTool } from "../../src/tools/list-issues.js";

const github = { owner: "joachimwedin", repo: "gh-issues-mcp", token: "test-token" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("listIssuesHandler", () => {
  let dir: string;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function auditLogPath(): string {
    dir = mkdtempSync(join(tmpdir(), "gh-issues-mcp-list-issues-test-"));
    return join(dir, "audit.log");
  }

  it("Given GitHub returns matching issues, When list_issues is called, Then it returns them as tool content", async () => {
    // Given
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse([
          { number: 3, title: "an issue", state: "open", body: "body", labels: [{ name: "ready-for-agent" }] },
        ]),
      ),
    );
    const auditLog = auditLogPath();

    // When
    const result = await listIssuesTool.handler({ github, auditLogPath: auditLog }, {});

    // Then
    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload).toEqual([
      { number: 3, title: "an issue", state: "open", body: "body", labels: ["ready-for-agent"] },
    ]);
  });

  it("Given GitHub accepts the request, When list_issues is called with state and labels filters, Then it appends a successful entry to the audit log", async () => {
    // Given
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));
    const auditLog = auditLogPath();

    // When
    await listIssuesTool.handler({ github, auditLogPath: auditLog }, { state: "open", labels: ["bug"] });

    // Then
    const entry = JSON.parse(readFileSync(auditLog, "utf8").trim());
    expect(entry).toMatchObject({
      tool: "list_issues",
      args: { state: "open", labels: ["bug"] },
      success: true,
    });
    expect(typeof entry.timestamp).toBe("string");
  });

  it("Given GitHub rejects the request, When list_issues is called, Then it returns the real GitHub status and message as an error result, without throwing", async () => {
    // Given
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: "Bad credentials" }, 401)));
    const auditLog = auditLogPath();

    // When
    const result = await listIssuesTool.handler({ github, auditLogPath: auditLog }, {});

    // Then
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("401");
    expect((result.content[0] as { text: string }).text).toContain("Bad credentials");
  });

  it("Given GitHub rejects the request, When list_issues is called, Then it appends a failed entry with the GitHub status to the audit log", async () => {
    // Given
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: "Bad credentials" }, 401)));
    const auditLog = auditLogPath();

    // When
    await listIssuesTool.handler({ github, auditLogPath: auditLog }, {});

    // Then
    const entry = JSON.parse(readFileSync(auditLog, "utf8").trim());
    expect(entry).toMatchObject({ tool: "list_issues", success: false, githubStatus: 401 });
  });
});
