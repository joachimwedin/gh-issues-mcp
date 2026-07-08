import { execFileSync } from "node:child_process";

/**
 * Reads a GitHub token from the macOS Keychain generic-password entry
 * registered under `service`. Never logs or returns the raw CLI output on
 * failure, so the token itself can't leak into error messages.
 */
export function loadToken(service: string): string {
  let raw: string;
  try {
    raw = execFileSync("security", ["find-generic-password", "-s", service, "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    throw new Error(
      `No GitHub token found in Keychain for service "${service}". ` +
        `Add one with: security add-generic-password -a "$USER" -s "${service}" -w "<token>"`,
    );
  }

  const token = raw.trim();
  if (!token) {
    throw new Error(`No GitHub token found in Keychain for service "${service}" (empty value).`);
  }

  return token;
}
