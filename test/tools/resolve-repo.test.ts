import { describe, expect, it } from "vitest";
import { resolveRepo } from "../../src/tools/resolve-repo.js";
import type { McpToolContext } from "../../src/tools/context.js";
import { DEFAULT_LABEL_VOCABULARY } from "../../src/config.js";

function baseContext(overrides: Partial<McpToolContext> = {}): McpToolContext {
  return {
    token: "test-token",
    repos: [{ repo: "joachimwedin/gh-issues-mcp" }],
    defaultRepo: "joachimwedin/gh-issues-mcp",
    auditLogPath: "/tmp/audit.log",
    ...overrides,
  };
}

describe("resolveRepo", () => {
  it("Given no requested repo, When resolveRepo is called, Then it resolves the configured default repo", () => {
    // Given
    const context = baseContext();

    // When
    const result = resolveRepo(context, undefined);

    // Then
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.context.repo).toBe("joachimwedin/gh-issues-mcp");
    expect(result.context.github).toEqual({ owner: "joachimwedin", repo: "gh-issues-mcp", token: "test-token" });
  });

  it("Given a requested repo that's in the allowlist, When resolveRepo is called, Then it resolves that repo instead of the default", () => {
    // Given
    const context = baseContext({
      repos: [{ repo: "joachimwedin/gh-issues-mcp" }, { repo: "joachimwedin/other-repo" }],
    });

    // When
    const result = resolveRepo(context, "joachimwedin/other-repo");

    // Then
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.context.repo).toBe("joachimwedin/other-repo");
    expect(result.context.github).toEqual({ owner: "joachimwedin", repo: "other-repo", token: "test-token" });
  });

  it("Given a requested repo that's outside the allowlist, When resolveRepo is called, Then it returns a non-throwing error result", () => {
    // Given
    const context = baseContext();

    // When
    const result = resolveRepo(context, "someone-else/unrelated-repo");

    // Then
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error");
    expect(result.error.isError).toBe(true);
    expect((result.error.content[0] as { text: string }).text).toContain("someone-else/unrelated-repo");
  });

  it("Given a repo entry with no labelVocabulary override, When resolveRepo is called, Then it resolves the hardcoded default vocabulary", () => {
    // Given
    const context = baseContext();

    // When
    const result = resolveRepo(context, undefined);

    // Then
    if (!result.ok) throw new Error("expected ok");
    expect(result.context.labelVocabulary).toEqual(DEFAULT_LABEL_VOCABULARY);
  });

  it("Given a repo entry with its own labelVocabulary, When resolveRepo is called, Then it resolves that repo's vocabulary instead of the default", () => {
    // Given
    const context = baseContext({
      repos: [{ repo: "joachimwedin/gh-issues-mcp", labelVocabulary: ["bug", "enhancement"] }],
    });

    // When
    const result = resolveRepo(context, undefined);

    // Then
    if (!result.ok) throw new Error("expected ok");
    expect(result.context.labelVocabulary).toEqual(["bug", "enhancement"]);
  });
});
