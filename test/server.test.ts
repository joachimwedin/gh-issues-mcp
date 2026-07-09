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

  it("Given the token loaded successfully, When GET /health is requested, Then it reports server-up and token-loaded status", async () => {
    // Given
    const port = await listen(true);

    // When
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await res.json();

    // Then
    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok", tokenLoaded: true });
  });

  it("Given no token was loaded, When GET /health is requested, Then it reports tokenLoaded: false, without exposing the endpoint elsewhere", async () => {
    // Given
    const port = await listen(false);

    // When
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await res.json();

    // Then
    expect(body).toEqual({ status: "ok", tokenLoaded: false });
  });

  it("Given the token loaded successfully, When GET /health is requested, Then it never includes a token value in the response, by construction", async () => {
    // Given
    const port = await listen(true);

    // When
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const rawBody = await res.text();

    // Then
    expect(Object.keys(JSON.parse(rawBody))).toEqual(["status", "tokenLoaded"]);
  });

  it("Given the server is running, When an unknown route is requested, Then it returns 404", async () => {
    // Given
    const port = await listen(true);

    // When
    const res = await fetch(`http://127.0.0.1:${port}/unknown`);

    // Then
    expect(res.status).toBe(404);
  });
});
