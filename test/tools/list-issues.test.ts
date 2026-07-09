import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listIssuesTool } from "../../src/tools/list-issues.js";
import type { McpToolContext } from "../../src/tools/context.js";

const repos = [{ repo: "joachimwedin/gh-issues-mcp" }, { repo: "joachimwedin/other-repo" }];
const defaultRepo = "joachimwedin/gh-issues-mcp";

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

  function context(): McpToolContext {
    dir = mkdtempSync(join(tmpdir(), "gh-issues-mcp-list-issues-test-"));
    return { token: "test-token", repos, defaultRepo, auditLogPath: join(dir, "audit.log") };
  }

  it("Given GitHub returns matching issues, When list_issues is called with no repo, Then it returns them tagged with the default repo", async () => {
    // Given
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse([
          { number: 3, title: "an issue", state: "open", body: "body", labels: [{ name: "ready-for-agent" }] },
        ]),
      ),
    );

    // When
    const result = await listIssuesTool.handler(context(), {});

    // Then
    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload).toEqual([
      {
        number: 3,
        title: "an issue",
        state: "open",
        body: "body",
        labels: ["ready-for-agent"],
        repo: "joachimwedin/gh-issues-mcp",
      },
    ]);
  });

  it("Given a second allowlisted repo, When list_issues is called with that repo explicitly, Then it calls GitHub for that repo and tags the result with it", async () => {
    // Given
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([{ number: 7, title: "other", state: "open", body: null, labels: [] }]));
    vi.stubGlobal("fetch", fetchMock);

    // When
    const result = await listIssuesTool.handler(context(), { repo: "joachimwedin/other-repo" });

    // Then
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload).toEqual([
      { number: 7, title: "other", state: "open", body: null, labels: [], repo: "joachimwedin/other-repo" },
    ]);
    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    expect(calledUrl).toContain("/repos/joachimwedin/other-repo/issues");
  });

  it("Given a repo outside the configured allowlist, When list_issues is called with that repo, Then it returns an error result without calling GitHub", async () => {
    // Given
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    // When
    const result = await listIssuesTool.handler(context(), { repo: "someone-else/unrelated-repo" });

    // Then
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("someone-else/unrelated-repo");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Given GitHub accepts the request, When list_issues is called with state and labels filters, Then it appends a successful entry with the resolved repo to the audit log", async () => {
    // Given
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));
    const ctx = context();

    // When
    await listIssuesTool.handler(ctx, { state: "open", labels: ["bug"] });

    // Then
    const entry = JSON.parse(readFileSync(ctx.auditLogPath, "utf8").trim());
    expect(entry).toMatchObject({
      tool: "list_issues",
      args: { state: "open", labels: ["bug"] },
      success: true,
      repo: "joachimwedin/gh-issues-mcp",
    });
    expect(typeof entry.timestamp).toBe("string");
  });

  it("Given GitHub rejects the request, When list_issues is called, Then it returns the real GitHub status and message as an error result, without throwing", async () => {
    // Given
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: "Bad credentials" }, 401)));

    // When
    const result = await listIssuesTool.handler(context(), {});

    // Then
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("401");
    expect((result.content[0] as { text: string }).text).toContain("Bad credentials");
  });

  it("Given GitHub rejects the request, When list_issues is called, Then it appends a failed entry with the GitHub status to the audit log", async () => {
    // Given
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: "Bad credentials" }, 401)));
    const ctx = context();

    // When
    await listIssuesTool.handler(ctx, {});

    // Then
    const entry = JSON.parse(readFileSync(ctx.auditLogPath, "utf8").trim());
    expect(entry).toMatchObject({ tool: "list_issues", success: false, githubStatus: 401 });
  });
});
