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

  it("loads owner, repo, and port from a valid config file, defaulting the label vocabulary", () => {
    const path = writeConfig(
      JSON.stringify({ owner: "joachimwedin", repo: "gh-issues-mcp", port: 4319 }),
    );

    expect(loadConfig(path)).toEqual({
      owner: "joachimwedin",
      repo: "gh-issues-mcp",
      port: 4319,
      labelVocabulary: ["needs-triage", "needs-info", "ready-for-agent", "ready-for-human", "wontfix"],
    });
  });

  it("throws a clear error when the config file does not exist", () => {
    const missingPath = join(tmpdir(), "does-not-exist-gh-issues-mcp", "config.json");

    expect(() => loadConfig(missingPath)).toThrow(/config file not found/i);
  });

  it("throws a clear error when the config file is not valid JSON", () => {
    const path = writeConfig("{ not valid json");

    expect(() => loadConfig(path)).toThrow(/invalid json/i);
  });

  it("throws a clear error when a required field is missing", () => {
    const path = writeConfig(JSON.stringify({ owner: "joachimwedin", port: 4319 }));

    expect(() => loadConfig(path)).toThrow(/repo/i);
  });

  it("throws a clear error when port is not a number", () => {
    const path = writeConfig(
      JSON.stringify({ owner: "joachimwedin", repo: "gh-issues-mcp", port: "not-a-number" }),
    );

    expect(() => loadConfig(path)).toThrow(/port/i);
  });

  it("loads a custom label vocabulary when provided", () => {
    const path = writeConfig(
      JSON.stringify({
        owner: "joachimwedin",
        repo: "gh-issues-mcp",
        port: 4319,
        labelVocabulary: ["bug", "enhancement"],
      }),
    );

    expect(loadConfig(path).labelVocabulary).toEqual(["bug", "enhancement"]);
  });

  it("throws a clear error when labelVocabulary is not an array of non-empty strings", () => {
    const path = writeConfig(
      JSON.stringify({ owner: "joachimwedin", repo: "gh-issues-mcp", port: 4319, labelVocabulary: "bug" }),
    );

    expect(() => loadConfig(path)).toThrow(/labelVocabulary/i);
  });
});
