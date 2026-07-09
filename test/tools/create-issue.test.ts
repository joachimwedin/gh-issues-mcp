import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createIssueTool } from "../../src/tools/create-issue.js";
import type { McpToolContext } from "../../src/tools/context.js";

const repos = [
  {
    repo: "joachimwedin/gh-issues-mcp",
    labelVocabulary: ["needs-triage", "needs-info", "ready-for-agent", "ready-for-human", "wontfix"],
  },
  { repo: "joachimwedin/other-repo", labelVocabulary: ["bug"] },
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

  function context(): McpToolContext {
    dir = mkdtempSync(join(tmpdir(), "gh-issues-mcp-create-issue-test-"));
    return { token: "test-token", repos, defaultRepo, auditLogPath: join(dir, "audit.log") };
  }

  it("Given GitHub accepts the new issue, When create_issue is called with no repo, Then it returns the created issue tagged with the default repo", async () => {
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

    // When
    const result = await createIssueTool.handler(context(), { title: "a new issue", body: "issue body" });

    // Then
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload).toEqual({
      number: 11,
      title: "a new issue",
      state: "open",
      body: "issue body",
      labels: [],
      repo: "joachimwedin/gh-issues-mcp",
    });
  });

  it("Given a second allowlisted repo, When create_issue is called with that repo explicitly, Then it calls GitHub for that repo, validates against its vocabulary, and tags the result with it", async () => {
    // Given
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ id: 99, number: 5, title: "other issue", state: "open", body: "body", labels: [{ name: "bug" }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    // When
    const result = await createIssueTool.handler(context(), {
      repo: "joachimwedin/other-repo",
      title: "other issue",
      body: "body",
      labels: ["bug"],
    });

    // Then
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload).toMatchObject({ number: 5, repo: "joachimwedin/other-repo" });
    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    expect(calledUrl).toContain("/repos/joachimwedin/other-repo/issues");
  });

  it("Given a repo outside the configured allowlist, When create_issue is called with that repo, Then it returns an error result without calling GitHub", async () => {
    // Given
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    // When
    const result = await createIssueTool.handler(context(), {
      repo: "someone-else/unrelated-repo",
      title: "a new issue",
      body: "issue body",
    });

    // Then
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("someone-else/unrelated-repo");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Given GitHub accepts the new issue, When create_issue is called with labels, Then it appends a successful entry with the resolved repo to the audit log with the title, body, and labels as args", async () => {
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
    const ctx = context();

    // When
    await createIssueTool.handler(ctx, { title: "a new issue", body: "issue body", labels: ["ready-for-agent"] });

    // Then
    const entry = JSON.parse(readFileSync(ctx.auditLogPath, "utf8").trim());
    expect(entry).toMatchObject({
      tool: "create_issue",
      args: { title: "a new issue", body: "issue body", labels: ["ready-for-agent"] },
      success: true,
      githubStatus: 200,
      repo: "joachimwedin/gh-issues-mcp",
    });
  });

  it("Given a label outside the configured vocabulary, When create_issue is called, Then it returns an error and does not call the GitHub API", async () => {
    // Given
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    // When
    const result = await createIssueTool.handler(context(), {
      title: "a new issue",
      body: "issue body",
      labels: ["typo-label"],
    });

    // Then
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("typo-label");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Given a label valid in the default repo's vocabulary but not the target repo's, When create_issue is called with that repo, Then it returns an error and does not call the GitHub API", async () => {
    // Given
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    // When
    const result = await createIssueTool.handler(context(), {
      repo: "joachimwedin/other-repo",
      title: "other issue",
      body: "body",
      labels: ["ready-for-agent"],
    });

    // Then
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("ready-for-agent");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Given GitHub rejects the new issue, When create_issue is called, Then it returns the real GitHub status and message as an error result", async () => {
    // Given
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: "Validation Failed" }, 422)));

    // When
    const result = await createIssueTool.handler(context(), { title: "a new issue", body: "issue body" });

    // Then
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("422");
    expect((result.content[0] as { text: string }).text).toContain("Validation Failed");
  });
});
