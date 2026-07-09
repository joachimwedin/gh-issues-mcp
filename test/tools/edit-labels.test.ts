import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { editLabelsTool } from "../../src/tools/edit-labels.js";

const token = "test-token";
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

describe("editLabelsHandler", () => {
  let dir: string;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function auditLogPath(): string {
    dir = mkdtempSync(join(tmpdir(), "gh-issues-mcp-edit-labels-test-"));
    return join(dir, "audit.log");
  }

  it("Given labels from the configured vocabulary, When edit_labels is called with add and remove, Then it adds and removes them and returns the resulting label set", async () => {
    // Given
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (init?.method === "POST") return Promise.resolve(jsonResponse([{ name: "ready-for-agent" }]));
        if (init?.method === "DELETE") return Promise.resolve(jsonResponse([]));
        throw new Error(`unexpected call: ${url}`);
      }),
    );
    const auditLog = auditLogPath();

    // When
    const result = await editLabelsTool.handler(
      { token, repos, defaultRepo, auditLogPath: auditLog },
      { number: 3, add: ["ready-for-agent"], remove: ["needs-triage"] },
    );

    // Then
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload).toEqual({ repo: "joachimwedin/gh-issues-mcp", labels: [] });
  });

  it("Given GitHub accepts the label change, When edit_labels is called with add, Then it appends a successful entry to the audit log with the number, add, and remove as args", async () => {
    // Given
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        if (init?.method === "POST") return Promise.resolve(jsonResponse([{ name: "ready-for-agent" }]));
        throw new Error("unexpected call");
      }),
    );
    const auditLog = auditLogPath();

    // When
    await editLabelsTool.handler(
      { token, repos, defaultRepo, auditLogPath: auditLog },
      { number: 3, add: ["ready-for-agent"] },
    );

    // Then
    const entry = JSON.parse(readFileSync(auditLog, "utf8").trim());
    expect(entry).toMatchObject({
      tool: "edit_labels",
      args: { number: 3, add: ["ready-for-agent"] },
      success: true,
      githubStatus: 200,
      repo: "joachimwedin/gh-issues-mcp",
    });
  });

  it("Given a second allowlisted repo, When edit_labels is called with that repo explicitly, Then it calls GitHub for that repo, validates against its vocabulary, and wraps the result with it", async () => {
    // Given
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST") return Promise.resolve(jsonResponse([{ name: "bug" }]));
      throw new Error(`unexpected call: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const auditLog = auditLogPath();

    // When
    const result = await editLabelsTool.handler(
      { token, repos, defaultRepo, auditLogPath: auditLog },
      { repo: "joachimwedin/other-repo", number: 5, add: ["bug"] },
    );

    // Then
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload).toEqual({ repo: "joachimwedin/other-repo", labels: ["bug"] });
    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    expect(calledUrl).toContain("/repos/joachimwedin/other-repo/issues/5/labels");
  });

  it("Given a repo outside the configured allowlist, When edit_labels is called with that repo, Then it returns an error result without calling GitHub", async () => {
    // Given
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const auditLog = auditLogPath();

    // When
    const result = await editLabelsTool.handler(
      { token, repos, defaultRepo, auditLogPath: auditLog },
      { repo: "someone-else/unrelated-repo", number: 3, add: ["ready-for-agent"] },
    );

    // Then
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("someone-else/unrelated-repo");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Given a label valid in the default repo's vocabulary but not the target repo's, When edit_labels is called with that repo, Then it returns an error and does not call the GitHub API", async () => {
    // Given
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const auditLog = auditLogPath();

    // When
    const result = await editLabelsTool.handler(
      { token, repos, defaultRepo, auditLogPath: auditLog },
      { repo: "joachimwedin/other-repo", number: 5, add: ["ready-for-agent"] },
    );

    // Then
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("ready-for-agent");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Given a label outside the configured vocabulary, When edit_labels is called, Then it rejects the call without making any GitHub API call", async () => {
    // Given
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const auditLog = auditLogPath();

    // When
    const result = await editLabelsTool.handler(
      { token, repos, defaultRepo, auditLogPath: auditLog },
      { number: 3, add: ["typo-label"] },
    );

    // Then
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("typo-label");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Given the issue doesn't exist, When edit_labels is called, Then it returns the real GitHub status and message as an error result", async () => {
    // Given
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ message: "Not Found" }, 404))),
    );
    const auditLog = auditLogPath();

    // When
    const result = await editLabelsTool.handler(
      { token, repos, defaultRepo, auditLogPath: auditLog },
      { number: 999, add: ["ready-for-agent"] },
    );

    // Then
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("404");
    expect((result.content[0] as { text: string }).text).toContain("Not Found");
  });
});
