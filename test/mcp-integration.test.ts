import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createServer } from "../src/server.js";
import { createMcpServer } from "../src/mcp.js";

const realFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("MCP server end-to-end over Streamable HTTP", () => {
  let server: Server;
  let dir: string;

  afterEach(async () => {
    vi.unstubAllGlobals();
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  async function start(): Promise<{ url: URL; auditLogPath: string }> {
    dir = mkdtempSync(join(tmpdir(), "gh-issues-mcp-e2e-test-"));
    const auditLogPath = join(dir, "audit.log");

    server = createServer({ tokenLoaded: true }, () =>
      createMcpServer({
        github: { owner: "joachimwedin", repo: "gh-issues-mcp", token: "test-token" },
        auditLogPath,
      }),
    );

    const port = await new Promise<number>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (address === null || typeof address === "string") throw new Error("expected a port");
        resolve(address.port);
      });
    });

    return { url: new URL(`http://127.0.0.1:${port}/mcp`), auditLogPath };
  }

  it("lists tools and calls list_issues end-to-end over the real HTTP transport", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
        const href = url.toString();
        if (href.startsWith("https://api.github.com")) {
          return Promise.resolve(
            jsonResponse([{ number: 3, title: "an issue", state: "open", body: "body", labels: [{ name: "bug" }] }]),
          );
        }
        return realFetch(href, init);
      }),
    );

    const { url, auditLogPath } = await start();

    const client = new Client({ name: "test-client", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(url);
    await client.connect(transport);

    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name).sort()).toEqual(["list_issues", "view_issue"]);

    const result = await client.callTool({ name: "list_issues", arguments: {} });
    expect(result.isError).toBeFalsy();
    const content = (result.content as { type: string; text: string }[])[0];
    expect(JSON.parse(content.text)).toEqual([
      { number: 3, title: "an issue", state: "open", body: "body", labels: ["bug"] },
    ]);

    await client.close();

    const entry = JSON.parse(readFileSync(auditLogPath, "utf8").trim());
    expect(entry).toMatchObject({ tool: "list_issues", success: true, githubStatus: 200 });
  });

  it("surfaces the real GitHub error status/message through a tool call, without a generic error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
        const href = url.toString();
        if (href.startsWith("https://api.github.com")) {
          return Promise.resolve(jsonResponse({ message: "Not Found" }, 404));
        }
        return realFetch(href, init);
      }),
    );

    const { url } = await start();

    const client = new Client({ name: "test-client", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(url);
    await client.connect(transport);

    const result = await client.callTool({ name: "view_issue", arguments: { number: 999 } });

    expect(result.isError).toBe(true);
    const content = (result.content as { type: string; text: string }[])[0];
    expect(content.text).toContain("404");
    expect(content.text).toContain("Not Found");

    await client.close();
  });

  it("accepts a second client connecting after a first client has already connected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string | URL, init?: RequestInit) => {
        const href = url.toString();
        if (href.startsWith("https://api.github.com")) {
          return Promise.resolve(
            jsonResponse([{ number: 3, title: "an issue", state: "open", body: "body", labels: [{ name: "bug" }] }]),
          );
        }
        return realFetch(href, init);
      }),
    );

    const { url } = await start();

    const firstClient = new Client({ name: "first-client", version: "1.0.0" });
    await firstClient.connect(new StreamableHTTPClientTransport(url));
    const firstResult = await firstClient.callTool({ name: "list_issues", arguments: {} });
    expect(firstResult.isError).toBeFalsy();
    await firstClient.close();

    const secondClient = new Client({ name: "second-client", version: "1.0.0" });
    await secondClient.connect(new StreamableHTTPClientTransport(url));
    const secondResult = await secondClient.callTool({ name: "list_issues", arguments: {} });
    expect(secondResult.isError).toBeFalsy();
    await secondClient.close();
  });

  it("still serves GET /health correctly alongside the MCP endpoint", async () => {
    const { url } = await start();

    const res = await realFetch(`http://127.0.0.1:${url.port}/health`);
    const body = await res.json();

    expect(body).toEqual({ status: "ok", tokenLoaded: true });
  });
});
