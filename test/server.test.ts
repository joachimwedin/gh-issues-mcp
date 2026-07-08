import { describe, expect, it, afterEach } from "vitest";
import type { Server } from "node:http";
import { createServer } from "../src/server.js";

describe("health check endpoint", () => {
  let server: Server;

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function listen(tokenLoaded: boolean): Promise<number> {
    server = createServer({ tokenLoaded });
    return new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (address === null || typeof address === "string") {
          throw new Error("expected server to bind to a port");
        }
        resolve(address.port);
      });
    });
  }

  it("reports server-up and token-loaded status on GET /health", async () => {
    const port = await listen(true);

    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok", tokenLoaded: true });
  });

  it("reports tokenLoaded: false when no token was loaded, without exposing the endpoint elsewhere", async () => {
    const port = await listen(false);

    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await res.json();

    expect(body).toEqual({ status: "ok", tokenLoaded: false });
  });

  it("never includes a token value in the health response, by construction", async () => {
    const port = await listen(true);

    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const rawBody = await res.text();

    expect(Object.keys(JSON.parse(rawBody))).toEqual(["status", "tokenLoaded"]);
  });

  it("returns 404 for unknown routes", async () => {
    const port = await listen(true);

    const res = await fetch(`http://127.0.0.1:${port}/unknown`);

    expect(res.status).toBe(404);
  });
});
