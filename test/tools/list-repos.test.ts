import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listReposTool } from "../../src/tools/list-repos.js";
import type { McpToolContext } from "../../src/tools/context.js";
import { DEFAULT_LABEL_VOCABULARY } from "../../src/config.js";

describe("listReposHandler", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function context(repos: McpToolContext["repos"], defaultRepo: string): McpToolContext {
    dir = mkdtempSync(join(tmpdir(), "gh-issues-mcp-list-repos-test-"));
    return { token: "test-token", repos, defaultRepo, auditLogPath: join(dir, "audit.log") };
  }

  it("Given a multi-repo allowlist with a per-repo label vocabulary override, When list_repos is called, Then it returns each repo with its effective label vocabulary", async () => {
    // Given
    const ctx = context(
      [
        { repo: "joachimwedin/gh-issues-mcp" },
        { repo: "joachimwedin/other-repo", labelVocabulary: ["bug", "enhancement"] },
      ],
      "joachimwedin/gh-issues-mcp",
    );

    // When
    const result = await listReposTool.handler(ctx, {});

    // Then
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse((result.content[0] as { text: string }).text);
    expect(payload).toEqual([
      { repo: "joachimwedin/gh-issues-mcp", labelVocabulary: DEFAULT_LABEL_VOCABULARY },
      { repo: "joachimwedin/other-repo", labelVocabulary: ["bug", "enhancement"] },
    ]);
  });

  it("Given a repo with no labelVocabulary override, When list_repos is called, Then it appends a successful audit log entry", async () => {
    // Given
    const ctx = context([{ repo: "joachimwedin/gh-issues-mcp" }], "joachimwedin/gh-issues-mcp");

    // When
    await listReposTool.handler(ctx, {});

    // Then
    const entry = JSON.parse(readFileSync(ctx.auditLogPath, "utf8").trim());
    expect(entry).toMatchObject({ tool: "list_repos", success: true, githubStatus: 200 });
  });
});
