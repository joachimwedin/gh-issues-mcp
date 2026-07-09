import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function writeConfig(contents: string) {
    dir = mkdtempSync(join(tmpdir(), "gh-issues-mcp-test-"));
    const path = join(dir, "config.json");
    writeFileSync(path, contents);
    return path;
  }

  it("Given a single-repo config without an explicit defaultRepo, When loadConfig is called, Then it infers the default repo and defaults its label vocabulary", () => {
    // Given
    const path = writeConfig(
      JSON.stringify({ repos: [{ repo: "joachimwedin/gh-issues-mcp" }], port: 4319 }),
    );

    // When
    const config = loadConfig(path);

    // Then
    expect(config).toEqual({
      repos: [{ repo: "joachimwedin/gh-issues-mcp" }],
      defaultRepo: "joachimwedin/gh-issues-mcp",
      port: 4319,
    });
  });

  it("Given a multi-repo config with an explicit defaultRepo, When loadConfig is called, Then it loads all configured repos and keeps the given default", () => {
    // Given
    const path = writeConfig(
      JSON.stringify({
        repos: [{ repo: "joachimwedin/gh-issues-mcp" }, { repo: "joachimwedin/other-repo" }],
        defaultRepo: "joachimwedin/other-repo",
        port: 4319,
      }),
    );

    // When
    const config = loadConfig(path);

    // Then
    expect(config.defaultRepo).toBe("joachimwedin/other-repo");
    expect(config.repos).toEqual([{ repo: "joachimwedin/gh-issues-mcp" }, { repo: "joachimwedin/other-repo" }]);
  });

  it("Given a multi-repo config with no defaultRepo, When loadConfig is called, Then it throws a clear error", () => {
    // Given
    const path = writeConfig(
      JSON.stringify({
        repos: [{ repo: "joachimwedin/gh-issues-mcp" }, { repo: "joachimwedin/other-repo" }],
        port: 4319,
      }),
    );

    // When / Then
    expect(() => loadConfig(path)).toThrow(/defaultRepo/i);
  });

  it("Given a defaultRepo that isn't among the configured repos, When loadConfig is called, Then it throws a clear error", () => {
    // Given
    const path = writeConfig(
      JSON.stringify({
        repos: [{ repo: "joachimwedin/gh-issues-mcp" }],
        defaultRepo: "joachimwedin/other-repo",
        port: 4319,
      }),
    );

    // When / Then
    expect(() => loadConfig(path)).toThrow(/defaultRepo/i);
  });

  it("Given a config file that does not exist, When loadConfig is called, Then it throws a clear error", () => {
    // Given
    const missingPath = join(tmpdir(), "does-not-exist-gh-issues-mcp", "config.json");

    // When / Then
    expect(() => loadConfig(missingPath)).toThrow(/config file not found/i);
  });

  it("Given a config file that is not valid JSON, When loadConfig is called, Then it throws a clear error", () => {
    // Given
    const path = writeConfig("{ not valid json");

    // When / Then
    expect(() => loadConfig(path)).toThrow(/invalid json/i);
  });

  it("Given the old flat owner/repo config shape, When loadConfig is called, Then it throws a clear error pointing at the new repos shape", () => {
    // Given
    const path = writeConfig(JSON.stringify({ owner: "joachimwedin", repo: "gh-issues-mcp", port: 4319 }));

    // When / Then
    expect(() => loadConfig(path)).toThrow(/repos/);
  });

  it("Given a config file missing repos entirely, When loadConfig is called, Then it throws a clear error", () => {
    // Given
    const path = writeConfig(JSON.stringify({ port: 4319 }));

    // When / Then
    expect(() => loadConfig(path)).toThrow(/repos/i);
  });

  it("Given a config file with an empty repos array, When loadConfig is called, Then it throws a clear error", () => {
    // Given
    const path = writeConfig(JSON.stringify({ repos: [], port: 4319 }));

    // When / Then
    expect(() => loadConfig(path)).toThrow(/repos/i);
  });

  it("Given a repos entry whose repo string isn't in owner/name format, When loadConfig is called, Then it throws a clear error", () => {
    // Given
    const path = writeConfig(JSON.stringify({ repos: [{ repo: "not-owner-slash-name" }], port: 4319 }));

    // When / Then
    expect(() => loadConfig(path)).toThrow(/owner\/name/i);
  });

  it("Given a config file where port is not a number, When loadConfig is called, Then it throws a clear error", () => {
    // Given
    const path = writeConfig(
      JSON.stringify({ repos: [{ repo: "joachimwedin/gh-issues-mcp" }], port: "not-a-number" }),
    );

    // When / Then
    expect(() => loadConfig(path)).toThrow(/port/i);
  });

  it("Given a repos entry with a custom label vocabulary, When loadConfig is called, Then it loads that vocabulary for that entry", () => {
    // Given
    const path = writeConfig(
      JSON.stringify({
        repos: [{ repo: "joachimwedin/gh-issues-mcp", labelVocabulary: ["bug", "enhancement"] }],
        port: 4319,
      }),
    );

    // When
    const config = loadConfig(path);

    // Then
    expect(config.repos[0]?.labelVocabulary).toEqual(["bug", "enhancement"]);
  });

  it("Given a repos entry where labelVocabulary is not an array of non-empty strings, When loadConfig is called, Then it throws a clear error", () => {
    // Given
    const path = writeConfig(
      JSON.stringify({
        repos: [{ repo: "joachimwedin/gh-issues-mcp", labelVocabulary: "bug" }],
        port: 4319,
      }),
    );

    // When / Then
    expect(() => loadConfig(path)).toThrow(/labelVocabulary/i);
  });
});
