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

  it("Given a valid config file without a label vocabulary, When loadConfig is called, Then it loads owner, repo, and port, defaulting the label vocabulary", () => {
    // Given
    const path = writeConfig(
      JSON.stringify({ owner: "joachimwedin", repo: "gh-issues-mcp", port: 4319 }),
    );

    // When
    const config = loadConfig(path);

    // Then
    expect(config).toEqual({
      owner: "joachimwedin",
      repo: "gh-issues-mcp",
      port: 4319,
      labelVocabulary: ["needs-triage", "needs-info", "ready-for-agent", "ready-for-human", "wontfix"],
    });
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

  it("Given a config file missing a required field, When loadConfig is called, Then it throws a clear error", () => {
    // Given
    const path = writeConfig(JSON.stringify({ owner: "joachimwedin", port: 4319 }));

    // When / Then
    expect(() => loadConfig(path)).toThrow(/repo/i);
  });

  it("Given a config file where port is not a number, When loadConfig is called, Then it throws a clear error", () => {
    // Given
    const path = writeConfig(
      JSON.stringify({ owner: "joachimwedin", repo: "gh-issues-mcp", port: "not-a-number" }),
    );

    // When / Then
    expect(() => loadConfig(path)).toThrow(/port/i);
  });

  it("Given a config file with a custom label vocabulary, When loadConfig is called, Then it loads that vocabulary", () => {
    // Given
    const path = writeConfig(
      JSON.stringify({
        owner: "joachimwedin",
        repo: "gh-issues-mcp",
        port: 4319,
        labelVocabulary: ["bug", "enhancement"],
      }),
    );

    // When
    const config = loadConfig(path);

    // Then
    expect(config.labelVocabulary).toEqual(["bug", "enhancement"]);
  });

  it("Given a config file where labelVocabulary is not an array of non-empty strings, When loadConfig is called, Then it throws a clear error", () => {
    // Given
    const path = writeConfig(
      JSON.stringify({ owner: "joachimwedin", repo: "gh-issues-mcp", port: 4319, labelVocabulary: "bug" }),
    );

    // When / Then
    expect(() => loadConfig(path)).toThrow(/labelVocabulary/i);
  });
});
