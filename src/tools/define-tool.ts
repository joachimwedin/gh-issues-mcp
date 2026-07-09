import type { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { runWithAuditLog } from "./run-with-audit-log.js";
import { resolveRepo } from "./resolve-repo.js";
import type { McpToolContext, ResolvedToolContext } from "./context.js";

export interface ToolDefinition<TInput> {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
  /** Runs before the audit-logged GitHub call. Returning a result short-circuits `call` and the audit log entirely. */
  validate?: (input: TInput, context: ResolvedToolContext) => CallToolResult | undefined;
  call: (context: ResolvedToolContext, input: TInput) => Promise<unknown>;
}

/** The subset of `DefinedTool` that doesn't depend on the tool's input type, so a mixed array of tools can be typed. */
export interface RegisterableTool {
  name: string;
  register: (server: McpServer, context: McpToolContext) => void;
}

export interface DefinedTool<TInput> extends RegisterableTool {
  handler: (context: McpToolContext, input: TInput) => Promise<CallToolResult>;
}

/**
 * Collapses the register*Tool -> *Handler -> runWithAuditLog layers every
 * tool used to hand-copy into one deep module: a tool file supplies only its
 * schema, optional pre-call validation, and its GitHub-calling logic. Also
 * resolves the caller's optional `repo` input against the allowlist before
 * `validate`/`call` run, so tool code never re-derives that resolution
 * itself (see resolve-repo.ts).
 */
export function defineTool<TInput>(def: ToolDefinition<TInput>): DefinedTool<TInput> {
  async function handler(context: McpToolContext, input: TInput): Promise<CallToolResult> {
    const requestedRepo = (input as { repo?: unknown }).repo;
    const resolution = resolveRepo(context, typeof requestedRepo === "string" ? requestedRepo : undefined);
    if (!resolution.ok) return resolution.error;

    const resolvedContext = resolution.context;
    const validationError = def.validate?.(input, resolvedContext);
    if (validationError) return validationError;

    return runWithAuditLog(resolvedContext, def.name, input, () => def.call(resolvedContext, input));
  }

  function register(server: McpServer, context: McpToolContext): void {
    server.registerTool(
      def.name,
      { description: def.description, inputSchema: def.inputSchema },
      async (input) => handler(context, input as TInput),
    );
  }

  return { name: def.name, handler, register };
}
