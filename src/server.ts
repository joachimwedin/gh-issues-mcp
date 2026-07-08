import { createServer as createHttpServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
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
 * /mcp when an McpServer is supplied. `mcpServer` is kept separate from
 * `status` so the health endpoint's inputs stay limited to the boolean above,
 * regardless of what else the server exposes.
 */
export function createServer(status: ServerStatus, mcpServer?: McpServer): Server {
  // Session (stateful) mode: a single transport instance is reused across every
  // request in a session. Stateless mode requires a fresh transport per request,
  // which doesn't fit a long-running server meant to stay connected to one client.
  let transport: StreamableHTTPServerTransport | undefined;
  let ready: Promise<void> | undefined;
  if (mcpServer) {
    transport = new StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID });
    ready = mcpServer.connect(transport);
  }

  return createHttpServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", tokenLoaded: status.tokenLoaded }));
      return;
    }

    if (req.url === "/mcp" && transport && ready) {
      ready
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
