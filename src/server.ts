import { createServer as createHttpServer, type Server } from "node:http";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

export interface ServerStatus {
  /**
   * Whether a token was successfully loaded at startup. The raw token value
   * is deliberately never passed in here, so the health endpoint has no way
   * to leak it even by accident.
   */
  tokenLoaded: boolean;
}

/**
 * Creates the server's HTTP surface: GET /health always, plus POST/GET/DELETE
 * /mcp when a `createMcpServer` factory is supplied. It's kept separate from
 * `status` so the health endpoint's inputs stay limited to the boolean above,
 * regardless of what else the server exposes.
 *
 * A factory (rather than a single shared McpServer) because each /mcp request
 * gets its own fresh McpServer + transport pair, stateless-mode, matching the
 * SDK's own reference stateless server. Reusing one McpServer across requests
 * doesn't work: Protocol.connect() throws "Already connected to a transport"
 * if called again before the previous transport's response stream has fully
 * closed, and a client's own follow-up requests (e.g. right after `initialize`)
 * can arrive before that close fires. A session-mode singleton transport has
 * the same problem in an even simpler way: only the first client's `initialize`
 * ever succeeds; every later client is rejected with "Server already
 * initialized" (see #7).
 */
export function createServer(status: ServerStatus, createMcpServer?: () => McpServer): Server {
  return createHttpServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", tokenLoaded: status.tokenLoaded }));
      return;
    }

    if (req.url === "/mcp" && createMcpServer) {
      const mcpServer = createMcpServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => {
        transport.close();
        mcpServer.close();
      });
      mcpServer
        .connect(transport)
        .then(() => transport.handleRequest(req, res))
        .catch((err) => {
          console.error("Failed to handle MCP request:", err);
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "internal server error" }));
          }
        });
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });
}
