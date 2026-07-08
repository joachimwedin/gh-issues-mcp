import { describe, expect, it, vi, beforeEach } from "vitest";

const execFileSync = vi.fn();

vi.mock("node:child_process", () => ({
  execFileSync: (...args: unknown[]) => execFileSync(...args),
}));

const { loadToken } = await import("../src/keychain.js");

describe("loadToken", () => {
  beforeEach(() => {
    execFileSync.mockReset();
  });

  it("returns the token stored under the given service name", () => {
    execFileSync.mockReturnValue("ghp_examplefaketoken1234\n");

    const token = loadToken("gh-issues-mcp");

    expect(token).toBe("ghp_examplefaketoken1234");
    expect(execFileSync).toHaveBeenCalledWith(
      "security",
      ["find-generic-password", "-s", "gh-issues-mcp", "-w"],
      expect.anything(),
    );
  });

  it("throws a clear error when the Keychain has no entry for the service", () => {
    execFileSync.mockImplementation(() => {
      throw new Error("security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.");
    });

    expect(() => loadToken("gh-issues-mcp")).toThrow(
      /no GitHub token found in Keychain for service "gh-issues-mcp"/i,
    );
  });

  it("throws a clear error when the stored value is empty", () => {
    execFileSync.mockReturnValue("\n");

    expect(() => loadToken("gh-issues-mcp")).toThrow(
      /no GitHub token found in Keychain for service "gh-issues-mcp"/i,
    );
  });
});
