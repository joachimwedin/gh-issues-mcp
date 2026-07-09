import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { editIssueTool } from "../../src/tools/edit-issue.js";
import type { McpToolContext } from "../../src/tools/context.js";

const repos = [
  {
    repo: "joachimwedin/gh-issues-mcp",
    labelVocabulary: ["needs-triage", "needs-info", "ready-for-agent", "ready-for-human", "wontfix"],
  },
  { repo: "joachimwedin/other-repo" },
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

  function context(): McpToolContext {
    dir = mkdtempSync(join(tmpdir(), "gh-issues-mcp-edit-issue-test-"));
    return { token: "test-token", repos, defaultRepo, auditLogPath: join(dir, "audit.log") };
  }

  it("Given GitHub accepts the update, When edit_issue is called with a new title and no repo, Then it updates the issue's title and returns it tagged with the default repo", async () => {
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

    // When
    const result = await editIssueTool.handler(context(), { number: 3, title: "an updated title" });

    // Then
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload).toEqual({
      number: 3,
      title: "an updated title",
      state: "open",
      body: "original body",
      labels: [],
      repo: "joachimwedin/gh-issues-mcp",
    });
  });

  it("Given a second allowlisted repo, When edit_issue is called with that repo explicitly, Then it calls GitHub for that repo and tags the result with it", async () => {
    // Given
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith("/issues/7") && init?.method === "PATCH") {
        return Promise.resolve(jsonResponse({ number: 7, title: "updated", state: "open", body: null, labels: [] }));
      }
      throw new Error(`unexpected call: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    // When
    const result = await editIssueTool.handler(context(), {
      repo: "joachimwedin/other-repo",
      number: 7,
      title: "updated",
    });

    // Then
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload).toMatchObject({ number: 7, repo: "joachimwedin/other-repo" });
    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    expect(calledUrl).toContain("/repos/joachimwedin/other-repo/issues");
  });

  it("Given a repo outside the configured allowlist, When edit_issue is called with that repo, Then it returns an error result without calling GitHub", async () => {
    // Given
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    // When
    const result = await editIssueTool.handler(context(), {
      repo: "someone-else/unrelated-repo",
      number: 3,
      title: "updated",
    });

    // Then
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("someone-else/unrelated-repo");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Given GitHub accepts the update, When edit_issue is called with a new title, Then it appends a successful entry with the resolved repo to the audit log with the number and given fields as args", async () => {
    // Given
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ number: 3, title: "an updated title", state: "open", body: "original body", labels: [] }),
      ),
    );
    const ctx = context();

    // When
    await editIssueTool.handler(ctx, { number: 3, title: "an updated title" });

    // Then
    const entry = JSON.parse(readFileSync(ctx.auditLogPath, "utf8").trim());
    expect(entry).toMatchObject({
      tool: "edit_issue",
      args: { number: 3, title: "an updated title" },
      success: true,
      githubStatus: 200,
      repo: "joachimwedin/gh-issues-mcp",
    });
  });

  it("Given a call with neither title nor body, When edit_issue is called, Then it rejects the call without making any GitHub API call", async () => {
    // Given
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    // When
    const result = await editIssueTool.handler(context(), { number: 3 });

    // Then
    expect(result.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Given GitHub rejects the update, When edit_issue is called, Then it returns the real GitHub status and message as an error result", async () => {
    // Given
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: "Not Found" }, 404)));

    // When
    const result = await editIssueTool.handler(context(), { number: 999, title: "title" });

    // Then
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("404");
    expect((result.content[0] as { text: string }).text).toContain("Not Found");
  });
});
