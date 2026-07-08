import { homedir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "./config.js";
import { loadToken } from "./keychain.js";
import { createServer } from "./server.js";

const CONFIG_PATH = process.env.GH_ISSUES_MCP_CONFIG_PATH ?? join(homedir(), ".config", "gh-issues-mcp", "config.json");
const KEYCHAIN_SERVICE = process.env.GH_ISSUES_MCP_KEYCHAIN_SERVICE ?? "gh-issues-mcp";

function main() {
  const config = loadConfig(CONFIG_PATH);
  loadToken(KEYCHAIN_SERVICE);

  const server = createServer({ tokenLoaded: true });
  server.listen(config.port, "127.0.0.1", () => {
    console.log(
      `gh-issues-mcp scaffold listening on http://127.0.0.1:${config.port} (repo: ${config.owner}/${config.repo})`,
    );
  });
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
