import { homedir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "./config.js";
import { loadToken } from "./keychain.js";
import { createServer } from "./server.js";
import { createMcpServer } from "./mcp.js";

const CONFIG_PATH = process.env.GH_ISSUES_MCP_CONFIG_PATH ?? join(homedir(), ".config", "gh-issues-mcp", "config.json");
const KEYCHAIN_SERVICE = process.env.GH_ISSUES_MCP_KEYCHAIN_SERVICE ?? "gh-issues-mcp";
const AUDIT_LOG_PATH =
  process.env.GH_ISSUES_MCP_AUDIT_LOG_PATH ?? join(homedir(), ".local", "state", "gh-issues-mcp", "audit.log");

function main() {
  const config = loadConfig(CONFIG_PATH);
  const token = loadToken(KEYCHAIN_SERVICE);

  const server = createServer({ tokenLoaded: true }, () =>
    createMcpServer({
      token,
      repos: config.repos,
      defaultRepo: config.defaultRepo,
      auditLogPath: AUDIT_LOG_PATH,
    }),
  );
  server.listen(config.port, "127.0.0.1", () => {
    console.log(
      `gh-issues-mcp listening on http://127.0.0.1:${config.port} (repos: ${config.repos.map((r) => r.repo).join(", ")}, default: ${config.defaultRepo})`,
    );
  });
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
