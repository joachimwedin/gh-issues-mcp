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

  it("Given the Keychain holds a token for the service, When loadToken is called, Then it returns the stored token", () => {
    // Given
    execFileSync.mockReturnValue("ghp_examplefaketoken1234\n");

    // When
    const token = loadToken("gh-issues-mcp");

    // Then
    expect(token).toBe("ghp_examplefaketoken1234");
    expect(execFileSync).toHaveBeenCalledWith(
      "security",
      ["find-generic-password", "-s", "gh-issues-mcp", "-w"],
      expect.anything(),
    );
  });

  it("Given the Keychain has no entry for the service, When loadToken is called, Then it throws a clear error", () => {
    // Given
    execFileSync.mockImplementation(() => {
      throw new Error("security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.");
    });

    // When / Then
    expect(() => loadToken("gh-issues-mcp")).toThrow(
      /no GitHub token found in Keychain for service "gh-issues-mcp"/i,
    );
  });

  it("Given the stored value is empty, When loadToken is called, Then it throws a clear error", () => {
    // Given
    execFileSync.mockReturnValue("\n");

    // When / Then
    expect(() => loadToken("gh-issues-mcp")).toThrow(
      /no GitHub token found in Keychain for service "gh-issues-mcp"/i,
    );
  });
});
