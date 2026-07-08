import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { editLabelsHandler } from "../../src/tools/edit-labels.js";

const github = { owner: "joachimwedin", repo: "gh-issues-mcp", token: "test-token" };
const labelVocabulary = ["needs-triage", "needs-info", "ready-for-agent", "ready-for-human", "wontfix"];

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

  it("adds and removes labels from the configured vocabulary and returns the resulting label set", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (init?.method === "POST") return Promise.resolve(jsonResponse([{ name: "ready-for-agent" }]));
        if (init?.method === "DELETE") return Promise.resolve(jsonResponse([]));
        throw new Error(`unexpected call: ${url}`);
      }),
    );
    const auditLog = auditLogPath();

    const result = await editLabelsHandler(
      { github, auditLogPath: auditLog, labelVocabulary },
      { number: 3, add: ["ready-for-agent"], remove: ["needs-triage"] },
    );

    expect(result.isError).toBeUndefined();
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload).toEqual([]);
  });

  it("appends a successful entry to the audit log with the number, add, and remove as args", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        if (init?.method === "POST") return Promise.resolve(jsonResponse([{ name: "ready-for-agent" }]));
        throw new Error("unexpected call");
      }),
    );
    const auditLog = auditLogPath();

    await editLabelsHandler(
      { github, auditLogPath: auditLog, labelVocabulary },
      { number: 3, add: ["ready-for-agent"] },
    );

    const entry = JSON.parse(readFileSync(auditLog, "utf8").trim());
    expect(entry).toMatchObject({
      tool: "edit_labels",
      args: { number: 3, add: ["ready-for-agent"] },
      success: true,
      githubStatus: 200,
    });
  });

  it("rejects a label outside the configured vocabulary without making any GitHub API call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const auditLog = auditLogPath();

    const result = await editLabelsHandler(
      { github, auditLogPath: auditLog, labelVocabulary },
      { number: 3, add: ["typo-label"] },
    );

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("typo-label");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the real GitHub status and message as an error result when the issue doesn't exist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ message: "Not Found" }, 404))),
    );
    const auditLog = auditLogPath();

    const result = await editLabelsHandler(
      { github, auditLogPath: auditLog, labelVocabulary },
      { number: 999, add: ["ready-for-agent"] },
    );

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("404");
    expect((result.content[0] as { text: string }).text).toContain("Not Found");
  });
});
