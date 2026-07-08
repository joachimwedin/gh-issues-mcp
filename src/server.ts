import { createServer as createHttpServer, type Server } from "node:http";

export interface ServerStatus {
  /**
   * Whether a token was successfully loaded at startup. The raw token value
   * is deliberately never passed in here, so the health endpoint has no way
   * to leak it even by accident.
   */
  tokenLoaded: boolean;
}

export function createServer(status: ServerStatus): Server {
  return createHttpServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", tokenLoaded: status.tokenLoaded }));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });
}
